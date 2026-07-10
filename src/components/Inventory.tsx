import React, { useState, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  Filter, 
  Download,
  Package,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Calendar,
  Eye,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../services/db';
import { Product, Unit } from '../types';
import { logAction, AuditAction } from '../services/audit';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';

import { AppContext } from '../App';

export default function Inventory() {
  const { userRole, searchQuery, hasPermission, verifyAction, userProfile } = useContext(AppContext);
  const isCashier = userRole === 'cashier';
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  // Tabs state
  const [activeTab, setActiveTab] = useState<'stock' | 'inventaire'>('stock');

  // Inventories tracking state
  const [inventories, setInventories] = useState<any[]>([]);
  const [isInvModalOpen, setIsInvModalOpen] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState<any | null>(null);

  // Filters for Inventaire tab
  const [invStartDate, setInvStartDate] = useState('');
  const [invEndDate, setInvEndDate] = useState('');

  // Form State for Nouvel Inventaire
  const [invFormData, setInvFormData] = useState({
    periodType: 'daily' as 'daily' | 'periodic',
    startPeriod: new Date().toISOString().split('T')[0],
    endPeriod: new Date().toISOString().split('T')[0],
    notes: '',
    autoAdjustStock: false,
    items: [] as any[]
  });

  // Modal item search query
  const [modalSearchQuery, setModalSearchQuery] = useState('');

  // Form State for Product
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    category: 'Général',
    price: 0,
    costPrice: 0,
    stock: 0,
    lowStockThreshold: 5, // Default threshold
    unit: 'pcs' as Unit,
    expiryDate: ''
  });

  // Fetch products
  useEffect(() => {
    if (!userProfile?.storeId) {
      if (userProfile) setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'products'), 
      where('storeId', '==', userProfile.storeId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
      const sortedData = data.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(sortedData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });
    return unsubscribe;
  }, [userProfile?.storeId]);

  // Fetch physical inventories
  useEffect(() => {
    if (!userProfile?.storeId) return;
    const q = query(
      collection(db, 'inventories'),
      where('storeId', '==', userProfile.storeId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      // Sort in memory to avoid missing index errors
      const sorted = data.sort((a: any, b: any) => {
        const dateA = a.createdAt || '';
        const dateB = b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
      setInventories(sorted);
    }, (error) => {
      console.error("Error fetching inventories:", error);
    });
    return unsubscribe;
  }, [userProfile?.storeId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const action = editingProduct ? 'update' : 'create';
    if (!hasPermission('inventory', action)) {
      alert(`Vous n'avez pas la permission de ${action === 'update' ? 'modifier' : 'créer'} des produits.`);
      return;
    }

    try {
      if (!userProfile?.storeId) {
        throw new Error("ID de boutique manquant. Veuillez vous reconnecter.");
      }

      if (editingProduct) {
        const productRef = doc(db, 'products', editingProduct.id);
        
        // Audit log for price or stock changes
        const auditDetails: string[] = [];
        if (formData.price !== editingProduct.price) {
          auditDetails.push(`Prix: ${editingProduct.price} -> ${formData.price}`);
          await logAction(
            userProfile.storeId,
            auth.currentUser?.uid || '',
            userProfile.displayName || '',
            AuditAction.PRODUCT_PRICE_UPDATE,
            `Changement de prix pour ${editingProduct.name}: ${editingProduct.price} -> ${formData.price}`,
            { productId: editingProduct.id, oldPrice: editingProduct.price, newPrice: formData.price }
          );
        }
        if (formData.stock !== editingProduct.stock) {
          auditDetails.push(`Stock: ${editingProduct.stock} -> ${formData.stock}`);
          await logAction(
            userProfile.storeId,
            auth.currentUser?.uid || '',
            userProfile.displayName || '',
            AuditAction.STOCK_ADJUSTMENT,
            `Réglage manuel du stock pour ${editingProduct.name}: ${editingProduct.stock} -> ${formData.stock}`,
            { productId: editingProduct.id, oldStock: editingProduct.stock, newStock: formData.stock }
          );
        }

        await updateDoc(productRef, { ...formData, updatedAt: new Date().toISOString() });
      } else {
        // Generate SKU for new product
        const initials = formData.name.substring(0, 3).toUpperCase().padEnd(3, 'X');
        const count = products.length;
        const sku = `${initials}${String(count + 1).padStart(5, '0')}`;
        
        await addDoc(collection(db, 'products'), { 
          ...formData, 
          storeId: userProfile.storeId,
          sku,
          updatedAt: new Date().toISOString() 
        });
      }
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    }
  };

  const resetForm = () => {
    setFormData({ 
      name: '', 
      sku: '', 
      barcode: '', 
      category: 'Général', 
      price: 0, 
      costPrice: 0, 
      stock: 0, 
      lowStockThreshold: 5,
      unit: 'pcs', 
      expiryDate: '' 
    });
    setEditingProduct(null);
  };

  const handleDelete = async (id: string) => {
    if (!hasPermission('inventory', 'delete')) {
      alert("Permission refusée.");
      return;
    }
    
    verifyAction(async () => {
      try {
        const productSnap = await getDoc(doc(db, 'products', id));
        const productName = productSnap.exists() ? productSnap.data().name : 'Inconnu';
        
        await deleteDoc(doc(db, 'products', id));
        
        if (userProfile?.storeId) {
          await logAction(
            userProfile.storeId,
            auth.currentUser?.uid || '',
            userProfile.displayName || '',
            AuditAction.PRODUCT_DELETE,
            `Suppression du produit: ${productName}`,
            { productId: id, productName }
          );
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
      }
    });
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.barcode.includes(searchQuery) ||
    (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const lowStockProducts = products.filter(p => p.stock <= (p.lowStockThreshold || 0));

  // --- Physical Inventory Actions ---
  const handleOpenNewInventory = () => {
    if (!hasPermission('inventory', 'create')) {
      alert("Vous n'avez pas la permission de créer des inventaires.");
      return;
    }
    
    // Copy products as initial items
    const initialItems = products.map(p => ({
      productId: p.id,
      productName: p.name,
      sku: p.sku || '---',
      category: p.category || 'Général',
      stockTheorique: p.stock || 0,
      stockPhysique: p.stock || 0, // Default physical to theoretic to save time
      unit: p.unit || 'pcs'
    }));

    setInvFormData({
      periodType: 'daily',
      startPeriod: new Date().toISOString().split('T')[0],
      endPeriod: new Date().toISOString().split('T')[0],
      notes: '',
      autoAdjustStock: false,
      items: initialItems
    });
    setModalSearchQuery('');
    setIsInvModalOpen(true);
  };

  const handleSaveInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile?.storeId) {
      alert("ID de boutique manquant.");
      return;
    }

    try {
      const sessionData = {
        storeId: userProfile.storeId,
        periodType: invFormData.periodType,
        startPeriod: invFormData.startPeriod,
        endPeriod: invFormData.periodType === 'daily' ? invFormData.startPeriod : invFormData.endPeriod,
        notes: invFormData.notes,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid || '',
        createdByName: userProfile.displayName || auth.currentUser?.displayName || 'Admin',
        items: invFormData.items
      };

      // 1. Save to Firestore
      const docRef = await addDoc(collection(db, 'inventories'), sessionData);

      // 2. Audit log
      await logAction(
        userProfile.storeId,
        auth.currentUser?.uid || '',
        userProfile.displayName || '',
        AuditAction.STOCK_ADJUSTMENT,
        `Nouvel inventaire physique enregistré (${invFormData.periodType === 'daily' ? 'Journalier' : 'Périodique'})`,
        { inventoryId: docRef.id, itemsCount: invFormData.items.length }
      );

      // 3. Adjust stocks in system if checked
      if (invFormData.autoAdjustStock) {
        for (const item of invFormData.items) {
          if (item.stockPhysique !== item.stockTheorique) {
            const productRef = doc(db, 'products', item.productId);
            await updateDoc(productRef, {
              stock: item.stockPhysique,
              updatedAt: new Date().toISOString()
            });

            // Log individual adjustments
            await logAction(
              userProfile.storeId,
              auth.currentUser?.uid || '',
              userProfile.displayName || '',
              AuditAction.STOCK_ADJUSTMENT,
              `Ajustement d'inventaire pour ${item.productName}: ${item.stockTheorique} -> ${item.stockPhysique}`,
              { productId: item.productId, oldStock: item.stockTheorique, newStock: item.stockPhysique }
            );
          }
        }
      }

      setIsInvModalOpen(false);
      alert("Inventaire physique enregistré avec succès !");
    } catch (error) {
      console.error("Error saving inventory:", error);
      alert("Erreur lors de l'enregistrement de l'inventaire.");
    }
  };

  const handleDeleteInventory = async (id: string) => {
    if (!hasPermission('inventory', 'delete')) {
      alert("Permission refusée.");
      return;
    }
    verifyAction(async () => {
      try {
        await deleteDoc(doc(db, 'inventories', id));
        if (userProfile?.storeId) {
          await logAction(
            userProfile.storeId,
            auth.currentUser?.uid || '',
            userProfile.displayName || '',
            AuditAction.PRODUCT_DELETE,
            `Suppression du rapport d'inventaire: ${id}`,
            { inventoryId: id }
          );
        }
      } catch (error) {
        console.error("Error deleting inventory:", error);
        alert("Erreur lors de la suppression de l'inventaire.");
      }
    });
  };

  // Filter inventories in-memory based on date filters
  const filteredInventories = inventories.filter(inv => {
    const invDateStr = (inv.createdAt || '').split('T')[0];
    if (invStartDate && invDateStr < invStartDate) return false;
    if (invEndDate && invDateStr > invEndDate) return false;
    return true;
  });

  // --- Real-time Exports & PDF / Excel Generators ---
  const exportInventoryPDF = (session: any) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(249, 115, 22); // Orange tint
    doc.text("RAPPORT D'INVENTAIRE PHYSIQUE", 14, 20);
    
    doc.setFontSize(10);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    
    doc.text(`Boutique : ${userProfile?.storeName || 'MARKET PRO'}`, 14, 28);
    doc.text(`Date d'inventaire : ${new Date(session.createdAt).toLocaleDateString('fr-FR')}`, 14, 34);
    
    const periodStr = session.periodType === 'daily' 
      ? `Journalier (${new Date(session.startPeriod).toLocaleDateString('fr-FR')})`
      : `Périodique (${new Date(session.startPeriod).toLocaleDateString('fr-FR')} au ${new Date(session.endPeriod).toLocaleDateString('fr-FR')})`;
    doc.text(`Type de période : ${periodStr}`, 14, 40);
    doc.text(`Auteur : ${session.createdByName || 'Admin'}`, 14, 46);
    
    if (session.notes) {
      doc.text(`Observations : ${session.notes}`, 14, 52);
    }
    
    const startY = session.notes ? 60 : 54;
    
    // Columns
    const tableHead = [['SKU', 'Produit', 'Catégorie', 'Stock Théorique', 'Stock Physique', 'Écart', 'Statut']];
    
    // Body with gaps calculations
    const tableBody = session.items.map((item: any) => {
      const ecart = item.stockPhysique - item.stockTheorique;
      const statusText = ecart === 0 ? 'Conforme' : (Math.abs(ecart) <= 5 ? 'Écart Mineur' : 'Écart Majeur');
      return [
        item.sku || '---',
        item.productName,
        item.category || 'Général',
        `${item.stockTheorique} ${item.unit || 'pcs'}`,
        `${item.stockPhysique} ${item.unit || 'pcs'}`,
        ecart > 0 ? `+${ecart}` : ecart.toString(),
        statusText
      ];
    });
    
    autoTable(doc, {
      startY,
      head: tableHead,
      body: tableBody,
      styles: { font: "Helvetica", fontSize: 9 },
      headStyles: { fillColor: [249, 115, 22], textColor: [255, 255, 255], fontStyle: "bold" },
      didParseCell: (data) => {
        if (data.row.section === 'body' && (data.column.index === 5 || data.column.index === 6)) {
          const rawRow = session.items[data.row.index];
          if (!rawRow) return;
          const ecartVal = rawRow.stockPhysique - rawRow.stockTheorique;
          
          if (ecartVal === 0) {
            data.cell.styles.textColor = [34, 197, 94]; // Green-500
            data.cell.styles.fontStyle = 'bold';
          } else if (Math.abs(ecartVal) <= 5) {
            data.cell.styles.textColor = [249, 115, 22]; // Orange-500
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [239, 68, 68]; // Red-500
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });
    
    doc.save(`Rapport_Inventaire_${session.id ? session.id.slice(0, 6) : 'Nouv'}_${new Date(session.createdAt).toISOString().split('T')[0]}.pdf`);
  };

  const exportInventoryExcel = (session: any) => {
    const excelRows = [
      ["RAPPORT D'INVENTAIRE PHYSIQUE"],
      [`Boutique : ${userProfile?.storeName || 'MARKET PRO'}`],
      [`Date de création : ${new Date(session.createdAt).toLocaleDateString('fr-FR')} ${new Date(session.createdAt).toLocaleTimeString('fr-FR')}`],
      [`Type de période : ${session.periodType === 'daily' ? 'Journalier' : 'Périodique'}`],
      [`Plage de dates : ${new Date(session.startPeriod).toLocaleDateString('fr-FR')} au ${new Date(session.endPeriod).toLocaleDateString('fr-FR')}`],
      [`Auteur : ${session.createdByName || 'Admin'}`],
      [`Observations : ${session.notes || 'Aucune'}`],
      [],
      ["SKU", "Produit", "Catégorie", "Stock Théorique", "Stock Physique", "Écart", "Statut"]
    ];

    session.items.forEach((item: any) => {
      const ecart = item.stockPhysique - item.stockTheorique;
      const statusText = ecart === 0 ? 'Conforme' : (Math.abs(ecart) <= 5 ? 'Écart Mineur' : 'Écart Majeur');
      excelRows.push([
        item.sku || '---',
        item.productName,
        item.category || 'Général',
        `${item.stockTheorique} ${item.unit || 'pcs'}`,
        `${item.stockPhysique} ${item.unit || 'pcs'}`,
        ecart > 0 ? `+${ecart}` : ecart.toString(),
        statusText
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(excelRows);
    
    // Style columns with custom colors
    session.items.forEach((item: any, idx: number) => {
      const rowNum = idx + 10; // offset headers
      const ecart = item.stockPhysique - item.stockTheorique;
      const isPerfect = ecart === 0;
      const isMinor = Math.abs(ecart) <= 5 && ecart !== 0;
      
      let bgColor = "FFC7CE"; // red for major gap
      let textColor = "9C0006";
      if (isPerfect) {
        bgColor = "C6EFCE"; // green
        textColor = "006100";
      } else if (isMinor) {
        bgColor = "FFEB9C"; // orange
        textColor = "9C6500";
      }

      const cellRefEcart = `F${rowNum}`;
      const cellRefStatut = `G${rowNum}`;

      const style = {
        fill: { patternType: "solid", fgColor: { rgb: bgColor } },
        font: { color: { rgb: textColor }, bold: true, name: "Arial", sz: 10 },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "E2E8F0" } },
          bottom: { style: "thin", color: { rgb: "E2E8F0" } },
          left: { style: "thin", color: { rgb: "E2E8F0" } },
          right: { style: "thin", color: { rgb: "E2E8F0" } }
        }
      };

      if (ws[cellRefEcart]) ws[cellRefEcart].s = style;
      if (ws[cellRefStatut]) ws[cellRefStatut].s = style;
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventaire");

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
    excelLink.download = `Rapport_Inventaire_${session.id ? session.id.slice(0, 6) : 'Nouv'}_${new Date(session.createdAt).toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(excelLink);
    excelLink.click();
    document.body.removeChild(excelLink);
    URL.revokeObjectURL(excelUrl);
  };

  const exportProductsPDF = () => {
    const doc = new jsPDF();
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(249, 115, 22);
    doc.text("ÉTAT DES STOCKS DE PRODUITS", 14, 20);
    
    doc.setFontSize(10);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Boutique : ${userProfile?.storeName || 'MARKET PRO'}`, 14, 28);
    doc.text(`Date d'édition : ${new Date().toLocaleDateString('fr-FR')}`, 14, 34);

    const head = [['SKU', 'Produit', 'Catégorie', 'Prix de Vente', 'Stock Actuel', 'Seuil Alerte', 'Statut']];
    const body = filteredProducts.map(p => {
      const isLow = p.stock <= (p.lowStockThreshold || 0);
      return [
        p.sku || '---',
        p.name,
        p.category || 'Général',
        `${(p.price || 0).toLocaleString('de-DE')} FCFA`,
        `${p.stock} ${p.unit || 'pcs'}`,
        `${p.lowStockThreshold || 5} ${p.unit || 'pcs'}`,
        isLow ? 'Stock Bas' : 'Normal'
      ];
    });

    autoTable(doc, {
      startY: 40,
      head,
      body,
      styles: { font: "Helvetica", fontSize: 9 },
      headStyles: { fillColor: [249, 115, 22], textColor: [255, 255, 255] },
      didParseCell: (data) => {
        if (data.row.section === 'body' && data.column.index === 6) {
          if (data.cell.text[0] === 'Stock Bas') {
            data.cell.styles.textColor = [239, 68, 68];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [34, 197, 94];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });

    doc.save(`Stock_Boutique_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportProductsExcel = () => {
    const excelRows = [
      ["ÉTAT DES STOCKS DE PRODUITS"],
      [`Boutique : ${userProfile?.storeName || 'MARKET PRO'}`],
      [`Date : ${new Date().toLocaleDateString('fr-FR')}`],
      [],
      ["SKU", "Produit", "Catégorie", "Prix de Vente (FCFA)", "Stock Actuel", "Seuil Alerte", "Statut"]
    ];

    filteredProducts.forEach(p => {
      const isLow = p.stock <= (p.lowStockThreshold || 0);
      excelRows.push([
        p.sku || '---',
        p.name,
        p.category || 'Général',
        (p.price || 0).toString(),
        `${p.stock} ${p.unit || 'pcs'}`,
        `${p.lowStockThreshold || 5} ${p.unit || 'pcs'}`,
        isLow ? 'Stock Bas' : 'Normal'
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(excelRows);

    filteredProducts.forEach((p, idx) => {
      const rowNum = idx + 6; // offset header
      const isLow = p.stock <= (p.lowStockThreshold || 0);
      const cellRef = `G${rowNum}`;
      if (ws[cellRef]) {
        ws[cellRef].s = {
          fill: { patternType: "solid", fgColor: { rgb: isLow ? "FFC7CE" : "C6EFCE" } },
          font: { color: { rgb: isLow ? "9C0006" : "006100" }, bold: true, name: "Arial", sz: 10 },
          alignment: { horizontal: "center" }
        };
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stocks");

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
    excelLink.download = `Stock_Boutique_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(excelLink);
    excelLink.click();
    document.body.removeChild(excelLink);
    URL.revokeObjectURL(excelUrl);
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Tab Switcher */}
      <div className="flex border-b border-gray-100 gap-4">
        <button
          onClick={() => setActiveTab('stock')}
          className={`pb-4 px-2 font-black text-sm uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'stock'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <Package size={18} />
          État du Stock
        </button>
        <button
          onClick={() => setActiveTab('inventaire')}
          className={`pb-4 px-2 font-black text-sm uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'inventaire'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <Calendar size={18} />
          Inventaires Physiques
        </button>
      </div>

      {activeTab === 'stock' ? (
        // --- STOCK TAB ---
        <>
          {/* Low Stock Alerts Banner */}
          {!isCashier && lowStockProducts.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 border-2 border-red-100 p-6 rounded-[32px] flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm"
            >
              <div className="flex items-center gap-4">
                 <div className="bg-red-500 p-3 rounded-2xl text-white">
                    <Package size={24} />
                 </div>
                 <div>
                    <p className="font-black text-red-900 uppercase tracking-tighter">Alerte de Stock Bas</p>
                    <p className="text-xs text-red-600 font-medium">{lowStockProducts.length} produits sont en rupture ou sous le seuil critique.</p>
                 </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                 {lowStockProducts.slice(0, 3).map(p => (
                    <span key={p.id} className="px-3 py-1 bg-white border border-red-100 text-red-500 rounded-xl text-[10px] font-bold uppercase truncate max-w-[120px]">
                       {p.name} ({p.stock})
                    </span>
                 ))}
                 {lowStockProducts.length > 3 && (
                    <span className="px-3 py-1 bg-red-100 text-red-600 rounded-xl text-[10px] font-bold">+{lowStockProducts.length - 3} plus</span>
                 )}
              </div>
            </motion.div>
          )}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-gray-900">Stock & Inventaire</h1>
              <p className="text-gray-500 font-medium">Visualisez l'état en direct de vos produits et stocks.</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* PDF & Excel Dropdowns / Buttons for stock */}
              <button 
                onClick={exportProductsPDF}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition-colors text-xs"
              >
                <FileText size={16} className="text-red-500" />
                PDF
              </button>
              <button 
                onClick={exportProductsExcel}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition-colors text-xs"
              >
                <FileSpreadsheet size={16} className="text-green-600" />
                Excel
              </button>
              {!isCashier && hasPermission('inventory', 'create') && (
                <button 
                  onClick={() => { resetForm(); setIsModalOpen(true); }}
                  className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20 text-xs uppercase tracking-wider font-black"
                >
                  <Plus size={16} />
                  Ajouter un Produit
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-bottom border-gray-100">
                  <tr>
                    <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">SKU</th>
                    <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Produit</th>
                    <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Catégorie</th>
                    <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right sm:text-left">Prix de Vente</th>
                    <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Stock</th>
                    <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right hidden sm:table-cell">Péremption</th>
                    <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-8 py-5 hidden md:table-cell">
                        <span className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider">
                          {product.sku || '---'}
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 shrink-0">
                            <Package size={20} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 truncate">{product.name}</p>
                            <p className="text-[10px] text-gray-500 truncate">{product.barcode || '---'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5 hidden lg:table-cell">
                        <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-black uppercase tracking-wider">
                          {product.category}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right sm:text-left">
                        <p className="font-bold text-gray-900">{(product.price || 0).toLocaleString('de-DE')} FCFA</p>
                        <p className="text-[10px] text-gray-400 hidden sm:block">Coût: {(product.costPrice || 0).toLocaleString('de-DE')} FCFA</p>
                      </td>
                      <td className="px-8 py-5 font-bold">
                        <div className="flex items-center gap-2">
                           <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${product.stock > (product.lowStockThreshold || 5) ? 'bg-green-500' : 'bg-red-500'}`} />
                           <span className={`text-xs ${product.stock <= (product.lowStockThreshold || 0) ? 'text-red-600 font-black' : 'text-gray-900'}`}>
                             {product.stock} {product.unit}
                           </span>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right hidden sm:table-cell">
                        {product.expiryDate ? (
                          <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${
                            new Date(product.expiryDate) < new Date() 
                              ? 'bg-red-100 text-red-600' 
                              : 'bg-blue-50 text-blue-600'
                          }`}>
                            {new Date(product.expiryDate).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300 italic">N/A</span>
                        )}
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!isCashier ? (
                            <>
                              <button 
                                onClick={() => { setEditingProduct(product); setFormData({ ...product }); setIsModalOpen(true); }}
                                className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button 
                                onClick={() => handleDelete(product.id)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              >
                                <Trash2 size={18} />
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] font-black uppercase text-gray-300 tracking-widest">Lecture Seule</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-gray-400 font-medium">Aucun produit trouvé</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="px-8 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
              <p className="text-sm text-gray-500">Affichage de 1 à {filteredProducts.length} sur {products.length} produits</p>
              <div className="flex items-center gap-2">
                <button className="p-2 border border-gray-200 rounded-lg disabled:opacity-50" disabled><ChevronLeft size={16} /></button>
                <button className="p-2 border border-gray-200 rounded-lg disabled:opacity-50" disabled><ChevronRight size={16} /></button>
              </div>
            </div>
          </div>
        </>
      ) : (
        // --- INVENTAIRE TAB ---
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-gray-900">Rapports d'Inventaire</h1>
              <p className="text-gray-500 font-medium">Réalisez vos comptages physiques de stock et comparez les écarts.</p>
            </div>
            {!isCashier && (
              <button 
                onClick={handleOpenNewInventory}
                className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20 text-xs uppercase tracking-wider font-black"
              >
                <Plus size={16} />
                Nouvel Inventaire
              </button>
            )}
          </div>

          {/* Periodic Filter */}
          <div className="flex flex-col md:flex-row gap-4 bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-orange-500" />
              <span className="text-sm font-black text-gray-700 uppercase tracking-wider">Filtrer par période :</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <input 
                type="date"
                value={invStartDate}
                onChange={e => setInvStartDate(e.target.value)}
                className="px-4 py-2 border border-gray-100 bg-gray-50 rounded-xl font-bold text-xs outline-none focus:bg-white focus:border-orange-500"
              />
              <span className="text-gray-400 font-bold text-xs">au</span>
              <input 
                type="date"
                value={invEndDate}
                onChange={e => setInvEndDate(e.target.value)}
                className="px-4 py-2 border border-gray-100 bg-gray-50 rounded-xl font-bold text-xs outline-none focus:bg-white focus:border-orange-500"
              />
              {(invStartDate || invEndDate) && (
                <button 
                  onClick={() => { setInvStartDate(''); setInvEndDate(''); }}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-xs rounded-xl"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>

          {/* Inventories Grid List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredInventories.map((inv) => {
              // Calculate discrepancies
              let conformes = 0;
              let mineurs = 0;
              let majeurs = 0;

              (inv.items || []).forEach((item: any) => {
                const ecart = item.stockPhysique - item.stockTheorique;
                if (ecart === 0) conformes++;
                else if (Math.abs(ecart) <= 5) mineurs++;
                else majeurs++;
              });

              return (
                <motion.div 
                  key={inv.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-6 hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="bg-orange-50 text-orange-500 p-3 rounded-2xl">
                        <FileText size={24} />
                      </div>
                      <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                        inv.periodType === 'daily' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                      }`}>
                        {inv.periodType === 'daily' ? 'Journalier' : 'Périodique'}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-gray-900 text-lg leading-tight">
                        {inv.periodType === 'daily' 
                          ? `Inventaire du ${new Date(inv.startPeriod).toLocaleDateString('fr-FR')}`
                          : `Période du ${new Date(inv.startPeriod).toLocaleDateString('fr-FR')} au ${new Date(inv.endPeriod).toLocaleDateString('fr-FR')}`
                        }
                      </h3>
                      <p className="text-xs text-gray-400 mt-1">Auteur : {inv.createdByName || 'Admin'}</p>
                      <p className="text-[10px] text-gray-400 italic">Créé le : {new Date(inv.createdAt).toLocaleString('fr-FR')}</p>
                    </div>

                    {/* Colors representation row */}
                    <div className="grid grid-cols-3 gap-2 bg-gray-50/50 p-3 rounded-2xl text-center">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-black text-green-500 uppercase tracking-wider">Conformes</p>
                        <p className="text-base font-black text-green-600">{conformes}</p>
                      </div>
                      <div className="space-y-0.5 border-x border-gray-100">
                        <p className="text-[10px] font-black text-orange-500 uppercase tracking-wider">Écart Min</p>
                        <p className="text-base font-black text-orange-600">{mineurs}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-black text-red-500 uppercase tracking-wider">Écart Maj</p>
                        <p className="text-base font-black text-red-600">{majeurs}</p>
                      </div>
                    </div>

                    {inv.notes && (
                      <p className="text-xs text-gray-500 line-clamp-2 bg-yellow-50/50 p-2 border border-yellow-100/50 rounded-xl">
                        <strong className="text-yellow-800">Note:</strong> {inv.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 pt-6 mt-6 border-t border-gray-100">
                    <button 
                      onClick={() => setSelectedInventory(inv)}
                      className="flex-1 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Eye size={14} />
                      Détails
                    </button>
                    <button 
                      onClick={() => exportInventoryPDF(inv)}
                      className="p-2 border border-red-100 text-red-500 hover:bg-red-50 rounded-xl flex items-center justify-center transition-colors"
                      title="Télécharger PDF"
                    >
                      <FileText size={16} />
                    </button>
                    <button 
                      onClick={() => exportInventoryExcel(inv)}
                      className="p-2 border border-green-100 text-green-600 hover:bg-green-50 rounded-xl flex items-center justify-center transition-colors"
                      title="Télécharger Excel"
                    >
                      <FileSpreadsheet size={16} />
                    </button>
                    {!isCashier && (
                      <button 
                        onClick={() => handleDeleteInventory(inv.id)}
                        className="p-2 border border-red-100 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl flex items-center justify-center transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
            {filteredInventories.length === 0 && (
              <div className="col-span-full text-center py-16 bg-white border border-dashed border-gray-200 rounded-[32px]">
                <FileText size={48} className="text-gray-300 mx-auto mb-4" />
                <p className="font-bold text-gray-500">Aucun rapport d'inventaire physique enregistré</p>
                <p className="text-xs text-gray-400 mt-1">Créez-en un nouveau pour enregistrer les comptages et les écarts.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* --- MODAL: NOUVEL INVENTAIRE --- */}
      <AnimatePresence>
        {isInvModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" 
              onClick={() => setIsInvModalOpen(false)} 
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="relative bg-white w-full h-full sm:max-w-4xl sm:h-[85vh] sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 sm:p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight">Nouvel Inventaire Physique</h2>
                  <p className="text-gray-500 font-medium italic text-xs mt-1">Comparez le stock théorique système avec le stock réel physique.</p>
                </div>
                <button onClick={() => setIsInvModalOpen(false)} className="p-2 hover:bg-white hover:shadow-lg rounded-full transition-all group">
                  <X size={20} className="text-gray-300 group-hover:text-gray-900" />
                </button>
              </div>

              <form onSubmit={handleSaveInventory} className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
                  
                  {/* Period config & properties */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-50 p-5 rounded-2xl border border-gray-100">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Type de Période</label>
                      <select 
                        value={invFormData.periodType}
                        onChange={e => setInvFormData({ ...invFormData, periodType: e.target.value as any })}
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl font-bold text-xs outline-none"
                      >
                        <option value="daily">Journalier</option>
                        <option value="periodic">Périodique</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Date Début</label>
                      <input 
                        required
                        type="date"
                        value={invFormData.startPeriod}
                        onChange={e => setInvFormData({ ...invFormData, startPeriod: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl font-bold text-xs outline-none"
                      />
                    </div>

                    {invFormData.periodType === 'periodic' && (
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Date Fin</label>
                        <input 
                          required
                          type="date"
                          value={invFormData.endPeriod}
                          onChange={e => setInvFormData({ ...invFormData, endPeriod: e.target.value })}
                          className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl font-bold text-xs outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Notes / observations */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Notes / Observations</label>
                    <textarea 
                      placeholder="Indiquez les remarques ou les explications des écarts..."
                      value={invFormData.notes}
                      onChange={e => setInvFormData({ ...invFormData, notes: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl text-xs font-medium focus:bg-white focus:border-orange-500 transition-all outline-none h-16 resize-none"
                    />
                  </div>

                  {/* Search inside modal */}
                  <div className="flex items-center gap-2 bg-white px-3 py-1 border border-gray-200 rounded-xl">
                    <Search size={16} className="text-gray-400" />
                    <input 
                      type="text"
                      placeholder="Filtrer les produits à compter..."
                      value={modalSearchQuery}
                      onChange={e => setModalSearchQuery(e.target.value)}
                      className="w-full py-1.5 outline-none font-bold text-xs bg-transparent"
                    />
                  </div>

                  {/* Products list table for counting with color labels */}
                  <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white max-h-[250px] overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                        <tr>
                          <th className="px-4 py-2.5 font-bold text-gray-500 uppercase tracking-wider">SKU / Produit</th>
                          <th className="px-4 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-center">Théorique</th>
                          <th className="px-4 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-center w-28">Physique</th>
                          <th className="px-4 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-center">Écart</th>
                          <th className="px-4 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-right">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {invFormData.items
                          .filter(item => 
                            item.productName.toLowerCase().includes(modalSearchQuery.toLowerCase()) || 
                            item.sku.toLowerCase().includes(modalSearchQuery.toLowerCase())
                          )
                          .map((item, idx) => {
                            const actualIdx = invFormData.items.findIndex(el => el.productId === item.productId);
                            const ecart = item.stockPhysique - item.stockTheorique;
                            const isConforme = ecart === 0;
                            const isMinor = Math.abs(ecart) <= 5 && ecart !== 0;

                            let statusColorClass = 'text-red-600 bg-red-50 border-red-100';
                            let statusText = 'Écart Majeur';
                            if (isConforme) {
                              statusColorClass = 'text-green-600 bg-green-50 border-green-100';
                              statusText = 'Conforme';
                            } else if (isMinor) {
                              statusColorClass = 'text-orange-600 bg-orange-50 border-orange-100';
                              statusText = 'Écart Mineur';
                            }

                            return (
                              <tr key={item.productId} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-3">
                                  <p className="font-bold text-gray-900">{item.productName}</p>
                                  <p className="text-[9px] text-gray-400 font-mono">{item.sku}</p>
                                </td>
                                <td className="px-4 py-3 text-center font-bold text-gray-500">
                                  {item.stockTheorique} {item.unit}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <input 
                                    type="number"
                                    min="0"
                                    value={item.stockPhysique}
                                    onChange={e => {
                                      const updated = [...invFormData.items];
                                      updated[actualIdx] = {
                                        ...updated[actualIdx],
                                        stockPhysique: Number(e.target.value)
                                      };
                                      setInvFormData({ ...invFormData, items: updated });
                                    }}
                                    className="w-20 px-2 py-1 text-center font-black border border-gray-200 rounded-lg outline-none bg-gray-50 focus:bg-white focus:border-orange-500"
                                  />
                                </td>
                                <td className="px-4 py-3 text-center font-black">
                                  <span className={ecart > 0 ? 'text-green-600' : ecart < 0 ? 'text-red-500' : 'text-gray-400'}>
                                    {ecart > 0 ? `+${ecart}` : ecart}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className={`px-2 py-1 border rounded-lg text-[9px] font-black uppercase tracking-wider ${statusColorClass}`}>
                                    {statusText}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  {/* Stock adjust sync toggle */}
                  <div className="bg-orange-50/50 border border-orange-100 p-4 rounded-2xl flex items-start gap-3">
                    <input 
                      type="checkbox"
                      id="autoAdjustStock"
                      checked={invFormData.autoAdjustStock}
                      onChange={e => setInvFormData({ ...invFormData, autoAdjustStock: e.target.checked })}
                      className="mt-1 w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500 accent-orange-500"
                    />
                    <div>
                      <label htmlFor="autoAdjustStock" className="text-xs font-black text-orange-950 uppercase tracking-wider block cursor-pointer">
                        Ajuster automatiquement les stocks système
                      </label>
                      <p className="text-[10px] text-orange-700/80 mt-1 font-medium">
                        Si coché, les stocks réels comptés remplaceront directement les valeurs en base pour tous les produits modifiés lors de l'enregistrement de ce rapport.
                      </p>
                    </div>
                  </div>

                </div>

                {/* Footer buttons */}
                <div className="p-6 border-t border-gray-100 flex gap-3 bg-gray-50/50">
                  <button 
                    type="button" 
                    onClick={() => setIsInvModalOpen(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-900 rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-gray-200 transition-all active:scale-95"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-orange-600 text-white rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-orange-700 hover:shadow-2xl hover:shadow-orange-600/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={16} />
                    Enregistrer l'inventaire
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL: DÉTAILS D'UN INVENTAIRE --- */}
      <AnimatePresence>
        {selectedInventory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" 
              onClick={() => setSelectedInventory(null)} 
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="relative bg-white w-full h-full sm:max-w-3xl sm:h-[80vh] sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 sm:p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight">Détails d'Inventaire</h2>
                  <p className="text-gray-500 font-medium text-xs mt-1">
                    Inventaire {selectedInventory.periodType === 'daily' ? 'journalier' : 'périodique'} du {new Date(selectedInventory.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <button onClick={() => setSelectedInventory(null)} className="p-2 hover:bg-white hover:shadow-lg rounded-full transition-all group">
                  <X size={20} className="text-gray-300 group-hover:text-gray-900" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
                
                {/* Meta details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100 text-xs">
                  <div>
                    <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Auteur</p>
                    <p className="font-bold text-gray-900 mt-1">{selectedInventory.createdByName || 'Admin'}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Période</p>
                    <p className="font-bold text-gray-900 mt-1">
                      {selectedInventory.periodType === 'daily' ? 'Journalier' : 'Périodique'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Dates de l'Inventaire</p>
                    <p className="font-bold text-gray-900 mt-1">
                      {new Date(selectedInventory.startPeriod).toLocaleDateString('fr-FR')} 
                      {selectedInventory.periodType !== 'daily' && ` au ${new Date(selectedInventory.endPeriod).toLocaleDateString('fr-FR')}`}
                    </p>
                  </div>
                </div>

                {selectedInventory.notes && (
                  <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl text-xs">
                    <p className="font-bold text-yellow-850 uppercase tracking-wider text-[9px] mb-1">Notes</p>
                    <p className="text-yellow-900 font-medium">{selectedInventory.notes}</p>
                  </div>
                )}

                {/* Items counting representation table */}
                <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-3 font-bold text-gray-500 uppercase tracking-wider">SKU / Produit</th>
                        <th className="px-5 py-3 font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Catégorie</th>
                        <th className="px-5 py-3 font-bold text-gray-500 uppercase tracking-wider text-center">Théorique</th>
                        <th className="px-5 py-3 font-bold text-gray-500 uppercase tracking-wider text-center">Physique</th>
                        <th className="px-5 py-3 font-bold text-gray-500 uppercase tracking-wider text-center">Écart</th>
                        <th className="px-5 py-3 font-bold text-gray-500 uppercase tracking-wider text-right">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(selectedInventory.items || []).map((item: any) => {
                        const ecart = item.stockPhysique - item.stockTheorique;
                        const isPerfect = ecart === 0;
                        const isMinor = Math.abs(ecart) <= 5 && ecart !== 0;

                        let colorClass = 'text-red-600 bg-red-50 border-red-100';
                        let label = 'Écart Majeur';
                        if (isPerfect) {
                          colorClass = 'text-green-600 bg-green-50 border-green-100';
                          label = 'Conforme';
                        } else if (isMinor) {
                          colorClass = 'text-orange-600 bg-orange-50 border-orange-100';
                          label = 'Écart Mineur';
                        }

                        return (
                          <tr key={item.productId} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-5 py-3">
                              <p className="font-bold text-gray-900">{item.productName}</p>
                              <p className="text-[9px] text-gray-400 font-mono">{item.sku}</p>
                            </td>
                            <td className="px-5 py-3 hidden sm:table-cell text-gray-500">
                              {item.category || 'Général'}
                            </td>
                            <td className="px-5 py-3 text-center font-bold text-gray-400">
                              {item.stockTheorique} {item.unit}
                            </td>
                            <td className="px-5 py-3 text-center font-bold text-gray-900">
                              {item.stockPhysique} {item.unit}
                            </td>
                            <td className="px-5 py-3 text-center font-black">
                              <span className={ecart > 0 ? 'text-green-600' : ecart < 0 ? 'text-red-500' : 'text-gray-400'}>
                                {ecart > 0 ? `+${ecart}` : ecart}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span className={`px-2.5 py-1 border rounded-lg text-[9px] font-black uppercase tracking-wider ${colorClass}`}>
                                {label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

              </div>

              {/* Footer actions */}
              <div className="p-6 border-t border-gray-100 flex gap-3 bg-gray-50/50 justify-between items-center">
                <div className="flex gap-2">
                  <button 
                    onClick={() => exportInventoryPDF(selectedInventory)}
                    className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 transition-colors font-bold text-xs flex items-center gap-1.5"
                  >
                    <FileText size={16} />
                    Exporter PDF
                  </button>
                  <button 
                    onClick={() => exportInventoryExcel(selectedInventory)}
                    className="px-4 py-2 bg-green-50 text-green-700 border border-green-100 rounded-xl hover:bg-green-100 transition-colors font-bold text-xs flex items-center gap-1.5"
                  >
                    <FileSpreadsheet size={16} />
                    Exporter Excel
                  </button>
                </div>
                <button 
                  onClick={() => setSelectedInventory(null)}
                  className="px-6 py-2 bg-gray-900 text-white rounded-xl font-bold text-xs hover:bg-gray-800 transition-colors uppercase tracking-wider"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Product Add/Edit Modal (existing logic preserved) */}
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
              className="relative bg-white w-full h-full sm:h-auto sm:max-w-lg sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 sm:p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                    {editingProduct ? 'Modifier Produit' : 'Nouveau Produit'}
                  </h2>
                  <p className="text-gray-500 font-medium italic text-xs mt-1">Gérez les informations de votre stock.</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white hover:shadow-lg rounded-full transition-all group">
                  <X size={20} className="text-gray-300 group-hover:text-gray-900" />
                </button>
              </div>

              <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Nom du Produit</label>
                    <input 
                      required
                      type="text" 
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      autoFocus
                      className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-xl font-bold focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-50/50 transition-all outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Code Barre</label>
                    <input 
                      type="text" 
                      placeholder=""
                      value={formData.barcode}
                      onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                      className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-xl font-bold focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-50/50 transition-all outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Prix de Vente (FCFA)</label>
                    <input 
                      required 
                      type="number" 
                      value={formData.price}
                      onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                      className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-xl font-black text-base focus:bg-white focus:border-green-500 focus:ring-4 focus:ring-green-50/50 transition-all outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Prix d'Achat (FCFA)</label>
                    <input 
                      required 
                      type="number" 
                      value={formData.costPrice}
                      onChange={e => setFormData({ ...formData, costPrice: Number(e.target.value) })}
                      className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-xl font-black text-base focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-50/50 transition-all outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Stock Initial</label>
                    <input 
                      required 
                      type="number" 
                      value={formData.stock}
                      onChange={e => setFormData({ ...formData, stock: Number(e.target.value) })}
                      className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-xl font-bold focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 transition-all outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Seuil d'Alerte</label>
                    <input 
                      required 
                      type="number" 
                      value={formData.lowStockThreshold}
                      onChange={e => setFormData({ ...formData, lowStockThreshold: Number(e.target.value) })}
                      className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-xl font-bold focus:bg-white focus:border-yellow-500 focus:ring-4 focus:ring-yellow-50/50 transition-all outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Unité</label>
                    <select 
                      value={formData.unit}
                      onChange={e => setFormData({ ...formData, unit: e.target.value as any })}
                      className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-xl font-bold focus:bg-white focus:border-gray-500 focus:ring-4 focus:ring-gray-50/50 transition-all outline-none appearance-none"
                    >
                      <option value="pcs">Pièces (pcs)</option>
                      <option value="kg">Kilogrammes (kg)</option>
                      <option value="g">Grammes (g)</option>
                      <option value="l">Litres (l)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Date d'Expiration</label>
                    <input 
                      type="date" 
                      max="9999-12-31"
                      value={formData.expiryDate}
                      onChange={e => {
                        let val = e.target.value;
                        const parts = val.split('-');
                        if (parts[0] && parts[0].length > 4) {
                          parts[0] = parts[0].slice(0, 4);
                          val = parts.join('-');
                        }
                        setFormData({ ...formData, expiryDate: val });
                      }}
                      className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-xl font-bold focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-50/50 transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-6 mt-6 border-t border-gray-100">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-900 rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-gray-200 transition-all active:scale-95"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-orange-600 text-white rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-orange-700 hover:shadow-2xl hover:shadow-orange-600/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Check size={16} />
                    {editingProduct ? 'Enregistrer' : 'Ajouter au Stock'}
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
