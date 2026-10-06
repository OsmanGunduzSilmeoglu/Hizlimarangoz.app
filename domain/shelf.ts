/**
 * Eşit raf hesabı — saf domain katmanı (KN-2).
 * gap = (h − s·t) / (s + 1); pozisyonlar rafın ALT YÜZEYİDİR (SC-01).
 */

export interface ShelfLayout {
  gap: number;
  /** Raf alt yüzeyi pozisyonları (alt tabandan, cm) */
  positions: number[];
  /** Delik (pim) merkezleri — alt yüzeyden pim yarıçapı düşülmüş */
  pinCenters: number[];
}

export function computeShelfLayout(
  innerHeight: number,
  shelfCount: number,
  thickness: number,
  pinDiameter: number
): ShelfLayout | null {
  if (!Number.isFinite(innerHeight) || !Number.isInteger(shelfCount)) return null;
  if (shelfCount < 0 || innerHeight <= shelfCount * thickness) return null;

  const gap = (innerHeight - shelfCount * thickness) / (shelfCount + 1);
  const positions: number[] = [];
  const pinCenters: number[] = [];
  const pinR = pinDiameter / 2;

  let current = 0;
  for (let i = 0; i < shelfCount; i++) {
    current += gap;
    const pos = Number(current.toFixed(2));
    positions.push(pos);
    pinCenters.push(Number((pos - pinR).toFixed(2)));
    current += thickness;
  }

  return { gap: Number(gap.toFixed(2)), positions, pinCenters };
}
