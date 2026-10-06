
export interface CalculationResult {
  gap: number;
  /** Raf ALT YÜZEYİ pozisyonları (alt tabandan, cm) */
  positions: number[];
  totalHeight: number;
  shelfCount: number;
  thickness: number;
}

export enum AppModules {
  CUTTING_LIST = 'CUTTING_LIST',
  ARCHIVE = 'ARCHIVE',
  SHELF_CALC = 'SHELF_CALC',
  CUTTING = 'CUTTING',
  SETTINGS = 'SETTINGS'
}

export interface CuttingPart {
  name: string;
  width: number;
  height: number;
  count: number;
  description?: string;
  /** 'back' = arkalık (8 mm), 'drawer-bottom' = çekmece tabanı (4 mm), 'kapak' = kapak/cephe — 18 mm gövde nesting'ine karışmaz */
  material?: 'body' | 'back' | 'drawer-bottom' | 'kapak';
}

export interface SavedCabinet {
  id: string;
  type: 'BASE' | 'WALL' | 'TALL';
  dims: { h: string; w: string; d: string };
  shelves: string;
  quantity: number;
  parts: CuttingPart[];
  includeBack?: boolean;
  doors?: 0 | 1 | 2;
}

export type YuklukMountType = 'uzerine-oturan' | 'arasina-giren';
// 'uzerine-oturan' = dikmeler taban/tavanın üstüne-altına biner (taban/tavan tam genişlik, dış eleman)
// 'arasina-giren'  = taban/tavan dikmelerin arasına girer (dikme tam boy, dış eleman)

export interface YuklukCompartmentConfig {
  shelfCount: number;
  drawerCount: number;
}

export interface SavedYukluk {
  id: string;
  dims: { h: string; w: string; d: string };
  compartmentCount: number;
  mountType: YuklukMountType;
  quantity: number;
  compartments: YuklukCompartmentConfig[]; // length === compartmentCount
  includeBack: boolean;                    // varsayılan false — yüklükler genelde duvar nişine monte
  parts: CuttingPart[];                    // commit anında üretilir (SavedCabinet.parts ile aynı desen)
}

export interface SavedProject {
  id: string;
  name: string;
  date: string;
  cabinets: SavedCabinet[];
  yuklukModules?: SavedYukluk[];
}
