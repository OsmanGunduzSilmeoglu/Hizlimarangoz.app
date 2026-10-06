import { describe, it, expect } from 'vitest';
import {
  buildYuklukParts,
  computeCompartmentWidth,
  computeDrawerFront,
  validateYuklukInput,
  YuklukTolerances,
  DRAWER_BOX_HEIGHT_ALLOWANCE
} from '../domain/yukluk';

const TOL: YuklukTolerances = {
  thickness: 1.8,
  backThickness: 0.8,
  backGap: 0.3,
  shelfFit: 0.3,
  shelfBackClear: 1.0,
  pinDiameter: 0.5,
  drawerSlideClearance: 1.3,
  drawerFrontGap: 0.4,
  drawerBottomThickness: 0.4,
};

describe('computeCompartmentWidth', () => {
  it('N bölme, N+1 dikme: (w − (N+1)·t) / N', () => {
    expect(computeCompartmentWidth(100, 2, 1.8)).toBe(47.3); // (100 − 5.4) / 2
    expect(computeCompartmentWidth(60, 1, 1.8)).toBe(56.4);  // (60 − 3.6) / 1
  });

  it('geçersiz girdide null: tam sayı olmayan N, N<1, sığmayan genişlik', () => {
    expect(computeCompartmentWidth(100, 2.5, 1.8)).toBeNull();
    expect(computeCompartmentWidth(100, 0, 1.8)).toBeNull();
    expect(computeCompartmentWidth(5, 3, 1.8)).toBeNull(); // (5 − 7.2) / 3 < 0
    expect(computeCompartmentWidth(NaN, 2, 1.8)).toBeNull();
  });
});

describe('computeDrawerFront', () => {
  it('fuga paylı eşit bölünüm', () => {
    // innerH = 236.4, 3 çekmece: (236.4 − 4·0.4) / 3 = 78.27
    expect(computeDrawerFront(47.3, 236.4, 3, TOL)).toEqual({ width: 46.9, height: 78.27 });
  });

  it('sığmayan durumda null', () => {
    expect(computeDrawerFront(47.3, 236.4, 0, TOL)).toBeNull();
    expect(computeDrawerFront(47.3, 1, 5, TOL)).toBeNull(); // yükseklik negatif
  });
});

describe('buildYuklukParts — uzerine-oturan', () => {
  const parts = buildYuklukParts(
    { h: 240, w: 100, d: 60, compartmentCount: 2, mountType: 'uzerine-oturan', quantity: 1, includeBack: false },
    [{ shelfCount: 2, drawerCount: 0 }, { shelfCount: 0, drawerCount: 3 }],
    TOL
  );
  const byName = Object.fromEntries(parts.map(p => [p.name, p]));

  it('dikmeler taban/tavan arasına oturur: h − 2t, N+1 adet', () => {
    expect(byName['Dikme (Yan + Ara)']).toMatchObject({ width: 236.4, height: 60, count: 3 }); // 240 − 3.6
  });

  it('taban ve tavan tam parça (tam kapalı kutu)', () => {
    expect(byName['Alt Tabla']).toMatchObject({ width: 100, height: 60, count: 1 });
    expect(byName['Üst Tabla']).toMatchObject({ width: 100, height: 60, count: 1 });
  });

  it('arkalık varsayılan kapalı — parça üretilmez', () => {
    expect(parts.find(p => p.material === 'back')).toBeUndefined();
  });

  it('bölme 1 rafları: cw − fit × d − sırt', () => {
    // cw = 47.3 → 47.3 − 0.3 = 47; 60 − 1 = 59
    expect(byName['İç Raf']).toMatchObject({ width: 47, height: 59, count: 2 });
  });

  it('bölme 2 çekmeceleri: cephe + kutu + taban (ayrı malzeme)', () => {
    // innerH = 236.4; frontH = (236.4 − 1.6)/3 = 78.27; frontW = 46.9
    expect(byName['Çekmece Cephesi']).toMatchObject({ width: 46.9, height: 78.27, count: 3 });
    // boxW = 47.3 − 2.6 = 44.7; boxH = 78.27 − 3 = 75.27; boxD = 58
    expect(byName['Çekmece Yan']).toMatchObject({ width: 58, height: 75.27, count: 6 });
    expect(byName['Çekmece Arka']).toMatchObject({ width: 41.1, height: 75.27, count: 3 }); // 44.7 − 3.6
    expect(byName['Çekmece Tabanı']).toMatchObject({ width: 44.7, height: 58, count: 3, material: 'drawer-bottom' });
  });
});

describe('buildYuklukParts — arasina-giren', () => {
  const parts = buildYuklukParts(
    { h: 240, w: 100, d: 60, compartmentCount: 2, mountType: 'arasina-giren', quantity: 1, includeBack: true },
    [{ shelfCount: 0, drawerCount: 0 }, { shelfCount: 0, drawerCount: 0 }],
    TOL
  );
  const byName = Object.fromEntries(parts.map(p => [p.name, p]));

  it('dikmeler tam boy', () => {
    expect(byName['Dikme (Yan + Ara)']).toMatchObject({ width: 240, height: 60, count: 3 });
  });

  it('her bölmenin kendi taban+tavan segmenti (2N adet, bölme genişliğinde)', () => {
    expect(byName['Bölme Taban/Tavan']).toMatchObject({ width: 47.3, height: 60, count: 4 });
  });

  it('arkalık: bindirme usulü −0.3 cm, ayrı malzeme (cabinet.ts kuralı)', () => {
    expect(byName['Arkalık']).toMatchObject({ width: 99.7, height: 239.7, count: 1, material: 'back' });
  });
});

describe('buildYuklukParts — adet çarpanı ve guardlar', () => {
  it('quantity tüm parça adetlerini çarpar', () => {
    const parts = buildYuklukParts(
      { h: 240, w: 100, d: 60, compartmentCount: 3, mountType: 'uzerine-oturan', quantity: 2, includeBack: true },
      [{ shelfCount: 1, drawerCount: 0 }, { shelfCount: 0, drawerCount: 0 }, { shelfCount: 0, drawerCount: 0 }],
      TOL
    );
    const byName = Object.fromEntries(parts.map(p => [p.name, p]));
    expect(byName['Dikme (Yan + Ara)'].count).toBe(8);  // (3+1) × 2
    expect(byName['Alt Tabla'].count).toBe(2);
    expect(byName['Arkalık'].count).toBe(2);
    expect(byName['İç Raf'].count).toBe(2);              // 1 × 2
  });

  it('geçersiz geometri boş liste döner', () => {
    expect(buildYuklukParts(
      { h: 3, w: 100, d: 60, compartmentCount: 2, mountType: 'uzerine-oturan', quantity: 1, includeBack: false },
      [{ shelfCount: 0, drawerCount: 0 }, { shelfCount: 0, drawerCount: 0 }],
      TOL
    )).toEqual([]); // innerH = 3 − 3.6 < 0
    expect(buildYuklukParts(
      { h: 240, w: 5, d: 60, compartmentCount: 3, mountType: 'uzerine-oturan', quantity: 1, includeBack: false },
      [{ shelfCount: 0, drawerCount: 0 }, { shelfCount: 0, drawerCount: 0 }, { shelfCount: 0, drawerCount: 0 }],
      TOL
    )).toEqual([]); // bölme genişliği negatif
  });
});

describe('validateYuklukInput', () => {
  it('boş girdiler hata sayılmaz (form yarım olabilir)', () => {
    expect(validateYuklukInput({ h: '', w: '', d: '' }, '', '', [], TOL)).toHaveLength(0);
  });

  it('geçerli girdide hata yok', () => {
    const errors = validateYuklukInput(
      { h: '240', w: '100', d: '60' }, '2', '1',
      [{ shelfCount: 2, drawerCount: 0 }, { shelfCount: 0, drawerCount: 3 }],
      TOL
    );
    expect(errors).toHaveLength(0);
  });

  it('minimum bölme genişliği: 15 cm altı reddedilir', () => {
    // (50 − 7.2) / 3 = 14.27 < 15
    const errors = validateYuklukInput({ h: '240', w: '50', d: '60' }, '3', '1', [], TOL);
    expect(errors.some(e => e.field === 'w')).toBe(true);
  });

  it('bölme sayısı 1–12 tam sayı olmalı', () => {
    expect(validateYuklukInput({ h: '', w: '', d: '' }, '0', '1', [], TOL).some(e => e.field === 'compartments')).toBe(true);
    expect(validateYuklukInput({ h: '', w: '', d: '' }, '13', '1', [], TOL).some(e => e.field === 'compartments')).toBe(true);
    expect(validateYuklukInput({ h: '', w: '', d: '' }, '2.5', '1', [], TOL).some(e => e.field === 'compartments')).toBe(true);
  });

  it("üstel gösterim UI ile tutarlı ayrıştırılır: '1e1' = 10 bölme (parseInt sapması yok)", () => {
    // parseInt('1e1')=1 olsaydı w=50 için genişlik denetimi n=1 ile geçerdi;
    // parseFloat tabanlı ayrıştırmada n=10 → MIN_COMPARTMENT_WIDTH ihlali yakalanır
    const errors = validateYuklukInput({ h: '240', w: '50', d: '60' }, '1e1', '1', [], TOL);
    expect(errors.some(e => e.field === 'w')).toBe(true);
    // '2e1' = 20 > 12 → bölme sayısı hatası görünür (sessiz çıkmaz sokak yok)
    expect(validateYuklukInput({ h: '', w: '', d: '' }, '2e1', '1', [], TOL).some(e => e.field === 'compartments')).toBe(true);
  });

  it('aynı bölmede hem raf hem çekmece reddedilir (cepheler açıklığın tamamını kaplar)', () => {
    const errors = validateYuklukInput(
      { h: '240', w: '100', d: '60' }, '2', '1',
      [{ shelfCount: 2, drawerCount: 2 }, { shelfCount: 0, drawerCount: 0 }],
      TOL
    );
    expect(errors.some(e => e.field === 'comp-0')).toBe(true);
  });

  it('yükseklik taban+tavan kalınlığından büyük olmalı', () => {
    const errors = validateYuklukInput({ h: '3', w: '', d: '' }, '', '1', [], TOL);
    expect(errors.some(e => e.field === 'h')).toBe(true);
  });

  it('iç yükseklik raflara yetmiyorsa bölme hatası (computeShelfLayout guard yüzeye çıkar)', () => {
    // h=8 → innerH = 4.4; 3 raf × 1.8 = 5.4 > 4.4
    const errors = validateYuklukInput(
      { h: '8', w: '100', d: '60' }, '2', '1',
      [{ shelfCount: 3, drawerCount: 0 }, { shelfCount: 0, drawerCount: 0 }],
      TOL
    );
    expect(errors.some(e => e.field === 'comp-0')).toBe(true);
  });

  it('iç yükseklik çekmecelere yetmiyorsa bölme hatası', () => {
    // h=10 → innerH = 6.4; 2 çekmece: frontH = (6.4 − 1.2)/2 = 2.6; kutu 2.6 − 3 < 0
    const errors = validateYuklukInput(
      { h: '10', w: '100', d: '60' }, '2', '1',
      [{ shelfCount: 0, drawerCount: 2 }, { shelfCount: 0, drawerCount: 0 }],
      TOL
    );
    expect(errors.some(e => e.field === 'comp-0')).toBe(true);
  });

  it('MAX_DIM = 400 sınırı', () => {
    const errors = validateYuklukInput({ h: '401', w: '401', d: '401' }, '', '1', [], TOL);
    expect(errors.some(e => e.field === 'h')).toBe(true);
    expect(errors.some(e => e.field === 'w')).toBe(true);
    expect(errors.some(e => e.field === 'd')).toBe(true);
  });

  it('kutu yükseklik payı sabiti tutarlı', () => {
    expect(DRAWER_BOX_HEIGHT_ALLOWANCE).toBe(3);
  });
});
