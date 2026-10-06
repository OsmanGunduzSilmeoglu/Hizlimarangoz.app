import { describe, it, expect } from 'vitest';
import { optimizeCutlist } from '../domain/nesting/packer';
import { computeCutPlan, cutPlanToText } from '../domain/nesting/cutPlan';

describe('computeCutPlan (giyotin kesim talimatı)', () => {
  const res = optimizeCutlist(
    [{ id: 's1', w: 210, h: 280, count: 5 }],
    [
      { id: 'p1', name: 'Yan', w: 75.2, h: 60, count: 4, rotatable: true },
      { id: 'p2', name: 'Tabla', w: 80, h: 60, count: 3, rotatable: true },
      { id: 'p3', name: 'Kuşak', w: 56.4, h: 10, count: 6, rotatable: true },
    ],
    0.3
  );

  it('her plaka için plan üretir; numaralar sıralıdır', () => {
    expect(res.bins.length).toBeGreaterThan(0);
    for (const bin of res.bins) {
      const steps = computeCutPlan(bin);
      expect(steps.length).toBeGreaterThan(0);
      steps.forEach((s, i) => expect(s.n).toBe(i + 1));
    }
  });

  it('hiçbir kesim çizgisi bir parçanın içinden geçmez', () => {
    for (const bin of res.bins) {
      const steps = computeCutPlan(bin);
      for (const s of steps) {
        for (const p of bin.placed) {
          // Parça, kesim bölgesiyle kesişiyorsa çizgi parçanın içinden geçmemeli
          const inRegionX = p.x < s.region.x + s.region.w && p.x + p.w > s.region.x;
          const inRegionY = p.y < s.region.y + s.region.h && p.y + p.h > s.region.y;
          if (!inRegionX || !inRegionY) continue;
          if (s.orientation === 'V') {
            const cuts = p.x + 1e-6 < s.posCm && s.posCm < p.x + p.w - 1e-6;
            expect(cuts, `V kesim ${s.posCm} parça ${p.x}-${p.x + p.w} içinden geçiyor`).toBe(false);
          } else {
            const cuts = p.y + 1e-6 < s.posCm && s.posCm < p.y + p.h - 1e-6;
            expect(cuts, `H kesim ${s.posCm} parça ${p.y}-${p.y + p.h} içinden geçiyor`).toBe(false);
          }
        }
      }
    }
  });

  it('metin çıktısı plaka başlığı ve artık bilgisi içerir', () => {
    const text = cutPlanToText(res.bins[0], 1, computeCutPlan(res.bins[0]));
    expect(text).toContain('PLAKA 1');
    expect(text).toContain('kesim');
  });
});
