
import React, { useState, useEffect, useRef } from 'react';
import { AppModules } from './types';
import ShelfCalculator from './components/ShelfCalculator';
import Sidebar from './components/Sidebar';
import CuttingList from './components/CuttingList';
import CuttingModule from './components/CuttingModule';
import SettingsModule from './components/SettingsModule';
import ErrorBoundary from './components/ErrorBoundary';

const App: React.FC = () => {
  const [activeModule, setActiveModule] = useState<AppModules>(AppModules.CUTTING_LIST);
  const [showExitHint, setShowExitHint] = useState(false);

  const activeModuleRef = useRef(activeModule);
  activeModuleRef.current = activeModule;
  const lastBackPress = useRef(0);

  // Tarayıcının varsayılan "Uygulamayı Yükle" (PWA) uyarısını engelle
  useEffect(() => {
    const preventInstallPrompt = (e: Event) => {
      e.preventDefault();
    };
    window.addEventListener('beforeinstallprompt', preventInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', preventInstallPrompt);
    };
  }, []);



  // Keep-alive router (rapor §6.3): modüller unmount edilmez, yalnız gizlenir.
  // Form durumu, kaydırma konumu ve hesap sonuçları sekmeler arasında yaşar;
  // her modülün kendi ErrorBoundary'si vardır — biri çökerse diğerleri yaşar.
  const modules: { id: AppModules; element: React.ReactNode }[] = [
    { id: AppModules.CUTTING_LIST, element: <CuttingList navigate={setActiveModule} activeModule={activeModule} /> },
    { id: AppModules.SHELF_CALC, element: <ShelfCalculator /> },
    { id: AppModules.CUTTING, element: <CuttingModule /> },
    { id: AppModules.SETTINGS, element: <SettingsModule /> },
  ];

  return (
    <div className="min-h-screen bg-brand-100 text-brand-900 flex flex-col antialiased select-none overflow-hidden">
      <Sidebar activeModule={activeModule} setActiveModule={setActiveModule} />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative w-full">
        <main className="flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-4 pb-20 md:p-8 md:pb-8 scroll-smooth no-scrollbar">
          <div className="max-w-[1600px] mx-auto w-full">
            {modules.map(m => {
              const isVisible = m.id === activeModule || (m.id === AppModules.CUTTING_LIST && activeModule === AppModules.ARCHIVE);
              return (
                <div key={m.id} className={isVisible ? '' : 'hidden'} aria-hidden={!isVisible}>
                  <ErrorBoundary>{m.element}</ErrorBoundary>
                </div>
              );
            })}
          </div>
        </main>

        {showExitHint && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[110] bg-brand-900 text-brand-100 text-xs font-bold px-5 py-3 rounded-full shadow-lg">
            Çıkmak için tekrar basın
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
