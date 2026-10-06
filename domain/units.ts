/**
 * Birim güvenliği (rapor §6.4): çekirdek hesaplar TAMSAYI MİLİMETRE ile yapılır.
 * 697×4 + 3×4 = 2800 === 2800 — IEEE-754 artığı üretmez; GP-01 sınıfı hatalar
 * "epsilonla yamalanmaz", var olamaz hâle gelir. UI cm ile konuşmaya devam eder.
 */

export type Mm = number; // tamsayı milimetre (çekirdek sözleşmesi)

export const cmToMm = (cm: number): Mm => Math.round(cm * 10);
export const mmToCm = (mm: Mm): number => mm / 10;

/** "75.2" gibi cm string'ini mm'ye çevirir; geçersizse null. */
export function parseCmToMm(raw: string): Mm | null {
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return null;
  return cmToMm(v);
}

/** mm → "75.2" biçiminde cm gösterimi (gereksiz sıfırlar olmadan). */
export function formatMmAsCm(mm: Mm): string {
  return String(Math.round(mm) / 10);
}
