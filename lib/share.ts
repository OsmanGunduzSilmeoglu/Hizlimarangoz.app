/**
 * Paylaşım/yazdırma kanalı (EK-06/KN-6): marangozun asıl akışı
 * "hesapla → plakacıya gönder". Native'de Capacitor Share, web'de
 * Web Share API, o da yoksa pano.
 */


export type ShareOutcome = 'shared' | 'copied' | 'failed';

export async function shareText(title: string, text: string): Promise<ShareOutcome> {
  try {

    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      await (navigator as any).share({ title, text });
      return 'shared';
    }
  } catch (e: any) {
    // kullanıcı paylaşım penceresini kapattıysa sessizce vazgeç
    if (e?.name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Yazdırma yalnız web'de anlamlı — Android WebView print desteklemez (EK-06). */
export function canPrint(): boolean {
  return typeof window !== 'undefined' && 'print' in window;
}
