/**
 * Uygulama geneli ayarlar (EK-04 çözümü): malzeme, paylar, delik, plaka
 * varsayılanları tek yerde. zustand + persist — tüm modüller aynı kaynağı okur.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SettingsState {
  /** Gövde malzeme kalınlığı (cm) — 1.6 / 1.8 / 2.2 */
  thickness: number;
  /** Arkalık kalınlığı (cm) */
  backThickness: number;
  /** Varsayılan plaka ölçüsü (cm) */
  sheetW: number;
  sheetH: number;
  /** Varsayılan bıçak payı (cm) */
  kerf: number;
  /** Kapak fuga boşluğu (cm) */
  doorGap: number;
  /** Arkalık fuga boşluğu (cm) */
  backGap: number;
  /** İç raf yan fit payı (cm) — raf genişliğinden düşülür */
  shelfFit: number;
  /** İç raf sırt payı (cm) — raf derinliğinden düşülür */
  shelfBackClear: number;
  /** Raf pimi çapı (cm) — 0.5 = Ø5 */
  pinDiameter: number;

  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const DEFAULT_SETTINGS = {
  thickness: 1.8,
  backThickness: 0.8,
  sheetW: 210,
  sheetH: 280,
  kerf: 0.3,
  doorGap: 0.4,
  backGap: 0.3,
  shelfFit: 0,
  shelfBackClear: 0,
  pinDiameter: 0.5,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
    }),
    {
      name: 'dd_settings',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
