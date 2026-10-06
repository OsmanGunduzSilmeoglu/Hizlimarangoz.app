/**
 * Başlangıç verileri — uygulamanın localStorage anahtarlarına doğrudan yazılır.
 * Elle 7 satır × 4 hücre doldurmak yerine iş hazır gelir; test tekrarlanabilir olur.
 *
 * Anahtarlar components/CuttingModule.tsx içindeki sabitlerle aynı olmalı:
 *   um_cutting_parts / um_cutting_stocks / um_cutting_kerf / um_cutting_result
 * Doğrulayıcılar (isParts/isStocks) yalnız w,h,count alanlarını arar; gerisi
 * uygulamanın kendi varsayılanlarıyla tamamlanır.
 */

const BAND = { top: false, right: false, bottom: false, left: false };
const part = (id, name, w, h, count, rotatable = true) =>
  ({ id, name, w, h, count, rotatable, sheetGroup: 'malzeme', edgeBanding: BAND });
const sheet = (w, h, count) => [{ id: 's1', w, h, count }];

export const SEEDS = {
  /** 92 parçalık mutfak işi — ölçütteki (bench.packer.ts) işin aynısı */
  kesim92: {
    aciklama: '92 parça mutfak, 210×280 levha ×20, kerf 0.3 — tam arama ~8 sn',
    storage: {
      um_cutting_parts: [
        part('a', 'Yan', 75.2, 60, 16),
        part('b', 'Tabla', 80, 60, 8),
        part('c', 'Raf', 76.4, 58, 12),
        part('d', 'Kuşak', 76.4, 10, 16),
        part('e', 'Kapak', 39.7, 71.5, 16),
        part('f', 'Üst Yan', 92, 32, 12),
        part('g', 'Üst Tabla', 56.4, 32, 12),
      ],
      um_cutting_stocks: sheet(210, 280, 20),
      um_cutting_kerf: 0.3,
      um_cutting_result: null,
    },
  },

  /** Desen kilidi (döndürme yok) — v3'ün v2'yi 9→8 plakayla yendiği iş */
  gardirop: {
    aciklama: '60 parça gardırop, döndürme KAPALI, kerf 0.4',
    storage: {
      um_cutting_parts: [
        part('a', 'Dikme', 58, 240, 8, false),
        part('b', 'Taban', 100, 58, 6, false),
        part('c', 'Raf', 98.2, 56, 20, false),
        part('d', 'Kapak', 49.5, 238, 8, false),
        part('e', 'Kuşak', 98.2, 12, 18, false),
      ],
      um_cutting_stocks: sheet(210, 280, 20),
      um_cutting_kerf: 0.4,
      um_cutting_result: null,
    },
  },

  /** Hiç veri yok — ilk açılış davranışını görmek için (--fresh ile birlikte kullanın) */
  bos: {
    aciklama: 'boş uygulama',
    storage: {},
  },
};
