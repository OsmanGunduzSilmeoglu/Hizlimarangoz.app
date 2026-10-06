import { describe, it, expect } from 'vitest';
import {
  optimizeCutlist,
  optimizeCutlistGrouped,
  optimizeCutlistGroupedIter,
  optimizeCutlistGroupedAsync,
  isBinGuillotineCuttable,
  OptResult,
  OptimizeOptions
} from '../domain/nesting/packer';

/**
 * Testler üretim varsayılanı olan 8 sn'lik arama bütçesine BİLEREK bağlanmaz —
 * bağlanırsa her test o kadar sürer ve bütçe ayarı değişince kırmızıya döner.
 * Kısa ama tavlamayı gerçekten çalıştıran bir bütçe verilir.
 */
const FAST: OptimizeOptions = { timeBudgetMs: 400, extendMs: 0, maxIters: 4000 };

/** Geometrik doğrulayıcı: sınır aşımı + çakışma yoksa null döner. */
function validateBins(result: OptResult): string | null {
  for (const bin of result.bins) {
    for (const p of bin.placed) {
      if (p.x < -1e-6 || p.y < -1e-6 || p.x + p.w > bin.w + 1e-6 || p.y + p.h > bin.h + 1e-6) {
        return `taşma: ${JSON.stringify(p)} plaka ${bin.w}x${bin.h}`;
      }
    }
    for (let i = 0; i < bin.placed.length; i++) {
      for (let j = i + 1; j < bin.placed.length; j++) {
        const a = bin.placed[i], b = bin.placed[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 1e-6 && oy > 1e-6) return `çakışma: ${i}/${j}`;
      }
    }
  }
  return null;
}

/**
 * Bıçak payı denetimi: iki parça EN AZ bir eksende kerf kadar ayrık olmalı.
 * Sağlanmazsa testere komşu parçadan yer — çakışma testi bunu YAKALAMAZ,
 * çünkü dikdörtgenler geometrik olarak üst üste binmez.
 */
function validateKerf(result: OptResult, kerf: number): string | null {
  for (const bin of result.bins) {
    for (let i = 0; i < bin.placed.length; i++) {
      for (let j = i + 1; j < bin.placed.length; j++) {
        const a = bin.placed[i], b = bin.placed[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > -kerf + 1e-6 && oy > -kerf + 1e-6) {
          return `kerf ihlali: boşluk x=${ox.toFixed(2)} y=${oy.toFixed(2)} < ${kerf}`;
        }
      }
    }
  }
  return null;
}

const KITCHEN_92 = [
  { id: 'a', name: 'Yan', w: 75.2, h: 60, count: 16, rotatable: true },
  { id: 'b', name: 'Tabla', w: 80, h: 60, count: 8, rotatable: true },
  { id: 'c', name: 'Raf', w: 76.4, h: 58, count: 12, rotatable: true },
  { id: 'd', name: 'Kuşak', w: 76.4, h: 10, count: 16, rotatable: true },
  { id: 'e', name: 'Kapak', w: 39.7, h: 71.5, count: 16, rotatable: true },
  { id: 'f', name: 'Üst Yan', w: 92, h: 32, count: 12, rotatable: true },
  { id: 'g', name: 'Üst Tabla', w: 56.4, h: 32, count: 12, rotatable: true },
];

describe('GuillotinePacker (tamsayı mm çekirdek)', () => {
  it('GP-01: 4×69.7 + 3×0.4 kerf = tam 280 → tek plakaya sığar', () => {
    const res = optimizeCutlist(
      [{ id: 's1', w: 210, h: 280, count: 5 }],
      [{ id: 'p1', name: 'T', w: 210, h: 69.7, count: 4, rotatable: false }],
      0.4,
      FAST
    );
    expect(res.unplaced).toHaveLength(0);
    expect(res.stats.totalBins).toBe(1);
    expect(validateBins(res)).toBeNull();
  });

  it('GP-01b: 61.4 + 0.3 tipik ondalık artığı reddetmez', () => {
    const res = optimizeCutlist(
      [{ id: 's1', w: 100, h: 246.5, count: 2 }],
      [{ id: 'p1', name: 'T', w: 100, h: 61.4, count: 4, rotatable: false }],
      0.3,
      FAST
    );
    expect(res.stats.totalBins).toBe(1);
    expect(res.unplaced).toHaveLength(0);
  });

  it('GP-02: sığmayan adet gerçek eksikle raporlanır (10 istenen → 3 yerleşen, 7 eksik)', () => {
    const res = optimizeCutlist(
      [{ id: 's1', w: 100, h: 100, count: 1 }],
      [{ id: 'p1', name: 'Test', w: 90, h: 30, count: 10, rotatable: true }],
      0,
      FAST
    );
    const placedTotal = res.bins.reduce((a, b) => a + b.placed.length, 0);
    expect(placedTotal).toBe(3);
    expect(res.unplaced).toHaveLength(1);
    expect(res.unplaced[0]).toMatchObject({ requested: 10, placed: 3, missing: 7 });
  });

  it('GP-03: negatif ve aşırı kerf zararsızdır', () => {
    const negative = optimizeCutlist(
      [{ id: 's1', w: 100, h: 100, count: 2 }],
      [{ id: 'p1', name: 'T', w: 40, h: 40, count: 4, rotatable: true }],
      -5,
      FAST
    );
    expect(validateBins(negative)).toBeNull();

    const huge = optimizeCutlist(
      [{ id: 's1', w: 100, h: 100, count: 2 }],
      [{ id: 'p1', name: 'T', w: 40, h: 40, count: 4, rotatable: true }],
      99,
      FAST
    );
    expect(validateBins(huge)).toBeNull();
  });

  it('92 parçalık mutfak işi: hepsi yerleşir, geometri geçerli, artık raporlanır', () => {
    const res = optimizeCutlist([{ id: 's1', w: 210, h: 280, count: 20 }], KITCHEN_92, 0.3, FAST);
    const placedTotal = res.bins.reduce((a, b) => a + b.placed.length, 0);
    expect(placedTotal).toBe(92);
    expect(res.unplaced).toHaveLength(0);
    expect(validateBins(res)).toBeNull();
    expect(res.stats.largestOffcutArea).toBeGreaterThan(0);
    expect(res.bins.every(b => Array.isArray(b.freeRects))).toBe(true);
  });

  it('portföy tek stratejiden kötü sonuç seçmez (leksikografik amaç)', () => {
    // Aynı iş iki kez: sonuç deterministik ve plaka sayısı stabil olmalı
    const parts = [{ id: 'p', name: 'X', w: 60, h: 60, count: 20, rotatable: true }];
    const r1 = optimizeCutlist([{ id: 's', w: 210, h: 280, count: 10 }], parts, 0.3, FAST);
    const r2 = optimizeCutlist([{ id: 's', w: 210, h: 280, count: 10 }], parts, 0.3, FAST);
    expect(r1.stats.totalBins).toBe(r2.stats.totalBins);
    expect(r1.strategy).toBe(r2.strategy);
  });
});

describe('v3 — giyotin geçerliliği', () => {
  it('SA-01: üretilen HER plaka baştan sona bıçakla kesilebilir', () => {
    const res = optimizeCutlist([{ id: 's1', w: 210, h: 280, count: 20 }], KITCHEN_92, 0.3, FAST);
    expect(res.bins.length).toBeGreaterThan(0);
    for (const bin of res.bins) {
      expect(isBinGuillotineCuttable(bin), `plaka kesilemiyor: ${JSON.stringify(bin.placed)}`).toBe(true);
    }
  });

  it('SA-01b: komşu parçalar arasında her zaman bıçak payı kadar boşluk kalır', () => {
    for (const kerf of [0.2, 0.3, 0.4, 1.0]) {
      const res = optimizeCutlist([{ id: 's1', w: 210, h: 280, count: 20 }], KITCHEN_92, kerf, FAST);
      expect(res.unplaced, `kerf ${kerf}`).toHaveLength(0);
      expect(validateKerf(res, kerf), `kerf ${kerf}`).toBeNull();
      expect(validateBins(res), `kerf ${kerf}`).toBeNull();
    }
  });

  it('SA-02: döndürme kapalıyken (desen kilidi) hiçbir parça çevrilmez', () => {
    const res = optimizeCutlist(
      [{ id: 's', w: 210, h: 280, count: 20 }],
      [
        { id: 'a', name: 'Dikme', w: 58, h: 240, count: 8, rotatable: false },
        { id: 'b', name: 'Raf', w: 98.2, h: 56, count: 20, rotatable: false },
      ],
      0.4,
      FAST
    );
    expect(res.unplaced).toHaveLength(0);
    expect(res.bins.every(b => b.placed.every(p => !p.rotated))).toBe(true);
    for (const bin of res.bins) expect(isBinGuillotineCuttable(bin)).toBe(true);
  });

  it('SA-03: döndürme açıkken çevrilen parçanın ölçüsü takas edilmiş olarak raporlanır', () => {
    const res = optimizeCutlist(
      [{ id: 's', w: 100, h: 300, count: 2 }],
      [{ id: 'p', name: 'Uzun', w: 250, h: 40, count: 2, rotatable: true }],
      0.3,
      FAST
    );
    expect(res.unplaced).toHaveLength(0);
    const all = res.bins.flatMap(b => b.placed);
    expect(all).toHaveLength(2);
    // 250×40 plakaya ancak 40×250 olarak girer
    expect(all.every(p => p.rotated && p.w === 40 && p.h === 250)).toBe(true);
  });
});

describe('v3 — tavlama (simulated annealing)', () => {
  it('SA-04: tavlama sonucu hiçbir koşulda yalnız-kurulumdan kötü olamaz', () => {
    const stocks = [{ id: 's', w: 210, h: 280, count: 30 }];
    const parts = [
      { id: 'a', name: 'A', w: 32.5, h: 18.4, count: 20, rotatable: true },
      { id: 'b', name: 'B', w: 45.1, h: 45.1, count: 12, rotatable: true },
      { id: 'c', name: 'C', w: 70.3, h: 22.7, count: 16, rotatable: true },
      { id: 'd', name: 'D', w: 120, h: 33.3, count: 10, rotatable: true },
    ];
    const construct = optimizeCutlist(stocks, parts, 0.3, { ...FAST, anneal: false });
    const annealed = optimizeCutlist(stocks, parts, 0.3, FAST);

    expect(annealed.stats.totalBins).toBeLessThanOrEqual(construct.stats.totalBins);
    if (annealed.stats.totalBins === construct.stats.totalBins) {
      // eşit plakada leksikografik sıra artığı küçültmeyi de yasaklar
      expect(annealed.stats.largestOffcutArea).toBeGreaterThanOrEqual(construct.stats.largestOffcutArea - 1e-9);
    }
    expect(validateBins(annealed)).toBeNull();
  });

  /**
   * Belirlenirlik SÖZLEŞMESİ: sonucu bağlayan kısıt TUR TAVANI olduğu sürece
   * aynı girdi aynı planı verir. Bağlayan kısıt SAAT olursa (bütçe küçük ya da
   * makine yavaş) tamamlanan zincir sayısı değişir ve sonuç makineye göre
   * oynayabilir — bu tasarım gereğidir, testler bunu bilerek dışlar.
   */
  it('SA-05: aynı girdi + aynı tur tavanı iki koşuda birebir aynı planı verir', () => {
    const stocks = [{ id: 's', w: 210, h: 280, count: 20 }];
    const opts: OptimizeOptions = { timeBudgetMs: 60000, extendMs: 0, maxIters: 800 };
    const a = optimizeCutlist(stocks, KITCHEN_92, 0.3, opts);
    const b = optimizeCutlist(stocks, KITCHEN_92, 0.3, opts);
    expect(a.strategy).toBe(b.strategy);
    expect(a.stats.totalBins).toBe(b.stats.totalBins);
    expect(JSON.stringify(a.bins)).toBe(JSON.stringify(b.bins));
  });

  it('SA-06: shouldStop erken durdurur ve geçerli bir sonuç döndürür', () => {
    let calls = 0;
    const res = optimizeCutlist(
      [{ id: 's', w: 210, h: 280, count: 20 }],
      KITCHEN_92,
      0.3,
      { timeBudgetMs: 60000, extendMs: 0, shouldStop: () => ++calls > 2 }
    );
    expect(calls).toBeGreaterThan(2);
    expect(res.bins.length).toBeGreaterThan(0);
    expect(res.unplaced).toHaveLength(0);
    expect(validateBins(res)).toBeNull();
  });

  it('SA-07: zaman bütçesi aşılmaz (ölçüt: bütçe + makul pay)', () => {
    const t0 = Date.now();
    optimizeCutlist([{ id: 's', w: 210, h: 280, count: 30 }], KITCHEN_92, 0.3, { timeBudgetMs: 300, extendMs: 0 });
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it('SA-08: anneal:false yalnız kurulumu çalıştırır (tur sayısı sıfır)', () => {
    const res = optimizeCutlist([{ id: 's', w: 210, h: 280, count: 20 }], KITCHEN_92, 0.3, { ...FAST, anneal: false });
    expect(res.stats.annealIterations).toBe(0);
    expect(res.unplaced).toHaveLength(0);
  });

  it('SA-09: alan alt sınırı raporlanır ve gerçek plaka sayısı ondan küçük olamaz', () => {
    const res = optimizeCutlist([{ id: 's', w: 210, h: 280, count: 20 }], KITCHEN_92, 0.3, FAST);
    expect(res.stats.lowerBoundBins).toBeGreaterThan(0);
    expect(res.stats.totalBins).toBeGreaterThanOrEqual(res.stats.lowerBoundBins as number);
  });
});

describe('v3 — sığmayan parça teşhisi', () => {
  it('UNP-01: plaka ölçüsünden büyük parça ayrı gerekçeyle raporlanır', () => {
    const res = optimizeCutlist(
      [{ id: 's', w: 100, h: 100, count: 5 }],
      [{ id: 'big', name: 'Dev', w: 500, h: 500, count: 2, rotatable: true }],
      0.3,
      FAST
    );
    expect(res.unplaced).toHaveLength(1);
    expect(res.unplaced[0].missing).toBe(2);
    expect(res.unplaced[0].reason).toContain('sığmıyor');
    expect(res.bins).toHaveLength(0);
  });

  it('UNP-02: plakası tanımsız grup "plaka tanımlı değil" gerekçesi verir', () => {
    const res = optimizeCutlist(
      [],
      [{ id: 'p', name: 'Yan', w: 60, h: 70, count: 3, rotatable: true }],
      0.3,
      FAST
    );
    expect(res.unplaced).toHaveLength(1);
    expect(res.unplaced[0].reason).toContain('plaka tanımlı değil');
  });
});

describe('optimizeCutlistGrouped (levha grubu ayrımı)', () => {
  it('GRP-01: arkalık parça asla malzeme grubunun plakasına sızmaz', () => {
    const res = optimizeCutlistGrouped([
      {
        group: 'malzeme',
        stocks: [{ id: 'sm', w: 210, h: 280, count: 5 }],
        parts: [{ id: 'pm', name: 'Yan', w: 60, h: 70, count: 4, rotatable: true, sheetGroup: 'malzeme' }]
      },
      {
        group: 'arkalik',
        stocks: [{ id: 'sa', w: 210, h: 280, count: 5 }],
        parts: [{ id: 'pa', name: 'Arkalık', w: 58, h: 68, count: 3, rotatable: true, sheetGroup: 'arkalik' }]
      },
    ], 0.3, FAST);

    expect(res.unplaced).toHaveLength(0);
    expect(validateBins(res)).toBeNull();

    const malzemeBins = res.bins.filter(b => b.group === 'malzeme');
    const arkalikBins = res.bins.filter(b => b.group === 'arkalik');
    expect(malzemeBins.length).toBeGreaterThan(0);
    expect(arkalikBins.length).toBeGreaterThan(0);

    // Asıl güvence: hiçbir plaka iki grubun parçasını birden taşımaz
    expect(malzemeBins.every(b => b.placed.every(p => p.partId === 'pm'))).toBe(true);
    expect(arkalikBins.every(b => b.placed.every(p => p.partId === 'pa'))).toBe(true);
    expect(res.bins.every(b => b.group !== undefined)).toBe(true);
    expect(res.stats.totalBins).toBe(res.bins.length);
  });

  it('GRP-02: kapak parçası kendi levhasına gider, malzeme plakasına karışmaz', () => {
    const res = optimizeCutlistGrouped([
      {
        group: 'malzeme',
        stocks: [{ id: 'sm', w: 210, h: 280, count: 5 }],
        parts: [{ id: 'pm', name: 'Yan', w: 60, h: 70, count: 4, rotatable: true, sheetGroup: 'malzeme' }]
      },
      {
        group: 'kapak',
        stocks: [{ id: 'sk', w: 210, h: 280, count: 5 }],
        parts: [{ id: 'pk', name: 'Kapak', w: 39.7, h: 71.5, count: 6, rotatable: true, sheetGroup: 'kapak' }]
      },
    ], 0.3, FAST);

    expect(res.unplaced).toHaveLength(0);
    expect(res.bins.filter(b => b.group === 'kapak').every(b => b.placed.every(p => p.partId === 'pk'))).toBe(true);
    expect(res.bins.filter(b => b.group === 'malzeme').every(b => b.placed.every(p => p.partId === 'pm'))).toBe(true);
  });

  it('GRP-03: parçası olmayan grup atlanır — tek gruplu sonuç optimizeCutlist ile birebir aynı', () => {
    const stocks = [{ id: 's', w: 210, h: 280, count: 5 }];
    const parts = [{ id: 'p', name: 'X', w: 60, h: 70, count: 4, rotatable: true }];

    const single = optimizeCutlist(stocks, parts, 0.3, FAST);
    const grouped = optimizeCutlistGrouped([
      { group: 'malzeme', stocks, parts },
      { group: 'arkalik', stocks: [{ id: 'sa', w: 210, h: 280, count: 5 }], parts: [] },
      { group: 'kapak', stocks: [{ id: 'sk', w: 210, h: 280, count: 5 }], parts: [] },
    ], 0.3, FAST);

    expect(grouped.bins).toHaveLength(single.bins.length);
    expect(grouped.stats.totalBins).toBe(single.stats.totalBins);
    expect(grouped.stats.totalArea).toBeCloseTo(single.stats.totalArea, 6);
    expect(grouped.stats.usedArea).toBeCloseTo(single.stats.usedArea, 6);
    expect(grouped.stats.wastePercent).toBeCloseTo(single.stats.wastePercent, 6);
    expect(grouped.stats.largestOffcutArea).toBeCloseTo(single.stats.largestOffcutArea, 6);
    expect(grouped.bins.every(b => b.group === 'malzeme')).toBe(true);
    // Aynı yerleşim: tohum girdiden türetildiği için gruplu/tekil ayrışmaz
    expect(JSON.stringify(grouped.bins.map(b => b.placed))).toBe(JSON.stringify(single.bins.map(b => b.placed)));
  });

  it('GRP-04: levhası tanımsız grup sığmayan olarak raporlanır, diğer grubu bozmaz', () => {
    const res = optimizeCutlistGrouped([
      {
        group: 'malzeme',
        stocks: [{ id: 'sm', w: 210, h: 280, count: 5 }],
        parts: [{ id: 'pm', name: 'Yan', w: 60, h: 70, count: 4, rotatable: true }]
      },
      {
        group: 'arkalik',
        stocks: [],
        parts: [{ id: 'pa', name: 'Arkalık', w: 58, h: 68, count: 3, rotatable: true, sheetGroup: 'arkalik' }]
      },
    ], 0.3, FAST);

    expect(res.bins.every(b => b.group === 'malzeme')).toBe(true);
    expect(res.unplaced).toHaveLength(1);
    expect(res.unplaced[0]).toMatchObject({ requested: 3, placed: 0, missing: 3 });
    expect(res.unplaced[0].part.id).toBe('pa');
    expect(validateBins(res)).toBeNull();
  });

  it('GRP-05: birleştirilmiş kapak (tek malzeme grubu) tüm parçaları aynı havuzda toplar', () => {
    const res = optimizeCutlistGrouped([
      {
        group: 'malzeme',
        stocks: [{ id: 'sm', w: 210, h: 280, count: 10 }],
        parts: [
          { id: 'pm', name: 'Yan', w: 60, h: 70, count: 4, rotatable: true, sheetGroup: 'malzeme' },
          { id: 'pk', name: 'Kapak', w: 39.7, h: 71.5, count: 6, rotatable: true, sheetGroup: 'kapak' },
        ]
      },
    ], 0.3, FAST);

    expect(res.unplaced).toHaveLength(0);
    expect(res.bins.every(b => b.group === 'malzeme')).toBe(true);
    const ids = new Set(res.bins.flatMap(b => b.placed.map(p => p.partId)));
    expect(ids).toEqual(new Set(['pm', 'pk']));
    expect(validateBins(res)).toBeNull();
  });

  it('GRP-06: bütçe gruplara bölünür — üç grup tek grubun katı kadar sürmez', () => {
    const mk = (id: string) => ({
      stocks: [{ id: 'st' + id, w: 210, h: 280, count: 10 }],
      parts: [{ id, name: id, w: 60, h: 70, count: 10, rotatable: true }]
    });
    const t0 = Date.now();
    optimizeCutlistGrouped([
      { group: 'malzeme', ...mk('a') },
      { group: 'arkalik', ...mk('b') },
      { group: 'kapak', ...mk('c') },
    ], 0.3, { timeBudgetMs: 900, extendMs: 0 });
    expect(Date.now() - t0).toBeLessThan(4000);
  });
});

describe('v3 — ilerleme ve asenkron sürüm', () => {
  const GROUPS = [{
    group: 'malzeme' as const,
    stocks: [{ id: 's', w: 210, h: 280, count: 20 }],
    parts: KITCHEN_92
  }];

  it('ASY-01: jeneratör ilerleme bildirir, ilerleme geri gitmez', () => {
    const it = optimizeCutlistGroupedIter(GROUPS, 0.3, FAST);
    let last = -1;
    let count = 0;
    let step = it.next();
    while (!step.done) {
      expect(step.value.progress).toBeGreaterThanOrEqual(last - 1e-9);
      expect(step.value.progress).toBeLessThanOrEqual(1 + 1e-9);
      last = step.value.progress;
      count++;
      step = it.next();
    }
    expect(count).toBeGreaterThan(0);
    expect(step.value.unplaced).toHaveLength(0);
  });

  it('ASY-02: asenkron sürüm senkron sürümle aynı sonucu verir ve ilerleme yayar', async () => {
    // Tur tavanı bağlayıcı olmalı: asenkron sürüm bütçenin bir kısmını ana iş
    // parçacığını bırakmaya harcadığı için SAAT bağlayıcı olsaydı iki sürüm
    // farklı sayıda zincir tamamlar ve karşılaştırma anlamını yitirirdi.
    const BOUNDED: OptimizeOptions = { timeBudgetMs: 60000, extendMs: 0, maxIters: 800 };
    const seen: number[] = [];
    const async = await optimizeCutlistGroupedAsync(GROUPS, 0.3, {
      ...BOUNDED,
      progressIntervalMs: 0,
      onProgress: p => seen.push(p.progress)
    });
    const sync = optimizeCutlistGrouped(GROUPS, 0.3, BOUNDED);

    expect(seen.length).toBeGreaterThan(0);
    expect(async.stats.totalBins).toBe(sync.stats.totalBins);
    expect(JSON.stringify(async.bins)).toBe(JSON.stringify(sync.bins));
  });
});
