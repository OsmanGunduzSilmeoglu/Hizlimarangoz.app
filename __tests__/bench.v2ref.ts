/**
 * v2 paketleyicinin ölçüt (benchmark) kopyası — YALNIZ karşılaştırma içindir,
 * uygulama koduna dahil değildir. v3 kazanımını sayıyla göstermek için durur.
 */
import { cmToMm, mmToCm } from '../domain/units';
import { PartInput, StockInput, OptResult, PlacedBin, PlacedPart, UnplacedInfo, Rect } from '../domain/nesting/packer';

const KERF_MAX_MM = 15;
type FitRule = 'BAF' | 'BSSF' | 'BLSF';
interface MmRect { x: number; y: number; w: number; h: number }
interface MmPlaced extends MmRect {
  partId: string; name: string; rotated: boolean; originalW: number; originalH: number;
}

class GuillotineBin {
  w: number; h: number; freeRects: MmRect[]; placed: MmPlaced[]; fit: FitRule;
  constructor(w: number, h: number, fit: FitRule) {
    this.w = w; this.h = h; this.fit = fit;
    this.freeRects = [{ x: 0, y: 0, w, h }];
    this.placed = [];
  }
  private score(fr: MmRect, reqW: number, reqH: number): [number, number] {
    const leftoverArea = fr.w * fr.h - reqW * reqH;
    const shortFit = Math.min(fr.w - reqW, fr.h - reqH);
    const longFit = Math.max(fr.w - reqW, fr.h - reqH);
    switch (this.fit) {
      case 'BAF': return [leftoverArea, shortFit];
      case 'BSSF': return [shortFit, longFit];
      case 'BLSF': return [longFit, shortFit];
    }
  }
  insert(itemW: number, itemH: number, partId: string, name: string, rotatable: boolean, origW: number, origH: number): boolean {
    let bestNodeIndex = -1, best1 = Infinity, best2 = Infinity, isRotated = false;
    const evalFit = (reqW: number, reqH: number, rotatedState: boolean, index: number, fr: MmRect) => {
      if (reqW <= fr.w && reqH <= fr.h) {
        const [s1, s2] = this.score(fr, reqW, reqH);
        if (s1 < best1 || (s1 === best1 && s2 < best2)) {
          best1 = s1; best2 = s2; bestNodeIndex = index; isRotated = rotatedState;
        }
      }
    };
    for (let i = 0; i < this.freeRects.length; i++) {
      const fr = this.freeRects[i];
      evalFit(itemW, itemH, false, i, fr);
      if (rotatable && itemW !== itemH) evalFit(itemH, itemW, true, i, fr);
    }
    if (bestNodeIndex === -1) return false;
    const fr = this.freeRects[bestNodeIndex];
    const finalW = isRotated ? itemH : itemW;
    const finalH = isRotated ? itemW : itemH;
    this.placed.push({
      x: fr.x, y: fr.y, w: finalW, h: finalH, partId, name, rotated: isRotated,
      originalW: isRotated ? origH : origW, originalH: isRotated ? origW : origH
    });
    this.split(bestNodeIndex, finalW, finalH);
    return true;
  }
  split(nodeIndex: number, pw: number, ph: number) {
    const fr = this.freeRects[nodeIndex];
    this.freeRects.splice(nodeIndex, 1);
    const w = fr.w, h = fr.h;
    const horizSplitLargerArea = Math.max((w - pw) * ph, w * (h - ph));
    const vertSplitLargerArea = Math.max((w - pw) * h, pw * (h - ph));
    if (horizSplitLargerArea > vertSplitLargerArea) {
      if (w - pw > 0) this.freeRects.push({ x: fr.x + pw, y: fr.y, w: w - pw, h: ph });
      if (h - ph > 0) this.freeRects.push({ x: fr.x, y: fr.y + ph, w: w, h: h - ph });
    } else {
      if (w - pw > 0) this.freeRects.push({ x: fr.x + pw, y: fr.y, w: w - pw, h: h });
      if (h - ph > 0) this.freeRects.push({ x: fr.x, y: fr.y + ph, w: pw, h: h - ph });
    }
  }
}

interface WorkItem { id: string; name: string; w: number; h: number; rotatable: boolean; area: number }

const SORT_STRATEGIES: { key: string; cmp: (a: WorkItem, b: WorkItem) => number }[] = [
  { key: 'area', cmp: (a, b) => b.area - a.area || Math.max(b.w, b.h) - Math.max(a.w, a.h) },
  { key: 'maxside', cmp: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.area - a.area },
  { key: 'height', cmp: (a, b) => b.h - a.h || b.area - a.area },
  { key: 'width', cmp: (a, b) => b.w - a.w || b.area - a.area },
  { key: 'perim', cmp: (a, b) => (b.w + b.h) - (a.w + a.h) || b.area - a.area },
  { key: 'minside', cmp: (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) || b.area - a.area },
];
const FIT_RULES: FitRule[] = ['BAF', 'BSSF', 'BLSF'];

function packOnce(
  items: WorkItem[], availableBins: { id: string, w: number, h: number }[],
  requestedCount: Map<string, number>, partById: Map<string, PartInput>,
  kerfMm: number, fit: FitRule, strategy: string
): OptResult {
  const guillotines = availableBins.map(b => ({
    stockId: b.id, originalW: b.w, originalH: b.h,
    packer: new GuillotineBin(b.w + kerfMm, b.h + kerfMm, fit)
  }));
  const placedCount = new Map<string, number>();
  for (const item of items) {
    const reqW = item.w + kerfMm, reqH = item.h + kerfMm;
    let placed = false;
    for (let i = 0; i < guillotines.length; i++) {
      if (guillotines[i].packer.insert(reqW, reqH, item.id, item.name, item.rotatable, item.w, item.h)) {
        placed = true; break;
      }
    }
    if (placed) placedCount.set(item.id, (placedCount.get(item.id) || 0) + 1);
  }
  const unplaced: UnplacedInfo[] = [];
  for (const [id, requested] of requestedCount) {
    const done = placedCount.get(id) || 0;
    if (done < requested) {
      const origPart = partById.get(id);
      if (origPart) unplaced.push({ part: origPart, requested, placed: done, missing: requested - done, reason: 'Plakalara sığmadı' });
    }
  }
  let totalArea = 0, usedArea = 0, activeBins = 0, largestOffcut = 0;
  const resultBins: PlacedBin[] = [];
  for (const g of guillotines) {
    if (g.packer.placed.length === 0) continue;
    activeBins++;
    const binArea = g.originalW * g.originalH;
    totalArea += binArea;
    let binUsedArea = 0;
    const finalPlaced: PlacedPart[] = g.packer.placed.map(p => {
      binUsedArea += p.originalW * p.originalH;
      return {
        x: mmToCm(p.x), y: mmToCm(p.y), w: mmToCm(p.originalW), h: mmToCm(p.originalH),
        partId: p.partId, name: p.name, rotated: p.rotated,
        originalW: mmToCm(p.originalW), originalH: mmToCm(p.originalH)
      };
    });
    usedArea += binUsedArea;
    const freeRects: Rect[] = [];
    for (const fr of g.packer.freeRects) {
      const w = Math.min(fr.w, g.originalW - fr.x);
      const h = Math.min(fr.h, g.originalH - fr.y);
      if (w > 0 && h > 0) {
        if (w * h > largestOffcut) largestOffcut = w * h;
        freeRects.push({ x: mmToCm(fr.x), y: mmToCm(fr.y), w: mmToCm(w), h: mmToCm(h) });
      }
    }
    resultBins.push({
      stockId: g.stockId, w: mmToCm(g.originalW), h: mmToCm(g.originalH),
      placed: finalPlaced, freeRects, utilization: (binUsedArea / binArea) * 100
    });
  }
  return {
    bins: resultBins, unplaced,
    stats: {
      totalArea: totalArea / 100, usedArea: usedArea / 100,
      wastePercent: totalArea > 0 ? ((totalArea - usedArea) / totalArea) * 100 : 0,
      totalBins: activeBins, largestOffcutArea: largestOffcut / 100
    },
    strategy
  };
}

function isBetter(a: OptResult, b: OptResult): boolean {
  const missA = a.unplaced.reduce((acc, u) => acc + u.missing, 0);
  const missB = b.unplaced.reduce((acc, u) => acc + u.missing, 0);
  if (missA !== missB) return missA < missB;
  if (a.stats.totalBins !== b.stats.totalBins) return a.stats.totalBins < b.stats.totalBins;
  if (a.stats.largestOffcutArea !== b.stats.largestOffcutArea) return a.stats.largestOffcutArea > b.stats.largestOffcutArea;
  return a.stats.wastePercent < b.stats.wastePercent;
}

export function optimizeCutlistV2(stocks: StockInput[], parts: PartInput[], kerfCm: number): OptResult {
  let kerfMm = cmToMm(kerfCm);
  if (!Number.isFinite(kerfMm) || kerfMm < 0) kerfMm = 0;
  if (kerfMm > KERF_MAX_MM) kerfMm = KERF_MAX_MM;
  const baseItems: WorkItem[] = [];
  const requestedCount = new Map<string, number>();
  const partById = new Map<string, PartInput>();
  for (const p of parts) {
    const w = cmToMm(p.w), h = cmToMm(p.h);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0 || p.count <= 0) continue;
    requestedCount.set(p.id, p.count);
    partById.set(p.id, p);
    for (let i = 0; i < p.count; i++) baseItems.push({ id: p.id, name: p.name, w, h, rotatable: p.rotatable, area: w * h });
  }
  const availableBins: { id: string, w: number, h: number }[] = [];
  for (const s of stocks) {
    const w = cmToMm(s.w), h = cmToMm(s.h);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0 || s.count <= 0) continue;
    for (let i = 0; i < s.count; i++) availableBins.push({ id: s.id, w, h });
  }
  let best: OptResult | null = null;
  for (const strat of SORT_STRATEGIES) {
    const items = [...baseItems].sort(strat.cmp);
    for (const fit of FIT_RULES) {
      const res = packOnce(items, availableBins, requestedCount, partById, kerfMm, fit, `${strat.key}+${fit}`);
      if (best === null || isBetter(res, best)) best = res;
    }
  }
  return best ?? packOnce([], availableBins, requestedCount, partById, kerfMm, 'BAF', 'empty');
}
