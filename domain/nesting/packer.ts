/**
 * 2D giyotin kesim motoru — v3.
 *
 * Katman 0 — birim: çekirdek TAMSAYI MİLİMETRE ile çalışır (GP-01 var olamaz).
 * Katman 1 — yerleştirici: giyotin-uyumlu MaxRects. Klasik serbest MaxRects
 *            ÇAKIŞAN maksimal dikdörtgenler tutar; ürettiği boşluklar bıçakla
 *            baştan başa kesilemez. Burada boş alanlar AYRIK tutulur ve her
 *            yerleştirme L-artığını tek çizgiyle böler → kesim ağacı hep geçerli.
 *            Bölme kuralı SLAS (Shorter Leftover Axis Split), parça seçimi BAF
 *            (Best Area Fit), sıralama alana göre azalan — portföyün ilk sırası.
 * Katman 2 — çok-başlangıçlı portföy: sıralama × fit × split × birleştirme
 *            konfigürasyonları denenir (tek "maxside+BAF" aynı işte 1 tam plaka
 *            fazla harcatabiliyordu; BLSF %54.6 → %9.2 fire düşürmüştü).
 * Katman 3 — yerel arama: TAVLAMA BENZETİMİ (simulated annealing). Hamleler
 *            YERLEŞİMİN kendisi üzerinde değil, parçaların SIRASI üzerinde
 *            yapılır (relocate / swap / rotate); her aday sıra baştan çözülür.
 *            Böylece giyotin geçerliliği YAPI GEREĞİ korunur — "hamleyi yap,
 *            kesim ağacını denetle, bozulduysa geri al" döngüsünde harcanan
 *            tur olmaz. Boş-alan birleştirmesi açıkken teoride giyotin dışı bir
 *            yerleşim doğabileceğinden, GLOBAL EN İYİ adaya yazmadan önce
 *            isGuillotineLayout ile denetlenir ve geçersizse reddedilir:
 *            rapor edilen sonuç her koşulda bıçakla kesilebilir.
 * Katman 4 — leksikografik amaç: [sığmayan, plaka, −en büyük artık, fire].
 *
 * Belirlenirlik: PRNG tohumu girdiden türetilir, saatten değil. Sonucu bağlayan
 * kısıt TUR TAVANI olduğu sürece aynı girdi aynı planı verir. Bütçe küçükse ya
 * da makine yavaşsa bağlayan kısıt SAAT olur; o zaman tamamlanan zincir sayısı
 * değişebilir ve plan makineye göre oynayabilir — ama en iyi her zaman saklandığı
 * için sonuç hiçbir koşulda ilk zincirin altına DÜŞMEZ.
 *
 * API sınırında cm konuşulur (UI sözleşmesi), içeride mm.
 */
import { cmToMm, mmToCm } from '../units';
import { isGuillotineLayout } from './guillotine';

/* ================================================================== *
 * 1. Dış sözleşme (v2 ile birebir uyumlu)
 * ================================================================== */

export interface Rect { x: number, y: number, w: number, h: number }

/**
 * Fiziksel levha grubu (Kesim sekmesi): arkalık (8 mm) ve kapak parçaları
 * gövde levhasından değil, kendi levhalarından kesilir.
 */
export type SheetGroup = 'malzeme' | 'arkalik' | 'kapak';

/**
 * Kenar bandı — parçanın KENDİ (döndürülmemiş) Genişlik×Uzunluk dikdörtgenine
 * göre sabittir: top/bottom = Genişlik kenarları, left/right = Uzunluk kenarları.
 * Yalnız bilgi amaçlıdır, yerleştirme algoritmasını etkilemez.
 */
export interface EdgeBanding { top: boolean; right: boolean; bottom: boolean; left: boolean }

export interface PartInput {
  id: string;
  w: number;
  h: number;
  count: number;
  rotatable: boolean;
  name: string;
  /** Hangi levha grubundan kesilecek — yoksa 'malzeme' varsayılır (geriye dönük uyum) */
  sheetGroup?: SheetGroup;
  /** Bantlanacak kenarlar — yalnız bilgi amaçlı (D3) */
  edgeBanding?: EdgeBanding;
}

export interface StockInput { id: string; w: number; h: number; count: number }

export interface PlacedPart extends Rect {
  partId: string;
  name: string;
  rotated: boolean;
  originalW: number;
  originalH: number;
}

export interface PlacedBin {
  stockId: string;
  /** Bu plakanın ait olduğu levha grubu — yalnız optimizeCutlistGrouped etiketler */
  group?: SheetGroup;
  w: number;
  h: number;
  placed: PlacedPart[];
  /** Kullanılabilir artık alanlar (cm, kerf yaklaşımıyla plaka sınırına kırpılmış) */
  freeRects: Rect[];
  utilization: number;
}

export interface UnplacedInfo {
  part: PartInput;
  requested: number;
  placed: number;
  missing: number;
  reason: string;
}

export interface OptResult {
  bins: PlacedBin[];
  unplaced: UnplacedInfo[];
  stats: {
    totalArea: number;
    usedArea: number;
    wastePercent: number;
    totalBins: number;
    /** En büyük tek parça kullanılabilir artık (cm²) */
    largestOffcutArea: number;
    /** Tavlamada denenen aday sayısı (v3 — bilgi amaçlı) */
    annealIterations?: number;
    /** Aramanın toplam süresi, ms (v3 — bilgi amaçlı) */
    elapsedMs?: number;
    /** Alan alt sınırından hesaplanan teorik en az plaka sayısı (v3) */
    lowerBoundBins?: number;
  };
  strategy: string;
}

/* ================================================================== *
 * 2. Arama seçenekleri
 * ================================================================== */

/** Parça seçim (fit) kuralı — parçanın hangi boş alana oturtulacağı */
export type FitRule = 'BAF' | 'BSSF' | 'BLSF';

/**
 * L-artığını bölme kuralı.
 *  SLAS    — Shorter Leftover Axis Split (kısa artık ekseninden böl) · varsayılan
 *  LLAS    — Longer Leftover Axis Split
 *  SAS/LAS — boş alanın kendi kısa/uzun ekseninden böl
 *  MAXAREA — iki artıktan BÜYÜĞÜNÜ büyüt (v2'nin kuralı)
 *  MINAREA — artıkları birbirine yakın boyda tut
 */
export type SplitRule = 'SLAS' | 'LLAS' | 'SAS' | 'LAS' | 'MAXAREA' | 'MINAREA';

export interface OptimizeOptions {
  /** Toplam arama bütçesi, ms (varsayılan 8000). Yalnız ÜST SINIR. */
  timeBudgetMs?: number;
  /** Bütçe dolarken hâlâ iyileşme varsa bir kereye mahsus ek süre, ms (varsayılan 5000) */
  extendMs?: number;
  /** Tavlama yineleme tavanı — verilmezse parça sayısından türetilir */
  maxIters?: number;
  /** PRNG tohumu — verilmezse girdiden türetilir */
  seed?: number;
  /** false → yalnız çok-başlangıçlı kurulum çalışır (tavlama yok) */
  anneal?: boolean;
  /** Saat kaynağı (test edilebilirlik) */
  now?: () => number;
  /** true dönerse arama o ana kadarki en iyi sonuçla biter (UI "DURDUR") */
  shouldStop?: () => boolean;
}

export interface OptProgress {
  phase: 'construct' | 'anneal';
  /** 0..1 */
  progress: number;
  /** O ana kadarki en iyi çözümün plaka sayısı */
  bins: number;
  /** O ana kadarki en iyi çözümün fire yüzdesi */
  wastePercent: number;
  elapsedMs: number;
  iterations: number;
}

export interface AsyncOptimizeOptions extends OptimizeOptions {
  onProgress?: (p: OptProgress) => void;
  /** İlerleme bildirimi asgari aralığı, ms (varsayılan 100) */
  progressIntervalMs?: number;
}

const KERF_MAX_MM = 15;
const DEFAULT_TIME_BUDGET_MS = 8000;
const DEFAULT_EXTEND_MS = 5000;
/** Tavlama yineleme tavanı = parça başına bu kadar */
const ITERS_PER_ITEM = 600;
const MIN_ITERS = 3000;
const MAX_ITERS = 120000;
/** Kurulum portföyüne ayrılan bütçe payı */
const CONSTRUCT_BUDGET_SHARE = 0.35;
/** Kaç turda bir saat/ilerleme kontrolü (2'nin kuvveti olmalı).
 *  Küçük tutulur ki büyük işlerde tek iş parçası bloğu arayüzü takmasın. */
const CHECK_EVERY = 128;
/** Genişletilmiş stok listesi tavanı — bellek koruması */
const STOCK_PLAN_CAP = 2000;
/** Sığmayan parça cezası; plaka katsayısı 1 olduğundan her koşulda baskındır */
const MISSING_WEIGHT = 1000;
/** Tavlamanın taşıdığı kurulum tohumu sayısı (yeniden başlatmalar için) */
const SEED_POOL = 3;
/** Bu kadar art arda kısır yeniden ısıtmadan sonra zincir yakınsamış sayılır */
const MAX_BARREN_REHEATS = 4;
/** Bütçe içinde koşulacak azami tavlama zinciri (çok-başlangıçlı yeniden başlatma) */
const MAX_CHAINS = 12;
/** Asenkron sürümde ana iş parçacığı bu kadar ms'de bir bırakılır (~60 fps payı) */
const YIELD_SLICE_MS = 16;

/* ================================================================== *
 * 3. Belirlenirlik: tohumlu PRNG + girdi özeti
 * ================================================================== */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

const defaultNow = (): number =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();

/* ================================================================== *
 * 4. Çekirdek veri yapıları (hepsi mm)
 * ================================================================== */

interface MmRect { x: number; y: number; w: number; h: number }

interface MmPlaced extends MmRect {
  partId: string;
  name: string;
  rotated: boolean;
  originalW: number; // mm, kerf'siz
  originalH: number;
}

/** Tek fiziksel parça (adet açılmış hâli) */
interface Item {
  partId: string;
  name: string;
  w: number;      // mm, kerf'siz
  h: number;
  rotatable: boolean;
  area: number;
  /** Aynı ölçü+döndürülebilirlik imzası — anlamsız takasları elemek için */
  sig: number;
}

interface Config { fit: FitRule; split: SplitRule; merge: boolean }

interface BinState {
  stockId: string;
  /** Gerçek plaka ölçüsü (mm) */
  W: number;
  H: number;
  /** Şişirilmiş koordinat düzleminde AYRIK boş alanlar */
  free: MmRect[];
  /** Yalnız collect=true iken doldurulur */
  placed: MmPlaced[];
  count: number;
  /** Yerleşen parçaların GERÇEK alan toplamı (mm²) */
  usedArea: number;
  /** Şişirilmiş alan toplamı — dolu plakayı taramadan elemek için */
  usedInflated: number;
  inflatedArea: number;
}

interface Job {
  items: Item[];
  stockPlan: { id: string; w: number; h: number }[];
  kerfMm: number;
  requested: Map<string, number>;
  partById: Map<string, PartInput>;
  /** Hiçbir plaka ölçüsüne sığmayan parça id'leri */
  oversized: Set<string>;
  /** Bu grup için hiç plaka tanımlı değil */
  noStock: boolean;
  maxBinArea: number;
  lowerBoundBins: number;
  signature: string;
}

interface DecodeResult {
  bins: BinState[];
  placedCount: number;
}

interface Evaluation {
  dec: DecodeResult;
  energy: number;
  /** En az dolu aktif plakanın indeksi (-1 → aktif plaka yok) */
  worstBin: number;
  activeBins: number;
  wastePercent: number;
}

/* ================================================================== *
 * 5. Yerleştirme: fit skoru, bölme kuralı, boş alan birleştirme
 * ================================================================== */

// Sıcak döngüde dizi/nesne ayırmamak için modül düzeyinde skor tamponu.
let _s1 = 0;
let _s2 = 0;

function scoreFit(fit: FitRule, frW: number, frH: number, rw: number, rh: number): void {
  const dw = frW - rw;
  const dh = frH - rh;
  if (fit === 'BAF') {          // Best Area Fit — en küçük artık alan
    _s1 = frW * frH - rw * rh;
    _s2 = dw < dh ? dw : dh;
  } else if (fit === 'BSSF') {  // Best Short Side Fit
    _s1 = dw < dh ? dw : dh;
    _s2 = dw < dh ? dh : dw;
  } else {                      // BLSF — Best Long Side Fit
    _s1 = dw > dh ? dw : dh;
    _s2 = dw > dh ? dh : dw;
  }
}

/**
 * L-artığını TEK çizgiyle böler — giyotin geçerliliğinin kaynağı.
 * horiz=true → sağ artık parça yüksekliğinde, üst artık tam genişlikte.
 */
function splitFree(bin: BinState, idx: number, pw: number, ph: number, cfg: Config): void {
  const fr = bin.free[idx];
  const x = fr.x, y = fr.y, w = fr.w, h = fr.h;

  // splice yerine son elemanla takas — sıra yalnız eşitlik bozmada etkili
  const n = bin.free.length;
  const last = bin.free.pop() as MmRect;
  if (idx !== n - 1) bin.free[idx] = last;

  const dw = w - pw;
  const dh = h - ph;

  let horiz: boolean;
  switch (cfg.split) {
    case 'SLAS':    horiz = dw <= dh; break;
    case 'LLAS':    horiz = dw > dh; break;
    case 'SAS':     horiz = w <= h; break;
    case 'LAS':     horiz = w > h; break;
    case 'MAXAREA': horiz = pw * dh > dw * ph; break;
    default:        horiz = pw * dh <= dw * ph; break; // MINAREA
  }

  if (dw > 0) {
    bin.free.push(horiz ? { x: x + pw, y, w: dw, h: ph } : { x: x + pw, y, w: dw, h });
    if (cfg.merge) absorbInto(bin.free, bin.free.length - 1);
  }
  if (dh > 0) {
    bin.free.push(horiz ? { x, y: y + ph, w, h: dh } : { x, y: y + ph, w: pw, h: dh });
    if (cfg.merge) absorbInto(bin.free, bin.free.length - 1);
  }
}

/**
 * Verilen boş alanı, kendisiyle TAM DİKDÖRTGEN oluşturan komşularını ardışık
 * yutarak büyütür. Bölmelerin ürettiği yapay parçalanmayı geri alır; hem büyük
 * parçaların yerleşmesi hem de ARTIK raporundaki tek parça artık için belirleyici.
 */
function absorbInto(free: MmRect[], idx: number): void {
  for (;;) {
    const a = free[idx];
    let hit = -1;
    for (let j = 0; j < free.length; j++) {
      if (j === idx) continue;
      const b = free[j];
      if (a.x === b.x && a.w === b.w) {
        if (a.y + a.h === b.y) { a.h += b.h; hit = j; break; }
        if (b.y + b.h === a.y) { a.y = b.y; a.h += b.h; hit = j; break; }
      } else if (a.y === b.y && a.h === b.h) {
        if (a.x + a.w === b.x) { a.w += b.w; hit = j; break; }
        if (b.x + b.w === a.x) { a.x = b.x; a.w += b.w; hit = j; break; }
      }
    }
    if (hit < 0) return;
    const n = free.length;
    const last = free.pop() as MmRect;
    if (hit !== n - 1) free[hit] = last;
    if (idx === n - 1) idx = hit; // a son elemandı, hit konumuna taşındı
  }
}

/**
 * orientMode: 0 = serbest (paketleyici seçer), 1 = olduğu gibi zorla, 2 = 90° zorla.
 * Kerf hilesi: hem plaka hem parça kerf kadar şişirilir —
 * n·w + (n−1)·kerf ≤ W kısıtını birebir üretir. Döndürme her iki yönde de
 * kerf'i hesaba katar (şişirme yön değişiminden önce uygulanır).
 */
function tryInsert(
  bin: BinState,
  it: Item,
  orientMode: number,
  kerfMm: number,
  cfg: Config,
  collect: boolean
): boolean {
  const aW = it.w + kerfMm, aH = it.h + kerfMm;   // 0°
  const bW = it.h + kerfMm, bH = it.w + kerfMm;   // 90°

  const canRot = it.rotatable && it.w !== it.h;
  const allowA = !(canRot && orientMode === 2);
  const allowB = canRot && orientMode !== 1;

  // Dolu plakayı hiç taramadan ele: toplam boş alan gerekenden azsa sığamaz.
  // (Bölme L'yi tam örttüğü için toplam boş alan = plaka − yerleşen, kesin.)
  if (bin.inflatedArea - bin.usedInflated < aW * aH) return false;

  let bestIdx = -1;
  let best1 = Infinity;
  let best2 = Infinity;
  let bestRot = false;

  const free = bin.free;
  for (let i = 0; i < free.length; i++) {
    const fr = free[i];
    if (allowA && aW <= fr.w && aH <= fr.h) {
      scoreFit(cfg.fit, fr.w, fr.h, aW, aH);
      if (_s1 < best1 || (_s1 === best1 && _s2 < best2)) {
        best1 = _s1; best2 = _s2; bestIdx = i; bestRot = false;
      }
    }
    if (allowB && bW <= fr.w && bH <= fr.h) {
      scoreFit(cfg.fit, fr.w, fr.h, bW, bH);
      if (_s1 < best1 || (_s1 === best1 && _s2 < best2)) {
        best1 = _s1; best2 = _s2; bestIdx = i; bestRot = true;
      }
    }
  }

  if (bestIdx === -1) return false;

  const fr = free[bestIdx];
  const pw = bestRot ? bW : aW;
  const ph = bestRot ? bH : aH;

  if (collect) {
    bin.placed.push({
      x: fr.x, y: fr.y,
      w: bestRot ? it.h : it.w,
      h: bestRot ? it.w : it.h,
      partId: it.partId,
      name: it.name,
      rotated: bestRot,
      originalW: bestRot ? it.h : it.w,
      originalH: bestRot ? it.w : it.h
    });
  }
  bin.count++;
  bin.usedArea += it.area;
  bin.usedInflated += pw * ph;
  splitFree(bin, bestIdx, pw, ph, cfg);
  return true;
}

/* ================================================================== *
 * 6. Çözücü (decoder): sıra + yön → yerleşim
 * ================================================================== */

function decode(
  job: Job,
  order: Int32Array,
  orient: Uint8Array,
  cfg: Config,
  binOf: Int32Array | null,
  collect: boolean
): DecodeResult {
  const bins: BinState[] = [];
  const k = job.kerfMm;
  const plan = job.stockPlan;
  let nextStock = 0;
  let placedCount = 0;

  for (let s = 0; s < order.length; s++) {
    const idx = order[s];
    const it = job.items[idx];
    const om = orient[idx];
    let target = -1;

    for (let b = 0; b < bins.length; b++) {
      if (tryInsert(bins[b], it, om, k, cfg, collect)) { target = b; break; }
    }

    // Açık plakalara sığmadı → sıradaki stoktan yeni plaka aç. Tembel açılım
    // tüm stoğu baştan açmakla BİREBİR aynı ilk-uyan sırasını verir, ucuzdur.
    while (target < 0 && nextStock < plan.length) {
      const st = plan[nextStock++];
      const nb: BinState = {
        stockId: st.id,
        W: st.w, H: st.h,
        free: [{ x: 0, y: 0, w: st.w + k, h: st.h + k }],
        placed: [],
        count: 0,
        usedArea: 0,
        usedInflated: 0,
        inflatedArea: (st.w + k) * (st.h + k)
      };
      bins.push(nb);
      if (tryInsert(nb, it, om, k, cfg, collect)) target = bins.length - 1;
    }

    if (target >= 0) placedCount++;
    if (binOf) binOf[s] = target;
  }

  return { bins, placedCount };
}

/**
 * Enerji (küçük olan iyi):
 *   MISSING_WEIGHT·sığmayan + aktif plaka
 *   + 0.60·(en boş plakanın doluluğu)
 *   − 0.35·(doluluk yoğunlaşması)
 *   − 0.05·(en büyük artık / plaka alanı)
 *
 * Neden düz "kullanılan alan / toplam alan" değil: parça kümesi sabitken
 * kullanılan alan da sabittir, dolayısıyla doluluk oranı YALNIZ plaka sayısına
 * bağlıdır — aynı plaka sayısındaki bütün çözümler eşit puan alır ve tavlama
 * düz zeminde rastgele yürür. En boş plakayı boşaltmaya ve doluluğu birkaç
 * plakada toplamaya iten terimler o zemine eğim verir; ondalık terimlerin
 * toplamı 1'i geçmediği için plaka sayısı her koşulda baskın kalır.
 */
function evaluate(
  job: Job,
  order: Int32Array,
  orient: Uint8Array,
  cfg: Config,
  binOf: Int32Array | null,
  collect: boolean
): Evaluation {
  const dec = decode(job, order, orient, cfg, binOf, collect);

  let active = 0;
  let minFill = 1;
  let sumSq = 0;
  let largestOffcut = 0;
  let worstBin = -1;
  let totalArea = 0;
  let usedTotal = 0;

  for (let i = 0; i < dec.bins.length; i++) {
    const b = dec.bins[i];
    if (b.count === 0) continue;
    active++;
    const binArea = b.W * b.H;
    totalArea += binArea;
    usedTotal += b.usedArea;
    const fill = b.usedArea / binArea;
    if (fill < minFill) { minFill = fill; worstBin = i; }
    sumSq += fill * fill;
    for (const fr of b.free) {
      const w = fr.w < b.W - fr.x ? fr.w : b.W - fr.x;
      const h = fr.h < b.H - fr.y ? fr.h : b.H - fr.y;
      if (w > 0 && h > 0 && w * h > largestOffcut) largestOffcut = w * h;
    }
  }

  const missing = job.items.length - dec.placedCount;
  let energy = MISSING_WEIGHT * missing + active;
  if (active > 0) {
    energy += 0.60 * minFill
            - 0.35 * (sumSq / active)
            - 0.05 * (job.maxBinArea > 0 ? largestOffcut / job.maxBinArea : 0);
  }

  return {
    dec,
    energy,
    worstBin,
    activeBins: active,
    wastePercent: totalArea > 0 ? ((totalArea - usedTotal) / totalArea) * 100 : 0
  };
}

/* ================================================================== *
 * 7. Sonuç üretimi ve karşılaştırma
 * ================================================================== */

function buildResult(job: Job, dec: DecodeResult, strategy: string): OptResult {
  let totalArea = 0;
  let usedArea = 0;
  let activeBins = 0;
  let largestOffcut = 0;
  const resultBins: PlacedBin[] = [];
  const placedCount = new Map<string, number>();

  for (const g of dec.bins) {
    if (g.count === 0) continue;
    activeBins++;
    const binArea = g.W * g.H;
    totalArea += binArea;
    usedArea += g.usedArea;

    const finalPlaced: PlacedPart[] = g.placed.map(p => {
      placedCount.set(p.partId, (placedCount.get(p.partId) || 0) + 1);
      return {
        x: mmToCm(p.x),
        y: mmToCm(p.y),
        w: mmToCm(p.originalW),
        h: mmToCm(p.originalH),
        partId: p.partId,
        name: p.name,
        rotated: p.rotated,
        originalW: mmToCm(p.originalW),
        originalH: mmToCm(p.originalH)
      };
    });

    const freeRects: Rect[] = [];
    for (const fr of g.free) {
      const w = Math.min(fr.w, g.W - fr.x);
      const h = Math.min(fr.h, g.H - fr.y);
      if (w > 0 && h > 0) {
        if (w * h > largestOffcut) largestOffcut = w * h;
        freeRects.push({ x: mmToCm(fr.x), y: mmToCm(fr.y), w: mmToCm(w), h: mmToCm(h) });
      }
    }

    resultBins.push({
      stockId: g.stockId,
      w: mmToCm(g.W),
      h: mmToCm(g.H),
      placed: finalPlaced,
      freeRects,
      utilization: (g.usedArea / binArea) * 100
    });
  }

  const unplaced: UnplacedInfo[] = [];
  for (const [id, requested] of job.requested) {
    const done = placedCount.get(id) || 0;
    if (done < requested) {
      const origPart = job.partById.get(id);
      if (origPart) {
        unplaced.push({
          part: origPart,
          requested,
          placed: done,
          missing: requested - done,
          reason: job.noStock
            ? 'Bu grup için plaka tanımlı değil'
            : job.oversized.has(id)
              ? 'Parça hiçbir plaka ölçüsüne sığmıyor'
              : 'Plakalara sığmadı'
        });
      }
    }
  }

  return {
    bins: resultBins,
    unplaced,
    stats: {
      totalArea: totalArea / 100,   // mm² → cm²
      usedArea: usedArea / 100,
      wastePercent: totalArea > 0 ? ((totalArea - usedArea) / totalArea) * 100 : 0,
      totalBins: activeBins,
      largestOffcutArea: largestOffcut / 100,
      lowerBoundBins: job.lowerBoundBins
    },
    strategy
  };
}

/** Rapor edilecek yerleşimin gerçekten bıçakla kesilebildiğini doğrular. */
function decodeIsGuillotine(dec: DecodeResult): boolean {
  for (const b of dec.bins) {
    if (b.count === 0) continue;
    if (!isGuillotineLayout({ x: 0, y: 0, w: b.W, h: b.H }, b.placed)) return false;
  }
  return true;
}

/** Dışarıdan tek plakanın kesilebilirliğini denetlemek için (testler/teşhis). */
export function isBinGuillotineCuttable(bin: PlacedBin): boolean {
  const parts = bin.placed.map(p => ({
    x: cmToMm(p.x), y: cmToMm(p.y), w: cmToMm(p.w), h: cmToMm(p.h)
  }));
  return isGuillotineLayout({ x: 0, y: 0, w: cmToMm(bin.w), h: cmToMm(bin.h) }, parts);
}

// Leksikografik amaç (rapor §9.4): yalnız fire yüzdesi yanlış seçim yaptırır
// (ölçüm: %41.7 fire = 5 plaka, %49.0 fire = 2 plaka). Sıra:
// [sığmayan adet, plaka sayısı, −en büyük artık, fire]
function isBetter(a: OptResult, b: OptResult): boolean {
  const missA = a.unplaced.reduce((acc, u) => acc + u.missing, 0);
  const missB = b.unplaced.reduce((acc, u) => acc + u.missing, 0);
  if (missA !== missB) return missA < missB;
  if (a.stats.totalBins !== b.stats.totalBins) return a.stats.totalBins < b.stats.totalBins;
  if (a.stats.largestOffcutArea !== b.stats.largestOffcutArea) {
    return a.stats.largestOffcutArea > b.stats.largestOffcutArea;
  }
  return a.stats.wastePercent < b.stats.wastePercent;
}

/* ================================================================== *
 * 8. İş hazırlığı
 * ================================================================== */

function buildJob(stocks: StockInput[], parts: PartInput[], kerfCm: number): Job {
  let kerfMm = cmToMm(kerfCm);
  if (!Number.isFinite(kerfMm) || kerfMm < 0) kerfMm = 0;
  if (kerfMm > KERF_MAX_MM) kerfMm = KERF_MAX_MM;

  const stockPlan: { id: string; w: number; h: number }[] = [];
  const distinct: { w: number; h: number }[] = [];
  const sigParts: string[] = [];

  for (const s of stocks) {
    const w = cmToMm(s.w);
    const h = cmToMm(s.h);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0 || s.count <= 0) continue;
    if (!distinct.some(d => d.w === w && d.h === h)) distinct.push({ w, h });
    const want = Math.max(0, Math.floor(s.count));
    const room = STOCK_PLAN_CAP - stockPlan.length;
    const n = want < room ? want : room;
    for (let i = 0; i < n; i++) stockPlan.push({ id: s.id, w, h });
    sigParts.push(`S${w}:${h}:${n}`);
    if (stockPlan.length >= STOCK_PLAN_CAP) break;
  }

  const items: Item[] = [];
  const requested = new Map<string, number>();
  const partById = new Map<string, PartInput>();
  const oversized = new Set<string>();
  const sigOf = new Map<string, number>();

  for (const p of parts) {
    const w = cmToMm(p.w);
    const h = cmToMm(p.h);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0 || p.count <= 0) continue;
    requested.set(p.id, p.count);
    partById.set(p.id, p);
    sigParts.push(`P${w}:${h}:${p.count}:${p.rotatable ? 1 : 0}`);

    const fits = distinct.some(d => (w <= d.w && h <= d.h) || (p.rotatable && h <= d.w && w <= d.h));
    if (!fits) { oversized.add(p.id); continue; }

    const key = `${w}x${h}x${p.rotatable ? 1 : 0}`;
    let sig = sigOf.get(key);
    if (sig === undefined) { sig = sigOf.size; sigOf.set(key, sig); }

    const count = Math.max(0, Math.floor(p.count));
    for (let i = 0; i < count; i++) {
      items.push({ partId: p.id, name: p.name, w, h, rotatable: p.rotatable, area: w * h, sig });
    }
  }

  let maxBinArea = 0;
  let maxInflated = 0;
  for (const d of distinct) {
    const a = d.w * d.h;
    if (a > maxBinArea) maxBinArea = a;
    const inf = (d.w + kerfMm) * (d.h + kerfMm);
    if (inf > maxInflated) maxInflated = inf;
  }

  let sumInflated = 0;
  for (const it of items) sumInflated += (it.w + kerfMm) * (it.h + kerfMm);
  const lowerBoundBins = maxInflated > 0 ? Math.ceil(sumInflated / maxInflated) : 0;

  return {
    items,
    stockPlan,
    kerfMm,
    requested,
    partById,
    oversized,
    noStock: distinct.length === 0,
    maxBinArea,
    lowerBoundBins,
    signature: `k${kerfMm}|${sigParts.join(',')}`
  };
}

/* ================================================================== *
 * 9. Katman 2 — çok-başlangıçlı kurulum portföyü
 * ================================================================== */

const SORT_KEYS = ['area', 'maxside', 'height', 'width', 'perim', 'minside'] as const;
type SortKey = typeof SORT_KEYS[number];

const SORT_CMP: Record<SortKey, (a: Item, b: Item) => number> = {
  area:    (a, b) => b.area - a.area || Math.max(b.w, b.h) - Math.max(a.w, a.h),
  maxside: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.area - a.area,
  height:  (a, b) => b.h - a.h || b.area - a.area,
  width:   (a, b) => b.w - a.w || b.area - a.area,
  perim:   (a, b) => (b.w + b.h) - (a.w + a.h) || b.area - a.area,
  minside: (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) || b.area - a.area,
};

// İlk sıra bilerek: alan-azalan + BAF + SLAS + birleştirme (istenen temel kurulum).
const FIT_RULES: FitRule[] = ['BAF', 'BSSF', 'BLSF'];
const SPLIT_RULES: SplitRule[] = ['SLAS', 'MAXAREA', 'LLAS', 'MINAREA', 'SAS', 'LAS'];

/** Çok büyük işlerde portföy daraltılır — bütçe tavlamaya kalsın */
const BIG_JOB_ITEMS = 240;

function orderBy(items: Item[], key: SortKey): Int32Array {
  const idx: number[] = [];
  for (let i = 0; i < items.length; i++) idx.push(i);
  const cmp = SORT_CMP[key];
  // Eşitlikte indeks kırar → motorun sıralama kararlılığından bağımsız belirlenir
  idx.sort((x, y) => cmp(items[x], items[y]) || (x - y));
  return Int32Array.from(idx);
}

interface Seed {
  order: Int32Array;
  orient: Uint8Array;
  cfg: Config;
  energy: number;
  label: string;
}

const cfgLabel = (key: SortKey, cfg: Config) =>
  `${key}+${cfg.fit}+${cfg.split}${cfg.merge ? '+M' : ''}`;

interface Clock {
  now: () => number;
  start: number;
  /** Uzatmayla birlikte kayabilir */
  deadline: number;
  /** BAŞLANGIÇTAKİ bütçe — ilerleme paydası; uzatma bunu değiştirmez ki
   *  ilerleme çubuğu geri sarmasın */
  span: number;
}

function* construct(
  job: Job,
  clock: Clock,
  budgetMs: number
): Generator<OptProgress, { seeds: Seed[]; safeSeed: Seed | null }, void> {
  const big = job.items.length > BIG_JOB_ITEMS;
  const sortKeys = big ? SORT_KEYS.slice(0, 3) : SORT_KEYS;
  const splitRules = big ? (['SLAS', 'MAXAREA', 'LLAS'] as SplitRule[]) : SPLIT_RULES;

  const orient = new Uint8Array(job.items.length); // hepsi 0 = serbest yön
  const seeds: Seed[] = [];
  let safeSeed: Seed | null = null;               // birleştirmesiz → yapısı gereği giyotin

  const constructDeadline = clock.start + budgetMs * CONSTRUCT_BUDGET_SHARE;
  const total = sortKeys.length * splitRules.length * FIT_RULES.length * 2;
  let done = 0;
  let bestSoFar = Infinity;
  let bestBins = 0;
  let bestWaste = 0;

  for (const key of sortKeys) {
    const base = orderBy(job.items, key);
    for (const fit of FIT_RULES) {
      for (const split of splitRules) {
        for (const merge of [true, false]) {
          const cfg: Config = { fit, split, merge };
          const ev = evaluate(job, base, orient, cfg, null, false);
          done++;

          const seed: Seed = {
            order: base,           // sıra bu konfigürasyonda değişmez, paylaşılabilir
            orient,
            cfg,
            energy: ev.energy,
            label: cfgLabel(key, cfg)
          };

          if (ev.energy < bestSoFar) {
            bestSoFar = ev.energy;
            bestBins = ev.activeBins;
            bestWaste = ev.wastePercent;
          }
          if (!merge && (safeSeed === null || ev.energy < safeSeed.energy)) safeSeed = seed;

          // top-K havuzu
          let at = seeds.length;
          while (at > 0 && seeds[at - 1].energy > seed.energy) at--;
          if (at < SEED_POOL) {
            seeds.splice(at, 0, seed);
            if (seeds.length > SEED_POOL) seeds.length = SEED_POOL;
          }

          if ((done & 7) === 0) {
            const t = clock.now();
            yield {
              phase: 'construct',
              progress: 0.15 * (done / total),
              bins: bestBins,
              wastePercent: bestWaste,
              elapsedMs: t - clock.start,
              iterations: 0
            };
            if (t >= constructDeadline && seeds.length > 0) {
              return { seeds, safeSeed };
            }
          }
        }
      }
    }
  }

  return { seeds, safeSeed };
}

/* ================================================================== *
 * 10. Katman 3 — tavlama benzetimi (dizi kodlaması)
 * ================================================================== */

interface BestState {
  order: Int32Array;
  orient: Uint8Array;
  cfg: Config;
  energy: number;
  label: string;
}

/** order[from] elemanını to konumuna taşır (aradakiler kayar). */
function relocate(order: Int32Array, from: number, to: number): void {
  const v = order[from];
  if (from < to) {
    for (let i = from; i < to; i++) order[i] = order[i + 1];
  } else {
    for (let i = from; i > to; i--) order[i] = order[i - 1];
  }
  order[to] = v;
}

function collectPositions(binOf: Int32Array, bin: number): number[] {
  const out: number[] = [];
  if (bin < 0) return out;
  for (let i = 0; i < binOf.length; i++) if (binOf[i] === bin) out.push(i);
  return out;
}

interface AnnealOutcome { best: BestState; iterations: number; improvements: number }

interface AnnealArgs {
  maxIters: number;
  seed: number;
  shouldStop?: () => boolean;
  /** Zincirin başlayacağı durum */
  start: BestState;
  /** Önceki zincirlerde harcanan tur — ilerleme sayacı zincir başında geri sayamaz */
  iterBase: number;
}

function* anneal(
  job: Job,
  seeds: Seed[],
  args: AnnealArgs,
  clock: Clock
): Generator<OptProgress, AnnealOutcome, void> {
  const n = job.items.length;
  const rnd = mulberry32(args.seed ^ 0x9e3779b9);
  const maxIters = args.maxIters;

  let cfg = args.start.cfg;
  const order = Int32Array.from(args.start.order);
  const orient = Uint8Array.from(args.start.orient);
  const orderBackup = new Int32Array(n);   // ruin hamlesinin geri alması için

  let binOfCur = new Int32Array(n);
  let binOfTry = new Int32Array(n);

  let cur = evaluate(job, order, orient, cfg, binOfCur, false);

  const best: BestState = {
    order: Int32Array.from(order),
    orient: Uint8Array.from(orient),
    cfg,
    energy: cur.energy,
    label: args.start.label
  };
  let bestBins = cur.activeBins;
  let bestWaste = cur.wastePercent;
  let bestMissing = n - cur.dec.placedCount;

  let worstPos = collectPositions(binOfCur, cur.worstBin);
  const anyRotatable = job.items.some(it => it.rotatable && it.w !== it.h);

  // --- hamle üreteci -------------------------------------------------
  let mvKind = 0, mvA = 0, mvB = 0, mvPrev = 0;

  const pickPos = (): number => {
    if (worstPos.length > 0 && rnd() < 0.65) {
      const i = (rnd() * worstPos.length) | 0;
      return worstPos[i < worstPos.length ? i : worstPos.length - 1];
    }
    const i = (rnd() * n) | 0;
    return i < n ? i : n - 1;
  };

  const pickAny = (): number => {
    const i = (rnd() * n) | 0;
    return i < n ? i : n - 1;
  };

  /** Öne ağırlıklı konum — ilk-uyan çözücüde öne gelen parça DOLU plakaya düşer */
  const pickFront = (): number => {
    const i = (rnd() * rnd() * n) | 0;
    return i < n ? i : n - 1;
  };

  /**
   * Ruin & recreate: EN BOŞ plakadaki parçaları diziden söküp öne serpiştirir.
   * Tek parçalık relocate/swap, plaka sayısını düşürmek için çoğu zaman yetmez
   * (bir parçayı taşımak yerine geleni sürer, plaka yine açık kalır); bir
   * plakayı bir hamlede boşaltma şansı asıl bu operatörden gelir.
   */
  const ruin = (): boolean => {
    const m = worstPos.length;
    if (m === 0 || m >= n) return false;
    orderBackup.set(order);
    mvKind = 3;

    const victims: number[] = new Array(m);
    for (let i = 0; i < m; i++) victims[i] = order[worstPos[i]];

    // kalanları sıkıştır (worstPos artan sıralı)
    let k = 0, vi = 0;
    for (let i = 0; i < n; i++) {
      if (vi < m && worstPos[vi] === i) { vi++; continue; }
      order[k++] = order[i];
    }
    // kurbanları öne ağırlıklı rastgele noktalara geri serp
    for (let i = 0; i < m; i++) {
      let pos = (rnd() * rnd() * (k + 1)) | 0;
      if (pos > k) pos = k;
      for (let j = k; j > pos; j--) order[j] = order[j - 1];
      order[pos] = victims[i];
      k++;
    }
    return true;
  };

  /** false → anlamsız hamle (yerleşimi değiştirmez), tur boşa gitsin istemeyiz */
  const applyMove = (): boolean => {
    const r = rnd();

    if (anyRotatable && r < 0.12) {
      const pos = pickPos();
      const item = order[pos];
      const it = job.items[item];
      if (!it.rotatable || it.w === it.h) return false;
      mvKind = 2; mvA = item; mvPrev = orient[item];
      orient[item] = (mvPrev + 1) % 3;
      return true;
    }

    if (r < 0.25) return ruin();

    const a = pickPos();
    const b = rnd() < 0.5 ? pickFront() : pickAny();
    if (a === b) return false;

    if (r < 0.65) {                       // relocate
      mvKind = 0; mvA = a; mvB = b;
      relocate(order, a, b);
      return true;
    }

    // swap — aynı ölçü ve aynı yön kilidindeki iki parçanın takası yerleşimi değiştirmez
    if (job.items[order[a]].sig === job.items[order[b]].sig &&
        orient[order[a]] === orient[order[b]]) return false;
    mvKind = 1; mvA = a; mvB = b;
    const t = order[a]; order[a] = order[b]; order[b] = t;
    return true;
  };

  const revertMove = (): void => {
    if (mvKind === 3) { order.set(orderBackup); return; }
    if (mvKind === 2) { orient[mvA] = mvPrev; return; }
    if (mvKind === 0) { relocate(order, mvB, mvA); return; }
    const t = order[mvA]; order[mvA] = order[mvB]; order[mvB] = t;
  };

  // --- T0 kalibrasyonu: yokuş-yukarı ΔE'lerin ORTANCASINDAN, ~%50 kabulle ---
  // Ortalama değil ortanca: sığmayan parça cezası (MISSING_WEIGHT) tek bir
  // örnekte bile ortalamayı uçurur ve tavlama baştan rastgele yürüyüşe döner.
  const ups: number[] = [];
  for (let i = 0; i < 128; i++) {
    if (!applyMove()) continue;
    const d = evaluate(job, order, orient, cfg, null, false).energy - cur.energy;
    if (d > 0) ups.push(d);
    revertMove();
  }
  ups.sort((x, y) => x - y);
  let t0 = ups.length > 0 ? ups[ups.length >> 1] / Math.LN2 : 0.02;
  t0 = clamp(t0, 1e-4, 5);
  const tEnd = t0 * 1e-3;
  const alpha = Math.pow(tEnd / t0, 1 / (maxIters > 1 ? maxIters : 1));
  let T = t0;

  // --- ana döngü ------------------------------------------------------
  const stagCap = Math.max(500, Math.floor(maxIters / 10));
  let sinceImprove = 0;
  let reheats = 0;
  let barrenReheats = 0;   // art arda hiç kazanç getirmeyen yeniden ısıtma sayısı
  let iterations = 0;
  let improvements = 0;

  for (let iter = 0; iter < maxIters; iter++) {
    if ((iter & (CHECK_EVERY - 1)) === 0) {
      const t = clock.now();
      if (args.shouldStop && args.shouldStop()) break;
      if (t >= clock.deadline) break;   // süre uzatma kararı zincir döngüsünde
      // İlerleme tur sayısına değil GEÇEN SÜREYE bağlı: çok zincirli aramada
      // her zincir turu sıfırlıyor, tur tabanlı ilerleme çubuğu geri sarıyordu.
      const spent = clock.span > 0 ? (t - clock.start) / clock.span : 1;
      yield {
        phase: 'anneal',
        progress: 0.15 + 0.85 * clamp(spent, 0, 1),
        bins: bestBins,
        wastePercent: bestWaste,
        elapsedMs: t - clock.start,
        iterations: args.iterBase + iter
      };
    }

    // Alt sınıra ulaştıysak ve bir süre cilaladıysak devam etmenin anlamı yok
    if (bestMissing === 0 && bestBins > 0 && bestBins <= job.lowerBoundBins &&
        iter > maxIters * 0.25) {
      break;
    }

    T *= alpha;
    sinceImprove++;
    iterations++;

    if (!applyMove()) continue;

    const trial = evaluate(job, order, orient, cfg, binOfTry, false);
    const d = trial.energy - cur.energy;

    if (d > 0 && rnd() >= Math.exp(-d / T)) { revertMove(); continue; }

    cur = trial;
    const swap = binOfCur; binOfCur = binOfTry; binOfTry = swap;
    worstPos = collectPositions(binOfCur, cur.worstBin);

    if (cur.energy < best.energy - 1e-12) {
      // Birleştirme açıkken giyotin dışı bir yerleşim TEORİK olarak doğabilir;
      // global en iyiye ancak kesim ağacı denetiminden geçen aday yazılır.
      const ok = !cfg.merge ||
        decodeIsGuillotine(evaluate(job, order, orient, cfg, null, true).dec);
      if (ok) {
        best.order.set(order);
        best.orient.set(orient);
        best.cfg = cfg;
        best.energy = cur.energy;
        bestBins = cur.activeBins;
        bestWaste = cur.wastePercent;
        bestMissing = n - cur.dec.placedCount;
        sinceImprove = 0;
        barrenReheats = 0;
        improvements++;
      }
    }

    if (sinceImprove >= stagCap) {
      // Arka arkaya kısır ısıtmalar: arama yakınsadı, bütçeyi tüketmenin anlamı yok
      if (++barrenReheats > MAX_BARREN_REHEATS) break;
      sinceImprove = 0;
      reheats++;
      // Çoğu kez en iyiye dön; arada bir farklı kurulum tohumuna atla
      if (reheats % 3 === 0 && seeds.length > 1) {
        const s = seeds[reheats % seeds.length];
        order.set(s.order); orient.set(s.orient); cfg = s.cfg;
      } else {
        order.set(best.order); orient.set(best.orient); cfg = best.cfg;
      }
      cur = evaluate(job, order, orient, cfg, binOfCur, false);
      worstPos = collectPositions(binOfCur, cur.worstBin);
      T = t0 * 0.35;
    }
  }

  return { best, iterations, improvements };
}

/* ================================================================== *
 * 11. Sürücü (tekil grup)
 * ================================================================== */

function* optimizeIter(
  stocks: StockInput[],
  parts: PartInput[],
  kerfCm: number,
  options: OptimizeOptions
): Generator<OptProgress, OptResult, void> {
  const now = options.now ?? defaultNow;
  const start = now();
  const budget = Math.max(0, options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const extendMs = Math.max(0, options.extendMs ?? DEFAULT_EXTEND_MS);

  const job = buildJob(stocks, parts, kerfCm);
  const clock: Clock = { now, start, deadline: start + budget, span: budget };

  if (job.items.length === 0 || job.stockPlan.length === 0) {
    const empty = buildResult(job, { bins: [], placedCount: 0 }, 'empty');
    empty.stats.elapsedMs = now() - start;
    empty.stats.annealIterations = 0;
    return empty;
  }

  const seedNum = options.seed ?? fnv1a(job.signature);

  // --- Katman 2: kurulum portföyü ---
  const { seeds, safeSeed } = yield* construct(job, clock, budget);

  const candidates: Seed[] = [...seeds];
  if (safeSeed && !candidates.includes(safeSeed)) candidates.push(safeSeed);

  let best: OptResult | null = null;
  for (const s of candidates) {
    const dec = evaluate(job, s.order, s.orient, s.cfg, null, true).dec;
    if (s.cfg.merge && !decodeIsGuillotine(dec)) continue;   // kesilemez → aday değil
    const r = buildResult(job, dec, s.label);
    if (best === null || isBetter(r, best)) best = r;
  }
  if (best === null) {
    // Tüm birleştirmeli adaylar elenmişse birleştirmesiz kurulum her koşulda geçerlidir
    const fb = safeSeed ?? seeds[0];
    best = buildResult(job, evaluate(job, fb.order, fb.orient, fb.cfg, null, true).dec, fb.label);
  }

  // --- Katman 3: tavlama, ÇOK ZİNCİRLİ ---
  // Tek uzun zincir bütçenin çoğunu boşa harcıyordu: tipik iş 0.5 sn'de yakınsayıp
  // duruyor, kalan 7 sn kullanılmıyordu. Bunun yerine bütçe bitene kadar birbirinden
  // FARKLI başlangıçlardan kısa zincirler koşulur (kimi kurulum tohumundan, kimi o
  // ana kadarki en iyiden). Çeşitlilik, aynı süreyi tek zincire vermekten daha çok
  // yerel optimum kırar; en iyi her zaman zincirler arasında saklandığı için sonuç
  // hiçbir koşulda ilk zincirden kötü olamaz.
  let iterations = 0;
  let improvements = 0;
  let chains = 0;
  const wantAnneal = options.anneal !== false && job.items.length >= 2 && seeds.length > 0;

  if (wantAnneal) {
    const maxIters = options.maxIters ??
      clamp(Math.round(ITERS_PER_ITEM * job.items.length), MIN_ITERS, MAX_ITERS);

    const asState = (s: Seed): BestState => ({
      order: Int32Array.from(s.order),
      orient: Uint8Array.from(s.orient),
      cfg: s.cfg,
      energy: s.energy,
      label: s.label
    });

    let champion: BestState | null = null;
    let lastGain = start;
    let extended = false;

    while (chains < MAX_CHAINS) {
      if (options.shouldStop && options.shouldStop()) break;
      const t = now();
      if (t >= clock.deadline) {
        // "Bütçe dolduğunda hâlâ iyileşiyorsa bir kereye mahsus ek süre" kuralı
        if (!extended && extendMs > 0 && (t - lastGain) < budget * 0.25) {
          extended = true;
          clock.deadline = t + extendMs;
        } else {
          break;
        }
      }

      // Zincir 0 en iyi kurulumdan; sonrakiler dönüşümlü olarak şampiyondan
      // (derinleştirme) ve başka kurulum tohumlarından (çeşitlendirme) başlar.
      const startState: BestState =
        chains === 0 ? asState(seeds[0])
        : (chains % 2 === 1 && champion !== null) ? champion
        : asState(seeds[chains % seeds.length]);

      const out: AnnealOutcome = yield* anneal(
        job, seeds,
        {
          maxIters,
          seed: (seedNum ^ Math.imul(chains + 1, 0x9e3779b1)) >>> 0,
          shouldStop: options.shouldStop,
          start: startState,
          iterBase: iterations
        },
        clock
      );
      chains++;
      iterations += out.iterations;
      improvements += out.improvements;

      if (champion === null || out.best.energy < champion.energy - 1e-12) {
        champion = out.best;
        lastGain = now();
      }
    }

    if (champion) {
      const dec = evaluate(job, champion.order, champion.orient, champion.cfg, null, true).dec;
      if (decodeIsGuillotine(dec)) {
        const r = buildResult(job, dec, `${champion.label} → SA ${chains}×${iterations}/${improvements}`);
        if (isBetter(r, best)) best = r;
      }
    }
  }

  best.stats.annealIterations = iterations;
  best.stats.elapsedMs = now() - start;
  return best;
}

/* ================================================================== *
 * 12. Genel API
 * ================================================================== */

export function optimizeCutlist(
  stocks: StockInput[],
  parts: PartInput[],
  kerfCm: number,
  options: OptimizeOptions = {}
): OptResult {
  const it = optimizeIter(stocks, parts, kerfCm, options);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

export interface GroupInput {
  group: SheetGroup;
  stocks: StockInput[];
  parts: PartInput[];
}

/**
 * Gruplu paketleme: her levha grubu kendi stok havuzundan bağımsız paketlenir,
 * sonuçlar tek bir OptResult altında birleştirilir. Bir gruptaki parça asla
 * başka bir grubun plakasına yerleşemez (fiziksel malzeme farkı).
 *
 * Zaman bütçesi gruplara PARÇA ADEDİ ORANINDA bölünür — üç grup üç kat süre
 * harcamaz. Tek çalışan grup varsa optimizeCutlist ile birebir aynı sonucu verir.
 */
export function* optimizeCutlistGroupedIter(
  groups: GroupInput[],
  kerfCm: number,
  options: OptimizeOptions = {}
): Generator<OptProgress, OptResult, void> {
  const now = options.now ?? defaultNow;
  const start = now();
  const totalBudget = Math.max(0, options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const totalExtend = Math.max(0, options.extendMs ?? DEFAULT_EXTEND_MS);

  // Geçerli parçası olmayan grup hiç çalıştırılmaz (boş plaka/istatistik üretmesin)
  const live = groups.filter(g => g.parts.some(p => p.w > 0 && p.h > 0 && p.count > 0));

  const bins: PlacedBin[] = [];
  const unplaced: UnplacedInfo[] = [];
  const strategies: string[] = [];
  let totalArea = 0;
  let usedArea = 0;
  let totalBins = 0;
  let largestOffcutArea = 0;
  let iterations = 0;

  if (live.length === 0) {
    return {
      bins, unplaced,
      stats: { totalArea: 0, usedArea: 0, wastePercent: 0, totalBins: 0, largestOffcutArea: 0, annealIterations: 0, elapsedMs: now() - start },
      strategy: ''
    };
  }

  const weights = live.map(g => Math.max(1, g.parts.reduce((a, p) => a + Math.max(0, p.count || 0), 0)));
  const wSum = weights.reduce((a, b) => a + b, 0);

  let base = 0;
  for (let i = 0; i < live.length; i++) {
    const frac = weights[i] / wSum;
    const g = live[i];

    const sub = optimizeIter(g.stocks, g.parts, kerfCm, {
      ...options,
      timeBudgetMs: totalBudget * frac,
      extendMs: totalExtend * frac
    });

    let step = sub.next();
    while (!step.done) {
      const p = step.value;
      yield {
        phase: p.phase,
        progress: base + p.progress * frac,
        bins: totalBins + p.bins,
        wastePercent: p.wastePercent,
        elapsedMs: now() - start,
        iterations: iterations + p.iterations
      };
      step = sub.next();
    }
    const res = step.value;

    for (const bin of res.bins) bins.push({ ...bin, group: g.group });
    unplaced.push(...res.unplaced);
    totalArea += res.stats.totalArea;
    usedArea += res.stats.usedArea;
    totalBins += res.stats.totalBins;
    iterations += res.stats.annealIterations ?? 0;
    if (res.stats.largestOffcutArea > largestOffcutArea) largestOffcutArea = res.stats.largestOffcutArea;
    strategies.push(g.group + ':' + res.strategy);

    base += frac;
  }

  return {
    bins,
    unplaced,
    stats: {
      totalArea,
      usedArea,
      wastePercent: totalArea > 0 ? ((totalArea - usedArea) / totalArea) * 100 : 0,
      totalBins,
      largestOffcutArea,
      annealIterations: iterations,
      elapsedMs: now() - start
    },
    strategy: strategies.join(' | ')
  };
}

export function optimizeCutlistGrouped(
  groups: GroupInput[],
  kerfCm: number,
  options: OptimizeOptions = {}
): OptResult {
  const it = optimizeCutlistGroupedIter(groups, kerfCm, options);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/* ------------------------------------------------------------------ *
 * Asenkron sürüm — 5-10 saniyelik arama ana iş parçacığını kilitlemesin.
 * Capacitor WebView'de senkron çalıştırılırsa uygulama o süre boyunca donar.
 * ------------------------------------------------------------------ */

/**
 * Ana iş parçacığını bırakma.
 *
 * scheduler.yield() BİLEREK kullanılmaz: sürdürme (continuation) görevleri
 * normal görevlerin ÖNÜNE geçtiği için setTimeout ve MessageChannel görevleri
 * arama boyunca hiç sıraya gelmiyor. Ölçüm (Chrome, 92 parçalık iş, 6.7 sn):
 * requestAnimationFrame 65 kez çalıştı ama setTimeout SIFIR kez — React'in
 * zamanlayıcısı da MessageChannel kullandığından durum güncellemeleri hiç
 * işlenmiyor, "DURDUR" düğmesi ekrana hiç gelmiyordu.
 *
 * MessageChannel NORMAL bir görev kuyruğuna yazar; React'in kendi görevleriyle
 * FIFO sırada yarışır, böylece arama sürerken arayüz gerçekten çizilir.
 */
function yieldToHost(): Promise<void> {
  if (typeof MessageChannel === 'function') {
    return new Promise<void>(resolve => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
      ch.port2.postMessage(0);
    });
  }
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}

export async function optimizeCutlistGroupedAsync(
  groups: GroupInput[],
  kerfCm: number,
  options: AsyncOptimizeOptions = {}
): Promise<OptResult> {
  const now = options.now ?? defaultNow;
  const interval = options.progressIntervalMs ?? 100;
  const it = optimizeCutlistGroupedIter(groups, kerfCm, options);

  let lastYield = now();
  let lastReport = -Infinity;
  let r = it.next();
  while (!r.done) {
    const t = now();
    if (options.onProgress && t - lastReport >= interval) {
      lastReport = t;
      options.onProgress(r.value);
    }
    if (t - lastYield >= YIELD_SLICE_MS) {
      lastYield = t;
      await yieldToHost();
    }
    r = it.next();
  }
  return r.value;
}
