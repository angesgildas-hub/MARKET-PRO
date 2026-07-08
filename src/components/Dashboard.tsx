import { useState, useEffect, useContext } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  Users, 
  Package, 
  ShoppingBag,
  ArrowUpRight,
  ArrowDownRight,
  Lock,
  Zap,
  Trophy,
  Target,
  Edit3,
  Clock,
  Sparkles,
  ShieldCheck,
  FileDown,
  Activity,
  Store,
  Globe,
  MapPin
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { AppContext } from '../App';
import { collection, query, getDocs, limit, orderBy, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../services/db';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

const data = [
  { day: 'Lun', sales: 4000 },
  { day: 'Mar', sales: 3000 },
  { day: 'Mer', sales: 2000 },
  { day: 'Jeu', sales: 2780 },
  { day: 'Ven', sales: 1890 },
  { day: 'Sam', sales: 2390 },
  { day: 'Dim', sales: 3490 },
];

function StatCard({ title, value, icon: Icon, trend, trendValue }: any) {
  // Map title to premium gradients as requested
  let gradient = "from-[#6EA8FF] to-[#4F8CFF]"; // Default Earnings Blue
  const lowercaseTitle = title.toLowerCase();
  
  if (lowercaseTitle.includes("ventes") || lowercaseTitle.includes("total ventes") || lowercaseTitle.includes("chiffre d'affaires") || lowercaseTitle.includes("système") || lowercaseTitle.includes("utilisateurs")) {
    gradient = "from-[#FFE082] to-[#FFC107]"; // Revenue Amber & System Users (Orange / Amber)
  } else if (lowercaseTitle.includes("commandes") || lowercaseTitle.includes("suspendues")) {
    gradient = "from-[#FF8A80] to-[#EF4444]"; // Orders Red
  } else if (lowercaseTitle.includes("produits") || lowercaseTitle.includes("actives") || lowercaseTitle.includes("boutiques")) {
    gradient = "from-[#7AE582] to-[#22C55E]"; // Products & Active Boutiques (Green)
  } else if (lowercaseTitle.includes("clients")) {
    gradient = "from-[#6EA8FF] to-[#4F8CFF]"; // Earnings Blue
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`relative min-h-[135px] p-5 rounded-[20px] bg-gradient-to-br ${gradient} text-white shadow-[0_8px_30px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col justify-between`}
    >
      {/* Wave Patterns */}
      <div className="absolute inset-0 pointer-events-none opacity-20 mix-blend-overlay">
        <svg className="absolute right-0 bottom-0 h-full w-full" viewBox="0 0 120 120" preserveAspectRatio="none">
          <path d="M0,90 C30,120 70,60 120,90 L120,120 L0,120 Z" fill="currentColor"></path>
          <path d="M0,60 C40,80 80,40 120,70 L120,120 L0,120 Z" fill="currentColor" opacity="0.4"></path>
        </svg>
      </div>

      <div className="flex justify-between items-start z-10 relative">
        <p className="text-xs font-semibold tracking-wider opacity-90 uppercase">{title}</p>
        <div className="p-2 bg-white/10 backdrop-blur-md rounded-xl">
          <Icon size={18} className="text-white" />
        </div>
      </div>

      <div className="flex justify-between items-end mt-4 z-10 relative">
        <h3 className="text-[40px] leading-none font-black tracking-tighter text-white">
          {value}
        </h3>
        {trend && (
          <div className="flex items-center gap-0.5 text-xs font-bold bg-white/15 px-2 py-1 rounded-lg backdrop-blur-md text-white">
            {trendValue}%
            {trend === 'up' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const { userRole, hasPermission, userProfile, settings, language } = useContext(AppContext);
  const [familyStores, setFamilyStores] = useState<any[]>([]);

  useEffect(() => {
    if (!userProfile?.storeId || !settings) return;

    const parentId = settings.parentStoreId || settings.id;
    
    const unsubscribe = onSnapshot(doc(db, 'storeSettings', parentId), (snap) => {
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
        if (!combined.some(s => s.id === ann.id)) {
          combined.push({
            id: ann.id,
            name: ann.name,
            address: ann.address || parentStore.address,
            phone: ann.phone || parentStore.phone,
            parentStoreId: parentId,
            isActive: ann.isActive !== false,
            isAnnexeUnit: true
          });
        }
      });

      combined.sort((a: any, b: any) => {
        if (a.id === parentId) return -1;
        if (b.id === parentId) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });

      setFamilyStores(combined);
    }, (err) => {
      console.error("Error loading family stores on dashboard:", err);
    });

    return () => unsubscribe();
  }, [userProfile?.storeId, settings]);

  const handleSwitchStore = async (targetStoreId: string) => {
    if (!auth.currentUser || !targetStoreId) return;
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        storeId: targetStoreId
      });
    } catch (err) {
      console.error("Failed to switch active store:", err);
    }
  };

  const isSuperAdmin = ['anges.gildas@gmail.com', 'gildas@gmail.com'].includes((auth.currentUser?.email || '').trim().toLowerCase());
  
  const navigate = useNavigate();
  
  // Interactive Sales Goal per shop (persisted locally)
  const [salesGoal, setSalesGoal] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(`sales-goal-${userProfile?.storeId || 'common'}`);
      return stored ? parseInt(stored, 10) : 2500000;
    } catch (_) {
      return 2500000;
    }
  });
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [newGoalInput, setNewGoalInput] = useState(salesGoal.toString());

  const handleSaveGoal = () => {
    const num = parseInt(newGoalInput, 10);
    if (!isNaN(num) && num > 0) {
      setSalesGoal(num);
      try {
        localStorage.setItem(`sales-goal-${userProfile?.storeId || 'common'}`, num.toString());
      } catch (_) {}
      setIsEditingGoal(false);
    }
  };

  const handleExportDashboardPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Header Banner
      doc.setFillColor(15, 23, 42); // slate-900 / dark-blue
      doc.rect(0, 0, 210, 38, 'F');

      // Decorative orange separator
      doc.setFillColor(249, 115, 22); // orange-500
      doc.rect(0, 38, 210, 1.5, 'F');

      // Header Title
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text(userProfile?.storeName || "MARKET PRO", 14, 16);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(226, 232, 240); // slate-200
      doc.text("RAPPORT COMPTABLE ET D'ACTIVITÉ DU COMPTOIR", 14, 23);
      doc.text(`Propulsé par G-LAB TECH • Lomé, Togo`, 14, 27);

      // Metadata Info Box
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(`GÉNÉRÉ LE : ${new Date().toLocaleDateString('fr-TG')} à ${new Date().toLocaleTimeString('fr-TG')}`, 196, 15, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.text(`Rôle actif : ${userRole?.toUpperCase() || 'ADMINISTRATEUR'}`, 196, 20, { align: 'right' });
      doc.text(`Licence G-Tech Cloud : ACTIVE`, 196, 25, { align: 'right' });

      // Body Titles
      doc.setTextColor(15, 23, 42); // slate-900
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text("1. Indicateurs Réels de Performance (KPIs)", 14, 52);
      
      // Grid separator
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.5);
      doc.line(14, 55, 196, 55);

      // Grid helper cards
      const drawKpiCard = (x: number, y: number, w: number, h: number, title: string, val: string) => {
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(250, 251, 252);
        doc.roundedRect(x, y, w, h, 3, 3, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(title.toUpperCase(), x + 4, y + 6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text(val, x + 4, y + 13);
      };

      if (isSuperAdmin) {
        drawKpiCard(14, 59, 42, 17, "Total Boutiques", `${stats.totalStores || 0}`);
        drawKpiCard(60, 59, 42, 17, "Boutiques Actives", `${stats.activeStores || 0}`);
        drawKpiCard(106, 59, 42, 17, "Boutiques Suspendues", `${stats.suspendedStores || 0}`);
        drawKpiCard(152, 59, 44, 17, "Utilisateurs Système", `${stats.totalUsers || 0}`);
      } else {
        drawKpiCard(14, 59, 42, 17, "Ventes Totales", canViewReports ? `${stats.totalSales.toLocaleString('de-DE')} F` : "N/A (Privé)");
        drawKpiCard(60, 59, 42, 17, "Nombre Commandes", `${stats.orders || 0}`);
        drawKpiCard(106, 59, 42, 17, "Nombre Produits", `${stats.products || 0}`);
        drawKpiCard(152, 59, 44, 17, "Clients Enregistrés", canViewReports ? `${stats.customers || 0}` : "N/A (Privé)");
      }

      // Progression / Budget target
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text("2. Suivi et Progression de l'Objectif Mensuel", 14, 91);
      doc.line(14, 94, 196, 94);

      doc.setFillColor(254, 243, 199); // amber-100
      doc.setDrawColor(252, 211, 77); // amber-300
      doc.roundedRect(14, 98, 182, 22, 3, 3, 'FD');

      doc.setTextColor(146, 64, 14); // amber-800
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`OBJECTIF PRINCIPAL DU COMPTOIR :  ${salesGoal.toLocaleString('de-DE')} FCFA`, 19, 105);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120, 113, 108);
      const remainingToGoal = Math.max(0, salesGoal - stats.totalSales);
      const progressText = `Ventes actuelles accumulées : ${stats.totalSales.toLocaleString('de-DE')} FCFA. Progression : ${Math.min(100, Math.round((stats.totalSales / salesGoal) * 100))}% du but ciblé.`;
      const remainText = remainingToGoal > 0 
        ? `Écart à combler pour atteindre l'objectif fixé : ${remainingToGoal.toLocaleString('de-DE')} FCFA.`
        : `Félicitations ! Votre boutique a dépassé l'objectif mensuel de +${Math.abs(stats.totalSales - salesGoal).toLocaleString('de-DE')} FCFA !`;
      
      doc.text(progressText, 19, 110);
      doc.text(remainText, 19, 114);

      // Inventory alerts
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text("3. Niveau d'Alerte & Inventaire Critique", 14, 134);
      doc.line(14, 137, 196, 137);

      let currentY = 143;
      if (alerts && alerts.length > 0) {
        alerts.forEach((alert, index) => {
          if (currentY + 12 < 280) {
            doc.setFillColor(249, 115, 22);
            doc.circle(17, currentY - 1, 1, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(30, 41, 59);
            doc.text(`${index + 1}. ${alert.name || 'Produit'}`, 21, currentY);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(100, 116, 139);
            const alertDetail = alert.alertType === 'expiry' 
              ? `État de validité de service : Expire le ${new Date(alert.expiryDate).toLocaleDateString()}`
              : `Alerte niveau de stockage : Plus que ${alert.stock || 0} unité(s) restante(s). Seuil minimum configuré : ${alert.lowStockThreshold || 5}.`;
            doc.text(alertDetail, 21, currentY + 4.5);
            
            currentY += 14;
          }
        });
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text("Aucune alerte critique enregistrée pour le moment. Votre boutique est entièrement optimisée !", 18, 144);
      }

      // Sign-off
      doc.setDrawColor(226, 232, 240);
      doc.line(14, 275, 196, 275);
      
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`Rapport administratif confidentiel édité par MARKET PRO sous l'infrastructure G-TECH CLOUD SECURE.`, 105, 281, { align: 'center' });
      doc.text(`Conforme au decret N° 2019-014 sur la protection des données et transactions du commerce électronique en vigueur au Togo.`, 105, 285, { align: 'center' });

      const cleanStoreName = (userProfile?.storeName || 'MarketPro').replace(/[^a-zA-Z0-9]/g, '_');
      doc.save(`Rapport_Activite_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e: any) {
      console.error(e);
      alert("Erreur lors de la génération du rapport PDF : " + e.message);
    }
  };

  const [stats, setStats] = useState({
    totalSales: 0,
    orders: 0,
    products: 0,
    customers: 0,
    dailyProfit: 0,
    // Super Admin Stats
    totalStores: 0,
    activeStores: 0,
    suspendedStores: 0,
    totalUsers: 0
  });
  const [alerts, setAlerts] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>(data);

  useEffect(() => {
    let unsubStores: (() => void) | undefined;
    let unsubUsers: (() => void) | undefined;
    let unsubSales: (() => void) | undefined;
    let unsubSalesUser: (() => void) | undefined;
    let unsubProductsUser: (() => void) | undefined;
    let unsubClientsUser: (() => void) | undefined;

    function fetchSuperAdminData() {
      unsubStores = onSnapshot(collection(db, 'storeSettings'), (storesSnap) => {
        const storesList = storesSnap.docs.map(doc => doc.data());
        const total = storesList.length;
        const activeDef = storesList.filter(s => s.licenseStatus === 'active').length;
        const suspendedDef = storesList.filter(s => s.licenseStatus === 'suspended').length;

        setStats(prev => ({
          ...prev,
          totalStores: total,
          activeStores: activeDef,
          suspendedStores: suspendedDef
        }));

        // System alerts for expiring soon
        const expiryAlerts = storesList
          .filter(s => {
            if (!s.licenseExpiry) return false;
            const now = new Date();
            const exp = new Date(s.licenseExpiry);
            const diffTime = exp.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays <= 30; // Expiring in next 30 days
          })
          .map(s => ({
            name: s.name || 'Boutique',
            alertType: 'expiry',
            expiryDate: s.licenseExpiry,
            unit: 'jours'
          }));
        
        setAlerts(expiryAlerts);
      }, (err) => {
        console.error("Super Admin real-time stores fetch issue:", err);
      });

      unsubUsers = onSnapshot(collection(db, 'users'), (usersSnap) => {
        setStats(prev => ({
          ...prev,
          totalUsers: usersSnap.size
        }));
      }, (err) => {
        console.error("Super Admin real-time users fetch issue:", err);
      });

      // Realtime aggregate sales for chart
      const startOfWeek = new Date();
      startOfWeek.setDate(today.getDate() - 7);
      startOfWeek.setHours(0, 0, 0, 0);

      unsubSales = onSnapshot(query(
        collection(db, 'sales'),
        where('timestamp', '>=', startOfWeek)
      ), (salesSnap) => {
        const daySales: { [key: string]: number } = {};
        const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        
        for(let i=0; i<7; i++) {
          const d = new Date();
          d.setDate(today.getDate() - i);
          daySales[days[d.getDay()]] = 0;
        }

        salesSnap.forEach(doc => {
          const data = doc.data();
          const date = data.timestamp?.toDate();
          if (date) {
            const dayName = days[date.getDay()];
            if (daySales[dayName] !== undefined) {
              daySales[dayName] += data.totalAmount || 0;
            }
          }
        });

        const formattedChartData = Object.entries(daySales)
          .map(([day, sales]) => ({ day, sales }))
          .reverse();
        
        setChartData(formattedChartData);
      }, (err) => {
        console.error("Super Admin real-time sales fetch issue:", err);
      });
    }

    const today = new Date();

    if (isSuperAdmin) {
      fetchSuperAdminData();
      return () => {
        if (unsubStores) unsubStores();
        if (unsubUsers) unsubUsers();
        if (unsubSales) unsubSales();
      };
    }

    if (!userProfile?.storeId) return;

    // Real-time listener for Sales & KPI calculations
    const startOfWeek = new Date();
    startOfWeek.setDate(today.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);

    unsubSalesUser = onSnapshot(query(
      collection(db, 'sales'),
      where('storeId', '==', userProfile.storeId),
      where('timestamp', '>=', startOfWeek)
    ), (salesSnap) => {
      const daySales: { [key: string]: number } = {};
      const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      
      // Initialize days
      for(let i=0; i<7; i++) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        daySales[days[d.getDay()]] = 0;
      }

      let total = 0;
      salesSnap.forEach(doc => {
        const data = doc.data();
        const date = data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp ? new Date(data.timestamp) : null);
        if (date) {
          const dayName = days[date.getDay()];
          if (daySales[dayName] !== undefined) {
            daySales[dayName] += data.totalAmount || 0;
          }
        }
        total += data.totalAmount || 0;
      });

      const formattedChartData = Object.entries(daySales)
        .map(([day, sales]) => ({ day, sales }))
        .reverse();
      
      setChartData(formattedChartData);
      setStats(prev => ({ 
        ...prev, 
        totalSales: total,
        orders: salesSnap.size
      }));
    }, (err) => {
      console.error("Dashboard real-time sales query error:", err);
    });

    // Real-time listener for Products & critical inventory stock alerts
    unsubProductsUser = onSnapshot(query(
      collection(db, 'products'),
      where('storeId', '==', userProfile.storeId)
    ), (productsSnap) => {
      const allProducts = productsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      const stockAlerts = allProducts
        .filter((p: any) => (p.stock || 0) <= (p.lowStockThreshold || 5))
        .map((p: any) => ({ ...p, alertType: 'stock' }));
      setAlerts(stockAlerts.slice(0, 5));
      setStats(prev => ({ 
        ...prev, 
        products: productsSnap.size
      }));
    }, (err) => {
      console.error("Dashboard real-time products query error:", err);
    });

    // Real-time listener for Clients count
    unsubClientsUser = onSnapshot(query(
      collection(db, 'clients'),
      where('storeId', '==', userProfile.storeId)
    ), (clientsSnap) => {
      setStats(prev => ({ 
        ...prev, 
        customers: clientsSnap.size
      }));
    }, (err) => {
      console.error("Dashboard real-time clients query error:", err);
    });

    return () => {
      if (unsubStores) unsubStores();
      if (unsubUsers) unsubUsers();
      if (unsubSales) unsubSales();
      if (unsubSalesUser) unsubSalesUser();
      if (unsubProductsUser) unsubProductsUser();
      if (unsubClientsUser) unsubClientsUser();
    };
  }, [userProfile?.storeId]);

  const canViewReports = hasPermission('reports', 'read');

  return (
    <div className="space-y-8 text-left">
      {/* Premium Localized Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 bg-white p-6 sm:p-8 rounded-[32px] border border-gray-100 shadow-sm">
        <div className="space-y-1.5 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-200/50">
              <ShieldCheck size={12} className="text-green-600 shrink-0" />
              <span>G-Tech Cloud Certifié</span>
            </span>
            <span className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-mono">
              <Clock size={11} className="text-slate-500 shrink-0" />
              <span>GMT+0 Lomé</span>
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 flex items-center gap-2 pt-0.5">
            <span>
              {(() => {
                const hr = new Date().getHours();
                if (hr < 12) return "Bonjour";
                if (hr < 18) return "Bon après-midi";
                return "Bonsoir";
              })()}
            </span>
            {userProfile?.displayName ? (
              <span className="text-orange-500 italic font-black">, {userProfile.displayName}</span>
            ) : null}
            <span className="animate-pulse">👋</span>
          </h1>
          <p className="text-gray-500 text-sm font-medium">
            Tableau de bord de <span className="text-slate-800 font-extrabold">{userProfile?.storeName || 'votre boutique'}</span>.
          </p>
        </div>

        {/* Global Instant PDF Downloader */}
        <div className="flex shrink-0">
          <button
            onClick={handleExportDashboardPDF}
            className="flex items-center justify-center gap-2.5 px-6 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-orange-500/20 w-full sm:w-auto"
            title="Exporter l'activité consolidée au format PDF"
          >
            <FileDown size={16} />
            <span>Rapport d'Activité (PDF)</span>
          </button>
        </div>
      </div>

      {/* Visual Branch/Annexe Switcher for Main Store Admin */}
      {((userRole === 'admin' || userProfile?.role === 'admin') && !isSuperAdmin && familyStores.length > 1) && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-orange-500/10 to-transparent p-6 sm:p-8 rounded-[32px] border border-orange-200/40 relative overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-6"
        >
          {/* Subtle decorative background globe */}
          <div className="absolute right-4 -bottom-10 opacity-5 pointer-events-none">
            <Globe size={180} />
          </div>

          <div className="space-y-2 relative z-10 text-left max-w-xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-[10px] font-black uppercase tracking-widest">
              <Store size={12} />
              <span>{language === 'fr' ? 'Sélecteur de Boutique' : 'Store Selector'}</span>
            </span>
            <h3 className="text-xl font-bold font-sans tracking-tight text-slate-900">
              {language === 'fr' 
                ? 'Gestion Multi-Boutique (Annexes & Filiales)' 
                : 'Multi-Store Management (Branches)'}
            </h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              {language === 'fr' 
                ? 'Basculez instantanément vers l\'une de vos succursales ou filiales pour consulter l\'ensemble de son système (stocks, transactions, comptabilité et personnel).'
                : 'Instantly swap to one of your branches or subsidiaries to view its complete system (inventory, sales, accounting and personnel).'}
            </p>
          </div>

          <div className="relative z-10 shrink-0 w-full lg:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="bg-white px-5 py-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center min-w-[280px]">
              <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest leading-none mb-2">Boutique Active</span>
              <div className="relative flex items-center">
                <Store size={16} className="text-orange-500 absolute left-0" />
                <select
                  value={userProfile?.storeId}
                  onChange={(e) => handleSwitchStore(e.target.value)}
                  className="w-full text-sm font-black text-[#111827] bg-transparent border-none outline-none pl-6 pr-4 cursor-pointer select-none"
                >
                  {familyStores.map(s => (
                    <option key={`dashboard-store-sel-${s.id}`} value={s.id} className="font-bold text-slate-800">
                      {s.name} {s.id === (settings?.parentStoreId || settings?.id) ? `(${language === 'fr' ? 'Principale' : 'Main'})` : `(${language === 'fr' ? 'Annexe' : 'Branch'})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Switch Button Pills */}
            <div className="hidden sm:flex items-center gap-2 max-w-sm overflow-x-auto py-1">
              {familyStores.slice(0, 3).map((s) => {
                const isSelected = s.id === userProfile?.storeId;
                return (
                  <button
                    key={`quick-pill-${s.id}`}
                    onClick={() => handleSwitchStore(s.id)}
                    className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                      isSelected 
                        ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' 
                        : 'bg-white hover:bg-slate-50 border border-gray-100 text-slate-600'
                    }`}
                  >
                    {s.name.split(' ').slice(0, 2).join(' ')}
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Fast Shortcuts & Command Center Banner */}
      {!isSuperAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => navigate('/pos')}
            className="flex flex-col items-center justify-center gap-2 p-4 bg-white hover:bg-slate-50 border border-gray-100 rounded-2xl transition-all shadow-sm group text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Zap size={18} className="fill-orange-500" />
            </div>
            <span className="text-[10px] font-black uppercase text-gray-800 tracking-wider">Faire une vente</span>
          </button>

          <button
            onClick={() => navigate('/inventory')}
            className="flex flex-col items-center justify-center gap-2 p-4 bg-white hover:bg-slate-50 border border-gray-100 rounded-2xl transition-all shadow-sm group text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Package size={18} />
            </div>
            <span className="text-[10px] font-black uppercase text-gray-800 tracking-wider">Ajouter Produit</span>
          </button>

          <button
            onClick={() => navigate('/accounting')}
            className="flex flex-col items-center justify-center gap-2 p-4 bg-white hover:bg-slate-50 border border-gray-100 rounded-2xl transition-all shadow-sm group text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-green-50 text-green-500 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Activity size={18} />
            </div>
            <span className="text-[10px] font-black uppercase text-gray-800 tracking-wider">Comptabilité</span>
          </button>

          <button
            onClick={() => navigate('/personnel')}
            className="flex flex-col items-center justify-center gap-2 p-4 bg-white hover:bg-slate-50 border border-gray-100 rounded-2xl transition-all shadow-sm group text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users size={18} />
            </div>
            <span className="text-[10px] font-black uppercase text-gray-800 tracking-wider">Gérer Personnel</span>
          </button>
        </div>
      )}

      {/* Interactive Monthly Revenue Goal Tracker */}
      {!isSuperAdmin && canViewReports && (
        <div className="bg-white text-slate-900 rounded-[32px] p-6 sm:p-8 border border-gray-100 shadow-sm relative overflow-hidden">
          {/* Accent decoration overlay */}
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-orange-500/5 to-transparent pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2 text-left">
              <div className="flex items-center gap-2 text-orange-600">
                <Trophy size={18} />
                <span className="text-[10px] font-black uppercase tracking-widest">Suivi d'objectif mensuel</span>
              </div>
              
              <div className="flex items-center gap-3.5 flex-wrap">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                  Objectif : {salesGoal.toLocaleString('de-DE')} FCFA
                </h3>
                
                {isEditingGoal ? (
                  <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <input
                      type="number"
                      value={newGoalInput}
                      onChange={(e) => setNewGoalInput(e.target.value)}
                      className="bg-transparent text-slate-900 placeholder-slate-400 text-xs font-bold outline-none px-2 w-28 text-left border-none"
                      placeholder="Nouveau but"
                    />
                    <button
                      onClick={handleSaveGoal}
                      className="px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors"
                    >
                      Enregistrer
                    </button>
                    <button
                      onClick={() => setIsEditingGoal(false)}
                      className="text-slate-500 hover:text-slate-950 text-[11px] font-bold px-1"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setNewGoalInput(salesGoal.toString()); setIsEditingGoal(true); }}
                    className="flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all"
                  >
                    <Edit3 size={11} className="text-orange-500" />
                    <span>Modifier le but</span>
                  </button>
                )}
              </div>

              <p className="text-slate-500 text-xs font-semibold leading-relaxed max-w-xl">
                {stats.totalSales >= salesGoal ? (
                  <span className="text-green-600 font-bold">✨ Incroyable ! Vous avez franchi votre objectif de vente de ce mois-ci ! Continuez ainsi.</span>
                ) : (
                  <span>Il vous reste <strong className="text-orange-600">{(salesGoal - stats.totalSales).toLocaleString('de-DE')} F</strong> à comptabiliser pour atteindre l'objectif ciblé de ce mois.</span>
                )}
              </p>
            </div>

            <div className="flex flex-col items-center md:items-end gap-1.5 min-w-[120px]">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Progression</span>
              <span className="text-3xl sm:text-4xl font-black text-slate-900 italic tracking-tighter">
                {Math.min(100, Math.round((stats.totalSales / salesGoal) * 100))}%
              </span>
            </div>
          </div>

          {/* Progress bar alignment */}
          <div className="mt-6 w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/50">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (stats.totalSales / salesGoal) * 100)}%` }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full shadow-lg"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isSuperAdmin ? (
          <>
            <StatCard 
              title="Total Boutiques" 
              value={stats.totalStores?.toLocaleString() || '0'} 
              icon={ShoppingBag} 
            />
            <StatCard 
              title="Boutiques Actives" 
              value={stats.activeStores?.toLocaleString() || '0'} 
              icon={TrendingUp} 
              trend="up" 
              trendValue={stats.totalStores > 0 ? ((stats.activeStores / stats.totalStores) * 100).toFixed(1) : '0'} 
            />
            <StatCard 
              title="Boutiques Suspendues" 
              value={stats.suspendedStores?.toLocaleString() || '0'} 
              icon={Lock} 
            />
            <StatCard 
              title="Utilisateurs Système" 
              value={stats.totalUsers?.toLocaleString() || '0'} 
              icon={Users} 
            />
          </>
        ) : (
          <>
            {canViewReports ? (
              <StatCard 
                title="Ventes Totales" 
                value={`${(stats.totalSales || 0).toLocaleString('de-DE')} FCFA`} 
                icon={TrendingUp} 
                trend="up" 
                trendValue="12.5" 
              />
            ) : (
              <div className="bg-gray-50 p-6 rounded-3xl border border-dashed border-gray-200 flex flex-col items-center justify-center text-center opacity-50">
                 <Lock size={20} className="text-gray-400 mb-2" />
                 <p className="text-[10px] font-black uppercase text-gray-400">Stats Privées</p>
              </div>
            )}
            <StatCard 
              title="Commandes" 
              value={stats.orders?.toLocaleString() || '0'} 
              icon={ShoppingBag} 
              trend={canViewReports ? "up" : undefined} 
              trendValue={canViewReports ? "8.2" : undefined} 
            />
            <StatCard 
              title="Produits" 
              value={stats.products?.toLocaleString() || '0'} 
              icon={Package} 
            />
            {canViewReports ? (
              <StatCard 
                title="Clients" 
                value={stats.customers?.toLocaleString() || '0'} 
                icon={Users} 
                trend="down" 
                trendValue="3.1" 
              />
            ) : (
              <div className="bg-gray-50 p-6 rounded-3xl border border-dashed border-gray-200 flex flex-col items-center justify-center text-center opacity-50">
                 <Lock size={20} className="text-gray-400 mb-2" />
                 <p className="text-[10px] font-black uppercase text-gray-400">Stats Privées</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm relative overflow-hidden">
          {!isSuperAdmin && !canViewReports && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
               <div className="bg-white p-6 rounded-3xl shadow-xl flex flex-col items-center gap-2 border border-gray-100">
                  <Lock size={24} className="text-orange-500" />
                  <p className="text-sm font-black uppercase tracking-widest text-gray-900">Accès Reservé</p>
               </div>
            </div>
          )}
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-xl font-bold text-gray-900">Activité des Ventes</h3>
            <select className="bg-gray-50 border-none rounded-xl px-4 py-2 text-sm font-medium outline-none">
              <option>7 derniers jours</option>
              <option>30 derniers jours</option>
            </select>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F8CFF" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#4F8CFF" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="day" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#6B7280' }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#6B7280' }} 
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#111827', 
                    border: 'none', 
                    borderRadius: '12px',
                    color: '#fff'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="#4F8CFF" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorSales)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Analyse KPI & Objectifs</h3>
                <p className="text-xs text-gray-500 mt-0.5">Distribution réelle de performance</p>
              </div>
              <div className="p-2 bg-[#F0F6FF] text-[#4F8CFF] rounded-xl">
                <Target size={18} />
              </div>
            </div>

            {/* Performance KPI Chart */}
            <div className="h-[210px] flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={isSuperAdmin ? [
                      { name: 'Actives', value: stats.activeStores || 1 },
                      { name: 'Suspendues', value: stats.suspendedStores || 0 },
                      { name: 'En attente', value: Math.max(0, stats.totalStores - stats.activeStores - stats.suspendedStores) }
                    ] : [
                      { name: 'Réalisé', value: Math.min(stats.totalSales, salesGoal) || 1 },
                      { name: 'Reste à faire', value: Math.max(0, salesGoal - stats.totalSales) }
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {(isSuperAdmin ? [
                      { color: '#22C55E' },
                      { color: '#EF4444' },
                      { color: '#4F8CFF' }
                    ] : [
                      { color: '#4F8CFF' },
                      { color: '#FFC107' }
                    ]).map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: any) => [`${value.toLocaleString('de-DE')}`, 'Valeur']}
                    contentStyle={{ 
                      backgroundColor: '#111827', 
                      border: 'none', 
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '11px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center value overlay */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">
                  {isSuperAdmin ? "Boutiques" : "Atteint"}
                </span>
                <span className="text-[22px] font-black text-[#111827] mt-1">
                  {isSuperAdmin ? stats.totalStores : `${Math.round(Math.min(100, (stats.totalSales / (salesGoal || 1)) * 100))}%`}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-[#EAECEF] space-y-3.5">
            {isSuperAdmin ? (
              <>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
                    <span className="text-[#6B7280]">Boutiques Actives</span>
                  </div>
                  <span className="text-[#111827] font-bold">{stats.activeStores}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
                    <span className="text-[#6B7280]">Suspendues</span>
                  </div>
                  <span className="text-[#111827] font-bold">{stats.suspendedStores}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#4F8CFF]" />
                    <span className="text-[#6B7280]">Ventes Réalisées</span>
                  </div>
                  <span className="text-[#111827] font-extrabold">{stats.totalSales.toLocaleString('de-DE')} FCFA</span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FFC107]" />
                    <span className="text-[#6B7280]">Objectif Restant</span>
                  </div>
                  <span className="text-[#111827] font-extrabold">{Math.max(0, salesGoal - stats.totalSales).toLocaleString('de-DE')} FCFA</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
