/**
 * Çakışmayan ID üretici (CL-03 ölçümü: hızlı çift dokunuşta Date.now()
 * aynı ID'yi üretip toplu silmeye yol açıyordu).
 */
let counter = 0;

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  counter += 1;
  return `${Date.now().toString(36)}-${counter}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
