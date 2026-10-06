/**
 * Yüklük (gömme dolap / kiler) parça üretimi — saf domain katmanı.
 * cabinet.ts ile aynı ilke: UI bağımsız, test edilebilir; kalınlık ve paylar parametredir.
 *
 * Yapı: N bölme = N+1 dikme (2 yan + N−1 ara). Tam kapalı kutu — taban ve tavan tam parça.
 * Montaj tipi taban/tavanın dikmelerle ilişkisini belirler; net iç yükseklik
 * iki tipte de h − 2t (farklı yapısal nedenle, bkz. buildYuklukParts içi yorumlar).
 */
import { CuttingPart, YuklukCompartmentConfig, YuklukMountType } from '../types';
import { computeShelfLayout } from './shelf';

export interface YuklukOptions {
  h: number;      // cm
  w: number;
  d: number;
  compartmentCount: number;   // N, 1–12
  mountType: YuklukMountType;
  quantity: number;
  includeBack: boolean;
}

export interface YuklukTolerances {
  thickness: number;             // gövde kalınlık (cm)
  backThickness: number;         // arkalık kalınlık (cm)
  backGap: number;               // arkalık fuga (cm)
  shelfFit: number;              // raf yan fit payı (cm)
  shelfBackClear: number;        // raf sırt payı (cm)
  pinDiameter: number;           // raf pimi çapı (cm)
  drawerSlideClearance: number;  // çekmece rayı kenar boşluğu (cm, kenar başına)
  drawerFrontGap: number;        // çekmece cephesi fugası (cm) — kapak fugası ile aynı mantık
  drawerBottomThickness: number; // çekmece tabanı kalınlığı (cm) — ayrı malzeme
}

/**
 * Jenerik sektör standardı çekmece sabitleri — gerçek donanım ölçüleri
 * netleşince tek satırdan güncellenir (Settings'e taşınması ayrı iyileştirme).
 */
export const DRAWER_SLIDE_CLEARANCE = 1.3;
export const DRAWER_BOTTOM_THICKNESS = 0.4;
/** Çekmece kutusunun cepheye göre yükseklik payı (cm) */
export const DRAWER_BOX_HEIGHT_ALLOWANCE = 3;
/** Çekmece kutusunun gövde derinliğine göre payı (cm) — ray arkalığa çarpmasın */
export const DRAWER_BOX_DEPTH_ALLOWANCE = 2;

export const MIN_COMPARTMENT_WIDTH = 15;
export const MAX_COMPARTMENTS = 12;

const r2 = (v: number) => Number(v.toFixed(2));

/** Bölme net genişliği: N bölme, N+1 dikme → (w − (N+1)·t) / N. Geçersizse null. */
export function computeCompartmentWidth(
  w: number,
  compartmentCount: number,
  thickness: number
): number | null {
  if (!Number.isFinite(w) || !Number.isInteger(compartmentCount) || compartmentCount < 1) return null;
  const cw = (w - (compartmentCount + 1) * thickness) / compartmentCount;
  return cw > 0 ? r2(cw) : null;
}

/** Çekmece cephesi ölçüsü — bölme içine fuga paylı eşit bölünüm. Sığmıyorsa null. */
export function computeDrawerFront(
  compartmentWidth: number,
  innerHeight: number,
  drawerCount: number,
  tol: YuklukTolerances
): { width: number; height: number } | null {
  if (!Number.isInteger(drawerCount) || drawerCount < 1) return null;
  const height = (innerHeight - (drawerCount + 1) * tol.drawerFrontGap) / drawerCount;
  const width = compartmentWidth - tol.drawerFrontGap;
  if (height <= 0 || width <= 0) return null;
  return { width: r2(width), height: r2(height) };
}

export function buildYuklukParts(
  opt: YuklukOptions,
  compartments: YuklukCompartmentConfig[],
  tol: YuklukTolerances
): CuttingPart[] {
  const { h, w, d, compartmentCount: n, mountType, quantity: q, includeBack } = opt;
  const t = tol.thickness;
  const parts: CuttingPart[] = [];

  const cw = computeCompartmentWidth(w, n, t);
  const innerH = h - 2 * t;
  if (cw === null || innerH <= 0 || d <= 0 || q < 1) return [];

  // 'uzerine-oturan': dikmeler tam parça taban ile tavan arasına oturur → h − 2t.
  // 'arasina-giren': dikmeler tam boy; taban/tavan segmentleri bölme içine
  //   üstten ve alttan t kadar girer → net iç yükseklik yine h − 2t.
  const dividerHeight = mountType === 'uzerine-oturan' ? innerH : h;
  parts.push({
    name: 'Dikme (Yan + Ara)',
    width: r2(dividerHeight),
    height: r2(d),
    count: (n + 1) * q,
    description: `${n + 1} adet (2 yan + ${n - 1} ara)`
  });

  if (mountType === 'uzerine-oturan') {
    parts.push({ name: 'Alt Tabla', width: r2(w), height: r2(d), count: 1 * q, description: 'Tam genişlik — dikmeler üzerine oturur' });
    parts.push({ name: 'Üst Tabla', width: r2(w), height: r2(d), count: 1 * q, description: 'Tam genişlik — dikmeler altına biner' });
  } else {
    parts.push({
      name: 'Bölme Taban/Tavan',
      width: r2(cw),
      height: r2(d),
      count: 2 * n * q,
      description: `${n} bölme x (alt + üst)`
    });
  }

  if (includeBack) {
    // cabinet.ts CL-02 ile aynı kural: bindirme usulü, gövdeden tol.backGap cm içeride
    parts.push({
      name: 'Arkalık',
      width: r2(w - tol.backGap),
      height: r2(h - tol.backGap),
      count: 1 * q,
      description: `${(tol.backThickness * 10).toFixed(0)} mm — AYRI MALZEME`,
      material: 'back'
    });
  }

  compartments.forEach((comp, i) => {
    const shelfCount = comp.shelfCount || 0;
    const drawerCount = comp.drawerCount || 0;

    if (shelfCount > 0 && computeShelfLayout(innerH, shelfCount, t, tol.pinDiameter)) {
      parts.push({
        name: 'İç Raf',
        width: r2(cw - tol.shelfFit),
        height: r2(d - tol.shelfBackClear),
        count: shelfCount * q,
        description: `Bölme ${i + 1} · fit −${tol.shelfFit}, sırt −${tol.shelfBackClear}`
      });
    }

    if (drawerCount > 0) {
      const front = computeDrawerFront(cw, innerH, drawerCount, tol);
      if (front) {
        const boxWidth = cw - 2 * tol.drawerSlideClearance;
        const boxHeight = front.height - DRAWER_BOX_HEIGHT_ALLOWANCE;
        const boxDepth = d - DRAWER_BOX_DEPTH_ALLOWANCE;
        parts.push({
          name: 'Çekmece Cephesi',
          width: front.width,
          height: front.height,
          count: drawerCount * q,
          description: `Bölme ${i + 1} · fuga ${tol.drawerFrontGap} cm`,
          material: 'kapak'
        });
        if (boxHeight > 0 && boxDepth > 0 && boxWidth > 2 * t) {
          parts.push({ name: 'Çekmece Yan', width: r2(boxDepth), height: r2(boxHeight), count: 2 * drawerCount * q, description: `Bölme ${i + 1}` });
          parts.push({ name: 'Çekmece Arka', width: r2(boxWidth - 2 * t), height: r2(boxHeight), count: drawerCount * q, description: `Bölme ${i + 1}` });
          parts.push({
            name: 'Çekmece Tabanı',
            width: r2(boxWidth),
            height: r2(boxDepth),
            count: drawerCount * q,
            description: `Bölme ${i + 1} · ${(tol.drawerBottomThickness * 10).toFixed(0)} mm — AYRI MALZEME`,
            material: 'drawer-bottom'
          });
        }
      }
    }
  });

  return parts;
}

/**
 * Girdi doğrulama — hatalıysa mesaj listesi döner (validateCabinetInput stili).
 * Boş alanlar hata sayılmaz (form yarım doldurulmuş olabilir).
 */
export function validateYuklukInput(
  dims: { h: string; w: string; d: string },
  compartmentCount: string,
  quantity: string,
  compartments: YuklukCompartmentConfig[],
  tol: YuklukTolerances
): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  const MAX_DIM = 400;
  const t = tol.thickness;

  const h = parseFloat(dims.h);
  const w = parseFloat(dims.w);
  const d = parseFloat(dims.d);
  // Tek ayrıştırma: UI'daki yuklukN ile aynı (parseFloat) — parseInt karışımı
  // '1e1' gibi üstel girdilerde doğrulama ile üretimi ayrıştırırdı
  const n = compartmentCount === '' ? NaN : parseFloat(compartmentCount);
  const q = quantity === '' ? 1 : parseInt(quantity);
  const nValid = Number.isInteger(n) && n >= 1 && n <= MAX_COMPARTMENTS;

  if (dims.h !== '' && !isNaN(h)) {
    if (h <= 2 * t) errors.push({ field: 'h', message: `Yükseklik ${(2 * t).toFixed(1)} cm'den büyük olmalı (taban + tavan)` });
    else if (h > MAX_DIM) errors.push({ field: 'h', message: `Yükseklik en fazla ${MAX_DIM} cm olabilir` });
  }
  if (dims.w !== '' && !isNaN(w)) {
    if (w > MAX_DIM) {
      errors.push({ field: 'w', message: `Genişlik en fazla ${MAX_DIM} cm olabilir` });
    } else if (nValid) {
      const cw = computeCompartmentWidth(w, n, t);
      if (cw === null || cw < MIN_COMPARTMENT_WIDTH) {
        const minW = n * MIN_COMPARTMENT_WIDTH + (n + 1) * t;
        errors.push({ field: 'w', message: `${n} bölme için genişlik en az ${minW.toFixed(1)} cm olmalı (bölme ≥ ${MIN_COMPARTMENT_WIDTH} cm)` });
      }
    } else if (w <= 2 * t) {
      errors.push({ field: 'w', message: `Genişlik ${(2 * t).toFixed(1)} cm'den büyük olmalı` });
    }
  }
  if (dims.d !== '' && !isNaN(d)) {
    if (d <= 0) errors.push({ field: 'd', message: 'Derinlik 0\'dan büyük olmalı' });
    else if (d > MAX_DIM) errors.push({ field: 'd', message: `Derinlik en fazla ${MAX_DIM} cm olabilir` });
  }
  if (compartmentCount !== '' && !nValid) {
    errors.push({ field: 'compartments', message: `Bölme sayısı 1–${MAX_COMPARTMENTS} arasında tam sayı olmalı` });
  }
  if (quantity !== '' && (!Number.isInteger(q) || q < 1 || q > 99)) {
    errors.push({ field: 'qty', message: 'Adet 1–99 arasında olmalı' });
  }

  const innerH = h - 2 * t;
  compartments.forEach((comp, i) => {
    const sc = comp.shelfCount || 0;
    const dc = comp.drawerCount || 0;
    if (!Number.isInteger(sc) || sc < 0 || sc > 20) {
      errors.push({ field: `comp-${i}`, message: `Bölme ${i + 1}: raf sayısı 0–20 arasında tam sayı olmalı` });
    }
    if (!Number.isInteger(dc) || dc < 0 || dc > 10) {
      errors.push({ field: `comp-${i}`, message: `Bölme ${i + 1}: çekmece sayısı 0–10 arasında tam sayı olmalı` });
    }
    // Çekmece cepheleri bölme açıklığının tamamını kaplar (frontHeight formülü) —
    // aynı bölmede raf da tanımlanırsa iki parça seti aynı hacmi çifte rezerve eder
    if (sc > 0 && dc > 0) {
      errors.push({ field: `comp-${i}`, message: `Bölme ${i + 1}: aynı bölmede hem raf hem çekmece tanımlanamaz — çekmece cepheleri bölmenin tamamını kaplar` });
    }
    if (dims.h !== '' && !isNaN(h) && innerH > 0) {
      // computeShelfLayout'un kendi guard'ı (innerH > sc·t) yüzeye çıkarılır
      if (sc > 0 && innerH <= sc * t) {
        errors.push({ field: `comp-${i}`, message: `Bölme ${i + 1}: iç yükseklik (${innerH.toFixed(1)} cm) ${sc} rafın toplam kalınlığına yetmiyor` });
      }
      if (dc > 0 && Number.isInteger(dc)) {
        // Genişlikten bağımsız yükseklik kontrolü: kutu yüksekliği payı da düşülünce pozitif kalmalı
        const frontHeight = (innerH - (dc + 1) * tol.drawerFrontGap) / dc;
        if (frontHeight - DRAWER_BOX_HEIGHT_ALLOWANCE <= 0) {
          errors.push({ field: `comp-${i}`, message: `Bölme ${i + 1}: iç yükseklik ${dc} çekmece için yetersiz` });
        }
      }
    }
    if (dims.d !== '' && !isNaN(d) && d > 0 && dc > 0 && d - DRAWER_BOX_DEPTH_ALLOWANCE <= 0) {
      errors.push({ field: `comp-${i}`, message: `Bölme ${i + 1}: derinlik (${d} cm) çekmece kutusu için yetersiz` });
    }
  });

  return errors;
}
