/**
 * Ölçüt koşusu (test değil): v2 ↔ v3 karşılaştırması.
 *   npx vite-node __tests__/bench.packer.ts
 *
 * Sütunlar:
 *   v2      — eski motor (bench.v2ref.ts)
 *   v3-K    — yeni motor, YALNIZ kurulum portföyü (anneal: false)
 *   v3      — yeni motor, tam (portföy + tavlama)
 *   AS      — alan alt sınırı (bundan azına inmek fiziksel olarak imkânsız)
 */
import { optimizeCutlist, PartInput, StockInput, OptResult, isBinGuillotineCuttable } from '../domain/nesting/packer';
import { optimizeCutlistV2 } from './bench.v2ref';

interface Case { name: string; stocks: StockInput[]; parts: PartInput[]; kerf: number }

const SHEET = (count: number): StockInput[] => [{ id: 's', w: 210, h: 280, count }];

const CASES: Case[] = [
  {
    name: 'Mutfak 92 parça',
    stocks: SHEET(20), kerf: 0.3,
    parts: [
      { id: 'a', name: 'Yan', w: 75.2, h: 60, count: 16, rotatable: true },
      { id: 'b', name: 'Tabla', w: 80, h: 60, count: 8, rotatable: true },
      { id: 'c', name: 'Raf', w: 76.4, h: 58, count: 12, rotatable: true },
      { id: 'd', name: 'Kuşak', w: 76.4, h: 10, count: 16, rotatable: true },
      { id: 'e', name: 'Kapak', w: 39.7, h: 71.5, count: 16, rotatable: true },
      { id: 'f', name: 'Üst Yan', w: 92, h: 32, count: 12, rotatable: true },
      { id: 'g', name: 'Üst Tabla', w: 56.4, h: 32, count: 12, rotatable: true },
    ]
  },
  {
    name: 'Gardırop 60 (desen kilidi)',
    stocks: SHEET(20), kerf: 0.4,
    parts: [
      { id: 'a', name: 'Dikme', w: 58, h: 240, count: 8, rotatable: false },
      { id: 'b', name: 'Taban', w: 100, h: 58, count: 6, rotatable: false },
      { id: 'c', name: 'Raf', w: 98.2, h: 56, count: 20, rotatable: false },
      { id: 'd', name: 'Kapak', w: 49.5, h: 238, count: 8, rotatable: false },
      { id: 'e', name: 'Kuşak', w: 98.2, h: 12, count: 18, rotatable: false },
    ]
  },
  {
    name: 'Karışık küçük parça 150',
    stocks: SHEET(30), kerf: 0.3,
    parts: [
      { id: 'a', name: 'A', w: 32.5, h: 18.4, count: 40, rotatable: true },
      { id: 'b', name: 'B', w: 45.1, h: 45.1, count: 24, rotatable: true },
      { id: 'c', name: 'C', w: 70.3, h: 22.7, count: 30, rotatable: true },
      { id: 'd', name: 'D', w: 15, h: 96.8, count: 26, rotatable: true },
      { id: 'e', name: 'E', w: 120, h: 33.3, count: 18, rotatable: true },
      { id: 'f', name: 'F', w: 60, h: 60, count: 12, rotatable: true },
    ]
  },
  {
    name: 'Tek tip 20×(60×60)',
    stocks: SHEET(10), kerf: 0.3,
    parts: [{ id: 'p', name: 'X', w: 60, h: 60, count: 20, rotatable: true }]
  },
  {
    name: 'Uzun şeritler + dolgu',
    stocks: SHEET(15), kerf: 0.3,
    parts: [
      { id: 'a', name: 'Şerit', w: 205, h: 12, count: 22, rotatable: true },
      { id: 'b', name: 'Blok', w: 68.5, h: 68.5, count: 14, rotatable: true },
      { id: 'c', name: 'Dolgu', w: 33.2, h: 47.9, count: 30, rotatable: true },
    ]
  },
  {
    name: 'Banyo 3 dolap (küçük iş)',
    stocks: SHEET(6), kerf: 0.3,
    parts: [
      { id: 'a', name: 'Yan', w: 45, h: 80, count: 6, rotatable: true },
      { id: 'b', name: 'Tabla', w: 58.4, h: 45, count: 6, rotatable: true },
      { id: 'c', name: 'Kapak', w: 29.8, h: 78, count: 6, rotatable: true },
      { id: 'd', name: 'Raf', w: 56.4, h: 43, count: 3, rotatable: true },
    ]
  },
  {
    name: 'İki farklı levha ölçüsü',
    stocks: [{ id: 'big', w: 210, h: 280, count: 8 }, { id: 'sml', w: 183, h: 244, count: 8 }],
    kerf: 0.3,
    parts: [
      { id: 'a', name: 'Yan', w: 89.4, h: 61.2, count: 18, rotatable: true },
      { id: 'b', name: 'Kapak', w: 44.7, h: 118, count: 12, rotatable: true },
      { id: 'c', name: 'Raf', w: 87.6, h: 57.5, count: 16, rotatable: true },
      { id: 'd', name: 'Sırt', w: 26, h: 26, count: 24, rotatable: true },
    ]
  },
];

/* --- tohumlu rastgele iş üreteci: gerçek dağılımı temsil eden geniş örnek --- */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomCase(seed: number): Case {
  const rnd = mulberry32(seed);
  const types = 4 + ((rnd() * 6) | 0);
  const parts: PartInput[] = [];
  const rotatable = rnd() < 0.75;   // %25 desen kilidi
  for (let i = 0; i < types; i++) {
    const w = Math.round((12 + rnd() * 120) * 10) / 10;
    const h = Math.round((12 + rnd() * 150) * 10) / 10;
    const count = 2 + ((rnd() * 14) | 0);
    parts.push({ id: 'p' + i, name: 'P' + i, w, h, count, rotatable });
  }
  return { name: `rastgele #${seed}`, stocks: SHEET(60), parts, kerf: [0.2, 0.3, 0.4][(rnd() * 3) | 0] };
}

const totalMissing = (r: OptResult) => r.unplaced.reduce((a, u) => a + u.missing, 0);

function checkGeometry(r: OptResult, kerf: number): string | null {
  for (const bin of r.bins) {
    for (const p of bin.placed) {
      if (p.x < -1e-6 || p.y < -1e-6 || p.x + p.w > bin.w + 1e-6 || p.y + p.h > bin.h + 1e-6) return 'TAŞMA';
    }
    for (let i = 0; i < bin.placed.length; i++) {
      for (let j = i + 1; j < bin.placed.length; j++) {
        const a = bin.placed[i], b = bin.placed[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 1e-6 && oy > 1e-6) return 'ÇAKIŞMA';
        // Bıçak payı: iki parça EN AZ bir eksende kerf kadar ayrık olmalı,
        // yoksa testere ikisinden birini yer.
        if (ox > -kerf + 1e-6 && oy > -kerf + 1e-6) return `KERF İHLALİ (${ox.toFixed(2)},${oy.toFixed(2)})`;
      }
    }
    if (!isBinGuillotineCuttable(bin)) return 'GİYOTİN DEĞİL';
  }
  return null;
}

const pad = (s: string, n: number) => s.length >= n ? s : s + ' '.repeat(n - s.length);
const padL = (s: string, n: number) => s.length >= n ? s : ' '.repeat(n - s.length) + s;

const all: Case[] = [...CASES];
for (let s = 1; s <= 14; s++) all.push(randomCase(s * 7919));

console.log('');
console.log(
  pad('İŞ', 30) + padL('adet', 6) + padL('AS', 5) + padL('v2', 5) + padL('v3-K', 6) + padL('v3', 5) +
  padL('v2 fire%', 10) + padL('v3 fire%', 10) + padL('artık m²', 10) + padL('ms', 7) + padL('tur', 8) + '  denetim'
);
console.log('-'.repeat(118));

let binsV2 = 0, binsK = 0, binsV3 = 0, msV3total = 0;
let wasteV2 = 0, wasteV3 = 0, wcount = 0;
let problems = 0;

for (const c of all) {
  const pieces = c.parts.reduce((a, p) => a + p.count, 0);

  const v2 = optimizeCutlistV2(c.stocks, c.parts, c.kerf);
  const k = optimizeCutlist(c.stocks, c.parts, c.kerf, { anneal: false });

  const t3 = Date.now();
  const v3 = optimizeCutlist(c.stocks, c.parts, c.kerf);
  const ms = Date.now() - t3;
  msV3total += ms;

  binsV2 += v2.stats.totalBins;
  binsK += k.stats.totalBins;
  binsV3 += v3.stats.totalBins;
  if (totalMissing(v2) === 0 && totalMissing(v3) === 0) {
    wasteV2 += v2.stats.wastePercent; wasteV3 += v3.stats.wastePercent; wcount++;
  }

  const issues = [
    checkGeometry(v3, c.kerf),
    totalMissing(v3) > totalMissing(v2) ? 'EKSİK ARTTI' : null,
    // Tavlama hiçbir koşulda kurulumun altına düşürmemeli (leksikografik koruma)
    v3.stats.totalBins > k.stats.totalBins ? 'SA GERİLETTİ' : null,
    v3.stats.largestOffcutArea < k.stats.largestOffcutArea - 1e-6 && v3.stats.totalBins === k.stats.totalBins ? 'ARTIK KÜÇÜLDÜ' : null,
  ].filter(Boolean).join(' ');
  if (issues) problems++;

  console.log(
    pad(c.name, 30) +
    padL(String(pieces), 6) +
    padL(String(v3.stats.lowerBoundBins ?? 0), 5) +
    padL(String(v2.stats.totalBins), 5) +
    padL(String(k.stats.totalBins), 6) +
    padL(String(v3.stats.totalBins), 5) +
    padL(v2.stats.wastePercent.toFixed(1), 10) +
    padL(v3.stats.wastePercent.toFixed(1), 10) +
    padL((v3.stats.largestOffcutArea / 10000).toFixed(2), 10) +
    padL(String(ms), 7) +
    padL(String(v3.stats.annealIterations ?? 0), 8) +
    '  ' + (issues || 'OK')
  );
}

console.log('-'.repeat(118));
console.log(`TOPLAM PLAKA:  v2 = ${binsV2}   v3-kurulum = ${binsK}   v3-tam = ${binsV3}`);
console.log(`  v3 kazancı v2'ye göre: ${binsV3 - binsV2} plaka (${(((binsV2 - binsV3) / binsV2) * 100).toFixed(1)}% tasarruf)`);
console.log(`  tavlamanın payı:       ${binsV3 - binsK} plaka`);
console.log(`ORTALAMA FİRE: v2 = %${(wasteV2 / wcount).toFixed(2)}   v3 = %${(wasteV3 / wcount).toFixed(2)}`);
console.log(`TOPLAM v3 SÜRE: ${(msV3total / 1000).toFixed(1)} s / ${all.length} iş   ·   sorunlu iş: ${problems}`);
console.log('');
