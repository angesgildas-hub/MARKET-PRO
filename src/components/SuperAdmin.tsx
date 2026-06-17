import React, { useState, useEffect } from 'react';
import { 
  collection, query, getDocs, getDoc, doc, updateDoc, setDoc,
  onSnapshot, orderBy, where, deleteDoc, Timestamp,
  serverTimestamp, limit
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, Users, Store, Calendar, 
  CheckCircle2, XCircle, AlertTriangle, 
  Search, RefreshCcw, Power, Trash2, 
  Activity, ArrowRight, Mail, Phone, MapPin, User, Globe, History, Lock, Link, Terminal
} from 'lucide-react';
import { StoreSettings, UserProfile } from '../types';

export default function SuperAdmin() {
  const [stores, setStores] = useState<StoreSettings[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [globalSales, setGlobalSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState<StoreSettings | null>(null);
  const [isCreatingStore, setIsCreatingStore] = useState(false);
  const [editingAdminUser, setEditingAdminUser] = useState<UserProfile | null>(null);
  const [editedAdminEmail, setEditedAdminEmail] = useState('');
  const [editedAdminPassword, setEditedAdminPassword] = useState('');
  const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);
  const [newStoreData, setNewStoreData] = useState({ name: '', adminEmail: '', password: '', address: '', phone: '' });
  const [systemConfig, setSystemConfig] = useState<any>(null);
  const [domainUrl, setDomainUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'stores' | 'users' | 'connections' | 'saas' | 'redirection' | 'emails'>('stores');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [connectionLogs, setConnectionLogs] = useState<any[]>([]);
  const [systemNotifications, setSystemNotifications] = useState<any[]>([]);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [emailSearchQuery, setEmailSearchQuery] = useState('');
  const [logsLimit, setLogsLimit] = useState<number>(100);

  // SaaS Integration states
  const [saasUrl, setSaasUrl] = useState('');
  const [saasToken, setSaasToken] = useState('');
  const [saasSyncEnabled, setSaasSyncEnabled] = useState(false);
  const [isSyncingSaaS, setIsSyncingSaaS] = useState(false);
  const [saasSyncLogs, setSaasSyncLogs] = useState<Array<{
    timestamp: string;
    type: string;
    payload: any;
    status: 'success' | 'error';
    details: string;
  }>>([]);

  // States for interactive Store Editing
  const [editingStoreInfo, setEditingStoreInfo] = useState(false);
  const [editedStoreName, setEditedStoreName] = useState('');
  const [editedStorePhone, setEditedStorePhone] = useState('');
  const [editedStoreAddress, setEditedStoreAddress] = useState('');
  const [editedStoreParentId, setEditedStoreParentId] = useState('');

  // Annex state for SuperAdmin creation
  const [newAnnexeName, setNewAnnexeName] = useState('');
  const [newAnnexeZone, setNewAnnexeZone] = useState('');
  const [newAnnexeAddress, setNewAnnexeAddress] = useState('');
  const [newAnnexePhone, setNewAnnexePhone] = useState('');

  useEffect(() => {
    if (selectedStore) {
      setEditedStoreName(selectedStore.name || '');
      setEditedStorePhone(selectedStore.phone || '');
      setEditedStoreAddress(selectedStore.address || '');
      setEditedStoreParentId((selectedStore as any).parentStoreId || '');
      setEditingStoreInfo(false);
    } else {
      setEditingStoreInfo(false);
    }
  }, [selectedStore]);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'info' | 'error';
  } | null>(null);

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(null);
      },
      onCancel: () => setConfirmModal(null)
    });
  };

  const showAlert = (message: string, type: 'success' | 'info' | 'error' = 'info', title?: string) => {
    setAlertModal({
      isOpen: true,
      title: title || (type === 'error' ? 'Erreur' : type === 'success' ? 'Succès' : 'Information'),
      message,
      type
    });
  };

  useEffect(() => {
    // Subscription for connectionHistory logs (accessible only by bootstrap admin)
    const logsQuery = query(
      collection(db, 'connectionHistory'), 
      orderBy('timestamp', 'desc'), 
      limit(logsLimit)
    );
    const unsubConnections = onSnapshot(logsQuery, (snap) => {
      console.log("SuperAdmin: Fetched connection logs in real-time:", snap.size);
      const logsList = snap.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setConnectionLogs(logsList);
    }, (err) => {
      console.warn("Unable to fetch connection histories, probably current user is not bootstrap admin or rules not deployed yet:", err);
    });

    // Subscription for system SMTP and notifications logs
    const notificationsQuery = query(
      collection(db, 'systemNotifications'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    const unsubNotifications = onSnapshot(notificationsQuery, (snap) => {
      console.log("SuperAdmin: Fetched system notifications:", snap.size);
      const list = snap.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setSystemNotifications(list);
    }, (err) => {
      console.warn("Unable to fetch system notifications:", err);
    });

    return () => {
      unsubConnections();
      unsubNotifications();
    };
  }, [logsLimit]);

  useEffect(() => {
    setLoading(true);
    // Real-time listener for system config
    const unsubConfig = onSnapshot(doc(db, 'systemConfig', 'globals'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSystemConfig(data);
        if (data.publicAccessUrl) setDomainUrl(data.publicAccessUrl);
        if (data.saasApiUrl) setSaasUrl(data.saasApiUrl);
        if (data.saasApiToken) setSaasToken(data.saasApiToken);
        setSaasSyncEnabled(!!data.saasSyncEnabled);
      } else {
        // Initialize if not exists
        setSystemConfig({ isGoogleLoginEnabled: true });
      }
    }, (error) => {
      console.warn("Error subscribing to global system config:", error);
    });

    // Real-time listener for all stores
    const unsubStores = onSnapshot(collection(db, 'storeSettings'), (snap) => {
      console.log("SuperAdmin: Fetched stores:", snap.size);
      const storesList = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as StoreSettings));
      setStores(storesList);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching stores:", err);
      // If we get a permission error, it's a sign that isBootstrapAdmin is false for this user
      if (err.message.includes('permission')) {
        alert("Accès refusé aux boutiques. Vérifiez vos privilèges administrateur (Email: " + auth.currentUser?.email + ")");
      }
      setLoading(false);
    });

    // Real-time listener for all users (global)
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      console.log("SuperAdmin: Fetched users:", snap.size);
      const usersList = snap.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile));
      setAllUsers(usersList);
    }, (err) => {
      console.error("Error fetching global users:", err);
      // If we get a permission error, it's a sign that isBootstrapAdmin is false for this user
      if (err.message.includes('permission')) {
        alert("Accès refusé aux utilisateurs globaux. Vérifiez vos privilèges administrateur.");
      }
    });

    // Real-time listener for all sales globally
    const unsubSales = onSnapshot(collection(db, 'sales'), (snap) => {
      console.log("SuperAdmin: Fetched global sales transactions:", snap.size);
      const salesList = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setGlobalSales(salesList);
    }, (err) => {
      console.warn("Unable to fetch global sales in real-time:", err);
    });

    return () => {
      unsubConfig();
      unsubStores();
      unsubUsers();
      unsubSales();
    };
  }, []);

  const handleToggleGoogleLogin = async () => {
    try {
      const configRef = doc(db, 'systemConfig', 'globals');
      await setDoc(configRef, { 
        isGoogleLoginEnabled: !systemConfig?.isGoogleLoginEnabled,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err: any) {
      console.error("Error toggling google login:", err);
      alert("Erreur lors de la modification de la configuration : " + (err?.message || err || "Erreur inconnue"));
    }
  };

  const handleToggleRegistration = async () => {
    try {
      const configRef = doc(db, 'systemConfig', 'globals');
      await setDoc(configRef, { 
        isRegistrationEnabled: systemConfig?.isRegistrationEnabled === false ? true : false,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err: any) {
      console.error("Error toggling registration:", err);
      alert("Erreur lors de la modification de la configuration : " + (err?.message || err || "Erreur inconnue"));
    }
  };

  const handleUpdateDomainConfig = async (url: string, enabled: boolean | undefined) => {
    try {
      const configRef = doc(db, 'systemConfig', 'globals');
      await setDoc(configRef, { 
        publicAccessUrl: url,
        isAutoRedirectEnabled: enabled ?? false,
        updatedAt: serverTimestamp()
      }, { merge: true });
      alert("Configuration du domaine mise à jour.");
    } catch (err: any) {
      console.error("Error updating domain config:", err);
      alert("Erreur lors de la mise à jour : " + (err?.message || err || "Erreur inconnue"));
    }
  };

  const handleUpdateSaaSConfig = async (url: string, token: string, syncEnabled: boolean) => {
    try {
      const configRef = doc(db, 'systemConfig', 'globals');
      await setDoc(configRef, { 
        saasApiUrl: url.trim(),
        saasApiToken: token.trim(),
        saasSyncEnabled: syncEnabled,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showAlert("Configuration de l'intégration SaaS enregistrée avec succès !", "success");
    } catch (err: any) {
      console.error("Error updating SaaS config:", err);
      showAlert("Erreur lors de la mise à jour de la configuration SaaS : " + (err?.message || err), "error");
    }
  };

  const generateSecureToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = 'saas_';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSaasToken(token);
    showAlert("Nouveau jeton sécurisé généré. N'oubliez pas d'enregistrer la configuration !", "info");
  };

  const handleSyncSnapshotToSaaS = async () => {
    if (!saasUrl) {
      showAlert("Veuillez d'abord configurer une URL d'API SaaS.", "error");
      return;
    }

    setIsSyncingSaaS(true);
    const mockPayload = {
      event: "system_snapshot",
      timestamp: new Date().toISOString(),
      appletId: "c3e161f5-1330-44ff-90f4-f53e4c3b146d",
      source: window.location.origin,
      stats: {
        totalStores: stats.totalStores,
        activeLicenses: stats.activeLicenses,
        expiredLicenses: stats.expiredLicenses,
        suspendedLicenses: stats.suspendedLicenses,
        totalUsers: stats.totalUsers,
        totalGlobalRevenue: stats.totalGlobalRevenue,
        totalGlobalOrders: stats.totalGlobalOrders,
      },
      stores: stores.map(s => {
        const storeUsers = allUsers.filter(u => u.storeId === s.id);
        const storeSales = globalSales.filter(salesDoc => salesDoc.storeId === s.id);
        const storeSalesAmount = storeSales.reduce((acc, salesDoc) => acc + (salesDoc.totalAmount || 0), 0);
        return {
          id: s.id,
          name: s.name,
          address: s.address,
          phone: s.phone,
          licenseStatus: s.licenseStatus,
          licenseExpiry: s.licenseExpiry,
          createdAt: s.createdAt instanceof Timestamp ? s.createdAt.toDate().toISOString() : s.createdAt,
          usersCount: storeUsers.length,
          salesCount: storeSales.length,
          salesAmount: storeSalesAmount
        };
      })
    };

    try {
      const response = await fetch('/api/saas/proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: saasUrl,
          token: saasToken,
          payload: mockPayload
        })
      });

      const result = await response.json();
      
      const logItem = {
        timestamp: new Date().toLocaleTimeString(),
        type: "Manuel / Snapshot Global",
        payload: mockPayload,
        status: result.success ? 'success' as const : 'error' as const,
        details: result.success 
          ? `Réponse positive du SaaS (Status: ${result.status}). Synchronisation réussie !`
          : `Le SaaS a répondu avec une erreur (Status: ${result.status || 500}) : ${result.error || result.response || "Inconnu"}`
      };

      setSaasSyncLogs(prev => [logItem, ...prev].slice(0, 50));

      if (result.success) {
        showAlert("Données synchronisées avec votre SaaS avec succès !", "success");
      } else {
        showAlert(`Synchro SaaS : Le serveur distant a retourné une erreur (Code ${result.status || 'Inconnu'}). Consultez les logs ci-dessous.`, "error");
      }
    } catch (err: any) {
      console.error("Failed to sync snapshot to central SaaS:", err);
      const logItem = {
        timestamp: new Date().toLocaleTimeString(),
        type: "Manuel / Snapshot Global",
        payload: mockPayload,
        status: 'error' as const,
        details: `Erreur fatale lors de la connexion : ${err.message || "Serveur injoignable"}`
      };
      setSaasSyncLogs(prev => [logItem, ...prev].slice(0, 50));
      showAlert("Échec de connexion avec le serveur SaaS. Détails : " + err.message, "error");
    } finally {
      setIsSyncingSaaS(false);
    }
  };

  const sendApprovalEmail = async (userEmail: string, userName: string, storeName: string) => {
    try {
      await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'store_approved',
          data: {
            email: userEmail,
            displayName: userName,
            storeName: storeName
          }
        })
      });
      console.log(`Approval email request sent to ${userEmail} for store "${storeName}".`);
    } catch (err) {
      console.error("Failed to send approval email:", err);
    }
  };

  const handleUpdateLicense = async (storeId: string, status: 'active' | 'expired' | 'suspended', months: number = 0, adminUid?: string) => {
    setLoading(true);
    try {
      const storeRef = doc(db, 'storeSettings', storeId);
      const updates: any = { licenseStatus: status };
      
      if (months > 0) {
        const currentExpiry = new Date();
        currentExpiry.setMonth(currentExpiry.getMonth() + months);
        updates.licenseExpiry = currentExpiry.toISOString();
      }

      await updateDoc(storeRef, updates);

      // If approving, also activate the store admin users
      if (status === 'active') {
        const storeObj = stores.find(s => s.id === storeId);
        const storeName = storeObj?.name || 'Ma Boutique';

        // Direct lookup of the admin user document whose UID is exactly storeId
        const usersToApproveMap = new Map<string, UserProfile>();

        // 0. Explicit adminUid override (most reliable)
        if (adminUid) {
          const matchedUser = allUsers.find(u => u.uid === adminUid);
          if (matchedUser) {
            usersToApproveMap.set(adminUid, matchedUser);
          } else {
            try {
              const uSnap = await getDoc(doc(db, 'users', adminUid));
              if (uSnap.exists()) {
                usersToApproveMap.set(adminUid, { ...uSnap.data(), uid: adminUid } as UserProfile);
              }
            } catch (err) {
              console.warn("Could not fetch explicit admin user doc by adminUid:", err);
            }
          }
        }

        // 1. Check local memory (best effort fallback)
        const stateUsers = allUsers.filter(u => u.storeId === storeId && u.pendingApproval);
        for (const u of stateUsers) {
          usersToApproveMap.set(u.uid, u);
        }

        // 2. Direct document get by ID (where storeId matches the admin's UID)
        try {
          const directUserSnap = await getDoc(doc(db, 'users', storeId));
          if (directUserSnap.exists()) {
            const userData = directUserSnap.data();
            if (userData && (userData.pendingApproval || userData.isActive === false)) {
              usersToApproveMap.set(storeId, { ...userData, uid: storeId } as UserProfile);
            }
          }
        } catch (err) {
          console.warn("Could not fetch user directly by storeId doc ID:", err);
        }

        // 3. Collection query query for store users to make super sure we get them
        try {
          const q = query(collection(db, 'users'), where('storeId', '==', storeId));
          const querySnap = await getDocs(q);
          querySnap.docs.forEach(docSnap => {
            const userData = docSnap.data();
            usersToApproveMap.set(docSnap.id, { ...userData, uid: docSnap.id } as UserProfile);
          });
        } catch (err) {
          console.warn("Could not fetch users directly by storeId query:", err);
        }

        // 4. Update and send notifications
        // Direct forced activation fallback for primary creator UID (which is equal to storeId)
        try {
          const uSnap = await getDoc(doc(db, 'users', storeId));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            usersToApproveMap.set(storeId, { ...uData, uid: storeId } as UserProfile);
          }
        } catch (err) {
          console.warn("Direct lookup of store creator user doc failed:", err);
        }

        // Direct forced activation fallback for explicit admin UID
        if (adminUid && adminUid !== storeId) {
          try {
            const uSnap = await getDoc(doc(db, 'users', adminUid));
            if (uSnap.exists()) {
              const uData = uSnap.data();
              usersToApproveMap.set(adminUid, { ...uData, uid: adminUid } as UserProfile);
            }
          } catch (err) {
            console.warn("Direct lookup of explicit adminUid user doc failed:", err);
          }
        }

        for (const [uid, user] of usersToApproveMap.entries()) {
          await updateDoc(doc(db, 'users', uid), { 
            isActive: true, 
            pendingApproval: false, 
            updatedAt: serverTimestamp()
          });
          // Send approval email directly to user's mailbox (non-blocking)
          sendApprovalEmail(user.email, user.displayName || 'Utilisateur', storeName);
        }
      }

      showAlert("Licence mise à jour avec succès.", "success");
    } catch (error: any) {
      console.error("Error updating license:", error);
      showAlert("Erreur lors de la mise à jour : " + (error?.message || error || "Erreur inconnue"), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveStore = async (storeId: string, adminUid?: string) => {
    showConfirm(
      "Approuver la boutique",
      "Voulez-vous approuver cette boutique et activer son administrateur ?",
      async () => {
        await handleUpdateLicense(storeId, 'active', 12, adminUid);
      }
    );
  };

  const handleRejectStore = async (storeId: string, adminUid?: string) => {
    showConfirm(
      "Rejeter la demande",
      "Voulez-vous rejeter et supprimer définitivement cette demande de boutique ?",
      async () => {
        setLoading(true);
        try {
          // 1. Delete the store settings
          await deleteDoc(doc(db, 'storeSettings', storeId));
          
          // 2. Delete the pending admin user
          if (adminUid) {
            await deleteDoc(doc(db, 'users', adminUid));
          }
          
          // 3. Query and delete any other users that registered under this storeId to protect DB state integrity
          const q = query(collection(db, 'users'), where('storeId', '==', storeId));
          const snaps = await getDocs(q);
          for (const d of snaps.docs) {
            await deleteDoc(d.ref);
          }
          
          showAlert("Demande de boutique rejetée et supprimée avec succès.", "success");
        } catch (err: any) {
          console.error("Error rejecting store request:", err);
          showAlert("Erreur lors du rejet de la boutique : " + (err?.message || err || "Erreur inconnue"), "error");
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleRejectUser = async (userId: string) => {
    showConfirm(
      "Rejeter l'utilisateur",
      "Voulez-vous rejeter cet utilisateur ?",
      async () => {
        setLoading(true);
        try {
          await deleteDoc(doc(db, 'users', userId));
          showAlert("Utilisateur rejeté et supprimé avec succès.", "success");
        } catch (err: any) {
          console.error("Error rejecting user:", err);
          showAlert("Erreur lors du rejet de l'utilisateur : " + (err?.message || err || "Erreur inconnue"), "error");
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', userId), { isActive: !currentStatus });
      showAlert("Statut de l'utilisateur mis à jour.", "success");
    } catch (error: any) {
      console.error("Error toggling user status:", error);
      showAlert("Erreur de mise à jour du statut : " + (error?.message || error || "Erreur inconnue"), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAdminCredentials = async (uid: string, newEmail: string, newPassword?: string) => {
    if (!newEmail) {
      showAlert("L'adresse email est requise.", "error");
      return;
    }
    
    setIsUpdatingCredentials(true);
    try {
      // 1. Update Firestore database doc
      const updates: any = { email: newEmail.trim().toLowerCase() };
      if (newPassword && newPassword.trim()) {
        updates.password = newPassword.trim();
      }
      
      await updateDoc(doc(db, 'users', uid), updates);

      // Refresh local states
      setAllUsers(prev => prev.map(u => u.uid === uid ? { ...u, ...updates } : u));

      // 2. Try updating Auth system credentials using backend API
      try {
        const callerEmail = auth.currentUser?.email;
        const response = await fetch('/api/admin/update-user-auth', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uid,
            email: newEmail.trim().toLowerCase(),
            password: newPassword && newPassword.trim() ? newPassword.trim() : undefined,
            callerEmail
          })
        });

        const authResult = await response.json();
        if (authResult.success) {
          showAlert("Identifiants de l'administrateur mis à jour avec succès !", "success");
        } else {
          showAlert(`${authResult.error || "Erreur Auth"}: ${authResult.details || ""}. Note: Les identifiants ont tout de même été mis à jour en base de données localement.`, "info");
        }
      } catch (authApiErr: any) {
        console.warn("Could not sync with Firebase Auth API, but updated in db:", authApiErr);
        showAlert("Identifiants mis à jour en base de données. Synchro Auth non disponible actuellement.", "success");
      }

      setEditingAdminUser(null);
    } catch (error: any) {
      console.error("Error updating admin credentials:", error);
      showAlert("Erreur lors de la modification : " + (error?.message || "Erreur inconnue"), "error");
    } finally {
      setIsUpdatingCredentials(false);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreData.name || !newStoreData.adminEmail) {
      showAlert("Le nom et l'email admin sont requis.", "error");
      return;
    }

    const passwordVal = newStoreData.password ? newStoreData.password.trim() : "";
    if (passwordVal && passwordVal.length < 6) {
      showAlert("Le mot de passe doit contenir au moins 6 caractères.", "error");
      return;
    }

    setLoading(true);
    try {
      // Generate a unique store ID
      const storeId = 'store_' + Math.random().toString(36).substring(2, 10);
      
      // 1. Create Store Settings
      await setDoc(doc(db, 'storeSettings', storeId), {
        name: newStoreData.name,
        address: newStoreData.address,
        phone: newStoreData.phone,
        licenseStatus: 'active',
        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        currency: 'FCFA',
        updatedAt: serverTimestamp()
      });

      // 2. Create the Admin User in Firebase Auth if a password is provided
      let userId = 'user_' + Math.random().toString(36).substring(2, 10);
      let authCreatedSuccessfully = false;

      if (passwordVal) {
        try {
          const callerEmail = auth.currentUser?.email;
          const authResponse = await fetch('/api/admin/create-user-auth', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: newStoreData.adminEmail.trim().toLowerCase(),
              password: passwordVal,
              displayName: 'Admin ' + newStoreData.name,
              callerEmail
            })
          });

          const authResult = await authResponse.json();
          if (authResult.success && authResult.uid) {
            userId = authResult.uid;
            authCreatedSuccessfully = true;
          } else {
            console.warn("Auth user creation failed in Auth Service, using fallback:", authResult.error);
            const isIdentityToolkitDisabled = 
              authResult.details?.includes("Identity Toolkit API") || 
              authResult.error?.includes("Identity Toolkit API") || 
              authResult.details?.includes("403") || 
              authResult.details?.includes("PERMISSION_DENIED");
            
            if (!isIdentityToolkitDisabled) {
              showAlert(`Création Auth échouée: ${authResult.details || authResult.error || "Erreur"}. Profil créé uniquement localement.`, "info");
            }
          }
        } catch (apiErr: any) {
          console.warn("Could not reach Auth Creation API, falling back to database only:", apiErr);
        }
      }

      // 3. Create/Reserve the Admin User Profile
      // Default permissions
      const defaultPerms = {
        pos: { read: true, create: true, update: true, delete: true },
        inventory: { read: true, create: true, update: true, delete: true },
        accounting: { read: true, create: true, update: true, delete: true },
        settings: { read: true, create: true, update: true, delete: true },
        reports: { read: true, create: true, update: true, delete: true },
        personnel: { read: true, create: true, update: true, delete: true },
        clients: { read: true, create: true, update: true, delete: true },
        sales: { read: true, create: true, update: true, delete: true }
      };

      await setDoc(doc(db, 'users', userId), {
        uid: userId,
        email: newStoreData.adminEmail.toLowerCase(),
        displayName: 'Admin ' + newStoreData.name,
        role: 'admin',
        storeId: storeId,
        isActive: true,
        pendingApproval: false,
        password: passwordVal,
        permissions: defaultPerms,
        createdAt: serverTimestamp()
      });

      if (authCreatedSuccessfully) {
        showAlert(`Boutique "${newStoreData.name}" créée et configurée avec succès ! L'administrateur (${newStoreData.adminEmail}) peut se connecter immédiatement avec le mot de passe défini.`, "success");
      } else {
        showAlert(`Boutique "${newStoreData.name}" créée avec succès. L'administrateur (${newStoreData.adminEmail}) est enregistré en base de données.`, "success");
      }
      setIsCreatingStore(false);
      setNewStoreData({ name: '', adminEmail: '', password: '', address: '', phone: '' });
    } catch (err: any) {
      console.error("Error creating store:", err);
      showAlert("Erreur lors de la création: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveStoreInfo = async () => {
    if (!selectedStore) return;
    try {
      setLoading(true);
      const storeRef = doc(db, 'storeSettings', selectedStore.id);
      const updateData: any = {
        name: editedStoreName,
        phone: editedStorePhone,
        address: editedStoreAddress,
        parentStoreId: editedStoreParentId || null,
        updatedAt: serverTimestamp()
      };
      await updateDoc(storeRef, updateData);
      
      // Update selectedStore in state to reflect change immediately
      setSelectedStore(prev => prev ? {
        ...prev,
        ...updateData
      } : null);
      
      setEditingStoreInfo(false);
      showAlert("Informations de la boutique sauvegardées avec succès.", "success");
    } catch (err: any) {
      console.error("Error updating store info:", err);
      showAlert("Erreur lors de la sauvegarde: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAnnexe = async () => {
    if (!selectedStore) return;
    if (!newAnnexeName.trim() || !newAnnexeZone.trim()) {
      showAlert("Le nom et la zone de l'annexe sont requis.", "error");
      return;
    }

    try {
      setLoading(true);
      const storeRef = doc(db, 'storeSettings', selectedStore.id);
      
      const newAnnexe = {
        id: 'annexe_' + Math.random().toString(36).substring(2, 10),
        name: newAnnexeName.trim(),
        zone: newAnnexeZone.trim(),
        address: newAnnexeAddress.trim(),
        phone: newAnnexePhone.trim(),
        isActive: true,
        createdAt: new Date().toISOString()
      };

      const revisedAnnexes = [...((selectedStore as any).annexes || []), newAnnexe];

      await updateDoc(storeRef, {
        annexes: revisedAnnexes,
        updatedAt: serverTimestamp()
      });

      setSelectedStore(prev => prev ? {
        ...prev,
        annexes: revisedAnnexes
      } : null);

      // Clean inputs
      setNewAnnexeName('');
      setNewAnnexeZone('');
      setNewAnnexeAddress('');
      setNewAnnexePhone('');

      showAlert("Annexe créée avec succès pour cette boutique.", "success");
    } catch (err: any) {
      console.error("Error creating annexe:", err);
      showAlert("Erreur lors de la création de l'annexe: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAnnexe = async (annexeId: string) => {
    if (!selectedStore) return;
    
    showConfirm(
      "Confirmer la suppression",
      "Êtes-vous sûr de vouloir supprimer cette annexe ? Cette action est irréversible.",
      async () => {
        try {
          setLoading(true);
          const storeRef = doc(db, 'storeSettings', selectedStore.id);
          const revisedAnnexes = ((selectedStore as any).annexes || []).filter((a: any) => a.id !== annexeId);

          await updateDoc(storeRef, {
            annexes: revisedAnnexes,
            updatedAt: serverTimestamp()
          });

          setSelectedStore(prev => prev ? {
            ...prev,
            annexes: revisedAnnexes
          } : null);

          showAlert("Annexe supprimée de la boutique.", "success");
        } catch (err: any) {
          console.error("Error deleting annexe:", err);
          showAlert("Erreur lors de la suppression de l'annexe: " + err.message, "error");
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleDeleteStore = async (storeId: string, storeName: string) => {
    // Only the main admin can delete
    if (auth.currentUser?.email !== 'anges.gildas@gmail.com' && auth.currentUser?.email !== 'gildas@gmail.com') {
      showAlert("Accès non autorisé.", "error");
      return;
    }

    showConfirm(
      "Suppression définitive",
      `⚠️ ATTENTION: Vous allez supprimer DÉFINITIVEMENT la boutique "${storeName}". Tous les comptes utilisateurs liés à cette boutique seront révoqués. Cette action est irréversible. Continuer ?`,
      async () => {
        setLoading(true);
        try {
          // 1. Direct collection query and deletion of users belonging to this storeId (bulletproof)
          const q = query(collection(db, 'users'), where('storeId', '==', storeId));
          const snaps = await getDocs(q);
          let deletedUsersCount = 0;
          for (const d of snaps.docs) {
            await deleteDoc(d.ref);
            deletedUsersCount++;
          }
          
          // 2. Delete the store settings
          await deleteDoc(doc(db, 'storeSettings', storeId));
          
          showAlert(`Boutique "${storeName}" et ses ${deletedUsersCount} utilisateur(s) ont été supprimés.`, "success");
        } catch (err: any) {
          console.error("Error deleting store:", err);
          showAlert("Erreur lors de la suppression: " + err.message, "error");
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const pendingStores = stores.filter(s => s.licenseStatus === 'pending');
  const pendingUsers = allUsers.filter(u => u.pendingApproval);

  const filteredStores = stores.filter(s => 
    s.licenseStatus !== 'pending' && (
      s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.id?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const filteredLogs = connectionLogs.filter(log => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.userName?.toLowerCase().includes(q) ||
      log.userEmail?.toLowerCase().includes(q) ||
      log.storeName?.toLowerCase().includes(q) ||
      log.storeId?.toLowerCase().includes(q)
    );
  });

  const stats = {
    totalStores: stores.length,
    activeLicenses: stores.filter(s => {
      const isExpired = s.licenseExpiry ? new Date(s.licenseExpiry) < new Date() : false;
      return s.licenseStatus === 'active' && !isExpired;
    }).length,
    expiredLicenses: stores.filter(s => {
      const isExpiredByDate = s.licenseExpiry ? new Date(s.licenseExpiry) < new Date() : false;
      return s.licenseStatus === 'expired' || (s.licenseStatus === 'active' && isExpiredByDate);
    }).length,
    suspendedLicenses: stores.filter(s => s.licenseStatus === 'suspended').length,
    totalUsers: allUsers.length,
    totalGlobalRevenue: globalSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0),
    totalGlobalOrders: globalSales.length
  };

  const handleSystemReset = async () => {
    if (!confirm("ATTENTION: Vous allez réinitialiser le système COMPLET (toutes les boutiques). Cette action est IRRÉVERSIBLE. Voulez-vous continuer ?")) return;
    
    setLoading(true);
    try {
      const collectionsToEmpty = ['products', 'sales', 'expenses', 'auditLogs', 'employees', 'leaves', 'payroll', 'clients', 'storeSettings', 'users'];
      
      for (const collName of collectionsToEmpty) {
        const snap = await getDocs(collection(db, collName));
        for (const d of snap.docs) {
          // Don't delete ourself!
          if (collName === 'users' && d.id === auth.currentUser?.uid) continue;
          // Don't delete the main store settings if we want to keep it
          // if (collName === 'storeSettings' && d.id === 'main') continue;

          if (collName === 'sales') {
            const itemsSnap = await getDocs(collection(db, `sales/${d.id}/items`));
            for (const idoc of itemsSnap.docs) {
              await deleteDoc(idoc.ref);
            }
          }
          await deleteDoc(d.ref);
        }
      }
      
      alert("Application réinitialisée avec succès !");
      window.location.reload();
    } catch (err: any) {
      console.error("Global Reset Error:", err);
      alert("Erreur lors de la réinitialisation: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  const storeAdminUser = selectedStore ? allUsers.find(u => u.storeId === selectedStore.id && u.role === 'admin') : null;

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight flex items-center gap-3 italic">
            <ShieldAlert className="text-orange-500" size={36} />
            CONTRÔLE GLOBAL
          </h1>
          <p className="text-gray-500 font-bold uppercase tracking-[0.2em] text-[10px] mt-2">Administration Système & Abonnements</p>
        </div>

        <div className="flex items-center gap-4">
           {/* Google Login Toggle */}
           <div className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-4 shadow-sm group relative">
             <div className="flex flex-col">
               <span className="text-[9px] font-black uppercase text-gray-400">Google Auth</span>
               <span className={`text-[10px] font-bold ${systemConfig?.isGoogleLoginEnabled ? 'text-green-500' : 'text-red-500'}`}>
                 {systemConfig?.isGoogleLoginEnabled ? 'ACTIVÉ' : 'DÉSACTIVÉ'}
               </span>
             </div>
             <button 
               onClick={handleToggleGoogleLogin}
               className={`w-12 h-6 rounded-full transition-all relative ${systemConfig?.isGoogleLoginEnabled ? 'bg-green-500' : 'bg-gray-200'}`}
             >
               <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${systemConfig?.isGoogleLoginEnabled ? 'left-7' : 'left-1'}`} />
             </button>
             
             {/* Tooltip */}
             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-[10px] font-bold rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl z-50">
               {systemConfig?.isGoogleLoginEnabled ? 'Désactiver la connexion Google' : 'Activer la connexion Google'}
               <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
             </div>
           </div>

           {/* Registration Toggle */}
           <div className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-4 shadow-sm group relative">
             <div className="flex flex-col">
               <span className="text-[9px] font-black uppercase text-gray-400">Inscription</span>
               <span className={`text-[10px] font-bold ${systemConfig?.isRegistrationEnabled !== false ? 'text-green-500' : 'text-red-500'}`}>
                 {systemConfig?.isRegistrationEnabled !== false ? 'ACTIVÉ' : 'DÉSACTIVÉ'}
               </span>
             </div>
             <button 
               onClick={handleToggleRegistration}
               className={`w-12 h-6 rounded-full transition-all relative ${systemConfig?.isRegistrationEnabled !== false ? 'bg-green-500' : 'bg-gray-200'}`}
             >
               <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${systemConfig?.isRegistrationEnabled !== false ? 'left-7' : 'left-1'}`} />
             </button>

             {/* Tooltip */}
             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-[10px] font-bold rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl z-50">
               {systemConfig?.isRegistrationEnabled !== false ? "Désactiver l'auto-inscription" : "Activer l'auto-inscription"}
               <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
             </div>
           </div>

           {/* Domain Redirection Config */}
           <div className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-6 shadow-sm min-w-[450px]">
             <div className="flex flex-col flex-1">
               <span className="text-[9px] font-black uppercase text-gray-400 mb-1">Redirection Domaine</span>
               <div className="flex items-center gap-2">
                 <input 
                   type="text" 
                   placeholder="https://angesgildas-hub.github.io/market/"
                   value={domainUrl}
                   onChange={(e) => setDomainUrl(e.target.value)}
                   className="text-[10px] font-bold bg-gray-50 px-3 py-1.5 rounded-lg border-none outline-none focus:ring-2 focus:ring-orange-500/20 w-full"
                 />
                 <div className="group relative">
                   <button 
                     onClick={() => handleUpdateDomainConfig(domainUrl, systemConfig?.isAutoRedirectEnabled)}
                     className="p-1.5 bg-orange-500 text-white rounded-lg hover:bg-black transition-all shadow-sm"
                   >
                     <RefreshCcw size={14} />
                   </button>
                   <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-[10px] font-bold rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl z-50">
                     Enregistrer l'URL de redirection
                     <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
                   </div>
                 </div>
               </div>
             </div>
             <div className="flex items-center gap-3 border-l border-gray-100 pl-4 group relative">
                <div className="flex flex-col items-end">
                  <span className="text-[8px] font-black uppercase text-gray-400">Auto-Redirect</span>
                  <span className={`text-[10px] font-bold ${systemConfig?.isAutoRedirectEnabled ? 'text-orange-500' : 'text-gray-400'}`}>
                    {systemConfig?.isAutoRedirectEnabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                <button 
                  onClick={() => handleUpdateDomainConfig(domainUrl, !systemConfig?.isAutoRedirectEnabled)}
                  className={`w-10 h-5 rounded-full transition-all relative ${systemConfig?.isAutoRedirectEnabled ? 'bg-orange-500' : 'bg-gray-200'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${systemConfig?.isAutoRedirectEnabled ? 'left-6' : 'left-1'}`} />
                </button>

                {/* Tooltip */}
                <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-black text-white text-[10px] font-bold rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl z-50">
                   {systemConfig?.isAutoRedirectEnabled ? 'Désactiver la redirection automatique' : 'Activer la redirection automatique'}
                   <div className="absolute top-full right-4 border-4 border-transparent border-t-black" />
                </div>
             </div>
             {systemConfig?.publicAccessUrl && (
               <div className="group relative">
                 <a 
                  href={systemConfig.publicAccessUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 bg-gray-50 text-gray-400 hover:text-orange-600 rounded-xl transition-all block"
                 >
                   <Globe size={18} />
                 </a>
                 <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-[10px] font-bold rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl z-50">
                   Ouvrir le site public
                   <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
                 </div>
               </div>
             )}
           </div>
           
           <div className="group relative">
             <button 
               onClick={handleSystemReset}
               className="px-6 py-4 bg-red-50 text-red-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all flex items-center gap-2 shadow-sm"
             >
               <Trash2 size={18} />
               Réinitialiser Système
             </button>
             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-red-600 text-white text-[10px] font-bold rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl z-50">
               EFFACER TOUTES LES DONNÉES (DANGEREUX)
               <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-red-600" />
             </div>
           </div>

           <div className="group relative">
             <button 
                onClick={() => setIsCreatingStore(true)}
                className="px-6 py-4 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2 shadow-lg shadow-orange-500/20 whitespace-nowrap"
              >
                <Store size={18} />
                Nouvelle Boutique
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-[10px] font-bold rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl z-50">
                 Créer manuellement une boutique
                 <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
              </div>
           </div>

           <div className="relative">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
             <input 
               type="text" 
               placeholder="Rechercher une boutique..."
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="pl-12 pr-6 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm focus:ring-4 focus:ring-orange-500/5 outline-none w-full md:w-80 font-bold transition-all"
             />
           </div>
        </div>
      </div>

      {/* Pending Approvals Section */}
      {(pendingStores.length > 0 || pendingUsers.length > 0) && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-orange-50 p-8 rounded-[40px] border border-orange-100 shadow-xl shadow-orange-500/5 transition-all"
        >
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
               <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-orange-500 shadow-sm border border-orange-100">
                  <User size={24} />
               </div>
               <div>
                  <h2 className="text-xl font-black text-orange-950 tracking-tight uppercase italic">Nouvelles Demandes ({pendingStores.length + pendingUsers.length})</h2>
                  <p className="text-[10px] text-orange-600 font-bold uppercase tracking-widest">En attente d'approbation système</p>
               </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Stores Pending */}
            {pendingStores.map(store => {
               const adminUser = allUsers.find(u => u.storeId === store.id && u.role === 'admin');
               return (
                <div key={`pending-store-${store.id}`} className="bg-white p-6 rounded-[32px] border border-orange-200 shadow-sm hover:shadow-xl transition-all group">
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center overflow-hidden border border-gray-100">
                      {store.logoUrl ? <img src={store.logoUrl} alt="" className="w-full h-full object-cover" /> : <Store size={24} className="text-gray-300" />}
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="px-3 py-1 bg-orange-100 text-orange-600 rounded-full text-[8px] font-black uppercase tracking-widest mb-2">Nouvelle Boutique</span>
                      <p className="text-[9px] font-mono text-gray-400">Ref: {store.id.slice(0, 8)}</p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="font-black text-gray-900 text-lg mb-1">{store.name || 'Boutique en attente'}</h3>
                    <div className="flex flex-col gap-1">
                      {adminUser && (
                        <div className="flex items-center gap-2 text-gray-500">
                          <Mail size={12} />
                          <span className="text-xs font-bold">{adminUser.email}</span>
                        </div>
                      )}
                      {store.subdomain && (
                        <div className="flex items-center gap-2 text-orange-600">
                          <Globe size={12} />
                          <span className="text-[10px] font-black uppercase tracking-tight">{store.subdomain}</span>
                        </div>
                      )}
                      {store.country && (
                        <div className="flex items-center gap-2 text-gray-400">
                          <MapPin size={12} />
                          <span className="text-[10px] font-bold uppercase">{store.country}</span>
                        </div>
                      )}
                      {store.operatorNumbers && Object.keys(store.operatorNumbers).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(store.operatorNumbers).map(([op, num]) => (
                            <div key={op} className="px-2 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[8px] font-black text-slate-500 uppercase">
                              {op.split('_')[0]}: {num}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleApproveStore(store.id, adminUser?.uid)}
                      className="flex-1 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={14} />
                      Approuver Boutique
                    </button>
                    <button 
                      onClick={() => handleRejectStore(store.id, adminUser?.uid)}
                      className="p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all active:scale-95 shadow-sm"
                      title="Rejeter et supprimer"
                    >
                      <XCircle size={18} />
                    </button>
                  </div>
                </div>
               );
            })}

            {/* Orphaned Users Pending (not covered by pendingStores above) */}
            {pendingUsers.filter(u => !pendingStores.some(s => s.id === u.storeId)).map(user => (
                <div key={`pending-user-${user.uid}`} className="bg-white p-6 rounded-[32px] border border-orange-200 shadow-sm hover:shadow-xl transition-all group">
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center overflow-hidden border border-gray-100">
                      {user.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" /> : <User size={24} className="text-gray-300" />}
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="px-3 py-1 bg-blue-100 text-blue-600 rounded-full text-[8px] font-black uppercase tracking-widest mb-2">Nouvel Admin</span>
                      <p className="text-[9px] font-mono text-gray-400">ID: {user.uid.slice(0, 8)}</p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="font-black text-gray-900 text-lg mb-1">{user.displayName || 'Utilisateur'}</h3>
                    <div className="flex items-center gap-2 text-gray-500">
                      <Mail size={12} />
                      <span className="text-xs font-bold">{user.email}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">Boutique: {user.storeId}</p>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        showConfirm(
                          "Approuver l'administrateur",
                          `Voulez-vous approuver l'administrateur ${user.email} ?`,
                          async () => {
                            await handleUpdateLicense(user.storeId, 'active', 12, user.uid);
                          }
                        );
                      }}
                      className="flex-1 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={14} />
                      Approuver Admin
                    </button>
                    <button 
                      onClick={() => handleRejectUser(user.uid)}
                      className="p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all active:scale-95 shadow-sm"
                      title="Rejeter et supprimer"
                    >
                      <XCircle size={18} />
                    </button>
                  </div>
                </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Boutiques Totales', value: stats.totalStores, icon: Store, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Licences Actives', value: stats.activeLicenses, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50' },
          { label: 'Chiffre d’Affaires Global', value: `${stats.totalGlobalRevenue.toLocaleString('de-DE')} FCFA`, icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Ventes Globales', value: stats.totalGlobalOrders, icon: ArrowRight, color: 'text-pink-500', bg: 'bg-pink-50' },
          { label: 'Utilisateurs Globaux', value: stats.totalUsers, icon: Users, color: 'text-orange-500', bg: 'bg-orange-50' },
        ].map((stat, idx) => (
          <motion.div 
            key={`stat-super-${idx}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-xl hover:shadow-gray-200/50 transition-all"
          >
            <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <stat.icon size={24} />
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
            <p className="text-2xl font-black text-gray-900 truncate">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* System Alerts Section */}
      {(stats.expiredLicenses > 0 || stats.suspendedLicenses > 0) && (
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-red-50 p-8 rounded-[40px] border border-red-100"
        >
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="text-red-600" size={24} />
            <h2 className="text-xl font-black text-red-900 tracking-tight uppercase italic">Alertes Critiques ({stats.expiredLicenses + stats.suspendedLicenses})</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stores.filter(s => {
              const isExpired = s.licenseExpiry ? new Date(s.licenseExpiry) < new Date() : false;
              return s.licenseStatus === 'suspended' || s.licenseStatus === 'expired' || (s.licenseStatus === 'active' && isExpired);
            }).map(store => (
              <div key={`alert-store-${store.id}`} className="bg-white p-4 rounded-3xl border border-red-200 flex items-center justify-between">
                <div>
                  <p className="font-black text-gray-900 text-sm">{store.name || 'Boutique'}</p>
                  <p className="text-[10px] text-red-500 font-bold uppercase">
                    {store.licenseStatus === 'suspended' ? 'Suspendu' : 'Licence Expirée'}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedStore(store)}
                  className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all"
                >
                  <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Dynamic Tab Switchers */}
      <div className="flex flex-wrap items-center gap-3 bg-white/60 p-1.5 border border-gray-100 rounded-2xl w-fit shadow-sm backdrop-blur-md mb-6">
        <button
          onClick={() => setActiveTab('stores')}
          className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${
            activeTab === 'stores'
              ? 'bg-slate-900 text-white shadow-md'
              : 'text-gray-400 hover:text-slate-900 hover:bg-gray-50'
          }`}
        >
          <Store size={14} />
          Boutiques Abonnées
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${
            activeTab === 'users'
              ? 'bg-slate-900 text-white shadow-md'
              : 'text-gray-400 hover:text-slate-900 hover:bg-gray-50'
          }`}
        >
          <Users size={14} />
          Gestion des Utilisateurs
        </button>
        <button
          onClick={() => setActiveTab('connections')}
          className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${
            activeTab === 'connections'
              ? 'bg-slate-900 text-white shadow-md'
              : 'text-gray-400 hover:text-slate-900 hover:bg-gray-50'
          }`}
        >
          <History size={14} />
          Historique des Connexions
        </button>
        <button
          onClick={() => setActiveTab('saas')}
          className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${
            activeTab === 'saas'
              ? 'bg-slate-900 text-white shadow-md'
              : 'text-gray-400 hover:text-slate-900 hover:bg-gray-50'
          }`}
        >
          <Link size={14} />
          Intégration SaaS & API
        </button>
        <button
          onClick={() => setActiveTab('redirection')}
          className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${
            activeTab === 'redirection'
              ? 'bg-slate-900 text-white shadow-md'
              : 'text-gray-400 hover:text-slate-900 hover:bg-gray-50'
          }`}
        >
          <Globe size={14} />
          Redirection & Hébergement Hostinger
        </button>
        <button
          onClick={() => setActiveTab('emails')}
          className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-300 flex items-center gap-2 relative ${
            activeTab === 'emails'
              ? 'bg-slate-900 text-white shadow-md'
              : 'text-gray-400 hover:text-slate-900 hover:bg-gray-50'
          }`}
        >
          <Mail size={14} />
          Emailing & Diagnostics SMTP
          {systemNotifications.filter(n => n.status === 'failed').length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
          )}
        </button>
      </div>

      {activeTab === 'stores' ? (
        <div className="bg-white rounded-[40px] border border-gray-100 shadow-xl shadow-gray-200/30 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-lg font-black text-gray-900 tracking-tight uppercase italic flex items-center gap-2">
              <Activity size={20} className="text-orange-500" />
              Liste des boutiques active
            </h2>
            <span className="px-4 py-1.5 bg-gray-50 text-gray-500 rounded-full text-[10px] font-black uppercase tracking-widest">
              {filteredStores.length} Résultats
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Boutique</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Chiffre d'Affaires</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Ventes</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status Licence</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Expiration</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Utilisateurs</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Actions globales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredStores.map((store) => {
                  const storeUsers = allUsers.filter(u => u.storeId === store.id);
                  const isExpired = new Date(store.licenseExpiry || '') < new Date();
                  const storeSales = globalSales.filter(s => s.storeId === store.id);
                  const storeSalesAmount = storeSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
                  const storeSalesCount = storeSales.length;
                  
                  return (
                    <tr key={`table-store-${store.id}`} className="hover:bg-gray-50/80 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-white rounded-2xl border-2 border-gray-50 flex items-center justify-center overflow-hidden shadow-sm">
                            {store.logoUrl ? (
                              <img src={store.logoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Store className="text-gray-300" size={24} />
                            )}
                          </div>
                          <div>
                            <p className="font-black text-gray-900 text-sm tracking-tight flex items-center gap-2">
                              {store.name || 'Sans Nom'}
                              {(store as any).parentStoreId ? (
                                <span className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 text-[8px] font-black uppercase text-indigo-500 rounded-md tracking-wider">Sous-Boutique</span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-100 text-[8px] font-black uppercase text-emerald-500 rounded-md tracking-wider">Principale</span>
                              )}
                            </p>
                            <p className="text-[10px] text-gray-400 font-mono">ID: {store.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="font-extrabold text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100/50">
                          {storeSalesAmount.toLocaleString('de-DE')} FCFA
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <span className="font-extrabold text-xs text-pink-600 bg-pink-50 px-3 py-1.5 rounded-xl border border-pink-100/50">
                          {storeSalesCount}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 w-fit ${
                          store.licenseStatus === 'active' 
                            ? isExpired ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'
                            : 'bg-red-50 text-red-600'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${
                             store.licenseStatus === 'active' 
                              ? isExpired ? 'bg-orange-500 animate-pulse' : 'bg-green-500' 
                              : 'bg-red-500'
                          }`} />
                          {store.licenseStatus === 'active' 
                            ? isExpired ? 'Expiré (Immédiat)' : 'Actif'
                            : store.licenseStatus === 'suspended' ? 'Suspendu' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                          <Calendar size={14} className="text-gray-400" />
                          {store.licenseExpiry ? new Date(store.licenseExpiry).toLocaleDateString('fr-FR') : 'Non définie'}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex -space-x-3">
                          {storeUsers.slice(0, 4).map((u, i) => (
                             <div key={`store-user-thumb-${u.uid}`} className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center overflow-hidden shadow-sm">
                               {u.photoURL ? <img src={u.photoURL} alt="" className="w-full h-full object-cover" /> : <User size={14} className="text-gray-400" />}
                             </div>
                          ))}
                          {storeUsers.length > 4 && (
                            <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-900 text-white text-[10px] font-black flex items-center justify-center shadow-sm">
                              +{storeUsers.length - 4}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <div className="group relative">
                            <button 
                              onClick={() => handleUpdateLicense(store.id, 'active', 1)}
                              className="p-2.5 bg-green-50 text-green-600 rounded-xl hover:bg-green-600 hover:text-white transition-all shadow-sm group/btn"
                            >
                              <RefreshCcw size={16} className="group-hover/btn:rotate-180 transition-transform duration-500" />
                            </button>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-[10px] font-bold rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl z-50">
                              Ajouter 1 mois de licence
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
                            </div>
                          </div>

                          <div className="group relative">
                            <button 
                              onClick={() => handleUpdateLicense(store.id, 'active', 12)}
                              className="p-2.5 bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-600 hover:text-white transition-all shadow-sm font-black text-[10px] uppercase tracking-widest px-4"
                            >
                              +1 AN
                            </button>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-[10px] font-bold rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl z-50">
                              Ajouter 1 an de licence
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
                            </div>
                          </div>

                          <div className="group relative">
                            <button 
                              onClick={() => handleUpdateLicense(store.id, store.licenseStatus === 'suspended' ? 'active' : 'suspended')}
                              className={`p-2.5 rounded-xl transition-all shadow-sm ${
                                store.licenseStatus === 'suspended' ? 'bg-blue-50 text-blue-600 hover:bg-blue-600' : 'bg-red-50 text-red-600 hover:bg-red-600'
                              } hover:text-white`}
                            >
                              <Power size={16} />
                            </button>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-[10px] font-bold rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl z-50">
                              {store.licenseStatus === 'suspended' ? 'Réactiver la boutique' : 'Suspendre la boutique'}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
                            </div>
                          </div>

                          {(auth.currentUser?.email === 'anges.gildas@gmail.com' || auth.currentUser?.email === 'gildas@gmail.com') && (
                            <div className="group relative">
                              <button 
                                onClick={() => handleDeleteStore(store.id, store.name)}
                                className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
                              >
                                <Trash2 size={16} />
                              </button>
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-red-600 text-white text-[10px] font-bold rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl z-50">
                                Supprimer DEFINITIVEMENT
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-red-600" />
                              </div>
                            </div>
                          )}

                          <div className="group relative">
                            <button 
                              onClick={() => setSelectedStore(store)}
                              className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-black transition-all shadow-lg"
                            >
                              <ArrowRight size={16} />
                            </button>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-[10px] font-bold rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl z-50">
                              Voir les détails
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'users' ? (
        <div className="bg-white rounded-[40px] border border-gray-100 shadow-xl shadow-gray-200/30 overflow-hidden animate-fade-in">
          <div className="px-8 py-6 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-gray-900 tracking-tight uppercase italic flex items-center gap-2">
                <Users size={20} className="text-orange-500" />
                Liste des Utilisateurs Enregistrés
              </h2>
              <p className="text-xs text-gray-500 font-medium">Recherchez, activez, désactivez ou gérez les rôles de n'importe quel utilisateur du système.</p>
            </div>
            
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Rechercher e-mail, nom..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="pl-11 pr-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold text-gray-900 focus:outline-none focus:bg-white focus:border-slate-900 transition-all w-full md:w-80 shadow-inner"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/50">
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Utilisateur</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Boutique Associée</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Rôle</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date de Création</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Statut</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {allUsers
                  .filter(user => {
                    if (!userSearchQuery) return true;
                    const queryStr = userSearchQuery.toLowerCase();
                    return (
                      user.email?.toLowerCase().includes(queryStr) ||
                      user.displayName?.toLowerCase().includes(queryStr) ||
                      user.uid?.toLowerCase().includes(queryStr)
                    );
                  })
                  .map(user => {
                    const shop = stores.find(s => s.id === user.storeId);
                    const isPending = user.pendingApproval === true;
                    const isActive = user.isActive !== false;
                    
                    return (
                      <tr key={`user-row-${user.uid}`} className="hover:bg-gray-50/30 transition-all group">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden border border-gray-200">
                              {user.photoURL ? (
                                <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                              ) : (
                                <User size={18} className="text-gray-400" />
                              )}
                            </div>
                            <div>
                              <p className="font-black text-gray-900 text-sm tracking-tight">{user.displayName || 'Sans nom'}</p>
                              <p className="text-[10px] font-bold text-gray-400">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          {shop ? (
                            <div>
                              <p className="font-bold text-gray-900 text-xs">{shop.name}</p>
                              <p className="text-[10px] font-mono text-gray-400">{shop.subdomain || 'Pas de sous-domaine'}</p>
                            </div>
                          ) : (
                            <span className="text-[10px] font-black uppercase text-gray-400 italic">Boutique inconnue</span>
                          )}
                        </td>
                        <td className="px-8 py-5">
                          <span className="px-3 py-1 bg-gray-100 rounded-full text-[8px] font-black uppercase tracking-widest text-gray-500 border border-gray-200">
                            {user.role}
                          </span>
                        </td>
                        <td className="px-8 py-5">
                          <p className="text-xs text-gray-500 font-bold">
                            {user.createdAt ? (
                              typeof user.createdAt === 'string' 
                                ? new Date(user.createdAt).toLocaleDateString()
                                : user.createdAt.toDate 
                                  ? user.createdAt.toDate().toLocaleDateString()
                                  : new Date(user.createdAt).toLocaleDateString()
                            ) : 'N/A'}
                          </p>
                        </td>
                        <td className="px-8 py-5 text-xs font-semibold">
                          <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 w-fit ${
                            isActive 
                              ? 'bg-green-50 text-green-700 border border-green-100' 
                              : isPending 
                                ? 'bg-orange-50 text-orange-700 border border-orange-100' 
                                : 'bg-red-50 text-red-700 border border-red-100'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-600' : isPending ? 'bg-orange-600' : 'bg-red-600'}`} />
                            {isActive ? 'Actif' : isPending ? 'En attente' : 'Suspendu / Inactif'}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex items-center justify-end gap-2 text-right">
                            {isPending && (
                              <button
                                onClick={async () => {
                                  showConfirm(
                                    "Approuver cet utilisateur",
                                    `Voulez-vous approuver l'accès au système pour ${user.displayName || user.email} et activer sa boutique ?`,
                                    async () => {
                                      await handleUpdateLicense(user.storeId, 'active', 12, user.uid);
                                    }
                                  );
                                }}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-[9px] font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-green-100"
                              >
                                Approuver
                              </button>
                            )}
                            
                            <button
                              onClick={() => handleToggleUserStatus(user.uid, isActive)}
                              className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xl transition-all ${
                                isActive 
                                  ? 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white' 
                                  : 'bg-green-50 text-green-600 hover:bg-green-600 hover:text-white'
                              }`}
                            >
                              {isActive ? 'Suspendre' : 'Rétablir'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'connections' ? (
        <div className="bg-white rounded-[40px] border border-gray-100 shadow-xl shadow-gray-200/30 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-gray-900 tracking-tight uppercase italic flex items-center gap-2">
                <History size={20} className="text-orange-500" />
                Historique de connexion des boutiques
              </h2>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Événements de connexion en temps réel</p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={logsLimit}
                onChange={(e) => setLogsLimit(Number(e.target.value))}
                className="px-4 py-2 bg-gray-50 text-gray-700 font-bold text-xs rounded-xl border border-gray-100 outline-none focus:ring-2 focus:ring-orange-500/20"
              >
                <option value={50}>Afficher 50 logs</option>
                <option value={100}>Afficher 100 logs</option>
                <option value={200}>Afficher 200 logs</option>
                <option value={500}>Afficher 500 logs</option>
              </select>
              <button
                onClick={async () => {
                  if (confirm("Voulez-vous vider tout l'historique de connexion ?")) {
                    setLoading(true);
                    try {
                      const snap = await getDocs(collection(db, 'connectionHistory'));
                      for (const logDoc of snap.docs) {
                        await deleteDoc(logDoc.ref);
                      }
                      alert("Historique vidé.");
                    } catch (e: any) {
                      alert("Erreur de suppression: " + e.message);
                    } finally {
                      setLoading(false);
                    }
                  }
                }}
                className="px-4 py-2 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white transition-all font-black text-[10px] uppercase tracking-widest rounded-xl"
              >
                Tout Effacer
              </button>
              <span className="px-4 py-1.5 bg-gray-50 text-gray-500 rounded-full text-[10px] font-black uppercase tracking-widest">
                {filteredLogs.length} Résultats
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Utilisateur</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Boutique</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date & Heure</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Statut</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Navigateur / Système</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right pr-12">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-12 text-center text-sm font-bold text-gray-400 italic">
                      Aucun historique de connexion trouvé.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const dateVal = log.timestamp instanceof Timestamp 
                      ? log.timestamp.toDate() 
                      : (log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000) : new Date(log.timestamp || Date.now()));
                    
                    const getFriendlyUA = (ua: string) => {
                      if (!ua) return 'Inconnu';
                      if (ua.includes('FxiOS') || ua.includes('Firefox')) return 'Firefox';
                      if (ua.includes('CriOS') || ua.includes('Chrome')) return 'Chrome';
                      if (ua.includes('Safari')) return 'Safari';
                      if (ua.includes('Windows')) return 'Windows Edge/IE';
                      return 'Navigateur Sécurisé';
                    };

                    return (
                      <tr key={log.id} className="hover:bg-gray-50/80 transition-colors group">
                        <td className="px-8 py-5">
                          <div>
                            <p className="font-black text-gray-900 text-sm tracking-tight">{log.userName || 'Sans Nom'}</p>
                            <p className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                              <Mail size={10} />
                              {log.userEmail}
                            </p>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <div>
                            <p className="font-bold text-gray-800 text-sm">{log.storeName || 'Boutique'}</p>
                            <p className="text-[10px] text-gray-400 font-mono">ID: {log.storeId}</p>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <p className="text-xs font-bold text-gray-700">
                            {dateVal.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                          </p>
                        </td>
                        <td className="px-8 py-5">
                          <span className="px-3 py-1 bg-green-50 text-green-600 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 w-fit">
                            <span className="w-1 h-1 rounded-full bg-green-500" />
                            Succès
                          </span>
                        </td>
                        <td className="px-8 py-5">
                          <p className="text-xs font-semibold text-gray-500 max-w-[200px] truncate" title={log.userAgent}>
                            {getFriendlyUA(log.userAgent)}
                          </p>
                        </td>
                        <td className="px-8 py-5 text-right pr-12">
                          <button
                            onClick={async () => {
                              if (confirm("Supprimer ce log ?")) {
                                try {
                                  await deleteDoc(doc(db, 'connectionHistory', log.id));
                                } catch (e: any) {
                                  alert("Erreur: " + e.message);
                                }
                              }
                            }}
                            className="p-2 text-gray-300 hover:text-red-500 rounded-xl hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                            title="Supprimer ce log"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'saas' ? (
        /* SaaS & Webhook Integration Tab */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form & Settings Card */}
          <div className="bg-white rounded-[40px] p-8 border border-gray-100 shadow-xl shadow-gray-200/30 flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase italic flex items-center gap-2">
                <Link size={20} className="text-orange-500" />
                Configuration Centralisée
              </h2>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                Liez cette application à votre plateforme SaaS externe
              </p>
            </div>

            <div className="flex flex-col gap-5">
              {/* SaaS Target URL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">URL de l'API de votre SaaS</label>
                <input 
                  type="url"
                  placeholder="https://votre-saas.com/api/v1/market-sync"
                  value={saasUrl}
                  onChange={(e) => setSaasUrl(e.target.value)}
                  className="px-4 py-3 bg-gray-50 text-xs font-bold text-gray-800 rounded-2xl border border-gray-100 outline-none focus:ring-2 focus:ring-orange-500/20 w-full font-mono"
                />
                <span className="text-[9px] text-gray-400 font-medium">Les événements (synchronisations) y seront envoyés via requête POST.</span>
              </div>

              {/* Security Jeton / Token */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Jeton de Sécurité / Clé d'API (SaaS Token)</label>
                  <button 
                    onClick={generateSecureToken}
                    className="text-[9px] font-black uppercase text-orange-500 hover:text-black tracking-widest transition-all"
                  >
                    Générer une clé
                  </button>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="Saisissez ou générez un jeton d'authentification"
                    value={saasToken}
                    onChange={(e) => setSaasToken(e.target.value)}
                    className="px-4 py-3 bg-gray-50 text-xs font-bold text-gray-800 rounded-2xl border border-gray-100 outline-none focus:ring-2 focus:ring-orange-500/20 w-full font-mono"
                  />
                </div>
                <span className="text-[9px] text-gray-400 font-medium">Sert à authentifier les requêtes montantes et descendantes de manière sécurisée.</span>
              </div>

              {/* Sync settings */}
              <div className="bg-gray-50/50 p-4 rounded-3xl border border-gray-100 flex items-center justify-between mt-2 font-sans">
                <div className="flex flex-col font-sans">
                  <span className="text-xs font-bold text-gray-900">Activer la Synchronisation</span>
                  <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider mt-0.5">Automatique en arrière-plan</span>
                </div>
                <button 
                  onClick={() => setSaasSyncEnabled(!saasSyncEnabled)}
                  className={`w-12 h-6 rounded-full transition-all relative ${saasSyncEnabled ? 'bg-orange-500' : 'bg-gray-200'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${saasSyncEnabled ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {/* Save SaaS configuration button */}
              <button
                onClick={() => handleUpdateSaaSConfig(saasUrl, saasToken, saasSyncEnabled)}
                className="w-full py-3.5 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 mt-2"
              >
                <CheckCircle2 size={14} />
                Enregistrer la Configuration
              </button>
            </div>

            <hr className="border-gray-100" />

            {/* Manual synchronization control panel */}
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Synchronisation Manuelle</h3>
                <p className="text-[9px] text-gray-400 font-medium mt-1">Transférez immédiatement un rapport global consolidé de toutes vos boutiques abonnées, ventes de la plateforme et statistiques à votre serveur SaaS central.</p>
              </div>

              <button
                onClick={handleSyncSnapshotToSaaS}
                disabled={isSyncingSaaS}
                className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 ${
                  isSyncingSaaS 
                    ? 'bg-slate-100 text-gray-405 cursor-not-allowed'
                    : 'bg-orange-500 text-white hover:bg-black'
                }`}
              >
                <RefreshCcw size={14} className={isSyncingSaaS ? 'animate-spin' : ''} />
                {isSyncingSaaS ? 'Transmission en cours...' : 'Pousser le Snapshot complet vers le SaaS'}
              </button>
            </div>
          </div>

          {/* Webhook & Log Card */}
          <div className="flex flex-col gap-8">
            {/* Documentation Webhook Card */}
            <div className="bg-slate-950 rounded-[40px] p-8 text-white border border-slate-900 shadow-xl flex flex-col gap-5">
              <div>
                <span className="px-3 py-1 bg-orange-500/10 text-orange-500 text-[8px] font-black uppercase tracking-widest rounded-full border border-orange-500/20">
                  DEVELOPPEURS / WEBHOOK
                </span>
                <h2 className="text-xl font-black text-white tracking-tight uppercase italic mt-4 flex items-center gap-2">
                  <Terminal size={20} className="text-orange-500" />
                  API Webhook Entrant
                </h2>
                <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest mt-1">
                  Pilotez cette application depuis votre SaaS central
                </p>
              </div>

              <p className="text-[11px] text-white/70 leading-relaxed font-sans">
                Votre SaaS peut modifier automatiquement le statut de licence d'une boutique (ex: l'activer après validation d'un paiement Stripe, la suspendre en cas de rejet de facturation) en envoyant une requête <span className="bg-white/10 px-1 py-0.5 rounded font-mono text-[9px] text-white">POST</span> sécurisée :
              </p>

              {/* Endpoint Display */}
              <div className="bg-white/5 p-3.5 rounded-2xl border border-white/10 flex flex-col gap-1.5 font-mono">
                <span className="text-[8px] font-black uppercase text-white/40">URL DE L'API WEBHOOK</span>
                <span className="text-[11px] text-orange-400 font-bold break-all">
                  {window.location.origin}/api/saas/webhook
                </span>
              </div>

              {/* sample JSON payload */}
              <div className="flex flex-col gap-2">
                <span className="text-[8px] font-black uppercase text-white/40 tracking-wider">Structure du JSON attendu :</span>
                <pre className="bg-black/40 border border-white/10 p-4 rounded-2xl text-[10px] font-mono text-emerald-400 overflow-x-auto leading-relaxed">
{`{
  "storeId": "ID_DE_LA_BOUTIQUE",
  "licenseStatus": "active" | "suspended",
  "licenseExpiry": "yyyy-MM-dd",
  "token": "${saasToken || 'VOTRE_JETON_SÉCURISÉ'}"
}`}
                </pre>
              </div>
            </div>

            {/* Outgoing sync log panel */}
            <div className="bg-white rounded-[40px] p-8 border border-gray-100 shadow-xl shadow-gray-200/30 flex-1 flex flex-col gap-4">
              <div>
                <h3 className="text-xs font-black text-gray-950 uppercase tracking-widest flex items-center gap-1.5">
                  <Activity size={14} className="text-orange-500" />
                  Logs en temps réel des transactions SaaS
                </h3>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                  Dernières requêtes de connexion poussées
                </p>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[220px] flex flex-col gap-2.5 pr-2">
                {saasSyncLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400 border border-dashed border-gray-100 rounded-3xl h-full">
                    <Terminal size={24} className="opacity-35 mb-2" />
                    <p className="text-[10px] font-bold uppercase tracking-wider">Aucune tentative de synchronisation enregistrée</p>
                    <p className="text-[9px] opacity-70">Enregistrez les paramètres et poussez un snapshot pour tester.</p>
                  </div>
                ) : (
                  saasSyncLogs.map((log, index) => (
                    <div key={`saas-log-${index}`} className="p-3 bg-gray-50 rounded-2xl border border-gray-100/50 flex flex-col gap-2 text-[10px] font-sans">
                      <div className="flex items-center justify-between font-sans">
                        <span className="font-extrabold text-[9px] text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200/50">
                          {log.type}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] font-mono text-gray-400">{log.timestamp}</span>
                          <span className={`px-2 py-0.5 font-bold uppercase text-[8px] rounded-lg ${
                            log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {log.status === 'success' ? 'Succès' : 'Échec'}
                          </span>
                        </div>
                      </div>
                      <p className="text-gray-600 font-medium leading-relaxed leading-[1.3]">{log.details}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'redirection' ? (
        /* Redirection & Hostinger Helper Tab */
        <div className="bg-white rounded-[40px] p-8 border border-gray-100 shadow-xl shadow-gray-200/30 flex flex-col gap-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-50 pb-6">
            <div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase italic flex items-center gap-2">
                <Globe size={24} className="text-orange-500" />
                Guide d'Intégration & Redirection Hostinger
              </h2>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                Liez élégamment votre nom de domaine personnalisé Hostinger ou autre hébergeur à cette application
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Force Disable Redirect in case they get stuck */}
              <button 
                onClick={async () => {
                  try {
                    const configRef = doc(db, 'systemConfig', 'globals');
                    await setDoc(configRef, { 
                      isAutoRedirectEnabled: false,
                      updatedAt: serverTimestamp()
                    }, { merge: true });
                    alert("Redirection automatique désactivée avec succès pour le déboguage !");
                  } catch (e: any) {
                    alert("Erreur: " + e.message);
                  }
                }}
                className="px-4 py-2 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-xl transition-all font-black text-[10px] uppercase tracking-wider shadow-sm flex items-center gap-1.5"
              >
                <Power size={12} />
                Désactiver l'auto-redirection
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Status & Troubleshooting panel */}
            <div className="lg:col-span-1 flex flex-col gap-6">
              <div className="p-6 bg-slate-900 text-white rounded-[32px] flex flex-col gap-4 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />
                <h3 className="text-xs font-black uppercase text-orange-400 tracking-wider flex items-center gap-1.5 border-b border-white/10 pb-3">
                  <ShieldAlert size={14} />
                  État du Redirectionneur
                </h3>
                
                <div className="flex flex-col gap-3.5 text-xs text-gray-300 font-sans">
                  <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-xl border border-white/5">
                    <span>Hôte Actuel :</span>
                    <span className="font-mono text-[10px] text-white bg-white/10 px-2 py-0.5 rounded font-black max-w-[150px] overflow-hidden text-ellipsis">{window.location.hostname}</span>
                  </div>
                  
                  <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-xl border border-white/5">
                    <span>Redirection Auto :</span>
                    <span className={`font-black text-[10px] px-2 py-0.5 rounded ${systemConfig?.isAutoRedirectEnabled ? 'bg-orange-500/20 text-orange-400' : 'bg-white/10 text-gray-400'}`}>
                      {systemConfig?.isAutoRedirectEnabled ? 'ACTIF (ON)' : 'INACTIF (OFF)'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-xl border border-white/5">
                    <span>URL Cible :</span>
                    <span className="font-mono text-[10px] text-orange-300 overflow-hidden text-ellipsis max-w-[130px] whitespace-nowrap" title={systemConfig?.publicAccessUrl || 'Non spécifiée'}>
                      {systemConfig?.publicAccessUrl || 'Non spécifiée'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-xl border border-white/5">
                    <span>Lien Cloud Run :</span>
                    <span className="font-mono text-[10px] text-green-300 overflow-hidden text-ellipsis max-w-[130px] whitespace-nowrap" title="https://ais-pre-6aefxx3cvl6ifeis7ritna-207000887551.europe-west2.run.app">
                      https://ais-pre-6aefxx3cvl6ifeis7ritna-207000887551...
                    </span>
                  </div>
                </div>

                <div className="mt-2 text-[10px] text-gray-400 leading-relaxed border-t border-white/10 pt-3">
                  💡 En cochant <strong>Auto-Redirect</strong> ou en copiant les scripts ci-contre, vous pouvez créer un couplage parfait sans l'erreur 404 "Page introuvable".
                </div>
              </div>

              <div className="p-6 bg-orange-50/50 border border-orange-100 rounded-[32px] flex flex-col gap-3">
                <h3 className="text-xs font-black text-orange-950 uppercase tracking-widest flex items-center gap-2">
                  <AlertTriangle size={14} className="text-orange-500" />
                  Résoudre la page introuvable (404)
                </h3>
                <p className="text-[10px] text-orange-850 leading-relaxed font-semibold">
                  Si vous accédez à l'application dans un nouvel onglet et voyez "Page introuvable sur le serveur" :
                </p>
                <ol className="text-[9.5px] text-orange-900 leading-relaxed list-decimal pl-4 flex flex-col gap-1.5 font-medium">
                  <li>L'application s'ouvre dans l'iframe via AI Studio. Dans un nouvel onglet sans connection active au studio, cela nécessite que les services soient propagés.</li>
                  <li>Si vous avez activé "Redirection Domaine" vers un lien Hostinger invalide, l'application vous redirige directement sur ce lien cassé. Utilisez le bouton rouge ci-dessus pour couper l'auto-redirection.</li>
                  <li>Sur Hostinger ou votre hébergeur, veillez à utiliser l'un des snippets ci-contre pour assurer le routage correct des pages de l'application sans conflit de réécriture.</li>
                </ol>
              </div>
            </div>

            {/* Snippets Generator */}
            <div className="lg:col-span-2 flex flex-col gap-6 font-sans">
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest pl-2 border-l-2 border-orange-500">
                Codes de Redirection Clés en Main à Coller sur Hostinger
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* PHP Custom Script Card */}
                <div className="bg-gray-50 border border-gray-100 p-5 rounded-[24px] flex flex-col gap-3 h-full">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-gray-900">Méthode 1 : Script PHP (Recommandé)</h4>
                      <p className="text-[8.5px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">À insérer dans index.php à la racine du site</p>
                    </div>
                    <button 
                      onClick={() => {
                        const code = "<?php\n// Redirection vers l'application MARKET PRO sur Cloud Run\n$app_url = 'https://ais-pre-6aefxx3cvl6ifeis7ritna-207000887551.europe-west2.run.app';\n$request_uri = $_SERVER['REQUEST_URI'] ?? '';\nheader('Location: ' . $app_url . $request_uri, true, 301);\nexit();\n?>";
                        navigator.clipboard.writeText(code);
                        alert("Code PHP copié avec succès !");
                      }}
                      className="px-2.5 py-1 bg-white border border-gray-200 text-gray-700 hover:text-orange-500 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-sm transition-all active:scale-95"
                    >
                      Copier
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[9px] rounded-xl overflow-x-auto leading-relaxed border border-gray-200/50 block w-full max-h-[140px]">
{`<?php
// PHP Redirection fluide
$app_url = "https://ais-pre-6aefxx3cvl6ifeis7ritna-207000887551.europe-west2.run.app";
$request_uri = $_SERVER['REQUEST_URI'] ?? '';
header("Location: " . $app_url . $request_uri, true, 301);
exit();
?>`}
                  </pre>
                  <p className="text-[9px] text-gray-400 leading-relaxed font-semibold">
                    Cette méthode transmet proprement l'intégralité du chemin et des paramètres à votre application web.
                  </p>
                </div>

                {/* HTML Iframe Card */}
                <div className="bg-gray-50 border border-gray-100 p-5 rounded-[24px] flex flex-col gap-3 h-full">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-gray-900">Méthode 2 : Intégration Iframe</h4>
                      <p className="text-[8.5px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Pour conserver votre nom de domaine dans l'URL</p>
                    </div>
                    <button 
                      onClick={() => {
                        const code = '<!DOCTYPE html>\n<html lang="fr">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">\n    <title>MARKET PRO - Gestion Supermarché</title>\n    <style>\n        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background-color: #0f172a; }\n        iframe { border: none; width: 100%; height: 100%; display: block; }\n    </style>\n</head>\n<body>\n    <iframe src="https://ais-pre-6aefxx3cvl6ifeis7ritna-207000887551.europe-west2.run.app" allow="camera; microphone; geolocation; clipboard-write; clipboard-read"></iframe>\n</body>\n</html>';
                        navigator.clipboard.writeText(code);
                        alert("Code HTML Iframe copié avec succès !");
                      }}
                      className="px-2.5 py-1 bg-white border border-gray-200 text-gray-700 hover:text-orange-500 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-sm transition-all active:scale-95"
                    >
                      Copier
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[9px] rounded-xl overflow-x-auto leading-relaxed border border-gray-200/50 block w-full max-h-[140px]">
{`<!DOCTYPE html>
<html lang="fr">
<head>
    ...
</head>
<body>
    <iframe src="https://ais-pre-6...run.app" class="w-full h-full" allow="camera; microphone; geolocation"></iframe>
</body>
</html>`}
                  </pre>
                  <p className="text-[9px] text-gray-400 leading-relaxed font-semibold">
                    Idéal pour masquer l'adresse technique de partage de l'application et afficher directement votre domaine à l'écran.
                  </p>
                </div>

                {/* htaccess Card */}
                <div className="bg-gray-50 border border-gray-100 p-5 rounded-[24px] flex flex-col gap-3 h-full">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-gray-900">Méthode 3 : `.htaccess` Apache</h4>
                      <p className="text-[8.5px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Redirection globale via le serveur Apache</p>
                    </div>
                    <button 
                      onClick={() => {
                        const code = 'RewriteEngine On\n# Rediriger l\'intégralité du trafic sans rupture vers l\'application MARKET PRO\nRewriteCond %{HTTP_HOST} ^(www\\.)?(.+)$ [NC]\nRewriteRule ^(.*)$ https://ais-pre-6aefxx3cvl6ifeis7ritna-207000887551.europe-west2.run.app/$1 [L,R=301,NE,QSA]';
                        navigator.clipboard.writeText(code);
                        alert("Snippet .htaccess copié avec succès !");
                      }}
                      className="px-2.5 py-1 bg-white border border-gray-200 text-gray-700 hover:text-orange-500 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-sm transition-all active:scale-95"
                    >
                      Copier
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[9px] rounded-xl overflow-x-auto leading-relaxed border border-gray-200/50 block w-full max-h-[140px]">
{`RewriteEngine On
RewriteRule ^(.*)$ https://ais-pre-6...run.app/$1 [L,R=301,NE,QSA]`}
                  </pre>
                  <p className="text-[9px] text-gray-400 leading-relaxed font-semibold">
                    Redirige instantanément tous les requérants de votre domaine d'origine vers l'application fonctionnelle sur le Cloud.
                  </p>
                </div>

                {/* HTML & JS Fallback Card */}
                <div className="bg-gray-50 border border-gray-100 p-5 rounded-[24px] flex flex-col gap-3 h-full">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-gray-900">Méthode 4 : Redirection Javascript</h4>
                      <p className="text-[8.5px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">À insérer dans un fichier index.html simple</p>
                    </div>
                    <button 
                      onClick={() => {
                        const code = '<!DOCTYPE html>\n<html>\n<head>\n    <title>MARKET PRO - Redirection</title>\n    <meta http-equiv="refresh" content="0; url=https://ais-pre-6aefxx3cvl6ifeis7ritna-207000887551.europe-west2.run.app">\n    <script type="text/javascript">\n        window.location.replace("https://ais-pre-6aefxx3cvl6ifeis7ritna-207000887551.europe-west2.run.app" + window.location.pathname + window.location.search);\n    </script>\n</head>\n<body>\n    <p style="font-family: sans-serif; text-align: center; margin-top: 20%; color: #475569;">\n        Chargement de l\'application MARKET PRO en cours...\n    </p>\n</body>\n</html>';
                        navigator.clipboard.writeText(code);
                        alert("Code JS de redirection copié avec succès !");
                      }}
                      className="px-2.5 py-1 bg-white border border-gray-200 text-gray-700 hover:text-orange-500 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-sm transition-all active:scale-95"
                    >
                      Copier
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[9px] rounded-xl overflow-x-auto leading-relaxed border border-gray-200/50 block w-full max-h-[140px]">
{`<!DOCTYPE html>
<html>
<head>
    <script>
        window.location.replace("https://ais-pre-6...run.app" + window.location.pathname);
    </script>
</head>
</html>`}
                  </pre>
                  <p className="text-[9px] text-gray-400 leading-relaxed font-semibold">
                    Redirige côté client de manière instantanée avec un rafraîchissement meta de secours si JS est désactivé.
                  </p>
                </div>
                
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Emails & SMTP Log Tab Panel */
        <div className="bg-white rounded-[40px] p-8 border border-gray-100 shadow-xl shadow-gray-200/30 flex flex-col gap-8" id="emails-log-panel">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-50 pb-6" id="emails-panel-header">
            <div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase italic flex items-center gap-2" id="emails-panel-title">
                <Mail size={24} className="text-orange-500" id="emails-panel-icon" />
                Journal des Emails & Diagnostics SMTP
              </h2>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1" id="emails-panel-subtitle">
                Suivi en temps réel des envois de notifications système et alertes de livraison
              </p>
            </div>
            
            <div className="flex items-center gap-3" id="emails-panel-badge-container">
              <span className="px-4 py-1.5 bg-slate-100 text-slate-700 rounded-full text-[10px] font-black uppercase tracking-widest" id="emails-count-badge">
                {systemNotifications.length} Messages Loggués
              </span>
            </div>
          </div>

          {/* Quick Diagnostics Box */}
          {systemNotifications.some(n => n.status === "failed") ? (
            <div className="p-6 bg-red-50 rounded-3xl border border-red-200/60 text-red-900" id="emails-diagnostic-error-card">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-100 rounded-2xl text-red-600">
                  <ShieldAlert size={24} />
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="text-sm font-black uppercase tracking-wide">⚠️ Erreur d'Authentification SMTP détectée (Code d'authentification 535)</h3>
                  <p className="text-xs leading-relaxed font-semibold text-red-700">
                    Le serveur SMTP montre des échecs d'envoi d'emails. Cela se produit généralement lorsque vous utilisez un compte Gmail avec son mot de passe ordinaire. 
                    <strong> Google exige une authentification forte par "Mot de passe d'application" (App Password)</strong> pour se connecter de manière externe.
                  </p>
                  <div className="pt-2">
                    <p className="text-xs font-bold uppercase text-red-900 mb-1">💡 Solution étape par étape pour l'administrateur :</p>
                    <ol className="list-decimal pl-5 text-[11px] text-red-800 font-medium space-y-1">
                      <li>Rendez-vous sur la gestion de votre compte Google : <a href="https://myaccount.google.com" target="_blank" rel="noopener noreferrer" className="underline font-bold">https://myaccount.google.com</a></li>
                      <li>Dans le menu <strong>"Sécurité"</strong>, activez la <strong>"Validation en 2 étapes"</strong> si ce n'est pas déjà fait.</li>
                      <li>Recherchez et cliquez sur <strong>"Mots de passe d'application"</strong> (tout en bas de l'encart validation).</li>
                      <li>Générez un mot de passe d'application en choisissant un nom personnalisé (ex: "Market Pro Togo").</li>
                      <li>Copiez la clé de <strong>16 caractères</strong> (sans espaces) affichée par Google.</li>
                      <li>Gérez vos Variables d'Environnement dans AI Studio : remplacez la valeur de <strong>SMTP_PASS</strong> par cette clé de 16 lettres, puis redémarrez l'application.</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          ) : systemNotifications.some(n => n.status === "sent") ? (
            <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-200/60 text-emerald-950" id="emails-diagnostic-success-card">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-600">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide">✅ SMTP Connecté & Livraison Opérationnelle</h3>
                  <p className="text-xs leading-relaxed font-semibold text-emerald-700 mt-1">
                    Tous les services de messagerie système transmettent correctement les données. Aucun avertissement de connexion SMTP n'est actif sur votre réseau.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-amber-50 rounded-3xl border border-amber-200/60 text-amber-955" id="emails-diagnostic-empty-card">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-amber-100 rounded-2xl text-amber-600">
                  <Activity size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide">ℹ️ En attente de notifications système</h3>
                  <p className="text-xs leading-relaxed font-semibold text-amber-700 mt-1">
                    Aucun email système n'a encore été envoyé ou configuré. Pour tester la connexion, enregistrez une boutique d'essai ou mettez à jour l'approbation d'une demande.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Search Bar for notifications */}
          <div className="relative" id="emails-search-container">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Filtrer les messages par destinataire, sujet, type d'email..."
              value={emailSearchQuery}
              onChange={(e) => setEmailSearchQuery(e.target.value)}
              className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-semibold placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:bg-white transition-all shadow-inner"
              id="emails-search-input"
            />
          </div>

          {/* Notifications Log List */}
          <div className="space-y-4" id="emails-log-list">
            {systemNotifications.filter(n => {
              if (!emailSearchQuery) return true;
              const q = emailSearchQuery.toLowerCase();
              return (n.to || '').toLowerCase().includes(q) || 
                     (n.subject || '').toLowerCase().includes(q) || 
                     (n.type || '').toLowerCase().includes(q) || 
                     (n.status || '').toLowerCase().includes(q);
            }).length === 0 ? (
              <div className="text-center py-12 p-8 border border-dashed border-gray-200 rounded-3xl" id="emails-logs-empty">
                <Mail size={36} className="mx-auto text-gray-300 mb-2 animate-pulse" />
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Aucune notification correspondante</p>
              </div>
            ) : (
              systemNotifications.filter(n => {
                if (!emailSearchQuery) return true;
                const q = emailSearchQuery.toLowerCase();
                return (n.to || '').toLowerCase().includes(q) || 
                       (n.subject || '').toLowerCase().includes(q) || 
                       (n.type || '').toLowerCase().includes(q) || 
                       (n.status || '').toLowerCase().includes(q);
              }).map((notification) => {
                const isExpanded = expandedEmailId === notification.id;
                const hasError = notification.status === "failed";
                const isMocked = notification.status === "mocked";
                
                return (
                  <div key={notification.id} className={`p-6 rounded-3xl border transition-all ${
                    hasError ? 'bg-red-50/20 border-red-100 hover:border-red-200' :
                    isMocked ? 'bg-slate-50 border-gray-100 hover:border-gray-200' : 
                    'bg-white border-gray-50 hover:border-gray-100 shadow-sm'
                  }`} id={`email-card-${notification.id}`}>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                            notification.type === 'store_requested' ? 'bg-amber-100 text-amber-700' :
                            notification.type === 'store_approved' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {notification.type === 'store_requested' ? 'Demande Reçue' :
                             notification.type === 'store_approved' ? 'Boutique Approuvée' : notification.type}
                          </span>
                          
                          <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${
                            hasError ? 'bg-red-100 text-red-700' :
                            isMocked ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                          }`}>
                            {hasError ? 'Échec Delivery' :
                             isMocked ? 'Simulation' : 'Envoyé'}
                          </span>

                          <span className="text-[10px] text-gray-400 font-bold ml-auto font-mono">
                            {notification.timestamp?.toDate ? new Date(notification.timestamp.toDate()).toLocaleString() : new Date(notification.timestamp).toLocaleString()}
                          </span>
                        </div>

                        <h4 className="text-sm font-black text-slate-900 tracking-tight">{notification.subject}</h4>
                        <p className="text-xs font-semibold text-slate-500">
                          Pour : <span className="text-slate-900 font-bold">{notification.to}</span>
                        </p>
                      </div>

                      <button
                        onClick={() => setExpandedEmailId(isExpanded ? null : notification.id)}
                        className="px-4 py-2 bg-slate-50 border border-gray-100 text-slate-800 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm hover:bg-slate-900 hover:text-white transition-all active:scale-95"
                        id={`email-inspect-btn-${notification.id}`}
                      >
                        {isExpanded ? 'Masquer' : 'Inspecter'}
                      </button>
                    </div>

                    {/* SMTP Error Details Console Box */}
                    {hasError && notification.errorDetails && (
                      <div className="mt-4 p-4 bg-red-950 text-red-200 font-mono text-[10px] rounded-2xl border border-red-900/40 leading-relaxed overflow-x-auto w-full">
                        <strong className="text-red-400 uppercase font-black tracking-wider block mb-1">Détails d'erreur Nodemailer/SMTP :</strong>
                        {notification.errorDetails}
                      </div>
                    )}

                    {/* Expanded Email Body Preview */}
                    {isExpanded && (
                      <div className="mt-4 p-5 bg-slate-50 rounded-2xl border border-gray-100 space-y-3">
                        <span className="text-[9px] text-gray-400 uppercase font-black tracking-wider block">Corps du message transmis</span>
                        
                        {notification.body && notification.body.startsWith('<') ? (
                          <div 
                            className="bg-white p-4 border border-gray-200/60 rounded-xl max-h-[300px] overflow-y-auto text-xs prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: notification.body }}
                          />
                        ) : (
                          <pre className="p-4 bg-white border border-gray-200/60 rounded-xl text-[11px] font-mono whitespace-pre-wrap text-slate-600 max-h-[300px] overflow-y-auto leading-relaxed">
                            {notification.body}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Store Detail Modal */}
      <AnimatePresence>
        {selectedStore && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="bg-white w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[48px] shadow-2xl border border-white/20 flex flex-col"
            >
              <div className="relative h-48 bg-slate-900 overflow-hidden">
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute inset-0 bg-gradient-to-tr from-orange-500 to-indigo-500" />
                  <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                </div>
                <button 
                  onClick={() => setSelectedStore(null)}
                  className="absolute top-8 right-8 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90"
                >
                  <XCircle size={24} />
                </button>
                <div className="absolute bottom-[-40px] left-12 flex items-end gap-6">
                  <div className="w-32 h-32 bg-white rounded-[40px] p-2 shadow-2xl border-4 border-white overflow-hidden">
                    {selectedStore.logoUrl ? (
                      <img src={selectedStore.logoUrl} alt="" className="w-full h-full object-cover rounded-[32px]" />
                    ) : (
                      <div className="w-full h-full bg-gray-50 flex items-center justify-center rounded-[32px]">
                        <Store size={48} className="text-gray-200" />
                      </div>
                    )}
                  </div>
                  <div className="pb-4">
                    <h2 className="text-3xl font-black text-white tracking-tight">{selectedStore.name || 'Boutique'}</h2>
                    <p className="text-white/60 font-bold uppercase tracking-[0.2em] text-[10px]">Store ID: {selectedStore.id}</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-12 pt-16">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                  <div className="lg:col-span-1 space-y-8">
                    <div>
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-4">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Informations</h3>
                        <button 
                          onClick={() => {
                            if (editingStoreInfo) {
                              setEditingStoreInfo(false);
                            } else {
                              setEditedStoreName(selectedStore.name || '');
                              setEditedStorePhone(selectedStore.phone || '');
                              setEditedStoreAddress(selectedStore.address || '');
                              setEditedStoreParentId((selectedStore as any).parentStoreId || '');
                              setEditingStoreInfo(true);
                            }
                          }}
                          className="text-[10px] font-black text-orange-600 uppercase tracking-widest hover:underline"
                        >
                          {editingStoreInfo ? "Annuler" : "Modifier"}
                        </button>
                      </div>

                      {editingStoreInfo ? (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Nom de Boutique</label>
                            <input 
                              type="text"
                              value={editedStoreName}
                              onChange={(e) => setEditedStoreName(e.target.value)}
                              className="w-full text-xs px-3.5 py-2 bg-white border border-gray-200 rounded-xl font-bold outline-none font-sans text-gray-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Téléphone</label>
                            <input 
                              type="text"
                              value={editedStorePhone}
                              onChange={(e) => setEditedStorePhone(e.target.value)}
                              className="w-full text-xs px-3.5 py-2 bg-white border border-gray-200 rounded-xl font-bold outline-none font-sans text-gray-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Adresse / Localisation</label>
                            <input 
                              type="text"
                              value={editedStoreAddress}
                              onChange={(e) => setEditedStoreAddress(e.target.value)}
                              className="w-full text-xs px-3.5 py-2 bg-white border border-gray-200 rounded-xl font-bold outline-none font-sans text-gray-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Boutique Parent (Multi-Boutique)</label>
                            <select
                              value={editedStoreParentId}
                              onChange={(e) => setEditedStoreParentId(e.target.value)}
                              className="w-full text-xs px-3.5 py-2 bg-white border border-gray-200 rounded-xl font-bold outline-none font-sans text-gray-800"
                            >
                              <option value="">Aucune (Boutique Principale)</option>
                              {stores.filter(s => s.id !== selectedStore.id).map(s => (
                                <option key={`parent-store-select-${s.id}`} value={s.id}>{s.name || s.id}</option>
                              ))}
                            </select>
                            <p className="text-[8px] text-gray-400 font-medium italic mt-1 leading-normal">
                              Associer à un parent pour permettre à son administrateur de basculer et de gérer plusieurs sous-boutiques.
                            </p>
                          </div>
                          <button 
                            onClick={handleSaveStoreInfo}
                            className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                          >
                            Enregistrer les modifications
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3 text-gray-600 font-bold text-sm">
                            <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                               <Store size={18} />
                            </div>
                            <div>
                              <p className="text-[8px] font-black uppercase text-gray-400 block leading-none mb-0.5">Nom de Boutique</p>
                              <p className="font-extrabold text-slate-800 text-xs">{selectedStore.name || 'Inconnu'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-gray-600 font-bold text-sm">
                            <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                               <Phone size={18} />
                            </div>
                            <div>
                              <p className="text-[8px] font-black uppercase text-gray-400 block leading-none mb-0.5">Téléphone</p>
                              <p className="font-extrabold text-slate-800 text-xs">{selectedStore.phone || 'Non renseigné'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-gray-600 font-bold text-sm">
                            <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                               <MapPin size={18} />
                            </div>
                            <div>
                              <p className="text-[8px] font-black uppercase text-gray-400 block leading-none mb-0.5">Adresse</p>
                              <p className="font-extrabold text-slate-800 text-xs">{selectedStore.address || 'Non renseignée'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-gray-600 font-bold text-sm">
                            <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                               <Globe size={18} />
                            </div>
                            <div>
                              <p className="text-[8px] font-black uppercase text-gray-400 block leading-none mb-0.5">Structure</p>
                              <p className="font-extrabold text-xs">
                                {(selectedStore as any).parentStoreId ? (
                                  <span className="text-indigo-600">
                                    Sous-boutique de: <span className="font-black underline">{stores.find(s => s.id === (selectedStore as any).parentStoreId)?.name || 'Boutique Principale'}</span>
                                  </span>
                                ) : (
                                  <span className="text-emerald-600 font-black">
                                    Boutique Principale (Parent)
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Statut Système</h3>
                      <div className={`p-6 rounded-3xl border ${selectedStore.licenseStatus === 'active' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                         <div className="flex items-center justify-between mb-4">
                            <span className="font-black text-sm uppercase tracking-tight">Licence PRO</span>
                            <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${selectedStore.licenseStatus === 'active' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                              {selectedStore.licenseStatus}
                            </div>
                         </div>
                         <p className="text-[10px] text-gray-500 font-bold leading-relaxed">
                            Expire le : {selectedStore.licenseExpiry ? new Date(selectedStore.licenseExpiry).toLocaleDateString() : 'N/A'}
                         </p>
                      </div>
                    </div>

                    {/* Administrateur & Identifiants Card */}
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col gap-4">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Identifiants de Connexion Admin</h4>
                        {!editingAdminUser && storeAdminUser && (
                          <button 
                            type="button"
                            onClick={() => {
                              setEditingAdminUser(storeAdminUser);
                              setEditedAdminEmail(storeAdminUser.email || '');
                              setEditedAdminPassword(storeAdminUser.password || '');
                            }}
                            className="text-[10px] font-black text-orange-600 uppercase tracking-widest hover:underline cursor-pointer"
                          >
                            Modifier
                          </button>
                        )}
                      </div>
                      
                      {storeAdminUser ? (
                        editingAdminUser && editingAdminUser.uid === storeAdminUser.uid ? (
                          <div className="space-y-4">
                            <div>
                              <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Email Administrateur</label>
                              <input 
                                type="email"
                                value={editedAdminEmail}
                                onChange={(e) => setEditedAdminEmail(e.target.value)}
                                className="w-full text-xs px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-orange-500/10 transition-all text-slate-800"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Nouveau Mot de passe</label>
                              <input 
                                type="text"
                                placeholder="Nouveau mot de passe"
                                value={editedAdminPassword}
                                onChange={(e) => setEditedAdminPassword(e.target.value)}
                                className="w-full text-xs px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl font-mono font-bold outline-none focus:ring-2 focus:ring-orange-500/10 transition-all text-slate-800"
                              />
                            </div>
                            <div className="flex gap-2 pt-2">
                              <button 
                                type="button"
                                onClick={() => setEditingAdminUser(null)}
                                className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 text-slate-600 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all"
                                disabled={isUpdatingCredentials}
                              >
                                Annuler
                              </button>
                              <button 
                                type="button"
                                onClick={() => handleUpdateAdminCredentials(storeAdminUser.uid, editedAdminEmail, editedAdminPassword)}
                                className="flex-1 py-2 bg-slate-900 hover:bg-black text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-55"
                                disabled={isUpdatingCredentials}
                              >
                                {isUpdatingCredentials ? "Enregistrement..." : "Enregistrer"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Email Admin</span>
                              <span className="text-xs font-bold text-slate-700 bg-white border border-gray-50 rounded-xl px-3 py-2 select-all flex items-center gap-1.5 overflow-x-auto truncate">
                                <Mail size={12} className="text-slate-400 shrink-0" />
                                {storeAdminUser.email}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Mot de passe</span>
                              <span className="text-xs font-mono font-bold text-slate-700 bg-white border border-gray-50 rounded-xl px-3 py-1.5 select-all flex items-center gap-1.5 overflow-x-auto truncate">
                                <Lock size={12} className="text-slate-400 shrink-0" />
                                {storeAdminUser.password || <span className="italic text-gray-400 font-sans">Non enregistré (cliquez Modifier pour en définir un)</span>}
                              </span>
                            </div>
                          </div>
                        )
                      ) : (
                        <div className="text-center py-2">
                          <p className="text-[10px] text-gray-400 font-bold leading-relaxed">Aucun compte administrateur trouvé pour cette boutique.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Utilisateurs Enregistrés</h3>
                    <div className="space-y-3">
                      {allUsers.filter(u => u.storeId === selectedStore.id).map(user => (
                        <div key={`modal-user-${user.uid}`} className="flex items-center justify-between p-5 bg-gray-50 rounded-3xl group hover:bg-white hover:shadow-xl hover:shadow-gray-200/50 transition-all border border-transparent hover:border-gray-100">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center overflow-hidden border border-gray-100 shadow-sm">
                              {user.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" /> : <User size={20} className="text-gray-300" />}
                            </div>
                            <div>
                               <p className="font-black text-gray-900 text-sm tracking-tight">{user.displayName || 'Utilisateur'}</p>
                               <div className="flex items-center gap-2">
                                  <Mail size={12} className="text-gray-400" />
                                  <span className="text-[10px] font-bold text-gray-500">{user.email}</span>
                               </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="px-3 py-1 bg-white border border-gray-100 rounded-full text-[8px] font-black uppercase tracking-widest text-gray-500">
                              {user.role}
                            </span>
                            <div className="relative group/user">
                              <button 
                                onClick={() => handleToggleUserStatus(user.uid, user.isActive !== false)}
                                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                                  user.isActive !== false ? 'bg-orange-50 text-orange-600 hover:bg-orange-600 hover:text-white' : 'bg-green-50 text-green-600 hover:bg-green-600 hover:text-white'
                                }`}
                              >
                                 <Power size={18} />
                              </button>
                              <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-black text-white text-[10px] font-bold rounded-xl opacity-0 group-hover/user:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl z-50">
                                {user.isActive !== false ? "Désactiver l'utilisateur" : "Activer l'utilisateur"}
                                <div className="absolute top-full right-4 border-4 border-transparent border-t-black" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Annexes (Filiales) Management Section */}
                    <div className="mt-12 pt-8 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Annexes & Filiales de la Boutique</h3>
                          <p className="text-[10px] text-gray-500 font-medium">Les succursales créées pourront être configurées par zone par l'administrateur principal de la boutique.</p>
                        </div>
                        <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black text-slate-700">
                          {((selectedStore as any).annexes || []).length} Succursale(s)
                        </span>
                      </div>

                      {/* Annex list */}
                      <div className="space-y-3 mb-6">
                        {((selectedStore as any).annexes || []).length === 0 ? (
                          <div className="text-center py-8 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                            <Globe size={32} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-xs text-gray-400 font-bold">Aucune annexe configurée pour le moment.</p>
                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Complétez le formulaire ci-dessous pour en ajouter une.</p>
                          </div>
                        ) : (
                          ((selectedStore as any).annexes || []).map((annexe: any) => (
                            <div key={`modal-annexe-${annexe.id}`} className="flex items-center justify-between p-5 bg-gray-50 rounded-3xl border border-gray-100">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-black text-gray-900 text-sm tracking-tight">{annexe.name}</h4>
                                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[8px] font-black uppercase tracking-wider">
                                    {annexe.zone}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-0.5 mt-1 text-[10px] text-gray-500 font-semibold font-sans">
                                  {annexe.address && <p>📍 {annexe.address}</p>}
                                  {annexe.phone && <p>📞 {annexe.phone}</p>}
                                </div>
                              </div>
                              <button 
                                onClick={() => handleDeleteAnnexe(annexe.id)}
                                className="w-9 h-9 rounded-xl bg-red-50 hover:bg-red-600 text-red-600 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                                title="Supprimer l'annexe"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Creator Form */}
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100/60">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-4">Créer une nouvelle annexe</span>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Nom de l'annexe *</label>
                            <input 
                              type="text"
                              placeholder="ex: Dakar Plateau, Annexe Nord"
                              value={newAnnexeName}
                              onChange={(e) => setNewAnnexeName(e.target.value)}
                              className="w-full text-xs px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-orange-500/10 transition-all text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Zone Géographique / Ville *</label>
                            <input 
                              type="text"
                              placeholder="ex: Dakar, Thiès, Zone A"
                              value={newAnnexeZone}
                              onChange={(e) => setNewAnnexeZone(e.target.value)}
                              className="w-full text-xs px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-orange-500/10 transition-all text-slate-800"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Adresse de l'annexe (Optionnel)</label>
                            <input 
                              type="text"
                              placeholder="ex: Rue 12, Avenue Lamine Gueye"
                              value={newAnnexeAddress}
                              onChange={(e) => setNewAnnexeAddress(e.target.value)}
                              className="w-full text-xs px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-orange-500/10 transition-all text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Téléphone de l'annexe (Optionnel)</label>
                            <input 
                              type="text"
                              placeholder="ex: +221 77 123 45 67"
                              value={newAnnexePhone}
                              onChange={(e) => setNewAnnexePhone(e.target.value)}
                              className="w-full text-xs px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl font-sans font-bold outline-none focus:ring-2 focus:ring-orange-500/10 transition-all text-slate-800"
                            />
                          </div>
                        </div>

                        <button 
                          onClick={handleCreateAnnexe}
                          className="w-full py-3 bg-slate-900 hover:bg-black text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Globe size={14} />
                          Enregistrer & Créer l'Annexe
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Store Modal */}
      <AnimatePresence>
        {isCreatingStore && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="bg-white w-full max-w-xl overflow-hidden rounded-[40px] shadow-2xl border border-white/20 flex flex-col"
            >
              <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-orange-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                    <Store size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase italic">Nouvelle Boutique</h2>
                    <p className="text-[10px] text-orange-600 font-bold uppercase tracking-widest leading-none">Création manuelle directe</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsCreatingStore(false)}
                  className="w-10 h-10 bg-white text-gray-400 hover:text-gray-900 rounded-xl flex items-center justify-center transition-all"
                >
                  <XCircle size={24} />
                </button>
              </div>

              <form onSubmit={handleCreateStore} className="p-8 space-y-6">
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Nom de la Boutique *</label>
                    <input 
                      type="text" 
                      required
                      value={newStoreData.name}
                      onChange={(e) => setNewStoreData({...newStoreData, name: e.target.value})}
                      placeholder="Ex: Marché Central"
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-orange-500/10 outline-none font-bold transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Email Administrateur *</label>
                    <input 
                      type="email" 
                      required
                      value={newStoreData.adminEmail}
                      onChange={(e) => setNewStoreData({...newStoreData, adminEmail: e.target.value})}
                      placeholder="admin@boutique.com"
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-orange-500/10 outline-none font-bold transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Mot de Passe Admin *</label>
                    <input 
                      type="password" 
                      required
                      value={newStoreData.password}
                      onChange={(e) => setNewStoreData({...newStoreData, password: e.target.value})}
                      placeholder="••••••"
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-orange-500/10 outline-none font-bold transition-all animate-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Téléphone</label>
                      <input 
                        type="tel" 
                        value={newStoreData.phone}
                        onChange={(e) => setNewStoreData({...newStoreData, phone: e.target.value})}
                        placeholder="+228..."
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-orange-500/10 outline-none font-bold transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Localisation</label>
                      <input 
                        type="text" 
                        value={newStoreData.address}
                        onChange={(e) => setNewStoreData({...newStoreData, address: e.target.value})}
                        placeholder="Lomé, Agoè-Nyivé"
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-orange-500/10 outline-none font-bold transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setIsCreatingStore(false)}
                    className="flex-1 py-4 bg-gray-50 text-gray-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-100 transition-all"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={18} />
                    Confirmer la Création
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Custom Confirmation Modal */}
        {confirmModal && confirmModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={confirmModal.onCancel}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md overflow-hidden rounded-[32px] shadow-2xl border border-gray-100 p-8 relative z-10"
            >
              <div className="w-12 h-12 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center mb-6">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight mb-2 uppercase italic">{confirmModal.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-8">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button 
                  onClick={confirmModal.onCancel}
                  className="flex-1 py-3.5 bg-gray-50 hover:bg-gray-100 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                >
                  Annuler
                </button>
                <button 
                  onClick={confirmModal.onConfirm}
                  className="flex-1 py-3.5 bg-slate-900 hover:bg-black text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95"
                >
                  Confirmer
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Custom Alert Modal */}
        {alertModal && alertModal.isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAlertModal(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md overflow-hidden rounded-[32px] shadow-2xl border border-gray-100 p-8 relative z-10"
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 ${
                alertModal.type === 'error' ? 'bg-red-50 text-red-500' : 
                alertModal.type === 'success' ? 'bg-green-50 text-green-500' : 'bg-blue-50 text-blue-500'
              }`}>
                {alertModal.type === 'error' ? <ShieldAlert size={24} /> : 
                 alertModal.type === 'success' ? <CheckCircle2 size={24} /> : <Activity size={24} />}
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight mb-2 uppercase italic">{alertModal.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-8">{alertModal.message}</p>
              <button 
                onClick={() => setAlertModal(null)}
                className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-95 ${
                  alertModal.type === 'error' ? 'bg-red-600 hover:bg-red-700 text-white' : 
                  alertModal.type === 'success' ? 'bg-slate-900 hover:bg-black text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                Fermer
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
