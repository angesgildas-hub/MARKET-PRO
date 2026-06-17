import { useState, useEffect, useContext } from 'react';
import XLSX from 'xlsx-js-style';
import { collection, onSnapshot, query, orderBy, limit, deleteDoc, doc, getDocs, getDoc, where } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Sale, CartItem, StoreSettings } from '../types';
import { ShoppingBag, Calendar, User, CreditCard, Banknote, Smartphone, ChevronRight, Eye, Download, Trash2, X, Printer, Loader2, FileDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppContext } from '../App';
import { handleFirestoreError, OperationType } from '../services/db';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function SalesHistory() {
  const { searchQuery, userRole, hasPermission, userProfile } = useContext(AppContext);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedSaleItems, setSelectedSaleItems] = useState<CartItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (!userProfile?.storeId) return;
    const unsubStore = onSnapshot(doc(db, 'storeSettings', userProfile.storeId), (snap) => {
      if (snap.exists()) setStoreSettings(snap.data() as StoreSettings);
    }, (error) => {
      console.error("Error watching store settings in sales history:", error);
    });
    return () => unsubStore();
  }, [userProfile?.storeId]);

  useEffect(() => {
    if (!userProfile?.storeId) {
      if (userProfile) setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'sales'), 
      where('storeId', '==', userProfile.storeId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allSales = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Sale));
      
      // Sort in memory
      const sortedSales = allSales.sort((a, b) => {
        const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
        const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
        return timeB - timeA;
      });

      const filtered = sortedSales.filter(sale => {
        const saleDate = sale.timestamp?.toDate ? sale.timestamp.toDate().toISOString().split('T')[0] : (sale.timestamp ? new Date(sale.timestamp).toISOString().split('T')[0] : '');
        return saleDate >= dateRange.start && saleDate <= dateRange.end;
      });
      setSales(filtered);
      setLoading(false);
    }, (error) => {
      console.warn("Permission denied for sales history - user might not have rights:", error);
      setLoading(false);
    });
    return unsubscribe;
  }, [dateRange]);

  useEffect(() => {
    if (selectedSale) {
      fetchSaleItems(selectedSale.id);
    } else {
      setSelectedSaleItems([]);
    }
  }, [selectedSale]);

  const fetchSaleItems = async (saleId: string) => {
    setLoadingItems(true);
    try {
      const snap = await getDocs(collection(db, `sales/${saleId}/items`));
      setSelectedSaleItems(snap.docs.map(doc => ({ ...doc.data() } as CartItem)));
    } catch (error) {
      console.error("Error fetching sale items:", error);
    } finally {
      setLoadingItems(false);
    }
  };

  const isSuperAdmin = auth.currentUser?.email === 'anges.gildas@gmail.com' || auth.currentUser?.email === 'gildas@gmail.com';

  const handleDelete = async (id: string) => {
    if (!hasPermission('sales', 'delete')) {
      alert("Permission refusée.");
      return;
    }
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette vente ? Cette action est irréversible.')) return;
    try {
      await deleteDoc(doc(db, 'sales', id));
      alert('Vente supprimée avec succès.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `sales/${id}`);
    }
  };

  const generatePDF = async (sale: Sale) => {
    let items = selectedSaleItems;
    if (selectedSale?.id !== sale.id) {
       // Fetch items if not already loaded for this sale
       const snap = await getDocs(collection(db, `sales/${sale.id}/items`));
       items = snap.docs.map(doc => ({ ...doc.data() } as CartItem));
    }

    const itemsCount = items.length || 1;
    const tableHeight = 5 + (itemsCount * 5);
    const afterTableHeight = 45; // total of totals, payment details, margins
    const calculatedHeight = Math.max(100, 36 + tableHeight + afterTableHeight);

    const docPDF = new jsPDF({
      unit: 'mm',
      format: [80, calculatedHeight] // Thermal receipt size
    });

    // POS Style Header
    docPDF.setFontSize(14);
    docPDF.setFont('helvetica', 'bold');
    docPDF.text(storeSettings?.name || "SUPERMARKET PRO", 40, 15, { align: 'center' });
    
    docPDF.setFontSize(8);
    docPDF.setFont('helvetica', 'normal');
    docPDF.text("Reçu de Vente", 40, 20, { align: 'center' });
    docPDF.text(`ID: #${sale.id.toUpperCase()}`, 40, 24, { align: 'center' });
    docPDF.text(`Date: ${sale.timestamp?.toDate()?.toLocaleString() || 'N/A'}`, 40, 28, { align: 'center' });
    docPDF.text(`Vendeur: ${sale.cashierName?.split(' ')[0] || 'Admin'}`, 40, 31, { align: 'center' });
    
    docPDF.line(5, 34, 75, 34);

    // Items Table
    const tableData = items.map(item => [
      item.name || 'Inconnu',
      (item.quantity || 0).toString(),
      ((item.priceAtSale || 0) * (item.quantity || 0)).toLocaleString('de-DE')
    ]);

    autoTable(docPDF, {
      startY: 37,
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
    docPDF.text(`SOUS-TOTAL: ${((sale.totalAmount || 0) + (sale.discount || 0)).toLocaleString('de-DE')} FCFA`, 75, finalY + 5, { align: 'right' });
    if (sale.discount) {
      docPDF.text(`REMISE: -${(sale.discount || 0).toLocaleString('de-DE')} FCFA`, 75, finalY + 9, { align: 'right' });
    }
    docPDF.setFontSize(10);
    docPDF.text(`TOTAL: ${(sale.totalAmount || 0).toLocaleString('de-DE')} FCFA`, 75, finalY + 14, { align: 'right' });
    
    docPDF.setFontSize(7);
    docPDF.setFont('helvetica', 'normal');
    const paymentInfoY = finalY + 20;
    docPDF.text(`Paiement: ${sale.paymentMethod.toUpperCase()}`, 5, paymentInfoY);
    docPDF.text(`Reçu: ${(sale.amountReceived || sale.totalAmount || 0).toLocaleString('de-DE')} FCFA`, 5, paymentInfoY + 4);
    docPDF.text(`Rendu: ${(sale.change || 0).toLocaleString('de-DE')} FCFA`, 5, paymentInfoY + 8);

    docPDF.text("Merci de votre visite!", 40, paymentInfoY + 16, { align: 'center' });

    docPDF.save(`Recu_${sale.id.slice(-8)}.pdf`);
  };

  const handlePrintReceipt = async (sale: Sale) => {
    try {
      await generatePDF(sale);
    } catch (error) {
      alert("Erreur lors de la génération du PDF.");
    }
  };

  const handleCloseRegister = async () => {
    if (!userProfile?.storeId) return;
    setIsGeneratingReport(true);
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      
      const q = query(
        collection(db, 'sales'),
        where('storeId', '==', userProfile.storeId),
        where('timestamp', '>=', startOfDay),
        orderBy('timestamp', 'desc')
      );
      
      const snap = await getDocs(q);
      const daySales = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const totalSales = daySales.reduce((sum: number, sale: any) => sum + (sale.totalAmount || 0), 0);
      
      // A. GENERATE THERMAL RECEIPT PDF
      const docPDF = new jsPDF({
        unit: 'mm',
        format: [80, 150]
      });

      docPDF.setFontSize(14);
      docPDF.setFont('helvetica', 'bold');
      docPDF.text(storeSettings?.name || "MARKET PRO", 40, 15, { align: 'center' });
      
      docPDF.setFontSize(10);
      docPDF.text("CLÔTURE DE CAISSE", 40, 22, { align: 'center' });
      
      docPDF.setFontSize(8);
      docPDF.setFont('helvetica', 'normal');
      docPDF.text(`Date: ${new Date().toLocaleDateString()}`, 40, 28, { align: 'center' });
      docPDF.text(`Heure: ${new Date().toLocaleTimeString()}`, 40, 32, { align: 'center' });
      docPDF.text(`Vendeur: ${userProfile?.displayName || auth.currentUser?.displayName || 'Admin'}`, 40, 36, { align: 'center' });

      docPDF.line(5, 40, 75, 40);
      
      docPDF.setFontSize(9);
      docPDF.setFont('helvetica', 'bold');
      docPDF.text("RÉSUMÉ DES VENTES", 5, 48);
      
      docPDF.setFontSize(8);
      docPDF.setFont('helvetica', 'normal');
      docPDF.text(`Nombre de ventes: ${daySales.length}`, 5, 54);
      
      docPDF.setFontSize(10);
      docPDF.setFont('helvetica', 'bold');
      docPDF.text(`TOTAL DES ENTRÉES VENTE:`, 5, 65);
      docPDF.setFontSize(12);
      docPDF.text(`${totalSales.toLocaleString('de-DE')} CFA`, 40, 75, { align: 'center' });
      
      docPDF.setFontSize(8);
      docPDF.setFont('helvetica', 'italic');
      docPDF.text("Arrêté la présente caisse à la somme de:", 40, 85, { align: 'center' });
      docPDF.setFont('helvetica', 'bold');
      docPDF.text(`${totalSales.toLocaleString('de-DE')} CFA`, 40, 90, { align: 'center' });

      docPDF.line(5, 100, 75, 100);
      docPDF.text("Signature du Caissier", 40, 110, { align: 'center' });
      
      const pdfOutput = docPDF.output('blob');
      const blobUrl = URL.createObjectURL(pdfOutput);
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = `Cloture_Caisse_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(blobUrl);

      // B. GENERATE UNMODIFIABLE / LOCKED EXCEL SHEET OF ALL ARTICLES SOLD TODAY
      // 1. Fetch sale items subcollection for each sale of today
      const itemsPromises = daySales.map(async (sale: any) => {
        const itemSnap = await getDocs(collection(db, `sales/${sale.id}/items`));
        return itemSnap.docs.map(docItem => {
          const itemData = docItem.data();
          return {
            productId: itemData.productId || itemData.id || '',
            name: itemData.name || 'Inconnu',
            quantity: Number(itemData.quantity) || 0,
            priceAtSale: Number(itemData.priceAtSale) || 0,
          };
        });
      });
      const nestedItems = await Promise.all(itemsPromises);
      const allSoldItems = nestedItems.flat();

      // 2. Fetch all products to match current stock quantities
      const prodSnap = await getDocs(query(collection(db, 'products'), where('storeId', '==', userProfile.storeId)));
      const productsMap: Record<string, { stock: number; lowStockThreshold?: number }> = {};
      prodSnap.docs.forEach(docProd => {
        const d = docProd.data();
        const pId = docProd.id;
        const nameKey = (d.name || '').trim().toLowerCase();
        
        productsMap[pId] = {
          stock: d.stock !== undefined ? Number(d.stock) : 0,
          lowStockThreshold: d.lowStockThreshold !== undefined ? Number(d.lowStockThreshold) : 5,
        };
        productsMap[nameKey] = {
          stock: d.stock !== undefined ? Number(d.stock) : 0,
          lowStockThreshold: d.lowStockThreshold !== undefined ? Number(d.lowStockThreshold) : 5,
        };
      });

      // 3. Aggregate sold articles by key
      interface AggItem {
        name: string;
        quantitySold: number;
        totalValue: number;
        stockRemaining: number;
        lowStockThreshold: number;
        obs: string;
      }
      const aggregated: Record<string, AggItem> = {};

      allSoldItems.forEach(item => {
        const key = item.productId || item.name.trim().toLowerCase();
        const lookup = productsMap[item.productId] || productsMap[item.name.trim().toLowerCase()] || { stock: 0, lowStockThreshold: 5 };
        
        if (!aggregated[key]) {
          aggregated[key] = {
            name: item.name,
            quantitySold: 0,
            totalValue: 0,
            stockRemaining: lookup.stock,
            lowStockThreshold: lookup.lowStockThreshold !== undefined ? lookup.lowStockThreshold : 5,
            obs: 'Stock suffisant en rayon'
          };
        }
        
        aggregated[key].quantitySold += item.quantity;
        aggregated[key].totalValue += (item.quantity * item.priceAtSale);
        
        const currentStock = lookup.stock;
        const threshold = lookup.lowStockThreshold !== undefined ? lookup.lowStockThreshold : 5;
        if (currentStock <= threshold) {
          aggregated[key].obs = `STOCK CRITIQUE - Reste seulement ${currentStock} unité(s)`;
        } else {
          aggregated[key].obs = 'Stock correct en magasin';
        }
      });

      const aggregatedList = Object.values(aggregated);

      // 4. Construct XLSX Rows
      const excelRows = [
        ["RAPPORT JOURNALIER DES VENTES INDIVIDUELLES ET STOCK REQUIS"],
        [`Boutique : ${storeSettings?.name || "MARKET PRO"}`],
        [`Date d'édition : ${new Date().toLocaleDateString('fr-TG')} à ${new Date().toLocaleTimeString('fr-TG')}`],
        [`Caissier Émetteur : ${userProfile?.displayName || auth.currentUser?.displayName || 'Admin'}`],
        [], 
        ["Nº d'ordre", "Nom du produit", "Nombres vendus", "Total produit servi (FCFA)", "Produit restant au stock", "Observations"]
      ];

      aggregatedList.forEach((ag, idx) => {
        excelRows.push([
          (idx + 1).toString(),
          ag.name,
          ag.quantitySold.toString(),
          ag.totalValue.toLocaleString('de-DE'),
          ag.stockRemaining.toString(),
          ag.obs
        ]);
      });

      excelRows.push([]);
      excelRows.push([
        "TOTAL DU JOURNAL DE VENTE",
        "",
        aggregatedList.reduce((sum, item) => sum + item.quantitySold, 0).toString(),
        totalSales.toLocaleString('de-DE'),
        "",
        "Généré automatiquement et cryptographiquement verrouillé"
      ]);

      // 5. Create worksheet, lock to be unmodifiable
      const ws = XLSX.utils.aoa_to_sheet(excelRows);
      
      // Color cell logic for "Produit restant au stock" based on the threshold
      aggregatedList.forEach((ag, idx) => {
        const rowNum = idx + 7;
        const cellRef = `E${rowNum}`;
        if (ws[cellRef]) {
          const isBelow = ag.stockRemaining <= ag.lowStockThreshold;
          ws[cellRef].s = {
            fill: {
              patternType: "solid",
              fgColor: { rgb: isBelow ? "FFC7CE" : "C6EFCE" } // red/green background
            },
            font: {
              color: { rgb: isBelow ? "9C0006" : "006100" }, // dark red/dark green text
              bold: true,
              name: "Arial",
              sz: 10
            },
            alignment: {
              horizontal: "center",
              vertical: "center"
            },
            border: {
              top: { style: "thin", color: { rgb: "E2E8F0" } },
              bottom: { style: "thin", color: { rgb: "E2E8F0" } },
              left: { style: "thin", color: { rgb: "E2E8F0" } },
              right: { style: "thin", color: { rgb: "E2E8F0" } }
            }
          };
        }
      });

      // Activating Sheet Protection lock (Excel locks cell inputs instantly for raw viewing)
      ws['!protect'] = {
        password: 'g-tech-secure-unmodifiable-market-pro-2026',
        selectLockedCells: true,
        selectUnlockedCells: false,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        insertHyperlinks: false,
        deleteColumns: false,
        deleteRows: false,
        sort: false,
        autoFilter: false,
        pivotTables: false
      };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Journal_Caisse_Articles");

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });

      const s2ab = (s: any) => {
        const buf = new ArrayBuffer(s.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
        return buf;
      };

      const excelBlob = new Blob([s2ab(wbout)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const excelUrl = URL.createObjectURL(excelBlob);
      const excelLink = document.createElement('a');
      excelLink.href = excelUrl;
      excelLink.download = `Articles_Vendus_Cloture_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(excelLink);
      excelLink.click();
      document.body.removeChild(excelLink);
      URL.revokeObjectURL(excelUrl);
      
      alert(`Caisse clôturée avec succès !\nRapports générés :\n1. Ticket Ticket PDF\n2. Journal de bord Excel (Vérouillé)`);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const filteredSales = sales.filter(sale => 
    sale.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sale.paymentMethod.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (sale.totalAmount.toString().includes(searchQuery))
  );

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'card': return <CreditCard size={16} />;
      case 'mobile': return <Smartphone size={16} />;
      default: return <Banknote size={16} />;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">Historique des Ventes</h1>
          <p className="text-gray-500 font-medium">Consultez les dernières transactions effectuées.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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
          <button 
            onClick={handleCloseRegister}
            disabled={isGeneratingReport}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95 disabled:opacity-50"
          >
            {isGeneratingReport ? <Loader2 className="animate-spin" size={14} /> : <Printer size={14} className="text-orange-500" />}
            Rapport Journalier
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-bottom border-gray-100">
              <tr>
                <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell">ID Vente</th>
                <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date & Heure</th>
                <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Articles</th>
                <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Méthode</th>
                <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-8 py-5 hidden sm:table-cell">
                    <span className="font-mono text-xs font-bold text-gray-400">#{sale.id.slice(-8).toUpperCase()}</span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-gray-400 shrink-0" />
                      <span className="text-xs sm:text-sm font-medium text-gray-700 truncate max-w-[100px] sm:max-w-none">
                        {sale.timestamp?.toDate()?.toLocaleString('fr-FR')}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-sm font-medium text-gray-600 hidden md:table-cell">
                    {sale.itemsCount} articles
                  </td>
                  <td className="px-8 py-5 hidden lg:table-cell">
                    <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full w-fit">
                      {getMethodIcon(sale.paymentMethod)}
                      <span className="text-xs font-bold capitalize">{sale.paymentMethod}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="font-black text-gray-900 text-sm whitespace-nowrap">{(sale.totalAmount || 0).toLocaleString('de-DE')} FCFA</span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => setSelectedSale(sale)}
                        className="p-2 text-[#4F8CFF] hover:text-white bg-[#F0F6FF] hover:bg-[#4F8CFF] border border-[#4F8CFF]/20 rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
                        title="Voir les détails"
                      >
                        <Eye size={18} className="shrink-0" />
                      </button>
                      <button 
                        onClick={async () => {
                          setSelectedSale(sale);
                          setTimeout(() => window.print(), 500);
                        }}
                        className="p-2 text-emerald-600 hover:text-white bg-emerald-50 hover:bg-emerald-600 border border-emerald-200 rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
                        title="Imprimer le reçu"
                      >
                        <Printer size={18} className="shrink-0" />
                      </button>
                      <button 
                        onClick={() => handlePrintReceipt(sale)}
                        className="p-2 text-blue-600 hover:text-white bg-blue-50 hover:bg-blue-600 border border-blue-200 rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
                        title="Télécharger le reçu PDF"
                      >
                        <FileDown size={18} className="shrink-0" />
                      </button>
                      {hasPermission('sales', 'delete') && (
                        <button 
                          onClick={() => handleDelete(sale.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          title="Supprimer la vente"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {selectedSale && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div 
              onClick={() => setSelectedSale(null)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
            />
            <div 
              className="bg-white w-full max-w-md rounded-[32px] shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]"
            >
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <div>
                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Détails de la Vente</h3>
                    <p className="text-[10px] font-mono font-bold text-gray-400 mt-0.5">#{selectedSale.id.toUpperCase()}</p>
                  </div>
                  <button onClick={() => setSelectedSale(null)} className="p-2 hover:bg-white rounded-xl transition-colors">
                    <X size={20} className="text-gray-400" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 bg-gray-50 rounded-2xl">
                      <p className="text-[9px] font-black uppercase text-gray-400 mb-0.5">Date</p>
                      <p className="font-bold text-gray-900 text-xs">{selectedSale.timestamp?.toDate()?.toLocaleString()}</p>
                    </div>
                    <div className="p-3.5 bg-gray-50 rounded-2xl">
                      <p className="text-[9px] font-black uppercase text-gray-400 mb-0.5">Paiement</p>
                      <div className="flex items-center gap-1.5">
                        {getMethodIcon(selectedSale.paymentMethod)}
                        <p className="font-bold text-gray-900 capitalize text-xs">{selectedSale.paymentMethod}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-black uppercase text-gray-400 mb-3 tracking-widest text-center">Articles</h4>
                    <div className="space-y-2.5">
                      {loadingItems ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-1.5">
                           <Loader2 className="animate-spin text-orange-500" size={20} />
                           <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Chargement...</p>
                        </div>
                      ) : (
                        selectedSaleItems.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center border-b border-dashed border-gray-100 pb-1.5">
                            <div>
                              <p className="font-black text-gray-900 text-[11px] uppercase truncate max-w-[150px]">{item.name}</p>
                              <p className="text-[9px] text-gray-400 font-bold">{item.quantity} x {(item.priceAtSale || 0).toLocaleString('de-DE')} FCFA</p>
                            </div>
                            <p className="font-black text-gray-900 text-xs">{((item.quantity || 0) * (item.priceAtSale || 0)).toLocaleString('de-DE')} FCFA</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100">
                    <div className="flex flex-col gap-1.5 mb-3">
                      <div className="flex justify-between items-center text-gray-500 text-[11px] font-bold">
                        <span>Sous-total</span>
                        <span>{((selectedSale.totalAmount || 0) + (selectedSale.discount || 0)).toLocaleString('de-DE')} FCFA</span>
                      </div>
                      {(selectedSale.discount || 0) > 0 && (
                        <div className="flex justify-between items-center text-red-500 text-[11px] font-black">
                          <span>Remise</span>
                          <span>-{(selectedSale.discount || 0).toLocaleString('de-DE')} FCFA</span>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between items-center text-xl font-black text-gray-900 border-t border-dashed border-gray-100 pt-3">
                      <span className="tracking-tighter">TOTAL</span>
                      <span className="text-orange-500 tracking-tight">{(selectedSale.totalAmount || 0).toLocaleString('de-DE')} FCFA</span>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                   <button 
                     disabled={loadingItems}
                     onClick={() => window.print()}
                     className="flex-1 py-3.5 bg-gray-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-black transition-all disabled:opacity-50"
                   >
                     <Printer size={16} />
                     Ticket
                   </button>
                   <button 
                     disabled={loadingItems}
                     onClick={() => handlePrintReceipt(selectedSale)}
                     className="flex-1 py-3.5 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20"
                   >
                     <FileDown size={16} />
                     PDF
                   </button>
                </div>
            </div>
          </div>
        )}

        {/* Hidden Receipt for Printing (Thermal Optimized) in History */}
        <div id="receipt-print" className="hidden print:block font-mono text-[10px] w-[80mm] mx-auto px-2 py-1 bg-white text-black leading-tight">
          {selectedSale && (
            <>
              <div className="text-center mb-2">
                {storeSettings?.logoUrl && (
                  <img src={storeSettings.logoUrl} alt="Logo" className="w-12 h-12 mx-auto mb-2 object-contain" />
                )}
                <h1 className="text-sm font-bold uppercase tracking-widest">{storeSettings?.name || 'SUPERMARKET PRO'}</h1>
                <p className="text-[8px] italic">{storeSettings?.address || 'Dakar, Sénégal'}</p>
                <p className="text-[8px]">Tel: {storeSettings?.phone || '+221 33 000 00 00'}</p>
                <p className="text-[8px] italic font-bold">Vendeur: {selectedSale.cashierName?.split(' ')[0] || 'Admin'}</p>
                <div className="border-b border-dashed my-2"></div>
                <p className="font-bold underline">REÇU DE VENTE</p>
                <div className="flex justify-between mt-2 font-mono">
                   <span>ID: {selectedSale.id?.slice(-8).toUpperCase()}</span>
                   <span>Caisse: {selectedSale.cashierName?.split(' ')[0] || '01'}</span>
                </div>
                <p className="text-left mt-1">Date: {selectedSale.timestamp?.toDate()?.toLocaleString()}</p>
              </div>

              <div className="space-y-1 mb-2 border-t border-dashed pt-2">
                <div className="flex justify-between font-bold border-b border-dashed pb-1 mb-1 text-[8px]">
                  <span className="w-1/2">ARTICLE</span>
                  <span className="w-1/4 text-center">QTÉ</span>
                  <span className="w-1/4 text-right">TOTAL</span>
                </div>
                {selectedSaleItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between py-0.5 text-[8px]">
                    <span className="w-1/2 truncate uppercase">{item.name}</span>
                    <span className="w-1/4 text-center">{item.quantity}</span>
                    <span className="w-1/4 text-right">{((item.quantity || 0) * (item.priceAtSale || 0)).toLocaleString('de-DE')}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed pt-2 space-y-1">
                <div className="flex justify-between text-[8px]">
                  <span>SOUS-TOTAL</span>
                  <span>{((selectedSale.totalAmount || 0) + (selectedSale.discount || 0)).toLocaleString('de-DE')}</span>
                </div>
                {(selectedSale.discount || 0) > 0 && (
                  <div className="flex justify-between text-[8px] italic">
                    <span>REMISE</span>
                    <span>-{(selectedSale.discount || 0).toLocaleString('de-DE')}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm">
                  <span>TOTAL</span>
                  <span>{(selectedSale.totalAmount || 0).toLocaleString('de-DE')} FCFA</span>
                </div>
                <div className="flex justify-between text-[8px] pt-1">
                  <span>MONTANT REÇU</span>
                  <span>{(selectedSale.amountReceived || selectedSale.totalAmount || 0).toLocaleString('de-DE')}</span>
                </div>
                <div className="flex justify-between text-[8px] font-bold">
                  <span>RENDU</span>
                  <span>{(selectedSale.change || 0).toLocaleString('de-DE')}</span>
                </div>
                <div className="flex justify-between text-[8px] pt-1 uppercase opacity-70">
                  <span>PAIEMENT:</span>
                  <span className="font-bold">{selectedSale.paymentMethod}</span>
                </div>
              </div>

              <div className="text-center mt-2 border-t border-dashed pt-2">
                <p className="text-[8px] font-bold">MERCI POUR VOTRE VISITE</p>
                <p className="text-[7px] mt-1 italic text-gray-500 underline uppercase tracking-tight">À bientôt !</p>
              </div>
            </>
          )}
        </div>
        {!loading && sales.length === 0 && (
          <div className="p-20 text-center text-gray-400">
            <ShoppingBag size={48} className="mx-auto mb-4 opacity-20" />
            <p>Aucune vente enregistrée pour le moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}
