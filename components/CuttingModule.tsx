import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Disc3, Scissors, Settings2, RotateCw, Layers, LayoutPanelLeft, X, ZoomIn, ZoomOut, Maximize, AlertTriangle, Infinity as InfinityIcon, TreePine } from 'lucide-react';
import { optimizeCutlistGroupedAsync, GroupInput, SheetGroup, EdgeBanding, OptResult, OptProgress, PartInput, StockInput, PlacedBin } from '../domain/nesting/packer';
import { computeCutPlan, CutStep } from '../domain/nesting/cutPlan';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { loadJSON, saveJSON, removeKey } from '../lib/storage';
import { newId } from '../lib/id';
import { onPartsTransfer } from '../lib/events';
import { useSettings } from '../state/settings';

const PARTS_KEY = 'um_cutting_parts';
const STOCKS_KEY = 'um_cutting_stocks';                 // Malzeme grubu (eski anahtar — migrasyon gerekmez)
const STOCKS_ARKALIK_KEY = 'um_cutting_stocks_arkalik';
const STOCKS_KAPAK_KEY = 'um_cutting_stocks_kapak';
const KAPAK_MERGE_KEY = 'um_cutting_kapak_merged';
const KERF_KEY = 'um_cutting_kerf';
const RESULT_KEY = 'um_cutting_result';
const OPTIONS_KEY = 'um_cutting_options';
const LEGACY_PENDING_KEY = 'um_pending_cutlist_parts';

const KERF_MAX_CM = 1.5;
const AUTO_SHEET_CAP = 200;

interface StoredResult {
  result: OptResult;
  inputHash: string;
}

interface CutOptions {
  /** Malzeme grubu — eski global anahtarın devamı (geriye dönük uyumlu) */
  autoSheets: boolean;
  autoSheetsArkalik: boolean;
  autoSheetsKapak: boolean;
  grainLock: boolean;
}

const DEFAULT_OPTIONS: CutOptions = {
  autoSheets: false,
  autoSheetsArkalik: false,
  autoSheetsKapak: false,
  grainLock: false
};

const GROUP_ORDER: SheetGroup[] = ['malzeme', 'arkalik', 'kapak'];
const GROUP_TITLE: Record<SheetGroup, string> = { malzeme: 'MALZEME', arkalik: 'ARKALIK', kapak: 'KAPAK' };
const GROUP_PART_LABEL: Record<SheetGroup, string> = { malzeme: 'Malzeme', arkalik: 'Arkalık', kapak: 'Kapak' };
const GROUP_SHEET_LABEL: Record<SheetGroup, string> = {
  malzeme: 'Malzeme Levhası',
  arkalik: 'Arkalık Levhası',
  kapak: 'Kapak Levhası'
};

const groupOfPart = (p: PartInput): SheetGroup => p.sheetGroup ?? 'malzeme';

/**
 * Otomatik plaka (#7): ilk geçerli plaka tipi sınırsız kabul edilir — grup başına bağımsız.
 * inputHash ve startOptimization AYNI fonksiyonu kullanır; ayrışırlarsa otomatik modda
 * levha ölçüsü değişikliği imzaya yansımaz ve bayat sonuç güncel gibi görünür.
 */
const applyAutoSheets = (list: StockInput[], auto: boolean): StockInput[] => {
  if (!auto) return list;
  const first = list.find(s => s.w > 0 && s.h > 0);
  return first ? [{ ...first, count: AUTO_SHEET_CAP }] : list;
};

const EMPTY_BANDING: EdgeBanding = { top: false, right: false, bottom: false, left: false };
const bandingOf = (p: PartInput): EdgeBanding => p.edgeBanding ?? EMPTY_BANDING;
const bandedCount = (b: EdgeBanding) => [b.top, b.right, b.bottom, b.left].filter(Boolean).length;

const isParts = (v: unknown): v is PartInput[] =>
  Array.isArray(v) && v.every(p => p && typeof p === 'object' && 'w' in p && 'h' in p && 'count' in p);

const isStocks = (v: unknown): v is StockInput[] =>
  Array.isArray(v) && v.every(s => s && typeof s === 'object' && 'w' in s && 'h' in s && 'count' in s);

const isKerf = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Eski kayıtlarda yalnız autoSheets/grainLock var — eksik alanlar DEFAULT_OPTIONS ile tamamlanır
const isOptions = (v: unknown): v is Partial<CutOptions> =>
  !!v && typeof v === 'object' && typeof (v as any).autoSheets === 'boolean';

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

const isStoredResult = (v: unknown): v is StoredResult =>
  !!v && typeof v === 'object' &&
  typeof (v as any).inputHash === 'string' &&
  (v as any).result && Array.isArray((v as any).result.bins);

const emptyPartRow = (): PartInput => ({ id: newId(), name: '', h: 0, w: 0, count: 0, rotatable: true, sheetGroup: 'malzeme', edgeBanding: { top: false, right: false, bottom: false, left: false } });
const emptyStockRow = (): StockInput => ({ id: newId(), h: 0, w: 0, count: 0 });

function padParts(list: PartInput[]): PartInput[] {
  const out = [...list];
  while (out.length < 5) out.push(emptyPartRow());
  const last = out[out.length - 1];
  if (last.h || last.w || last.count) out.push(emptyPartRow());
  return out;
}

function padStocks(list: StockInput[]): StockInput[] {
  const out = [...list];
  while (out.length < 4) out.push(emptyStockRow());
  const last = out[out.length - 1];
  if (last.h || last.w || last.count) out.push(emptyStockRow());
  return out;
}

/** 3 stok listesi için tek updater üreticisi — kopyala-yapıştır yerine (B3) */
const makeStockUpdater =
  (setList: React.Dispatch<React.SetStateAction<StockInput[]>>) =>
  (index: number, field: keyof StockInput, value: number) => {
    setList(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value } as StockInput;
      if (index === next.length - 1 && value) next.push(emptyStockRow());
      return next;
    });
  };

/** Mevcut pill estetiğine uygun, sıfırdan Tailwind switch (B5) */
const ToggleSwitch: React.FC<{
  checked: boolean;
  onToggle: () => void;
  label: string;
  title?: string;
  icon?: React.ReactNode;
}> = ({ checked, onToggle, label, title, icon }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onToggle}
    title={title}
    className="flex items-center gap-2 shrink-0 group"
  >
    {icon}
    <span className={`text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-colors ${checked ? 'text-brand-900' : 'text-gray-500 group-hover:text-gray-700'}`}>
      {label}
    </span>
    <span className={`relative block w-9 h-5 rounded-full transition-colors ${checked ? 'bg-brand-900' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </span>
  </button>
);

/** Tek levha grubunun stok tablosu — Malzeme / Arkalık / Kapak aynı markup'ı paylaşır (B5) */
const StockTable: React.FC<{
  title: string;
  stocks: StockInput[];
  auto: boolean;
  onToggleAuto: () => void;
  onChange: (index: number, field: keyof StockInput, value: number) => void;
  headerExtra?: React.ReactNode;
  note?: string;
}> = ({ title, stocks, auto, onToggleAuto, onChange, headerExtra, note }) => {
  const autoIdx = stocks.findIndex(st => st.w > 0 && st.h > 0);
  return (
    <div className="bg-white rounded border border-gray-300 shadow-sm overflow-hidden mb-4">
      <div className="bg-gray-200 px-4 py-3 border-b border-gray-300 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-gray-700 font-bold">
        <div className="flex items-center gap-2 min-w-0">
          <Layers size={18} className="shrink-0" />
          <span className="truncate">{title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {headerExtra}
          <ToggleSwitch
            checked={auto}
            onToggle={onToggleAuto}
            label="Otomatik adet"
            title="Plaka adedini elle girmek yerine gereken sayı otomatik hesaplanır"
            icon={<InfinityIcon size={14} className={auto ? 'text-brand-900' : 'text-gray-400'} />}
          />
        </div>
      </div>
      {note && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-[11px] font-bold text-amber-700">
          {note}
        </div>
      )}
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-gray-100 text-gray-800 text-sm border-b border-gray-300">
            <th className="font-bold py-2 px-3 border-r border-gray-300 w-1/3">Genişlik (cm)</th>
            <th className="font-bold py-2 px-3 border-r border-gray-300 w-1/3">Uzunluk (cm)</th>
            <th className="font-bold py-2 px-3 w-1/3">Adet</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((st, idx) => (
            <tr key={st.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="border-r border-gray-300 p-0 hover:bg-blue-50 transition-colors">
                <input
                  type="number" min={0}
                  value={st.w || ''}
                  onChange={(e) => onChange(idx, 'w', Number(e.target.value))}
                  className="w-full bg-transparent px-3 py-2 outline-none text-gray-800 font-medium"
                />
              </td>
              <td className="border-r border-gray-300 p-0 hover:bg-blue-50 transition-colors">
                <input
                  type="number" min={0}
                  value={st.h || ''}
                  onChange={(e) => onChange(idx, 'h', Number(e.target.value))}
                  className="w-full bg-transparent px-3 py-2 outline-none text-gray-800 font-medium"
                />
              </td>
              <td className="p-0 hover:bg-blue-50 transition-colors">
                <input
                  type="number" min={0}
                  value={st.count || ''}
                  disabled={auto && idx === autoIdx}
                  onChange={(e) => onChange(idx, 'count', Number(e.target.value))}
                  className="w-full bg-transparent px-3 py-2 outline-none text-gray-800 font-medium disabled:text-gray-300"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * 4 kenar bant seçici (D3). Kenarlar parçanın kendi Genişlik×Uzunluk yönüne göre
 * sabittir — optimizasyonda döndürülse bile bu tanım değişmez.
 */
const BandingPicker: React.FC<{
  banding: EdgeBanding;
  onToggle: (edge: keyof EdgeBanding) => void;
}> = ({ banding, onToggle }) => {
  const strip = (on: boolean) =>
    `absolute transition-colors ${on ? 'bg-blue-600' : 'bg-gray-300 hover:bg-blue-300'}`;
  return (
    <div className="relative w-8 h-8 shrink-0 bg-gray-100 border border-gray-300 rounded-sm">
      <button
        type="button" aria-label="Üst kenar bandı" aria-pressed={banding.top} title="Üst kenar (Genişlik)"
        onClick={() => onToggle('top')}
        className={`${strip(banding.top)} left-1 right-1 top-0 h-1.5 rounded-b-sm`}
      />
      <button
        type="button" aria-label="Alt kenar bandı" aria-pressed={banding.bottom} title="Alt kenar (Genişlik)"
        onClick={() => onToggle('bottom')}
        className={`${strip(banding.bottom)} left-1 right-1 bottom-0 h-1.5 rounded-t-sm`}
      />
      <button
        type="button" aria-label="Sol kenar bandı" aria-pressed={banding.left} title="Sol kenar (Uzunluk)"
        onClick={() => onToggle('left')}
        className={`${strip(banding.left)} top-1 bottom-1 left-0 w-1.5 rounded-r-sm`}
      />
      <button
        type="button" aria-label="Sağ kenar bandı" aria-pressed={banding.right} title="Sağ kenar (Uzunluk)"
        onClick={() => onToggle('right')}
        className={`${strip(banding.right)} top-1 bottom-1 right-0 w-1.5 rounded-l-sm`}
      />
    </div>
  );
};

// Parça bazlı deterministik renk (#30)
const PART_PALETTE = ['#AAB396', '#C9AE8C', '#9DB4C0', '#C79A9A', '#B0A6C9', '#A6C9B8', '#C9C08C', '#98B6A0'];
function colorForPart(partId: string): string {
  let h = 0;
  for (let i = 0; i < partId.length; i++) h = (h * 31 + partId.charCodeAt(i)) >>> 0;
  return PART_PALETTE[h % PART_PALETTE.length];
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** Aynı ölçüdeki parçaları eşleştiren, döndürmeden bağımsız anahtar (D2) */
const sizeKeyOf = (w: number, h: number) => `${fmt(Math.min(w, h))}x${fmt(Math.max(w, h))}`;

/** Tek plakanın SVG çizimi — kart, zoom modalı ve kesim çizgileri ortak. */
const BinSvg: React.FC<{
  bin: PlacedBin;
  cuts?: CutStep[];
  /** Doluysa yalnız bu ölçüdeki parçalar vurgulanır, diğerleri soluklaşır (D2) */
  selectedSizeKey?: string | null;
  /** Verilirse parçalar tıklanabilir olur — yalnız zoom modalına geçilir (D2) */
  onSelectSizeKey?: (key: string | null) => void;
}> = ({ bin, cuts, selectedSizeKey = null, onSelectSizeKey }) => {
  const interactive = !!onSelectSizeKey;

  // Zoom modalında sürükleyerek kaydırma (pan) da bir click üretir; 6px'ten uzun
  // hareketi tıklama saymayarak seçimin istemsiz açılıp kapanmasını engelliyoruz.
  const downPos = React.useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = interactive
    ? (e: React.PointerEvent<SVGElement>) => { downPos.current = { x: e.clientX, y: e.clientY }; }
    : undefined;
  const isTap = (e: React.MouseEvent) => {
    const d = downPos.current;
    return !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6;
  };
  const select = (key: string | null) => (e: React.MouseEvent) => {
    if (isTap(e)) onSelectSizeKey!(key);
  };
  const clearSelection = interactive ? select(null) : undefined;

  // D1: plaka ölçüsü etiketi — şemanın ÜSTÜNDEKİ şeritte durur, hiçbir parçayı örtmez
  const labelFs = Math.max(3, Math.min(Math.min(bin.w, bin.h) / 16, 8));
  const labelText = `${fmt(bin.w)}×${fmt(bin.h)} cm`;
  const labelPad = Math.max(0.6, Math.min(bin.w, bin.h) / 120);
  const labelBand = labelFs * 1.7 + labelPad * 2;

  return (
  <svg
    viewBox={`0 ${-labelBand} ${bin.w} ${bin.h + labelBand}`}
    className="w-full h-full"
    preserveAspectRatio="xMidYMid meet"
    xmlns="http://www.w3.org/2000/svg"
    onPointerDown={onPointerDown}
  >
    <defs>
      <pattern id="fireHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="#FFF8E8" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="#674636" strokeOpacity="0.18" strokeWidth="1.5" />
      </pattern>
    </defs>
    {/* D1: plaka ölçüsü — şemanın üstündeki şeritte, hiçbir parçayı örtmeden */}
    <text
      x={0}
      y={-labelBand / 2}
      textAnchor="start"
      dominantBaseline="middle"
      fill="#674636"
      fontSize={labelFs}
      fontWeight="bold"
      pointerEvents="none"
    >
      {labelText}
    </text>

    <rect width={bin.w} height={bin.h} fill="#FFF8E8" onClick={clearSelection} />

    {/* Fire / kullanılabilir artık alanlar — 45° taralı (GP-04, #8) */}
    {(bin.freeRects || []).map((fr, fIdx) => (
      <g key={`f${fIdx}`}>
        <rect
          x={fr.x} y={fr.y} width={fr.w} height={fr.h}
          fill="url(#fireHatch)"
          stroke="#674636" strokeOpacity="0.25" strokeWidth={0.3} strokeDasharray="2 2"
          onClick={clearSelection}
        />
        {Math.min(fr.w, fr.h) >= 15 && (
          <text
            x={fr.x + fr.w / 2}
            y={fr.y + fr.h / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#674636"
            fillOpacity="0.45"
            fontSize={Math.min(Math.min(fr.w, fr.h) / 5, 8)}
            fontWeight="bold"
            pointerEvents="none"
          >
            {fmt(fr.w)}×{fmt(fr.h)}
          </text>
        )}
      </g>
    ))}

    {bin.placed.map((p, pIdx) => {
      const isSmall = p.w < 20 || p.h < 20;
      const key = sizeKeyOf(p.w, p.h);
      const isMatch = selectedSizeKey !== null && key === selectedSizeKey;
      const isDimmed = selectedSizeKey !== null && !isMatch;

      // D4: uzun kenar dikeyse ölçü yazısı da uzun kenar boyunca okunur
      // (-90° = aşağıdan yukarıya; p.w/p.h zaten yerleşim sonrası nihai ölçüler)
      const vertical = p.h > p.w;
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const off = isSmall ? 0 : 3;
      const tx = vertical ? cx - off : cx;
      const ty = vertical ? cy : cy - off;

      return (
        <g
          key={pIdx}
          opacity={isDimmed ? 0.25 : 1}
          onClick={interactive ? select(isMatch ? null : key) : undefined}
          className={interactive ? 'cursor-pointer' : undefined}
        >
          <rect
            x={p.x} y={p.y} width={p.w} height={p.h}
            fill={colorForPart(p.partId)}
            stroke={isMatch ? '#2563EB' : '#674636'}
            strokeWidth={isMatch ? 1.4 : 0.5}
            className="opacity-90"
          />
          <text
            x={tx}
            y={ty}
            transform={vertical ? `rotate(-90 ${tx} ${ty})` : undefined}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#674636"
            fontSize={Math.min(p.w, p.h) / (isSmall ? 3 : 5)}
            fontWeight="bold"
            pointerEvents="none"
          >
            {p.w}x{p.h}
          </text>
          {!isSmall && p.rotated && (
            <svg
              x={vertical ? cx + 2 : cx - 4}
              y={vertical ? cy - 4 : cy + 2}
              width="8" height="8"
              viewBox="0 0 24 24" fill="none" stroke="#674636" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          )}
        </g>
      );
    })}

    {/* Kesim çizgileri (§9.6) — numarasız, her koşulda tam opak */}
    {(cuts || []).map(c => {
      const isV = c.orientation === 'V';
      const x1 = isV ? c.posCm : c.region.x;
      const y1 = isV ? c.region.y : c.posCm;
      const x2 = isV ? c.posCm : c.region.x + c.region.w;
      const y2 = isV ? c.region.y + c.region.h : c.posCm;
      return (
        <line
          key={`c${c.n}`}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#A8352A" strokeWidth={0.7} strokeDasharray="4 3"
          pointerEvents="none"
        />
      );
    })}

  </svg>
  );
};

const CuttingModule: React.FC = () => {
  const settings = useSettings();

  const [parts, setParts] = useState<PartInput[]>(() => {
    const legacy = loadJSON(LEGACY_PENDING_KEY, isParts);
    if (legacy && legacy.length > 0) {
      removeKey(LEGACY_PENDING_KEY);
      const padded = padParts(legacy);
      saveJSON(PARTS_KEY, padded);
      return padded;
    }
    const saved = loadJSON(PARTS_KEY, isParts);
    return saved && saved.length > 0 ? padParts(saved) : padParts([]);
  });

  const [stocksMalzeme, setStocksMalzeme] = useState<StockInput[]>(() => {
    const saved = loadJSON(STOCKS_KEY, isStocks);
    if (saved && saved.length > 0) return padStocks(saved);
    const s = useSettings.getState();
    return padStocks([{ id: 's1', h: s.sheetH, w: s.sheetW, count: 5 }]);
  });

  const [stocksArkalik, setStocksArkalik] = useState<StockInput[]>(() => {
    const saved = loadJSON(STOCKS_ARKALIK_KEY, isStocks);
    return saved && saved.length > 0 ? padStocks(saved) : padStocks([]);
  });

  const [stocksKapak, setStocksKapak] = useState<StockInput[]>(() => {
    const saved = loadJSON(STOCKS_KAPAK_KEY, isStocks);
    return saved && saved.length > 0 ? padStocks(saved) : padStocks([]);
  });

  // Kapak parçaları Kapak levhası yerine Malzeme levhasından mı kesilsin? (B5)
  const [kapakMerged, setKapakMerged] = useState<boolean>(() => loadJSON(KAPAK_MERGE_KEY, isBool) ?? false);

  const kerf = settings.kerf;

  const [options, setOptions] = useState<CutOptions>(() => {
    const saved = loadJSON(OPTIONS_KEY, isOptions);
    return { ...DEFAULT_OPTIONS, ...(saved ?? {}) };
  });

  const [stored, setStored] = useState<StoredResult | null>(() => loadJSON(RESULT_KEY, isStoredResult));
  const [isOptimizing, setIsOptimizing] = useState(false);
  // Arama ilerlemesi (v3): 5-10 sn'lik tavlama arayüzü kilitlemeden koşar
  const [progress, setProgress] = useState<OptProgress | null>(null);
  const [optError, setOptError] = useState<string | null>(null);
  const stopRef = useRef(false);
  const [selectedBin, setSelectedBin] = useState<{ bin: PlacedBin; flatIndex: number; label: string } | null>(null);
  // D2: zoom modalında seçili ölçü anahtarı (aynı ölçüdeki tüm parçalar birlikte vurgulanır)
  const [selectedSizeKey, setSelectedSizeKey] = useState<string | null>(null);
  // D3: Genişlik/Uzunluk hücrelerini 4 kenar bant seçicisine çeviren görünüm modu
  const [bandingMode, setBandingMode] = useState(false);

  useEffect(() => { saveJSON(PARTS_KEY, parts); }, [parts]);
  useEffect(() => { saveJSON(STOCKS_KEY, stocksMalzeme); }, [stocksMalzeme]);
  useEffect(() => { saveJSON(STOCKS_ARKALIK_KEY, stocksArkalik); }, [stocksArkalik]);
  useEffect(() => { saveJSON(STOCKS_KAPAK_KEY, stocksKapak); }, [stocksKapak]);
  useEffect(() => { saveJSON(KAPAK_MERGE_KEY, kapakMerged); }, [kapakMerged]);
  useEffect(() => { saveJSON(OPTIONS_KEY, options); }, [options]);

  // Keep-alive router: "KESİME AKTAR" eventi geldiğinde kalıcı anahtardan yükle
  useEffect(() => {
    return onPartsTransfer(() => {
      const saved = loadJSON(PARTS_KEY, isParts);
      if (saved && saved.length > 0) setParts(padParts(saved));
    });
  }, []);

  // Girdi imzası — bayat sonuç şeridi (CM-02)
  const inputHash = useMemo(() => {
    // Paketleyicinin GERÇEKTEN göreceği stok kümesi: otomatik modda adedi 0 olan satır da
    // (Arkalık/Kapak varsayılanı) applyAutoSheets ile devreye girdiği için imzaya dahil olmalı
    const liveStocks = (list: StockInput[], auto: boolean) =>
      applyAutoSheets(list, auto)
        .filter(s => s.w > 0 && s.h > 0 && s.count > 0)
        .map(s => [s.w, s.h, s.count]);
    return JSON.stringify({
      p: parts
        .filter(p => p.w > 0 && p.h > 0 && p.count > 0)
        .map(p => [p.w, p.h, p.count, p.rotatable, groupOfPart(p)]),
      sm: liveStocks(stocksMalzeme, options.autoSheets),
      sa: liveStocks(stocksArkalik, options.autoSheetsArkalik),
      sk: liveStocks(stocksKapak, options.autoSheetsKapak),
      km: kapakMerged,
      k: kerf,
      o: [options.autoSheets, options.autoSheetsArkalik, options.autoSheetsKapak, options.grainLock]
    });
  }, [parts, stocksMalzeme, stocksArkalik, stocksKapak, kapakMerged, kerf, options]);

  const result = stored?.result ?? null;
  const isStale = stored !== null && stored.inputHash !== inputHash;

  // Kesim planları (§9.6) — sonuçtan türetilir; dizi result.bins'in DÜZ index'ine hizalı
  const cutPlans = useMemo(
    () => (result ? result.bins.map(b => computeCutPlan(b)) : []),
    [result]
  );

  // Sonuç plakalarını gruplara ayır; flatIndex korunur (cutPlans hizası bozulmasın — B6)
  const groupedBins = useMemo(() => {
    if (!result) return [] as { group: SheetGroup; items: { bin: PlacedBin; flatIndex: number; label: string }[] }[];
    const buckets = new Map<SheetGroup, { bin: PlacedBin; flatIndex: number; label: string }[]>();
    result.bins.forEach((bin, flatIndex) => {
      const g: SheetGroup = bin.group ?? 'malzeme';
      const arr = buckets.get(g) ?? [];
      arr.push({ bin, flatIndex, label: `${GROUP_SHEET_LABEL[g]} ${arr.length + 1}` });
      buckets.set(g, arr);
    });
    return GROUP_ORDER
      .filter(g => (buckets.get(g)?.length ?? 0) > 0)
      .map(g => ({ group: g, items: buckets.get(g)! }));
  }, [result]);

  const anyAuto = options.autoSheets || options.autoSheetsArkalik || options.autoSheetsKapak;

  const updatePart = (index: number, field: keyof PartInput, value: string | number | boolean) => {
    const newParts = [...parts];
    newParts[index] = { ...newParts[index], [field]: value } as PartInput;
    if (index === newParts.length - 1 && field !== 'rotatable' && field !== 'name' && field !== 'sheetGroup' && value) {
      newParts.push(emptyPartRow());
    }
    setParts(newParts);
  };

  // D3: tek kenarın bant durumunu çevirir (ölçü/adet/döndür verisine dokunmaz)
  const toggleBanding = (index: number, edge: keyof EdgeBanding) => {
    setParts(prev => {
      const next = [...prev];
      const cur = bandingOf(next[index]);
      next[index] = { ...next[index], edgeBanding: { ...cur, [edge]: !cur[edge] } };
      return next;
    });
  };

  const updateStockMalzeme = useMemo(() => makeStockUpdater(setStocksMalzeme), []);
  const updateStockArkalik = useMemo(() => makeStockUpdater(setStocksArkalik), []);
  const updateStockKapak = useMemo(() => makeStockUpdater(setStocksKapak), []);

  const startOptimization = async () => {
    if (isOptimizing) return;
    stopRef.current = false;
    setIsOptimizing(true);
    setProgress(null);
    setOptError(null);

    // Desen kilidi (#13): tüm parçalarda döndürme kapatılır
    const effParts = options.grainLock
      ? parts.map(p => ({ ...p, rotatable: false }))
      : parts;

    // Kapak birleşikken kapak parçaları Malzeme havuzuna düşer (B5 kuralı 4)
    const effGroupOf = (p: PartInput): SheetGroup => {
      const g = groupOfPart(p);
      return g === 'kapak' && kapakMerged ? 'malzeme' : g;
    };

    const groups: GroupInput[] = [
      {
        group: 'malzeme',
        stocks: applyAutoSheets(stocksMalzeme, options.autoSheets),
        parts: effParts.filter(p => effGroupOf(p) === 'malzeme')
      },
      {
        group: 'arkalik',
        stocks: applyAutoSheets(stocksArkalik, options.autoSheetsArkalik),
        parts: effParts.filter(p => effGroupOf(p) === 'arkalik')
      },
      {
        group: 'kapak',
        stocks: applyAutoSheets(stocksKapak, options.autoSheetsKapak),
        parts: effParts.filter(p => effGroupOf(p) === 'kapak')
      }
    ];

    // Sonucun hangi girdiye ait olduğu, hesap BAŞLARKENKİ imzayla kilitlenir:
    // arama sürerken kullanıcı bir hücreye dokunursa sonuç yanlış imzayla
    // saklanmasın (bayat şerit yanıltmasın).
    const hashAtStart = inputHash;

    try {
      const res = await optimizeCutlistGroupedAsync(groups, kerf, {
        onProgress: setProgress,
        shouldStop: () => stopRef.current
      });
      const next: StoredResult = { result: res, inputHash: hashAtStart };
      setStored(next);
      saveJSON(RESULT_KEY, next);
    } catch (err) {
      // Hesap çökerse önceki sonuç ekranda kalır; sessiz yutma yok
      console.error('Kesim optimizasyonu başarısız:', err);
      setOptError('Hesaplama tamamlanamadı. Parça ve plaka ölçülerini kontrol edip tekrar deneyin.');
    } finally {
      setIsOptimizing(false);
      setProgress(null);
    }
  };

  // D2: farklı bir levha açıldığında (veya modal kapandığında) ölçü seçimi sıfırlanır
  useEffect(() => { setSelectedSizeKey(null); }, [selectedBin?.flatIndex]);

  // Zoom modalı: ESC + arka plan kilidi (CM-12)
  useEffect(() => {
    if (!selectedBin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedBin(null);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selectedBin]);

  const optToggle = (active: boolean) =>
    `flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black tracking-wider border transition-all ${
      active
        ? 'bg-brand-900 text-brand-100 border-brand-900 shadow-sm'
        : 'bg-brand-100 text-brand-900/50 border-brand-900/10 hover:text-brand-900'
    }`;

  return (
    <div className="flex flex-col xl:flex-row gap-6 xl:gap-8 animate-fadeIn pb-20 items-start w-full">
      {/* Sol Kolon: Girdiler */}
      <div className="w-full xl:w-[500px] 2xl:w-[600px] shrink-0 flex flex-col gap-6">

      {/* BAŞLIK & AYARLAR */}
      <div className="bg-brand-200 p-6 md:p-8 rounded-[2rem] shadow-sm border border-brand-900/10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h2 className="text-sm font-black text-brand-500 uppercase tracking-widest flex items-center gap-2">
            <Disc3 size={20} /> 2D Kesim Optimizasyonu
          </h2>


        </div>

        {/* Seçenekler: otomatik plaka + desen kilidi */}
        <div className="flex flex-wrap gap-3 mb-8">
          <button
            onClick={() => setOptions(o => ({ ...o, grainLock: !o.grainLock }))}
            className={optToggle(options.grainLock)}
            title="Desenli levha: hiçbir parça döndürülmez (desen yönü korunur)"
          >
            <TreePine size={14} /> DESENLİ LEVHA — DÖNDÜRME YOK
          </button>
        </div>

        {/* PARÇALAR TABLOSU — sütun sırası Liste ile aynı: GENİŞLİK × UZUNLUK (CM-01) */}
        <div className="bg-white rounded border border-gray-300 shadow-sm overflow-hidden mb-6">
          <div className="bg-gray-200 px-4 py-3 border-b border-gray-300 flex flex-wrap items-center justify-between gap-2 text-gray-700 font-bold">
            <div className="flex items-center gap-2">
              <LayoutPanelLeft size={18} />
              <span>Parçalar</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setBandingMode(v => !v)}
                aria-pressed={bandingMode}
                title="Ölçü hücrelerini 4 kenar bantlama seçicisine çevirir"
                className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider border transition-colors ${
                  bandingMode
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                Bantlama
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Tüm parçalar silinecek. Emin misiniz?')) setParts(padParts([]));
                }}
                className="bg-red-50/50 text-red-500 px-5 py-2 rounded-full text-xs font-bold hover:bg-red-500 hover:text-white transition-colors border border-red-500/10 shrink-0"
              >
                Temizle
              </button>
            </div>
          </div>
          {bandingMode && (
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 text-[11px] font-bold text-blue-700">
              Bantlama modu — kenarlar parçanın kendi Genişlik×Uzunluk yönüne göredir (üst/alt = Genişlik, sol/sağ = Uzunluk). Ölçüler bu modda salt-okunur.
            </div>
          )}
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-800 text-sm border-b border-gray-300">
                {bandingMode ? (
                  <th colSpan={2} className="font-bold py-2 px-3 border-r border-gray-300 w-[48%]">Kenar Bandı · Genişlik × Uzunluk</th>
                ) : (
                  <>
                    <th className="font-bold py-2 px-3 border-r border-gray-300 w-[24%]">Genişlik (cm)</th>
                    <th className="font-bold py-2 px-3 border-r border-gray-300 w-[24%]">Uzunluk (cm)</th>
                  </>
                )}
                <th className="font-bold py-2 px-3 border-r border-gray-300 w-[16%]">Adet</th>
                <th className="font-bold py-2 px-3 border-r border-gray-300 w-[22%]">Grup</th>
                <th className="font-bold py-2 px-3 text-center w-[14%]">Döndür</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p, idx) => (
                <tr key={p.id || idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  {bandingMode ? (
                    <td colSpan={2} className="border-r border-gray-300 px-3 py-2">
                      <div className="flex items-center gap-3">
                        <BandingPicker
                          banding={bandingOf(p)}
                          onToggle={(edge) => toggleBanding(idx, edge)}
                        />
                        <span className="text-sm font-medium text-gray-800">
                          {p.w || 0}<span className="text-gray-400 mx-1">×</span>{p.h || 0}
                        </span>
                        <span className="ml-auto text-[10px] font-black text-gray-400 uppercase tracking-wider">
                          {bandedCount(bandingOf(p))}/4
                        </span>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="border-r border-gray-300 p-0 hover:bg-blue-50 transition-colors">
                        <input
                          type="number" min={0}
                          value={p.w || ''}
                          onChange={(e) => updatePart(idx, 'w', Number(e.target.value))}
                          className="w-full bg-transparent px-3 py-2 outline-none text-gray-800 font-medium"
                        />
                      </td>
                      <td className="border-r border-gray-300 p-0 hover:bg-blue-50 transition-colors">
                        <input
                          type="number" min={0}
                          value={p.h || ''}
                          onChange={(e) => updatePart(idx, 'h', Number(e.target.value))}
                          className="w-full bg-transparent px-3 py-2 outline-none text-gray-800 font-medium"
                        />
                      </td>
                    </>
                  )}
                  <td className="border-r border-gray-300 p-0 hover:bg-blue-50 transition-colors">
                    <input
                      type="number" min={0}
                      value={p.count || ''}
                      onChange={(e) => updatePart(idx, 'count', Number(e.target.value))}
                      className="w-full bg-transparent px-3 py-2 outline-none text-gray-800 font-medium"
                    />
                  </td>
                  <td className="border-r border-gray-300 p-0 hover:bg-blue-50 transition-colors">
                    <select
                      value={groupOfPart(p)}
                      onChange={(e) => updatePart(idx, 'sheetGroup', e.target.value)}
                      aria-label="Levha grubu"
                      title="Bu parça hangi levhadan kesilecek"
                      className="w-full bg-transparent px-2 py-2 outline-none text-gray-800 text-xs font-medium cursor-pointer"
                    >
                      <option value="malzeme">Malzeme</option>
                      <option value="arkalik">Arkalık</option>
                      <option value="kapak">Kapak</option>
                    </select>
                  </td>
                  <td className="p-0 text-center align-middle hover:bg-blue-50 transition-colors">
                    <button
                      onClick={() => updatePart(idx, 'rotatable', !p.rotatable)}
                      disabled={options.grainLock}
                      title={options.grainLock ? 'Desen kilidi açık — döndürme global kapalı' : (p.rotatable ? 'Döndürme açık' : 'Döndürme kapalı')}
                      className={`w-full h-full flex items-center justify-center p-2 transition-colors ${options.grainLock ? 'text-gray-300' : p.rotatable ? 'text-blue-600' : 'text-gray-400'}`}
                    >
                      <RotateCw size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* LEVHALAR — Malzeme / Arkalık / Kapak ayrı fiziksel havuzlar (B5) */}
        <div className="mb-8">
          <StockTable
            title="Malzeme Levhaları"
            stocks={stocksMalzeme}
            auto={options.autoSheets}
            onToggleAuto={() => setOptions(o => ({ ...o, autoSheets: !o.autoSheets }))}
            onChange={updateStockMalzeme}
          />
          <StockTable
            title="Arkalık Levhaları"
            stocks={stocksArkalik}
            auto={options.autoSheetsArkalik}
            onToggleAuto={() => setOptions(o => ({ ...o, autoSheetsArkalik: !o.autoSheetsArkalik }))}
            onChange={updateStockArkalik}
          />
          <StockTable
            title="Kapak Levhaları"
            stocks={stocksKapak}
            auto={options.autoSheetsKapak}
            onToggleAuto={() => setOptions(o => ({ ...o, autoSheetsKapak: !o.autoSheetsKapak }))}
            onChange={updateStockKapak}
            headerExtra={
              <ToggleSwitch
                checked={kapakMerged}
                onToggle={() => setKapakMerged(v => !v)}
                label="Kapak — malzemeye dahil et"
                title="Açıkken kapak parçaları kendi levhasından değil, Malzeme levhalarından kesilir"
              />
            }
            note={
              kapakMerged
                ? 'Şu an Malzeme levhalarından kesiliyor — bu tablodaki değerler kullanılmıyor. Anahtarı kapatınca yeniden devreye girer.'
                : undefined
            }
          />
        </div>

        <button
           onClick={isOptimizing ? () => { stopRef.current = true; } : startOptimization}
           disabled={!isOptimizing && parts.every(p => !p.h || !p.w || !p.count)}
           title={isOptimizing ? 'Aramayı durdurur; o ana kadarki en iyi yerleşim kullanılır' : undefined}
           className="w-full bg-brand-500 hover:bg-brand-500/90 text-brand-900 py-4 rounded-xl font-black text-lg tracking-widest flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
        >
           {isOptimizing ? <Disc3 className="animate-spin" size={24} /> : <Scissors size={24} />}
           {isOptimizing ? 'DURDUR VE EN İYİYİ AL' : 'HESAPLA VE YERLEŞTİR'}
        </button>

        {optError && (
          <div className="mt-3 bg-red-50 border border-red-500/20 p-3 rounded-xl text-sm font-bold text-red-600">
            {optError}
          </div>
        )}

        {/* Arama ilerlemesi — tavlama sürerken plaka sayısı düşerken canlı görünür */}
        {isOptimizing && (
          <div className="mt-3">
            <div className="h-1.5 w-full bg-brand-900/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-900/70 transition-[width] duration-200"
                style={{ width: `${Math.round((progress?.progress ?? 0) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-[10px] font-black uppercase tracking-widest text-brand-900/50">
              <span>
                {progress?.phase === 'anneal' ? 'İYİLEŞTİRİLİYOR' : 'YERLEŞTİRİLİYOR'}
                {progress && progress.iterations > 0 ? ` · ${progress.iterations.toLocaleString('tr-TR')} deneme` : ''}
              </span>
              <span>
                {progress && progress.bins > 0 ? `${progress.bins} plaka · %${progress.wastePercent.toFixed(1)} fire` : ''}
              </span>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Sağ Kolon: Sonuçlar */}
      <div className="w-full flex-1 min-w-0 flex flex-col">
      {/* SONUÇLAR */}
      {result ? (
        <div className={`animate-slideUp space-y-6 ${isStale ? 'opacity-60' : ''}`}>
          {isStale && (
            <div className="bg-amber-50 border border-amber-500/30 p-4 rounded-2xl flex items-center gap-3 text-sm font-bold text-amber-700">
              <AlertTriangle size={18} className="shrink-0" />
              Girdiler değişti — aşağıdaki şema eski hesaba ait. "HESAPLA VE YERLEŞTİR" ile yenileyin.
            </div>
          )}

          {result.unplaced.length > 0 && (
            <div className="bg-red-50 border border-red-500/20 p-6 rounded-3xl shadow-sm">
               <div className="font-bold text-red-600 mb-2 flex items-center gap-2">
                 <span>⚠️</span> BAZI PARÇALAR SIĞMADI! (Girdiğiniz Plaka Stoğu Yetersiz Olabilir)
               </div>
               <ul className="list-disc pl-5 text-sm text-red-500/80 select-text">
                 {result.unplaced.map((u, i) => (
                    <li key={i}>
                      <span className="font-black uppercase tracking-wider text-[11px]">{GROUP_PART_LABEL[groupOfPart(u.part)]}</span>
                      {' · '}{u.part.name || 'İsimsiz'} ({u.part.w}x{u.part.h}) — istenen {u.requested}, yerleşen {u.placed}, <b>sığmayan {u.missing} adet</b>
                    </li>
                 ))}
               </ul>
            </div>
          )}

          {/* GEREKEN PLAKA bandı (otomatik mod, #7) — 3 grubun grand-total'ı */}
          {anyAuto && (
            <div className="bg-brand-900 text-brand-100 p-5 rounded-3xl shadow-md flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest opacity-70">Gereken Plaka</span>
              <span className="text-4xl font-black text-brand-500">{result.stats.totalBins}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-6">
            {groupedBins.flatMap(g => g.items).map(({ bin, flatIndex, label }) => (
              <div key={flatIndex} className="bg-white p-4 rounded-[1.5rem] shadow-sm border border-brand-900/10 flex flex-col">
                <div className="flex justify-between items-end mb-3 print:mb-2">
                  <h4 className="font-black text-brand-900 text-base">{label}</h4>
                  <div className="text-[10px] font-bold text-brand-900/50">Doluluk: %{bin.utilization.toFixed(1)}</div>
                </div>

                <div
                  className="relative w-full overflow-hidden bg-brand-100 rounded-lg shadow-inner ring-1 ring-brand-900/10 cursor-pointer hover:ring-brand-500 hover:ring-2 transition-all mt-auto"
                  style={{ aspectRatio: `${bin.w} / ${bin.h}` }}
                  onClick={() => setSelectedBin({ bin, flatIndex, label })}
                >
                   <div className="absolute inset-0 w-full h-full pointer-events-none">
                     <BinSvg bin={bin} cuts={cutPlans[flatIndex]} />
                   </div>
                   <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-brand-900/10 backdrop-blur-[1px] transition-opacity">
                      <div className="bg-white/90 text-brand-900 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5">
                        <ZoomIn size={14} /> BÜYÜT
                      </div>
                   </div>
                </div>
              </div>
            ))}
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 select-text">
            <div className="bg-brand-200 border border-brand-900/10 p-4 rounded-3xl shadow-sm text-center">
               <div className="text-[10px] font-bold text-brand-900/50 uppercase tracking-widest mb-1">{anyAuto ? 'GEREKEN PLAKA' : 'KULLANILAN PLAKA'}</div>
               <div className="text-3xl font-black text-brand-900">{result.stats.totalBins}</div>
            </div>
            <div className="bg-brand-200 border border-brand-900/10 p-4 rounded-3xl shadow-sm text-center">
               <div className="text-[10px] font-bold text-brand-900/50 uppercase tracking-widest mb-1">FİRE ORANI</div>
               <div className="text-3xl font-black text-red-500/80">%{result.stats.wastePercent.toFixed(1)}</div>
            </div>
            <div className="bg-brand-200 border border-brand-900/10 p-4 rounded-3xl shadow-sm text-center">
               <div className="text-[10px] font-bold text-brand-900/50 uppercase tracking-widest mb-1">TOPLAM ALAN</div>
               <div className="text-3xl font-black text-brand-900">{(result.stats.totalArea / 10000).toFixed(2)}<span className="text-lg">m²</span></div>
            </div>
            <div className="bg-brand-200 border border-brand-900/10 p-4 rounded-3xl shadow-sm text-center">
               <div className="text-[10px] font-bold text-brand-900/50 uppercase tracking-widest mb-1">EN BÜYÜK ARTIK</div>
               <div className="text-3xl font-black text-brand-500">{(result.stats.largestOffcutArea / 10000).toFixed(2)}<span className="text-lg">m²</span></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-brand-200 p-6 md:p-8 rounded-[2rem] shadow-sm border border-brand-900/10 flex flex-col items-center justify-center min-h-[400px] h-full">
          <div className="text-center px-8 opacity-40">
            <Scissors size={48} className="mx-auto mb-4 text-brand-900/50" />
            <p className="text-sm font-bold text-brand-900">Parçaları ekleyip "HESAPLA VE YERLEŞTİR" butonuna bastığınızda<br/>kesim şemaları burada görünecektir.</p>
          </div>
        </div>
      )}
      </div>

      {/* ZOOM MODAL — portal + ESC + backdrop (EK-01, CM-12) */}
      {selectedBin && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-900/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setSelectedBin(null)}
        >
          <div
            className="bg-white w-full h-[90vh] md:h-[95vh] max-w-6xl rounded-3xl overflow-hidden shadow-2xl flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b border-brand-900/10 bg-brand-100/50">
              <h3 className="font-black text-brand-900 text-lg flex items-center gap-2">
                {selectedBin.label}
                <span className="text-xs font-bold text-brand-900/50 ml-2">({selectedBin.bin.w}x{selectedBin.bin.h}cm)</span>
                {selectedSizeKey && (
                  <span className="text-[10px] font-black uppercase tracking-wider bg-blue-600 text-white px-3 py-1 rounded-full ml-1">
                    {selectedSizeKey.replace('x', ' × ')} cm ·{' '}
                    {selectedBin.bin.placed.filter(pp => sizeKeyOf(pp.w, pp.h) === selectedSizeKey).length} adet
                  </span>
                )}
              </h3>
              <button
                onClick={() => setSelectedBin(null)}
                aria-label="Kapat"
                className="p-2 rounded-full hover:bg-brand-900/10 text-brand-900 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 w-full bg-brand-200 relative overflow-hidden">
              <TransformWrapper
                initialScale={1}
                minScale={0.1}
                maxScale={10}
                centerOnInit
                wheel={{ step: 0.1 }}
              >
                {({ zoomIn, zoomOut, centerView }) => (
                  <>
                    <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2 bg-white/90 p-2 rounded-2xl shadow-lg border border-brand-900/5">
                       <button onClick={() => zoomIn()} className="p-3 bg-brand-100 text-brand-900 rounded-xl hover:bg-brand-500 transition-colors" title="Büyüt">
                         <ZoomIn size={20} />
                       </button>
                       <button onClick={() => zoomOut()} className="p-3 bg-brand-100 text-brand-900 rounded-xl hover:bg-brand-500 transition-colors" title="Küçült">
                         <ZoomOut size={20} />
                       </button>
                       <button onClick={() => centerView()} className="p-3 bg-brand-100 text-brand-900 rounded-xl hover:bg-brand-500 transition-colors" title="Ortala">
                         <Maximize size={20} />
                       </button>
                    </div>

                    <TransformComponent
                      wrapperClass="w-full h-full cursor-grab active:cursor-grabbing"
                      contentClass="w-full h-full flex items-center justify-center"
                    >
                      <div
                        className="bg-brand-100 shadow-2xl ring-1 ring-brand-900/20"
                        style={{
                          width: `${selectedBin.bin.w * 3}px`,
                          height: `${selectedBin.bin.h * 3}px`,
                          maxWidth: '80vw',
                          maxHeight: '80vh',
                          aspectRatio: `${selectedBin.bin.w} / ${selectedBin.bin.h}`
                        }}
                      >
                        <BinSvg
                          bin={selectedBin.bin}
                          cuts={cutPlans[selectedBin.flatIndex]}
                          selectedSizeKey={selectedSizeKey}
                          onSelectSizeKey={setSelectedSizeKey}
                        />
                      </div>
                    </TransformComponent>
                  </>
                )}
              </TransformWrapper>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CuttingModule;
