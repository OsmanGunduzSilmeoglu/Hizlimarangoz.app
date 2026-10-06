
import React, { useState, useEffect } from 'react';
import { CalculationResult } from '../types';
import Visualizer from './Visualizer';
import { Ruler, ChevronDown, AlertTriangle } from 'lucide-react';
import { computeShelfLayout } from '../domain/shelf';
import { useSettings } from '../state/settings';

const THICKNESS_OPTIONS = [1.6, 1.8, 2.2, 3.6];

const ShelfCalculator: React.FC = () => {
  const settings = useSettings();
  // Pim çapı Ayarlar'dan (Ø5/Ø6/Ø8): raf pimin ÜSTÜNE oturur → delik merkezi
  // raf alt yüzeyinden pim yarıçapı kadar aşağıdadır (SC-01 düzeltmesi).
  const PIN_RADIUS = settings.pinDiameter / 2;

  const [height, setHeight] = useState<string>('');
  const [shelves, setShelves] = useState<string>('');
  const [thickness, setThickness] = useState<number>(settings.thickness);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [inputWarning, setInputWarning] = useState<string>('');

  useEffect(() => {
    const h = parseFloat(height);
    const sFloat = parseFloat(shelves);
    const s = parseInt(shelves);

    // SC-03: geçersiz girdi artık sessizce yutulmaz
    if (height !== '' && shelves !== '' && !isNaN(h) && !isNaN(s)) {
      if (!Number.isInteger(sFloat)) {
        setInputWarning(`Raf adedi tam sayı olmalı — ${sFloat} yerine ${s} kullanıldı.`);
      } else if (h <= s * thickness) {
        setInputWarning(`İç yükseklik (${h} cm), rafların toplam kalınlığından (${(s * thickness).toFixed(1)} cm) büyük olmalı.`);
      } else {
        setInputWarning('');
      }
    } else {
      setInputWarning('');
    }

    const layout = !isNaN(h) && !isNaN(s)
      ? computeShelfLayout(h, s, thickness, settings.pinDiameter)
      : null;

    if (layout) {
      setResult({
        gap: layout.gap,
        positions: layout.positions,
        totalHeight: h,
        shelfCount: s,
        thickness: thickness
      });
    } else {
      setResult(null);
    }
  }, [height, shelves, thickness, settings.pinDiameter]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 animate-fadeIn pb-20 items-start w-full">
      {/* Sol Kolon: Form ve Sonuçlar */}
      <div className="w-full lg:w-96 xl:w-[450px] shrink-0 flex flex-col gap-6 lg:sticky lg:top-4">

      <div className="bg-brand-200 p-8 rounded-[2rem] shadow-sm border border-brand-900/10">
        <h2 className="text-sm font-black text-brand-500 uppercase tracking-widest mb-8 flex items-center gap-2">
           <Ruler size={18} /> Eşit Raf Hesapla
        </h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-brand-100 p-4 rounded-3xl border border-brand-900/5 shadow-inner">
            <label className="block text-[10px] text-center font-bold text-brand-900/60 uppercase tracking-wider mb-2">
              İç Yükseklik (cm)
            </label>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="0"
                className="w-full bg-transparent text-center text-4xl font-black text-brand-900 py-2 outline-none placeholder:text-brand-900/20"
              />
            </div>
          </div>
          <div className="bg-brand-100 p-4 rounded-3xl border border-brand-900/5 shadow-inner">
            <label className="block text-[10px] text-center font-bold text-brand-900/60 uppercase tracking-wider mb-2">
              Raf Adedi
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={shelves}
              onChange={(e) => setShelves(e.target.value)}
              placeholder="0"
              className="w-full bg-transparent text-center text-4xl font-black text-brand-900 py-2 outline-none placeholder:text-brand-900/20"
            />
          </div>
        </div>

        {inputWarning && (
          <div className="mt-4 bg-amber-50 border border-amber-500/30 rounded-2xl p-4 text-xs font-bold text-amber-700 flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" /> {inputWarning}
          </div>
        )}

        {/* Helper Note for Thickness dropdown */}
        <div className="mt-6 flex justify-center">
          <div className="relative inline-flex items-center">
            <span className="text-xs text-brand-900/60 mr-2 font-bold uppercase tracking-wider">Malzeme:</span>
            <div className="relative">
              <select
                value={thickness}
                onChange={(e) => setThickness(Number(e.target.value))}
                className="appearance-none bg-brand-100 text-brand-900 font-bold text-sm px-4 py-2 pr-8 rounded-full shadow-sm border border-brand-900/5 outline-none focus:border-brand-500 transition-colors cursor-pointer"
              >
                {THICKNESS_OPTIONS.map(t => (
                  <option key={t} value={t}>{t} cm</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-brand-900/50">
                <ChevronDown size={14} strokeWidth={3} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {result && (
        <div className="bg-brand-900 p-8 rounded-[2rem] shadow-xl relative overflow-hidden animate-slideUp text-brand-100">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-bl-[100px] -z-0"></div>
          <h3 className="font-black text-xl mb-6 flex items-center gap-2 relative z-10 opacity-90 tracking-wide">
             RAF &amp; DELİK LİSTESİ
          </h3>
          <div className="space-y-4 relative z-10 select-text">
            <div className="flex justify-between items-center bg-black/20 p-5 rounded-2xl border border-white/5 backdrop-blur-sm">
              <span className="text-sm font-bold opacity-80 uppercase tracking-wide">Raf Aralığı (Net)</span>
              <span className="text-4xl font-black text-brand-500">{result.gap} <span className="text-sm opacity-60 text-brand-100">cm</span></span>
            </div>

            {/* SC-01: değerler rafın ALT YÜZEYİ; delik merkezi pim yarıçapı düşülerek ayrı verilir */}
            <div className="grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-2 items-center pt-4">
              <span></span>
              <span className="text-[10px] font-black uppercase tracking-widest opacity-60 text-center">Raf Alt Yüzeyi</span>
              <span className="text-[10px] font-black uppercase tracking-widest opacity-60 text-center">Delik Merkezi (Ø{settings.pinDiameter * 10})</span>

              {result.positions.map((pos, idx) => (
                <React.Fragment key={idx}>
                  <span className="w-8 h-8 flex items-center justify-center bg-brand-500 text-brand-900 rounded-full text-xs font-bold shadow-sm">
                    {idx + 1}
                  </span>
                  <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-2xl border border-white/5 text-center">
                    <span className="font-mono text-xl font-black tracking-tight">{pos}</span>
                    <span className="text-xs opacity-50 ml-1">cm</span>
                  </div>
                  <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-2xl border border-white/5 text-center">
                    <span className="font-mono text-xl font-black tracking-tight text-brand-500">{Number((pos - PIN_RADIUS).toFixed(2))}</span>
                    <span className="text-xs opacity-50 ml-1">cm</span>
                  </div>
                </React.Fragment>
              ))}
            </div>

            <p className="text-[11px] opacity-60 mt-6 text-center uppercase tracking-widest font-bold">
              Ölçüler alt tabandan yukarıya doğrudur. Delik merkezi, raf alt yüzeyinden Ø{settings.pinDiameter * 10} pim yarıçapı ({PIN_RADIUS} cm) düşülerek verilmiştir.
            </p>
          </div>
        </div>
      )}
      </div>

      {/* Sağ Kolon: Görsel Şema */}
      <div className="w-full flex-1 min-w-0 flex flex-col lg:sticky lg:top-4">

      <div className="bg-brand-200 p-6 rounded-[2rem] shadow-sm border border-brand-900/10 flex flex-col items-center min-h-[400px]">
        <h2 className="w-full text-xs font-black text-brand-900/50 uppercase tracking-widest mb-6 text-center">
           Görsel Şema
        </h2>
        <div className="flex-1 w-full flex items-center justify-center bg-brand-100 rounded-3xl border border-brand-900/5 shadow-inner p-6">
          {result ? (
            <Visualizer data={result} />
          ) : (
            <div className="text-center px-8 opacity-40">
              <Ruler size={48} className="mx-auto mb-4 text-brand-900/50" />
              <p className="text-sm font-bold text-brand-900">Veri girildiğinde şema oluşur.</p>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};

export default ShelfCalculator;
