/**
 * Giyotin geometrisi — kesim planı ÜRETİCİSİ ile DOĞRULAYICISININ ortak çekirdeği.
 *
 * Neden ortak: doğrulayıcı ile plan üreteci ayrı yazılırsa ayrışabilir ve
 * "geçerli" denilen bir yerleşim için computeCutPlan sessizce eksik talimat
 * üretir (recurse içindeki `best === null` güvenlik çıkışı). Aynı aday seçimi
 * burada tek yerde durur: ikisi de findGuillotineCut'ı kullanır.
 *
 * Birim taşımaz — koordinatlar hangi birimde verilirse o birimde döner.
 * Çağıranlar tamsayı mm ile besler (rapor §6.4).
 */

export interface GRect { x: number; y: number; w: number; h: number }
export interface GCut { orientation: 'V' | 'H'; pos: number }

/**
 * Bölgeyi baştan başa geçen ve hiçbir parçayı kesmeyen bir çizgi arar.
 * Seçim: iki yanı en dengeli bölen aday, eşitlikte en küçük pozisyon.
 * Yoksa null — yerleşim bu bölgede giyotin değildir.
 */
export function findGuillotineCut<T extends GRect>(region: GRect, parts: T[]): GCut | null {
  const xCands = new Set<number>();
  const yCands = new Set<number>();
  for (const p of parts) {
    for (const x of [p.x, p.x + p.w]) {
      if (x > region.x && x < region.x + region.w) xCands.add(x);
    }
    for (const y of [p.y, p.y + p.h]) {
      if (y > region.y && y < region.y + region.h) yCands.add(y);
    }
  }

  let found = false;
  let bestOri: 'V' | 'H' = 'V';
  let bestPos = 0;
  let bestBalance = -1;

  const consider = (orientation: 'V' | 'H', pos: number) => {
    let left = 0;
    let right = 0;
    for (const p of parts) {
      const lo = orientation === 'V' ? p.x : p.y;
      const hi = orientation === 'V' ? p.x + p.w : p.y + p.h;
      if (hi <= pos) left++;
      else if (lo >= pos) right++;
      else return; // parçayı keser — geçersiz
    }
    const balance = left < right ? left : right;
    if (!found || balance > bestBalance || (balance === bestBalance && pos < bestPos)) {
      found = true;
      bestOri = orientation;
      bestPos = pos;
      bestBalance = balance;
    }
  };

  for (const x of xCands) consider('V', x);
  for (const y of yCands) consider('H', y);

  return found ? { orientation: bestOri, pos: bestPos } : null;
}

/** Bölgeyi kesim çizgisine göre iki alt bölgeye ayırır (sıra: küçük koordinat önce). */
export function splitRegion(region: GRect, cut: GCut): [GRect, GRect] {
  if (cut.orientation === 'V') {
    return [
      { x: region.x, y: region.y, w: cut.pos - region.x, h: region.h },
      { x: cut.pos, y: region.y, w: region.x + region.w - cut.pos, h: region.h }
    ];
  }
  return [
    { x: region.x, y: region.y, w: region.w, h: cut.pos - region.y },
    { x: region.x, y: cut.pos, w: region.w, h: region.y + region.h - cut.pos }
  ];
}

export function rectInside(p: GRect, r: GRect): boolean {
  return p.x >= r.x && p.y >= r.y && p.x + p.w <= r.x + r.w && p.y + p.h <= r.y + r.h;
}

/**
 * Yerleşim baştan sona giyotin kesimlerle ayrıştırılabiliyor mu?
 * findGuillotineCut ile AYNI aday seçimini kullandığı için, true dönüyorsa
 * computeCutPlan da eksiksiz talimat üretir.
 */
export function isGuillotineLayout<T extends GRect>(region: GRect, parts: T[]): boolean {
  if (parts.length <= 1) return true;
  const cut = findGuillotineCut(region, parts);
  if (cut === null) return false;
  const [r1, r2] = splitRegion(region, cut);
  return (
    isGuillotineLayout(r1, parts.filter(p => rectInside(p, r1))) &&
    isGuillotineLayout(r2, parts.filter(p => rectInside(p, r2)))
  );
}
