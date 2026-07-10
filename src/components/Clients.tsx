import React, { useState, useEffect, useContext } from 'react';
import { 
  Users, Search, Plus, User, Phone, 
  Trash2, Edit, Save, X, PhoneCall, 
  Calendar, ShoppingBag, TrendingUp,
  Share2, MessageSquare, Download,
  ExternalLink, FileText, MoreVertical,
  QrCode, UserPlus
} from 'lucide-react';
import { 
  collection, query, onSnapshot, 
  addDoc, updateDoc, deleteDoc, doc, 
  serverTimestamp, orderBy, getDocs, limit, where, writeBatch
} from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { AppContext } from '../App';
import { Client, Sale } from '../types';
import { handleFirestoreError, OperationType } from '../services/db';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export default function Clients() {
  const { language, searchQuery, hasPermission, settings, setPreselectedClient, verifyAction, userProfile } = useContext(AppContext);
  const [clients, setClients] = useState<Client[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    phone: '+228 ',
  });

  useEffect(() => {
    if (!userProfile?.storeId) {
      if (userProfile) setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'clients'), 
      where('storeId', '==', userProfile.storeId)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const clientsData = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Client[];
      
      // Sort in memory to avoid missing composite index requirement
      const sorted = clientsData.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return dateB - dateA;
      });

      setClients(sorted);
      setLoading(false);
    }, (error) => {
      console.error("Error watching clients:", error);
      setLoading(false);
    });
    return unsubscribe;
  }, [userProfile?.storeId]);

  const filteredClients = clients.filter(c => {
    const name = c.name || '';
    const phone = c.phone || '';
    const matricule = c.matricule || '';
    const query = (searchQuery || '').toLowerCase();
    
    return name.toLowerCase().includes(query) ||
           phone.includes(query) ||
           matricule.toLowerCase().includes(query);
  });

  const generateMatricule = (storeName: string, count: number) => {
    const initials = storeName.substring(0, 3).toUpperCase().padEnd(3, 'X');
    const number = (count + 1).toString().padStart(4, '0');
    return `${initials}-C${number}`;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const action = editingClient ? 'update' : 'create';
    
    if (!hasPermission('clients', action)) {
      alert("Permission refusée.");
      return;
    }

    try {
      if (!userProfile?.storeId) {
        throw new Error("ID de boutique manquant. Veuillez vous reconnecter.");
      }
      const data: any = {
        name: formData.name,
        phone: formData.phone.trim(),
        updatedAt: serverTimestamp(),
      };

      if (editingClient) {
        await updateDoc(doc(db, 'clients', editingClient.id), data);
      } else {
        const matricule = generateMatricule(settings?.name || 'MKT', clients.length);
        await addDoc(collection(db, 'clients'), {
          ...data,
          storeId: userProfile.storeId,
          matricule,
          totalSpent: 0,
          visitsCount: 0,
          createdAt: serverTimestamp(),
        });
      }
      
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'clients');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', phone: '+228 ' });
    setEditingClient(null);
  };

  const handleDelete = async (id: string) => {
    if (!hasPermission('clients', 'delete')) {
      alert("Permission refusée.");
      return;
    }
    
    verifyAction(async () => {
      try {
        await deleteDoc(doc(db, 'clients', id));
      } catch (error) {
        alert("Erreur de suppression.");
      }
    });
  };

  const handleDeleteAllClients = async () => {
    if (!hasPermission('clients', 'delete')) {
      alert("Permission refusée.");
      return;
    }

    if (clients.length === 0) {
      alert("Aucun client à supprimer.");
      return;
    }

    verifyAction(async () => {
      try {
        setLoading(true);
        const docsToDelete = [...clients];
        
        // Firestore batch limit is 500
        for (let i = 0; i < docsToDelete.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = docsToDelete.slice(i, i + 500);
          chunk.forEach(client => {
            batch.delete(doc(db, 'clients', client.id));
          });
          await batch.commit();
        }
        
        alert(`${docsToDelete.length} clients ont été supprimés avec succès.`);
      } catch (error) {
        console.error("Error deleting all clients:", error);
        alert("Une erreur est survenue lors de la suppression massive.");
      } finally {
        setLoading(false);
      }
    });
  };

  const exportToGoogleContacts = () => {
    const headers = ["Name", "Given Name", "Family Name", "Phone 1 - Type", "Phone 1 - Value", "Notes"];
    const rows = clients.map(c => [
      c.name || '',
      (c.name || '').split(' ')[0] || '',
      (c.name || '').split(' ').slice(1).join(' ') || '',
      "Mobile",
      c.phone || '',
      `Matricule: ${c.matricule || 'N/A'} - Store: ${settings?.name || 'POS'}`
    ]);

    const csvContent = [headers, ...rows]
      .map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `google_contacts_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importFromGoogleContacts = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/contacts.readonly');
      // Ensure account selection screen appears
      provider.setCustomParameters({ prompt: 'select_account' });
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;

      if (!accessToken) {
        throw new Error("Impossible d'obtenir le jeton d'accès Google.");
      }

      setLoading(true);
      console.log("Fetching contacts from Google People API...");
      
      // Fetch contacts from Google People API
      const response = await fetch('https://people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers&pageSize=1000', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Erreur inconnue' }));
        console.error("Google People API Error Response:", errorData);
        throw new Error(`Erreur Google API (${response.status}): ${errorData.error?.message || errorData.message || 'Impossible de récupérer les contacts'}`);
      }

      const data = await response.json();
      const connections = data.connections || [];
      
      let importCount = 0;
      let skipCount = 0;

      for (const person of connections) {
        const name = person.names?.[0]?.displayName || 'Contact Sans Nom';
        const phone = person.phoneNumbers?.[0]?.canonicalForm || person.phoneNumbers?.[0]?.value || '';

        if (!phone) {
          skipCount++;
          continue;
        }

        // Avoid exact matches in current state
        const sanitizedPhone = phone.replace(/\s+/g, '');
        const isDuplicate = clients.some(c => (c.phone || '').replace(/\s+/g, '') === sanitizedPhone);
        
        if (isDuplicate) {
          skipCount++;
          continue;
        }

        const matricule = generateMatricule(settings?.name || 'MKT', clients.length + importCount);
        
        if (!userProfile?.storeId) break;

        await addDoc(collection(db, 'clients'), {
          name,
          phone,
          storeId: userProfile.storeId,
          matricule,
          totalSpent: 0,
          visitsCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        importCount++;
      }

      setLoading(false);
      alert(`${importCount} nouveaux clients importés avec succès ! (${skipCount} ignorés car sans numéro ou déjà existants)`);
    } catch (error: any) {
      setLoading(false);
      console.error("Google Import Error:", error);
      if (error.code === 'auth/network-request-failed' || (error.message && error.message.includes('network-request-failed'))) {
        alert("L'importation des contacts Google a échoué (Erreur réseau/iframe).\n\n" +
              "Ce problème se produit car l'application s'exécute dans un iframe de prévisualisation (comme celle d'AI Studio) qui restreint l'accès aux cookies tiers et aux pop-ups.\n\n" +
              "Pour utiliser cette fonctionnalité, veuillez ouvrir l'application dans un nouvel onglet complet à l'aide de l'icône de redirection en haut à droite.");
      } else if (error.code === 'auth/popup-blocked') {
        alert("Veuillez autoriser les popups pour vous connecter à Google.");
      } else {
        alert(`${error.message || "Erreur lors de l'importation. Assurez-vous d'avoir autorisé l'accès en lecture aux contacts."}`);
      }
    }
  };

  const shareLastReceipt = async (client: Client) => {
    try {
      if (!userProfile?.storeId) {
        throw new Error("ID de boutique manquant. Veuillez vous reconnecter.");
      }
      // Find last sale for this client in this store
      const q = query(
        collection(db, 'sales'), 
        where('storeId', '==', userProfile.storeId),
        where('clientId', '==', client.id),
        orderBy('timestamp', 'desc'), 
        limit(1)
      );
      // In a real app we'd filter by clientId, but let's assume we want to send the very last receipt if called
      // Better: filter by clientId in query if indexed
      const snap = await getDocs(q);
      const lastSale = snap.docs[0]?.data() as Sale;
      
      if (!lastSale) {
        alert("Aucun achat récent trouvé pour ce client.");
        return;
      }

      const phone = client.phone.replace(/\s+/g, '').replace('+', '');
      const message = `Bonjour ${client.name},\nVoici le résumé de votre dernier achat chez ${settings?.name || 'SUPERMARKET'}.\nTotal: ${lastSale.totalAmount.toLocaleString()} FCFA.\nMerci de votre fidélité !`;
      
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
    } catch (error) {
      console.error(error);
      alert("Erreur lors du partage.");
    }
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString('de-DE') + ' FCFA';
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Clients</h1>
          <p className="text-slate-500 font-medium mt-1">Base de données ({clients.length} clients enregistrés)</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={importFromGoogleContacts}
            className="px-6 py-4 bg-white text-orange-600 rounded-2xl border border-orange-100 flex items-center gap-2 font-black hover:bg-orange-50 active:scale-95 transition-all text-[10px] uppercase tracking-widest shadow-sm"
          >
            <Share2 size={18} />
            Importer Google
          </button>
           <button 
            onClick={exportToGoogleContacts}
            className="px-6 py-4 bg-white text-slate-400 rounded-2xl border border-slate-100 flex items-center gap-2 font-bold hover:bg-slate-50 active:scale-95 transition-all text-[10px] uppercase tracking-widest"
          >
            <Download size={18} />
            CSV
          </button>
          {hasPermission('clients', 'delete') && clients.length > 0 && (
            <button 
              onClick={handleDeleteAllClients}
              className="px-6 py-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-center gap-2 font-black hover:bg-red-100 active:scale-95 transition-all text-[10px] uppercase tracking-widest shadow-sm"
            >
              <Trash2 size={18} />
              Supprimer Tout
            </button>
          )}
          {hasPermission('clients', 'create') && (
            <button 
              onClick={() => { resetForm(); setIsModalOpen(true); }}
              className="flex items-center gap-3 px-8 py-4 bg-orange-600 text-white rounded-[24px] font-black uppercase tracking-widest text-[11px] hover:bg-orange-700 transition-all shadow-xl shadow-orange-600/20 active:scale-95"
            >
              <UserPlus size={18} strokeWidth={3} />
              Ajouter
            </button>
          )}
        </div>
      </div>

      {/* Clients Table Layout */}
      <div className="bg-white rounded-[40px] border border-slate-50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Matricule</th>
                <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</th>
                <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact</th>
                <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Dépenses Totales</th>
                <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Dernière Visite</th>
                <th className="px-8 py-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <AnimatePresence>
                {filteredClients.map((client) => (
                  <motion.tr 
                    layout
                    key={client.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="group hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-8 py-6">
                      <span className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black tracking-wider uppercase group-hover:bg-orange-100 group-hover:text-orange-600 transition-colors">
                        {client.matricule || '---'}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                          <User size={18} />
                        </div>
                        <div>
                          <p className="font-black text-slate-900 leading-tight">{client.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{client.visitsCount || 0} visites</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <a href={`tel:${client.phone}`} className="text-sm font-bold text-slate-600 hover:text-orange-500 transition-colors flex items-center gap-2">
                        <Phone size={14} className="text-slate-300" />
                        {client.phone}
                      </a>
                    </td>
                    <td className="px-8 py-6">
                      <p className="font-black text-slate-900">{formatCurrency(client.totalSpent || 0)}</p>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-xs font-bold text-slate-400">
                        {client.lastVisit ? new Date(client.lastVisit.seconds * 1000).toLocaleDateString() : 'Première visite'}
                      </p>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => {
                            setPreselectedClient(client);
                            navigate('/pos');
                          }}
                          title="Nouvelle Commande"
                          className="p-2.5 bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-600 hover:text-white transition-all"
                        >
                          <ShoppingBag size={18} />
                        </button>
                        <button 
                          onClick={() => shareLastReceipt(client)}
                          title="Envoyer Reçu WhatsApp"
                          className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"
                        >
                          <MessageSquare size={18} />
                        </button>
                        <div className="w-px h-6 bg-slate-100 mx-2" />
                        <button 
                          onClick={() => {
                            setEditingClient(client);
                            setFormData({ name: client.name, phone: client.phone });
                            setIsModalOpen(true);
                          }}
                          className="p-2.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                        >
                          <Edit size={18} />
                        </button>
                        <button 
                          onClick={() => handleDelete(client.id)}
                          className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[40px] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-slate-50 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
                      <Plus size={24} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-slate-900">{editingClient ? 'Modifier Client' : 'Nouveau Client'}</h2>
                      <p className="text-slate-500 text-sm font-medium">Saisissez les informations du client</p>
                    </div>
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="p-3 bg-white text-slate-400 rounded-2xl hover:text-slate-600 hover:shadow-sm transition-all shadow-sm border border-slate-100">
                    <X size={20} />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSave} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nom Complet</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input 
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Jean Dupont"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:bg-white focus:border-orange-500/30 focus:ring-4 focus:ring-orange-500/5 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Téléphone (+228)</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input 
                      type="text"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:bg-white focus:border-orange-500/30 focus:ring-4 focus:ring-orange-500/5 transition-all"
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-[22px] font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-orange-600 text-white rounded-[22px] font-black uppercase tracking-widest text-[11px] hover:bg-orange-700 transition-all shadow-xl shadow-orange-600/20 active:scale-95"
                  >
                    {editingClient ? 'Modifier' : 'Créer Client'}
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
