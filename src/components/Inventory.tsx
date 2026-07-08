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
  Check
} from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../services/db';
import { Product, Unit } from '../types';
import { logAction, AuditAction } from '../services/audit';

import { AppContext } from '../App';

export default function Inventory() {
  const { userRole, searchQuery, hasPermission, verifyAction, userProfile } = useContext(AppContext);
  const isCashier = userRole === 'cashier';
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  // Form State
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

  const isSuperAdmin = ['anges.gildas@gmail.com', 'gildas@gmail.com'].includes((auth.currentUser?.email || '').trim().toLowerCase());

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

  return (
    <div className="space-y-8">
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
          <div className="flex gap-2">
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
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">Inventaire</h1>
          <p className="text-gray-500 font-medium">Gérez vos produits et niveaux de stock.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition-colors">
            <Download size={20} />
            Exporter
          </button>
          {!isCashier && hasPermission('inventory', 'create') && (
            <button 
              onClick={() => { resetForm(); setIsModalOpen(true); }}
              className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20"
            >
              <Plus size={20} />
              Ajouter un Produit
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm justify-end">
        <button className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-xl font-bold text-gray-700 hover:bg-gray-100 transition-colors">
          <Filter size={20} />
          Filtres
        </button>
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
                <th className="px-8 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right sm:text-left">Prix</th>
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
                       <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${product.stock > (product.lowStockThreshold || 10) ? 'bg-green-500' : 'bg-red-500'}`} />
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
            </tbody>
          </table>
        </div>
        
        {/* Pagination placeholder */}
        <div className="px-8 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">Affichage de 1 à {filteredProducts.length} sur {products.length} produits</p>
          <div className="flex items-center gap-2">
            <button className="p-2 border border-gray-200 rounded-lg disabled:opacity-50" disabled><ChevronLeft size={16} /></button>
            <button className="p-2 border border-gray-200 rounded-lg disabled:opacity-50" disabled><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {/* Modernized Modal */}
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
