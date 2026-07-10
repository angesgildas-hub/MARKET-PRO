import React, { useState, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { 
  Shield, 
  User, 
  Palette, 
  Database, 
  Lock, 
  History,
  Check,
  Download,
  Upload,
  AlertCircle,
  Eye,
  RefreshCcw,
  Plus,
  Globe,
  Mail,
  ShoppingBag,
  X,
  ArrowRight,
  ShieldCheck,
  UserPlus,
  Trash2,
  Edit3,
  Search,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  Smartphone,
  MessageSquare
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit, addDoc, serverTimestamp, doc, setDoc, getDoc, updateDoc, deleteDoc, getDocs, where } from 'firebase/firestore';
import { updateProfile, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { db, auth, config } from '../lib/firebase';
import { AuditLog, StoreSettings, UserProfile, UserRole, UserPermissions, ModulePermissions } from '../types';
import { logAction, AuditAction } from '../services/audit';
import { AppContext, Theme } from '../App';
import { translations, Language } from '../lib/translations';
import { handleFirestoreError, OperationType } from '../services/db';
import defaultLogo from '../assets/images/market_pro_logo_1781718180029.jpg';

export default function Settings() {
  const { language, setLanguage, theme, setTheme, userRole, setUserRole, userProfile, verifyAction } = useContext(AppContext);
  const t = translations[language];
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab');
  
  const setActiveTab = (tab: string | null) => {
    if (tab === 'security' || tab === 'users') {
      if (!verifiedTabs.includes(tab)) {
        checkMasterPassword('NAVIGATE', tab);
        return;
      }
    }
    if (tab) {
      setSearchParams({ tab });
    } else {
      setSearchParams({});
    }
  };

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    id: 'main',
    name: 'SuperMarket Pro',
    address: 'Dakar, Sénégal',
    phone: '+221 33 000 00 00',
    updatedAt: new Date().toISOString()
  });
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [selectedUserPhoto, setSelectedUserPhoto] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [usersSubTab, setUsersSubTab] = useState<'list' | 'matrix'>('list');
  const [matrixDrafts, setMatrixDrafts] = useState<Record<string, UserPermissions>>({});

  // Sensitive Settings Password
  const [isSetPasswordOpen, setIsSetPasswordOpen] = useState(false);
  const [isVerifyPasswordOpen, setIsVerifyPasswordOpen] = useState(false);
  const [verifiedTabs, setVerifiedTabs] = useState<string[]>([]);
  const [settingsPasswordInput, setSettingsPasswordInput] = useState('');
  const [verifyPasswordError, setVerifyPasswordError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: string; data?: any } | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [restoreData, setRestoreData] = useState<any>(null);

  // States for Annexes & Zones configuration
  const [editingAnnexe, setEditingAnnexe] = useState<any | null>(null);
  const [editedAnnexeName, setEditedAnnexeName] = useState('');
  const [editedAnnexeZone, setEditedAnnexeZone] = useState('');
  const [editedAnnexeAddress, setEditedAnnexeAddress] = useState('');
  const [editedAnnexePhone, setEditedAnnexePhone] = useState('');
  const [editedAnnexeIsActive, setEditedAnnexeIsActive] = useState(true);

  const handleStartEditAnnexe = (annexe: any) => {
    setEditingAnnexe(annexe);
    setEditedAnnexeName(annexe.name || '');
    setEditedAnnexeZone(annexe.zone || '');
    setEditedAnnexeAddress(annexe.address || '');
    setEditedAnnexePhone(annexe.phone || '');
    setEditedAnnexeIsActive(annexe.isActive !== false);
  };

  const handleSaveAnnexeConfig = async () => {
    if (!userProfile?.storeId || !editingAnnexe) return;
    if (!editedAnnexeName.trim() || !editedAnnexeZone.trim()) {
      alert("Le nom et la zone de l'annexe sont requis.");
      return;
    }

    try {
      setIsActionLoading(true);
      const currentAnnexes = (storeSettings as any).annexes || [];
      const updatedAnnexes = currentAnnexes.map((a: any) => {
        if (a.id === editingAnnexe.id) {
          return {
            ...a,
            name: editedAnnexeName.trim(),
            zone: editedAnnexeZone.trim(),
            address: editedAnnexeAddress.trim(),
            phone: editedAnnexePhone.trim(),
            isActive: editedAnnexeIsActive
          };
        }
        return a;
      });

      const updatedSettings = {
        ...storeSettings,
        annexes: updatedAnnexes,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'storeSettings', userProfile.storeId), updatedSettings);
      
      setStoreSettings(updatedSettings as any);

      await logAction(
        userProfile.storeId,
        auth.currentUser?.uid || '',
        userProfile.displayName || '',
        AuditAction.SETTINGS_UPDATE,
        `Configuration de l'annexe ${editedAnnexeName} mise à jour.`,
        { annexeId: editingAnnexe.id }
      );

      setEditingAnnexe(null);
      alert('Configuration de l\'annexe enregistrée avec succès !');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `storeSettings/${userProfile.storeId}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  useEffect(() => {
    if (userProfile && !userProfile.settingsPassword && !isSetPasswordOpen) {
      setIsSetPasswordOpen(true);
    }
  }, [userProfile]);

  useEffect(() => {
    if (!userProfile?.storeId) return;
    const unsubStore = onSnapshot(doc(db, 'storeSettings', userProfile.storeId), (snap) => {
      if (snap.exists()) {
        setStoreSettings(snap.data() as StoreSettings);
      } else {
        setStoreSettings({
          id: userProfile.storeId,
          name: userProfile.storeName || 'SuperMarket Pro',
          address: 'Dakar, Sénégal',
          phone: '+221 33 000 00 00',
          updatedAt: new Date().toISOString()
        });
      }
    }, (error) => {
      console.error("Error fetching store settings:", error);
    });
    return () => unsubStore();
  }, [userProfile?.storeId]);

  const annexesString = JSON.stringify(((storeSettings as any)?.annexes || []).map((a: any) => a.id));

  useEffect(() => {
    if (userRole !== 'admin' || !userProfile?.storeId) return;

    let unsubUsers = () => {};
    let unsubLogs = () => {};

    const parentId = userProfile.parentStoreId || userProfile.storeId;
    const annexesIds = JSON.parse(annexesString) as string[];
    const authorizedStoreIds = [parentId, ...annexesIds].filter(Boolean);
    const queryStores = authorizedStoreIds.length > 0 ? authorizedStoreIds : [userProfile.storeId];

    unsubUsers = onSnapshot(query(collection(db, 'users'), where('storeId', 'in', queryStores)), (snap) => {
      const fetchedUsers = snap.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile));
      fetchedUsers.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt as any).getTime() : 0);
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt as any).getTime() : 0);
        return timeB - timeA;
      });
      setUsers(fetchedUsers);
    }, (error) => {
      console.warn("Permission denied for users list - expected for non-admins.", error);
    });

    unsubLogs = onSnapshot(query(collection(db, 'auditLogs'), where('storeId', '==', userProfile.storeId), orderBy('timestamp', 'desc'), limit(50)), (snap) => {
      setLogs(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as AuditLog)));
    }, (error) => {
      console.warn("Permission denied for audit logs - expected for non-admins.");
    });

    return () => {
      unsubUsers();
      unsubLogs();
    };
  }, [userRole, userProfile?.storeId, annexesString]);

  const handleSetSettingsPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const password = formData.get('password') as string;
    const confirm = formData.get('confirm') as string;

    if (password.length < 4) {
      alert("Le mot de passe doit faire au moins 4 caractères.");
      return;
    }
    if (password !== confirm) {
      alert("Les mots de passe ne correspondent pas.");
      return;
    }

    try {
      await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
        settingsPassword: password
      });
      setIsSetPasswordOpen(false);
      alert("Changement du mot de passe effectué avec succès !");
    } catch (err) {
      alert("Erreur lors de l'enregistrement.");
    }
  };

  const checkMasterPassword = (actionType: string, actionData?: any) => {
    if (!userProfile?.settingsPassword) {
      setIsSetPasswordOpen(true);
      return;
    }
    setVerifyPasswordError(null);
    setPendingAction({ type: actionType, data: actionData });
    setIsVerifyPasswordOpen(true);
  };

  const handleVerifyPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (settingsPasswordInput === userProfile?.settingsPassword) {
      const action = pendingAction;
      setPendingAction(null);
      setIsVerifyPasswordOpen(false);
      setSettingsPasswordInput('');
      setVerifyPasswordError(null);
      
      switch (action?.type) {
        case 'RESET': executeSystemReset(); break;
        case 'RESTORE': executeRestore(); break;
        case 'SAVE_STORE': handleSaveStoreSettings(); break;
        case 'ADD_USER': setIsAddUserOpen(true); break;
        case 'DELETE_USER': handleDeleteUser(action.data); break;
        case 'UPDATE_PERMISSIONS': handleUpdateUserPermissions(action.data.uid, action.data.permissions); break;
        case 'UPDATE_ROLE': handleUpdateUserRole(action.data.uid, action.data.role); break;
        case 'TOGGLE_STATUS': handleToggleUserStatus(action.data.uid, action.data.isActive); break;
        case 'RESET_USER_PASS': handleAdminResetPassword(action.data.email); break;
        case 'NAVIGATE': 
           if (action.data) {
             setVerifiedTabs(prev => [...prev, action.data]);
             setSearchParams({ tab: action.data });
           }
           break;
      }
    } else {
      setSettingsPasswordInput('');
      setVerifyPasswordError("Mot de passe incorrect, veuillez réessayer.");
    }
  };

  const defaultPermissions = (): UserPermissions => ({
    pos: { read: true, create: true, update: true, delete: true },
    inventory: { read: true, create: true, update: true, delete: true },
    accounting: { read: false, create: false, update: false, delete: false },
    settings: { read: false, create: false, update: false, delete: false },
    reports: { read: true, create: false, update: false, delete: false },
    personnel: { read: false, create: false, update: false, delete: false },
    clients: { read: true, create: true, update: true, delete: true },
    sales: { read: true, create: false, update: false, delete: false },
    commandes: { read: true, create: true, update: true, delete: true },
    mobile_money: { read: true, create: true, update: true, delete: true },
    chat: { read: true, create: true, update: true, delete: true }
  });

  const fullAdminPermissions = (): UserPermissions => ({
    pos: { read: true, create: true, update: true, delete: true },
    inventory: { read: true, create: true, update: true, delete: true },
    accounting: { read: true, create: true, update: true, delete: true },
    settings: { read: true, create: true, update: true, delete: true },
    reports: { read: true, create: true, update: true, delete: true },
    personnel: { read: true, create: true, update: true, delete: true },
    clients: { read: true, create: true, update: true, delete: true },
    sales: { read: true, create: true, update: true, delete: true },
    commandes: { read: true, create: true, update: true, delete: true },
    mobile_money: { read: true, create: true, update: true, delete: true },
    chat: { read: true, create: true, update: true, delete: true }
  });

  const getUserDefaultPermissions = (email: string): UserPermissions => {
    const emailNorm = (email || '').trim().toLowerCase();
    if (emailNorm === 'anges.gildas@gmail.com' || emailNorm === 'gildas@gmail.com') {
      return fullAdminPermissions();
    }
    return defaultPermissions();
  };

  const createAuditLog = async (action: string, details: string) => {
    if (!userProfile?.storeId) {
      console.warn("Skipping Audit Log: storeId is missing", { action, details });
      return;
    }
    try {
      await addDoc(collection(db, 'auditLogs'), {
        storeId: userProfile.storeId,
        action,
        details,
        userId: auth.currentUser?.uid,
        userName: userProfile?.displayName || auth.currentUser?.displayName || 'Système',
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Erreur Audit Log:", e);
    }
  };

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = async () => {
          // Create canvas for compression/resizing
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 200;
          const MAX_HEIGHT = 200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Compress to JPEG with 0.6 quality for small payload size (kb instead of mb)
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);

          try {
            await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
              photoURL: compressedBase64
            });
            setIsUploading(false);
            alert("Photo de profil mise à jour !");
          } catch (updateErr: any) {
            console.error("Error updating user photo:", updateErr);
            alert("Erreur lors de la mise à jour de la photo: " + (updateErr.message || "La taille du fichier dépasse les limites."));
            setIsUploading(false);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setIsUploading(false);
    }
  };

  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        setRestoreData(data);
        checkMasterPassword('RESTORE');
      } catch (err) {
        alert("Fichier de sauvegarde invalide.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const executeRestore = async () => {
    if (!restoreData || !userProfile?.storeId) return;
    setIsActionLoading(true);
    try {
      for (const collName in restoreData) {
        // Query only current store documents
        const snap = await getDocs(query(collection(db, collName), where('storeId', '==', userProfile.storeId)));
        for (const d of snap.docs) {
          if (collName === 'sales') {
            const itemsSnap = await getDocs(collection(db, `sales/${d.id}/items`));
            await Promise.all(itemsSnap.docs.map(idoc => deleteDoc(idoc.ref)));
          }
          await deleteDoc(d.ref);
        }
        
        const items = restoreData[collName];
        for (const item of items) {
           const { id, items: subItems, ...rest } = item;
           // Ensure storeId mismatch doesn't happen on restore
           await setDoc(doc(db, collName, id), { ...rest, storeId: userProfile.storeId });
           if (collName === 'sales' && subItems) {
              for (const subItem of subItems) {
                 const { id: sId, ...sRest } = subItem;
                 await setDoc(doc(db, `sales/${id}/items`, sId), { ...sRest, storeId: userProfile.storeId });
              }
           }
        }
      }
      
      createAuditLog('SYSTEM_RESTORE', 'Restauration complète des données effectuée.');
      alert("Restauration réussie !");
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert("Une erreur est survenue lors de la restauration.");
    } finally {
      setIsActionLoading(false);
      setRestoreData(null);
    }
  };

  const executeSystemReset = async () => {
    if (!userProfile?.storeId) return;
    setIsSyncing(true);
    setIsActionLoading(true);
    try {
      const collectionsToEmpty = ['products', 'sales', 'expenses', 'auditLogs', 'employees', 'leaves', 'payroll', 'clients'];

      for (const collName of collectionsToEmpty) {
        const snap = await getDocs(query(collection(db, collName), where('storeId', '==', userProfile.storeId)));
        for (const d of snap.docs) {
          if (collName === 'sales') {
            const itemsSnap = await getDocs(collection(db, `sales/${d.id}/items`));
            for (const idoc of itemsSnap.docs) {
              await deleteDoc(idoc.ref);
            }
          }
          await deleteDoc(d.ref);
        }
      }

      await createAuditLog('SYSTEM_RESET', 'Réinitialisation complète du système effectuée.');
      alert("Application réinitialisée avec succès !");
      window.location.reload();
    } catch (err: any) {
      console.error("Reset All Error:", err);
      alert("Une erreur est survenue lors de la réinitialisation : " + (err.message || 'Erreur inconnue'));
    } finally {
      setIsSyncing(false);
      setIsActionLoading(false);
    }
  };


  const handleUpdateUserRole = async (uid: string, newRole: UserRole) => {
    if (uid === auth.currentUser?.uid) {
       alert("Vous ne pouvez pas changer votre propre rôle pour éviter de vous bloquer.");
       return;
    }
    
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      await logAction(
        userProfile?.storeId || '',
        auth.currentUser?.uid || '',
        userProfile?.displayName || '',
        AuditAction.USER_ROLE_CHANGE,
        `Rôle de l'utilisateur ${uid} mis à jour en ${newRole}.`,
        { targetUid: uid, newRole }
      );
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleUpdateUserPermissions = async (uid: string, permissions: UserPermissions) => {
    try {
      await updateDoc(doc(db, 'users', uid), { permissions });
      createAuditLog('USER_PERMISSIONS_UPDATED', `Permissions de l'utilisateur ${uid} mises à jour.`);
      alert("Permissions enregistrées !");
      setEditingUser(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleToggleMatrixPermission = (uid: string, module: keyof UserPermissions, action: keyof ModulePermissions, currentValue: boolean) => {
    const userToUpdate = users.find(u => u.uid === uid);
    if (!userToUpdate) return;
    
    const userPermissions = matrixDrafts[uid] || userToUpdate.permissions || getUserDefaultPermissions(userToUpdate.email || '');
    const newPermissions = {
      ...userPermissions,
      [module]: {
        ...(userPermissions[module] || { read: false, create: false, update: false, delete: false }),
        [action]: !currentValue
      }
    };
    
    setMatrixDrafts(prev => ({
      ...prev,
      [uid]: newPermissions
    }));
  };

  const handleApplyRolePresets = (uid: string, role: UserRole) => {
    const userToUpdate = users.find(u => u.uid === uid);
    if (!userToUpdate) return;
    
    let newPermissions = getUserDefaultPermissions(userToUpdate.email || '');
    if (role === 'cashier') {
      newPermissions = {
        pos: { read: true, create: true, update: true, delete: true },
        inventory: { read: false, create: false, update: false, delete: false },
        accounting: { read: false, create: false, update: false, delete: false },
        settings: { read: false, create: false, update: false, delete: false },
        reports: { read: false, create: false, update: false, delete: false },
        personnel: { read: false, create: false, update: false, delete: false },
        clients: { read: true, create: true, update: true, delete: false },
        sales: { read: true, create: false, update: false, delete: false },
        commandes: { read: true, create: true, update: true, delete: false },
        mobile_money: { read: true, create: true, update: true, delete: false },
        chat: { read: true, create: true, update: true, delete: true }
      };
    } else if (role === 'manager') {
      newPermissions = {
        pos: { read: true, create: true, update: true, delete: true },
        inventory: { read: true, create: true, update: true, delete: true },
        accounting: { read: true, create: true, update: true, delete: false },
        settings: { read: false, create: false, update: false, delete: false },
        reports: { read: true, create: true, update: true, delete: false },
        personnel: { read: true, create: true, update: true, delete: false },
        clients: { read: true, create: true, update: true, delete: true },
        sales: { read: true, create: true, update: true, delete: true },
        commandes: { read: true, create: true, update: true, delete: true },
        mobile_money: { read: true, create: true, update: true, delete: true },
        chat: { read: true, create: true, update: true, delete: true }
      };
    } else if (role === 'admin') {
      newPermissions = {
        pos: { read: true, create: true, update: true, delete: true },
        inventory: { read: true, create: true, update: true, delete: true },
        accounting: { read: true, create: true, update: true, delete: true },
        settings: { read: true, create: true, update: true, delete: true },
        reports: { read: true, create: true, update: true, delete: true },
        personnel: { read: true, create: true, update: true, delete: true },
        clients: { read: true, create: true, update: true, delete: true },
        sales: { read: true, create: true, update: true, delete: true },
        commandes: { read: true, create: true, update: true, delete: true },
        mobile_money: { read: true, create: true, update: true, delete: true },
        chat: { read: true, create: true, update: true, delete: true }
      };
    }
    
    setMatrixDrafts(prev => ({
      ...prev,
      [uid]: newPermissions
    }));
  };

  const handleSaveMatrixDrafts = async () => {
    const uids = Object.keys(matrixDrafts);
    if (uids.length === 0) {
      alert("Aucune modification à enregistrer.");
      return;
    }
    
    setIsActionLoading(true);
    try {
      for (const uid of uids) {
        const permissions = matrixDrafts[uid];
        await updateDoc(doc(db, 'users', uid), { permissions });
        const userObj = users.find(u => u.uid === uid);
        await createAuditLog('USER_PERMISSIONS_UPDATED', `Matrice: Perms mis à jour en masse pour ${userObj?.displayName || uid}.`);
      }
      setMatrixDrafts({});
      alert("Modifications effectuées avec succès !");
    } catch (e: any) {
      console.error("Error saving matrix drafts:", e);
      alert("Une erreur est survenue lors de l'enregistrement de la matrice.");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleToggleUserStatus = async (uid: string, currentStatus: boolean = true) => {
    if (uid === auth.currentUser?.uid) {
       alert("Vous ne pouvez pas désactiver votre propre compte.");
       return;
    }
    
    try {
      await updateDoc(doc(db, 'users', uid), { isActive: !currentStatus });
      await logAction(
        userProfile?.storeId || '',
        auth.currentUser?.uid || '',
        userProfile?.displayName || '',
        AuditAction.USER_STATUS_CHANGE,
        `Statut de l'utilisateur ${uid} mis à jour : ${!currentStatus ? 'Actif' : 'Inactif'}.`,
        { targetUid: uid, isActive: !currentStatus }
      );
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleAdminResetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      alert(`Email de réinitialisation envoyé à ${email} !`);
      createAuditLog('ADMIN_PASS_RESET_TRIGGERED', `L'administrateur a déclenché une réinitialisation de mot de passe pour ${email}.`);
    } catch (e: any) {
      alert("Erreur lors de l'envoi de l'email : " + e.message);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const email = formData.get('email') as string;
    const name = formData.get('name') as string;
    const password = formData.get('password') as string;
    const role = formData.get('role') as UserRole;
    const targetStoreId = formData.get('targetStoreId') as string;

    if (!email || !name || !password) {
      alert("Veuillez remplir tous les champs, y compris le mot de passe.");
      return;
    }

    setIsSyncing(true);
    let secondaryApp = null;
    try {
      // Create user using a secondary Firebase Auth instance to avoid signing out current admin
      secondaryApp = initializeApp(config, 'Secondary');
      const secondaryAuth = getAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const uid = userCredential.user.uid;
      
      // Update Auth Profile
      await updateProfile(userCredential.user, { 
        displayName: name,
        photoURL: selectedUserPhoto || '' 
      });

      // Add to 'users' collection in main Firestore
      await setDoc(doc(db, 'users', uid), {
        uid,
        email,
        displayName: name,
        photoURL: selectedUserPhoto || '',
        role,
        storeId: targetStoreId || userProfile?.storeId,
        parentStoreId: userProfile?.parentStoreId || userProfile?.storeId,
        permissions: getUserDefaultPermissions(email),
        isActive: true,
        createdAt: serverTimestamp()
      });

      createAuditLog('USER_CREATED', `Utilisateur ${name} (${email}) créé avec accès direct.`);
      setIsAddUserOpen(false);
      alert(`Utilisateur ${name} créé avec succès ! Il peut maintenant se connecter.`);
    } catch (e: any) {
      console.error("Erreur création utilisateur:", e);
      const errorCode = e.code || "";
      const errorMessage = e.message || "";
      
      if (errorCode === 'auth/email-already-in-use' || errorMessage.includes('email-already-in-use')) {
        alert("Cet email est déjà utilisé par un autre compte.");
      } else if (errorCode === 'auth/weak-password' || errorMessage.includes('weak-password')) {
        alert("Le mot de passe est trop faible (6 caractères min).");
      } else {
        // Only log to system error if it's not a known user error
        alert("Erreur lors de la création de l'utilisateur: " + errorMessage);
      }
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (delError) {
          console.error("Erreur suppression secondaryApp:", delError);
        }
      }
      setIsSyncing(false);
    }
  };

  const isSuperAdmin = ['anges.gildas@gmail.com', 'gildas@gmail.com'].includes((auth.currentUser?.email || '').trim().toLowerCase());

  const handleDeleteUser = async (uid: string) => {
    const userToDelete = users.find(u => u.uid === uid);
    const adminEmails = ['anges.gildas@gmail.com', 'gildas@gmail.com'];
    
    if (uid === auth.currentUser?.uid) {
      alert("Vous ne pouvez pas vous supprimer vous-même.");
      return;
    }
    if (userToDelete && adminEmails.includes(userToDelete.email)) {
      alert("ATTENTION: Cet utilisateur est un administrateur système 'Bootstrap'. Sa suppression manuelle peut entraîner des recréations automatiques lors de sa prochaine connexion.");
      if (!confirm("Voulez-vous vraiment continuer la suppression de cet administrateur système ?")) return;
    }
    
    if (!isSuperAdmin && userRole !== 'admin' && userRole !== 'manager') {
      alert("Permission de suppression refusée. Seuls les administrateurs et chefs peuvent supprimer des comptes.");
      return;
    }
    
    verifyAction(async () => {
      try {
        setIsActionLoading(true);
        await deleteDoc(doc(db, 'users', uid));
        await createAuditLog('USER_DELETED', `Utilisateur ${uid} supprimé.`);
        alert("Utilisateur supprimé de la base de données avec succès !");
      } catch (e: any) {
        console.error("Delete User Error:", e);
        alert("Erreur lors de la suppression : " + (e.message || 'Fermeture impossible'));
      } finally {
        setIsActionLoading(false);
      }
    });
  };

  const handleSaveStoreSettings = async () => {
    if (!userProfile?.storeId) return;
    try {
      setIsActionLoading(true);
      
      // Force the store settings ID to match the user's store ID exactly.
      // This prevents any security rule violation if storeSettings has 'id: main' locally.
      const settingsToSave = {
        ...storeSettings,
        id: userProfile.storeId,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'storeSettings', userProfile.storeId), settingsToSave, { merge: true });
      
      await logAction(
        userProfile.storeId,
        auth.currentUser?.uid || '',
        userProfile.displayName || '',
        AuditAction.SETTINGS_UPDATE,
        'Configuration de la boutique mise à jour.',
        { settings: storeSettings }
      );

      alert('Informations de la boutique enregistrées avec succès !');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `storeSettings/${userProfile.storeId}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict limit for base64 storage in Firestore (Allow up to 10MB files to be uploaded and then compressed/resized)
    if (file.size > 10 * 1024 * 1024) {
      alert("Le fichier est trop volumineux (Max 10 Mo).");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        // Create canvas for compression/resizing
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 250;
        const MAX_HEIGHT = 250;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Export as compressed image (JPEG 0.6 is extremely lightweight and fast)
        const isPng = file.type === 'image/png';
        const compressedBase64 = isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.6);
        setStoreSettings(prev => ({ ...prev!, logoUrl: compressedBase64 }));
        setIsUploading(false);
      };
      img.onerror = () => {
        setIsUploading(false);
        alert("Erreur lors de la lecture de l'image.");
      };
      img.src = reader.result as string;
    };
    reader.onerror = () => {
      setIsUploading(false);
      alert("Erreur lors de la lecture du fichier.");
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("Le fichier est trop volumineux (Max 10 Mo).");
      return;
    }

    setIsUploadingSignature(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 250;
        const MAX_HEIGHT = 120;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const isPng = file.type === 'image/png';
        const compressedBase64 = isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.6);
        setStoreSettings(prev => ({ ...prev!, signatureUrl: compressedBase64 }));
        setIsUploadingSignature(false);
      };
      img.onerror = () => {
        setIsUploadingSignature(false);
        alert("Erreur lors de la lecture de l'image.");
      };
      img.src = reader.result as string;
    };
    reader.onerror = () => {
      setIsUploadingSignature(false);
      alert("Erreur lors de la lecture du fichier.");
    };
    reader.readAsDataURL(file);
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const displayName = formData.get('displayName') as string;
    const photoURL = formData.get('photoURL') as string;

    if (!auth.currentUser) return;

    try {
      const updateData: any = { displayName };
      
      // Only update photoURL if it's not the placeholder for base64
      if (photoURL !== 'Image enregistrée en base') {
        updateData.photoURL = photoURL;
      }
      
      await updateDoc(doc(db, 'users', auth.currentUser.uid), updateData);

      // Also try to update Auth profile (only non-base64 photoURL)
      const authUpdate: any = { displayName };
      if (photoURL && !photoURL.startsWith('data:') && photoURL !== 'Image enregistrée en base') {
        authUpdate.photoURL = photoURL;
      }
      await updateProfile(auth.currentUser, authUpdate);

      setShowSuccess(true);
      createAuditLog('PROFILE_UPDATED', `Profil de ${displayName} mis à jour.`);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (e: any) {
      handleFirestoreError(e, OperationType.UPDATE, 'profile');
    }
  };

  const handleBackup = async () => {
    if (!userProfile?.storeId) return;
    setIsSyncing(true);
    try {
      const collectionsToExport = [
        'products', 'sales', 'expenses', 'auditLogs', 
        'employees', 'leaves', 'payroll', 'storeSettings'
      ];

      const backupData: any = {};
      
      for (const collName of collectionsToExport) {
        let snap;
        if (collName === 'storeSettings') {
          const docRef = doc(db, 'storeSettings', userProfile.storeId);
          const docSnap = await getDoc(docRef);
          snap = { docs: docSnap.exists() ? [docSnap] : [] };
        } else {
          snap = await getDocs(query(collection(db, collName), where('storeId', '==', userProfile.storeId)));
        }
        backupData[collName] = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        
        // Export sales items subcollections
        if (collName === 'sales') {
          for (const sale of backupData.sales) {
             const itemsSnap = await getDocs(collection(db, `sales/${sale.id}/items`));
             sale.items = itemsSnap.docs.map(idoc => ({ ...idoc.data(), id: idoc.id }));
          }
        }
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MarketPro_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      createAuditLog('BACKUP_CREATED', 'Export complet des données du système effectué.');
      alert('Export réussi ! Le fichier de sauvegarde a été téléchargé.');
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'export des données.");
    } finally {
      setIsSyncing(false);
    }
  };

  const tabs = [
    { 
      id: 'store', 
      label: isSuperAdmin ? 'Paramètres Système' : (language === 'fr' ? 'Boutique' : 'Store'), 
      icon: isSuperAdmin ? Globe : ShoppingBag, 
      description: isSuperAdmin 
        ? 'Configuration globale de l\'application et redirections.' 
        : (language === 'fr' 
            ? 'Configurer le nom de la boutique, le logo, l\'adresse et le contact.' 
            : 'Configure store name, logo, address and contact.') 
    },
    ...(isSuperAdmin ? [] : [{ 
      id: 'annexes', 
      label: language === 'fr' ? 'Annexes & Zones' : 'Branches & Zones', 
      icon: Globe, 
      description: language === 'fr' 
        ? 'Configurez vos succursales de vente et gérez-les par zones géographiques.' 
        : 'Configure your sales branches and organize them by geographical zones.' 
    }]),
    { 
      id: 'profile', 
      label: t.profile, 
      icon: User, 
      description: language === 'fr' 
        ? 'Gérer vos informations personnelles et votre avatar.' 
        : 'Manage your personal information and avatar.' 
    },
    { 
      id: 'security', 
      label: t.security, 
      icon: Shield, 
      description: language === 'fr' 
        ? 'Configurer la double authentification et voir les sessions actives.' 
        : 'Configure 2FA and view active sessions.' 
    },
    { 
      id: 'users', 
      label: language === 'fr' ? "Comptes & Matrice d'Accès" : "Accounts & Access Matrix", 
      icon: Lock, 
      description: language === 'fr' 
        ? 'Gérer les comptes d\'accès, mots de passe et configurer la matrice globale de droits (Vente, Stock, Dépenses, RH).' 
        : 'Manage system login accounts, passwords, and configure the global access rights matrix (Sales, Inventory, Expenses, HR).' 
    },
    { 
      id: 'appearance', 
      label: t.appearance, 
      icon: Palette, 
      description: language === 'fr' 
        ? 'Changer le thème visuel et la langue du système.' 
        : 'Change theme and system language.' 
    },
    { 
      id: 'backup', 
      label: t.backup, 
      icon: Database, 
      description: language === 'fr' 
        ? 'Sauvegarder ou importer les fichiers de sauvegarde de l\'application.' 
        : 'Back up or restore your system data.' 
    },
    { 
      id: 'audit', 
      label: t.audit, 
      icon: History, 
      description: language === 'fr' 
        ? 'Consulter le journal d\'activité de sécurité et les logs d\'audit.' 
        : 'View system activity and security logs.' 
    },
    { 
      id: 'license', 
      label: 'Licence', 
      icon: ShieldCheck, 
      description: language === 'fr' 
        ? 'Gérer l\'état d\'activation de la licence de votre logiciel.' 
        : 'Manage system license and activation.' 
    },
    { 
      id: 'about', 
      label: t.about, 
      icon: AlertCircle, 
      description: language === 'fr' 
        ? 'Informations sur l\'application et statut de la licence.' 
        : 'System information and license status.' 
    },
  ];

  const [activationSuccess, setActivationSuccess] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(null);

  const handleUpdateLicense = (e: React.FormEvent) => {
    e.preventDefault();
    setLicenseError("Clé d'activation invalide ou expirée. Veuillez contacter le support technique G-Tech Lab au +228 91 03 30 04 ou par email à anges.gildas@gmail.com pour activer ou renouveler votre licence d'utilisation.");
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-gray-900">
            {activeTab ? tabs.find(t => t.id === activeTab)?.label : t.settings}
          </h1>
          <p className="text-gray-500 font-medium font-sans">
            {activeTab ? tabs.find(t => t.id === activeTab)?.description : 'Manage your system preferences and security.'}
          </p>
        </div>
        {activeTab && (
          <button 
            onClick={() => setActiveTab(null)}
            className="px-6 py-3 bg-gray-100 text-gray-900 rounded-2xl font-black text-sm hover:bg-gray-200 transition-all flex items-center gap-2"
          >
            <X size={18} />
            Retour
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {!activeTab ? (
          <motion.div 
            key="menu"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="group bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm text-left hover:border-orange-500 hover:shadow-2xl hover:shadow-gray-200/50 transition-all flex flex-col h-full"
              >
                <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 mb-6 group-hover:bg-orange-500 group-hover:text-white transition-all shadow-sm">
                  <tab.icon size={28} />
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-black text-gray-900">{tab.label}</h3>
                  {(tab.id === 'security' || tab.id === 'users') && !verifiedTabs.includes(tab.id) && (
                    <div className="p-1.5 bg-orange-50 rounded-lg text-orange-500 animate-pulse">
                      <Lock size={12} />
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-500 font-medium leading-relaxed">{tab.description}</p>
                <div className="mt-auto pt-6 flex items-center gap-2 text-orange-500 font-black text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all">
                  Ouvrir <ArrowRight size={14} />
                </div>
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-white p-8 lg:p-12 rounded-[48px] shadow-2xl shadow-gray-200/50 border border-white/50"
          >
            {(activeTab === 'security' || activeTab === 'users') && !verifiedTabs.includes(activeTab) ? (
              <div className="h-[50vh] flex flex-col items-center justify-center text-center space-y-8">
                <div className="w-24 h-24 bg-orange-50 rounded-[36px] flex items-center justify-center text-orange-500 shadow-2xl shadow-orange-500/10 transition-transform hover:scale-110">
                  <Lock size={48} />
                </div>
                <div className="space-y-2">
                   <h3 className="text-3xl font-black text-gray-900 tracking-tighter uppercase italic">Section Sécurisée</h3>
                   <p className="text-gray-500 font-medium max-w-xs mx-auto italic">Veuillez saisir votre mot de passe de sécurité pour accéder à ces réglages sensibles.</p>
                </div>
                <button 
                  onClick={() => checkMasterPassword('NAVIGATE', activeTab)}
                  className="px-12 py-5 bg-orange-500 text-white rounded-[24px] font-black uppercase tracking-widest text-[11px] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/30 active:scale-95 flex items-center gap-3"
                >
                  <Shield size={16} />
                  Déverrouiller l'accès
                </button>
              </div>
            ) : (
              <>
            {activeTab === 'store' && (
              <div className="space-y-12">
                <div className="flex flex-col sm:flex-row items-center gap-8">
                  <div className="relative group">
                    <div className="w-40 h-40 rounded-[48px] bg-gray-50 flex items-center justify-center text-gray-300 border-4 border-white shadow-2xl relative overflow-hidden transition-all hover:scale-105">
                      {storeSettings?.logoUrl ? (
                        <div className="relative w-full h-full">
                          <img src={storeSettings.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setStoreSettings(prev => ({ ...prev!, logoUrl: undefined }));
                            }}
                            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors"
                            title="Supprimer le logo"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="relative w-full h-full flex items-center justify-center">
                          <img src={defaultLogo} alt="Logo par défaut" className="w-full h-full object-cover opacity-40" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <ShoppingBag size={56} className="text-gray-400" />
                          </div>
                        </div>
                      )}
                      
                      {isUploading && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                          <RefreshCcw size={32} className="text-orange-500 animate-spin" />
                        </div>
                      )}

                      <label className="absolute inset-0 bg-gray-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-sm cursor-pointer text-center">
                        <Upload size={32} className="text-white mb-2" />
                        <span className="text-[10px] text-white font-black uppercase tracking-widest px-4 leading-tight">Changer le Logo</span>
                        <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                      </label>
                    </div>
                  </div>
                  <div className="text-center sm:text-left">
                    <h3 className="text-4xl font-black text-gray-900 mb-2">{storeSettings?.name || 'SuperMarket Pro'}</h3>
                    <p className="text-gray-500 font-medium max-w-sm">C'est ici que vous gérez l'identité de votre commerce. Le logo apparaîtra sur vos reçus thermiques.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Nom commercial</label>
                    <input 
                      type="text" 
                      placeholder=""
                      value={storeSettings?.name} 
                      onChange={e => setStoreSettings(prev => ({ ...prev!, name: e.target.value }))}
                      className="w-full px-8 py-6 bg-gray-50 border-2 border-transparent rounded-[32px] font-black text-gray-900 focus:bg-white focus:border-orange-500/20 focus:ring-4 focus:ring-orange-500/5 transition-all outline-none" 
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">URL du Logo</label>
                    <input 
                      type="text" 
                      placeholder=""
                      value={storeSettings?.logoUrl || ''} 
                      onChange={e => setStoreSettings(prev => ({ ...prev!, logoUrl: e.target.value }))}
                      className="w-full px-8 py-6 bg-gray-50 border-2 border-transparent rounded-[32px] font-black text-gray-900 focus:bg-white focus:border-orange-500/20 transition-all outline-none" 
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Adresse de la Boutique</label>
                    <input 
                      type="text" 
                      placeholder=""
                      value={storeSettings?.address} 
                      onChange={e => setStoreSettings(prev => ({ ...prev!, address: e.target.value }))}
                      className="w-full px-8 py-6 bg-gray-50 border-2 border-transparent rounded-[32px] font-black text-gray-900 focus:bg-white focus:border-orange-500/20 transition-all outline-none" 
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Téléphone / Contact</label>
                    <input 
                      type="text" 
                      placeholder=""
                      value={storeSettings?.phone} 
                      onChange={e => setStoreSettings(prev => ({ ...prev!, phone: e.target.value }))}
                      className="w-full px-8 py-6 bg-gray-50 border-2 border-transparent rounded-[32px] font-black text-gray-900 focus:bg-white focus:border-orange-500/20 transition-all outline-none" 
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Signature du Responsable (Upload)</label>
                    <div className="relative group">
                       <div className="w-full h-32 bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center overflow-hidden">
                          {storeSettings?.signatureUrl ? (
                            <img src={storeSettings.signatureUrl} alt="Signature" className="h-full w-full object-contain" />
                          ) : (
                            <div className="text-center p-4">
                               <Plus className="mx-auto text-gray-300 mb-2" size={24} />
                               <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-tight">Cliquer pour charger une image de signature</p>
                            </div>
                          )}
                          <label className="absolute inset-0 bg-gray-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm cursor-pointer">
                             <Upload size={20} className="text-white" />
                             <input type="file" className="hidden" accept="image/*" onChange={handleSignatureUpload} />
                          </label>
                       </div>
                       {isUploadingSignature && (
                         <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
                            <RefreshCcw size={20} className="text-orange-500 animate-spin" />
                         </div>
                       )}
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button 
                    onClick={() => checkMasterPassword('SAVE_STORE')}
                    className="w-full sm:w-auto px-12 py-6 bg-orange-500 text-white rounded-[32px] font-black text-lg hover:bg-orange-600 transition-all shadow-2xl shadow-orange-500/30 active:scale-95"
                  >
                    Enregistrer les Modifications
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'about' && (
              <div className="space-y-10">
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="bg-orange-500 w-24 h-24 rounded-[36px] shadow-2xl shadow-orange-500/20 transform rotate-3 hover:rotate-0 transition-transform overflow-hidden flex items-center justify-center">
                    <img src={storeSettings?.logoUrl || defaultLogo} alt="Logo" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h2 className="text-4xl font-black text-gray-900 tracking-tighter italic">MARKET PRO</h2>
                    <p className="text-orange-500 font-black uppercase tracking-[0.3em] text-[10px] mt-2 italic">Professional Business Suite</p>
                  </div>
                </div>
 
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-8 bg-gray-50 rounded-[32px] border border-gray-100/50">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{t.version}</p>
                    <p className="text-xl font-bold text-gray-900">v1.2.0-PRO</p>
                  </div>
                  <div className="p-8 bg-gray-50 rounded-[32px] border border-gray-100/50">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{t.license}</p>
                    <div className="flex items-center gap-2">
                       <div className={`w-2.5 h-2.5 rounded-full ${storeSettings?.licenseStatus === 'active' ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50'} shadow-lg animate-pulse`} />
                       <p className={`text-xl font-black uppercase tracking-tighter ${storeSettings?.licenseStatus === 'active' ? 'text-green-600' : 'text-red-600'}`}>
                         {storeSettings?.licenseStatus === 'active' ? t.active : 'INACTIF'}
                       </p>
                    </div>
                  </div>
                  <div className="p-8 bg-gray-50 rounded-[32px] border border-gray-100/50">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Statut du Système</p>
                    <p className={`text-xl font-bold ${storeSettings?.systemStatus ? 'text-orange-500' : 'text-gray-900'}`}>
                      {storeSettings?.systemStatus || 'Service Standard'}
                    </p>
                  </div>
                  <div className="p-8 bg-gray-50 rounded-[32px] border border-gray-100/50">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Engine</p>
                    <p className="text-sm font-bold text-gray-900">Google Cloud Firestore v2</p>
                  </div>
                </div>
 
                <div className="pt-8 border-t border-gray-100 text-center">
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">© 2026 {t.app_name} Solutions • Clé: {storeSettings?.licenseStatus === 'active' ? 'G-TECH-XXXX-XXXX-XXXX' : (storeSettings?.licenseKey || 'N/A')}</p>
                   <p className="text-[9px] font-black text-orange-500 uppercase tracking-[0.2em] mt-2">SUPPORT: G-LAB TECH SOLUTION • ANGES.GILDAS@GMAIL.COM / +228 91 03 30 04</p>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-12">
                <div>
                   <h4 className="text-2xl font-black text-gray-900 mb-8">{t.language}</h4>
                   <div className="grid grid-cols-2 gap-4">
                      {[
                        { id: 'fr', label: t.french, sub: 'Français' },
                        { id: 'en', label: t.english, sub: 'English' }
                      ].map(lang => (
                        <button 
                          key={lang.id}
                          onClick={() => setLanguage(lang.id as Language)}
                          className={`flex items-center justify-between p-6 rounded-[32px] border-2 transition-all ${language === lang.id ? 'border-orange-500 bg-orange-50 shadow-lg shadow-orange-500/10' : 'border-gray-100 hover:border-gray-200'}`}
                        >
                           <div className="flex items-center gap-4">
                              <div className={`p-3 rounded-2xl ${language === lang.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                <Globe size={20} />
                              </div>
                              <div className="text-left">
                                <p className={`font-black ${language === lang.id ? 'text-orange-900' : 'text-gray-900'}`}>{lang.label}</p>
                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">{lang.sub}</p>
                              </div>
                           </div>
                           {language === lang.id && <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white"><Check size={14} /></div>}
                        </button>
                      ))}
                   </div>
                </div>

                <div>
                   <h4 className="text-2xl font-black text-gray-900 mb-8">Thème du Système</h4>
                   <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
                      {[
                        { id: 'default', label: 'Défaut', color: 'bg-white' },
                        { id: 'white', label: 'Blanc Pur', color: 'bg-white shadow-inner' },
                        { id: 'black', label: 'Noir Profond', color: 'bg-gray-900' },
                        { id: 'dark-gray', label: 'Gris Sombre', color: 'bg-gray-600' },
                        { id: 'light-blue', label: 'Bleu Clair', color: 'bg-sky-100' },
                        { id: 'dark-blue', label: 'Bleu Foncé', color: 'bg-blue-900' },
                      ].map(mode => (
                        <button 
                          key={mode.id} 
                          onClick={() => setTheme(mode.id as Theme)}
                          className={`flex flex-col items-center gap-4 p-6 rounded-[32px] border-2 transition-all group ${theme === mode.id ? 'border-orange-500 bg-orange-50' : 'border-gray-100 hover:border-gray-200'}`}
                        >
                           <div className={`w-full aspect-square rounded-2xl ${mode.color} transition-transform group-hover:scale-105`} />
                           <span className="font-black text-gray-900 text-[10px] uppercase tracking-widest">{mode.label}</span>
                        </button>
                      ))}
                   </div>
                </div>
              </div>
            )}
            
            {activeTab === 'annexes' && (
              <div className="space-y-10 animate-fade-in">
                <div>
                   <h3 className="text-3xl font-black text-gray-900 tracking-tight leading-none mb-3">
                     {language === 'fr' ? 'Gestion des Annexes (Filiales) & Zones' : 'Branches (Subsidiaries) & Zones Management'}
                   </h3>
                   <p className="text-sm text-gray-500 font-semibold leading-relaxed max-w-3xl">
                     {language === 'fr' 
                       ? 'Supervisez les succursales associées à votre boutique principale par le Super Administrateur. Personnalisez leurs noms, modifiez leurs numéros de contact ou réaffectez-les à des zones géographiques spécifiques.' 
                       : 'Oversee the branches associated with your main store by the Super Admin. Personalize names, update contacts or reassign them to specific geographic zones.'}
                   </p>
                </div>

                {/* Editing Panel overlay/in-line if active */}
                {editingAnnexe && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="bg-orange-50/55 p-8 rounded-[40px] border-2 border-orange-200/60 shadow-xl shadow-orange-500/5 space-y-6"
                  >
                    <div className="flex items-center justify-between border-b border-orange-200/40 pb-4">
                      <div>
                        <span className="text-[10px] uppercase font-black tracking-widest text-orange-600 block mb-0.5">
                          {language === 'fr' ? 'Édition de l\'annexe' : 'Branch Configuration'}
                        </span>
                        <h4 className="text-xl font-black text-slate-800 tracking-tight">{editingAnnexe.name}</h4>
                      </div>
                      <button 
                        onClick={() => setEditingAnnexe(null)}
                        className="text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-900 cursor-pointer"
                      >
                        {language === 'fr' ? 'Annuler' : 'Cancel'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                          {language === 'fr' ? 'Nom de la Filiale *' : 'Branch Name *'}
                        </label>
                        <input 
                          type="text"
                          value={editedAnnexeName}
                          onChange={(e) => setEditedAnnexeName(e.target.value)}
                          className="w-full text-sm px-5 py-3.5 bg-white border border-gray-200 rounded-[20px] font-bold outline-none focus:ring-2 focus:ring-orange-500/10 transition-all text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                          {language === 'fr' ? 'Zone Géographique / Ville *' : 'Geographical Zone / City *'}
                        </label>
                        <input 
                          type="text"
                          value={editedAnnexeZone}
                          onChange={(e) => setEditedAnnexeZone(e.target.value)}
                          className="w-full text-sm px-5 py-3.5 bg-white border border-gray-200 rounded-[20px] font-bold outline-none focus:ring-2 focus:ring-orange-500/10 transition-all text-slate-850"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                          {language === 'fr' ? 'Adresse de la Filiale' : 'Branch Address'}
                        </label>
                        <input 
                          type="text"
                          value={editedAnnexeAddress}
                          onChange={(e) => setEditedAnnexeAddress(e.target.value)}
                          className="w-full text-sm px-5 py-3.5 bg-white border border-gray-200 rounded-[20px] font-bold outline-none focus:ring-2 focus:ring-orange-500/10 transition-all text-slate-850"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                          {language === 'fr' ? 'Téléphone de la Filiale' : 'Branch Phone'}
                        </label>
                        <input 
                          type="text"
                          value={editedAnnexePhone}
                          onChange={(e) => setEditedAnnexePhone(e.target.value)}
                          className="w-full text-sm px-5 py-3.5 bg-white border border-gray-200 rounded-[20px] font-sans font-bold outline-none focus:ring-2 focus:ring-orange-500/10 transition-all text-slate-850"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-4 py-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        {language === 'fr' ? 'Statut Opérationnel :' : 'Operational Status:'}
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={editedAnnexeIsActive}
                          onChange={(e) => setEditedAnnexeIsActive(e.target.checked)}
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                        <span className="ml-3 text-xs font-black uppercase text-slate-700 tracking-wider">
                          {editedAnnexeIsActive ? (language === 'fr' ? 'ACTIF' : 'ACTIVE') : (language === 'fr' ? 'INACTIF' : 'INACTIVE')}
                        </span>
                      </label>
                    </div>

                    <div className="flex gap-4 pt-2">
                      <button 
                        onClick={() => setEditingAnnexe(null)}
                        className="flex-1 py-3.5 bg-gray-200 hover:bg-gray-300 text-slate-600 rounded-[20px] font-black text-xs uppercase tracking-widest transition-all cursor-pointer"
                      >
                        {language === 'fr' ? 'Annuler' : 'Cancel'}
                      </button>
                      <button 
                        onClick={handleSaveAnnexeConfig}
                        className="flex-1 py-3.5 bg-orange-655 hover:bg-orange-700 text-white rounded-[20px] font-black text-xs uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Globe size={16} />
                        {language === 'fr' ? 'Enregistrer les modifications' : 'Save Configurations'}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Annexes grouped list */}
                {!(storeSettings as any).annexes || ((storeSettings as any).annexes || []).length === 0 ? (
                  <div className="text-center py-16 bg-gray-50 rounded-[48px] border-2 border-dashed border-gray-150 p-12">
                    <Globe size={48} className="mx-auto text-gray-300 mb-4" />
                    <h4 className="text-xl font-black text-gray-800 tracking-tight">
                      {language === 'fr' ? 'Aucune succursale configurée' : 'No branch configured'}
                    </h4>
                    <p className="text-sm text-gray-400 font-semibold mt-2 leading-relaxed max-w-md mx-auto">
                      {language === 'fr' 
                        ? 'Seul le Super Administrateur principal peut initier des annexes pour votre franchise. Contactez le support pour ajouter une nouvelle filiale.' 
                        : 'Only the main Super Admin can propose new branches for your franchise. Contact support to add a new subsidiary.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Grouped by geographic zone display */}
                    <div>
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4">
                        {language === 'fr' ? 'Vos filiale(s) regroupées par Zones' : 'Your branches grouped by Zones'}
                      </span>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {((storeSettings as any).annexes || []).map((annexe: any) => (
                          <div 
                            key={`settings-annexe-${annexe.id}`} 
                            className={`p-6 rounded-[32px] border bg-white shadow-sm hover:shadow-xl hover:shadow-gray-100 transition-all duration-300 flex flex-col justify-between gap-6 ${annexe.isActive === false ? 'opacity-65 border-gray-100 bg-gray-50/50' : 'border-gray-100'}`}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                  <h4 className="font-black text-gray-900 text-base tracking-tight leading-none">{annexe.name}</h4>
                                  <span className="px-2.5 py-0.5 bg-orange-50 text-orange-600 rounded-full text-[8px] font-black uppercase tracking-wider">
                                    {annexe.zone || 'Géographique'}
                                  </span>
                                </div>
                                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">ID: {annexe.id}</p>
                              </div>

                              <div className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${annexe.isActive !== false ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {annexe.isActive !== false ? (language === 'fr' ? 'Opérationnelle' : 'Active') : (language === 'fr' ? 'Désactivée' : 'Disabled')}
                              </div>
                            </div>

                            <div className="bg-slate-50/80 p-4 rounded-2xl text-[11px] text-slate-600 font-semibold font-sans space-y-1.5 shrink-0">
                              <p className="flex items-center gap-2">
                                <span className="text-gray-400 shrink-0">📍</span>
                                <span className="truncate">{annexe.address || (language === 'fr' ? 'Non configurée' : 'No address')}</span>
                              </p>
                              <p className="flex items-center gap-2">
                                <span className="text-gray-400 shrink-0">📞</span>
                                <span className="truncate">{annexe.phone || (language === 'fr' ? 'Inconnu' : 'No contact')}</span>
                              </p>
                            </div>

                            <button 
                              onClick={() => handleStartEditAnnexe(annexe)}
                              className="w-full py-3 bg-white hover:bg-slate-900 hover:text-white border border-gray-200 hover:border-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm shrink-0 flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <Globe size={12} />
                              {language === 'fr' ? 'Configurer la Filiale & la Zone' : 'Configure Branch & Zone'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="space-y-8">
                <AnimatePresence>
                  {showSuccess && (
                    <motion.div 
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="p-4 bg-green-50 text-green-700 rounded-2xl border border-green-100 font-bold text-sm text-center shadow-xl shadow-green-500/10 mb-4"
                    >
                      Profils mis à jour avec succès !
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center gap-8">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-[40px] bg-gray-100 flex items-center justify-center text-gray-400 border-4 border-white shadow-2xl relative overflow-hidden transition-all hover:scale-105">
                      {userProfile?.photoURL ? (
                        <img src={userProfile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <User size={48} />
                      )}
                      
                      <label className="absolute inset-0 bg-gray-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-sm cursor-pointer text-center">
                        <Upload size={24} className="text-white mb-2" />
                        <span className="text-[8px] text-white font-black uppercase tracking-widest px-4 leading-tight">Changer la Photo</span>
                        <input type="file" className="hidden" accept="image/*" onChange={handleProfilePhotoUpload} />
                      </label>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-gray-900 leading-tight">{auth.currentUser?.displayName || 'Utilisateur'}</h3>
                    <p className="text-gray-500 font-medium font-sans">{auth.currentUser?.email}</p>
                    <div className="mt-2 flex items-center gap-2">
                       <span className="px-3 py-1 bg-gray-900 text-white text-[9px] font-black uppercase tracking-widest rounded-full">{userRole}</span>
                       {isSuperAdmin && (
                         <span className="px-3 py-1 bg-orange-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-orange-500/20">Super Admin</span>
                       )}
                    </div>
                  </div>
                </div>

                <form onSubmit={handleProfileUpdate} className="space-y-8 mt-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nom Complet</label>
                      <input 
                        name="displayName"
                        type="text" 
                        defaultValue={auth.currentUser?.displayName || ''} 
                        className="w-full px-6 py-5 bg-gray-50 border-none rounded-[24px] font-bold text-gray-900 focus:ring-4 focus:ring-orange-500/5 transition-all outline-none" 
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Photo URL (Lien externe)</label>
                      <input 
                        name="photoURL"
                        type="text" 
                        defaultValue={userProfile?.photoURL?.startsWith('data:') ? 'Image enregistrée en base' : userProfile?.photoURL || ''} 
                        readOnly={userProfile?.photoURL?.startsWith('data:')}
                        placeholder="https://images.com/avatar.jpg"
                        className={`w-full px-6 py-5 bg-gray-50 border-none rounded-[24px] font-bold text-gray-900 focus:ring-4 focus:ring-orange-500/5 transition-all outline-none ${userProfile?.photoURL?.startsWith('data:') ? 'opacity-50 cursor-not-allowed' : ''}`} 
                      />
                      {userProfile?.photoURL?.startsWith('data:') && (
                        <p className="text-[9px] text-orange-500 font-bold ml-4">Une photo a été téléchargée manuellement. Cliquez sur l'avatar pour la changer.</p>
                      )}
                    </div>
                  </div>
                  <button 
                    type="submit"
                    className="px-10 py-5 bg-gray-900 text-white rounded-[24px] font-black text-lg hover:bg-black transition-all shadow-2xl shadow-gray-300"
                  >
                    Enregistrer les Modifications
                  </button>
                </form>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-10">
                <div className="flex items-center justify-between p-8 bg-gray-50 rounded-[40px] border border-gray-100">
                  <div className="flex items-center gap-6">
                    <div className="p-4 bg-white rounded-3xl text-orange-500 shadow-xl shadow-gray-200/50"><Lock size={24} /></div>
                    <div>
                      <h4 className="font-black text-gray-900 text-lg">Two-Factor Authentication</h4>
                      <p className="text-sm text-gray-500 font-medium">Add an extra layer of security to your account.</p>
                    </div>
                  </div>
                  <button className="px-6 py-3 bg-orange-100 text-orange-600 rounded-2xl font-black text-sm hover:bg-orange-200 transition-colors">ENABLE</button>
                </div>

                {/* Support/Forgot Password Help */}
                <div className="p-8 bg-orange-50 rounded-[40px] border border-orange-100 flex flex-col sm:flex-row items-center justify-between gap-6">
                   <div className="flex items-center gap-6">
                      <div className="p-4 bg-white rounded-3xl text-orange-500 shadow-xl shadow-orange-500/20"><AlertCircle size={24} /></div>
                      <div>
                        <h4 className="font-black text-gray-900 text-lg">Aide & Sécurité</h4>
                        <p className="text-sm text-gray-500 font-medium">Réinitialisez votre mot de passe d'accès ou celui des paramètres.</p>
                      </div>
                   </div>
                   <div className="flex flex-col sm:flex-row gap-3">
                     <button 
                       onClick={async () => {
                         if (auth.currentUser?.email) {
                           try {
                             await sendPasswordResetEmail(auth, auth.currentUser.email);
                             alert(`Email de réinitialisation envoyé à ${auth.currentUser.email} !`);
                           } catch (e: any) {
                             alert("Erreur: " + e.message);
                           }
                         }
                       }}
                       className="px-8 py-4 bg-orange-500 text-white rounded-[24px] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-orange-500/20 hover:bg-orange-600 transition-all flex items-center gap-2"
                     >
                       <Mail size={16} />
                       Réinitialiser mon compte
                     </button>
                     <button 
                       onClick={() => setIsSetPasswordOpen(true)}
                       className="px-8 py-4 bg-white text-orange-600 border border-orange-200 rounded-[24px] font-black text-[10px] uppercase tracking-widest hover:bg-orange-50 transition-all flex items-center gap-2"
                     >
                       <Lock size={16} />
                       Changer code
                      </button>
                    </div>
                 </div>
               </div>
             )}

            {activeTab === 'users' && (() => {
              const matrixModules = [
                { key: 'reports', label: 'Tableau de Bord', desc: 'Statistiques et performances financières', icon: ShieldCheck },
                { key: 'pos', label: 'Caisse / Vente', desc: 'Gestion du point de vente et encaissements', icon: ShoppingBag },
                { key: 'commandes', label: 'Commandes', desc: 'Suivi et gestion des commandes clients', icon: ClipboardList },
                { key: 'mobile_money', label: 'Transactions Mobiles', desc: 'Gestion des flux d\'argent mobile', icon: Smartphone },
                { key: 'inventory', label: 'Inventaire / Stocks', desc: 'Gestion des articles, stocks et catégories', icon: Database },
                { key: 'sales', label: 'Historique des Ventes', desc: 'Consulter l\'historique des ventes', icon: History },
                { key: 'accounting', label: 'Comptabilité / Dépenses', desc: 'Saisie et suivi des frais d\'exploitation', icon: Shield },
                { key: 'clients', label: 'Fichier Clients', desc: 'Fichier client et fidélité', icon: User },
                { key: 'personnel', label: 'Équipe & RH', desc: 'Contrats, congés et fiches de paie', icon: UserPlus },
                { key: 'chat', label: 'Messagerie Interne', desc: 'Tchat d\'équipe et communications', icon: MessageSquare },
                { key: 'settings', label: 'Configuration', desc: 'Paramètres système et sauvegardes', icon: Lock },
              ] as const;

              return (
                <div className="space-y-12">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                    <div>
                      <h3 className="text-4xl font-black text-gray-900 mb-2">Annuaire & Matrice d'Accès</h3>
                      <p className="text-gray-500 font-medium font-sans">Gérez les accès, rôles et privilèges fines de l'ensemble de votre équipe.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="bg-orange-50 px-4 py-2 rounded-xl text-orange-600 font-black text-[10px] uppercase tracking-widest border border-orange-100">
                        {users.length} Utilisateurs Actifs
                      </div>
                      {userRole === 'admin' && (
                        <button 
                          onClick={() => checkMasterPassword('ADD_USER')}
                          className="bg-orange-500 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 active:scale-95"
                        >
                          <UserPlus size={16} />
                          Ajouter
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-900 p-8 rounded-[40px] text-white flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 shadow-2xl shadow-gray-300">
                     <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-orange-500">
                           <Shield size={28} />
                        </div>
                        <div>
                           <p className="text-sm font-bold opacity-60">Votre Niveau d'Accès</p>
                           <p className="text-xl font-black tracking-widest uppercase">{userRole}</p>
                        </div>
                     </div>
                     <div className="flex bg-white/10 p-1 rounded-2xl border border-white/5">
                        <button 
                          onClick={() => setUsersSubTab('list')}
                          className={`px-6 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${usersSubTab === 'list' ? 'bg-white text-gray-900 shadow-lg' : 'text-gray-300 hover:text-white'}`}
                        >
                          📋 Liste Annuaire
                        </button>
                        <button 
                          onClick={() => setUsersSubTab('matrix')}
                          className={`px-6 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${usersSubTab === 'matrix' ? 'bg-white text-gray-900 shadow-lg' : 'text-gray-300 hover:text-white'}`}
                        >
                          🎛️ Matrice d'Accès
                        </button>
                     </div>
                  </div>

                  {usersSubTab === 'list' ? (
                    <div className="space-y-4">
                       {users.map(u => (
                         <div key={u.uid} className="flex flex-col bg-white rounded-[32px] border border-gray-100 hover:shadow-xl transition-all group overflow-hidden">
                            <div className="flex flex-col lg:flex-row items-center justify-between p-6 gap-6">
                               <div className="flex items-center gap-4 w-full lg:w-auto">
                                  <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 font-black text-lg overflow-hidden border border-gray-100">
                                     {u.photoURL ? (
                                       <img src={u.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                                     ) : (
                                       u.displayName ? u.displayName[0] : <User size={20} />
                                     )}
                                  </div>
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                      <p className="font-black text-gray-900">{u.displayName || 'Utilisateur Anonyme'}</p>
                                      {u.isActive === false && (
                                        <span className="bg-red-50 text-red-500 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest border border-red-100">Désactivé</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-400 font-medium">{u.email}</p>
                                    <div className="mt-1 flex items-center gap-1">
                                       <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${u.role === 'admin' ? 'bg-orange-500 text-white' : u.role === 'manager' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                         {u.role}
                                       </span>
                                    </div>
                                  </div>
                               </div>

                               {/* DETAILED ACCESS MATRIX */}
                               <div 
                                 onClick={() => setEditingUser(u)}
                                 className="flex flex-wrap gap-1.5 justify-center lg:justify-end flex-1 cursor-pointer hover:bg-gray-50 p-2 rounded-2xl transition-colors group/matrix"
                                 title="Cliquer pour modifier les permissions"
                                >
                                  {(['reports', 'pos', 'commandes', 'mobile_money', 'inventory', 'sales', 'accounting', 'clients', 'personnel', 'chat', 'settings'] as (keyof UserPermissions)[]).map(m => {
                                    const permissions = (u.permissions?.[m] || getUserDefaultPermissions(u.email || '')[m]) || { read: false, create: false, update: false, delete: false };
                                    const hasAccess = permissions.read || permissions.create || permissions.update || permissions.delete;
                                    return (
                                      <div key={m} className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${hasAccess ? 'bg-white border-orange-100 shadow-sm' : 'bg-gray-50/50 border-transparent opacity-25'}`}>
                                        <span className="text-[7px] font-black uppercase tracking-tighter text-gray-400">
                                          {m === 'reports' ? 'TDB' : m === 'pos' ? 'Vente' : m === 'commandes' ? 'Cmds' : m === 'mobile_money' ? 'M-Money' : m === 'inventory' ? 'Stock' : m === 'sales' ? 'Histo' : m === 'accounting' ? 'Compta' : m === 'clients' ? 'Clients' : m === 'personnel' ? 'Equipe' : m === 'chat' ? 'Tchat' : 'Config'}
                                        </span>
                                        <div className="flex gap-1 items-center">
                                          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${permissions.read ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'bg-gray-100 text-gray-300'}`} title="Lecture">
                                            <Eye size={12} />
                                          </div>
                                          <div className="flex gap-0.5">
                                            <div className={`w-2.5 h-2.5 rounded-full border border-white ${permissions.create ? 'bg-blue-500 shadow-sm' : 'bg-gray-200'}`} title="Création" />
                                            <div className={`w-2.5 h-2.5 rounded-full border border-white ${permissions.update ? 'bg-yellow-500 shadow-sm' : 'bg-gray-200'}`} title="Modification" />
                                            <div className={`w-2.5 h-2.5 rounded-full border border-white ${permissions.delete ? 'bg-red-500 shadow-sm' : 'bg-gray-200'}`} title="Suppression" />
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                               </div>
                               
                               <div className="flex items-center gap-4 w-full lg:w-auto justify-end">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => checkMasterPassword('TOGGLE_STATUS', { uid: u.uid, isActive: u.isActive !== false })}
                                      disabled={u.uid === auth.currentUser?.uid}
                                      className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${u.isActive !== false ? 'bg-green-50 text-green-600 border border-green-100 hover:bg-green-500 hover:text-white' : 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-500 hover:text-white'} disabled:opacity-30`}
                                    >
                                      {u.isActive !== false ? 'Actif' : 'Bloqué'}
                                    </button>
                                    <div className="flex items-center bg-gray-50 p-1 rounded-2xl border border-gray-100">
                                     {(['admin', 'cashier', 'manager'] as UserRole[]).map(r => (
                                       <button
                                         key={r}
                                         disabled={userRole !== 'admin' || (u.uid === auth.currentUser?.uid)}
                                         onClick={() => checkMasterPassword('UPDATE_ROLE', { uid: u.uid, role: r })}
                                         className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${u.role === r ? 'bg-white text-orange-500 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
                                       >
                                         {r === 'admin' ? 'Admin' : r === 'manager' ? 'Chef' : 'Caiss'}
                                       </button>
                                     ))}
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-2">
                                     <button 
                                       onClick={() => checkMasterPassword('RESET_USER_PASS', { email: u.email })}
                                       className="p-3 rounded-2xl bg-orange-50 text-orange-500 hover:bg-orange-500 hover:text-white transition-all shadow-sm group"
                                       title="Réinitialiser le mot de passe par Email"
                                     >
                                       <Mail size={20} className="group-hover:rotate-12 transition-transform" />
                                     </button>
                                     <button 
                                       onClick={() => setEditingUser(editingUser?.uid === u.uid ? null : u)}
                                       className={`p-3 rounded-2xl transition-all ${editingUser?.uid === u.uid ? 'bg-orange-500 text-white shadow-xl shadow-orange-500/20' : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-900'}`}
                                       title="Gérer les permissions"
                                     >
                                       <Shield size={20} />
                                     </button>
                                     {(userRole === 'admin' || userRole === 'manager') && u.uid !== auth.currentUser?.uid && (
                                       <button 
                                         onClick={() => checkMasterPassword('DELETE_USER', u.uid)}
                                         className="p-3 rounded-2xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                                         title="Supprimer l'utilisateur"
                                       >
                                         <Trash2 size={20} />
                                       </button>
                                     )}
                                  </div>
                               </div>
                            </div>

                            {/* Permissions Modal MODERNIZED */}
                            <AnimatePresence>
                              {editingUser && (
                                <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4">
                                  <motion.div 
                                    initial={{ opacity: 0 }} 
                                    animate={{ opacity: 1 }} 
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 bg-black/80 backdrop-blur-md" 
                                    onClick={() => setEditingUser(null)} 
                                  />
                                  <motion.div 
                                    initial={{ opacity: 0, y: 100, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 100, scale: 0.95 }}
                                    className="relative bg-white w-full h-full sm:h-auto sm:max-w-2xl sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
                                  >
                                    <div className="p-6 sm:p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                      <div>
                                        <h2 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase decoration-orange-500 decoration-4 underline-offset-4 tracking-tighter">Permissions</h2>
                                        <p className="text-gray-500 font-bold italic text-[11px] mt-1.5 uppercase tracking-tighter">Accès de <span className="text-orange-600 font-black">{editingUser.displayName || editingUser.email}</span></p>
                                      </div>
                                      <button onClick={() => setEditingUser(null)} className="p-2 hover:bg-white hover:shadow-lg rounded-full transition-all group">
                                        <X size={20} className="text-gray-300 group-hover:text-gray-900" />
                                      </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-6 sm:p-8 max-h-[65vh] scrollbar-thin scrollbar-thumb-gray-200">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                         {(['reports', 'pos', 'commandes', 'mobile_money', 'inventory', 'sales', 'accounting', 'clients', 'personnel', 'chat', 'settings'] as (keyof UserPermissions)[]).map(module => (
                                           <div key={module} className="bg-gray-50 p-6 rounded-[28px] border border-gray-100 hover:border-orange-500/20 transition-colors">
                                              <div className="flex items-center justify-between mb-4">
                                                 <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-gray-400 group-hover:text-orange-500 transition-colors shadow-sm">
                                                       <Shield size={16} />
                                                    </div>
                                                    <span className="text-[11px] font-black uppercase tracking-widest text-gray-900">
                                                      {module === 'reports' ? 'Tableau de Bord' :
                                                       module === 'pos' ? 'Caisse / Vente' :
                                                       module === 'commandes' ? 'Commandes' :
                                                       module === 'mobile_money' ? 'Transactions Mobiles' :
                                                       module === 'inventory' ? 'Inventaire / Stocks' :
                                                       module === 'sales' ? 'Historique des Ventes' :
                                                       module === 'accounting' ? 'Comptabilité / Dépenses' :
                                                       module === 'clients' ? 'Fichier Clients' :
                                                       module === 'personnel' ? 'Équipe & RH' :
                                                       module === 'chat' ? 'Messagerie Interne' :
                                                       module === 'settings' ? 'Configuration' : module}
                                                    </span>
                                                 </div>
                                              </div>
                                              <div className="grid grid-cols-2 gap-2.5">
                                                 {[
                                                   { key: 'read', icon: Eye, label: 'Lecture' },
                                                   { key: 'create', icon: Plus, label: 'Ajout' },
                                                   { key: 'update', icon: Edit3, label: 'Modif.' },
                                                   { key: 'delete', icon: Trash2, label: 'Suppr.' }
                                                 ].map(action => {
                                                   const isActive = (editingUser.permissions?.[module] || getUserDefaultPermissions(editingUser.email || '')[module])?.[action.key as keyof ModulePermissions];
                                                   return (
                                                     <button
                                                       key={action.key}
                                                       onClick={() => {
                                                         const newPermissions = {
                                                           ...(editingUser.permissions || getUserDefaultPermissions(editingUser.email || '')),
                                                           [module]: {
                                                             ...(editingUser.permissions?.[module] || getUserDefaultPermissions(editingUser.email || '')[module]),
                                                             [action.key]: !isActive
                                                           }
                                                         };
                                                         setEditingUser({ ...editingUser, permissions: newPermissions });
                                                       }}
                                                       className={`p-3 rounded-xl transition-all flex items-center gap-2 border ${isActive ? 'bg-orange-500 border-orange-500 text-white shadow-xl shadow-orange-500/10' : 'bg-white border-gray-100 text-gray-400 hover:bg-gray-50'}`}
                                                     >
                                                       <action.icon size={18} />
                                                       <span className="text-[10px] font-black uppercase tracking-widest">{action.label}</span>
                                                     </button>
                                                   );
                                                 })}
                                              </div>
                                           </div>
                                         ))}
                                      </div>
                                    </div>

                                    <div className="p-6 sm:p-8 bg-gray-50/50 border-t border-gray-100 flex flex-col sm:flex-row gap-3">
                                      <button 
                                        onClick={() => setEditingUser(null)}
                                        className="flex-1 py-4 bg-white text-gray-900 rounded-2xl font-black uppercase tracking-widest text-[10px] border border-gray-200 hover:bg-gray-50 transition-all active:scale-95"
                                      >
                                        Fermer
                                      </button>
                                      <button 
                                        onClick={() => checkMasterPassword('UPDATE_PERMISSIONS', { uid: editingUser.uid, permissions: editingUser.permissions || getUserDefaultPermissions(editingUser.email || '') })}
                                        className="flex-[2] py-4 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-black hover:shadow-2xl hover:shadow-gray-900/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                                      >
                                        <Check size={16} />
                                        Enregistrer
                                      </button>
                                    </div>
                                  </motion.div>
                                </div>
                              )}
                            </AnimatePresence>
                         </div>
                       ))}
                    </div>
                  ) : (
                    <div className="bg-white rounded-[40px] border border-gray-150/80 shadow-2xl overflow-hidden">
                      {Object.keys(matrixDrafts).length > 0 && (
                        <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-4 px-8 text-white flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-orange-200/20 shadow-md font-sans">
                          <div className="flex items-center gap-3">
                            <span className="relative flex h-3.5 w-3.5 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-white"></span>
                            </span>
                            <p className="text-xs font-black uppercase tracking-wider">
                              Modifications non enregistrées ({Object.keys(matrixDrafts).length} comptes modifiés)
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => {
                                setMatrixDrafts({});
                                alert("Modifications réinitialisées !");
                              }}
                              className="px-4 py-2 border border-white/40 hover:bg-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                            >
                              Annuler
                            </button>
                            <button
                              onClick={handleSaveMatrixDrafts}
                              className="px-6 py-2 bg-white text-orange-650 hover:scale-105 active:scale-95 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-xl"
                            >
                              Enregistrer les modifications
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="p-8 border-b border-gray-150 bg-gray-55/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h4 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase decoration-orange-500 decoration-4 underline-offset-4 tracking-tighter">Matrice Globale de Sécurité</h4>
                          <p className="text-xs text-gray-500 mt-1.5 font-sans font-medium">
                            Basculez à la volée les droits d'action de vos salariés : <span className="text-green-600 font-bold">Lecture (L)</span>, <span className="text-blue-600 font-bold">Création (C)</span>, <span className="text-amber-600 font-bold">Modification (M)</span>, <span className="text-red-600 font-bold">Suppression (S)</span>.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.55">
                          <span className="px-3 py-1.5 bg-green-50 text-[9px] font-black text-green-700 border border-green-100 rounded-lg">L: Lecture</span>
                          <span className="px-3 py-1.5 bg-blue-50 text-[9px] font-black text-blue-700 border border-blue-100 rounded-lg">C: Créer</span>
                          <span className="px-3 py-1.5 bg-amber-50 text-[9px] font-black text-amber-700 border border-amber-100 rounded-lg">M: Modif.</span>
                          <span className="px-3 py-1.5 bg-red-50 text-[9px] font-black text-red-700 border border-red-100 rounded-lg">S: Suppr.</span>
                        </div>
                      </div>

                      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-gray-900 text-white select-none">
                              <th className="p-5 font-black text-xs uppercase tracking-widest min-w-[250px]">Collaborateur</th>
                              {matrixModules.map(m => (
                                <th key={m.key} className="p-5 font-black text-xs uppercase tracking-widest text-center min-w-[190px]" title={m.desc}>
                                  <div className="flex flex-col items-center gap-1.5">
                                    <div className="p-2.5 bg-white/10 rounded-2xl text-orange-500">
                                      <m.icon size={16} />
                                    </div>
                                    <span className="text-[10px] tracking-wider">{m.label}</span>
                                  </div>
                                </th>
                              ))}
                              <th className="p-5 font-black text-xs uppercase tracking-widest text-center min-w-[240px]">Rôles & Options</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-150">
                            {users.map(u => {
                              const isSelf = u.uid === auth.currentUser?.uid;
                              return (
                                <tr key={u.uid} className="hover:bg-gray-50/40 transition-colors">
                                  <td className="p-5">
                                    <div className="flex items-center gap-4">
                                      <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 font-black text-lg overflow-hidden border border-gray-100">
                                        {u.photoURL ? (
                                          <img src={u.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                          u.displayName ? u.displayName[0] : <User size={20} />
                                        )}
                                      </div>
                                      <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-black text-gray-900 text-sm">{u.displayName || 'Utilisateur'}</span>
                                          {u.isActive === false && (
                                            <span className="bg-red-50 text-red-500 text-[6px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest border border-red-100">Bloqué</span>
                                          )}
                                        </div>
                                        <span className="text-xs text-gray-400 font-medium">{u.email}</span>
                                        <span className="mt-1 self-start px-2 py-0.5 bg-gray-100 text-[8px] font-black text-gray-500 border border-gray-200 rounded uppercase tracking-widest">{u.role}</span>
                                      </div>
                                    </div>
                                  </td>

                                  {matrixModules.map(m => {
                                    const userPerm = matrixDrafts[u.uid] || u.permissions || getUserDefaultPermissions(u.email || '');
                                    const permissions = userPerm[m.key] || { read: false, create: false, update: false, delete: false };
                                    return (
                                      <td key={m.key} className="p-5 text-center">
                                        <div className="flex justify-center items-center gap-1">
                                          {[
                                            { key: 'read', label: 'L', activeColor: 'bg-green-500 text-white shadow-green-500/20 border-green-500', name: 'Lecture' },
                                            { key: 'create', label: 'C', activeColor: 'bg-blue-500 text-white shadow-blue-500/20 border-blue-500', name: 'Création' },
                                            { key: 'update', label: 'M', activeColor: 'bg-amber-500 text-white shadow-amber-500/20 border-amber-500', name: 'Modification' },
                                            { key: 'delete', label: 'S', activeColor: 'bg-red-500 text-white shadow-red-500/20 border-red-500', name: 'Suppression' }
                                          ].map(act => {
                                            const isActive = permissions[act.key as keyof ModulePermissions];
                                            return (
                                              <button
                                                key={act.key}
                                                disabled={isSelf && m.key === 'settings' && act.key === 'read'} // Prevent lockouts
                                                onClick={() => handleToggleMatrixPermission(u.uid, m.key, act.key as keyof ModulePermissions, isActive)}
                                                title={`${act.name} : ${u.displayName || 'Utilisateur'} -> module ${m.label}`}
                                                className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-[9px] border transition-all hover:scale-110 active:scale-90 ${isActive ? `${act.activeColor} shadow-md` : 'bg-gray-50 text-gray-300 border-gray-150/70 hover:bg-gray-100 hover:text-gray-400'}`}
                                              >
                                                {act.label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </td>
                                    );
                                  })}

                                  <td className="p-5">
                                    <div className="flex flex-col gap-2.5 items-center justify-center">
                                      <div className="flex items-center bg-gray-50 border border-gray-100 p-1 rounded-xl">
                                        {(['admin', 'cashier', 'manager'] as UserRole[]).map(r => (
                                          <button
                                            key={r}
                                            disabled={isSelf || userRole !== 'admin'}
                                            onClick={() => handleUpdateUserRole(u.uid, r)}
                                            className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${u.role === r ? 'bg-white text-orange-500 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-650'}`}
                                          >
                                            {r === 'admin' ? 'Admin' : r === 'manager' ? 'Chef' : 'Caiss'}
                                          </button>
                                        ))}
                                      </div>

                                      <div className="flex gap-1.5">
                                        <button
                                          onClick={() => handleApplyRolePresets(u.uid, u.role)}
                                          className="px-2.5 py-1 text-[8px] font-black tracking-widest uppercase bg-orange-50 border border-orange-100 text-orange-600 rounded-lg hover:bg-orange-500 hover:text-white transition-colors"
                                          title={`Rétablir les permissions d'origine pour le rôle ${u.role}`}
                                        >
                                          Reset Rôle
                                        </button>
                                        <button
                                          onClick={() => handleToggleUserStatus(u.uid, u.isActive !== false)}
                                          disabled={isSelf}
                                          className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all border ${u.isActive !== false ? 'bg-green-50 text-green-600 border-green-100 hover:bg-green-500 hover:text-white' : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-500 hover:text-white'} disabled:opacity-30`}
                                        >
                                          {u.isActive !== false ? 'Actif' : 'Bloqué'}
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="p-6 bg-gray-50 border-t border-gray-150 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="text-left">
                          {Object.keys(matrixDrafts).length > 0 ? (
                            <span className="text-[11px] font-bold text-orange-650 animate-pulse font-sans">
                              ⚠️ Vous avez des modifications non enregistrées ({Object.keys(matrixDrafts).length} comptes)
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-gray-400 font-sans">
                              Aucun changement en attente dans la matrice.
                            </span>
                          )}
                        </div>
                        <button
                          onClick={handleSaveMatrixDrafts}
                          disabled={Object.keys(matrixDrafts).length === 0 || isActionLoading}
                          className={`px-8 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 ${Object.keys(matrixDrafts).length > 0 ? 'bg-gray-900 text-white hover:bg-orange-600 hover:shadow-xl hover:shadow-orange-600/20 cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'}`}
                        >
                          <Check size={16} />
                          Enregistrer les modifications
                        </button>
                      </div>
                    </div>
                  )}


                  <AnimatePresence>
                    {isAddUserOpen && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                          initial={{ opacity: 0 }} 
                          animate={{ opacity: 1 }} 
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
                          onClick={() => { setIsAddUserOpen(false); setSelectedUserPhoto(null); }} 
                        />
                        <motion.div 
                          initial={{ opacity: 0, y: 100, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 100, scale: 0.95 }}
                          className="relative bg-white w-full max-w-3xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
                        >
                          <div className="py-4 px-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                              <h2 className="text-xl font-black text-gray-900 tracking-tight italic uppercase decoration-orange-500 decoration-4 underline-offset-4 font-sans tracking-tighter">Nouveau Membre</h2>
                              <p className="text-gray-500 font-bold italic text-[10px] mt-0.5 uppercase tracking-tighter">Créer un membre de l'équipe et lui affecter des accès.</p>
                            </div>
                            <button onClick={() => { setIsAddUserOpen(false); setSelectedUserPhoto(null); }} className="p-2 hover:bg-white hover:shadow-lg rounded-full transition-all group">
                              <X size={18} className="text-gray-300 group-hover:text-gray-900" />
                            </button>
                          </div>

                          <form onSubmit={handleAddUser} className="flex-1 overflow-y-auto p-5 space-y-4">
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
                              {/* Left Column: Avatar & Photo Section */}
                              <div className="bg-gray-50/50 p-4 rounded-[20px] border border-gray-100/50 flex flex-col items-center text-center justify-between space-y-3">
                                <div className="relative group">
                                  <div className="w-16 h-16 rounded-[20px] bg-white border-2 border-gray-200/50 shadow-sm flex items-center justify-center overflow-hidden">
                                    {selectedUserPhoto ? (
                                      <img src={selectedUserPhoto} alt="User profile" className="w-full h-full object-cover" />
                                    ) : (
                                      <User size={24} className="text-gray-300" />
                                    )}
                                  </div>
                                  <label className="absolute -bottom-1 -right-1 w-6 h-6 bg-orange-600 text-white rounded-lg flex items-center justify-center shadow-md cursor-pointer hover:bg-orange-700 transition-all hover:scale-110 active:scale-95">
                                    <Plus size={12} />
                                    <input 
                                      type="file" 
                                      accept="image/*" 
                                      className="hidden" 
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const reader = new FileReader();
                                          reader.onloadend = () => setSelectedUserPhoto(reader.result as string);
                                          reader.readAsDataURL(file);
                                        }
                                      }}
                                    />
                                  </label>
                                </div>
                                
                                <div className="space-y-1.5 w-full">
                                  <p className="text-[9px] font-black uppercase tracking-wider text-gray-800">Photo de profil</p>
                                  
                                  <div className="flex flex-wrap gap-1 justify-center">
                                    {[
                                      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
                                      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
                                      'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
                                      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
                                      'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=150'
                                    ].map((url, idx) => (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setSelectedUserPhoto(url)}
                                        className={`w-7 h-7 rounded-lg overflow-hidden border transition-all hover:scale-110 ${selectedUserPhoto === url ? 'border-orange-500 scale-105 shadow-md shadow-orange-500/20' : 'border-transparent'}`}
                                      >
                                        <img src={url} alt={`Avatar ${idx}`} className="w-full h-full object-cover" />
                                      </button>
                                    ))}
                                  </div>

                                  {selectedUserPhoto && (
                                    <button 
                                      type="button" 
                                      onClick={() => setSelectedUserPhoto(null)}
                                      className="text-[8px] font-black uppercase tracking-wider text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-100 px-2 py-1 rounded-lg transition-colors w-full"
                                    >
                                      Réinitialiser
                                    </button>
                                  )}
                                </div>
                              </div>

                                <div className="space-y-1 sm:col-span-2">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Nom Complet</label>
                                  <input 
                                    name="name" 
                                    required
                                    className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl font-bold text-gray-900 focus:bg-white focus:ring-4 focus:ring-orange-500/5 transition-all outline-none text-xs font-sans" 
                                    placeholder="Ex: Jean Dupont"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Adresse Email</label>
                                  <input 
                                    name="email" 
                                    type="email"
                                    required
                                    className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl font-bold text-gray-900 focus:bg-white focus:ring-4 focus:ring-orange-500/5 transition-all outline-none text-xs font-sans" 
                                    placeholder="exemple@market.com"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Mot de Passe d'Accès</label>
                                  <input 
                                    name="password" 
                                    type="password"
                                    required
                                    minLength={6}
                                    className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl font-bold text-gray-900 focus:bg-white focus:ring-4 focus:ring-orange-500/5 transition-all outline-none text-xs font-sans" 
                                    placeholder="••••••••"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Rôle Initial</label>
                                  <div className="relative">
                                    <select 
                                      name="role"
                                      className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-orange-500/10 transition-all outline-none appearance-none pr-10 font-sans text-xs font-bold"
                                    >
                                      <option value="cashier" className="text-gray-900 bg-white font-sans font-bold text-xs">Caissier</option>
                                      <option value="manager" className="text-gray-900 bg-white font-sans font-bold text-xs">Gérant / Chef</option>
                                      <option value="admin" className="text-gray-900 bg-white font-sans font-bold text-xs">Administrateur</option>
                                    </select>
                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
                                      <ChevronDown size={14} />
                                    </div>
                                  </div>
                                </div>
                             <div className="space-y-1.5">
                               <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Boutique d'affectation</label>
                               <div className="relative">
                                 <select 
                                   name="targetStoreId"
                                   className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-orange-500/10 transition-all outline-none appearance-none pr-10 font-sans"
                                 >
                                   <option value={userProfile?.parentStoreId || userProfile?.storeId || "main"} className="text-gray-900 bg-white font-sans font-bold">
                                     {storeSettings?.name || "Boutique Principale"} (Principal)
                                   </option>
                                   {((storeSettings as any)?.annexes || []).map((annexe: any) => (
                                     <option key={annexe.id} value={annexe.id} className="text-gray-900 bg-white font-sans font-bold">
                                       {annexe.name} ({annexe.zone || "Succursale"})
                                     </option>
                                   ))}
                                 </select>
                                 <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
                                   <ChevronDown size={18} />
                                 </div>
                               </div>
                             </div>
                           </div>

                           <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-100">
                              <button 
                                type="button" 
                                onClick={() => { setIsAddUserOpen(false); setSelectedUserPhoto(null); }}
                                className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all active:scale-95"
                              >
                                Annuler
                              </button>
                              <button 
                                type="submit"
                                disabled={isSyncing}
                                className="flex-[2] py-4 bg-orange-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-orange-700 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
                              >
                                {isSyncing ? <RefreshCcw size={14} className="animate-spin" /> : <UserPlus size={14} />}
                                {isSyncing ? 'TRAITEMENT...' : "CRÉER L'ACCÈS"}
                              </button>
                           </div>
                         </form>
                       </motion.div>
                     </div>
                   )}
                 </AnimatePresence>

                {userRole !== 'admin' && (
                  <div className="p-8 bg-blue-50 rounded-[32px] border border-blue-100 flex items-center gap-6">
                     <Lock className="text-blue-500" size={24} />
                     <p className="text-sm font-medium text-blue-900">Seul un administrateur peut modifier les rôles et les accès du personnel.</p>
                  </div>
                )}
              </div>
            );
          })()}
            
            {activeTab === 'backup' && (
              <div className="space-y-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="p-8 bg-gray-50 rounded-[40px] border border-gray-100 flex flex-col justify-between group hover:border-orange-500/30 transition-all">
                      <div>
                        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-orange-500 shadow-sm mb-6 group-hover:bg-orange-500 group-hover:text-white transition-all">
                          <Download size={28} />
                        </div>
                        <h4 className="text-xl font-black text-gray-900 mb-2">Export Manuel</h4>
                        <p className="text-sm text-gray-500 font-medium">Téléchargez une copie de sécurité de votre base de données locale.</p>
                      </div>
                      <button 
                        onClick={handleBackup}
                        disabled={isSyncing}
                        className="mt-8 px-6 py-4 bg-white text-gray-900 rounded-2xl font-black text-xs uppercase tracking-widest border border-gray-200 hover:bg-gray-900 hover:text-white transition-all disabled:opacity-50"
                      >
                        {isSyncing ? 'EXPORT EN COURS...' : 'DÉMARRER L\'EXPORT'}
                      </button>
                   </div>

                   <div className="p-8 bg-blue-50 rounded-[40px] border border-blue-100 flex flex-col justify-between group hover:border-blue-500/30 transition-all">
                      <div>
                        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-blue-500 shadow-sm mb-6 group-hover:bg-blue-500 group-hover:text-white transition-all">
                          <Upload size={28} />
                        </div>
                        <h4 className="text-xl font-black text-blue-900 mb-2">Restauration Système</h4>
                        <p className="text-sm text-blue-600/70 font-medium italic">Importez un fichier de sauvegarde pour restaurer vos données (Validation Admin requise).</p>
                      </div>
                      <label className="mt-8 px-6 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest text-center cursor-pointer hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 disabled:opacity-50">
                        {isSyncing ? 'RESTAURATION...' : 'RESTAURER DEPUIS JSON'}
                        <input type="file" accept=".json" onChange={handleFileRestore} className="hidden" disabled={isSyncing} />
                      </label>
                   </div>

                   {userRole === 'admin' && (
                      <div className="p-8 bg-red-50 rounded-[40px] border border-red-100 flex flex-col justify-between group">
                         <div>
                           <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-red-500 shadow-sm mb-6 group-hover:bg-red-500 group-hover:text-white transition-all">
                             <Trash2 size={28} />
                           </div>
                           <h4 className="text-xl font-black text-red-900 mb-2">Réinitialisation Système</h4>
                           <p className="text-sm text-red-600/70 font-medium">Zone dangereuse : Efface définitivement toutes les données de vente et d'inventaire.</p>
                         </div>
                         <button 
                           onClick={() => checkMasterPassword('RESET')}
                           disabled={isSyncing}
                           className="mt-8 px-6 py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-xl shadow-red-500/20 disabled:opacity-50"
                         >
                           {isSyncing ? 'RESET EN COURS...' : 'RÉINITIALISER TOUT'}
                         </button>
                      </div>
                    )}
                </div>

              </div>
            )}

            {activeTab === 'license' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-[32px] text-white relative overflow-hidden shadow-2xl shadow-blue-500/20">
                    <AnimatePresence>
                      {activationSuccess && (
                        <motion.div 
                          initial={{ opacity: 0, y: -20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          className="absolute inset-0 z-20 bg-green-500 flex items-center justify-center p-6 text-center"
                        >
                          <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4 backdrop-blur-md">
                              <Check size={32} className="text-white" />
                            </div>
                            <h3 className="text-2xl font-black uppercase tracking-tighter">Félicitations !</h3>
                            <p className="text-sm font-bold opacity-90">Licence activée pour un an</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className="relative z-10">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
                          <ShieldCheck size={24} />
                        </div>
                        <h3 className="text-xl font-bold italic tracking-tight">Statut du Système</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <p className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-1">Clé Actuelle</p>
                          <p className="text-2xl font-black font-mono tracking-tighter">
                            {storeSettings?.licenseStatus === 'active' ? 'G-TECH-XXXX-XXXX-XXXX' : (storeSettings?.licenseKey || '—— —— —— ——')}
                          </p>
                        </div>
                        <div>
                          <p className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-1">Expiration</p>
                          <p className="text-2xl font-black tracking-tighter">
                            {storeSettings?.licenseExpiry ? storeSettings.licenseExpiry.toDate()?.toLocaleDateString() : '—— —— ——'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-8 flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full animate-pulse ${storeSettings?.licenseStatus === 'active' ? 'bg-green-400' : 'bg-red-400'}`} />
                        <span className="text-xs font-black uppercase tracking-widest">
                          {storeSettings?.licenseStatus === 'active' ? 'Système Certifié & Actif' : 'Licence Non Active'}
                        </span>
                      </div>
                    </div>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
                  </div>

                  <div className="bg-gray-50 border-2 border-gray-100 p-8 rounded-[32px]">
                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-6">Activation de la Licence</h4>
                    <form onSubmit={handleUpdateLicense} className="flex flex-col md:flex-row gap-4">
                      <input 
                        name="licenseKey"
                        placeholder=""
                        className="flex-1 bg-white border border-gray-100 rounded-2xl px-6 py-4 font-bold text-sm outline-none focus:border-blue-500 transition-all shadow-sm"
                        required
                      />
                      <button 
                        type="submit"
                        className="bg-gray-900 text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-black transition-all shadow-xl shadow-gray-200"
                      >
                        Activer la Licence
                      </button>
                    </form>
                    
                    {licenseError && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-5 p-5 bg-red-50 text-red-700 rounded-2xl border border-red-100 flex items-start gap-3.5 text-left"
                      >
                        <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-black uppercase tracking-wider">Erreur de Clé</p>
                          <p className="text-xs font-semibold leading-relaxed">{licenseError}</p>
                        </div>
                      </motion.div>
                    )}

                    <p className="mt-4 text-[10px] text-gray-400 font-medium">SUPPORT: G-LAB TECH SOLUTION • ANGES.GILDAS@GMAIL.COM / +228 91 03 30 04</p>
                  </div>
                </div>
              )}

            {activeTab === 'audit' && (
              <div className="space-y-8">
                 <div className="flex justify-between items-center">
                    <h3 className="text-2xl font-black text-gray-900">{t.audit}</h3>
                    <button className="p-3 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors"><RefreshCcw size={20} /></button>
                 </div>
                 <div className="space-y-4">
                    {logs.map(log => (
                      <div key={log.id} className="p-6 bg-gray-50 rounded-[32px] border border-gray-100/50 flex items-start justify-between hover:bg-white transition-all shadow-sm">
                         <div className="flex items-start gap-4">
                            <div className="p-3 bg-white rounded-2xl text-gray-400 shadow-sm"><History size={18} /></div>
                            <div>
                               <div className="flex items-center gap-2 mb-1">
                                 <span className="text-orange-500 font-black text-[9px] uppercase tracking-[0.2em]">{log.action}</span>
                                 <span className="text-[10px] text-gray-300">•</span>
                                 <span className="text-[10px] text-gray-400 font-bold">{log.timestamp?.toDate()?.toLocaleString() || 'N/A'}</span>
                               </div>
                               <p className="text-sm font-bold text-gray-900">{log.details || 'System action performed'}</p>
                               <p className="text-[10px] text-gray-400 mt-1 uppercase font-black tracking-widest">{log.userName || log.userId}</p>
                            </div>
                         </div>
                      </div>
                    ))}
                 </div>
              </div>
            )}
          </>
        )}
      </motion.div>
        )}
      </AnimatePresence>
       <AnimatePresence>
         {isSetPasswordOpen && (
           <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-xl" />
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
               className="relative bg-white w-full max-w-sm rounded-[44px] p-10 shadow-2xl text-center overflow-hidden border border-white/20"
             >
               <div className="absolute top-0 left-0 w-full h-2 bg-orange-500" />
               <div className="w-20 h-20 bg-orange-50 rounded-[28px] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-orange-500/10">
                 <Lock className="text-orange-500" size={32} />
               </div>
               <h3 className="text-2xl font-black text-gray-900 mb-2 tracking-tighter uppercase">SÉCURITÉ RENFORCÉE</h3>
               <p className="text-gray-500 text-sm font-medium mb-8">Définissez un mot de passe pour protéger le module Paramètres et les actions sensibles.</p>
               
               <form onSubmit={handleSetSettingsPassword} className="space-y-4">
                  <input 
                    name="password" type="password" required placeholder="Nouveau Mot de Passe" 
                    className="w-full px-8 py-5 bg-gray-50 rounded-3xl font-bold text-gray-900 border-none focus:ring-4 focus:ring-orange-500/5 outline-none text-center"
                  />
                  <input 
                    name="confirm" type="password" required placeholder="Confirmer Mot de Passe" 
                    className="w-full px-8 py-5 bg-gray-50 rounded-3xl font-bold text-gray-900 border-none focus:ring-4 focus:ring-orange-500/5 outline-none text-center"
                  />
                  <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest text-[11px] hover:bg-black transition-all shadow-xl shadow-slate-200">
                    ENREGISTRER LA SÉCURITÉ
                  </button>
               </form>
             </motion.div>
           </div>
         )}
         {isVerifyPasswordOpen && (
           <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
               className="relative bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl text-center"
             >
               <div className="w-16 h-16 bg-gray-900 text-white rounded-[20px] flex items-center justify-center mx-auto mb-6 transform rotate-6">
                 <ShieldCheck size={28} />
               </div>
               <h3 className="text-xl font-black text-gray-900 mb-1 tracking-tighter uppercase underline decoration-orange-500 decoration-2 underline-offset-4 tracking-tighter">ACTION VALIDÉE ?</h3>
               <p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest mb-8">Saisissez votre mot de passe de sécurité</p>
               
               <form onSubmit={handleVerifyPassword} className="space-y-4">
                  <input 
                    type="password" autoFocus required placeholder="••••" 
                    value={settingsPasswordInput} onChange={e => { setSettingsPasswordInput(e.target.value); setVerifyPasswordError(null); }}
                    className="w-full px-8 py-5 bg-gray-50 rounded-3xl font-black text-gray-900 border-none focus:ring-4 focus:ring-orange-500/5 outline-none text-center text-2xl tracking-[1em]"
                  />
                  {verifyPasswordError && (
                    <motion.p 
                      initial={{ opacity: 0, y: -10 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      className="text-xs text-red-500 font-extrabold font-sans"
                    >
                      {verifyPasswordError}
                    </motion.p>
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setIsVerifyPasswordOpen(false); setPendingAction(null); setSettingsPasswordInput(''); }} className="flex-1 py-4 bg-gray-100 text-gray-400 rounded-2xl font-black text-[10px] uppercase tracking-widest">ANNULER</button>
                    <button type="submit" className="flex-[2] py-4 bg-orange-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-orange-500/20">VALIDER</button>
                  </div>
                  <button 
                    type="button"
                    onClick={() => window.location.href = 'mailto:anges.gildas@gmail.com?subject=Réinitialisation Mot de Passe Paramètres MARKET PRO'}
                    className="mt-6 text-[9px] font-black text-orange-500 uppercase tracking-widest hover:underline"
                  >
                    Mot de passe oublié ? Contactez le Support
                  </button>
               </form>
             </motion.div>
           </div>
         )}
       </AnimatePresence>
     </div>
   );
 }
