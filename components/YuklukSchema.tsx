import React from 'react';
import { YuklukCompartmentConfig, YuklukMountType } from '../types';
import { computeShelfLayout } from '../domain/shelf';
import { computeCompartmentWidth } from '../domain/yukluk';

/**
 * Yüklük ön görünüş şeması — tamamen prop-driven / pure (Visualizer ilkesi).
 * N bölme tıklanabilir; seçim state'i üstte (CuttingList) tutulur.
 * Görsel dil Visualizer.tsx'ten: koyu zemin + grid, kesikli ölçü çizgileri,
 * amber değer kutuları. h henüz girilmediyse temsili yükseklikle çizilir.
 */
interface YuklukSchemaProps {
  h: number; // 0 veya NaN ise temsili yükseklik kullanılır, raf çizgileri gizlenir
  w: number;
  d: number;
  compartmentCount: number;
  mountType: YuklukMountType;
  compartments: YuklukCompartmentConfig[];
  selectedIndex: number | null;
  onSelectCompartment: (index: number) => void;
  thickness: number;
  pinDiameter: number;
}

const YuklukSchema: React.FC<YuklukSchemaProps> = ({
  h, w, compartmentCount, mountType, compartments,
  selectedIndex, onSelectCompartment, thickness, pinDiameter
}) => {
  const n = compartmentCount;
  const t = thickness;
  const cw = computeCompartmentWidth(w, n, t);
  if (cw === null) return null;

  const hasRealH = Number.isFinite(h) && h > 2 * t;
  const dispH = hasRealH ? h : Math.max(w * 1.4, 180); // temsili boy — yüklükler dikey
  const innerH = dispH - 2 * t;

  const scale = Math.min(300 / w, 340 / dispH);
  const sw = w * scale;
  const sh = dispH * scale;
  const st = t * scale;
  const cwPx = cw * scale;

  const compX = (i: number) => (t + i * (cw + t)) * scale;

  // Bölme başına rozet/değer kutusu ancak sığıyorsa çizilir — dar bölmede
  // metin taşması ve negatif genişlikli rect üretimi engellenir
  const showCompBoxes = cwPx >= 34;

  // viewBox içerik sınırından hesaplanır (Visualizer VZ-01 ilkesi): başlık
  // bloğu (±60, alt sh+59) ve sol ölçü kutusu (-56) hiçbir gövde ölçüsünde kırpılmaz
  const vbX = Math.min(-56, sw / 2 - 64);
  const vbY = -16;
  const vbW = Math.max(sw + 20, sw / 2 + 64) - vbX;
  const vbH = (sh + 62) - vbY;

  return (
    <div className="relative flex flex-col items-center w-full overflow-hidden p-4">
      {/* Blueprint Background Effect (Visualizer ile aynı) */}
      <div className="absolute inset-0 bg-[#1e293b] opacity-100 pattern-grid-lg"></div>

      <svg
        className="relative w-full h-auto max-w-[360px] drop-shadow-2xl z-10"
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="yukluk-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#334155" strokeWidth="0.5" />
          </pattern>
        </defs>

        <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="#1e293b" />
        <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="url(#yukluk-grid)" />

        {/* Yükseklik ölçü çizgisi (yalnız gerçek h girilmişse) */}
        {hasRealH && (
          <g>
            <line x1="-30" y1="0" x2="-30" y2={sh} stroke="#94a3b8" strokeWidth="1" />
            <line x1="-35" y1="0" x2="-25" y2="0" stroke="#94a3b8" strokeWidth="1" />
            <line x1="-35" y1={sh} x2="-25" y2={sh} stroke="#94a3b8" strokeWidth="1" />
            <rect x="-40" y={sh / 2 - 15} width="20" height="30" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" rx="4" />
            <text
              x="-30" y={sh / 2}
              fill="#e2e8f0" fontSize="10" fontWeight="bold"
              transform={`rotate(-90, -30, ${sh / 2})`}
              textAnchor="middle" dy="3"
            >
              {h}
            </text>
          </g>
        )}

        {/* Genişlik ölçü çizgisi */}
        <line x1="0" y1={sh + 18} x2={sw} y2={sh + 18} stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
        <line x1="0" y1={sh + 13} x2="0" y2={sh + 23} stroke="#94a3b8" strokeWidth="1" />
        <line x1={sw} y1={sh + 13} x2={sw} y2={sh + 23} stroke="#94a3b8" strokeWidth="1" />
        <rect x={sw / 2 - 20} y={sh + 8} width="40" height="20" rx="4" fill="#0f172a" stroke="#94a3b8" strokeWidth="1" />
        <text x={sw / 2} y={sh + 22} fill="#e2e8f0" fontSize="10" fontWeight="bold" textAnchor="middle">
          {w}
        </text>

        {/* Gövde dış hattı */}
        <rect x="0" y="0" width={sw} height={sh} fill="none" stroke="#60a5fa" strokeWidth="2" strokeDasharray="10 5" rx="2" />

        {/* Yapısal elemanlar — montaj tipine göre */}
        {mountType === 'uzerine-oturan' ? (
          <g>
            {/* Taban + tavan tam genişlik, dikmeler arasına oturur */}
            <rect x="0" y="0" width={sw} height={st} fill="#60a5fa" fillOpacity="0.35" stroke="#60a5fa" strokeWidth="1" />
            <rect x="0" y={sh - st} width={sw} height={st} fill="#60a5fa" fillOpacity="0.35" stroke="#60a5fa" strokeWidth="1" />
            {Array.from({ length: n + 1 }, (_, i) => (
              <rect
                key={`div-${i}`}
                x={(i * (cw + t)) * scale} y={st}
                width={st} height={sh - 2 * st}
                fill="#60a5fa" fillOpacity="0.2" stroke="#60a5fa" strokeWidth="1"
              />
            ))}
          </g>
        ) : (
          <g>
            {/* Dikmeler tam boy; taban/tavan segmentleri bölme içine girer */}
            {Array.from({ length: n + 1 }, (_, i) => (
              <rect
                key={`div-${i}`}
                x={(i * (cw + t)) * scale} y="0"
                width={st} height={sh}
                fill="#60a5fa" fillOpacity="0.2" stroke="#60a5fa" strokeWidth="1"
              />
            ))}
            {Array.from({ length: n }, (_, i) => (
              <g key={`seg-${i}`}>
                <rect x={compX(i)} y="0" width={cwPx} height={st} fill="#60a5fa" fillOpacity="0.35" stroke="#60a5fa" strokeWidth="1" />
                <rect x={compX(i)} y={sh - st} width={cwPx} height={st} fill="#60a5fa" fillOpacity="0.35" stroke="#60a5fa" strokeWidth="1" />
              </g>
            ))}
          </g>
        )}

        {/* Bölmeler — tıklanabilir */}
        {Array.from({ length: n }, (_, i) => {
          const comp = compartments[i] ?? { shelfCount: 0, drawerCount: 0 };
          const isSelected = selectedIndex === i;
          const dimmed = selectedIndex !== null && !isSelected;
          const x = compX(i);
          const shelfLayout = hasRealH && comp.shelfCount > 0
            ? computeShelfLayout(innerH, comp.shelfCount, t, pinDiameter)
            : null;
          const badgeParts: string[] = [];
          if (comp.shelfCount > 0) badgeParts.push(`${comp.shelfCount} raf`);
          if (comp.drawerCount > 0) badgeParts.push(`${comp.drawerCount} çek.`);
          const badge = badgeParts.join(' · ');
          const boxW = Math.min(44, cwPx - 4);

          return (
            <g key={`comp-${i}`} opacity={dimmed ? 0.25 : 1}>
              {/* Raf çizgileri — pozisyonlar bölme alt-dikdörtgenine uygulanır */}
              {shelfLayout && shelfLayout.positions.map((pos, si) => (
                <rect
                  key={si}
                  x={x + 1}
                  y={st + (innerH - pos - t) * scale}
                  width={Math.max(cwPx - 2, 0)}
                  height={Math.max(st, 1.5)}
                  fill="#60a5fa" fillOpacity="0.35" stroke="#60a5fa" strokeWidth="0.75"
                  pointerEvents="none"
                />
              ))}

              {/* Özet rozet */}
              {badge && showCompBoxes && (
                <g pointerEvents="none">
                  <rect x={x + cwPx / 2 - boxW / 2} y={st + 6} width={boxW} height="16" rx="4" fill="#0f172a" stroke="#475569" strokeWidth="1" />
                  <text x={x + cwPx / 2} y={st + 17} fill="#e2e8f0" fontSize="8" fontWeight="bold" textAnchor="middle">
                    {badge}
                  </text>
                </g>
              )}

              {/* Bölme genişliği değer kutusu (Visualizer value-box tekniği) */}
              {showCompBoxes && (
                <g pointerEvents="none">
                  <rect x={x + cwPx / 2 - boxW / 2} y={sh - st - 24} width={boxW} height="18" rx="4" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.5" />
                  <text x={x + cwPx / 2} y={sh - st - 11} fill="#fbbf24" fontSize="9" fontWeight="bold" textAnchor="middle" className="font-mono">
                    {cw}
                  </text>
                </g>
              )}

              {/* Tıklanabilir bölme yüzeyi + seçim vurgusu */}
              <rect
                x={x} y={st} width={cwPx} height={sh - 2 * st}
                fill={isSelected ? '#f59e0b' : '#60a5fa'}
                fillOpacity={isSelected ? 0.15 : 0.05}
                stroke={isSelected ? '#f59e0b' : '#475569'}
                strokeWidth={isSelected ? 2.5 : 1}
                className="cursor-pointer"
                onClick={() => onSelectCompartment(i)}
              />
            </g>
          );
        })}

        {/* Title Block */}
        <rect x={sw / 2 - 60} y={sh + 34} width="120" height="25" fill="#0f172a" stroke="#60a5fa" strokeWidth="1" />
        <text x={sw / 2} y={sh + 50} textAnchor="middle" fill="#60a5fa" fontSize="10" fontWeight="bold" letterSpacing="2">
          YÜKLÜK ŞEMASI
        </text>
      </svg>
    </div>
  );
};

export default YuklukSchema;
