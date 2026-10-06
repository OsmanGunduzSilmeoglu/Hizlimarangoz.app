/**
 * Dolap parça üretimi — saf domain katmanı (KN-2 çözümü).
 * UI'dan bağımsız, test edilebilir; kalınlık ve paylar parametredir.
 *
 * Kapsam (rapor §7.1): gövde + raf + arkalık (#4) + kapak/fuga (#5).
 * Arkalık ayrı malzeme grubundadır (8 mm) ve 18 mm nesting'e karışmaz.
 */
import { CuttingPart } from '../types';

export interface CabinetOptions {
  type: 'BASE' | 'WALL' | 'TALL';
  h: number;      // cm
  w: number;
  d: number;
  shelves: number;
  quantity: number;
  includeBack: boolean;
  doors: 0 | 1 | 2;
}

export interface CabinetTolerances {
  thickness: number;       // gövde kalınlık (cm)
  backThickness: number;   // arkalık kalınlık (cm)
  doorGap: number;         // kapak fuga (cm)
  backGap: number;         // arkalık fuga (cm)
  shelfFit: number;        // raf yan fit payı (cm)
  shelfBackClear: number;  // raf sırt payı (cm)
}

const r2 = (v: number) => Number(v.toFixed(2));

export function buildCabinetParts(opt: CabinetOptions, tol: CabinetTolerances): CuttingPart[] {
  const { type, h, w, d, shelves, quantity: q, includeBack, doors } = opt;
  const t = tol.thickness;
  const parts: CuttingPart[] = [];

  if (type === 'BASE') {
    parts.push({ name: 'Alt Tabla', width: r2(w), height: r2(d), count: 1 * q, description: 'Kasa Alt Parçası' });
    parts.push({ name: 'Yan Dikme', width: r2(h - t), height: r2(d), count: 2 * q, description: 'Yan Paneller' });
    parts.push({ name: 'Üst Kuşak (Kayıt)', width: r2(w - 2 * t), height: 10, count: 2 * q, description: 'Kasa Üst Bağlantı' });
  } else {
    parts.push({ name: 'Yan Dikme', width: r2(h), height: r2(d), count: 2 * q, description: 'Tam Boy Yanlar' });
    parts.push({ name: 'Alt-Üst Tabla', width: r2(w - 2 * t), height: r2(d), count: 2 * q, description: 'Alt ve Üst Paneller' });
  }

  if (shelves > 0) {
    // CL-04: raf artık tam iç ölçüde değil — yan fit payı ve sırt payı düşülür
    parts.push({
      name: 'İç Raf',
      width: r2(w - 2 * t - tol.shelfFit),
      height: r2(d - tol.shelfBackClear),
      count: shelves * q,
      description: `İç Raf (fit −${tol.shelfFit}, sırt −${tol.shelfBackClear})`
    });
  }

  if (includeBack) {
    // CL-02: arkalık — bindirme usulü, gövdeden tol.backGap cm içeride
    parts.push({
      name: 'Arkalık',
      width: r2(w - tol.backGap),
      height: r2(h - tol.backGap),
      count: 1 * q,
      description: `${(tol.backThickness * 10).toFixed(0)} mm — AYRI MALZEME`,
      material: 'back'
    });
  }

  if (doors > 0) {
    const f = tol.doorGap;
    const doorH = r2(h - f);
    const doorW = doors === 1 ? r2(w - f) : r2((w - 1.5 * f) / 2);
    parts.push({
      name: doors === 1 ? 'Kapak' : 'Kapak (Çift)',
      width: r2(doorW),
      height: doorH,
      count: doors * q,
      description: `Fuga ${f} cm`,
      material: 'kapak'
    });
  }

  return parts;
}

/**
 * Girdi doğrulama — hatalıysa mesaj listesi döner (CL-03).
 * Boş alanlar hata sayılmaz (form yarım doldurulmuş olabilir).
 */
export function validateCabinetInput(
  type: 'BASE' | 'WALL' | 'TALL',
  dims: { h: string; w: string; d: string },
  shelves: string,
  quantity: string,
  thickness: number
): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  const MAX_DIM = 400;
  const minWidth = 2 * thickness + 5;

  const h = parseFloat(dims.h);
  const w = parseFloat(dims.w);
  const d = parseFloat(dims.d);
  const s = shelves === '' ? 0 : parseInt(shelves);
  const q = quantity === '' ? 1 : parseInt(quantity);

  if (dims.h !== '' && !isNaN(h)) {
    const minH = type === 'BASE' ? thickness : 0;
    if (h <= minH) errors.push({ field: 'h', message: type === 'BASE' ? `Yükseklik ${thickness} cm'den büyük olmalı` : 'Yükseklik 0\'dan büyük olmalı' });
    else if (h > MAX_DIM) errors.push({ field: 'h', message: `Yükseklik en fazla ${MAX_DIM} cm olabilir` });
  }
  if (dims.w !== '' && !isNaN(w)) {
    if (w < minWidth) errors.push({ field: 'w', message: `Genişlik en az ${minWidth.toFixed(1)} cm olmalı (kuşak/raf üretilebilsin)` });
    else if (w > MAX_DIM) errors.push({ field: 'w', message: `Genişlik en fazla ${MAX_DIM} cm olabilir` });
  }
  if (dims.d !== '' && !isNaN(d)) {
    if (d <= 0) errors.push({ field: 'd', message: 'Derinlik 0\'dan büyük olmalı' });
    else if (d > MAX_DIM) errors.push({ field: 'd', message: `Derinlik en fazla ${MAX_DIM} cm olabilir` });
  }
  if (shelves !== '' && (!Number.isInteger(s) || s < 0 || s > 20)) {
    errors.push({ field: 'shelves', message: 'Raf sayısı 0–20 arasında tam sayı olmalı' });
  }
  if (quantity !== '' && (!Number.isInteger(q) || q < 1 || q > 99)) {
    errors.push({ field: 'qty', message: 'Adet 1–99 arasında olmalı' });
  }
  return errors;
}
