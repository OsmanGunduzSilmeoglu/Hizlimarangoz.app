/**
 * Gerçek kesim planı üretimi (rapor §9.6, Özellik #9).
 *
 * Yerleşimden giyotin kesim sırası türetir: her adımda bölgeyi baştan başa
 * geçen ve hiçbir parçayı kesmeyen bir çizgi bulunur (giyotin yerleşimde
 * varlığı garanti), iki alt bölgeye inilir. Çıktı, testere başında sırayla
 * uygulanabilir numaralı talimattır. Hesap tamsayı mm ile yapılır.
 *
 * Aday çizgi seçimi guillotine.ts'te — doğrulayıcı (isGuillotineLayout) ile
 * birebir aynı mantığı paylaşır, ayrışamaz.
 */
import { cmToMm, mmToCm } from '../units';
import { PlacedBin } from './packer';
import { findGuillotineCut, splitRegion, rectInside, GRect } from './guillotine';

export interface CutStep {
  n: number;
  orientation: 'V' | 'H';
  /** Kesim çizgisi pozisyonu — plaka koordinatında, cm (V: x, H: y) */
  posCm: number;
  /** Kesimin uygulandığı bölge (cm) — SVG çizimi ve tarif için */
  region: { x: number; y: number; w: number; h: number };
}

export function computeCutPlan(bin: PlacedBin): CutStep[] {
  const parts: GRect[] = bin.placed.map(p => ({
    x: cmToMm(p.x), y: cmToMm(p.y), w: cmToMm(p.w), h: cmToMm(p.h)
  }));
  const steps: CutStep[] = [];

  const emit = (orientation: 'V' | 'H', posMm: number, region: GRect) => {
    steps.push({
      n: steps.length + 1,
      orientation,
      posCm: mmToCm(posMm),
      region: { x: mmToCm(region.x), y: mmToCm(region.y), w: mmToCm(region.w), h: mmToCm(region.h) }
    });
  };

  const recurse = (region: GRect, regionParts: GRect[]) => {
    if (regionParts.length === 0) return;

    if (regionParts.length === 1) {
      // Tek parça: bölgeden küçükse ayırma (trim) kesimleri
      const p = regionParts[0];
      let r = { ...region };
      if (p.x > r.x) { emit('V', p.x, r); r = { ...r, x: p.x, w: r.x + r.w - p.x }; }
      if (p.y > r.y) { emit('H', p.y, r); r = { ...r, y: p.y, h: r.y + r.h - p.y }; }
      if (p.x + p.w < r.x + r.w) { emit('V', p.x + p.w, r); r = { ...r, w: p.x + p.w - r.x }; }
      if (p.y + p.h < r.y + r.h) { emit('H', p.y + p.h, r); }
      return;
    }

    const cut = findGuillotineCut(region, regionParts);
    if (cut === null) return; // giyotin yerleşimde olmamalı — güvenlik çıkışı

    emit(cut.orientation, cut.pos, region);
    const [r1, r2] = splitRegion(region, cut);
    recurse(r1, regionParts.filter(p => rectInside(p, r1)));
    recurse(r2, regionParts.filter(p => rectInside(p, r2)));
  };

  recurse({ x: 0, y: 0, w: cmToMm(bin.w), h: cmToMm(bin.h) }, parts);
  return steps;
}

/** Kesim planını plakacıya/çırağa gönderilecek düz metne çevirir. */
export function cutPlanToText(bin: PlacedBin, binIndex: number, steps: CutStep[]): string {
  const lines: string[] = [];
  lines.push(`PLAKA ${binIndex} — ${bin.w}×${bin.h} cm · Doluluk %${bin.utilization.toFixed(1)}`);
  for (const s of steps) {
    const axis = s.orientation === 'V' ? 'DİKEY  x' : 'YATAY  y';
    lines.push(
      `${String(s.n).padStart(2)}. kesim  ${axis} = ${s.posCm} cm  (bölge ${s.region.x},${s.region.y} → ${s.region.w}×${s.region.h})`
    );
  }
  const usable = [...bin.freeRects].sort((a, b) => b.w * b.h - a.w * a.h);
  if (usable.length > 0) {
    const top = usable[0];
    lines.push(`ARTIK: ${top.w}×${top.h} cm (${((top.w * top.h) / 10000).toFixed(2)} m²) — KULLANILABİLİR`);
  }
  return lines.join('\n');
}
