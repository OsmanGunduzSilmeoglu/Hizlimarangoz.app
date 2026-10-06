import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppModules, CuttingPart, SavedCabinet, SavedProject, SavedYukluk, YuklukCompartmentConfig, YuklukMountType } from '../types';
import { Lock, Unlock, Library, Calculator, Save, Copy, Check, Trash2, FolderOpen, Replace, AlertTriangle, Share2, Printer, Columns3 } from 'lucide-react';
import { loadJSON, saveJSON } from '../lib/storage';
import { newId } from '../lib/id';
import { shareText, canPrint } from '../lib/share';
import { dispatchPartsTransfer } from '../lib/events';
import { buildCabinetParts, validateCabinetInput } from '../domain/cabinet';
import {
  buildYuklukParts, validateYuklukInput, computeCompartmentWidth, computeDrawerFront,
  YuklukTolerances, DRAWER_SLIDE_CLEARANCE, DRAWER_BOTTOM_THICKNESS, MAX_COMPARTMENTS
} from '../domain/yukluk';
import YuklukSchema from './YuklukSchema';
import { useSettings } from '../state/settings';

interface CuttingListProps {
  navigate?: (module: AppModules) => void;
  activeModule?: AppModules;
}

const WORKLIST_KEY = 'um_worklist_cabinets';
const YUKLUK_WORKLIST_KEY = 'um_worklist_yukluk';
const PROJECTS_KEY = 'um_projects';
export const CUTTING_PARTS_KEY = 'um_cutting_parts';

const isCabinetArray = (v: unknown): v is SavedCabinet[] =>
  Array.isArray(v) && v.every(c =>
    c && typeof c === 'object' &&
    ((c as any).type === 'BASE' || (c as any).type === 'WALL') &&
    Array.isArray((c as any).parts)
  );

const isYuklukArray = (v: unknown): v is SavedYukluk[] =>
  Array.isArray(v) && v.every(m =>
    m && typeof m === 'object' &&
    typeof (m as any).compartmentCount === 'number' &&
    ((m as any).mountType === 'uzerine-oturan' || (m as any).mountType === 'arasina-giren') &&
    typeof (m as any).quantity === 'number' &&
    (m as any).dims && typeof (m as any).dims === 'object' &&
    typeof (m as any).dims.w === 'string' && typeof (m as any).dims.h === 'string' &&
    Array.isArray((m as any).compartments) &&
    Array.isArray((m as any).parts)
  );

const isProjectArray = (v: unknown): v is SavedProject[] =>
  Array.isArray(v) && v.every(p =>
    p && typeof p === 'object' &&
    typeof (p as any).name === 'string' &&
    Array.isArray((p as any).cabinets)
  );

// Eski kayıtlardaki sayısal id'leri string'e çevir
const normalizeCabinets = (cabs: SavedCabinet[]): SavedCabinet[] =>
  cabs.map(c => ({ ...c, id: String(c.id) }));

const CuttingList: React.FC<CuttingListProps> = ({ navigate, activeModule }) => {
  const settings = useSettings();
  const THICKNESS = settings.thickness;

  const isArchiveView = activeModule === AppModules.ARCHIVE;
  const [type, setType] = useState<'BASE' | 'WALL' | 'TALL'>('BASE');

  // Varsayılan değerler: Alt Dolap (h:77, d:60)
  const [dims, setDims] = useState({ h: '77', w: '', d: '60' });

  const [shelves, setShelves] = useState('');
  const [cabQty, setCabQty] = useState('1');

  // Yapı seçenekleri (Özellik #4/#5): arkalık + kapak
  const [includeBack, setIncludeBack] = useState(true);
  const [doors, setDoors] = useState<0 | 1 | 2>(0);

  // Kilitli alanlar
  const [lockedDims, setLockedDims] = useState({ h: false, w: false, d: false, shelves: false });

  // Çalışma listesi — kalıcı (ARCH-01)
  const [savedCabinets, setSavedCabinets] = useState<SavedCabinet[]>(() => {
    const stored = loadJSON(WORKLIST_KEY, isCabinetArray);
    return stored ? normalizeCabinets(stored) : [];
  });

  // Yüklük modülleri — dolap listesine paralel, bağımsız çalışma listesi
  const [savedYuklukModules, setSavedYuklukModules] = useState<SavedYukluk[]>(() => {
    const stored = loadJSON(YUKLUK_WORKLIST_KEY, isYuklukArray);
    return stored ?? [];
  });

  // Yüklük builder — satır içi panel state'i (modal yok)
  const [yuklukBuilderOpen, setYuklukBuilderOpen] = useState(false);
  const [yuklukDims, setYuklukDims] = useState({ h: '', w: '', d: '' }); // varsayılan/tahmini ölçü YOK
  const [yuklukCompartmentCount, setYuklukCompartmentCount] = useState('');
  const [yuklukMountType, setYuklukMountType] = useState<YuklukMountType>('uzerine-oturan');
  const [yuklukCompartments, setYuklukCompartments] = useState<YuklukCompartmentConfig[]>([]);
  const [selectedCompartment, setSelectedCompartment] = useState<number | null>(null);
  const [yuklukQty, setYuklukQty] = useState('1');
  const [yuklukIncludeBack, setYuklukIncludeBack] = useState(false); // duvar nişi montajı — varsayılan arkalıksız

  const [projects, setProjects] = useState<SavedProject[]>(() => {
    const stored = loadJSON(PROJECTS_KEY, isProjectArray);
    return stored ?? [];
  });

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'done'>('idle');
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    const okCabinets = saveJSON(WORKLIST_KEY, savedCabinets);
    const okYukluk = saveJSON(YUKLUK_WORKLIST_KEY, savedYuklukModules);
    setStorageError(!okCabinets || !okYukluk);
  }, [savedCabinets, savedYuklukModules]);

  const saveProject = () => {
    if (!projectName.trim()) return;

    const newProject: SavedProject = {
      id: newId(),
      name: projectName,
      date: new Date().toLocaleDateString('tr-TR'),
      cabinets: savedCabinets,
      yuklukModules: savedYuklukModules
    };

    const updatedProjects = [newProject, ...projects];
    setProjects(updatedProjects);
    if (!saveJSON(PROJECTS_KEY, updatedProjects)) {
      setStorageError(true);
    }

    setShowSaveModal(false);
    setProjectName('');
    if (navigate) navigate(AppModules.ARCHIVE);
  };

  const deleteProject = (id: string) => {
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated);
    saveJSON(PROJECTS_KEY, updated);
  };

  const loadProject = (project: SavedProject) => {
    const existingCount = savedCabinets.length + savedYuklukModules.length;
    if (existingCount > 0) {
      const ok = window.confirm(
        `Çalışma listenizde ${existingCount} modül var. "${project.name}" yüklenirse mevcut liste değiştirilecek. Devam edilsin mi?`
      );
      if (!ok) return;
    }
    setSavedCabinets(normalizeCabinets(project.cabinets));
    // Eski projelerde alan yok (undefined) ve dışarıdan yüklenen yedek bozuk olabilir —
    // guard'dan geçmeyen veri sessizce çökme yaratmasın
    setSavedYuklukModules(isYuklukArray(project.yuklukModules) ? project.yuklukModules : []);
    if (navigate) navigate(AppModules.CUTTING_LIST);
  };

  const validationErrors = useMemo(
    () => validateCabinetInput(type, dims, shelves, cabQty, THICKNESS),
    [type, dims, shelves, cabQty, THICKNESS]
  );

  const invalidFields = useMemo(() => new Set(validationErrors.map(e => e.field)), [validationErrors]);

  const currentParts = useMemo(() => {
    const h = parseFloat(dims.h);
    const w = parseFloat(dims.w);
    const d = parseFloat(dims.d);
    if (isNaN(h) || isNaN(w) || isNaN(d)) return [];
    if (validationErrors.length > 0) return [];

    return buildCabinetParts(
      {
        type, h, w, d,
        shelves: parseInt(shelves) || 0,
        quantity: parseInt(cabQty) || 1,
        includeBack,
        doors
      },
      {
        thickness: THICKNESS,
        backThickness: settings.backThickness,
        backGap: settings.backGap,
        doorGap: settings.doorGap,
        shelfFit: settings.shelfFit,
        shelfBackClear: settings.shelfBackClear
      }
    );
  }, [type, dims, shelves, cabQty, includeBack, doors, validationErrors, THICKNESS, settings.backThickness, settings.backGap, settings.doorGap, settings.shelfFit, settings.shelfBackClear]);

  const addCabinetToList = () => {
    if (currentParts.length === 0) return;

    const newCabinet: SavedCabinet = {
      id: newId(),
      type,
      dims: { ...dims },
      shelves: shelves || '0',
      quantity: parseInt(cabQty) || 1,
      parts: [...currentParts],
      includeBack,
      doors
    };

    setSavedCabinets(prev => [...prev, newCabinet]);
    if (!lockedDims.w) setDims(prev => ({ ...prev, w: '' }));
    if (!lockedDims.shelves) setShelves('');
    setCabQty('1');
  };

  const removeCabinet = (id: string) => {
    setSavedCabinets(prev => prev.filter(c => c.id !== id));
  };

  const removeYukluk = (id: string) => {
    setSavedYuklukModules(prev => prev.filter(m => m.id !== id));
  };

  // ---- Yüklük builder hesapları ----
  const yuklukTol = useMemo<YuklukTolerances>(() => ({
    thickness: THICKNESS,
    backThickness: settings.backThickness,
    backGap: settings.backGap,
    shelfFit: settings.shelfFit,
    shelfBackClear: settings.shelfBackClear,
    pinDiameter: settings.pinDiameter,
    drawerSlideClearance: DRAWER_SLIDE_CLEARANCE,
    drawerFrontGap: settings.doorGap, // çekmece cephesi de bir tür kapak — aynı fuga
    drawerBottomThickness: DRAWER_BOTTOM_THICKNESS
  }), [THICKNESS, settings.backThickness, settings.backGap, settings.shelfFit, settings.shelfBackClear, settings.pinDiameter, settings.doorGap]);

  // Geçerli bölme sayısı (1–12 tam sayı) — değilse null
  const yuklukN = useMemo(() => {
    const raw = parseFloat(yuklukCompartmentCount);
    return Number.isInteger(raw) && raw >= 1 && raw <= MAX_COMPARTMENTS ? raw : null;
  }, [yuklukCompartmentCount]);

  // Bölme config'leri her zaman N uzunluğunda görülür (eksikler boş başlar,
  // sayı azalınca fazlalar gizlenir ama state'te korunur)
  const effectiveCompartments = useMemo<YuklukCompartmentConfig[]>(
    () => yuklukN === null
      ? []
      : Array.from({ length: yuklukN }, (_, i) => yuklukCompartments[i] ?? { shelfCount: 0, drawerCount: 0 }),
    [yuklukN, yuklukCompartments]
  );

  const updateCompartment = (index: number, patch: Partial<YuklukCompartmentConfig>) => {
    setYuklukCompartments(prev => {
      const next = effectiveCompartments.map((c, i) => (i === index ? { ...c, ...patch } : c));
      // N geçici olarak azaltılmışsa N ötesindeki saklı konfigürasyonlar kırpılmasın
      return prev.length > next.length ? [...next, ...prev.slice(next.length)] : next;
    });
  };

  const selCompIdx = selectedCompartment !== null && yuklukN !== null && selectedCompartment < yuklukN
    ? selectedCompartment
    : null;

  const yuklukValidationErrors = useMemo(
    () => validateYuklukInput(yuklukDims, yuklukCompartmentCount, yuklukQty, effectiveCompartments, yuklukTol),
    [yuklukDims, yuklukCompartmentCount, yuklukQty, effectiveCompartments, yuklukTol]
  );

  const yuklukInvalidFields = useMemo(
    () => new Set(yuklukValidationErrors.map(e => e.field)),
    [yuklukValidationErrors]
  );

  // Şema, geçerli Genişlik + Bölme Sayısı girilir girilmez belirir (h beklenmez)
  const yuklukCw = useMemo(() => {
    const w = parseFloat(yuklukDims.w);
    if (isNaN(w) || yuklukN === null) return null;
    return computeCompartmentWidth(w, yuklukN, THICKNESS);
  }, [yuklukDims.w, yuklukN, THICKNESS]);

  const showYuklukSchema = yuklukCw !== null && !yuklukInvalidFields.has('w') && !yuklukInvalidFields.has('compartments');

  // Canlı önizleme — currentParts ile aynı rol (commit öncesi toplam parça özeti)
  const currentYuklukParts = useMemo(() => {
    const h = parseFloat(yuklukDims.h);
    const w = parseFloat(yuklukDims.w);
    const d = parseFloat(yuklukDims.d);
    if (isNaN(h) || isNaN(w) || isNaN(d) || yuklukN === null) return [];
    if (yuklukValidationErrors.length > 0) return [];

    return buildYuklukParts(
      {
        h, w, d,
        compartmentCount: yuklukN,
        mountType: yuklukMountType,
        quantity: parseInt(yuklukQty) || 1,
        includeBack: yuklukIncludeBack
      },
      effectiveCompartments,
      yuklukTol
    );
  }, [yuklukDims, yuklukN, yuklukMountType, yuklukQty, yuklukIncludeBack, effectiveCompartments, yuklukValidationErrors, yuklukTol]);

  const resetYuklukBuilder = () => {
    setYuklukDims({ h: '', w: '', d: '' });
    setYuklukCompartmentCount('');
    setYuklukMountType('uzerine-oturan');
    setYuklukCompartments([]);
    setSelectedCompartment(null);
    setYuklukQty('1');
    setYuklukIncludeBack(false);
    setYuklukBuilderOpen(false);
  };

  const addYuklukToList = () => {
    if (currentYuklukParts.length === 0 || yuklukN === null) return;

    const newModule: SavedYukluk = {
      id: newId(),
      dims: { ...yuklukDims },
      compartmentCount: yuklukN,
      mountType: yuklukMountType,
      quantity: parseInt(yuklukQty) || 1,
      compartments: effectiveCompartments.map(c => ({ ...c })),
      includeBack: yuklukIncludeBack,
      parts: [...currentYuklukParts]
    };

    setSavedYuklukModules(prev => [...prev, newModule]);
    resetYuklukBuilder();
  };

  const handleInput = (key: string, val: string) => {
    setDims(prev => ({ ...prev, [key]: val }));
  };

  const toggleLock = (field: 'h' | 'w' | 'd' | 'shelves') => {
    setLockedDims(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const switchType = (newType: 'BASE' | 'WALL' | 'TALL') => {
    if (newType === type) return; // CL-17
    setType(newType);
    if (newType === 'BASE') {
      setDims(prev => ({
        ...prev,
        h: lockedDims.h ? prev.h : '77',
        d: lockedDims.d ? prev.d : '60'
      }));
    } else if (newType === 'WALL') {
      setDims(prev => ({
        ...prev,
        h: lockedDims.h ? prev.h : '',
        d: lockedDims.d ? prev.d : '32'
      }));
    } else if (newType === 'TALL') {
      setDims(prev => ({
        ...prev,
        h: lockedDims.h ? prev.h : '200',
        d: lockedDims.d ? prev.d : '60'
      }));
    }
  };

  const aggregatedParts = useMemo(() => {
    const map = new Map<string, CuttingPart>();
    // Dolap + yüklük parçaları aynı havuzda toplanır — anahtarlama mantığı ortak
    [...savedCabinets, ...savedYuklukModules].forEach(mod => {
      mod.parts.forEach(part => {
        // Malzeme grubu anahtara dahil: 8 mm arkalık / 4 mm çekmece tabanı 18 mm gövdeyle birleşmez
        const key = `${part.material || 'body'}|${part.width}x${part.height}`;
        const existing = map.get(key);
        if (existing) {
          existing.count += part.count;
          if (!existing.name.includes(part.name)) {
            existing.name = `${existing.name} + ${part.name}`;
          }
          if (existing.description && part.description && !existing.description.includes(part.description)) {
            existing.description = `${existing.description} / ${part.description}`;
          }
        } else {
          map.set(key, { ...part });
        }
      });
    });
    // Gövde önce; arkalık ve çekmece tabanı (ayrı malzemeler) sona
    const materialRank = (m?: CuttingPart['material']) => (m === 'back' ? 1 : m === 'drawer-bottom' ? 2 : 0);
    return Array.from(map.values()).sort((a, b) =>
      materialRank(a.material) - materialRank(b.material) || b.width - a.width
    );
  }, [savedCabinets, savedYuklukModules]);

  const totalModuleCount =
    savedCabinets.reduce((acc, cab) => acc + cab.quantity, 0) +
    savedYuklukModules.reduce((acc, m) => acc + m.quantity, 0);

  const listAsText = () => {
    const body = aggregatedParts.filter(p => !p.material || p.material === 'body');
    const backs = aggregatedParts.filter(p => p.material === 'back');
    const kapaks = aggregatedParts.filter(p => p.material === 'kapak');
    const drawerBottoms = aggregatedParts.filter(p => p.material === 'drawer-bottom');
    const lines: string[] = [];
    lines.push(`DizaynDekor — Kesim Listesi (${totalModuleCount} modül, gövde ${THICKNESS} cm)`);
    body.forEach(p => lines.push(`${p.width} x ${p.height} = ${p.count} ADET  (${p.name})`));
    if (kapaks.length > 0) {
      lines.push(`--- KAPAK ---`);
      kapaks.forEach(p => lines.push(`${p.width} x ${p.height} = ${p.count} ADET  (${p.name})`));
    }
    if (backs.length > 0) {
      lines.push(`--- ARKALIK (${(settings.backThickness * 10).toFixed(0)} mm, ayrı malzeme) ---`);
      backs.forEach(p => lines.push(`${p.width} x ${p.height} = ${p.count} ADET`));
    }
    if (drawerBottoms.length > 0) {
      lines.push(`--- ÇEKMECE TABANI (${(DRAWER_BOTTOM_THICKNESS * 10).toFixed(0)} mm, ayrı malzeme) ---`);
      drawerBottoms.forEach(p => lines.push(`${p.width} x ${p.height} = ${p.count} ADET`));
    }
    return lines.join('\n');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(listAsText()).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(err => {
      console.error('Kopyalama başarısız', err);
    });
  };

  const shareList = async () => {
    const outcome = await shareText('DizaynDekor Kesim Listesi', listAsText());
    if (outcome !== 'failed') {
      setShareState('done');
      setTimeout(() => setShareState('idle'), 2000);
    }
  };

  const exportToCuttingModule = () => {
    const validMaterials = ['body', 'back', 'kapak', undefined];
    const partsToExport = aggregatedParts
      .filter(part => validMaterials.includes(part.material))
      .map(part => {
        let sheetGroup = 'malzeme';
        if (part.material === 'back') sheetGroup = 'arkalik';
        if (part.material === 'kapak') sheetGroup = 'kapak';
        
        return {
          id: newId(),
          name: part.name,
          w: part.width,
          h: part.height,
          count: part.count,
          rotatable: true,
          sheetGroup
        };
      });
    if (!saveJSON(CUTTING_PARTS_KEY, partsToExport)) {
      setStorageError(true);
      return;
    }
    dispatchPartsTransfer(); // keep-alive router: Kesim modülü mount'ta, event ile haber ver
    if (navigate) {
      navigate(AppModules.CUTTING);
    }
  };

  const segBtn = (active: boolean) =>
    `flex-1 py-2.5 rounded-lg text-xs font-black tracking-wider transition-all ${
      active ? 'bg-brand-900 text-brand-100 shadow-sm' : 'text-brand-900/50 hover:text-brand-900'
    }`;

  return (
    <div className="space-y-6 animate-fadeIn pb-6 text-brand-900 relative">

      {storageError && (
        <div className="bg-red-50 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3 text-sm font-bold text-red-600">
          <AlertTriangle size={18} className="shrink-0" />
          Veriler kaydedilemedi — cihaz depolaması dolu olabilir. Eski projeleri silmeyi deneyin.
        </div>
      )}

      {isArchiveView ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-slideUp">
          {projects.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-brand-900/40">
              <FolderOpen size={64} strokeWidth={1.5} className="mb-4 text-brand-900/20" />
              <p className="font-bold text-lg">Henüz kaydedilmiş proje yok.</p>
            </div>
          )}
          {projects.map(project => (
            <div key={project.id} className="bg-brand-200 border border-brand-900/10 p-6 rounded-3xl relative group active:scale-[0.98] transition-all shadow-sm">
              <div className="flex justify-between items-start mb-6">
                <div>
                   <h3 className="text-xl font-bold text-brand-900 leading-tight mb-1">{project.name}</h3>
                   <span className="text-xs text-brand-900/50 font-mono font-medium">{project.date}</span>
                </div>
                <button onClick={() => deleteProject(project.id)} className="p-2 rounded-xl text-brand-900/30 hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer" aria-label="Projeyi sil">
                   <Trash2 size={20} />
                </button>
              </div>
              <div className="flex gap-2 mb-6">
                <div className="text-[10px] text-brand-900 bg-brand-100 px-3 py-1.5 rounded-lg font-bold border border-brand-900/5">
                  {project.cabinets.length + (project.yuklukModules?.length ?? 0)} Modül
                </div>
                <div className="text-[10px] text-brand-900 bg-brand-100 px-3 py-1.5 rounded-lg font-bold border border-brand-900/5">
                   {project.cabinets.reduce((acc, c) => acc + c.parts.length, 0) + (project.yuklukModules ?? []).reduce((acc, m) => acc + m.parts.length, 0)} Parça
                </div>
              </div>
              <button
                onClick={() => loadProject(project)}
                className="w-full py-3.5 rounded-xl bg-brand-900 hover:bg-brand-900/90 text-brand-100 font-bold shadow-md active:translate-y-1 transition-all"
              >
                Projeyi Yükle
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
          {/* Sol Kolon: Form / Girişler */}
          <div className="w-full lg:w-80 xl:w-96 shrink-0 lg:sticky lg:top-4 flex flex-col gap-6 order-1">
            {/* Type Selector */}
            <div className="grid grid-cols-3 gap-2 print:hidden">
            <button
              onClick={() => switchType('BASE')}
              className={`py-4 rounded-2xl font-black text-xs md:text-sm tracking-widest transition-all flex items-center justify-center border-2 shadow-sm ${
                type === 'BASE'
                ? 'bg-brand-500 border-brand-500 text-brand-900 shadow-md shadow-brand-500/20'
                : 'bg-brand-200 border-brand-900/10 text-brand-900/50 hover:bg-brand-200/80 hover:text-brand-900/80'
              }`}
            >
              ALT DOLAP
            </button>
            <button
              onClick={() => switchType('WALL')}
              className={`py-4 rounded-2xl font-black text-xs md:text-sm tracking-widest transition-all flex items-center justify-center border-2 shadow-sm ${
                type === 'WALL'
                ? 'bg-brand-500 border-brand-500 text-brand-900 shadow-md shadow-brand-500/20'
                : 'bg-brand-200 border-brand-900/10 text-brand-900/50 hover:bg-brand-200/80 hover:text-brand-900/80'
              }`}
            >
              ÜST DOLAP
            </button>
            <button
              onClick={() => switchType('TALL')}
              className={`py-4 rounded-2xl font-black text-xs md:text-sm tracking-widest transition-all flex items-center justify-center border-2 shadow-sm ${
                type === 'TALL'
                ? 'bg-brand-500 border-brand-500 text-brand-900 shadow-md shadow-brand-500/20'
                : 'bg-brand-200 border-brand-900/10 text-brand-900/50 hover:bg-brand-200/80 hover:text-brand-900/80'
              }`}
            >
              BOY DOLAP
            </button>
          </div>

          {/* Yüklük Modülü — Alt/Üst Dolap akışından bağımsız alt-akış açan eylem
              (kesikli kenarlık: mod anahtarı değil, ayrı bir builder açar)
              NOT: Kullanıcı isteği üzerine geçici olarak deaktif edildi.
          <button
            onClick={() => setYuklukBuilderOpen(v => !v)}
            className={`w-full py-4 rounded-2xl font-black text-sm tracking-widest border-2 border-dashed transition-all flex items-center justify-center gap-2 print:hidden ${
              yuklukBuilderOpen
              ? 'border-brand-500 text-brand-900 bg-brand-500/10'
              : 'border-brand-900/20 text-brand-900/60 hover:border-brand-500 hover:text-brand-900'
            }`}
          >
            <Columns3 size={18} strokeWidth={2.5} /> YÜKLÜK MODÜLÜ EKLE
          </button>
          */}

          {/* Inputs */}
          <div className="bg-brand-200 p-6 rounded-[2rem] shadow-sm border border-brand-900/10 relative print:hidden">

             <div className="grid grid-cols-2 gap-4 mb-6">
                {([
                  { key: 'h', label: 'Yükseklik', value: dims.h, onChange: (v: string) => handleInput('h', v) },
                  { key: 'w', label: 'Genişlik', value: dims.w, onChange: (v: string) => handleInput('w', v) },
                  { key: 'd', label: 'Derinlik', value: dims.d, onChange: (v: string) => handleInput('d', v) },
                  { key: 'shelves', label: 'Raf Sayısı', value: shelves, onChange: (v: string) => setShelves(v) },
                ] as const).map(field => (
                  <div key={field.key} className={`bg-brand-100 p-3 rounded-[1.25rem] border relative group shadow-inner ${invalidFields.has(field.key) ? 'border-red-500/60 ring-1 ring-red-500/40' : 'border-brand-900/5'}`}>
                    <div className="absolute top-2.5 right-2.5 z-10">
                      <button
                        onClick={() => toggleLock(field.key)}
                        aria-label={`${field.label} kilidi`}
                        className={`p-1.5 rounded-lg transition-all ${lockedDims[field.key] ? 'bg-brand-500/20 text-brand-900' : 'text-brand-900/30 hover:text-brand-900/60'}`}
                      >
                        {lockedDims[field.key] ? <Lock size={16} strokeWidth={2.5} /> : <Unlock size={16} strokeWidth={2.5} />}
                      </button>
                    </div>
                    <label className="block text-[10px] text-center text-brand-900/50 font-black uppercase mt-1 tracking-widest">{field.label}</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      placeholder="0"
                      className={`w-full bg-transparent text-center text-4xl font-black py-2 outline-none transition-colors ${lockedDims[field.key] ? 'text-brand-500' : 'text-brand-900 placeholder:text-brand-900/10'}`}
                    />
                  </div>
                ))}
             </div>

             {/* Yapı seçenekleri: Arkalık + Kapak (#4/#5) */}
             <div className="grid grid-cols-2 gap-4 mb-6">
               <div className="bg-brand-100 p-2 rounded-2xl border border-brand-900/5 shadow-inner">
                 <div className="text-[9px] text-center text-brand-900/40 font-black uppercase tracking-widest mb-1">Arkalık ({(settings.backThickness * 10).toFixed(0)} mm)</div>
                 <div className="flex gap-1">
                   <button onClick={() => setIncludeBack(true)} className={segBtn(includeBack)}>VAR</button>
                   <button onClick={() => setIncludeBack(false)} className={segBtn(!includeBack)}>YOK</button>
                 </div>
               </div>
               <div className="bg-brand-100 p-2 rounded-2xl border border-brand-900/5 shadow-inner">
                 <div className="text-[9px] text-center text-brand-900/40 font-black uppercase tracking-widest mb-1">Kapak (fuga {settings.doorGap} cm)</div>
                 <div className="flex gap-1">
                   <button onClick={() => setDoors(0)} className={segBtn(doors === 0)}>YOK</button>
                   <button onClick={() => setDoors(1)} className={segBtn(doors === 1)}>TEK</button>
                   <button onClick={() => setDoors(2)} className={segBtn(doors === 2)}>ÇİFT</button>
                 </div>
               </div>
             </div>

             {validationErrors.length > 0 && (
               <div className="mb-4 bg-red-50 border border-red-500/20 rounded-2xl p-4 space-y-1">
                 {validationErrors.map((err, i) => (
                   <div key={i} className="text-xs font-bold text-red-600 flex items-center gap-2">
                     <AlertTriangle size={14} className="shrink-0" /> {err.message}
                   </div>
                 ))}
               </div>
             )}

             <div className="flex gap-4">
                <div className="w-1/3">
                  <div className="relative h-16 group">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={cabQty}
                      onChange={(e) => setCabQty(e.target.value)}
                      placeholder="1"
                      className={`w-full h-full bg-brand-100 border rounded-2xl px-4 text-center font-bold text-xl text-brand-900 outline-none shadow-sm focus:border-brand-500 transition-colors placeholder:text-brand-900/20 ${invalidFields.has('qty') ? 'border-red-500/60' : 'border-brand-900/10'}`}
                    />
                    <div className="absolute top-1 text-[9px] w-full text-center text-brand-900/40 font-black uppercase tracking-widest pointer-events-none mt-1">ADET</div>
                  </div>
                </div>
                <button
                  onClick={addCabinetToList}
                  disabled={currentParts.length === 0}
                  className={`w-2/3 h-16 rounded-2xl font-black text-xl tracking-widest shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all ${
                    currentParts.length > 0
                    ? 'bg-brand-900 text-brand-100 hover:bg-brand-900/90 shadow-brand-900/20'
                    : 'bg-brand-100 text-brand-900/30 border border-brand-900/10 cursor-not-allowed shadow-none'
                  }`}
                >
                  EKLE <span className="text-3xl leading-none -mt-1">+</span>
                </button>
             </div>
          </div>

          {/* Yüklük Builder — satır içi panel (modal yok), Alt/Üst Dolap akışından bağımsız */}
          {yuklukBuilderOpen && (
            <div className="bg-brand-200 p-6 rounded-[2rem] shadow-sm border border-brand-900/10 relative print:hidden animate-slideUp">
              <h3 className="text-sm font-black text-brand-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Columns3 size={18} /> Yüklük Modülü
              </h3>

              {/* Ölçüler + bölme sayısı — hepsi boş başlar, varsayılan yok */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {([
                  { key: 'h', label: 'Yükseklik', value: yuklukDims.h, onChange: (v: string) => setYuklukDims(p => ({ ...p, h: v })) },
                  { key: 'w', label: 'Genişlik', value: yuklukDims.w, onChange: (v: string) => setYuklukDims(p => ({ ...p, w: v })) },
                  { key: 'd', label: 'Derinlik', value: yuklukDims.d, onChange: (v: string) => setYuklukDims(p => ({ ...p, d: v })) },
                  { key: 'compartments', label: 'Bölme Sayısı', value: yuklukCompartmentCount, onChange: (v: string) => setYuklukCompartmentCount(v) },
                ] as const).map(field => (
                  <div key={field.key} className={`bg-brand-100 p-3 rounded-[1.25rem] border relative shadow-inner ${yuklukInvalidFields.has(field.key) ? 'border-red-500/60 ring-1 ring-red-500/40' : 'border-brand-900/5'}`}>
                    <label className="block text-[10px] text-center text-brand-900/50 font-black uppercase mt-1 tracking-widest">{field.label}</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      placeholder="0"
                      className="w-full bg-transparent text-center text-4xl font-black py-2 outline-none text-brand-900 placeholder:text-brand-900/10"
                    />
                  </div>
                ))}
              </div>

              {/* Montaj tipi + arkalık (varsayılan YOK) */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-brand-100 p-2 rounded-2xl border border-brand-900/5 shadow-inner">
                  <div className="text-[9px] text-center text-brand-900/40 font-black uppercase tracking-widest mb-1">Montaj Tipi</div>
                  <div className="flex gap-1">
                    <button onClick={() => setYuklukMountType('uzerine-oturan')} className={segBtn(yuklukMountType === 'uzerine-oturan')}>ÜZERİNE BİNER</button>
                    <button onClick={() => setYuklukMountType('arasina-giren')} className={segBtn(yuklukMountType === 'arasina-giren')}>ARASINA GİRER</button>
                  </div>
                  <p className="text-[9px] text-center text-brand-900/40 font-bold mt-1.5 px-1">
                    {yuklukMountType === 'uzerine-oturan'
                      ? 'Taban/tavan tam genişlik — dikmeler üzerine oturur'
                      : 'Dikmeler tam boy — taban/tavan bölme arasına girer'}
                  </p>
                </div>
                <div className="bg-brand-100 p-2 rounded-2xl border border-brand-900/5 shadow-inner">
                  <div className="text-[9px] text-center text-brand-900/40 font-black uppercase tracking-widest mb-1">Arkalık ({(settings.backThickness * 10).toFixed(0)} mm)</div>
                  <div className="flex gap-1">
                    <button onClick={() => setYuklukIncludeBack(true)} className={segBtn(yuklukIncludeBack)}>VAR</button>
                    <button onClick={() => setYuklukIncludeBack(false)} className={segBtn(!yuklukIncludeBack)}>YOK</button>
                  </div>
                  <p className="text-[9px] text-center text-brand-900/40 font-bold mt-1.5 px-1">
                    Duvar nişine montajda genelde arkalıksız
                  </p>
                </div>
              </div>

              {yuklukValidationErrors.length > 0 && (
                <div className="mb-6 bg-red-50 border border-red-500/20 rounded-2xl p-4 space-y-1">
                  {yuklukValidationErrors.map((err, i) => (
                    <div key={i} className="text-xs font-bold text-red-600 flex items-center gap-2">
                      <AlertTriangle size={14} className="shrink-0" /> {err.message}
                    </div>
                  ))}
                </div>
              )}

              {/* Şema — geçerli Genişlik + Bölme Sayısı girilir girilmez belirir */}
              {showYuklukSchema && yuklukN !== null ? (
                <div className="rounded-3xl overflow-hidden border border-brand-900/10 mb-6">
                  <YuklukSchema
                    h={parseFloat(yuklukDims.h)}
                    w={parseFloat(yuklukDims.w)}
                    d={parseFloat(yuklukDims.d)}
                    compartmentCount={yuklukN}
                    mountType={yuklukMountType}
                    compartments={effectiveCompartments}
                    selectedIndex={selCompIdx}
                    onSelectCompartment={(i) => setSelectedCompartment(prev => (prev === i ? null : i))}
                    thickness={THICKNESS}
                    pinDiameter={settings.pinDiameter}
                  />
                  <p className="bg-brand-100 text-[10px] text-center text-brand-900/40 font-bold uppercase tracking-widest py-2">
                    Raf / çekmece eklemek için bölmeye dokunun
                  </p>
                </div>
              ) : (
                <div className="mb-6 bg-brand-100 rounded-3xl border border-brand-900/5 shadow-inner p-8 text-center">
                  <Columns3 size={40} strokeWidth={1.5} className="mx-auto mb-3 text-brand-900/20" />
                  <p className="text-xs font-bold text-brand-900/40">Genişlik ve bölme sayısı girildiğinde şema oluşur.</p>
                </div>
              )}

              {/* Bölme aksiyon paneli — şemanın altında satır içi (modal/slide-over değil) */}
              {selCompIdx !== null && showYuklukSchema && (() => {
                const comp = effectiveCompartments[selCompIdx];
                const hVal = parseFloat(yuklukDims.h);
                const dVal = parseFloat(yuklukDims.d);
                const innerH = !isNaN(hVal) ? hVal - 2 * THICKNESS : null;
                const front = yuklukCw !== null && innerH !== null && comp.drawerCount > 0
                  ? computeDrawerFront(yuklukCw, innerH, comp.drawerCount, yuklukTol)
                  : null;
                return (
                  <div className="bg-brand-100 rounded-[2rem] border border-brand-900/5 shadow-inner p-6 mb-6 animate-fadeIn">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-black text-sm tracking-widest text-brand-900 uppercase">Bölme {selCompIdx + 1}</h4>
                      <button
                        onClick={() => setSelectedCompartment(null)}
                        aria-label="Bölme panelini kapat"
                        className="bg-brand-200 w-7 h-7 rounded-full flex items-center justify-center hover:bg-brand-200/80 transition-colors text-brand-900/50 border border-brand-900/5"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className={`bg-brand-200 p-3 rounded-[1.25rem] border shadow-inner ${yuklukInvalidFields.has(`comp-${selCompIdx}`) ? 'border-red-500/60' : 'border-brand-900/5'}`}>
                        <label className="block text-[10px] text-center text-brand-900/50 font-black uppercase tracking-widest">Raf Sayısı</label>
                        <input
                          type="number" inputMode="numeric" min="0"
                          value={comp.shelfCount || ''}
                          onChange={(e) => updateCompartment(selCompIdx, { shelfCount: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                          placeholder="0"
                          className="w-full bg-transparent text-center text-3xl font-black py-1 outline-none text-brand-900 placeholder:text-brand-900/10"
                        />
                      </div>
                      <div className={`bg-brand-200 p-3 rounded-[1.25rem] border shadow-inner ${yuklukInvalidFields.has(`comp-${selCompIdx}`) ? 'border-red-500/60' : 'border-brand-900/5'}`}>
                        <label className="block text-[10px] text-center text-brand-900/50 font-black uppercase tracking-widest">Çekmece Sayısı</label>
                        <input
                          type="number" inputMode="numeric" min="0"
                          value={comp.drawerCount || ''}
                          onChange={(e) => updateCompartment(selCompIdx, { drawerCount: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                          placeholder="0"
                          className="w-full bg-transparent text-center text-3xl font-black py-1 outline-none text-brand-900 placeholder:text-brand-900/10"
                        />
                      </div>
                    </div>
                    {(comp.shelfCount > 0 || comp.drawerCount > 0) && (
                      <div className="space-y-1 text-xs font-bold text-brand-900/70 text-center">
                        {comp.shelfCount > 0 && yuklukCw !== null && !isNaN(dVal) && (
                          <div>{comp.shelfCount} raf → {Number((yuklukCw - settings.shelfFit).toFixed(2))} x {Number((dVal - settings.shelfBackClear).toFixed(2))} cm</div>
                        )}
                        {front && (
                          <div>{comp.drawerCount} çekmece → cephe {front.width} x {front.height} cm</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Commit öncesi toplam parça özeti — canlı önizleme */}
              {currentYuklukParts.length > 0 && (
                <div className="mb-6 bg-brand-100 rounded-2xl border border-brand-900/5 shadow-inner p-4">
                  <div className="text-[9px] font-black uppercase tracking-widest text-brand-900/40 mb-2 text-center">Üretilecek Parçalar</div>
                  <div className="space-y-1">
                    {currentYuklukParts.map((p, i) => (
                      <div key={i} className="flex justify-between gap-3 text-xs font-bold text-brand-900/80">
                        <span className="truncate">{p.name}</span>
                        <span className="font-mono whitespace-nowrap">{p.width} x {p.height} · {p.count} ad.</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <div className="w-1/4">
                  <div className="relative h-16">
                    <input
                      type="number" inputMode="numeric" min="1"
                      value={yuklukQty}
                      onChange={(e) => setYuklukQty(e.target.value)}
                      placeholder="1"
                      className={`w-full h-full bg-brand-100 border rounded-2xl px-2 text-center font-bold text-xl text-brand-900 outline-none shadow-sm focus:border-brand-500 transition-colors placeholder:text-brand-900/20 ${yuklukInvalidFields.has('qty') ? 'border-red-500/60' : 'border-brand-900/10'}`}
                    />
                    <div className="absolute top-1 text-[9px] w-full text-center text-brand-900/40 font-black uppercase tracking-widest pointer-events-none mt-1">ADET</div>
                  </div>
                </div>
                <button
                  onClick={resetYuklukBuilder}
                  className="w-1/4 h-16 rounded-2xl font-bold text-sm tracking-widest bg-brand-100 text-brand-900/60 border border-brand-900/10 hover:text-brand-900 hover:bg-brand-100/80 active:scale-95 transition-all"
                >
                  İPTAL
                </button>
                <button
                  onClick={addYuklukToList}
                  disabled={currentYuklukParts.length === 0}
                  className={`w-2/4 h-16 rounded-2xl font-black text-base tracking-widest shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all ${
                    currentYuklukParts.length > 0
                    ? 'bg-brand-900 text-brand-100 hover:bg-brand-900/90 shadow-brand-900/20'
                    : 'bg-brand-100 text-brand-900/30 border border-brand-900/10 cursor-not-allowed shadow-none'
                  }`}
                >
                  MODÜLÜ LİSTEYE EKLE <span className="text-2xl leading-none -mt-1">+</span>
                </button>
              </div>
            </div>
          )}
          </div>

          {/* Orta Kolon: Kesim Listesi ve Aksiyonlar */}
          <div className="w-full lg:w-auto flex-1 min-w-0 flex flex-col order-3 lg:order-2">
          {/* PDF Header - Print only */}
          <div className="hidden print:block border-b-4 border-brand-900 pb-6 mb-8 text-brand-900">
            <h1 className="text-4xl font-black italic">DizaynDekor</h1>
            <p>Liste Raporu</p>
          </div>

          {/* Final Cutting List Table */}
          {aggregatedParts.length > 0 ? (
            <div className="bg-brand-200 rounded-[2rem] shadow-sm border border-brand-900/10 overflow-hidden animate-slideUp print:shadow-none print:bg-white print:border-brand-900 print:rounded-none mt-6">
              <div className="bg-brand-900 px-6 py-5 flex justify-between items-center print:bg-brand-100 print:border-b-2 print:border-brand-900 border-b border-brand-900/10">
                <div className="flex flex-col">
                  <h3 className="text-brand-100 font-black text-lg flex items-center gap-2 print:text-brand-900 tracking-wide">
                    LİSTE
                  </h3>
                  <p className="text-brand-100/60 text-[10px] font-bold uppercase tracking-widest print:text-brand-900/60">Gövde {THICKNESS} cm · Arkalık {(settings.backThickness * 10).toFixed(0)} mm</p>
                </div>
                <div className="bg-brand-500 px-4 py-1.5 rounded-lg text-xs font-black text-brand-900 shadow-sm border border-brand-500/50">
                  {totalModuleCount} Modül
                </div>
              </div>
              <div className="overflow-x-auto select-text">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-brand-100/50 text-[10px] font-black text-brand-900/50 uppercase tracking-widest border-b border-brand-900/5 print:bg-white print:border-brand-900 print:text-black">
                      <th className="px-6 py-4 whitespace-nowrap">PARÇA</th>
                      <th className="px-6 py-4 whitespace-nowrap">ÖLÇÜ (cm)</th>
                      <th className="px-6 py-4 text-center whitespace-nowrap">ADET</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-900/5 print:divide-brand-900">
                    {aggregatedParts.map((part, idx) => (
                      <tr key={idx} className={`group hover:bg-brand-100/50 transition-colors print:hover:bg-transparent print:text-black ${part.material === 'back' || part.material === 'drawer-bottom' ? 'bg-brand-100/40' : ''}`}>
                        <td className="px-6 py-5">
                          <div className="font-extrabold text-brand-900 text-sm tracking-wide flex items-center gap-2">
                            {part.name}
                            {(part.material === 'back' || part.material === 'drawer-bottom') && (
                              <span className="text-[9px] bg-brand-500/20 text-brand-900 px-2 py-0.5 rounded-md font-black uppercase tracking-wider">Ayrı malzeme</span>
                            )}
                          </div>
                          <div className="text-[10px] text-brand-900/50 font-bold uppercase tracking-widest mt-0.5">{part.description}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xl font-black text-brand-900">{part.width}</span>
                            <span className="text-brand-900/40 font-bold text-xs print:text-brand-900">x</span>
                            <span className="font-mono text-xl font-black text-brand-900">{part.height}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <div className="bg-brand-100 rounded-xl py-1 px-4 inline-block border border-brand-900/5 shadow-inner print:bg-transparent print:p-0 print:border-none print:shadow-none">
                            <span className="text-2xl font-black text-brand-500 print:text-brand-900">
                              {part.count}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-6 bg-brand-100/50 border-t border-brand-900/5 flex flex-col gap-4 print:bg-white print:border-brand-900">
                 <div className="grid grid-cols-2 gap-4 print:hidden">
                    <button
                      className="bg-brand-100 text-brand-900 py-4 rounded-2xl text-sm font-bold border border-brand-900/10 hover:bg-brand-200 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 tracking-wide"
                      onClick={() => setShowSaveModal(true)}
                    >
                      <Save size={18} strokeWidth={2.5} /> KAYDET
                    </button>
                    <button
                      className={`${isCopied ? 'bg-brand-500/80 text-brand-900' : 'bg-brand-500 text-brand-900'} py-4 rounded-2xl text-sm font-black shadow-md hover:bg-brand-500/90 active:scale-95 transition-all border border-brand-900/10 flex items-center justify-center gap-2 tracking-wide`}
                      onClick={copyToClipboard}
                    >
                      {isCopied ? <Check size={18} strokeWidth={2.5} /> : <Copy size={18} strokeWidth={2.5} />}
                      {isCopied ? 'KOPYALANDI' : 'KOPYALA'}
                    </button>
                    <button
                      className="bg-brand-100 text-brand-900 py-4 rounded-2xl text-sm font-bold border border-brand-900/10 hover:bg-brand-200 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 tracking-wide"
                      onClick={shareList}
                    >
                      {shareState === 'done' ? <Check size={18} strokeWidth={2.5} /> : <Share2 size={18} strokeWidth={2.5} />}
                      {shareState === 'done' ? 'GÖNDERİLDİ' : 'PAYLAŞ'}
                    </button>
                    {canPrint() ? (
                      <button
                        className="bg-brand-100 text-brand-900 py-4 rounded-2xl text-sm font-bold border border-brand-900/10 hover:bg-brand-200 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 tracking-wide"
                        onClick={() => window.print()}
                      >
                        <Printer size={18} strokeWidth={2.5} /> YAZDIR
                      </button>
                    ) : <div />}
                 </div>

                 <div className="print:hidden">
                   <button
                     onClick={exportToCuttingModule}
                     className="w-full bg-brand-900 text-brand-100 py-4 rounded-2xl text-sm font-black tracking-widest flex items-center justify-center gap-2 hover:bg-brand-900/90 active:scale-95 transition-all shadow-md"
                   >
                     <Replace size={18} strokeWidth={2.5} /> KESİME AKTAR
                   </button>
                   {aggregatedParts.some(p => p.material === 'back' || p.material === 'drawer-bottom') && (
                     <p className="text-[10px] text-brand-900/40 font-bold uppercase tracking-widest text-center mt-2">
                       Arkalık ve çekmece tabanları ayrı malzeme olduğu için kesim optimizasyonuna dahil edilmez.
                     </p>
                   )}
                 </div>
              </div>
            </div>
          ) : (
            <div className="bg-brand-200/50 border border-brand-900/5 rounded-[2rem] p-12 text-center print:hidden shadow-inner mt-6">
              <Calculator size={48} strokeWidth={1.5} className="mx-auto mb-4 text-brand-900/20" />
              <h4 className="font-bold text-brand-900/50 text-sm uppercase tracking-widest mb-2">Liste Boş</h4>
              <p className="text-xs text-brand-900/40">Ölçüleri girin ve ekleyin.</p>
            </div>
          )}
          </div>

          {/* Sağ Kolon: Eklenen Modüller (Özet) */}
          <div className="w-full lg:w-64 xl:w-72 shrink-0 lg:sticky lg:top-4 flex flex-col order-2 lg:order-3">
            {(savedCabinets.length > 0 || savedYuklukModules.length > 0) && (
            <div className="flex flex-col gap-2 print:hidden mb-6 lg:mb-0 mt-4 lg:mt-0">
              <h3 className="w-full text-xs font-black text-brand-900/50 uppercase tracking-widest mb-2 hidden lg:block">Eklenen Modüller</h3>
              {[
                ...savedCabinets.map(cab => ({
                  id: cab.id,
                  qty: cab.quantity,
                  label: `${cab.type === 'BASE' ? 'Alt' : cab.type === 'WALL' ? 'Üst' : 'Boy'} ${cab.dims.w}x${cab.dims.h}${cab.doors ? ` · ${cab.doors}K` : ''}${cab.includeBack ? ' · S' : ''}`,
                  ariaLabel: 'Dolabı listeden çıkar',
                  remove: () => removeCabinet(cab.id)
                })),
                ...savedYuklukModules.map(mod => ({
                  id: mod.id,
                  qty: mod.quantity,
                  label: `Yüklük ${mod.dims.w}x${mod.dims.h} · ${mod.compartmentCount}B${mod.includeBack ? ' · S' : ''}`,
                  ariaLabel: 'Yüklüğü listeden çıkar',
                  remove: () => removeYukluk(mod.id)
                }))
              ].map(chip => (
                <div key={chip.id} className="bg-brand-200 text-brand-900 pl-4 pr-1.5 py-1.5 rounded-[1.25rem] text-xs font-bold flex items-center justify-between gap-2 animate-fadeIn border border-brand-900/10 shadow-sm shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-brand-500 bg-brand-100 px-2.5 py-1 rounded-full border border-brand-900/5">{chip.qty}x</span>
                    <span className="tracking-wide">{chip.label}</span>
                  </div>
                  <button
                    onClick={chip.remove}
                    aria-label={chip.ariaLabel}
                    className="bg-brand-100 w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors ml-1 text-brand-900/50 hover:border-red-500 border border-brand-900/5 shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  if (window.confirm('Çalışma listesindeki tüm modüller silinecek. Emin misiniz?')) {
                    setSavedCabinets([]);
                    setSavedYuklukModules([]);
                  }
                }}
                className="bg-red-50/50 text-red-500 px-5 py-3 rounded-[1.25rem] text-xs font-black tracking-widest uppercase hover:bg-red-500 hover:text-white transition-colors border border-red-500/10 shrink-0 w-full mt-2 shadow-sm active:scale-95"
              >
                Tümünü Temizle
              </button>
            </div>
            )}
          </div>
        </div>
      )}

      {/* SAVE PROJECT MODAL — portal (EK-01) */}
      {showSaveModal && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-brand-900/40 backdrop-blur-md flex items-center justify-center p-6 animate-fadeIn"
          onClick={() => setShowSaveModal(false)}
        >
          <div
            className="bg-brand-100 border border-brand-900/10 p-8 rounded-[2rem] w-full max-w-sm shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
             <button onClick={() => setShowSaveModal(false)} aria-label="Kapat" className="absolute top-4 right-4 bg-brand-200 w-8 h-8 rounded-full text-brand-900/50 hover:text-brand-900 hover:bg-brand-200/80 transition-colors flex items-center justify-center">✕</button>
             <h3 className="text-2xl font-black text-brand-900 mb-2 tracking-tight">Projeyi Kaydet</h3>
             <p className="text-brand-900/50 text-sm mb-6 font-medium">Arşivine eklemek için projeye bir isim ver.</p>
             <input
               autoFocus
               value={projectName}
               onChange={(e) => setProjectName(e.target.value)}
               placeholder="Örn: Mutfak Dolabı 1"
               className="w-full bg-brand-200 border border-brand-900/10 rounded-xl px-4 py-4 text-brand-900 text-lg font-bold outline-none focus:border-brand-500 mb-6 shadow-inner placeholder:text-brand-900/30"
               onKeyDown={(e) => {
                 if (e.key === 'Enter') saveProject();
                 if (e.key === 'Escape') setShowSaveModal(false);
               }}
             />
             <button onClick={saveProject} className="w-full py-4 rounded-xl bg-brand-900 text-brand-100 font-bold text-lg shadow-md active:scale-95 transition-transform hover:bg-brand-900/90 tracking-wide">
               Tamamla
             </button>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default CuttingList;
