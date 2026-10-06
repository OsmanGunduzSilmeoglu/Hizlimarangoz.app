import { describe, it, expect } from 'vitest';
import { buildCabinetParts, validateCabinetInput } from '../domain/cabinet';

const TOL = {
  thickness: 1.8,
  backThickness: 0.8,
  backGap: 0.3,
  doorGap: 0.4,
  shelfFit: 0.3,
  shelfBackClear: 1.0,
};

describe('buildCabinetParts', () => {
  it('BASE 77×60×60, 1 raf: gövde geometrisi tutarlı', () => {
    const parts = buildCabinetParts(
      { type: 'BASE', h: 77, w: 60, d: 60, shelves: 1, quantity: 1, includeBack: false, doors: 0 },
      TOL
    );
    const byName = Object.fromEntries(parts.map(p => [p.name, p]));
    expect(byName['Alt Tabla']).toMatchObject({ width: 60, height: 60, count: 1 });
    expect(byName['Yan Dikme']).toMatchObject({ width: 75.2, height: 60, count: 2 }); // 77 − 1.8
    expect(byName['Üst Kuşak (Kayıt)']).toMatchObject({ width: 56.4, height: 10, count: 2 }); // 60 − 3.6
    // CL-04: raf artık fit + sırt payı düşülmüş
    expect(byName['İç Raf']).toMatchObject({ width: 56.1, height: 59, count: 1 }); // 56.4−0.3 × 60−1
  });

  it('arkalık ayrı malzeme grubuyla üretilir (CL-02)', () => {
    const parts = buildCabinetParts(
      { type: 'BASE', h: 77, w: 60, d: 60, shelves: 0, quantity: 2, includeBack: true, doors: 0 },
      TOL
    );
    const back = parts.find(p => p.material === 'back');
    expect(back).toBeDefined();
    expect(back).toMatchObject({ width: 59.7, height: 76.7, count: 2 }); // w−0.3 × h−0.3, adet×2
  });

  it('kapak fuga hesabı: tek ve çift', () => {
    const single = buildCabinetParts(
      { type: 'BASE', h: 77, w: 60, d: 60, shelves: 0, quantity: 1, includeBack: false, doors: 1 },
      TOL
    ).find(p => p.name.startsWith('Kapak'));
    expect(single).toMatchObject({ width: 59.6, height: 76.6, count: 1 }); // 60−0.4 × 77−0.4

    const dbl = buildCabinetParts(
      { type: 'BASE', h: 77, w: 80, d: 60, shelves: 0, quantity: 1, includeBack: false, doors: 2 },
      TOL
    ).find(p => p.name.startsWith('Kapak'));
    expect(dbl).toMatchObject({ width: 39.7, height: 76.6, count: 2 }); // (80−0.6)/2
  });

  it('WALL: yanlar tam boy, tablalar arada', () => {
    const parts = buildCabinetParts(
      { type: 'WALL', h: 92, w: 60, d: 32, shelves: 0, quantity: 1, includeBack: false, doors: 0 },
      TOL
    );
    const byName = Object.fromEntries(parts.map(p => [p.name, p]));
    expect(byName['Yan Dikme']).toMatchObject({ width: 92, height: 32, count: 2 });
    expect(byName['Alt-Üst Tabla']).toMatchObject({ width: 56.4, height: 32, count: 2 });
  });
});

describe('validateCabinetInput (CL-03)', () => {
  it('w=3 negatif parça üretmeden yakalanır', () => {
    const errors = validateCabinetInput('BASE', { h: '77', w: '3', d: '60' }, '', '1', 1.8);
    expect(errors.some(e => e.field === 'w')).toBe(true);
  });

  it('h=1 (kalınlıktan küçük) reddedilir', () => {
    const errors = validateCabinetInput('BASE', { h: '1', w: '60', d: '60' }, '', '1', 1.8);
    expect(errors.some(e => e.field === 'h')).toBe(true);
  });

  it('geçerli girdide hata yok', () => {
    const errors = validateCabinetInput('BASE', { h: '77', w: '60', d: '60' }, '2', '1', 1.8);
    expect(errors).toHaveLength(0);
  });
});
