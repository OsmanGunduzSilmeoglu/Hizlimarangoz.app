import React, { useState } from 'react';
import { Mail, HelpCircle, Info, Settings, Trash2, Ruler, Layers, CircleDot, Download, Upload, Check, RotateCcw } from 'lucide-react';
import { clearAppData, APP_KEY_PREFIXES } from '../lib/storage';
import { useSettings, DEFAULT_SETTINGS } from '../state/settings';
import { shareText } from '../lib/share';

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** Uygulamaya ait tüm anahtarları tek JSON'da toplar (Özellik #16). */
function collectBackup(): string {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && APP_KEY_PREFIXES.some(p => k.startsWith(p))) {
      try {
        data[k] = JSON.parse(localStorage.getItem(k) ?? 'null');
      } catch {
        data[k] = localStorage.getItem(k);
      }
    }
  }
  return JSON.stringify({ app: 'DizaynDekor', version: APP_VERSION, date: new Date().toISOString(), data }, null, 2);
}

function restoreBackup(raw: string): { ok: boolean; count: number; error?: string } {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object') {
      return { ok: false, count: 0, error: 'Geçersiz yedek dosyası — "data" alanı bulunamadı.' };
    }
    let count = 0;
    for (const [k, v] of Object.entries(parsed.data as Record<string, unknown>)) {
      if (!APP_KEY_PREFIXES.some(p => k.startsWith(p))) continue;
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      count++;
    }
    return { ok: true, count };
  } catch {
    return { ok: false, count: 0, error: 'JSON okunamadı — dosya bozuk olabilir.' };
  }
}

interface NumFieldProps {
  label: string;
  value: number;
  unit: string;
  step?: number;
  onChange: (v: number) => void;
}

const NumField: React.FC<NumFieldProps> = ({ label, value, unit, step = 0.1, onChange }) => (
  <label className="flex items-center justify-between gap-3 py-2.5 border-b border-brand-900/5 last:border-0">
    <span className="text-sm text-brand-900/70 font-medium">{label}</span>
    <span className="flex items-center gap-2 shrink-0">
      <input
        type="number"
        step={step}
        min={0}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= 0) onChange(v);
        }}
        className="w-20 bg-brand-100 border border-brand-900/10 rounded-lg px-2 py-1.5 text-center font-black text-brand-900 outline-none focus:border-brand-500"
      />
      <span className="text-xs font-bold text-brand-900/40 w-8">{unit}</span>
    </span>
  </label>
);

const SettingsModule: React.FC = () => {
  const settings = useSettings();
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [exported, setExported] = useState(false);

  const exportBackup = async () => {
    const json = collectBackup();
    // Web: dosya olarak indir
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dizayndekor-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2500);
  };

  const doImport = () => {
    if (!importText.trim()) return;
    const res = restoreBackup(importText);
    if (res.ok) {
      setImportMsg({ ok: true, text: `${res.count} kayıt geri yüklendi. Uygulama yenileniyor…` });
      setTimeout(() => window.location.reload(), 1200);
    } else {
      setImportMsg({ ok: false, text: res.error ?? 'İçe aktarma başarısız.' });
    }
  };

  const segBtn = (active: boolean) =>
    `px-4 py-2 rounded-lg text-xs font-black tracking-wider border transition-all ${
      active ? 'bg-brand-900 text-brand-100 border-brand-900' : 'bg-brand-100 text-brand-900/50 border-brand-900/10 hover:text-brand-900'
    }`;

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 animate-fadeIn pb-20 items-stretch w-full">
      {/* Sol Kolon: Temel Ayarlar */}
      <div className="w-full lg:flex-1 shrink-0 flex flex-col">
        <div className="bg-brand-200 p-6 md:p-8 rounded-[2rem] shadow-sm border border-brand-900/10 h-full flex flex-col">
          <div className="flex items-center gap-3 mb-8">
            <Settings size={24} className="text-brand-500" />
            <h2 className="text-xl font-black text-brand-900 tracking-widest uppercase">
              Temel Ayarlar
            </h2>
          </div>
          <div className="space-y-6 flex-1">

          {/* MALZEME (EK-04 çözümü) */}
          <section className="bg-white p-6 rounded-3xl border border-brand-900/10 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-brand-900/60 mb-4 flex items-center gap-2">
              <Layers size={16} /> Malzeme
            </h3>
            <div className="mb-4">
              <div className="text-xs font-bold text-brand-900/50 uppercase tracking-wider mb-2">Gövde Kalınlığı</div>
              <div className="flex gap-2 flex-wrap">
                {[1.6, 1.8, 2.2].map(t => (
                  <button key={t} onClick={() => settings.set({ thickness: t })} className={segBtn(settings.thickness === t)}>
                    {t * 10} mm
                  </button>
                ))}
              </div>
            </div>
            <NumField label="Arkalık kalınlığı" value={settings.backThickness} unit="cm" onChange={(v) => settings.set({ backThickness: v })} />
            <NumField label="Varsayılan plaka genişliği" value={settings.sheetW} unit="cm" step={1} onChange={(v) => settings.set({ sheetW: v })} />
            <NumField label="Varsayılan plaka uzunluğu" value={settings.sheetH} unit="cm" step={1} onChange={(v) => settings.set({ sheetH: v })} />
            <NumField label="Varsayılan bıçak payı (kerf)" value={settings.kerf} unit="cm" onChange={(v) => settings.set({ kerf: Math.min(v, 1.5) })} />
          </section>

          {/* PAYLAR / TOLERANSLAR */}
          <section className="bg-white p-6 rounded-3xl border border-brand-900/10 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-brand-900/60 mb-4 flex items-center gap-2">
              <Ruler size={16} /> Paylar &amp; Toleranslar
            </h3>
            <NumField label="Kapak fuga boşluğu" value={settings.doorGap} unit="cm" onChange={(v) => settings.set({ doorGap: v })} />
            <NumField label="Arkalık fuga boşluğu" value={settings.backGap} unit="cm" onChange={(v) => settings.set({ backGap: v })} />
            <NumField label="İç raf yan fit payı" value={settings.shelfFit} unit="cm" onChange={(v) => settings.set({ shelfFit: v })} />
            <NumField label="İç raf sırt payı" value={settings.shelfBackClear} unit="cm" onChange={(v) => settings.set({ shelfBackClear: v })} />
          </section>

          {/* DELİK / PİM */}
          <section className="bg-white p-6 rounded-3xl border border-brand-900/10 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-brand-900/60 mb-4 flex items-center gap-2">
              <CircleDot size={16} /> Raf Pimi
            </h3>
            <div className="text-xs font-bold text-brand-900/50 uppercase tracking-wider mb-2">Pim Çapı</div>
            <div className="flex gap-2">
              {[0.5, 0.6, 0.8].map(d => (
                <button key={d} onClick={() => settings.set({ pinDiameter: d })} className={segBtn(settings.pinDiameter === d)}>
                  Ø{d * 10}
                </button>
              ))}
            </div>
            <p className="text-xs text-brand-900/50 mt-3">
              Raf modülündeki "Delik Merkezi" sütunu bu çapa göre hesaplanır.
            </p>
          </section>

          </div>
        </div>
      </div>

      {/* Sağ Kolon: Uygulama & Veri */}
      <div className="w-full lg:flex-1 shrink-0 flex flex-col">
        <div className="bg-brand-200 p-6 md:p-8 rounded-[2rem] shadow-sm border border-brand-900/10 h-full flex flex-col">
          <div className="flex items-center gap-3 mb-8">
            <Download size={24} className="text-brand-500" />
            <h2 className="text-xl font-black text-brand-900 tracking-widest uppercase">
              Uygulama & Veri
            </h2>
          </div>
          <div className="space-y-6 flex-1">

          {/* YEDEKLEME (#16) */}
          <section className="bg-white p-6 rounded-3xl border border-brand-900/10 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-brand-900/60 mb-4 flex items-center gap-2">
              <Download size={16} /> Yedekleme
            </h3>
            <p className="text-sm text-brand-900/70 mb-4 max-w-lg">
              Projeler, çalışma listesi, kesim verileri ve ayarlar tek JSON dosyasında dışa aktarılır.
            </p>
            <div className="flex gap-3 flex-wrap mb-4">
              <button
                onClick={exportBackup}
                className="bg-brand-900 text-brand-100 font-bold px-5 py-3 rounded-xl hover:bg-brand-900/90 transition-colors text-sm shadow-sm flex items-center gap-2"
              >
                {exported ? <Check size={16} /> : <Download size={16} />}
                {exported ? 'Aktarıldı' : 'Dışa Aktar'}
              </button>
            </div>
            <div className="bg-brand-100 rounded-2xl p-4 border border-brand-900/5">
              <div className="text-xs font-bold text-brand-900/50 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Upload size={12} /> İçe Aktar
              </div>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Yedek JSON içeriğini buraya yapıştırın…"
                rows={3}
                className="w-full bg-white border border-brand-900/10 rounded-xl px-3 py-2 text-xs font-mono text-brand-900 outline-none focus:border-brand-500 mb-2"
              />
              <button
                onClick={doImport}
                disabled={!importText.trim()}
                className="bg-brand-500 text-brand-900 font-bold px-4 py-2 rounded-lg text-xs disabled:opacity-40 hover:bg-brand-500/90 transition-colors"
              >
                Geri Yükle
              </button>
              {importMsg && (
                <p className={`text-xs font-bold mt-2 ${importMsg.ok ? 'text-green-700' : 'text-red-600'}`}>{importMsg.text}</p>
              )}
            </div>
          </section>

          {/* İLETİŞİM */}
          <section className="bg-white p-6 rounded-3xl border border-brand-900/10 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-bl-full pointer-events-none"></div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-brand-900/60 mb-4 flex items-center gap-2">
              <HelpCircle size={16} /> Yardım ve İletişim
            </h3>
            <div className="flex items-center gap-4 bg-brand-100 p-4 rounded-xl border border-brand-900/5">
              <div className="bg-brand-500 w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm">
                <Mail size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-brand-900/50 uppercase tracking-widest">E-Posta Adresi</span>
                <a href="mailto:osmangunduzsilmeoglu@gmail.com" className="font-black text-brand-900 hover:text-brand-500 transition-colors break-all">
                  osmangunduzsilmeoglu@gmail.com
                </a>
              </div>
            </div>
          </section>

          {/* HAKKINDA */}
          <section className="bg-white p-6 rounded-3xl border border-brand-900/10 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-brand-900/60 mb-4 flex items-center gap-2">
              <Info size={16} /> Uygulama Hakkında
            </h3>
            <div className="flex flex-col gap-2 text-sm text-brand-900/70 font-medium">
              <div className="flex justify-between items-center py-2 border-b border-brand-900/5">
                <span>Versiyon</span>
                <span className="font-bold text-brand-900">v{APP_VERSION}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-brand-900/5">
                <span>Geliştirici</span>
                <span className="font-bold text-brand-900">Osman Gündüz Silmeoğlu</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span>Lisans</span>
                <span className="font-bold text-brand-900">Tüm hakları saklıdır.</span>
              </div>
            </div>
          </section>

          {/* TEHLİKELİ BÖLGE */}
          <section className="bg-red-50 p-6 rounded-3xl border border-red-500/10 shadow-sm">
             <h3 className="text-sm font-bold uppercase tracking-widest text-red-600/80 mb-4 flex items-center gap-2">
              <Trash2 size={16} /> Veri Yönetimi
            </h3>
            <p className="text-sm text-red-900/60 mb-4">
              Uygulamanın yerel kayıtlarını (projeler, çalışma listesi, kesim verileri, ayarlar) tamamen siler.
              Silmeden önce yukarıdan yedek almanız önerilir.
            </p>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => {
                  if (window.confirm('Tüm projeleriniz ve oluşturduğunuz dolaplar kalıcı olarak silinecektir. Onaylıyor musunuz?')) {
                    clearAppData();
                    window.location.reload();
                  }
                }}
                className="bg-white text-red-600 font-bold px-6 py-3 rounded-xl border border-red-200 hover:bg-red-600 hover:text-white transition-colors text-sm shadow-sm"
              >
                Tüm Verileri Temizle
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Tüm ayarlar varsayılan değerlere dönecek. Onaylıyor musunuz?')) {
                    settings.set({ ...DEFAULT_SETTINGS });
                  }
                }}
                className="bg-white text-brand-900/70 font-bold px-6 py-3 rounded-xl border border-brand-900/10 hover:bg-brand-100 transition-colors text-sm shadow-sm flex items-center gap-2"
              >
                <RotateCcw size={14} /> Ayarları Sıfırla
              </button>
            </div>
          </section>

          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModule;
