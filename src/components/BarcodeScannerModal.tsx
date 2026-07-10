import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, RefreshCw, Volume2, Info, CheckCircle, AlertTriangle, Zap } from 'lucide-react';
import { Product } from '../types';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onAddProduct: (product: Product) => void;
}

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  products,
  onAddProduct,
}: BarcodeScannerModalProps) {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isContinuous, setIsContinuous] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [scannedLogs, setScannedLogs] = useState<{ code: string; match?: Product; timestamp: string; status: 'success' | 'not_found' }[]>([]);
  
  // Flash torch state
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const lastScannedRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);

  // Play browser synth sound effect for barcode scanner beep
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(950, ctx.currentTime); // Standard POS barcode scanners use around ~950hz
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      console.warn('[Scanner Audio] Failed to emit feedback beep:', e);
    }
  };

  // List of cameras on initialization
  useEffect(() => {
    if (!isOpen) return;

    // Give a brief delay to let the modal layout mount properly
    const timer = setTimeout(() => {
      Html5Qrcode.getCameras()
        .then((devices) => {
          if (devices && devices.length > 0) {
            setCameras(devices);
            // Default to the first environment-facing / rear camera if available, or first camera overall
            const backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environnement') || d.label.toLowerCase().includes('rear'));
            setSelectedCameraId(backCam ? backCam.id : devices[0].id);
          } else {
            setError("Aucune caméra n'a été détectée sur cet appareil.");
          }
        })
        .catch((err) => {
          console.error('[Scanner Camera Lookup]:', err);
          setError("Impossible d'accéder aux caméras. Veuillez autoriser l'accès à la caméra.");
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [isOpen]);

  // Handle start and stop lifecycle
  useEffect(() => {
    if (!isOpen || !selectedCameraId) return;

    setError('');
    let activeScanner: Html5Qrcode | null = null;

    try {
      // Create reader instance
      activeScanner = new Html5Qrcode('barcode-scanner-reader');
      scannerRef.current = activeScanner;

      const onScanSuccess = (decodedText: string) => {
        const now = Date.now();
        // Prevent rapid duplicate scans within 1.5 seconds of the same code
        if (decodedText === lastScannedRef.current && now - lastScannedTimeRef.current < 1500) {
          return;
        }

        lastScannedRef.current = decodedText;
        lastScannedTimeRef.current = now;

        // Perform product match looking for barcode or SKU match
        const cleanedText = decodedText.trim();
        const matchedProduct = products.find(
          (p) => 
            (p.barcode && p.barcode.trim().toLowerCase() === cleanedText.toLowerCase()) ||
            (p.sku && p.sku.trim().toLowerCase() === cleanedText.toLowerCase())
        );

        playBeep();

        const timestampStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        if (matchedProduct) {
          if (matchedProduct.stock <= 0) {
            setScannedLogs((prev) => [
              { code: decodedText, match: matchedProduct, timestamp: timestampStr, status: 'not_found' },
              ...prev.slice(0, 4),
            ]);
            return;
          }
          
          // Add product to POS Cart
          onAddProduct(matchedProduct);

          // Log success scan
          setScannedLogs((prev) => [
            { code: decodedText, match: matchedProduct, timestamp: timestampStr, status: 'success' },
            ...prev.slice(0, 4),
          ]);

          if (!isContinuous) {
            onClose();
          }
        } else {
          // Log unmatched scan
          setScannedLogs((prev) => [
            { code: decodedText, timestamp: timestampStr, status: 'not_found' },
            ...prev.slice(0, 4),
          ]);
        }
      };

      const startScanning = () => {
        if (!activeScanner) return;
        isScanningRef.current = true;
        
        activeScanner.start(
          selectedCameraId,
          {
            fps: 26, // HIGH-PERFORMANCE RATE (26 frames per second for ultra-responsive scanning)
            // Custom QR/Barcode overlay box
            qrbox: (width, height) => {
              // Wide landscape rectangle specifically for barcode formats
              const boxWidth = Math.min(width - 40, 360);
              const boxHeight = Math.min(height - 40, 160);
              return { width: boxWidth, height: boxHeight };
            },
            aspectRatio: 1.777778, // 16:9 aspect ratio standard for webcams
          },
          onScanSuccess,
          () => {
            // Unhandled frame decode failures are ignored silently
          }
        ).then(() => {
          // Probe capabilities to see if flashlight/torch is supported
          setTimeout(() => {
            try {
              if (activeScanner) {
                const track = (activeScanner as any).getRunningTrack();
                const capabilities = track?.getCapabilities() as any;
                if (capabilities && capabilities.torch) {
                  setTorchSupported(true);
                } else {
                  setTorchSupported(false);
                }
              }
            } catch (e) {
              console.log("[Scanner] Torch not supported or check failed:", e);
              setTorchSupported(false);
            }
          }, 800);
        }).catch((err) => {
          console.error('[Scanner Start Error]:', err);
          setError("Impossible de demarrer le scanneur : " + (err.message || err));
          isScanningRef.current = false;
        });
      };

      startScanning();

    } catch (e: any) {
      setError("Erreur d'initialisation du scanneur : " + e.message);
    }

    return () => {
      // Cleanup current scanner instance on unmount or selected camera change
      if (activeScanner && isScanningRef.current) {
        isScanningRef.current = false;
        activeScanner.stop()
          .then(() => {
            console.log('[Scanner Cleanup] Stopped camera stream successfully.');
          })
          .catch((err) => {
            console.warn('[Scanner Cleanup] Error stopping scan stream:', err);
          });
      }
    };
  }, [isOpen, selectedCameraId, isContinuous, products]);

  // Reset flashlight on close
  useEffect(() => {
    if (!isOpen) {
      setTorchEnabled(false);
      setTorchSupported(false);
    }
  }, [isOpen]);

  const toggleTorch = async () => {
    if (!scannerRef.current) return;
    try {
      const nextState = !torchEnabled;
      const track = (scannerRef.current as any).getRunningTrack();
      if (track) {
        await track.applyConstraints({
          advanced: [{ torch: nextState }]
        } as any);
        setTorchEnabled(nextState);
      }
    } catch (err) {
      console.error("Failed to toggle torch:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative bg-white w-full max-w-lg rounded-[28px] shadow-2xl border border-gray-100/50 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 bg-gray-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/15 rounded-xl border border-orange-500/20 text-orange-400">
              <Camera size={18} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider">Scanner de Code-barres</h3>
              <p className="text-[10px] text-gray-400 font-medium">Cadrez le code-barres de l'article pour l'ajouter</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Camera Scanner View */}
        <div className="relative flex-1 bg-black aspect-video max-h-[280px] overflow-hidden flex items-center justify-center">
          
          {/* Reader Element for html5-qrcode */}
          <div id="barcode-scanner-reader" className="w-full h-full object-cover [&_video]:object-cover" />

          {/* Graphical scanning lines overlay */}
          <div className="absolute inset-0 pointer-events-none z-10 border-2 border-transparent flex items-center justify-center">
            {/* Horizontal Laser Line Sweep */}
            {!error && isScanningRef.current && (
              <div className="absolute w-[80%] left-[10%] h-[3px] bg-red-500 shadow-[0_0_12px_#ef4444] animate-[bounce_2.5s_infinite]" />
            )}

            {/* Angular targeting guides */}
            <div className="absolute top-8 left-8 w-6 h-6 border-t-4 border-l-4 border-orange-500 rounded-tl-md" />
            <div className="absolute top-8 right-8 w-6 h-6 border-t-4 border-r-4 border-orange-500 rounded-tr-md" />
            <div className="absolute bottom-8 left-8 w-6 h-6 border-b-4 border-l-4 border-orange-500 rounded-bl-md" />
            <div className="absolute bottom-8 right-8 w-6 h-6 border-b-4 border-r-4 border-orange-500 rounded-br-md" />
          </div>

          {/* Loader or Error UI State */}
          {error ? (
            <div className="absolute inset-0 bg-gray-950 p-6 flex flex-col items-center justify-center text-center gap-3 z-20">
              <AlertTriangle className="text-red-400" size={32} />
              <p className="text-xs text-red-100 max-w-sm">{error}</p>
              {cameras.length > 0 && (
                <button 
                  onClick={() => setSelectedCameraId(cameras[0].id)}
                  className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-bold transition-all"
                >
                  Réessayer la caméra
                </button>
              )}
            </div>
          ) : !isScanningRef.current ? (
            <div className="absolute inset-0 bg-gray-950 flex flex-col items-center justify-center text-center gap-2 z-20">
              <RefreshCw className="text-orange-500 animate-spin" size={28} />
              <p className="text-xs text-gray-400 font-mono">Démarrage du flux vidéo...</p>
            </div>
          ) : null}
        </div>

        {/* Dashboard Actions / Settings */}
        <div className="p-4 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-4 items-center justify-between text-xs">
          
          {/* Camera Selector Dropdown */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <span className="text-[10px] font-black uppercase text-gray-400">Source :</span>
            <select 
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="bg-white border border-gray-200 rounded-lg px-2 py-1 flex-1 text-xs outline-none focus:border-orange-500 font-medium"
              disabled={cameras.length <= 1}
            >
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label || `Caméra ${cameras.indexOf(cam) + 1}`}
                </option>
              ))}
            </select>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={isContinuous}
                onChange={(e) => setIsContinuous(e.target.checked)}
                className="accent-orange-500 rounded text-orange-500 focus:ring-0"
              />
              <span className="text-[11px] font-bold text-gray-600">Scan continu</span>
            </label>

            {torchSupported && (
              <button 
                onClick={toggleTorch}
                className={`p-1.5 rounded-lg border transition-colors ${
                  torchEnabled 
                    ? 'bg-amber-100 border-amber-300 text-amber-600 hover:bg-amber-200' 
                    : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
                }`}
                title="Activer la torche/flash"
              >
                <Zap size={14} className={torchEnabled ? 'fill-amber-500' : ''} />
              </button>
            )}

            <button 
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-1.5 rounded-lg border transition-colors ${
                soundEnabled 
                  ? 'bg-orange-50 border-orange-200 text-orange-500 hover:bg-orange-100' 
                  : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
              }`}
              title="Bip sonore"
            >
              <Volume2 size={14} />
            </button>
          </div>

        </div>

        {/* Scan Journal / Notification Feed */}
        <div className="p-5 flex-1 overflow-y-auto max-h-[180px] bg-white divide-y divide-gray-50">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">Historique des scans récents</h4>
          
          {scannedLogs.length === 0 ? (
            <div className="py-6 text-center text-gray-400 flex flex-col items-center justify-center gap-1.5">
              <Info size={16} className="text-gray-300" />
              <p className="text-[11px]">En attente de détection de code-barres...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {scannedLogs.map((log, index) => (
                <div 
                  key={index} 
                  className={`flex items-center justify-between p-2 rounded-xl text-xs transition-colors border ${
                    log.status === 'success' 
                      ? 'bg-green-50/50 border-green-100/50' 
                      : 'bg-yellow-50/50 border-yellow-101/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {log.status === 'success' ? (
                      <CheckCircle className="text-green-500" size={14} />
                    ) : (
                      <AlertTriangle className="text-yellow-500" size={14} />
                    )}
                    <div>
                      <div className="font-bold text-gray-800">
                        {log.match 
                          ? log.match.name 
                          : `${log.code}`}
                      </div>
                      <div className="text-[9px] font-mono font-black text-gray-400">
                        {log.match && log.match.stock <= 0 
                          ? 'STOCK ÉPUISÉ' 
                          : log.match 
                            ? `SKU: ${log.match.sku || '---'} • Barcode: ${log.match.barcode || '---'}` 
                            : 'Code non répertorié dans les produits'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[9px] text-gray-400 font-bold">{log.timestamp}</div>
                    {log.match && (
                      <div className="font-black text-gray-900 text-[11px]">
                        {log.match.price.toLocaleString('de-DE')} FCFA
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Help footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 text-center text-[10px] text-gray-400 font-medium">
          Raccourci : Le scan continu permet de passer instantanément plusieurs articles en caisse.
        </div>
      </div>
    </div>
  );
}
