import { describe, it, expect } from 'vitest';
import { computeShelfLayout } from '../domain/shelf';

describe('computeShelfLayout (SC-01)', () => {
  it('h=72, 2 raf, t=1.8: pozisyonlar raf ALT YÜZEYİ, delik merkezi pim yarıçapı düşülmüş', () => {
    const layout = computeShelfLayout(72, 2, 1.8, 0.5);
    expect(layout).not.toBeNull();
    expect(layout!.gap).toBe(22.8);
    expect(layout!.positions).toEqual([22.8, 47.4]);
    expect(layout!.pinCenters).toEqual([22.55, 47.15]); // Ø5 → −0.25
  });

  it('gözler toplamı tam iç yüksekliği verir', () => {
    const layout = computeShelfLayout(72, 2, 1.8, 0.5)!;
    const total = layout.gap * 3 + 1.8 * 2;
    expect(total).toBeCloseTo(72, 6);
  });

  it('h ≤ s·t geçersiz girdide null döner (SC-03)', () => {
    expect(computeShelfLayout(3, 2, 1.8, 0.5)).toBeNull();
    expect(computeShelfLayout(NaN, 2, 1.8, 0.5)).toBeNull();
  });
});
