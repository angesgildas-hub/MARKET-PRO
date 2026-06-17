import React, { useEffect, useState } from 'react';
import { Download, Monitor, Smartphone, X, Box } from 'lucide-react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [platform, setPlatform] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => {
    // Check if app is already running in standalone (installed) mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                          (window.navigator as any).standalone === true ||
                          document.referrer.includes('android-app://');
                          
    if (isStandalone) {
      console.log('[PWA] Already running in standalone installed app mode.');
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent browser's default install banner
      e.preventDefault();
      // Store the event so it can be triggered later
      setDeferredPrompt(e);
      // Determine platform
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setPlatform(isMobileDevice ? 'mobile' : 'desktop');
      // Show the install UI
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Also detect if the app was installed successfully
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] Market Pro has been successfully installed!');
      setDeferredPrompt(null);
      setShowPrompt(false);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the browser's native install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] User response to installation prompt: ${outcome}`);
    
    // Clear deferred prompt since it can only be used once
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] max-w-sm w-full bg-slate-900 border border-slate-800 rounded-[32px] p-6 shadow-2xl shadow-slate-950/80 leading-normal flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-5 duration-300">
      {/* Upper header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-600/10 border border-orange-500/20 flex items-center justify-center text-orange-500 shrink-0">
            {platform === 'desktop' ? <Monitor size={22} /> : <Smartphone size={22} />}
          </div>
          <div>
            <h4 className="font-black text-xs text-slate-100 uppercase tracking-wider">Installer Market Pro</h4>
            <p className="text-[10px] text-slate-400 mt-1 font-medium leading-relaxed">
              Utilisez l'application directement sur votre écran d'accueil sans passer par le navigateur !
            </p>
          </div>
        </div>
        <button 
          onClick={() => setShowPrompt(false)} 
          className="text-slate-500 hover:text-slate-300 transition-colors p-1.5 rounded-xl hover:bg-slate-850"
          type="button"
        >
          <X size={14} />
        </button>
      </div>

      {/* Action panel */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleInstallClick}
          className="flex-1 py-3 px-4 bg-orange-600 hover:bg-orange-700 active:bg-orange-850 text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all shadow-md shadow-orange-950/20 flex items-center justify-center gap-2 cursor-pointer group"
          type="button"
        >
          <Download size={11} className="group-hover:translate-y-px transition-transform" />
          Installer
        </button>
        <button
          onClick={() => setShowPrompt(false)}
          className="py-3 px-4 bg-slate-800 hover:bg-slate-750 text-slate-300 font-black text-[9px] uppercase tracking-widest rounded-xl transition-colors shrink-0"
          type="button"
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
