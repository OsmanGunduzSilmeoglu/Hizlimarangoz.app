
import React from 'react';
import { AppModules } from '../types';
import { Ruler, ClipboardList, Disc3, Settings, Library } from 'lucide-react';

interface SidebarProps {
  activeModule: AppModules;
  setActiveModule: (module: AppModules) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeModule, setActiveModule }) => {
  // Ayarlar artık 4. sekme (EK-04/§7.5) — yüzen dişli butonu kaldırıldı
  const navItems = [
    { id: AppModules.CUTTING_LIST, label: 'Liste', icon: <ClipboardList size={24} /> },
    { id: AppModules.ARCHIVE, label: 'Arşiv', icon: <Library size={24} /> },
    { id: AppModules.SHELF_CALC, label: 'Raf', icon: <Ruler size={24} /> },
    { id: AppModules.CUTTING, label: 'Kesim', icon: <Disc3 size={24} /> },
    { id: AppModules.SETTINGS, label: 'Ayarlar', icon: <Settings size={24} /> },
  ];

  return (
    <>
      {/* DESKTOP NAVBAR */}
      <header className="hidden md:flex w-full bg-brand-200 border-b border-brand-900/10 z-30 shadow-sm transition-all pt-[max(0.5rem,env(safe-area-inset-top))] px-8 items-center justify-between pb-2 mt-2">
        <div className="font-black italic text-2xl text-brand-900">DizaynDekor</div>
        <nav className="flex gap-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveModule(item.id)}
              className={`group flex items-center gap-2 px-5 py-3 rounded-2xl transition-all duration-300 ${
                activeModule === item.id 
                  ? 'bg-brand-900 text-brand-100 shadow-md shadow-brand-900/20' 
                  : 'text-brand-900/60 hover:bg-brand-100 hover:text-brand-900'
              }`}
            >
              <span>{item.icon}</span>
              <span className="font-bold text-sm tracking-wide">{item.label}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* MOBILE BOTTOM NAVIGATION - COMPACT */}
      <nav className="bottom-nav md:hidden fixed bottom-0 left-0 right-0 bg-brand-200/95 backdrop-blur-xl border-t border-brand-900/10 z-50 pb-[max(5px,env(safe-area-inset-bottom))]">
        <div className="flex justify-around items-center px-4 py-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveModule(item.id)}
              className={`flex flex-col items-center justify-center py-2 px-4 rounded-2xl transition-all active:scale-95 ${
                 activeModule === item.id 
                 ? 'bg-brand-900 text-brand-100 shadow-md shadow-brand-900/20' 
                 : 'text-brand-900/60 hover:text-brand-900 hover:bg-brand-100'
              }`}
            >
              <div className="mb-1">
                {item.icon}
              </div>
              <span className={`text-[10px] font-bold tracking-wide`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
};

export default Sidebar;
