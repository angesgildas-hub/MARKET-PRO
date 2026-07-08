import React, { useState, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DollarSign, 
  Plus, 
  TrendingDown, 
  TrendingUp, 
  Calendar,
  X,
  FileText,
  Search,
  PieChart as PieChartIcon,
  Lock,
  Check,
  Download,
  FileSpreadsheet,
  FileBox,
  Trash2
} from 'lucide-react';
import { AppContext } from '../App';
import { collection, addDoc, onSnapshot, query, orderBy, getDocs, doc, deleteDoc, where } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../services/db';
import { Expense } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

export default function Accounting() {
  const { userRole, settings, hasPermission, userProfile } = useContext(AppContext);
  const isSuperAdmin = ['anges.gildas@gmail.com', 'gildas@gmail.com'].includes((auth.currentUser?.email || '').trim().toLowerCase());
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Super Admin Specific State
  const [storePayments, setStorePayments] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    amount: 0,
    category: 'Fournitures',
    date: new Date().toISOString().split('T')[0],
    description: ''
  });

  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (isSuperAdmin) {
      async function fetchSuperAdminAccounting() {
        try {
          const storesSnap = await getDocs(collection(db, 'storeSettings'));
          const stores = storesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setStorePayments(stores);
          setLoading(false);
        } catch (err) {
          console.error("Super Admin Accounting Fetch Error:", err);
          setLoading(false);
        }
      }
      fetchSuperAdminAccounting();
      return;
    }

    if (!userProfile?.storeId) {
      if (userProfile) setLoading(false);
      return;
    }
    if (!hasPermission('accounting', 'read')) {
      setLoading(false);
      return;
    }

    // Fetch Expenses for this store
    const q = query(
      collection(db, 'expenses'), 
      where('storeId', '==', userProfile.storeId)
    );
    const unsubExpenses = onSnapshot(q, (snap) => {
      const allExpenses = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Expense));
      const sortedExpenses = allExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const filtered = sortedExpenses.filter(e => e.date >= dateRange.start && e.date <= dateRange.end);
      setExpenses(filtered);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching expenses:", error);
      setLoading(false);
    });

    // Fetch Total Sales for Balance in this store
    const fetchSales = async () => {
      try {
        const salesSnap = await getDocs(query(
          collection(db, 'sales'), 
          where('storeId', '==', userProfile.storeId)
        ));
        let total = 0;
        salesSnap.forEach(doc => {
          const data = doc.data();
          const saleDate = data.timestamp?.toDate ? data.timestamp.toDate().toISOString().split('T')[0] : (data.timestamp ? new Date(data.timestamp).toISOString().split('T')[0] : '');
          if (saleDate >= dateRange.start && saleDate <= dateRange.end) {
            total += data.totalAmount || 0;
          }
        });
        setTotalSales(total);
      } catch (error) {
        console.error("Error fetching sales for accounting:", error);
      }
    };
    fetchSales();

    return () => unsubExpenses();
  }, [dateRange, userRole, userProfile?.storeId]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission('accounting', 'create')) {
      alert("Permission refusée.");
      return;
    }
    try {
      if (!userProfile?.storeId) {
        throw new Error("ID de boutique manquant. Veuillez vous reconnecter.");
      }
      await addDoc(collection(db, 'expenses'), {
        ...formData,
        storeId: userProfile.storeId,
        createdBy: auth.currentUser?.uid,
        createdAt: new Date().toISOString()
      });
      setIsModalOpen(false);
      setFormData({ title: '', amount: 0, category: 'Fournitures', date: new Date().toISOString().split('T')[0], description: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'expenses');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!hasPermission('accounting', 'delete')) {
      alert("Permission refusée.");
      return;
    }
    if (!window.confirm('Supprimer cette dépense ?')) return;
    try {
      await deleteDoc(doc(db, 'expenses', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `expenses/${id}`);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Titre', 'Categorie', 'Montant', 'Description'];
    const rows = expenses.map(e => [
      e.date,
      e.title,
      e.category,
      e.amount,
      e.description || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `rapport_comptabilite_${dateRange.start}_au_${dateRange.end}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Header
    if (settings?.logoUrl) {
      try {
        doc.addImage(settings.logoUrl, 'PNG', 10, 10, 20, 20);
      } catch (e) {}
    }
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(settings?.name || "MARKET PRO", 35, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Rapport de Comptabilité: ${dateRange.start} au ${dateRange.end}`, 35, 26);
    
    doc.line(10, 35, 200, 35);

    // Summary
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("BILAN FINANCIER", 10, 45);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Ventes Totales: ${totalSales.toLocaleString('de-DE')} FCFA`, 10, 52);
    doc.text(`Dépenses Totales: ${totalExpenses.toLocaleString('de-DE')} FCFA`, 10, 58);
    doc.text(`Bénéfice Net: ${(totalSales - totalExpenses).toLocaleString('de-DE')} FCFA`, 10, 64);

    // Expenses Table
    autoTable(doc, {
      startY: 75,
      head: [['Date', 'Objet', 'Catégorie', 'Montant (CFA)']],
      body: expenses.map(e => [
        new Date(e.date).toLocaleDateString('fr-FR'),
        e.title,
        e.category,
        e.amount.toLocaleString('de-DE')
      ]),
      headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    doc.save(`rapport_comptabilite_${dateRange.start}.pdf`);
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netProfit = totalSales - totalExpenses;

  const categoryData = Object.entries(
    expenses.reduce((acc: any, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + Number(curr.amount);
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const COLORS = ['#f97316', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444'];
  
  if (isSuperAdmin) {
    const activeSubCount = storePayments.filter(s => s.licenseStatus === 'active').length;
    const expiredSubCount = storePayments.filter(s => s.licenseStatus === 'suspended' || s.licenseStatus === 'expired' || s.licenseStatus === 'expired').length;
    const pendingSubCount = storePayments.filter(s => s.licenseStatus === 'pending').length;

    return (
      <div className="space-y-8 pb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">Comptabilité Système</h1>
            <p className="text-gray-500 font-medium">Suivi des abonnements et paiements des boutiques.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
            <div className="p-3 bg-green-50 w-fit rounded-2xl mb-4 text-green-600"><TrendingUp size={24} /></div>
            <p className="text-sm text-gray-500 font-medium mb-1">Abonnements Actifs</p>
            <h3 className="text-3xl font-black text-gray-900">{activeSubCount}</h3>
          </motion.div>
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
            <div className="p-3 bg-red-50 w-fit rounded-2xl mb-4 text-red-600"><TrendingDown size={24} /></div>
            <p className="text-sm text-gray-500 font-medium mb-1">Suspendus / Expirés</p>
            <h3 className="text-3xl font-black text-gray-900">{expiredSubCount}</h3>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
            <div className="p-3 bg-orange-50 w-fit rounded-2xl mb-4 text-orange-600"><Calendar size={24} /></div>
            <p className="text-sm text-gray-500 font-medium mb-1">En attente (Pending)</p>
            <h3 className="text-3xl font-black text-gray-900">{pendingSubCount}</h3>
          </motion.div>
        </div>

        <div className="bg-white rounded-[40px] border border-gray-100 shadow-xl overflow-hidden">
          <div className="p-8 border-b border-gray-50 flex justify-between items-center">
            <h3 className="text-xl font-bold text-gray-900">État des Licences par Boutique</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Boutique</th>
                  <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</th>
                  <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Statut</th>
                  <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Expiration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {storePayments.map((store, idx) => (
                  <tr key={`accounting-store-${store.id || idx}-${idx}`} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">
                          {store.logoUrl ? <img src={store.logoUrl} className="w-full h-full object-cover rounded-xl" /> : <TrendingUp size={20} />}
                        </div>
                        <span className="text-sm font-bold text-gray-900">{store.name || 'Boutique Sans Nom'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="px-3 py-1 bg-gray-100 rounded-full text-[9px] font-black uppercase tracking-widest text-gray-500">
                        {store.storeType || 'Standard'}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${store.licenseStatus === 'active' ? 'bg-green-500' : store.licenseStatus === 'pending' ? 'bg-orange-500' : 'bg-red-500'}`} />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${store.licenseStatus === 'active' ? 'text-green-600' : store.licenseStatus === 'pending' ? 'text-orange-600' : 'text-red-600'}`}>
                          {store.licenseStatus}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-sm font-mono font-bold text-gray-600">
                      {store.licenseExpiry ? (
                        new Date(store.licenseExpiry.toDate ? store.licenseExpiry.toDate() : store.licenseExpiry).toLocaleDateString()
                      ) : (
                        'N/A'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (!hasPermission('accounting', 'read')) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center p-8 bg-white rounded-[40px] border border-gray-100 shadow-sm">
        <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center text-orange-500 mb-6">
          <Lock size={48} />
        </div>
        <h2 className="text-3xl font-black text-gray-900 mb-2 uppercase tracking-tighter">Accès Restreint</h2>
        <p className="text-gray-500 max-w-md font-medium">Le module de comptabilité est réservé aux administrateurs et aux gestionnaires du système. Veuillez contacter votre délégué.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">Comptabilité</h1>
          <p className="text-gray-500 font-medium">Bilan financier et gestion des dépenses.</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
          <Calendar size={18} className="text-gray-400 ml-2" />
          <input 
            type="date" 
            max="9999-12-31"
            value={dateRange.start} 
            onChange={e => {
              let val = e.target.value;
              const parts = val.split('-');
              if (parts[0] && parts[0].length > 4) {
                parts[0] = parts[0].slice(0, 4);
                val = parts.join('-');
              }
              setDateRange(prev => ({ ...prev, start: val }));
            }}
            className="bg-transparent border-none text-xs font-black uppercase outline-none"
          />
          <span className="text-gray-300">/</span>
          <input 
            type="date" 
            max="9999-12-31"
            value={dateRange.end} 
            onChange={e => {
              let val = e.target.value;
              const parts = val.split('-');
              if (parts[0] && parts[0].length > 4) {
                parts[0] = parts[0].slice(0, 4);
                val = parts.join('-');
              }
              setDateRange(prev => ({ ...prev, end: val }));
            }}
            className="bg-transparent border-none text-xs font-black uppercase outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-3 bg-white text-gray-900 border border-gray-100 rounded-2xl font-bold hover:bg-gray-50 transition-all shadow-sm"
            title="Exporter en CSV"
          >
            <FileSpreadsheet size={20} className="text-green-600" />
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-3 bg-white text-gray-900 border border-gray-100 rounded-2xl font-bold hover:bg-gray-50 transition-all shadow-sm"
            title="Exporter en PDF"
          >
            <FileBox size={20} className="text-red-600" />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-all shadow-xl"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Nouvelle Dépense</span>
            <span className="sm:hidden font-black">Dépense</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="p-3 bg-green-50 w-fit rounded-2xl mb-4 text-green-600"><TrendingUp size={24} /></div>
          <p className="text-sm text-gray-500 font-medium mb-1">Revenus Totaux</p>
          <h3 className="text-3xl font-black text-gray-900">{(totalSales || 0).toLocaleString('de-DE')} FCFA</h3>
        </motion.div>
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="p-3 bg-red-50 w-fit rounded-2xl mb-4 text-red-600"><TrendingDown size={24} /></div>
          <p className="text-sm text-gray-500 font-medium mb-1">Dépenses Totales</p>
          <h3 className="text-3xl font-black text-gray-900">{(totalExpenses || 0).toLocaleString('de-DE')} FCFA</h3>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
          <div className={`p-3 w-fit rounded-2xl mb-4 ${netProfit >= 0 ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'}`}><DollarSign size={24} /></div>
          <p className="text-sm text-gray-500 font-medium mb-1">Bénéfice Net</p>
          <h3 className="text-3xl font-black text-gray-900">{(netProfit || 0).toLocaleString('de-DE')} FCFA</h3>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expenses List */}
        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-gray-900">Dernières Dépenses</h3>
            <button className="text-sm font-bold text-orange-500 hover:underline">Voir tout</button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto max-h-[400px] pr-2">
            {expenses.map((expense) => (
              <div key={expense.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    <FileText size={20} className="text-gray-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">{expense.title}</h4>
                    <p className="text-xs text-gray-500">{expense.category} • {new Date(expense.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-black text-red-600 whitespace-nowrap">-{(expense.amount || 0).toLocaleString('de-DE')} FCFA</span>
                  {(userRole === 'admin' || isSuperAdmin) && (
                    <button 
                      onClick={() => handleDeleteExpense(expense.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {expenses.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 py-10 opacity-50">
                <Search size={48} className="mb-4" />
                <p>Aucune dépense enregistrée</p>
              </div>
            )}
          </div>
        </div>

        {/* Breakdown Chart */}
        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-8">
            <PieChartIcon size={20} className="text-orange-500" />
            <h3 className="text-xl font-bold text-gray-900">Répartition par Catégorie</h3>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: '#111827', 
                    border: 'none', 
                    borderRadius: '12px',
                    color: '#fff'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {categoryData.map((item, index) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="text-xs font-bold text-gray-600">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Expense Modal modernized */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" 
              onClick={() => setIsModalOpen(false)} 
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="relative bg-white w-full h-full sm:h-auto sm:max-w-md sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-5 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h2 className="text-xl font-black text-gray-900 tracking-tight">Nouvelle Dépense</h2>
                  <p className="text-gray-500 font-bold italic text-[10px] mt-1">Gérez vos sorties de caisse.</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="p-2 hover:bg-white hover:shadow-lg rounded-full transition-all group"
                >
                  <X size={20} className="text-gray-300 group-hover:text-gray-900" />
                </button>
              </div>

              <form onSubmit={handleAddExpense} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Objet de la dépense</label>
                    <input 
                      required
                      type="text" 
                      value={formData.title}
                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                      autoFocus
                      placeholder=""
                      className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-xl font-bold focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-50/50 transition-all outline-none text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Montant (FCFA)</label>
                      <input 
                        required
                        type="number" 
                        value={formData.amount}
                        onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })}
                        className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-xl font-black text-base text-red-600 focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-50/50 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Date</label>
                      <input 
                        required
                        type="date" 
                        max="9999-12-31"
                        value={formData.date}
                        onChange={e => {
                          let val = e.target.value;
                          const parts = val.split('-');
                          if (parts[0] && parts[0].length > 4) {
                            parts[0] = parts[0].slice(0, 4);
                            val = parts.join('-');
                          }
                          setFormData({ ...formData, date: val });
                        }}
                        className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-xl font-bold focus:bg-white focus:border-gray-900 focus:ring-4 focus:ring-gray-100 transition-all outline-none text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Catégorie</label>
                    <select 
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-xl font-bold focus:bg-white focus:border-gray-900 focus:ring-4 focus:ring-gray-100 transition-all outline-none appearance-none text-sm"
                    >
                      <option value="Fournitures">Fournitures</option>
                      <option value="Loyer">Loyer</option>
                      <option value="Salaires">Salaires</option>
                      <option value="Marketing">Marketing</option>
                      <option value="Maintenance">Maintenance</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Notes / Description</label>
                    <textarea 
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      placeholder=""
                      className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-xl font-bold focus:bg-white focus:border-gray-900 focus:ring-4 focus:ring-gray-100 transition-all outline-none resize-none text-sm"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-100">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-900 rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-gray-200 transition-all active:scale-95"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-black hover:shadow-2xl hover:shadow-gray-900/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Check size={16} />
                    Valider la dépense
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
