/**
 * Modüller arası hafif olay kanalı — keep-alive router'da (rapor §6.3)
 * Kesim modülü mount'ta kalmaya devam ettiği için "KESİME AKTAR"
 * localStorage'a yazdıktan sonra bu olayla haber verir.
 */
export const PARTS_TRANSFER_EVENT = 'dd:parts-transfer';

export function dispatchPartsTransfer(): void {
  window.dispatchEvent(new CustomEvent(PARTS_TRANSFER_EVENT));
}

export function onPartsTransfer(handler: () => void): () => void {
  window.addEventListener(PARTS_TRANSFER_EVENT, handler);
  return () => window.removeEventListener(PARTS_TRANSFER_EVENT, handler);
}
