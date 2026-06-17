import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  ClipboardList,
  Package, 
  BarChart3, 
  Settings as SettingsIcon, 
  LogOut, 
  User,
  ShoppingBag,
  History,
  Menu,
  X,
  Globe,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  Package as PackageIcon,
  Lock,
  Smartphone,
  Store,
  MessageSquare,
  Bell,
  BellRing,
  Calendar,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Trash2,
  CheckCheck,
  Check
} from 'lucide-react';
import { onSnapshot, collection, doc, getDoc, setDoc, updateDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Pos from './components/Pos';
import SalesHistory from './components/SalesHistory';
import Accounting from './components/Accounting';
import Personnel from './components/Personnel';
import Clients from './components/Clients';
import Settings from './components/Settings';
import SuperAdmin from './components/SuperAdmin';
import Login from './components/Login';
import LandingPage from './components/LandingPage';
import Register from './components/Register';
import MobileMoney from './components/MobileMoney';
import Commandes from './components/Commandes';
import Chat from './components/Chat';
import { translations, Language } from './lib/translations';
import { UserRole, StoreSettings, Client, UserProfile, Product } from './types';

// Simple Context for Global Settings
export type Theme = 'default' | 'light-blue' | 'black' | 'dark-blue' | 'white' | 'dark-gray';

export const AppContext = createContext({
  language: 'fr' as Language,
  setLanguage: (l: Language) => {},
  theme: 'default' as Theme,
  setTheme: (t: Theme) => {},
  searchQuery: '',
  setSearchQuery: (q: string) => {},
  userRole: 'admin' as UserRole,
  setUserRole: (r: UserRole) => {},
  settings: null as StoreSettings | null,
  userProfile: null as any | null,
  lowStockCount: 0,
  hasPermission: (module: string, action: 'read' | 'create' | 'update' | 'delete') => false,
  preselectedClient: null as Client | null,
  setPreselectedClient: (client: Client | null) => {},
  verifyAction: (onSuccess: () => void) => {},
});

function UserHeader({ isLicenseValid }: { isLicenseValid: boolean }) {
  const { language, searchQuery, setSearchQuery, userRole, lowStockCount, userProfile, settings } = useContext(AppContext);
  const t = translations[language];
  const user = auth.currentUser;
  const [time, setTime] = useState(new Date());
  const [familyStores, setFamilyStores] = useState<StoreSettings[]>([]);

  // Notification States
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [chatMessagesList, setChatMessagesList] = useState<any[]>([]);
  const [leavesList, setLeavesList] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeNotificationTab, setActiveNotificationTab] = useState<'all' | 'alerts' | 'messages'>('all');
  
  // Custom Calendar States & Utility
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const getCalendarDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    // Premier jour du mois en cours
    const firstDayOfMonth = new Date(year, month, 1);
    // Jour de la semaine (0 = Dimanche, 1 = Lundi, etc.)
    const startDayOfWeek = firstDayOfMonth.getDay(); 
    // Ajuster pour démarrer par Lundi (0) jusqu'à Dimanche (6)
    const startOffset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const days = [];
    
    // Remplissage avec les jours du mois précédent
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, daysInPrevMonth - i)
      });
    }
    
    // Jours du mois en cours
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(year, month, i)
      });
    }
    
    // Jours du mois suivant pour compléter à 42 jours (6 lignes de 7 jours)
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i)
      });
    }
    
    return days;
  };
  
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem(`read-notifications-${userProfile?.storeId || 'common'}`);
      return cached ? JSON.parse(cached) : [];
    } catch (_) {
      return [];
    }
  });
  
  const [lastChatReadTime, setLastChatReadTime] = useState<number>(() => {
    try {
      const val = localStorage.getItem(`last-chat-read-${userProfile?.storeId || 'common'}`);
      return val ? parseInt(val, 10) : 0;
    } catch (_) {
      return 0;
    }
  });

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!userProfile?.storeId || !settings) {
      setFamilyStores([]);
      return;
    }

    const parentStoreId = settings.parentStoreId || settings.id;

    // Listen to real-time changes in parent store document
    const unsubscribe = onSnapshot(doc(db, 'storeSettings', parentStoreId), (snap) => {
      if (!snap.exists()) {
        setFamilyStores([]);
        return;
      }
      
      const parentData = snap.data();
      const parentStore = {
        ...parentData,
        id: snap.id
      } as any;

      const combined: any[] = [parentStore];
      const customAnnexes = parentData.annexes || [];
      
      customAnnexes.forEach((ann: any) => {
        combined.push({
          id: ann.id,
          name: ann.name,
          address: ann.address || parentStore.address,
          phone: ann.phone || parentStore.phone,
          parentStoreId: parentStoreId,
          isActive: ann.isActive !== false,
          isAnnexeUnit: true
        });
      });

      setFamilyStores(combined);
    }, (error) => {
      console.warn("Error subscribing to parent store for family stores:", error);
    });

    return () => unsubscribe();
  }, [userProfile?.storeId, settings?.parentStoreId, settings?.id]);

  // Synchroniser les produits pour calculer les ruptures et péremptions
  useEffect(() => {
    if (!user || !userProfile?.storeId) return;
    const q = query(collection(db, 'products'), where('storeId', '==', userProfile.storeId));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      setProductsList(items);
    }, (err) => {
      console.warn("UserHeader products subscription failed:", err);
    });
    return () => unsub();
  }, [user, userProfile?.storeId]);

  // Synchroniser les demandes de congés pour les admins/managers
  useEffect(() => {
    if (!user || !userProfile?.storeId || userRole === 'cashier') return;
    const q = query(collection(db, 'leaves'), where('storeId', '==', userProfile.storeId));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLeavesList(items);
    }, (err) => {
      console.warn("UserHeader leaves subscription failed:", err);
    });
    return () => unsub();
  }, [user, userProfile?.storeId, userRole]);

  // Synchroniser les messages de clavardage pour détecter les nouveaux messages
  useEffect(() => {
    if (!user || !userProfile?.storeId) return;
    const unsubscribes: (() => void)[] = [];
    const storeIdToUse = userProfile.storeId;
    
    // Store message alerts map to combine them
    let combinedMsgs: Record<string, any> = {};

    const handleMessageUpdate = (type: string, msgs: any[]) => {
      msgs.forEach(m => {
        combinedMsgs[m.id] = m;
      });
      setChatMessagesList(Object.values(combinedMsgs));
    };

    // 1. Broadcast announcements
    const q1 = query(collection(db, 'chatMessages'), where('type', '==', 'broadcast'));
    unsubscribes.push(onSnapshot(q1, (snap) => {
      const msgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      handleMessageUpdate('broadcast', msgs);
    }, (err) => {
      console.warn("Header messages Q1 failed:", err);
    }));

    // 2. Active Store discussion channel
    const q2 = query(collection(db, 'chatMessages'), where('storeId', '==', storeIdToUse), where('type', '==', 'store'));
    unsubscribes.push(onSnapshot(q2, (snap) => {
      const msgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      handleMessageUpdate('store', msgs);
    }, (err) => {
      console.warn("Header messages Q2 failed:", err);
    }));

    // 3. Direct Messages received
    const q4 = query(collection(db, 'chatMessages'), where('type', '==', 'direct'), where('recipientId', '==', user.uid));
    unsubscribes.push(onSnapshot(q4, (snap) => {
      const msgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      handleMessageUpdate('direct_received', msgs);
    }, (err) => {
      console.warn("Header messages Q4 failed:", err);
    }));

    return () => {
      unsubscribes.forEach(u => u());
    };
  }, [user, userProfile?.storeId]);

  // Generer les notifications dynamiquement
  const notifications: any[] = [];
  const nowDate = new Date();

  // 1. Alerte Licence expirée / inactive
  if (!isLicenseValid && userRole === 'admin') {
    notifications.push({
      id: 'license-alert',
      type: 'license',
      title: 'Alerte Système',
      description: 'La licence de votre boutique est expirée ou inactive.',
      timestamp: nowDate,
      read: readNotificationIds.includes('license-alert'),
      link: '/settings?tab=license'
    });
  }

  // 2. Congés en attente (Admin ou Manager)
  if (userRole !== 'cashier') {
    leavesList.filter(l => l.status === 'pending').forEach(l => {
      notifications.push({
        id: `leave-${l.id}`,
        type: 'leave',
        title: 'Demande de Congé',
        description: `${l.employeeName} a déposé une demande de congé (${l.type}).`,
        timestamp: l.createdAt ? new Date(l.createdAt) : nowDate,
        read: readNotificationIds.includes(`leave-${l.id}`),
        link: '/personnel'
      });
    });
  }

  // 3. Ruptures de Stock
  if (userRole !== 'cashier') {
    productsList.filter(p => p.stock <= (p.lowStockThreshold || 5)).forEach(p => {
      notifications.push({
        id: `stock-${p.id}`,
        type: 'stock',
        title: 'Stock Critique',
        description: `Le produit "${p.name}" est en rupture ou presque (Reste ${p.stock} ${p.unit}).`,
        timestamp: p.updatedAt ? new Date(p.updatedAt) : nowDate,
        read: readNotificationIds.includes(`stock-${p.id}`),
        link: '/inventory'
      });
    });
  }

  // 4. Expiration proche des produits (peremption)
  if (userRole !== 'cashier') {
    productsList.filter(p => {
      if (!p.expiryDate) return false;
      const exp = new Date(p.expiryDate);
      const diff = exp.getTime() - nowDate.getTime();
      const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
      return diffDays <= 14;
    }).forEach(p => {
      const exp = new Date(p.expiryDate!);
      const expired = exp < nowDate;
      notifications.push({
        id: `expiry-${p.id}`,
        type: 'expiry',
        title: expired ? 'Produit Expiré' : 'Péremption Imminente',
        description: expired 
          ? `Le produit "${p.name}" a expiré le ${exp.toLocaleDateString('fr-FR')}.`
          : `Le produit "${p.name}" expire le ${exp.toLocaleDateString('fr-FR')}.`,
        timestamp: exp,
        read: readNotificationIds.includes(`expiry-${p.id}`),
        link: '/inventory'
      });
    });
  }

  // 5. Nouveaux messages chat non lus
  chatMessagesList.filter(m => {
    if (m.senderId === user?.uid) return false;
    const mTime = m.timestamp?.toDate ? m.timestamp.toDate().getTime() : (m.timestamp ? new Date(m.timestamp).getTime() : 0);
    return mTime > lastChatReadTime;
  }).forEach(m => {
    const mTime = m.timestamp?.toDate ? m.timestamp.toDate() : (m.timestamp ? new Date(m.timestamp) : nowDate);
    notifications.push({
      id: `chat-${m.id}`,
      type: 'message',
      title: m.type === 'broadcast' ? 'Annonce Système' : m.type === 'direct' ? 'Message Privé' : 'Message Équipe',
      description: `${m.senderName} : ${m.message}`,
      timestamp: mTime,
      read: readNotificationIds.includes(`chat-${m.id}`),
      link: '/chat'
    });
  });

  // Trier les notifications par date décroissante
  notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Filtrer les lues par onglet
  const filteredNotifications = notifications.filter(n => {
    if (activeNotificationTab === 'all') return true;
    if (activeNotificationTab === 'alerts') return ['license', 'leave', 'stock', 'expiry'].includes(n.type);
    if (activeNotificationTab === 'messages') return n.type === 'message';
    return true;
  });

  const unreadNotifications = notifications.filter(n => !n.read);
  const unreadCount = unreadNotifications.length;

  const markAllAsRead = () => {
    // 1. Lire tous les messages
    const nowTime = Date.now();
    setLastChatReadTime(nowTime);
    localStorage.setItem(`last-chat-read-${userProfile?.storeId || 'common'}`, nowTime.toString());

    // 2. Ajouter tous les autres ID à readNotificationIds
    const newReadIds = [...readNotificationIds];
    notifications.forEach(n => {
      if (n.type !== 'message' && !newReadIds.includes(n.id)) {
        newReadIds.push(n.id);
      }
    });
    setReadNotificationIds(newReadIds);
    localStorage.setItem(`read-notifications-${userProfile?.storeId || 'common'}`, JSON.stringify(newReadIds));
  };

  const handleNotificationClick = (noti: any) => {
    if (noti.type === 'message') {
      const nowTime = Date.now();
      setLastChatReadTime(nowTime);
      localStorage.setItem(`last-chat-read-${userProfile?.storeId || 'common'}`, nowTime.toString());
    } else {
      if (!readNotificationIds.includes(noti.id)) {
        const newReadIds = [...readNotificationIds, noti.id];
        setReadNotificationIds(newReadIds);
        localStorage.setItem(`read-notifications-${userProfile?.storeId || 'common'}`, JSON.stringify(newReadIds));
      }
    }
    setIsDropdownOpen(false);
  };

  const formatTimeDifference = (date: Date) => {
    const diffMs = nowDate.getTime() - date.getTime();
    if (diffMs < 0) {
      const diffDays = Math.ceil(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) return "Périme demain";
      return `Périme dans ${diffDays} j.`;
    }
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Il y a ${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    return `Il y a ${diffDays} j`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('fr-FR', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <header className="fixed top-0 right-0 left-0 lg:left-[280px] h-20 bg-white/90 backdrop-blur-md z-30 px-6 sm:px-8 lg:px-10 flex items-center justify-between border-b border-[#EAECEF] print:hidden pl-20 lg:pl-10">
       <div className="flex-1 max-w-sm mr-8">
          <div className="relative group">
            <Search 
              size={16} 
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#4F8CFF] transition-colors pointer-events-none" 
            />
            <input 
              type="text" 
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-6 h-11 bg-[#F5F7FB] border border-[#E5E7EB] rounded-full focus:bg-white focus:border-[#4F8CFF] focus:ring-[4px] focus:ring-[#4F8CFF]/15 transition-all outline-none font-medium text-sm text-[#111827]"
            />
          </div>
       </div>

       <div className="flex-1 hidden xl:flex items-center justify-center">
          {familyStores.length > 1 && (userRole === 'admin' || userProfile?.role === 'admin') ? (
            <div className="px-4 py-2 bg-orange-50 border border-orange-100 rounded-2xl flex items-center gap-3 group">
              <Store size={15} className="text-orange-500 animate-pulse" />
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-orange-400 uppercase tracking-widest leading-none">Boutique Active</span>
                <select
                  value={userProfile.storeId}
                  onChange={async (e) => {
                    const newStoreId = e.target.value;
                    if (newStoreId && user) {
                      try {
                        await updateDoc(doc(db, 'users', user.uid), { storeId: newStoreId });
                      } catch (err) {
                        console.error("Error switching store:", err);
                      }
                    }
                  }}
                  className="text-xs font-black text-slate-900 bg-transparent border-none outline-none cursor-pointer pr-1"
                >
                  {familyStores.map(s => (
                    <option key={`switch-store-header-${s.id}`} value={s.id}>
                      {s.name} {s.id === (settings?.parentStoreId || settings?.id) ? '(Principale)' : '(Sous-boutique)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : settings?.subdomain ? (
            <div className="px-4 py-2 bg-orange-50 border border-orange-100 rounded-2xl flex items-center gap-3 group">
              <Globe size={14} className="text-orange-500" />
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-orange-400 uppercase tracking-widest leading-none">Votre Instance</span>
                <span className="text-xs font-black text-slate-900 lowercase tracking-tight">{settings.subdomain}</span>
              </div>
            </div>
          ) : null}
       </div>

       <div className="flex items-center gap-6">
          {/* SYSTEM UNIFIED NOTIFICATION BELL */}
          <div className="relative">
              <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`relative p-2.5 rounded-xl transition-all duration-200 group flex items-center justify-center active:scale-95 ${unreadCount > 0 ? 'bg-orange-50 text-orange-600 ring-2 ring-orange-500/10' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
                title="Notifications"
                id="notification-bell-btn"
              >
                {unreadCount > 0 ? (
                  <BellRing size={20} className="animate-pulse group-hover:scale-110 transition-transform text-orange-500" />
                ) : (
                  <Bell size={20} className="group-hover:scale-110 transition-transform" />
                )}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white animate-bounce shadow-md">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* OUTSIDE HANDLER OVERLAY */}
              {isDropdownOpen && (
                <div 
                  className="fixed inset-0 z-40 bg-transparent" 
                  onClick={() => setIsDropdownOpen(false)}
                />
              )}

              {/* DROPDOWN FRAME */}
              <AnimatePresence>
                {isDropdownOpen && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-3 w-80 md:w-96 bg-white rounded-3xl shadow-2xl border border-gray-100 p-4 z-50 overflow-hidden font-sans origin-top-right"
                    id="notification-dropdown-panel"
                  >
                    {/* Header bar */}
                    <div className="flex items-center justify-between pb-3 border-b border-gray-50">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-sm">Notifications</span>
                        {unreadCount > 0 && (
                          <span className="text-[10px] font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                            {unreadCount} active(s)
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button 
                          onClick={markAllAsRead}
                          className="text-[10px] text-orange-500 hover:text-orange-600 font-extrabold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                        >
                          <CheckCheck size={12} />
                          Tout marquer lu
                        </button>
                      )}
                    </div>

                    {/* Quick navigation and filtering tabs */}
                    <div className="flex gap-1.5 py-2.5">
                      <button
                        onClick={() => setActiveNotificationTab('all')}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wide uppercase transition-all cursor-pointer ${activeNotificationTab === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                      >
                        Toutes
                      </button>
                      <button
                        onClick={() => setActiveNotificationTab('alerts')}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wide uppercase transition-all cursor-pointer ${activeNotificationTab === 'alerts' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                      >
                        Alertes
                      </button>
                      <button
                        onClick={() => setActiveNotificationTab('messages')}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wide uppercase transition-all cursor-pointer ${activeNotificationTab === 'messages' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                      >
                        Messages
                      </button>
                    </div>

                    {/* Scrollable notifications frame */}
                    <div className="max-h-[350px] overflow-y-auto pr-1 space-y-1.5 scrollbar-none">
                      {filteredNotifications.length === 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center">
                          <div className="p-4 bg-slate-50 text-slate-300 rounded-[30px] mb-3">
                            <Bell size={28} />
                          </div>
                          <p className="text-xs text-slate-400 font-bold">Aucune notification disponible.</p>
                        </div>
                      ) : (
                        filteredNotifications.map((noti) => (
                          <Link
                            key={noti.id}
                            to={noti.link}
                            onClick={() => handleNotificationClick(noti)}
                            className={`flex items-start gap-3 p-3 rounded-2xl transition-all duration-200 border-2 cursor-pointer ${noti.read ? 'bg-white hover:bg-slate-50 border-transparent opacity-60' : 'bg-orange-50/20 hover:bg-orange-50/40 border-orange-500/10'}`}
                          >
                            <div className={`p-2.5 rounded-xl shrink-0 ${
                              noti.type === 'stock' ? 'bg-red-50 text-red-500' :
                              noti.type === 'expiry' ? 'bg-amber-50 text-amber-500' :
                              noti.type === 'message' ? 'bg-sky-50 text-sky-500' :
                              noti.type === 'leave' ? 'bg-purple-50 text-purple-600' :
                              'bg-rose-50 text-rose-500'
                            }`}>
                              {noti.type === 'stock' ? <Package size={16} /> :
                               noti.type === 'expiry' ? <Calendar size={16} /> :
                               noti.type === 'message' ? <MessageSquare size={16} /> :
                               noti.type === 'leave' ? <UserCheck size={16} /> :
                               <ShieldAlert size={16} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-black text-slate-800 uppercase tracking-wide truncate">{noti.title}</span>
                                <span className="text-[8px] font-mono text-slate-400 shrink-0">{formatTimeDifference(noti.timestamp)}</span>
                              </div>
                              <p className="text-[10px] text-slate-600 leading-normal mt-0.5 line-clamp-2">{noti.description}</p>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
          </div>

          {!isLicenseValid && userRole === 'admin' && (
            <Link 
              to="/settings" 
              className="hidden lg:flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl border border-red-100 animate-pulse group hover:bg-red-600 hover:text-white transition-all shadow-sm"
              title="Cliquer pour activer la licence"
            >
              <ShieldAlert size={14} className="group-hover:rotate-12 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Licence Inactive</span>
            </Link>
          )}

          {/* INTERACTIVE CALENDAR POPUP */}
          <div className="relative hidden md:block">
            <button 
              onClick={() => setIsCalendarOpen(!isCalendarOpen)}
              className="text-right hover:opacity-85 active:scale-95 transition-all cursor-pointer block select-none focus:outline-none"
              title="Cliquer pour afficher le calendrier"
            >
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1 flex items-center justify-end gap-1.5 hover:text-[#4F8CFF] transition-colors">
                <Calendar size={11} className="text-[#4F8CFF]" />
                {formatDate(time)}
              </p>
              <p className="text-lg font-mono font-black text-gray-900 leading-none">{formatTime(time)}</p>
            </button>

            {/* OUTSIDE HANDLER OVERLAY FOR CALENDAR */}
            {isCalendarOpen && (
              <div 
                className="fixed inset-0 z-40 bg-transparent" 
                onClick={() => setIsCalendarOpen(false)}
              />
            )}

            {/* CALENDAR PANEL */}
            <AnimatePresence>
              {isCalendarOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 15 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-3 w-80 bg-white rounded-3xl shadow-2xl border border-gray-100 p-5 z-50 font-sans origin-top-right text-slate-800"
                >
                  {/* Calendar Header with Navigation */}
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-50">
                    <button
                      onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                      className="p-1.5 hover:bg-slate-50 rounded-lg transition-all text-slate-500 hover:text-slate-800"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <div className="text-center">
                      <p className="text-xs font-black capitalize text-slate-900 leading-none tracking-tight">
                        {calendarMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    <button
                      onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                      className="p-1.5 hover:bg-slate-50 rounded-lg transition-all text-slate-500 hover:text-slate-800"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {/* Days of the Week */}
                  <div className="grid grid-cols-7 gap-1 text-center mb-2">
                    {['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map((day) => (
                      <span key={day} className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        {day}
                      </span>
                    ))}
                  </div>

                  {/* Calendar Days Grid */}
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {getCalendarDays(calendarMonth).map((item, index) => {
                      const isToday = item.date.toDateString() === new Date().toDateString();
                      return (
                        <div
                          key={`day-${index}`}
                          className={`aspect-square flex items-center justify-center text-xs font-bold rounded-full transition-all cursor-pointer relative ${
                            item.isCurrentMonth 
                              ? 'text-slate-800 hover:bg-[#4F8CFF]/10 hover:text-[#4F8CFF]' 
                              : 'text-slate-300 hover:bg-slate-50'
                          } ${
                            isToday 
                              ? 'bg-[#4F8CFF] text-white shadow-lg shadow-[#4F8CFF]/25 font-black hover:bg-[#4F8CFF] hover:text-white' 
                              : ''
                          }`}
                        >
                          {item.day}
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer with Back to Today */}
                  <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
                    <button
                      onClick={() => setCalendarMonth(new Date())}
                      className="text-[10px] font-black uppercase text-[#4F8CFF] hover:text-[#4F8CFF]/80 tracking-widest transition-all"
                    >
                      Aujourd'hui
                    </button>
                    <span className="text-[9px] font-mono text-slate-400">
                      Heure locale
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="w-px h-10 bg-gray-100 hidden md:block" />
          <Link to="/settings?tab=profile" className="flex items-center gap-4 group hover:opacity-85 transition-all">
            <div className="text-right hidden sm:block">
               <p className="text-sm font-extrabold text-[#111827]">{userProfile?.displayName || user?.displayName}</p>
               <p className="text-[10px] text-[#4F8CFF] font-bold uppercase tracking-widest leading-none mt-0.5">En Ligne</p>
            </div>
            <div className="w-11 h-11 rounded-full bg-slate-100 border-2 border-white shadow-[0_4px_12px_rgba(79,140,255,0.15)] flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform cursor-pointer">
               {userProfile?.photoURL ? (
                 <img src={userProfile.photoURL} referrerPolicy="no-referrer" alt="" className="w-full h-full object-cover" />
               ) : user?.photoURL ? (
                 <img src={user.photoURL} referrerPolicy="no-referrer" alt="" className="w-full h-full object-cover" />
               ) : (
                 <User size={20} className="text-gray-400" />
               )}
            </div>
          </Link>
       </div>
    </header>
  );
}

function Sidebar() {
  const { language, userRole, settings, userProfile, hasPermission } = useContext(AppContext);
  const t = translations[language];
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
   const menuItems = [
    { icon: LayoutDashboard, label: t.dashboard, path: '/', id: 'dashboard', module: 'reports' },
    { icon: ShoppingCart, label: t.pos, path: '/pos', id: 'pos', module: 'pos' },
    { icon: ClipboardList, label: t.orders || 'Commandes', path: '/commandes', id: 'commandes', module: 'pos' },
    { icon: Smartphone, label: t.mobile_money || 'Transactions Mobiles', path: '/mobile-money', id: 'mobile_money', module: 'pos' },
    { icon: Package, label: t.inventory, path: '/inventory', id: 'inventory', module: 'inventory' },
    { icon: History, label: t.history, path: '/sales', id: 'sales', module: 'sales' },
    { icon: BarChart3, label: t.accounting, path: '/accounting', id: 'accounting', module: 'accounting' },
    { icon: Users, label: t.customers, path: '/clients', id: 'clients', module: 'clients' },
    { icon: UserCheck, label: t.personnel, path: '/personnel', id: 'personnel', module: 'personnel' },
    { icon: MessageSquare, label: 'Messagerie', path: '/chat', id: 'chat', module: 'none' },
    { icon: SettingsIcon, label: t.settings, path: '/settings', id: 'settings', module: 'settings' },
  ];

  const privilegedAdmins = ['anges.gildas@gmail.com', 'gildas@gmail.com'];
  if (privilegedAdmins.includes(auth.currentUser?.email || '')) {
    menuItems.push({ icon: ShieldAlert, label: (t as any).super_admin || 'Super Admin', path: '/super-admin', id: 'super-admin', module: 'none' });
  }

  const filteredItems = menuItems.filter(item => {
    if (item.id === 'chat') return true;
    const isSuperAdmin = auth.currentUser?.email === 'anges.gildas@gmail.com' || auth.currentUser?.email === 'gildas@gmail.com';
    if (isSuperAdmin) {
      if (item.id === 'super-admin' || item.id === 'settings') return true;
      let keyToCheck = item.module || item.id;
      if (item.id === 'history') keyToCheck = 'sales';
      if (item.id === 'mobile_money') keyToCheck = 'pos';
      if (item.id === 'dashboard') keyToCheck = 'reports';
      return hasPermission(keyToCheck, 'read');
    }
    
    // Admin always has access
    if (userRole === 'admin') return true;
    
    // Check specific module permission
    return hasPermission(item.module || item.id, 'read');
  });;

  const handleLogout = () => signOut(auth);

  return (
    <>
      <button 
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 w-12 h-12 flex items-center justify-center bg-white rounded-2xl shadow-xl border border-gray-100 text-gray-900 active:scale-90 transition-transform"
      >
        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <aside className={`
        fixed inset-y-0 left-0 bg-[#FFFFFF] border-r border-[#EAECEF] w-[280px] transform transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] z-40 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)]
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-8 shrink-0">
          <div className="flex items-center gap-3.5 mb-2">
            <div className="bg-[#F0F6FF] border border-[#4F8CFF]/20 w-11 h-11 rounded-[14px] shadow-sm overflow-hidden flex items-center justify-center">
              {settings?.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <ShoppingBag size={22} className="text-[#4F8CFF]" />
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-extrabold tracking-tight text-[#111827]">{t.app_name}</span>
              <span className="text-[9px] font-black uppercase text-[#6B7280] tracking-widest">{settings?.subdomain || 'Market Pro OS'}</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {filteredItems.map((item) => {
            const isActive = location.pathname === item.path || (item.id === 'settings' && location.pathname.startsWith('/settings'));
            return (
              <Link
                key={`nav-item-${item.id}`}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`
                  flex items-center gap-3.5 px-4.5 py-3 rounded-[18px] transition-all duration-300 border
                  ${isActive 
                    ? 'bg-[#F0F6FF] border-[#4F8CFF] text-[#4F8CFF] font-bold shadow-[0_2px_10px_rgba(79,140,255,0.08)]' 
                    : 'bg-transparent border-transparent text-[#6B7280] hover:text-[#111827] hover:bg-[#F5F7FB]'}
                `}
              >
                <item.icon size={20} className={isActive ? 'text-[#4F8CFF]' : 'text-[#6B7280]'} />
                <span className="text-[13px] tracking-wide font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-5 border-t border-[#EAECEF] shrink-0 bg-[#F9FAFB]">
          <button 
            onClick={handleLogout}
            className="flex items-center justify-center gap-2.5 w-full py-3 px-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-[14px] transition-all font-bold text-[11px] uppercase tracking-wider"
          >
            <LogOut size={15} />
            {t.logout}
          </button>
        </div>
      </aside>

      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
        />
      )}
    </>
  );
}


const PageTransition = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full">
    {children}
  </div>
);

function AppRoutes({ 
  user, 
  userRole, 
  userProfile,
  isLicenseValid, 
  theme, 
  loading,
  settings,
  hasPermission
}: { 
  user: any; 
  userRole: UserRole; 
  userProfile: any;
  isLicenseValid: boolean; 
  theme: Theme;
  loading: boolean;
  settings: StoreSettings | null;
  hasPermission: (module: string, action: 'read' | 'create' | 'update' | 'delete') => boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [hasRedirected, setHasRedirected] = useState(false);

  // Redirect to dashboard on fresh login if on public/auth routes
  useEffect(() => {
    const isPublicRoute = location.pathname === '/login' || location.pathname === '/register';
    const isFullyLoggedIn = user && userProfile && userProfile.isActive !== false && !userProfile.pendingApproval;

    if (isFullyLoggedIn && isPublicRoute && !hasRedirected) {
      navigate('/', { replace: true });
      setHasRedirected(true);
    }
    if (!user) {
      setHasRedirected(false);
    }
  }, [user?.uid, userProfile, location.pathname, hasRedirected]);

  const hasAccess = (module: string) => {
    const isSuperAdmin = auth.currentUser?.email === 'anges.gildas@gmail.com' || auth.currentUser?.email === 'gildas@gmail.com';
    if (isSuperAdmin) {
      if (module === 'super-admin' || module === 'settings') return true;
      let keyToCheck = module;
      if (module === 'mobile_money') keyToCheck = 'pos';
      return hasPermission(keyToCheck, 'read');
    }
    
    // Block critical modules if license is invalid
    if (!isLicenseValid && ['pos', 'inventory', 'accounting', 'personnel', 'clients', 'mobile_money'].includes(module)) {
      return false;
    }

    if (userRole === 'admin') return true;
    return userProfile?.permissions?.[module]?.read === true;
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f2f2f2]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full shadow-lg"
        />
      </div>
    );
  }

  if (!user || (!userProfile && !loading)) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    );
  }

  if (userProfile?.pendingApproval || userProfile?.isActive === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6 font-sans">
        <div className="max-w-md w-full bg-white rounded-[56px] p-12 text-center shadow-2xl relative overflow-hidden">
          <div className="w-24 h-24 bg-orange-100 text-orange-600 rounded-[32px] flex items-center justify-center mx-auto mb-8">
            <ShieldCheck size={48} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-6 italic tracking-tight uppercase">Compte en attente</h2>
          <p className="text-slate-500 font-medium leading-relaxed mb-8">
            Votre boutique <span className="text-orange-500 font-black">"{settings?.name}"</span> est en cours d'activation.
          </p>
          <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 mb-8 text-left">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Instance attribuée</p>
            <p className="text-slate-900 font-black text-sm">{settings?.subdomain || 'En attente...'}</p>
          </div>
          <button 
            onClick={() => auth.signOut()}
            className="w-full py-5 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest text-[11px] hover:bg-black transition-all shadow-xl"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  const isPosPage = location.pathname === '/pos';

  return (
    <div className="min-h-screen flex bg-[#F5F7FB] selection:bg-[#4F8CFF] selection:text-white font-sans text-[#111827]">
      <Sidebar />
      <div className="flex-1 lg:ml-[280px] flex flex-col">
        <UserHeader isLicenseValid={isLicenseValid} />
        <main className={`flex-1 p-4 ${isPosPage ? 'sm:p-6 lg:p-8 pt-24 lg:pt-[106px] lg:pb-4' : 'sm:p-6 lg:p-10 pt-28 lg:pt-32'}`}>
          <AnimatePresence mode="wait">
            <Routes location={location}>
              <Route path="/" element={<PageTransition><Dashboard /></PageTransition>} />
              <Route path="/pos" element={hasAccess('pos') ? <PageTransition><Pos /></PageTransition> : <Navigate to="/" />} />
              <Route path="/commandes" element={hasAccess('pos') ? <PageTransition><Commandes /></PageTransition> : <Navigate to="/" />} />
              <Route path="/inventory" element={hasAccess('inventory') ? <PageTransition><Inventory /></PageTransition> : <Navigate to="/" />} />
              <Route path="/sales" element={hasAccess('sales') ? <PageTransition><SalesHistory /></PageTransition> : <Navigate to="/" />} />
              <Route path="/accounting" element={hasAccess('accounting') ? <PageTransition><Accounting /></PageTransition> : <Navigate to="/" />} />
              <Route path="/mobile-money" element={hasAccess('mobile_money') ? <PageTransition><MobileMoney /></PageTransition> : <Navigate to="/" />} />
              <Route path="/personnel" element={hasAccess('personnel') ? <PageTransition><Personnel /></PageTransition> : <Navigate to="/" />} />
              <Route path="/clients" element={hasAccess('clients') ? <PageTransition><Clients /></PageTransition> : <Navigate to="/" />} />
              <Route path="/settings" element={hasAccess('settings') ? <PageTransition><Settings /></PageTransition> : <Navigate to="/" />} />
              <Route path="/chat" element={<PageTransition><Chat /></PageTransition>} />
              <Route path="/super-admin" element={(auth.currentUser?.email === 'anges.gildas@gmail.com' || auth.currentUser?.email === 'gildas@gmail.com') ? <PageTransition><SuperAdmin /></PageTransition> : <Navigate to="/" />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

// Helper to automatically detect subdirectory hosting based on the URL path
const getAutomaticBasename = (): string => {
  const hostname = window.location.hostname;
  if (
    hostname === 'localhost' || 
    hostname === '127.0.0.1' || 
    hostname.includes('ais-dev-') || 
    hostname.includes('ais-pre-') || 
    hostname.includes('run.app') ||
    hostname.includes('googleusercontent.com')
  ) {
    return '/';
  }

  const pathname = window.location.pathname;
  if (!pathname || pathname === '/' || pathname === '/index.html') return '/';
  
  // List of all known React Router path suffixes in this app
  const knownRoutes = [
    'login', 
    'register', 
    'pos', 
    'inventory', 
    'sales', 
    'accounting', 
    'mobile-money', 
    'personnel', 
    'clients', 
    'settings', 
    'super-admin'
  ];
  
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  
  // If the last segment is a known route, remove it to find the subdirectory base
  const lastSegment = segments[segments.length - 1];
  if (knownRoutes.includes(lastSegment)) {
    segments.pop();
  }
  
  if (segments.length === 0) return '/';
  return '/' + segments.join('/');
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<Language>('fr');
  const [theme, setTheme] = useState<Theme>('default');
  const [searchQuery, setSearchQuery] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('cashier');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [preselectedClient, setPreselectedClient] = useState<Client | null>(null);
  const [verifyPasswordModal, setVerifyPasswordModal] = useState<{ open: boolean; onSuccess: (() => void) | null }>({ open: false, onSuccess: null });
  const [passwordInput, setPasswordInput] = useState('');
  const [inactiveModal, setInactiveModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: ''
  });

  const hasPermission = (module: string, action: 'read' | 'create' | 'update' | 'delete'): boolean => {
    const isSuperAdmin = auth.currentUser?.email === 'anges.gildas@gmail.com';
    if (isSuperAdmin) {
      if (module === 'settings' || module === 'super-admin' || module === 'none') return true;
      if (!userProfile?.permissions) return true; // Default to true as they are the administrator
      const perm = userProfile.permissions[module];
      if (perm !== undefined) {
        return perm[action] === true;
      }
      return true; // Default to true if not specified
    }

    if (userRole === 'admin') return true;
    if (!userProfile?.permissions) return false;
    return userProfile.permissions[module]?.[action] === true;
  };

  // Automatic Daily Cloud Backup
  useEffect(() => {
    if (!user || userRole !== 'admin') return;

    const performAutoBackup = async () => {
      if (!userProfile?.storeId) return;
      const today = new Date().toISOString().split('T')[0];
      const lastBackupDate = localStorage.getItem(`last-auto-backup-${userProfile.storeId}`);

      if (lastBackupDate === today) return;

      try {
        const collectionsToExport = ['products', 'categories', 'sales', 'expenses', 'employees', 'leaves', 'payroll'];
        const backupData: any = { date: today, timestamp: new Date().toISOString(), storeId: userProfile.storeId };

        for (const collName of collectionsToExport) {
          const q = query(collection(db, collName), where('storeId', '==', userProfile.storeId));
          const snap = await getDocs(q);
          const items: any[] = [];
          
          for (const d of snap.docs) {
            const data = d.data();
            const item: any = { id: d.id, ...data };
            
            // Handle subcollections for sales
            if (collName === 'sales') {
              const subItemsSnap = await getDocs(collection(db, `sales/${d.id}/items`));
              item.items = subItemsSnap.docs.map(si => ({ id: si.id, ...si.data() }));
            }
            
            items.push(item);
          }
          backupData[collName] = items;
        }

        // Include store settings in backup
        const settingsSnap = await getDoc(doc(db, 'storeSettings', userProfile.storeId));
        if (settingsSnap.exists()) {
          backupData.storeSettings = settingsSnap.data();
        }

        await setDoc(doc(db, 'backups', `${userProfile.storeId}_${today}`), backupData);
        localStorage.setItem(`last-auto-backup-${userProfile.storeId}`, today);
        console.log("Sauvegarde automatique effectuée avec succès.");
      } catch (err) {
        console.error("Erreur sauvegarde auto:", err);
      }
    };

    // Delay slightly to not interfere with initial load
    const timer = setTimeout(performAutoBackup, 10000);
    return () => clearTimeout(timer);
  }, [user, userRole]);

  useEffect(() => {
    if (!user || !userProfile?.storeId) return;
    const q = query(collection(db, 'products'), where('storeId', '==', userProfile.storeId));
    const unsubProducts = onSnapshot(q, (snap) => {
      const lowStock = snap.docs.filter(doc => {
        const data = doc.data();
        return data.stock <= (data.lowStockThreshold || 5);
      });
      setLowStockCount(lowStock.length);
    }, (error) => {
      console.error("Error watching products for low stock alert:", error);
    });
    return () => unsubProducts();
  }, [user, userProfile?.storeId]);

  useEffect(() => {
    if (!user || !userProfile?.storeId) {
      setSettings(null);
      return;
    }

    const parentId = userProfile.parentStoreId || userProfile.storeId;

    const unsubscribeSettings = onSnapshot(doc(db, 'storeSettings', parentId), (snap) => {
      if (snap.exists()) {
        const parentData = snap.data();
        
        if (userProfile.storeId !== parentId) {
          // Active store is a sub-boutique (annexe)
          const annexes = parentData.annexes || [];
          const annexeItem = annexes.find((a: any) => a.id === userProfile.storeId);
          if (annexeItem) {
            setSettings({
              ...parentData,
              id: annexeItem.id,
              name: annexeItem.name,
              address: annexeItem.address || parentData.address,
              phone: annexeItem.phone || parentData.phone,
              parentStoreId: parentId,
              isAnnexeUnit: true
            } as any);
          } else {
            // Fallback: use parent store settings if annexe is not found or has been deleted
            setSettings({
              ...parentData,
              id: parentId
            });
          }
        } else {
          // Active store is the main store itself
          setSettings({
            ...parentData,
            id: parentId
          });
        }

        // Check license expiration on the main/parent store settings
        if (parentData.licenseExpiry && parentData.licenseStatus === 'active') {
          const now = new Date();
          const expiry = typeof parentData.licenseExpiry === 'string' ? new Date(parentData.licenseExpiry) : parentData.licenseExpiry.toDate ? parentData.licenseExpiry.toDate() : new Date(parentData.licenseExpiry);
          if (now > expiry) {
            updateDoc(doc(db, 'storeSettings', parentId), { licenseStatus: 'expired' }).catch(() => {});
          }
        }
      } else {
        setSettings(null);
      }
    }, (error) => {
      console.error("Error watching store settings:", error);
    });

    return () => unsubscribeSettings();
  }, [user, userProfile?.storeId, userProfile?.parentStoreId]);

  const isLicenseValid = settings?.licenseStatus === 'active';

  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('app-theme') as Theme;
    if (savedTheme) setTheme(savedTheme);

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    // Domain Redirection Logic
    const fetchConfig = async () => {
      // Security: Never redirect if we are inside an iframe or on preview/development environments
      const isLocalhost = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1' ||
                          window.location.hostname.includes('ais-dev-') ||
                          window.location.hostname.includes('ais-pre-') ||
                          window.location.hostname.includes('run.app');
      
      if (window.self !== window.top || isLocalhost) return;

      try {
        const snap = await getDoc(doc(db, 'systemConfig', 'globals'));
        if (snap.exists()) {
          const config = snap.data();
          try {
            localStorage.setItem('cached_system_config_globals', JSON.stringify(config));
          } catch (_) {}

          if (config.isAutoRedirectEnabled && config.publicAccessUrl) {
            const targetUrl = config.publicAccessUrl;
            const isSuperAdminEmail = auth.currentUser?.email === 'anges.gildas@gmail.com' || auth.currentUser?.email === 'gildas@gmail.com';
            const isSuperAdminPath = window.location.pathname.includes('/super-admin');
            const isLoginPage = window.location.pathname.includes('/login') || window.location.pathname.includes('/auth');
            const isLocalhost = window.location.hostname === 'localhost' || 
                                window.location.hostname === '127.0.0.1' ||
                                window.location.hostname.includes('ais-dev-') ||
                                window.location.hostname.includes('ais-pre-') ||
                                window.location.hostname.includes('run.app');
            const hasNoRedirect = window.location.search.includes('no-redirect=1');
            
            try {
              const target = new URL(targetUrl);
              const current = new URL(window.location.href);
              
              // Only redirect if origins differ or we are not in the target subdirectory
              const originsDiffer = current.origin !== target.origin;
              const pathDiffers = !current.pathname.startsWith(target.pathname);
              
              if ((originsDiffer || pathDiffers) && !isSuperAdminPath && !isSuperAdminEmail && !isLocalhost && !isLoginPage && !hasNoRedirect) {
                console.log("Redirecting to custom domain:", targetUrl);
                window.location.replace(targetUrl);
              }
            } catch (urlErr) {
              console.warn("Invalid publicAccessUrl configuration");
            }
          }
        }
      } catch (e: any) {
        const isOffline = e instanceof Error && (e.message.includes('offline') || e.message.includes('client is offline'));
        if (isOffline) {
          console.warn("Using offline fallback for redirection config check.");
        } else {
          console.error("Error checking redirection config:", e);
        }

        try {
          const cached = localStorage.getItem('cached_system_config_globals');
          if (cached) {
            const config = JSON.parse(cached);
            if (config.isAutoRedirectEnabled && config.publicAccessUrl) {
              const targetUrl = config.publicAccessUrl;
              const isSuperAdminEmail = auth.currentUser?.email === 'anges.gildas@gmail.com' || auth.currentUser?.email === 'gildas@gmail.com';
              const isSuperAdminPath = window.location.pathname.includes('/super-admin');
              const isLoginPage = window.location.pathname.includes('/login') || window.location.pathname.includes('/auth');
              const isLocalhost = window.location.hostname === 'localhost' || 
                                  window.location.hostname === '127.0.0.1' ||
                                  window.location.hostname.includes('ais-dev-') ||
                                  window.location.hostname.includes('ais-pre-') ||
                                  window.location.hostname.includes('run.app');
              const hasNoRedirect = window.location.search.includes('no-redirect=1');
              
              try {
                const target = new URL(targetUrl);
                const current = new URL(window.location.href);
                
                const originsDiffer = current.origin !== target.origin;
                const pathDiffers = !current.pathname.startsWith(target.pathname);
                
                if ((originsDiffer || pathDiffers) && !isSuperAdminPath && !isSuperAdminEmail && !isLocalhost && !isLoginPage && !hasNoRedirect) {
                  console.log("Redirecting to custom domain (cached):", targetUrl);
                  window.location.replace(targetUrl);
                }
              } catch (_) {}
            }
          }
        } catch (_) {}
      }
    };
    fetchConfig();
  }, [user]);

  // Sync role from Firestore
  useEffect(() => {
    if (!user) return;

    const unsubscribeUser = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserProfile(data);
        
        // Repair missing storeId and parentStoreId
        const repairs: any = {};
        if (!data.storeId) {
          repairs.storeId = user.uid;
        }
        if (!data.parentStoreId) {
          repairs.parentStoreId = data.parentStoreId || user.uid;
        }
        if (Object.keys(repairs).length > 0) {
          await updateDoc(doc(db, 'users', user.uid), repairs).catch(err => console.error("Repair err:", err));
        }
        
        if (data.isActive === false) {
          signOut(auth);
          setInactiveModal({
            isOpen: true,
            title: "VOTRE COMPTE EST EN COURS D'ACTIVATION",
            message: "POUR PLUS D'INFORMATIONS VEUILLER CONTACTER L'ADMINISTRATEUR PRINCIPALE AU +22891033004"
          });
          setLoading(false);
          return;
        }

        let currentRole = data.role as UserRole;

        // Auto-assign roles for specific users
        const adminEmails = ['anges.gildas@gmail.com', 'gildas@gmail.com'];
        if (adminEmails.includes(user.email || '') && currentRole !== 'admin') {
          await updateDoc(doc(db, 'users', user.uid), { role: 'admin' });
          currentRole = 'admin';
        }

        setUserRole(currentRole);
        setLoading(false);
      } else {
        // If profile doesn't exist, it's possible it was deleted during a reset or the user is new.
        // We set userProfile to null and let Login.tsx handle the re-creation/sync.
        setUserProfile(null);
        setLoading(false);
      }
    }, (error) => {
       console.error("Error fetching user profile:", error);
       setLoading(false);
    });

    return () => unsubscribeUser();
  }, [user]);

  // Inactivity Auto-Logout (15 minutes)
  useEffect(() => {
    if (!user) return;

    let timeout: NodeJS.Timeout;

    const resetTimer = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        signOut(auth);
        alert("Session expirée pour cause d'inactivité. Veuillez vous reconnecter.");
      }, 15 * 60 * 1000); // 15 minutes
    };

    const listeners = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
    listeners.forEach(l => window.addEventListener(l, resetTimer));
    resetTimer();

    return () => {
      if (timeout) clearTimeout(timeout);
      listeners.forEach(l => window.removeEventListener(l, resetTimer));
    };
  }, [user]);

  const handleSetTheme = (t: Theme) => {
    setTheme(t);
    localStorage.setItem('app-theme', t);
  };

  const handleSetRole = (r: UserRole) => {
    setUserRole(r);
    localStorage.setItem('app-role', r);
  };
  
  const verifyAction = (onSuccess: () => void) => {
    if (!userProfile?.settingsPassword) {
      // If no password set, just show an alert or proceed? 
      // User requested "always ask password". If not set, they should set it.
      alert("Veuillez d'abord définir un mot de passe de sécurité dans les paramètres.");
      return;
    }
    setVerifyPasswordModal({ open: true, onSuccess });
  };
  
  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === userProfile?.settingsPassword) {
      if (verifyPasswordModal.onSuccess) verifyPasswordModal.onSuccess();
      setVerifyPasswordModal({ open: false, onSuccess: null });
      setPasswordInput('');
    } else {
      alert("Mot de passe incorrect.");
    }
  };



  return (
    <AppContext.Provider value={{ 
      language, setLanguage, 
      theme, setTheme: handleSetTheme,
      searchQuery,
      userRole, setUserRole: handleSetRole,
      settings,
      userProfile,
      lowStockCount,
      setSearchQuery: (q: string) => setSearchQuery(q),
      hasPermission,
      preselectedClient,
      setPreselectedClient,
      verifyAction
    }}>
      <MotionConfig transition={{ duration: 0, delay: 0, type: false }}>
        <Router basename={getAutomaticBasename()}>
          <AppRoutes 
            user={user} 
            userRole={userRole} 
            userProfile={userProfile}
            isLicenseValid={isLicenseValid} 
            theme={theme}
            loading={loading}
            settings={settings}
            hasPermission={hasPermission}
          />
        </Router>

      {/* Global Password Verification Modal */}
      <AnimatePresence>
        {verifyPasswordModal.open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[40px] overflow-hidden shadow-2xl border border-gray-100"
            >
              <div className="p-8 pb-0 text-center">
                <div className="w-20 h-20 bg-orange-50 rounded-[30px] flex items-center justify-center text-orange-500 mx-auto mb-6 shadow-xl shadow-orange-500/10">
                  <ShieldAlert size={40} />
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase mb-2">Confirmation Requise</h3>
                <p className="text-gray-500 font-medium text-sm px-4">
                  Veuillez saisir votre mot de passe de sécurité pour confirmer cette suppression.
                </p>
              </div>

              <form onSubmit={handleVerify} className="p-8 space-y-6">
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-orange-500 transition-colors" size={20} />
                  <input 
                    autoFocus
                    type="password"
                    placeholder="Mot de passe"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full pl-14 pr-6 py-5 bg-gray-50 border-2 border-transparent rounded-[24px] focus:bg-white focus:border-orange-500/20 transition-all outline-none font-bold text-left tracking-[0.2em]"
                  />
                </div>

                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={() => {
                      setVerifyPasswordModal({ open: false, onSuccess: null });
                      setPasswordInput('');
                    }}
                    className="flex-1 py-5 bg-gray-100 text-gray-900 rounded-[24px] font-black uppercase tracking-widest text-[11px] hover:bg-gray-200 transition-all active:scale-95"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-5 bg-orange-600 text-white rounded-[24px] font-black uppercase tracking-widest text-[11px] hover:bg-orange-700 transition-all shadow-xl shadow-orange-600/20 active:scale-95"
                  >
                    Confirmer
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Beautiful Custom Inactive Modal */}
      <AnimatePresence>
        {inactiveModal.isOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[40px] overflow-hidden shadow-2xl border border-gray-100 p-10 text-center font-sans"
            >
              <div className="w-20 h-20 bg-orange-50 rounded-[30px] flex items-center justify-center text-orange-500 mx-auto mb-6 shadow-xl shadow-orange-500/10">
                <ShieldAlert size={40} />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight uppercase leading-snug mb-3">
                {inactiveModal.title}
              </h3>
              <p className="text-gray-500 font-bold text-xs leading-relaxed mb-8">
                {inactiveModal.message}
              </p>
              <button 
                type="button"
                onClick={() => {
                  signOut(auth);
                  setInactiveModal({ isOpen: false, title: "", message: "" });
                  const homeUrl = window.location.origin + getAutomaticBasename();
                  window.location.replace(homeUrl);
                }}
                className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest text-[11px] hover:bg-black transition-all shadow-xl active:scale-95"
              >
                OK
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </MotionConfig>
    </AppContext.Provider>
  );
}
