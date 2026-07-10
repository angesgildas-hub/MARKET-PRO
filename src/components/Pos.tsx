import { useContext, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  ShoppingCart, 
  ClipboardList,
  Trash2, 
  Plus, 
  Minus, 
  Check,
  CreditCard,
  Banknote,
  Smartphone,
  Package,
  X,
  ArrowRight,
  Printer,
  FileDown,
  MessageSquare,
  Loader2,
  Lock,
  History,
  Bell,
  Volume2,
  ChevronDown,
  ChevronUp,
  ScanBarcode,
  Share2,
  ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BarcodeScannerModal from './BarcodeScannerModal';
import { collection, addDoc, doc, updateDoc, onSnapshot, query, orderBy, serverTimestamp, runTransaction, where, getDocs, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../services/db';
import { Product, CartItem, PaymentMethod, StoreSettings, Client, Commande } from '../types';
import { AppContext } from '../App';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import defaultLogo from '../assets/images/market_pro_logo_1781718180029.jpg';

export default function Pos() {
  const navigate = useNavigate();
  const { searchQuery, userProfile, hasPermission, preselectedClient, setPreselectedClient } = useContext(AppContext);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [discount, setDiscount] = useState<number>(0);
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'receipt'>('cart');
  const [lastSaleId, setLastSaleId] = useState('');
  const [lastSaleData, setLastSaleData] = useState<{ 
    items: CartItem[]; 
    total: number; 
    discount: number;
    amountReceived: number;
    change: number;
    id: string; 
    date: Date;
    clientName?: string;
    clientPhone?: string;
    clientMatricule?: string;
  } | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null);
  const [loadedOrderNumber, setLoadedOrderNumber] = useState<string | null>(null);

  // Real-time active orders (pending / served) and notification states
  const [activeOrders, setActiveOrders] = useState<Commande[]>([]);
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [latestNewOrder, setLatestNewOrder] = useState<Commande | null>(null);
  const [isOrdersDrawerOpen, setIsOrdersDrawerOpen] = useState(false);
  const isInitRef = useRef(false);

  // --- OFFLINE & TOGO MOBILE MONEY SYSTEM ---
  const [offlineSales, setOfflineSales] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const [momoOperator, setMomoOperator] = useState<'tmoney' | 'flooz'>('tmoney');
  const [momoPhoneNumber, setMomoPhoneNumber] = useState('');
  const [momoTransactionId, setMomoTransactionId] = useState('');
  const [momoStatus, setMomoStatus] = useState<'none' | 'simulating' | 'success'>('none');
  const [momoError, setMomoError] = useState('');

  // --- BLUETOOTH PRINTING ---
  const [btDevice, setBtDevice] = useState<any>(null);
  const [btCharacteristic, setBtCharacteristic] = useState<any>(null);
  const [isBtConnecting, setIsBtConnecting] = useState(false);
  const [isBtPrinting, setIsBtPrinting] = useState(false);
  const [btError, setBtError] = useState('');

  // --- DIGITAL RECEIPTS ---
  const [sharePhoneNumber, setSharePhoneNumber] = useState('');

  const cartListRef = useRef<HTMLDivElement>(null);

  const scrollCartToBottom = () => {
    if (cartListRef.current) {
      cartListRef.current.scrollTo({
        top: cartListRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  const scrollCartToTop = () => {
    if (cartListRef.current) {
      cartListRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.2); // G5
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch (err) {
      console.warn("Audio Context init blocked or failed:", err);
    }
  };

  const handleLoadOrder = (order: Commande) => {
    const mappedItems: CartItem[] = order.items.map(item => {
      const foundProduct = products.find(p => p.id === item.productId);
      return {
        id: Math.random().toString(36).substring(2, 9),
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        priceAtSale: item.priceAtSale,
        total: item.total,
        product: foundProduct || {
          id: item.productId,
          storeId: order.storeId,
          sku: '',
          barcode: '',
          name: item.name,
          category: 'Commande',
          price: item.priceAtSale,
          costPrice: 0,
          stock: 99,
          unit: 'pcs'
        } as Product
      };
    });

    setCart(mappedItems);
    setLoadedOrderId(order.id);
    setLoadedOrderNumber(order.number);
    
    if (order.clientId) {
      const foundClient = clients.find(c => c.id === order.clientId);
      setSelectedClient(foundClient || { id: order.clientId, name: order.clientName || 'Passager' } as Client);
    } else if (order.clientName) {
      setSelectedClient({ id: '', name: order.clientName } as Client);
    } else {
      setSelectedClient(null);
    }

    setIsOrdersDrawerOpen(false);
    setShowNotificationBanner(false);
  };

  useEffect(() => {
    if (showNotificationBanner) {
      const timer = setTimeout(() => {
        setShowNotificationBanner(false);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [showNotificationBanner]);

  // --- OFFLINE/ONLINE LISTENERS ---
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log("POS is online. Auto-syncing...");
    };
    const handleOffline = () => {
      setIsOnline(false);
      console.log("POS is offline.");
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- PRELOAD AND CACHE LOCALSTORAGE HOOK ---
  useEffect(() => {
    if (!userProfile?.storeId) return;

    // Load caches if available
    const cachedProds = localStorage.getItem(`marketpro-products-${userProfile.storeId}`);
    if (cachedProds) {
      try { setProducts(JSON.parse(cachedProds)); } catch (e) { console.error(e); }
    }

    const cachedSettings = localStorage.getItem(`marketpro-settings-${userProfile.storeId}`);
    if (cachedSettings) {
      try { setStoreSettings(JSON.parse(cachedSettings)); } catch (e) { console.error(e); }
    }

    const cachedClients = localStorage.getItem(`marketpro-clients-${userProfile.storeId}`);
    if (cachedClients) {
      try { setClients(JSON.parse(cachedClients)); } catch (e) { console.error(e); }
    }

    const cachedOffline = localStorage.getItem(`marketpro-offline-sales-${userProfile.storeId}`);
    if (cachedOffline) {
      try { setOfflineSales(JSON.parse(cachedOffline)); } catch (e) { console.error(e); }
    }
  }, [userProfile?.storeId]);

  // --- TRIGGERS SYNC WHEN ONLINE AND THERE ARE PENDING SALES ---
  useEffect(() => {
    if (isOnline && offlineSales.length > 0 && !isSyncing) {
      syncOfflineSales();
    }
  }, [isOnline, offlineSales.length, isSyncing]);

  // Synchronize client selection with Mobile Money and share inputs
  useEffect(() => {
    if (selectedClient) {
      setMomoPhoneNumber(selectedClient.phone || '');
      setSharePhoneNumber(selectedClient.phone || '');
    } else {
      setMomoPhoneNumber('');
      setSharePhoneNumber('');
    }
    setMomoTransactionId('');
    setMomoStatus('none');
    setMomoError('');
  }, [selectedClient]);

  // Bluetooth Reconnect Simulation if paired
  useEffect(() => {
    const cachedName = localStorage.getItem('marketpro-bt-printer-name');
    if (cachedName) {
      console.log("Found previously paired Bluetooth thermal printer:", cachedName);
    }
  }, []);

  const syncOfflineSales = async () => {
    if (isSyncing || !isOnline || offlineSales.length === 0) return;
    setIsSyncing(true);
    
    const salesToSync = [...offlineSales];
    const syncedIds: string[] = [];
    
    try {
      for (const sale of salesToSync) {
        // Create sale ref
        const targetSaleId = sale.id.startsWith('offline_') ? doc(collection(db, 'sales')).id : sale.id;
        const saleRef = doc(db, 'sales', targetSaleId);
        
        // Prepare firestore-compatible timestamp
        const finalSaleData = {
          storeId: sale.storeId,
          timestamp: serverTimestamp(),
          cashierId: sale.cashierId,
          cashierName: sale.cashierName,
          totalAmount: sale.totalAmount,
          discount: sale.discount,
          amountReceived: sale.amountReceived,
          change: sale.change,
          paymentMethod: sale.paymentMethod,
          itemsCount: sale.itemsCount,
          ...(sale.clientId ? { clientId: sale.clientId } : {}),
          ...(sale.clientName ? { clientName: sale.clientName } : {}),
          ...(sale.clientPhone ? { clientPhone: sale.clientPhone } : {}),
          ...(sale.clientMatricule ? { clientMatricule: sale.clientMatricule } : {}),
          // Store mobile details if present
          ...(sale.momoOperator ? {
            momoOperator: sale.momoOperator,
            momoPhoneNumber: sale.momoPhoneNumber,
            momoTransactionId: sale.momoTransactionId,
            momoStatus: 'success'
          } : {})
        };
        
        // Write sale doc
        await setDoc(saleRef, finalSaleData);
        
        // Write items & update product stock in Firestore
        for (const item of sale.items) {
          const itemRef = doc(collection(db, `sales/${targetSaleId}/items`));
          await setDoc(itemRef, {
            storeId: sale.storeId,
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            priceAtSale: item.priceAtSale,
            total: item.total
          });
          
          // Atomic stock decrement
          const productRef = doc(db, 'products', item.productId);
          try {
            const prodSnap = await getDoc(productRef);
            if (prodSnap.exists()) {
              const currentStock = prodSnap.data().stock || 0;
              await updateDoc(productRef, { stock: Math.max(0, currentStock - item.quantity) });
            }
          } catch (e) {
            console.error("Stock adjust failed for synchronized sale product:", e);
          }
        }
        
        // If there was a client, update client's stats in Firestore
        if (sale.clientId) {
          const clientRef = doc(db, 'clients', sale.clientId);
          try {
            const clientSnap = await getDoc(clientRef);
            if (clientSnap.exists()) {
              await updateDoc(clientRef, {
                totalSpent: (clientSnap.data().totalSpent || 0) + sale.totalAmount,
                visitsCount: (clientSnap.data().visitsCount || 0) + 1,
                lastVisit: serverTimestamp(),
              });
            }
          } catch (e) {
            console.error("Client update failed for synchronized sale client:", e);
          }
        }

        // Include in mobile transactions if it was momo
        if (sale.momoOperator) {
          try {
            const mobileTxRef = doc(collection(db, 'mobileTransactions'));
            await setDoc(mobileTxRef, {
              storeId: sale.storeId,
              timestamp: serverTimestamp(),
              cashierId: sale.cashierId,
              cashierName: sale.cashierName,
              operator: sale.momoOperator,
              type: 'withdrawal',
              amount: sale.totalAmount,
              commission: Math.round(sale.totalAmount * 0.01 * 0.3),
              feesPaid: Math.round(sale.totalAmount * 0.01),
              clientPhone: sale.momoPhoneNumber,
              clientName: sale.clientName || 'Client de passage',
              referenceId: sale.momoTransactionId,
              status: 'completed',
              notes: `Vente de caisse POS #${targetSaleId.slice(-6)} (Synchronise)`,
              countryCode: 'TG',
              merchantNumber: sale.momoOperator === 'tmoney' ? '90000000' : '99000000'
            });
          } catch (momoErr) {
            console.error("Failed to write mobile money sync transaction:", momoErr);
          }
        }

        // Add to synced list
        syncedIds.push(sale.id);
      }
      
      // Filter out successfully synced sales
      const remainingSales = salesToSync.filter(s => !syncedIds.includes(s.id));
      setOfflineSales(remainingSales);
      localStorage.setItem(`marketpro-offline-sales-${userProfile?.storeId}`, JSON.stringify(remainingSales));
      
      if (syncedIds.length > 0) {
        playNotificationSound();
      }
    } catch (err) {
      console.error("Error during background sync:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const connectBluetoothPrinter = async () => {
    setIsBtConnecting(true);
    setBtError('');
    try {
      const nav = navigator as any;
      if (!nav.bluetooth) {
        throw new Error("Web Bluetooth n'est pas supporte ou active sur ce navigateur/iframe.");
      }
      
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['00001101-0000-1000-8000-00805f9b34fb', '000018f0-0000-1000-8000-00805f9b34fb']
      });
      
      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error("Impossible de se connecter au serveur GATT de l'imprimante.");
      }
      
      let service;
      try {
        service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      } catch (e) {
        try {
          service = await server.getPrimaryService('00001101-0000-1000-8000-00805f9b34fb');
        } catch (e2) {
          const services = await server.getPrimaryServices();
          if (services.length > 0) {
            service = services[0];
          } else {
            throw new Error("Aucun service GATT d'impression thermique detecte.");
          }
        }
      }
      
      const characteristics = await service.getCharacteristics();
      const writeChar = characteristics.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);
      
      if (!writeChar) {
        throw new Error("Caracteristique d'ecriture de donnees non trouvee.");
      }
      
      setBtDevice(device);
      setBtCharacteristic(writeChar);
      localStorage.setItem('marketpro-bt-printer-name', device.name || 'Imprimante Thermique');
    } catch (err: any) {
      console.error(err);
      setBtError(err.message || "La connexion a echoue. Utilisez l'impression standard.");
    } finally {
      setIsBtConnecting(false);
    }
  };

  const printDirectThermal = async () => {
    if (!btCharacteristic || !lastSaleData) {
      setBtError("Veuillez d'abord connecter votre imprimante thermique.");
      return;
    }
    setIsBtPrinting(true);
    setBtError('');
    try {
      const esc = 0x1B;
      const gs = 0x1D;
      const encoder = new TextEncoder();
      
      const parts: Uint8Array[] = [];
      const addText = (text: string) => parts.push(encoder.encode(text));
      const addCmd = (cmd: number[]) => parts.push(new Uint8Array(cmd));
      
      addCmd([esc, 0x40]); // Reset
      addCmd([esc, 0x61, 0x01]); // Align center
      
      addCmd([gs, 0x21, 0x11]); // Big font heading
      addText(`${storeSettings?.name || 'MARKET PRO'}\n`);
      addCmd([gs, 0x21, 0x00]); // Normal heading
      
      addText(`${storeSettings?.address || 'Lome, Togo'}\n`);
      if (storeSettings?.phone) {
        addText(`Tel: ${storeSettings.phone}\n`);
      }
      addText(`--------------------------------\n`);
      
      addCmd([esc, 0x61, 0x00]); // Left align
      addText(`Date: ${lastSaleData.date.toLocaleDateString('fr-FR')} ${lastSaleData.date.toLocaleTimeString('fr-FR')}\n`);
      addText(`Ticket: #${lastSaleData.id.slice(-8).toUpperCase()}\n`);
      addText(`Caisse: ${userProfile?.displayName || 'Admin'}\n`);
      if (lastSaleData.clientName) {
        addText(`Client: ${lastSaleData.clientName}\n`);
      }
      addText(`--------------------------------\n`);
      
      addText(`Article          Qte   Total (FCFA)\n`);
      addText(`--------------------------------\n`);
      
      lastSaleData.items.forEach(item => {
        let nameLine = item.name.substring(0, 15);
        while (nameLine.length < 16) nameLine += ' ';
        const qtyStr = String(item.quantity).padStart(3, ' ');
        const totalStr = String(item.total).padStart(11, ' ');
        addText(`${nameLine}${qtyStr}${totalStr}\n`);
      });
      addText(`--------------------------------\n`);
      
      addCmd([esc, 0x61, 0x02]); // Right align
      if (lastSaleData.discount > 0) {
        addText(`Remise: -${lastSaleData.discount.toLocaleString()} FCFA\n`);
      }
      addCmd([esc, 0x45, 0x01]); // Bold text on
      addText(`TOTAL NET: ${lastSaleData.total.toLocaleString()} FCFA\n`);
      addCmd([esc, 0x45, 0x00]); // Bold text off
      
      if (paymentMethod === 'cash') {
        addText(`Recu: ${lastSaleData.amountReceived.toLocaleString()} FCFA\n`);
        addText(`Rendu: ${lastSaleData.change.toLocaleString()} FCFA\n`);
      } else {
        const methodLabel = paymentMethod === 'card' ? 'CARTE' : (momoOperator === 'flooz' ? 'FLOOZ' : 'T-MONEY');
        addText(`Paiement: ${methodLabel}\n`);
        if (momoTransactionId) {
          addText(`Ref TX: ${momoTransactionId}\n`);
        }
      }
      
      addCmd([esc, 0x61, 0x01]); // Center align
      addText(`--------------------------------\n`);
      addText(`Merci pour votre confiance !\n`);
      addText(`L'Imprimeur Market Pro\n\n\n\n\n`); // Spacer feed lines
      
      addCmd([gs, 0x56, 0x42, 0x00]); // Cut command
      
      // Merge
      const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
      const payload = new Uint8Array(totalLen);
      let offset = 0;
      parts.forEach(p => {
        payload.set(p, offset);
        offset += p.length;
      });
      
      // BLE chunk write
      const chunkSize = 20;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        await btCharacteristic.writeValue(chunk);
      }
      
    } catch (err: any) {
      console.error(err);
      setBtError("L'envoi ESC/POS a echoue : " + (err.message || err));
    } finally {
      setIsBtPrinting(false);
    }
  };

  const getDigitalReceiptMessage = () => {
    if (!lastSaleData) return '';
    const shopName = storeSettings?.name || 'MARKET PRO';
    const dateStr = lastSaleData.date.toLocaleString('fr-FR');
    const ticketId = lastSaleData.id.slice(-8).toUpperCase();
    
    let msg = `🧾 *REC'U DE CAISSE - ${shopName}*\n`;
    msg += `--------------------------------------\n`;
    msg += `📅 Date : ${dateStr}\n`;
    msg += `🔢 Ticket : #${ticketId}\n`;
    msg += `👤 Client : ${lastSaleData.clientName || 'Client de passage'}\n`;
    msg += `--------------------------------------\n\n`;
    msg += `📦 *Articles :*\n`;
    
    lastSaleData.items.forEach(item => {
      msg += `▪️ ${item.quantity}x ${item.name} @ ${item.priceAtSale.toLocaleString()} FCFA = *${item.total.toLocaleString()} FCFA*\n`;
    });
    
    msg += `\n--------------------------------------\n`;
    if (lastSaleData.discount > 0) {
      msg += `🔹 Remise : -${lastSaleData.discount.toLocaleString()} FCFA\n`;
    }
    msg += `💰 *TOTAL NET : ${lastSaleData.total.toLocaleString()} FCFA*\n`;
    
    if (paymentMethod === 'cash') {
      msg += `💵 Recu : ${lastSaleData.amountReceived.toLocaleString()} FCFA\n`;
      msg += `🔄 Rendu : ${lastSaleData.change.toLocaleString()} FCFA\n`;
    } else {
      const mode = paymentMethod === 'card' ? 'Carte Bancaire' : (momoOperator === 'flooz' ? 'Flooz (Moov Money)' : 'T-Money (Togocom)');
      msg += `📱 Mode : ${mode}\n`;
      if (momoTransactionId) {
        msg += `🔑 Ref TX : ${momoTransactionId}\n`;
      }
    }
    
    msg += `\nMerci pour votre confiance ! A bientot ! 🙏✨`;
    return msg;
  };

  const handleWhatsAppReceipt = (customPhone?: string) => {
    const rawPhone = customPhone || sharePhoneNumber || lastSaleData?.clientPhone;
    if (!rawPhone) {
      alert("Veuillez saisir un numero de telephone.");
      return;
    }
    const cleanPhone = rawPhone.replace(/\s+/g, '').replace('+', '');
    const message = getDigitalReceiptMessage();
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleSMSReceipt = (customPhone?: string) => {
    const rawPhone = customPhone || sharePhoneNumber || lastSaleData?.clientPhone;
    if (!rawPhone) {
      alert("Veuillez saisir un numero de telephone.");
      return;
    }
    const cleanPhone = rawPhone.replace(/\s+/g, '').replace('+', '');
    const message = getDigitalReceiptMessage();
    window.open(`sms:${cleanPhone}?body=${encodeURIComponent(message)}`, '_blank');
  };

  const startMomoPaymentSimulation = () => {
    if (!momoPhoneNumber) {
      setMomoError("Veuillez saisir le numero de l'expediteur.");
      return;
    }
    setMomoError('');
    setMomoStatus('simulating');
    
    setTimeout(() => {
      const randomRef = (momoOperator === 'tmoney' ? 'TM-' : 'FL-') + Math.floor(100000 + Math.random() * 900000);
      setMomoTransactionId(randomRef);
      setMomoStatus('success');
      playNotificationSound();
    }, 1500);
  };

  useEffect(() => {
    if (products.length === 0) return;
    try {
      const activePreload = localStorage.getItem('active-preloaded-order');
      if (activePreload) {
        const orderData = JSON.parse(activePreload);
        if (orderData && orderData.items) {
          const orderId = orderData.id || orderData.orderId || '';
          const orderNumber = orderData.number || orderData.orderNumber || '';
          const clientName = orderData.clientName || '';
          const clientId = orderData.clientId || '';
          const storeId = orderData.storeId || userProfile?.storeId || '';

          const mappedItems: CartItem[] = orderData.items.map((item: any) => {
            const foundProduct = products.find(p => p.id === item.productId);
            return {
              id: Math.random().toString(36).substring(2, 9),
              productId: item.productId,
              name: item.name,
              quantity: item.quantity,
              priceAtSale: item.priceAtSale,
              total: item.total,
              product: foundProduct || {
                id: item.productId,
                storeId: storeId,
                sku: '',
                barcode: '',
                name: item.name,
                category: 'Commande',
                price: item.priceAtSale,
                costPrice: 0,
                stock: 99,
                unit: 'pcs'
              } as Product
            };
          });

          setCart(mappedItems);
          if (orderId) setLoadedOrderId(orderId);
          if (orderNumber) setLoadedOrderNumber(orderNumber);

          if (clientId) {
            const foundClient = clients.find(c => c.id === clientId);
            setSelectedClient(foundClient || { id: clientId, name: clientName || 'Passager' } as Client);
          } else if (clientName) {
            setSelectedClient({ id: '', name: clientName } as Client);
          } else if (orderData.client) {
            setSelectedClient(orderData.client);
          }

          localStorage.removeItem('active-preloaded-order');
        }
      }
    } catch (e) {
      console.error("Error reading preloaded order:", e);
    }
  }, [products, clients, userProfile?.storeId]);

  useEffect(() => {
    if (!userProfile?.storeId) return;
    const q = query(
      collection(db, 'products'), 
      where('storeId', '==', userProfile.storeId),
      orderBy('name')
    );
    const unsubscribeProducts = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product)));
    }, (error) => {
      console.warn("Error subscribing to products in POS module:", error);
    });

    const unsubscribeStore = onSnapshot(doc(db, 'storeSettings', userProfile.storeId), (snap) => {
      if (snap.exists()) {
        setStoreSettings(snap.data() as StoreSettings);
      }
    }, (error) => {
      console.warn("Error subscribing to storeSettings in POS module:", error);
    });

    const unsubscribeClients = onSnapshot(query(collection(db, 'clients'), where('storeId', '==', userProfile.storeId)), (snap) => {
      setClients(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Client)));
    }, (error) => {
      console.warn("Error subscribing to clients list in POS module:", error);
    });

    // Subscribing to raw orders (pending/served) associated with the store securely (no index exceptions)
    const unsubscribeActiveOrders = onSnapshot(query(collection(db, 'commandes'), where('storeId', '==', userProfile.storeId)), (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Commande));
      
      const filteredAndSorted = allOrders
        .filter(c => c.status === 'pending' || c.status === 'served')
        .sort((a, b) => {
          const tA = a.timestamp?.seconds || a.timestamp?.toMillis?.() || 0;
          const tB = b.timestamp?.seconds || b.timestamp?.toMillis?.() || 0;
          return tB - tA;
        });

      let hasNewDoc = false;
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && isInitRef.current) {
          const data = change.doc.data() as Commande;
          if (data.status === 'pending' || data.status === 'served') {
            hasNewDoc = true;
          }
        }
      });

      setActiveOrders(filteredAndSorted);

      if (hasNewDoc && filteredAndSorted.length > 0) {
        playNotificationSound();
        const latest = filteredAndSorted[0];
        setLatestNewOrder(latest);
        setShowNotificationBanner(true);
      }
      isInitRef.current = true;
    }, (error) => {
      console.warn("Error subscribing to active orders in POS:", error);
    });

    return () => {
      unsubscribeProducts();
      unsubscribeStore();
      unsubscribeClients();
      unsubscribeActiveOrders();
    };
  }, [userProfile?.storeId]);


  useEffect(() => {
    if (preselectedClient) {
      setSelectedClient(preselectedClient);
      setPreselectedClient(null); // Clear it after selecting
    }
  }, [preselectedClient, setPreselectedClient]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => 
          item.productId === product.id ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.priceAtSale } : item
        );
      }
      return [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        productId: product.id,
        name: product.name,
        quantity: 1,
        priceAtSale: product.price,
        total: product.price,
        product
      }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === itemId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty, total: newQty * item.priceAtSale };
      }
      return item;
    }));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const total = Math.max(0, subtotal - discount);
  const change = paymentMethod === 'cash' ? Math.max(0, amountReceived - total) : 0;

  const handleWhatsAppShare = () => {
    if (!lastSaleData) return;
    const phone = lastSaleData.clientPhone?.replace(/\s+/g, '').replace('+', '');
    if (!phone) {
      alert("Aucun numéro de client associé.");
      return;
    }

    const message = `Bonjour ${lastSaleData.clientName || 'Cher Client'},\nMerci pour votre achat chez ${storeSettings?.name || 'SUPERMARKET'}.\nTotal: ${lastSaleData.total.toLocaleString()} FCFA\nDate: ${lastSaleData.date.toLocaleString()}\nID: #${lastSaleData.id.slice(-8)}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handlePrint = () => {
    const receiptContent = document.getElementById('receipt-print');
    if (!receiptContent) return;

    const printWindow = document.createElement('iframe');
    printWindow.style.position = 'absolute';
    printWindow.style.top = '-1000px';
    printWindow.style.left = '-1000px';
    document.body.appendChild(printWindow);

    const doc = printWindow.contentWindow?.document;
    if (!doc) return;

    doc.write(`
      <html>
        <head>
          <title>Impression Ticket</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
            body { 
              margin: 0; 
              padding: 10px; 
              font-family: 'JetBrains Mono', monospace;
              font-size: 10px;
              width: 72mm;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .uppercase { text-transform: uppercase; }
            .italic { font-style: italic; }
            .border-b { border-bottom: 1px solid #000; }
            .border-t { border-top: 1px solid #000; }
            .border-dashed { border-style: dashed; }
            .my-2 { margin-top: 8px; margin-bottom: 8px; }
            .mt-1 { margin-top: 4px; }
            .mt-2 { margin-top: 8px; }
            .mt-4 { margin-top: 16px; }
            .mt-6 { margin-top: 24px; }
            .mb-2 { margin-bottom: 8px; }
            .mb-4 { margin-bottom: 16px; }
            .py-0\\.5 { padding-top: 2px; padding-bottom: 2px; }
            .pb-1 { padding-bottom: 4px; }
            .pt-1 { padding-top: 4px; }
            .pt-2 { padding-top: 8px; }
            .pt-4 { padding-top: 16px; }
            .space-y-1 > * + * { margin-top: 4px; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .w-12 { width: 48px; }
            .h-12 { height: 48px; }
            .mx-auto { margin-left: auto; margin-right: auto; }
            .object-contain { object-fit: contain; }
            .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .w-12 { width: 50%; }
            .w-14 { width: 25%; }
            .text-sm { font-size: 12px; }
            .text-xs { font-size: 8px; }
            .opacity-70 { opacity: 0.7; }
          </style>
        </head>
        <body>
          ${receiptContent.innerHTML}
        </body>
      </html>
    `);
    doc.close();

    // Small delay to ensure styles and images (logo) are loaded
    setTimeout(() => {
      printWindow.contentWindow?.focus();
      printWindow.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(printWindow);
      }, 500);
    }, 500);
  };

  const createReceiptPDF = () => {
    if (!lastSaleData) throw new Error("Aucune donnée de vente disponible");

    const itemsCount = lastSaleData.items?.length || 1;
    // Base layout: header = ~36mm
    // AutoTable startY: 36, head cellPadding: 1, each row is about 5mm
    // AutoTable header is about 5mm
    const tableHeight = 5 + (itemsCount * 5);
    const afterTableHeight = 45; // total of totals, payment details, margins
    const calculatedHeight = Math.max(100, 36 + tableHeight + afterTableHeight);

    const docPDF = new jsPDF({
      unit: 'mm',
      format: [80, calculatedHeight]
    });

    // POS Style Header
    docPDF.setFontSize(14);
    docPDF.setFont('helvetica', 'bold');
    docPDF.text(storeSettings?.name || "SUPERMARKET PRO", 40, 15, { align: 'center' });
    
    docPDF.setFontSize(8);
    docPDF.setFont('helvetica', 'normal');
    docPDF.text("Reçu de Vente", 40, 20, { align: 'center' });
    docPDF.text(`ID: #${lastSaleData.id.slice(-8).toUpperCase()}`, 40, 24, { align: 'center' });
    docPDF.text(`Date: ${lastSaleData.date?.toLocaleString() || new Date().toLocaleString()}`, 40, 28, { align: 'center' });
    docPDF.setFont('helvetica', 'bolditalic');
    docPDF.text(`Vendeur: ${userProfile?.displayName || auth.currentUser?.displayName || 'Admin'}`, 40, 32, { align: 'center' });
    
    docPDF.line(5, 34, 75, 34);
    
    // Items Table
    const tableData = lastSaleData.items.map(item => [
      item.name || 'Inconnu',
      (item.quantity || 0).toString(),
      ((item.priceAtSale || 0) * (item.quantity || 0)).toLocaleString('de-DE')
    ]);

    autoTable(docPDF, {
      startY: 36,
      head: [['Article', 'Qté', 'Total']],
      body: tableData,
      theme: 'plain',
      styles: { fontSize: 7, cellPadding: 1 },
      headStyles: { fontStyle: 'bold' },
      margin: { left: 5, right: 5 }
    });

    const finalY = (docPDF as any).lastAutoTable.finalY + 5;

    docPDF.line(5, finalY, 75, finalY);
    
    docPDF.setFont('helvetica', 'bold');
    docPDF.text(`SOUS-TOTAL: ${((lastSaleData.total || 0) + (lastSaleData.discount || 0)).toLocaleString('de-DE')} FCFA`, 75, finalY + 5, { align: 'right' });
    if (lastSaleData.discount) {
      docPDF.text(`REMISE: -${(lastSaleData.discount || 0).toLocaleString('de-DE')} FCFA`, 75, finalY + 9, { align: 'right' });
    }
    docPDF.setFontSize(10);
    docPDF.text(`TOTAL: ${(lastSaleData.total || 0).toLocaleString('de-DE')} FCFA`, 75, finalY + 14, { align: 'right' });
    
    docPDF.setFontSize(7);
    docPDF.setFont('helvetica', 'normal');
    const paymentInfoY = finalY + 20;
    docPDF.text(`Paiement: ${paymentMethod.toUpperCase()}`, 5, paymentInfoY);
    docPDF.text(`Reçu: ${(lastSaleData.amountReceived || 0).toLocaleString('de-DE')} FCFA`, 5, paymentInfoY + 4);
    docPDF.text(`Rendu: ${(lastSaleData.change || 0).toLocaleString('de-DE')} FCFA`, 5, paymentInfoY + 8);

    docPDF.text("Merci de votre visite!", 40, paymentInfoY + 16, { align: 'center' });

    return docPDF;
  };

  const handleDownloadPDF = async () => {
    try {
      const docPDF = createReceiptPDF();
      const pdfOutput = docPDF.output('blob');
      const blobUrl = URL.createObjectURL(pdfOutput);
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = `Recu_${(lastSaleData!.id || 'export').slice(-8)}.pdf`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      console.error(e);
      alert("Erreur lors du téléchargement : " + e.message);
    }
  };

  const handleOpenPDFInNewTab = () => {
    try {
      const docPDF = createReceiptPDF();
      const pdfOutput = docPDF.output('blob');
      const blobUrl = URL.createObjectURL(pdfOutput);
      window.open(blobUrl, '_blank');
    } catch (e: any) {
      console.error(e);
      alert("Impossible d'ouvrir le PDF de façon directe. Veuillez autoriser les fenêtres contextuelles.");
    }
  };

  const handleSharePDF = async () => {
    if (!lastSaleData) return;
    try {
      const docPDF = createReceiptPDF();
      const pdfOutput = docPDF.output('blob');
      const file = new File([pdfOutput], `Recu_${lastSaleData.id.slice(-8).toUpperCase()}.pdf`, { type: 'application/pdf' });
      
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Reçu #${lastSaleData.id.slice(-8).toUpperCase()}`,
          text: `Voici le reçu de votre achat d'un montant de ${lastSaleData.total.toLocaleString('de-DE')} FCFA chez ${storeSettings?.name || "MARKET PRO"}.`
        });
      } else {
        // Textual receipt clipboard fallback
        let receiptText = `=== ${storeSettings?.name || "MARKET PRO"} ===\n`;
        receiptText += `Reçu de Vente #${lastSaleData.id.slice(-8).toUpperCase()}\n`;
        receiptText += `Date: ${lastSaleData.date?.toLocaleString() || new Date().toLocaleString()}\n`;
        receiptText += `------------------------------------\n`;
        lastSaleData.items.forEach(item => {
          receiptText += `${item.name} x${item.quantity} : ${((item.priceAtSale || 0) * (item.quantity || 0)).toLocaleString('de-DE')} FCFA\n`;
        });
        receiptText += `------------------------------------\n`;
        receiptText += `SOUS-TOTAL: ${((lastSaleData.total || 0) + (lastSaleData.discount || 0)).toLocaleString('de-DE')} FCFA\n`;
        if (lastSaleData.discount) {
          receiptText += `REMISE: -${(lastSaleData.discount || 0).toLocaleString('de-DE')} FCFA\n`;
        }
        receiptText += `TOTAL: ${(lastSaleData.total || 0).toLocaleString('de-DE')} FCFA\n`;
        receiptText += `Paiement: ${paymentMethod.toUpperCase()}\n`;
        receiptText += `Rendu: ${(lastSaleData.change || 0).toLocaleString('de-DE')} FCFA\n`;
        receiptText += `Merci de votre visite !\n`;

        await navigator.clipboard.writeText(receiptText);
        alert("Reçu textuel copié avec succès ! Vous pouvez le coller dans WhatsApp ou un SMS.");
      }
    } catch (e: any) {
      console.error(e);
      alert("Erreur de partage: " + e.message);
    }
  };



  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    if (!hasPermission('pos', 'create')) {
      alert("Vous n'avez pas la permission d'effectuer des ventes.");
      return;
    }

    const itemsToSave = [...cart];
    const saleTotal = total;
    const saleDiscount = discount;
    const saleAmountReceived = paymentMethod === 'cash' ? amountReceived : total;
    const saleChange = change;

    setIsProcessing(true);
    try {
      if (!userProfile?.storeId) {
        throw new Error("ID de boutique manquant. Veuillez vous reconnecter.");
      }
      let saleId = '';
      const isOfflineMode = !isOnline;

      if (isOfflineMode) {
        // --- BUILT-IN OFFLINE ROBUST FAILSAFE PATH ---
        saleId = 'offline_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
        
        const offlineSaleData: any = {
          id: saleId,
          storeId: userProfile.storeId,
          timestamp: new Date().toISOString(),
          cashierId: auth.currentUser?.uid || 'offline_cashier',
          cashierName: userProfile?.displayName || 'Admin',
          totalAmount: saleTotal,
          discount: saleDiscount,
          amountReceived: saleAmountReceived,
          change: saleChange,
          paymentMethod,
          itemsCount: itemsToSave.length,
          _isOfflineCreated: true,
          items: itemsToSave.map(item => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            priceAtSale: item.priceAtSale,
            total: item.total
          }))
        };

        if (selectedClient) {
          offlineSaleData.clientId = selectedClient.id || '';
          offlineSaleData.clientName = selectedClient.name || '';
          offlineSaleData.clientPhone = selectedClient.phone || '';
          offlineSaleData.clientMatricule = selectedClient.matricule || '';
        }

        // Include Togo Mobile Money information if applicable
        if (paymentMethod === 'mobile') {
          offlineSaleData.momoOperator = momoOperator;
          offlineSaleData.momoPhoneNumber = momoPhoneNumber;
          offlineSaleData.momoTransactionId = momoTransactionId || `SIM-TX-${Math.floor(100000 + Math.random() * 900000)}`;
          offlineSaleData.momoStatus = 'success';
        }

        // Add to offline queue state and local storage
        const updatedQueue = [...offlineSales, offlineSaleData];
        setOfflineSales(updatedQueue);
        localStorage.setItem(`marketpro-offline-sales-${userProfile.storeId}`, JSON.stringify(updatedQueue));

        // Decrement products inventory locally in state and sync cache
        setProducts(prev => {
          const next = prev.map(p => {
            const sold = itemsToSave.find(item => item.productId === p.id);
            return sold ? { ...p, stock: Math.max(0, (p.stock || 0) - sold.quantity) } : p;
          });
          localStorage.setItem(`marketpro-products-${userProfile.storeId}`, JSON.stringify(next));
          return next;
        });

        // Set last sale info
        setLastSaleId(saleId);
        setLastSaleData({
          items: itemsToSave,
          total: saleTotal,
          discount: saleDiscount,
          amountReceived: saleAmountReceived,
          change: saleChange,
          id: saleId,
          date: new Date(),
          clientName: selectedClient?.name,
          clientPhone: selectedClient?.phone || momoPhoneNumber || undefined,
          clientMatricule: selectedClient?.matricule
        });

      } else {
        // --- ONLINE SECURE TRANSACTION ---
        await runTransaction(db, async (transaction) => {
          const productRefs = itemsToSave.map(item => doc(db, 'products', item.productId));
          const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

          const saleRef = doc(collection(db, 'sales'));
          saleId = saleRef.id;
          
          const saleData: any = {
            storeId: userProfile.storeId,
            timestamp: serverTimestamp(),
            cashierId: auth.currentUser?.uid,
            cashierName: userProfile?.displayName || auth.currentUser?.displayName || 'Admin',
            totalAmount: saleTotal,
            discount: saleDiscount,
            amountReceived: saleAmountReceived,
            change: saleChange,
            paymentMethod,
            itemsCount: itemsToSave.length
          };

          if (selectedClient) {
            saleData.clientId = selectedClient.id;
            saleData.clientName = selectedClient.name;
            if (selectedClient.matricule) {
              saleData.clientMatricule = selectedClient.matricule;
            }
            if (selectedClient.phone) {
              saleData.clientPhone = selectedClient.phone;
            }
            
            if (selectedClient.id) {
              const clientRef = doc(db, 'clients', selectedClient.id);
              const clientSnap = await transaction.get(clientRef);
              if (clientSnap.exists()) {
                transaction.update(clientRef, {
                  totalSpent: (clientSnap.data().totalSpent || 0) + saleTotal,
                  visitsCount: (clientSnap.data().visitsCount || 0) + 1,
                  lastVisit: serverTimestamp(),
                });
              }
            }
          }

          // Include Togo Mobile Money fields if payment method is mobile money
          if (paymentMethod === 'mobile') {
            saleData.momoOperator = momoOperator;
            saleData.momoPhoneNumber = momoPhoneNumber;
            saleData.momoTransactionId = momoTransactionId || `SIM-TX-${Math.floor(100000 + Math.random() * 900000)}`;
            saleData.momoStatus = 'success';

            // Log into mobileTransactions list for Mobile Money consistency
            const mobileTxRef = doc(collection(db, 'mobileTransactions'));
            transaction.set(mobileTxRef, {
              storeId: userProfile.storeId,
              timestamp: serverTimestamp(),
              cashierId: auth.currentUser?.uid || '',
              cashierName: userProfile.displayName || '',
              operator: momoOperator,
              type: 'withdrawal',
              amount: saleTotal,
              commission: Math.round(saleTotal * 0.01 * 0.3),
              feesPaid: Math.round(saleTotal * 0.01),
              clientPhone: momoPhoneNumber,
              clientName: selectedClient?.name || 'Client de passage',
              referenceId: momoTransactionId || mobileTxRef.id,
              status: 'completed',
              notes: `Vente de caisse POS #${saleRef.id.slice(-6)}`,
              countryCode: 'TG',
              merchantNumber: momoOperator === 'tmoney' ? '90000000' : '99000000'
            });
          }

          transaction.set(saleRef, saleData);

          // Update preloaded order status
          if (loadedOrderId) {
            const orderRef = doc(db, 'commandes', loadedOrderId);
            transaction.update(orderRef, { status: 'completed' });
          }

          // Save items & update stocks
          itemsToSave.forEach((item, index) => {
            const itemRef = doc(collection(db, `sales/${saleRef.id}/items`));
            transaction.set(itemRef, {
              storeId: userProfile.storeId,
              productId: item.productId,
              name: item.name,
              quantity: item.quantity,
              priceAtSale: item.priceAtSale,
              total: item.total
            });

            const productSnap = productSnaps[index];
            if (productSnap.exists()) {
              const newStock = (productSnap.data().stock || 0) - item.quantity;
              transaction.update(productSnap.ref, { stock: newStock });
            }
          });

          setLastSaleId(saleId);
          setLastSaleData({
            items: itemsToSave,
            total: saleTotal,
            discount: saleDiscount,
            amountReceived: saleAmountReceived,
            change: saleChange,
            id: saleId,
            date: new Date(),
            clientName: selectedClient?.name,
            clientPhone: selectedClient?.phone || momoPhoneNumber || undefined,
            clientMatricule: selectedClient?.matricule
          });
        });
      }

      setCheckoutStep('receipt');
      setCart([]);
      setDiscount(0);
      setAmountReceived(0);
      setSelectedClient(null);
      setLoadedOrderId(null);
      setLoadedOrderNumber(null);
    } catch (error) {
      console.warn("Online checkout encountered a hurdle. Saving locally to Offline-First POS queue:", error);
      try {
        const fallbackId = 'offline_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
        const offlineSaleData: any = {
          id: fallbackId,
          storeId: userProfile.storeId,
          timestamp: new Date().toISOString(),
          cashierId: auth.currentUser?.uid || 'offline_cashier',
          cashierName: userProfile?.displayName || 'Admin',
          totalAmount: saleTotal,
          discount: saleDiscount,
          amountReceived: saleAmountReceived,
          change: saleChange,
          paymentMethod,
          itemsCount: itemsToSave.length,
          _isOfflineCreated: true,
          items: itemsToSave.map(item => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            priceAtSale: item.priceAtSale,
            total: item.total
          }))
        };

        if (selectedClient) {
          offlineSaleData.clientId = selectedClient.id || '';
          offlineSaleData.clientName = selectedClient.name || '';
          offlineSaleData.clientPhone = selectedClient.phone || '';
          offlineSaleData.clientMatricule = selectedClient.matricule || '';
        }

        if (paymentMethod === 'mobile') {
          offlineSaleData.momoOperator = momoOperator;
          offlineSaleData.momoPhoneNumber = momoPhoneNumber;
          offlineSaleData.momoTransactionId = momoTransactionId || `SIM-TX-${Math.floor(100000 + Math.random() * 900000)}`;
          offlineSaleData.momoStatus = 'success';
        }

        const updatedQueue = [...offlineSales, offlineSaleData];
        setOfflineSales(updatedQueue);
        localStorage.setItem(`marketpro-offline-sales-${userProfile.storeId}`, JSON.stringify(updatedQueue));

        setProducts(prev => {
          const next = prev.map(p => {
            const sold = itemsToSave.find(item => item.productId === p.id);
            return sold ? { ...p, stock: Math.max(0, (p.stock || 0) - sold.quantity) } : p;
          });
          localStorage.setItem(`marketpro-products-${userProfile.storeId}`, JSON.stringify(next));
          return next;
        });

        setLastSaleId(fallbackId);
        setLastSaleData({
          items: itemsToSave,
          total: saleTotal,
          discount: saleDiscount,
          amountReceived: saleAmountReceived,
          change: saleChange,
          id: fallbackId,
          date: new Date(),
          clientName: selectedClient?.name,
          clientPhone: selectedClient?.phone || momoPhoneNumber || undefined,
          clientMatricule: selectedClient?.matricule
        });

        setCheckoutStep('receipt');
        setCart([]);
        setDiscount(0);
        setAmountReceived(0);
        setSelectedClient(null);
        setLoadedOrderId(null);
        setLoadedOrderNumber(null);
      } catch (fallbackErr) {
        handleFirestoreError(fallbackErr, OperationType.WRITE, 'checkout-fallback');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F4 to Focus Search (Home for many POS systems)
      if (e.key === 'F4') {
        e.preventDefault();
        // The search input is in App.tsx typically, but if we have local search:
        // For now, let's focus the common search pattern
        const globalSearch = document.querySelector('input[type="text"]') as HTMLInputElement;
        if (globalSearch) globalSearch.focus();
      }

      // F2 to Pay
      if (e.key === 'F2' && cart.length > 0 && !isCheckoutOpen) {
        e.preventDefault();
        setIsCheckoutOpen(true);
      }

      // Enter to process checkout if open
      if (e.key === 'Enter' && isCheckoutOpen && checkoutStep === 'cart' && !isProcessing) {
        if (paymentMethod !== 'cash' || amountReceived >= total) {
          handleCheckout();
        }
      }

      // F3 to trigger Barcode Scanner
      if (e.key === 'F3' && !isCheckoutOpen) {
        e.preventDefault();
        setIsScannerOpen(prev => !prev);
      }

      // Escape to close modals
      if (e.key === 'Escape') {
        setIsCheckoutOpen(false);
        setIsScannerOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart.length, isCheckoutOpen, checkoutStep, isProcessing, paymentMethod, amountReceived, total, isScannerOpen]);

  const filteredProducts = products.filter(p => {
    const searchLower = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(searchLower) || 
      (p.barcode && p.barcode.includes(searchQuery)) ||
      (p.sku && p.sku.toLowerCase().includes(searchLower)) ||
      (p.category && p.category.toLowerCase().includes(searchLower))
    );
  });

  return (
    <div className="h-auto lg:h-[calc(100vh-7.5rem)] flex flex-col lg:flex-row gap-6 overflow-y-auto lg:overflow-hidden">
      {/* Products Side */}
      <div className="flex-1 flex flex-col gap-4 lg:overflow-hidden">
        <div className="flex items-center justify-between gap-4">
           <h1 className="text-2xl font-black tracking-tighter text-gray-900 uppercase">Point de Vente</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <button 
              onClick={() => setIsScannerOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:brightness-105 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95 border border-orange-500"
              title="Scanner un code-barres (F3)"
            >
              <ScanBarcode size={14} className="text-white" />
              <span>Scanner (F3)</span>
            </button>
            <button 
              onClick={() => setIsOrdersDrawerOpen(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 border ${
                activeOrders.length > 0 
                  ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600 animate-pulse' 
                  : 'bg-white text-gray-900 border-gray-100 hover:bg-gray-50'
              }`}
            >
              <Bell size={14} className={activeOrders.length > 0 ? 'text-white font-black' : 'text-orange-500'} />
              <span>Commandes ({activeOrders.length})</span>
            </button>
            <button 
              onClick={() => navigate('/history')}
              className="flex items-center gap-2 px-4 py-2 bg-white text-gray-900 border border-gray-100 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm active:scale-95"
            >
              <History size={14} className="text-orange-500" />
              Journal
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[550px] md:min-w-0">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell">SKU</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Article</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Prix</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Stock</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.map(product => (
                    <tr 
                      key={product.id} 
                      onClick={() => product.stock > 0 && addToCart(product)}
                      className={`transition-colors group ${product.stock > 0 ? 'hover:bg-orange-50 cursor-pointer' : 'opacity-50 grayscale cursor-not-allowed'}`}
                    >
                      <td className="px-4 py-2.5 hidden sm:table-cell">
                        <span className="text-[10px] font-mono font-bold text-gray-400 group-hover:text-orange-500 transition-colors uppercase">
                          {product.sku || '---'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="max-w-[130px] sm:max-w-none">
                          <p className="font-bold text-xs text-gray-900 group-hover:text-orange-600 transition-colors truncate">{product.name}</p>
                          <p className="text-[9px] text-gray-400 font-medium uppercase tracking-widest">{product.category}</p>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-black text-xs text-gray-900 whitespace-nowrap">
                        {(product.price || 0).toLocaleString('de-DE')}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${product.stock > 10 ? 'bg-green-100 text-green-700' : product.stock > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          {product.stock} {product.unit}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button 
                          disabled={product.stock <= 0}
                          className={`p-1.5 rounded-lg transition-all ${product.stock > 0 ? 'bg-gray-100 text-gray-400 group-hover:bg-orange-500 group-hover:text-white' : 'bg-gray-50 text-gray-300'}`}
                        >
                          <Plus size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {filteredProducts.length === 0 && (
              <div className="p-12 text-center text-gray-400">
                <Package size={40} className="mx-auto mb-4 opacity-20" />
                <p className="text-sm">Aucun produit trouvé</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cart Side */}
      <div id="cart-side-section" className="w-full lg:w-[480px] xl:w-[545px] flex flex-col bg-white rounded-[32px] border border-gray-100 shadow-lg shrink-0 overflow-hidden min-h-[450px] max-h-[85vh] lg:max-h-full lg:h-full transition-all">
        <div className="p-6 bg-gradient-to-r from-orange-600 to-amber-500 text-white">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart size={20} className="text-white" />
            <h2 className="text-xl font-bold">Panier</h2>
          </div>
          <p className="text-xs text-orange-100">{cart.length} articles sélectionnés</p>
        </div>

        {loadedOrderNumber && (
          <div className="bg-orange-500 text-white px-6 py-4.5 text-xs font-black flex items-center justify-between gap-3 border-b border-orange-600/20">
            <span className="flex items-center gap-2">
              <ClipboardList size={18} className="shrink-0 animate-bounce" />
              <span>Commande en cours : <strong className="underline text-white font-black">{loadedOrderNumber}</strong></span>
            </span>
            <button 
              onClick={() => {
                setLoadedOrderId(null);
                setLoadedOrderNumber(null);
              }}
              className="hover:bg-black/20 p-2 rounded-full transition-colors"
              title="Détacher la commande"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="p-4 bg-gray-50 border-b border-gray-100">
           <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Client</label>
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Rechercher un client..."
                    className="w-full bg-white border border-gray-100 rounded-xl pl-8 pr-3 py-1.5 text-xs font-bold outline-none focus:border-orange-500"
                  />
                </div>
                <select 
                  value={selectedClient?.id || ''}
                  onChange={(e) => {
                    const client = clients.find(c => c.id === e.target.value);
                    setSelectedClient(client || null);
                  }}
                  className="w-full bg-white border border-gray-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-orange-500"
                >
                  <option value="">Client de passage</option>
                  {clients
                    .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()) || c.phone.includes(clientSearch))
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                    ))}
                </select>
              </div>
           </div>
        </div>

        <div className="relative flex-1 flex flex-col min-h-0">
          {/* Controls to scroll up & down */}
          {cart.length > 0 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-30">
              <button 
                onClick={scrollCartToTop}
                className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white w-9 h-9 rounded-full shadow-lg border border-orange-400 flex items-center justify-center transition-all cursor-pointer opacity-70 hover:opacity-100"
                title="Glisser vers le haut (Défilement)"
              >
                <ChevronUp size={18} className="font-extrabold" />
              </button>
              <button 
                onClick={scrollCartToBottom}
                className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white w-9 h-9 rounded-full shadow-lg border border-orange-400 flex items-center justify-center transition-all cursor-pointer opacity-70 hover:opacity-100"
                title="Glisser vers le bas (Défilement)"
              >
                <ChevronDown size={18} className="font-extrabold" />
              </button>
            </div>
          )}

          <div ref={cartListRef} className="flex-1 overflow-y-auto p-4 space-y-4 pr-12">
            {cart.map(item => (
              <div 
                key={item.id}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl"
              >
                <div className="flex-1 overflow-hidden">
                  <h4 className="font-bold text-sm text-gray-900 truncate">{item.name}</h4>
                  <p className="text-xs text-gray-500">{(item.priceAtSale || 0).toLocaleString('de-DE')} FCFA</p>
                </div>
                <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-xl border border-gray-100">
                  <button onClick={() => updateQuantity(item.id, -1)} className="text-gray-400 hover:text-gray-900"><Minus size={14} /></button>
                  <span className="text-xs font-black min-w-[20px] text-center">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1)} className="text-gray-400 hover:text-gray-900"><Plus size={14} /></button>
                </div>
                <button 
                  onClick={() => removeFromCart(item.id)}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {cart.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50 pt-10">
                <ShoppingCart size={48} className="mb-4" />
                <p className="font-medium text-sm">Le panier est vide</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 mt-auto">
          <div className="space-y-1.5 mb-4">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Sous-total</span>
              <span className="font-bold">{(subtotal || 0).toLocaleString('de-DE')} FCFA</span>
            </div>
            <div className="flex justify-between text-lg font-black text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span>
              <span className="text-orange-500 font-extrabold">{total.toLocaleString('de-DE')} FCFA</span>
            </div>
          </div>

          {cart.length > 0 && (
            <button 
              disabled={isProcessing}
              onClick={() => setIsCheckoutOpen(true)}
              className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-orange-500/20 active:scale-[0.98]"
            >
              Payer Maintenant
              <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Checkout Modal MODERNIZED */}
      <AnimatePresence>
        {isCheckoutOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              onClick={() => !isProcessing && setIsCheckoutOpen(false)} 
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="relative bg-white w-full md:max-w-4xl max-h-[95vh] md:max-h-[85vh] sm:rounded-[28px] shadow-2xl overflow-hidden flex flex-col text-slate-800"
            >
              {checkoutStep === 'cart' ? (
                <div className="flex flex-col h-full overflow-hidden">
                  {/* Header */}
                  <div className="p-4 sm:p-5 pb-3 border-b border-gray-100 flex justify-between items-center shrink-0">
                    <div>
                      <h2 className="text-lg font-black text-gray-900 tracking-tight italic uppercase decoration-orange-500 decoration-2 underline-offset-4">RÈGLEMENT</h2>
                      <p className="text-[7.5px] uppercase font-black tracking-widest text-gray-400 mt-0.5">Étape finale</p>
                    </div>
                    <button onClick={() => setIsCheckoutOpen(false)} className="p-1.5 hover:bg-gray-50 rounded-full transition-all group">
                      <X size={16} className="text-gray-300 group-hover:text-gray-900" />
                    </button>
                  </div>
                  
                  {/* Landscape Grid body */}
                  <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {/* Left Column: Payment Method & Dynamic inputs */}
                    <div className="space-y-4">
                      <div>
                        <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 block mb-2">Méthode de Paiement</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'cash', icon: Banknote, label: 'Cash' },
                            { id: 'card', icon: CreditCard, label: 'Carte' },
                            { id: 'mobile', icon: Smartphone, label: 'Mobile' }
                          ].map(method => (
                            <button
                              key={method.id}
                              onClick={() => setPaymentMethod(method.id as PaymentMethod)}
                              className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all ${paymentMethod === method.id ? 'border-orange-500 bg-orange-50 text-orange-600 shadow-md shadow-orange-50/5' : 'border-gray-50 hover:border-gray-100 text-gray-400'}`}
                            >
                              <method.icon size={18} />
                              <span className="text-[7.5px] font-black uppercase tracking-widest">{method.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {paymentMethod === 'cash' && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-2.5"
                        >
                          <div className="space-y-1">
                            <label className="text-[7.5px] font-black uppercase tracking-widest text-gray-400 ml-1">Montant Reçu</label>
                            <input 
                              type="number"
                              value={amountReceived || ''}
                              onChange={(e) => setAmountReceived(Number(e.target.value))}
                              autoFocus
                              placeholder="0"
                              className="w-full bg-gray-50 border-none focus:bg-white focus:ring-2 focus:ring-orange-500/5 rounded-xl py-2 px-4 text-lg font-black outline-none transition-all text-gray-900"
                            />
                          </div>
                          
                          <div className="bg-orange-50 p-2.5 rounded-xl flex justify-between items-center border border-orange-100 shadow-inner">
                            <div>
                              <p className="text-orange-600 font-black uppercase tracking-[0.2em] text-[7px] mb-0.5">Rendu</p>
                              <p className="text-base font-black text-orange-600 italic">{(change || 0).toLocaleString('de-DE')} <span className="text-[7.5px] font-mono opacity-50">FCFA</span></p>
                            </div>
                            <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center text-orange-500 border border-orange-100/20">
                              <Banknote size={14} />
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {paymentMethod === 'mobile' && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-100"
                        >
                          <div className="flex justify-between items-center pb-1.5 border-b border-gray-100">
                            <span className="text-[8px] font-black uppercase tracking-wider text-gray-400">Opérateur Togo</span>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => setMomoOperator('tmoney')}
                                className={`px-2.5 py-1 rounded-lg font-black text-[9px] uppercase transition-all ${momoOperator === 'tmoney' ? 'bg-amber-500 text-white shadow-sm' : 'bg-white text-gray-400 border border-gray-150'}`}
                              >
                                T-Money
                              </button>
                              <button
                                type="button"
                                onClick={() => setMomoOperator('flooz')}
                                className={`px-2.5 py-1 rounded-lg font-black text-[9px] uppercase transition-all ${momoOperator === 'flooz' ? 'bg-teal-600 text-white shadow-sm' : 'bg-white text-gray-400 border border-gray-150'}`}
                              >
                                Flooz
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[7.5px] font-black uppercase tracking-widest text-gray-400">Téléphone de l'expéditeur</label>
                            <input 
                              type="text"
                              value={momoPhoneNumber}
                              onChange={(e) => setMomoPhoneNumber(e.target.value)}
                              placeholder="Ex: 90123456"
                              className="w-full bg-white border border-gray-200 focus:ring-2 focus:ring-orange-200 rounded-xl py-2 px-3 text-xs font-bold outline-none text-gray-900"
                            />
                          </div>

                          {/* USSD Instruction Panel */}
                          <div className="bg-white p-2 rounded-lg border border-gray-150 space-y-1 text-center">
                            <p className="text-[7px] font-black text-gray-400 uppercase tracking-wider">Dialer Code (Dial/USSD)</p>
                            <div className="flex items-center justify-center gap-1.5 bg-gray-50 py-1 px-2 rounded font-mono text-[10px] font-black text-slate-800">
                              <span>
                                {momoOperator === 'tmoney' 
                                  ? `*145*2*${total}*90000000#` 
                                  : `*155*2*1*99000000*${total}#`}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const code = momoOperator === 'tmoney' 
                                    ? `*145*2*${total}*90000000#` 
                                    : `*155*2*1*99000000*${total}#`;
                                  navigator.clipboard.writeText(code);
                                }}
                                className="text-[8px] px-1 py-0.5 bg-orange-100 hover:bg-orange-200 text-orange-600 rounded transition-all uppercase font-sans font-bold"
                              >
                                Copier
                              </button>
                            </div>
                          </div>

                          {/* Momo push simulator */}
                          <div className="space-y-1.5">
                            {momoStatus === 'none' && (
                              <button
                                type="button"
                                onClick={startMomoPaymentSimulation}
                                className="w-full py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl text-[9px] font-black uppercase tracking-wider shadow-md shadow-orange-500/10 flex items-center justify-center gap-1"
                              >
                                <Smartphone size={12} />
                                Déclencher le paiement push (Simulé)
                              </button>
                            )}

                            {momoStatus === 'simulating' && (
                              <div className="w-full py-2 bg-gray-100 text-gray-400 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5">
                                <Loader2 className="animate-spin text-orange-500" size={12} />
                                Attente du SMS de confirmation...
                              </div>
                            )}

                            {momoStatus === 'success' && (
                              <div className="p-2.5 bg-green-50 border border-green-150 rounded-xl space-y-1">
                                <div className="flex items-center gap-1.5 text-green-700 font-black text-[9px] uppercase tracking-wider">
                                  <span className="w-2 h-2 bg-green-500 rounded-full animate-ping" />
                                  Paiement Reçu avec Succès
                                </div>
                                <p className="text-[8px] font-mono text-green-600">
                                  Réf TX: <span className="font-bold">{momoTransactionId}</span>
                                </p>
                              </div>
                            )}

                            {momoError && (
                              <p className="text-[8px] text-red-500 font-black">{momoError}</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </div>

                    {/* Right Column: Recap & Totals & Submit */}
                    <div className="flex flex-col justify-between space-y-4">
                      <div className="space-y-3">
                        <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 block">Détails de la vente</label>
                        {/* Recu / Remise & Taxes Details */}
                        <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100/80 space-y-1.5">
                          <div className="flex justify-between items-center text-[11px] text-gray-500">
                            <span className="font-medium text-gray-500">Sous-total</span>
                            <span className="font-bold text-gray-900">{(subtotal || 0).toLocaleString('de-DE')} FCFA</span>
                          </div>
                          
                          <div className="flex items-center justify-between gap-4 py-1 border-t border-b border-gray-100">
                            <label className="text-[9px] font-black uppercase text-gray-400">Remise (FCFA)</label>
                            <input 
                              type="number"
                              value={discount || ''}
                              onChange={(e) => setDiscount(Number(e.target.value))}
                              placeholder="0"
                              className="w-24 bg-white border border-gray-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-200 rounded-md px-2 py-0.5 text-right font-black text-xs outline-none"
                            />
                          </div>

                          <div className="flex justify-between items-center text-[11px] text-gray-500">
                            <span className="font-medium text-gray-505">Taxes (0%)</span>
                            <span className="font-bold text-gray-900">0 FCFA</span>
                          </div>
                        </div>

                        <div className="bg-gray-900 py-3 px-4 rounded-xl text-white shadow-lg relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 -mr-8 -mt-8 rounded-full" />
                          <div className="relative">
                            <p className="text-[7.5px] font-black uppercase tracking-[0.3em] opacity-40 mb-0.5 font-sans">Total à payer</p>
                            <p className="text-xl font-black italic">{(total || 0).toLocaleString('de-DE')} <span className="text-[8px] opacity-40 font-mono">FCFA</span></p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-gray-100 flex gap-2.5">
                        <button 
                          onClick={() => setIsCheckoutOpen(false)}
                          className="flex-1 py-2.5 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all"
                        >
                          Annuler
                        </button>
                        <button 
                          onClick={handleCheckout}
                          disabled={isProcessing || (paymentMethod === 'cash' && amountReceived < total) || (paymentMethod === 'mobile' && momoStatus !== 'success')}
                          className="flex-[2] py-2.5 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {isProcessing ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : (
                            <>
                              <Check size={14} />
                              {paymentMethod === 'mobile' ? 'Confirmer encaissement' : 'Encaisser'}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full overflow-hidden">
                  {/* Header */}
                  <div className="p-4 sm:p-5 pb-3 border-b border-gray-100 flex justify-between items-center shrink-0">
                    <div>
                      <h2 className="text-lg font-black text-gray-900 tracking-tight italic uppercase decoration-orange-500 decoration-2 underline-offset-4">VENTE REUSSIE</h2>
                      <p className="text-[7.5px] uppercase font-black tracking-widest text-gray-400 mt-0.5">Confirmation & Reçus</p>
                    </div>
                  </div>
                  
                  {/* Landscape Grid success body */}
                  <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {/* Left Column: Congratulations & Document Controls */}
                    <div className="flex flex-col items-center justify-center text-center p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                      <motion.div 
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="w-12 h-12 bg-green-500 text-white rounded-[16px] flex items-center justify-center mb-3 shadow-xl shadow-green-500/20 transform rotate-6"
                      >
                        <Check size={26} className="stroke-[3]" />
                      </motion.div>
                      <h2 className="text-xl font-black mb-1 tracking-tight italic uppercase text-slate-900">Terminé !</h2>
                      <p className="text-gray-400 font-bold text-[8px] uppercase tracking-widest mb-4">Transaction #{lastSaleId.slice(-8).toUpperCase()}</p>
                      
                      <div className="grid grid-cols-2 gap-2 w-full">
                        <button 
                          onClick={handlePrint}
                          className="flex flex-col items-center justify-center gap-1 py-2 bg-gray-50 hover:bg-gray-100 text-slate-900 rounded-xl font-black uppercase tracking-widest text-[8px] transition-all border border-gray-200 shadow-sm"
                          title="Imprimer un reçu physique"
                        >
                          <Printer size={14} className="text-orange-500" />
                          <span>Imprimer</span>
                        </button>
                        
                        <button 
                          onClick={handleDownloadPDF}
                          className="flex flex-col items-center justify-center gap-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-black uppercase tracking-widest text-[8px] transition-all shadow-md shadow-orange-500/10"
                          title="Télécharger le fichier PDF"
                        >
                          <FileDown size={14} className="text-white" />
                          <span>Télécharger</span>
                        </button>
   
                        <button 
                          onClick={handleOpenPDFInNewTab}
                          className="flex flex-col items-center justify-center gap-1 py-2 bg-gray-50 hover:bg-gray-100 text-slate-900 rounded-xl font-black uppercase tracking-widest text-[8px] transition-all border border-gray-200 shadow-sm"
                          title="Ouvrir le reçu dans un nouvel onglet"
                        >
                          <ExternalLink size={14} className="text-amber-500" />
                          <span>Aperçu PDF</span>
                        </button>
   
                        <button 
                          onClick={handleSharePDF}
                          className="flex flex-col items-center justify-center gap-1 py-2 bg-gray-50 hover:bg-gray-100 text-slate-900 rounded-xl font-black uppercase tracking-widest text-[8px] transition-all border border-gray-200 shadow-sm"
                          title="Partager le reçu via le canevas de partage natif ou copie-presse"
                        >
                          <Share2 size={14} className="text-purple-500" />
                          <span>Partager</span>
                        </button>
                      </div>
                    </div>

                    {/* Right Column: Thermal Printing & Digital Receipt & Action button */}
                    <div className="flex flex-col justify-between space-y-4">
                      <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-150 space-y-3 text-left">
                        <div>
                          <h4 className="text-[9px] font-black uppercase tracking-widest text-orange-600 mb-1.5 flex items-center gap-1.5">
                            <Printer size={10} />
                            Impression Thermique Directe
                          </h4>
                          {!btCharacteristic ? (
                            <button
                              type="button"
                              onClick={connectBluetoothPrinter}
                              disabled={isBtConnecting}
                              className="w-full py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-600/50 text-white text-[8px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5"
                            >
                              {isBtConnecting ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Printer size={12} />
                              )}
                              Connecter Imprimante ESC/POS (Bluetooth)
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={printDirectThermal}
                              disabled={isBtPrinting}
                              className="w-full py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 text-white text-[8px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-green-500/10"
                            >
                              {isBtPrinting ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Printer size={12} />
                              )}
                              Imprimer Ticket Thermique (ESC/POS)
                            </button>
                          )}
                          {btError && <p className="text-[7.5px] text-red-500 mt-1 font-semibold">{btError}</p>}
                        </div>
   
                        <div className="border-t border-gray-200 pt-3">
                          <h4 className="text-[9px] font-black uppercase tracking-widest text-orange-600 mb-2 flex items-center gap-1.5">
                            <MessageSquare size={10} />
                            Reçu Numérique (WhatsApp / SMS)
                          </h4>
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={sharePhoneNumber}
                              onChange={(e) => setSharePhoneNumber(e.target.value)}
                              placeholder="Ex: +22890123456"
                              className="w-full bg-white border border-gray-200 rounded-xl py-2 px-3 text-xs font-bold outline-none text-gray-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => handleWhatsAppReceipt()}
                                className="py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[8px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm"
                              >
                                <MessageSquare size={12} />
                                WhatsApp
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSMSReceipt()}
                                className="py-2 bg-blue-500 hover:bg-blue-600 text-white text-[8px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm"
                              >
                                <Smartphone size={12} />
                                SMS Direct
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={() => { setIsCheckoutOpen(false); setCheckoutStep('cart'); }}
                        className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all shadow-md font-sans shrink-0"
                      >
                        Terminer (Vente Suivante)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Barcode Camera Scanner Modal Overlay */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        products={products}
        onAddProduct={addToCart}
      />

      {/* Floating Real-time Notification Toast Banner */}
      <div className="fixed top-6 right-6 z-50 pointer-events-none w-full max-w-sm">
        <AnimatePresence>
          {showNotificationBanner && latestNewOrder && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className="bg-slate-900 text-white rounded-[24px] shadow-2xl p-4 border border-white/10 pointer-events-auto flex gap-4 items-center relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-orange-500 to-amber-400 w-full animate-pulse" />
              <div className="w-12 h-12 bg-orange-500/10 text-orange-400 rounded-2xl flex items-center justify-center shrink-0">
                <Bell className="animate-bounce" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-extrabold text-sm truncate uppercase tracking-wide flex items-center gap-2">
                  <span>Nouvelle Commande !</span>
                  <span className="animate-ping d-inline-block w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                </h4>
                <p className="text-xs text-slate-300 font-bold mt-0.5 truncate">
                  {latestNewOrder.number} pour <span className="text-orange-400">{latestNewOrder.clientName || 'Passager'}</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-1">{latestNewOrder.totalAmount.toLocaleString()} FCFA • {latestNewOrder.items.length} articles</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => latestNewOrder && handleLoadOrder(latestNewOrder)}
                  className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all text-white font-extrabold text-[10px] rounded-xl uppercase tracking-wider shrink-0 shadow-md"
                >
                  Charger
                </button>
                <button
                  onClick={() => setShowNotificationBanner(false)}
                  className="p-1.5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors text-center text-[9px] font-bold"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Active Orders Drawer Slide-over */}
      <AnimatePresence>
        {isOrdersDrawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOrdersDrawerOpen(false)}
            />
            {/* Drawer Body */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col z-10 overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 bg-gray-900 text-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <ClipboardList className="text-orange-500" size={24} />
                  <div>
                    <h2 className="text-xl font-extrabold tracking-tight">Commandes en Attente</h2>
                    <p className="text-xs text-slate-400">{activeOrders.length} nouvelles ou préparées</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsOrdersDrawerOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {/* List Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
                {activeOrders.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-12 text-center text-slate-400">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                      <ClipboardList className="text-slate-300" size={32} />
                    </div>
                    <h3 className="font-bold text-slate-800 text-base">Aucune commande active</h3>
                    <p className="text-xs text-slate-400 max-w-[240px] mt-1.5">
                      Les nouvelles commandes passées par les serveurs ou l'exploitation s'afficheront ici en temps réel.
                    </p>
                  </div>
                ) : (
                  activeOrders.map((order) => {
                    const orderDate = order.timestamp?.toDate ? order.timestamp.toDate() : new Date();
                    const formattedTime = orderDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    
                    return (
                      <div 
                        key={order.id}
                        className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow relative overflow-hidden"
                      >
                        {/* Top info and status badge */}
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <span className="text-sm font-black text-slate-900 block">{order.number}</span>
                            <span className="text-[10px] text-slate-400">{formattedTime}</span>
                          </div>
                          
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                            order.status === 'served' 
                              ? 'bg-orange-50 border-orange-100 text-orange-600' 
                              : 'bg-amber-50 border-amber-100 text-amber-600'
                          }`}>
                            {order.status === 'served' ? 'Préparée' : 'En cours'}
                          </span>
                        </div>

                        {/* Details and client info */}
                        <div className="text-xs space-y-1 text-slate-500 mb-4 bg-slate-50/50 p-3 rounded-2xl">
                          <p>Client: <strong className="text-slate-800 font-bold">{order.clientName || 'Passager'}</strong></p>
                          <p>Créé par: <span className="font-semibold">{order.createdByName || 'Serveur'}</span></p>
                          {order.notes && (
                            <p className="italic text-amber-800 bg-amber-50/40 px-2 py-1 rounded-lg mt-1 inline-block">
                              "{order.notes}"
                            </p>
                          )}
                        </div>

                        {/* Items listed */}
                        <div className="space-y-1.5 mb-4 max-h-32 overflow-y-auto border-t border-slate-100 pt-3">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs text-slate-600 font-medium">
                              <span>{item.name} <span className="text-slate-400">x{item.quantity}</span></span>
                              <span className="font-bold text-slate-800">{item.total.toLocaleString()} F</span>
                            </div>
                          ))}
                        </div>

                        {/* Total pricing and select button */}
                        <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-3">
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 font-bold block">Total</span>
                            <span className="text-base font-black text-slate-900">{order.totalAmount.toLocaleString()} FCFA</span>
                          </div>
                          <button
                            onClick={() => handleLoadOrder(order)}
                            className="flex items-center gap-1.5 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all text-white font-bold rounded-2xl text-xs uppercase"
                          >
                            <ShoppingCart size={14} />
                            Facturer
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    {/* Hidden Receipt for Printing (Thermal Optimized) */}
    <div id="receipt-print" className="fixed left-[-9999px] top-0 print:static print:block font-mono text-[10px] w-[80mm] mx-auto px-2 py-1 bg-white text-black leading-tight">
      {lastSaleData && (
        <>
          <div className="text-center mb-2">
            <img src={storeSettings?.logoUrl || defaultLogo} alt="Logo" className="w-12 h-12 mx-auto mb-2 object-contain" />
            <h1 className="text-sm font-bold uppercase tracking-widest">{storeSettings?.name || 'SUPERMARKET PRO'}</h1>
            <p className="text-[8px] italic">{storeSettings?.address || 'Dakar, Sénégal'}</p>
            <p className="text-[8px]">Tel: {storeSettings?.phone || '+221 33 000 00 00'}</p>
            
            {lastSaleData?.clientName && (
              <div className="mt-2 pt-2 border-t border-dashed border-gray-300">
                <p className="text-[9px] font-bold uppercase">CLIENT: {lastSaleData.clientName}</p>
                {lastSaleData.clientMatricule && <p className="text-[8px] font-black">{lastSaleData.clientMatricule}</p>}
                <p className="text-[8px]">{lastSaleData.clientPhone}</p>
              </div>
            )}

            <p className="text-[8px] italic font-black mt-2 bg-gray-100 py-1 border-y border-dashed border-gray-300 uppercase">VENDEUR: {userProfile?.displayName || auth.currentUser?.displayName || 'Admin'}</p>
            <div className="border-b border-dashed my-2"></div>
            <p className="font-bold underline">REÇU DE VENTE</p>
            <div className="flex justify-between mt-2 font-mono">
               <span>ID: {lastSaleData.id?.slice(-8).toUpperCase()}</span>
               <span>Caisse: {auth.currentUser?.displayName?.split(' ')[0] || '01'}</span>
            </div>
            <p className="text-left mt-1">Date: {lastSaleData.date?.toLocaleString() || 'N/A'}</p>
          </div>

          <div className="space-y-1 mb-2 border-t border-dashed pt-2">
            <div className="flex justify-between font-bold border-b border-dashed pb-1 mb-1 text-[8px]">
              <span className="w-1/2">ARTICLE</span>
              <span className="w-1/4 text-center">QTÉ</span>
              <span className="w-1/4 text-right">TOTAL</span>
            </div>
            {lastSaleData.items?.map((item, idx) => (
              <div key={idx} className="flex justify-between py-0.5 text-[8px]">
                <span className="w-1/2 truncate uppercase">{item.name}</span>
                <span className="w-1/4 text-center">{item.quantity}</span>
                <span className="w-1/4 text-right">{(item.total || 0).toLocaleString('de-DE')}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed pt-2 space-y-1">
            <div className="flex justify-between text-[8px]">
              <span>SOUS-TOTAL</span>
              <span>{((lastSaleData.total || 0) + (lastSaleData.discount || 0)).toLocaleString('de-DE')}</span>
            </div>
            {lastSaleData.discount > 0 && (
              <div className="flex justify-between text-[8px] italic">
                <span>REMISE</span>
                <span>-{(lastSaleData.discount || 0).toLocaleString('de-DE')}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm">
              <span>TOTAL</span>
              <span>{(lastSaleData.total || 0).toLocaleString('de-DE')} FCFA</span>
            </div>
            <div className="flex justify-between text-[8px] pt-1">
              <span>MONTANT REÇU</span>
              <span>{(lastSaleData.amountReceived || 0).toLocaleString('de-DE')}</span>
            </div>
            <div className="flex justify-between text-[8px] font-bold">
              <span>RENDU</span>
              <span>{(lastSaleData.change || 0).toLocaleString('de-DE')}</span>
            </div>
            <div className="flex justify-between text-[8px] pt-1 uppercase opacity-70">
              <span>PAIEMENT:</span>
              <span className="font-bold">{paymentMethod}</span>
            </div>
          </div>

          <div className="text-center mt-2 border-t border-dashed pt-2 mb-1">
            <p className="text-[8px] font-black uppercase">MERCI DE VOTRE VISITE</p>
          </div>
        </>
      )}
    </div>

    {/* Floating Mobile Cart Shortcut Badge */}
    {cart.length > 0 && (
      <button 
        onClick={() => {
          const el = document.getElementById('cart-side-section');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }}
        className="lg:hidden fixed bottom-6 right-6 z-40 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-full px-5 py-3.5 shadow-2xl flex items-center gap-2 font-black text-xs uppercase tracking-widest animate-bounce border border-orange-400/30"
      >
        <ShoppingCart size={15} className="text-white shrink-0 animate-pulse" />
        <span>Panier ({cart.reduce((acc, curr) => acc + curr.quantity, 0)}) • {total.toLocaleString('de-DE')} F</span>
        <ArrowRight size={13} className="text-white shrink-0" />
      </button>
    )}
    </div>
  );
}
