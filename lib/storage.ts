/**
 * Güvenli localStorage katmanı (Faz 0).
 *
 * - Okuma: JSON parse + şema doğrulaması; bozuk veri SİLİNMEZ,
 *   `<anahtar>__corrupt` altına karantinaya alınır (rapor §6.2 ilkesi).
 * - Yazma: try/catch — kota dolduğunda uygulama çökmez (CL-09).
 */

export function loadJSON<T>(key: string, validate: (v: unknown) => v is T): T | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (validate(parsed)) return parsed;
  } catch {
    // parse hatası → karantina
  }

  // Bozuk veri: silme, karantinaya taşı
  try {
    localStorage.setItem(`${key}__corrupt`, raw);
    localStorage.removeItem(key);
  } catch {
    // karantina bile yazılamıyorsa sessizce vazgeç
  }
  return null;
}

export function saveJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // yoksay
  }
}

/** Uygulamaya ait tüm anahtar önekleri — "Temizle" yalnız bunları siler (EK-12). */
export const APP_KEY_PREFIXES = ['um_', 'dd_'];

export function clearAppData(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && APP_KEY_PREFIXES.some(p => k.startsWith(p))) doomed.push(k);
    }
    doomed.forEach(k => localStorage.removeItem(k));
  } catch {
    // yoksay
  }
}
