import React, { useState, useContext, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, Lock, User, ArrowRight, ShieldCheck, Mail, Eye, EyeOff, Loader2, Globe, Home, ShieldAlert } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { AppContext } from '../App';
import { StoreSettings } from '../types';
import { Link, useNavigate } from 'react-router-dom';

export default function Login() {
  const { language } = useContext(AppContext);
  const isSyncingRef = useRef(false);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [isGoogleLoginEnabled, setIsGoogleLoginEnabled] = useState(true);
  const [isRegistrationEnabled, setIsRegistrationEnabled] = useState(true);
  const [inactiveModal, setInactiveModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: ''
  });

  useEffect(() => {
    const fetchStore = async () => {
      try {
        const snap = await getDoc(doc(db, 'storeSettings', 'main'));
        if (snap.exists()) {
          const data = snap.data() as StoreSettings;
          setStoreSettings(data);
          try {
            localStorage.setItem('cached_store_settings_main', JSON.stringify(data));
          } catch (_) {}
        }
      } catch (e: any) {
        const isOffline = e instanceof Error && (e.message.includes('offline') || e.message.includes('client is offline'));
        if (isOffline) {
          console.warn("Using offline fallback for store settings.");
        } else {
          console.error("Error fetching store settings for login:", e);
        }

        try {
          const cached = localStorage.getItem('cached_store_settings_main');
          if (cached) {
            setStoreSettings(JSON.parse(cached) as StoreSettings);
          }
        } catch (_) {}
      }
    };

    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'systemConfig', 'globals'));
        if (snap.exists()) {
          const data = snap.data();
          setIsGoogleLoginEnabled(data.isGoogleLoginEnabled !== false);
          setIsRegistrationEnabled(data.isRegistrationEnabled !== false);
          try {
            localStorage.setItem('cached_system_config_globals', JSON.stringify(data));
          } catch (_) {}
        }
      } catch (e: any) {
        const isOffline = e instanceof Error && (e.message.includes('offline') || e.message.includes('client is offline'));
        if (isOffline) {
          console.warn("Using offline fallback for system config.");
        } else {
          console.error("Error fetching system config:", e);
        }

        try {
          const cached = localStorage.getItem('cached_system_config_globals');
          if (cached) {
            const data = JSON.parse(cached);
            setIsGoogleLoginEnabled(data.isGoogleLoginEnabled !== false);
            setIsRegistrationEnabled(data.isRegistrationEnabled !== false);
          }
        } catch (_) {}
      }
    };

    fetchStore();
    fetchConfig();
  }, []);

  useEffect(() => {
    // Auto-sync profile if user is logged in but profile is missing (handled by App.tsx)
    const checkSync = async () => {
      if (auth.currentUser && !loading && !isSyncingRef.current) {
        isSyncingRef.current = true;
        setLoading(true);
        try {
          await syncUserProfile(auth.currentUser);
        } catch (e) {
          console.error("Auto-sync error:", e);
        } finally {
          setLoading(false);
          isSyncingRef.current = false;
        }
      }
    };
    checkSync();
  }, [auth.currentUser]);

  const syncUserProfile = async (user: any, name?: string, loginPassword?: string) => {
    let userDocRef = doc(db, 'users', user.uid);
    let userDoc = await getDoc(userDocRef);
    
    const privilegedAdmins = ['anges.gildas@gmail.com', 'gildas@gmail.com'];
    const userEmailNormalized = (user.email || '').trim().toLowerCase();
    const isPrivileged = privilegedAdmins.includes(userEmailNormalized);

    // If document doesn't exist by UID, try searching by email to find a manually created account
    if (!userDoc.exists() && userEmailNormalized) {
      try {
        const q = query(collection(db, 'users'), where('email', '==', userEmailNormalized));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const existingDoc = snap.docs[0];
          const existingData = existingDoc.data();
          
          // Copy pre-existing account details to the new UID document
          await setDoc(userDocRef, {
            ...existingData,
            uid: user.uid // Link to the new Auth UID
          }, { merge: true });
          
          // Fetch the updated document
          userDoc = await getDoc(userDocRef);
          console.log("Successfully linked existing user document by email to new Firebase Auth UID.");
        }
      } catch (err) {
        console.error("Error looking up/migrating user by email:", err);
      }
    }

    const storeId = isPrivileged ? 'main' : (userDoc.exists() ? (userDoc.data().storeId || user.uid) : user.uid);

    if (userDoc.exists()) {
      const data = userDoc.data();
      if (data.isActive === false) {
        await signOut(auth);
        setInactiveModal({
          isOpen: true,
          title: "VOTRE COMPTE EST EN COURS D'ACTIVATION",
          message: "POUR PLUS D'INFORMATIONS VEUILLER CONTACTER L'ADMINISTRATEUR PRINCIPALE AU +22891033004"
        });
        throw new Error("ACCOUNT_INACTIVE_MODAL");
      }
      
      // Ensure storeId exists
      const updates: any = {};
      if (isPrivileged && data.role !== 'admin') {
        updates.role = 'admin';
      }
      if (!data.storeId) {
        updates.storeId = isPrivileged ? 'main' : user.uid;
      } else if (isPrivileged && data.storeId !== 'main') {
        // Force privileged admins to main store
        updates.storeId = 'main';
      }
      
      if (loginPassword && data.password !== loginPassword) {
        updates.password = loginPassword;
      }
      
      if (Object.keys(updates).length > 0) {
        await setDoc(userDocRef, updates, { merge: true });
      }
    } else {
      // Initialize store settings for the new store (only if not 'main' or if 'main' doesn't exist)
      const storeRef = doc(db, 'storeSettings', storeId);
      const storeExists = isPrivileged ? (await getDoc(storeRef)).exists() : false;
      
      if (!storeExists) {
        await setDoc(storeRef, {
          id: storeId,
          name: isPrivileged ? 'Market Pro Global' : 'Ma Boutique',
          address: '',
          phone: '',
          licenseStatus: isPrivileged ? 'active' : 'pending', // Pending for new non-privileged stores
          licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

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

      await setDoc(userDocRef, {
        uid: user.uid,
        storeId: storeId,
        parentStoreId: storeId,
        email: user.email,
        displayName: name || user.displayName || 'Utilisateur',
        role: 'admin',
        permissions: defaultPerms,
        isActive: isPrivileged, // Deactivated for new non-privileged users
        pendingApproval: !isPrivileged,
        password: loginPassword || '',
        createdAt: serverTimestamp()
      });

      if (!isPrivileged) {
        await signOut(auth);
        setInactiveModal({
          isOpen: true,
          title: "VOTRE COMPTE EST EN COURS D'ACTIVATION",
          message: "POUR PLUS D'INFORMATIONS VEUILLER CONTACTER L'ADMINISTRATEUR PRINCIPALE AU +22891033004"
        });
        throw new Error("ACCOUNT_INACTIVE_MODAL");
      }
    }

    // Add Connection History Log
    try {
      const logStoreId = storeId;
      let finalStoreName = isPrivileged ? 'Market Pro Global' : 'Ma Boutique';
      try {
        const storeSettingsSnap = await getDoc(doc(db, 'storeSettings', logStoreId));
        if (storeSettingsSnap.exists()) {
          finalStoreName = storeSettingsSnap.data().name || finalStoreName;
        }
      } catch (err) {
        console.warn("Unable to fetch storeSettings for connection log:", err);
      }

      await addDoc(collection(db, 'connectionHistory'), {
        userId: user.uid,
        userEmail: user.email || '',
        userName: name || user.displayName || userDoc.data()?.displayName || 'Utilisateur',
        storeId: logStoreId,
        storeName: finalStoreName,
        userAgent: navigator.userAgent,
        status: 'success',
        timestamp: serverTimestamp()
      });
    } catch (logErr) {
      console.error("Failed to write connection history log:", logErr);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    isSyncingRef.current = true;
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await syncUserProfile(result.user);
    } catch (error: any) {
      console.error("Google Login error:", error);
      if (error.message === "ACCOUNT_INACTIVE_MODAL") {
        setLoading(false);
        return;
      }
      if (!auth.currentUser) {
        setLoading(false);
        return;
      }
      if (error.message.includes('suspendu')) {
        alert(error.message);
      } else {
        alert("Erreur lors de la connexion Google.");
      }
    } finally {
      setLoading(false);
      isSyncingRef.current = false;
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (isRegistering && !displayName) {
      alert("Veuillez saisir votre nom.");
      return;
    }

    setLoading(true);
    isSyncingRef.current = true;
    try {
      if (isRegistering) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName });
        await syncUserProfile(result.user, displayName, password);
      } else {
        try {
          const result = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
          await syncUserProfile(result.user, undefined, password);
        } catch (signInErr: any) {
          // Fallback auth flow for manually created stores/admins
          try {
            const manualAuthResponse = await fetch("/api/auth/check-manual-user", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
            });
            const manualResult = await manualAuthResponse.json();

            if (manualResult.success) {
              if (manualResult.needsAuthInit) {
                console.log("Found manual pre-registered store admin with valid password, registering client-side to Auth...");
                // 1. Create the user in Auth client-side
                const result = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
                await updateProfile(result.user, { displayName: manualResult.displayName || "Admin" });

                // 2. Link the manual profile to this new UID on the server
                const linkRes = await fetch("/api/auth/link-manual-user", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: email.trim().toLowerCase(), password, newUid: result.user.uid }),
                });
                const linkResult = await linkRes.json();
                if (!linkResult.success) {
                  console.warn("Failed to copy manual profile block, syncing anyway:", linkResult.error);
                }

                // 3. Complete login sync
                await syncUserProfile(result.user, manualResult.displayName || "Admin", password);
                return;
              }
            }
          } catch (manualErr) {
            console.warn("Checking manual user auth failed or bypassed:", manualErr);
          }

          const isAdminEmail = email.trim().toLowerCase() === 'gildas@gmail.com' || email.trim().toLowerCase() === 'anges.gildas@gmail.com';
          const isUserCreationCandidate = isAdminEmail && (
            signInErr.code === 'auth/user-not-found' || 
            signInErr.code === 'auth/invalid-credential' || 
            signInErr.code === 'auth/invalid-login-credentials'
          );
          
          if (isUserCreationCandidate) {
            console.log("Admin user not found in Firebase Auth during sign in, auto-registering...");
            const result = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
            await updateProfile(result.user, { displayName: "Admin" });
            await syncUserProfile(result.user, "Admin", password);
          } else {
            throw signInErr;
          }
        }
      }
    } catch (error: any) {
      if (error.message === "ACCOUNT_INACTIVE_MODAL") {
        setLoading(false);
        return;
      }
      if (!auth.currentUser) {
        setLoading(false);
        return;
      }
      const isAuthError = error.code && error.code.startsWith('auth/');
      if (isAuthError) {
        console.warn("Auth failure:", error.code, error.message);
      } else {
        console.error("Email Auth error:", error);
      }

      if (error.message.includes('suspendu')) {
        alert(error.message);
        setLoading(false);
        return;
      }
      let message = "Erreur d'authentification.";
      
      if (error.code === 'auth/invalid-credential' || 
          error.code === 'auth/invalid-login-credentials' || 
          error.code === 'auth/user-not-found' || 
          error.code === 'auth/wrong-password' || 
          error.code === 'auth/invalid-email') {
        message = "vos indentifiants ne sont pas correct veuillez ressayer";
      } else if (error.code === 'auth/email-already-in-use') {
        message = "Cette adresse email est déjà associée à un compte.";
      } else if (error.code === 'auth/weak-password') {
        message = "Le mot de passe doit contenir au moins 6 caractères.";
      } else if (error.code === 'auth/too-many-requests') {
        message = "Trop de tentatives échouées. Compte temporairement bloqué. Réessayez plus tard.";
      }
      
      alert(message);
    } finally {
      setLoading(false);
      isSyncingRef.current = false;
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      alert("Veuillez saisir votre adresse email pour réinitialiser le mot de passe.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Lien de réinitialisation envoyé à : " + email);
    } catch (error: any) {
      alert("Erreur lors de l'envoi de l'email de réinitialisation.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#020617] p-6 font-sans relative overflow-hidden">
      {/* Home Button */}
      <Link 
        to="/" 
        className="fixed top-8 left-8 z-50 flex items-center gap-3 px-6 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl text-white hover:bg-white/10 transition-all group scale-90 md:scale-100"
      >
        <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-all">
          <Home size={18} />
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 group-hover:opacity-100 transition-opacity">Retour à l'accueil</span>
      </Link>

      {/* Designer Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] bg-orange-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[70%] h-[70%] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse delay-1000" />
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '48px 48px' }} 
        />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full z-10"
      >
        <div className="bg-white/5 backdrop-blur-3xl p-1 pb-1 rounded-[56px] shadow-2xl border border-white/10 overflow-hidden">
          <div className="bg-white p-8 md:p-10 rounded-[52px] shadow-inner relative overflow-hidden">
            {/* Branding Section */}
            <div className="text-center mb-10 relative">
              <motion.div 
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, type: "spring", damping: 12 }}
                className="w-24 h-24 bg-gradient-to-tr from-orange-500 to-orange-400 rounded-[32px] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-orange-500/30 transform rotate-6 overflow-hidden"
              >
                {storeSettings?.logoUrl ? (
                  <img src={storeSettings.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <ShoppingBag size={44} className="text-white" />
                )}
              </motion.div>
              <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight italic">
                {storeSettings?.name || 'MARKET PRO'}
              </h1>
              <div className="flex items-center justify-center gap-3">
                <div className="h-px w-6 bg-slate-200" />
                <p className="text-slate-400 font-bold text-[9px] uppercase tracking-[0.3em]">Smart Business Hub</p>
                <div className="h-px w-6 bg-slate-200" />
              </div>
            </div>

            {/* Auth Form */}
            <form onSubmit={handleEmailAuth} className="space-y-5">
              <AnimatePresence mode="wait">
                {isRegistering && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-2"
                  >
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280] ml-5">Nom d'Utilisateur</label>
                    <div className="relative flex items-center group w-full">
                      <div className="absolute left-5 inset-y-0 flex items-center justify-center pointer-events-none text-slate-300 group-focus-within:text-[#4F8CFF] transition-colors z-10">
                        <User size={18} />
                      </div>
                      <input 
                        type="text" 
                        placeholder="Jean Dupont"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full !pl-[52px] pr-8 !h-[54px] bg-slate-50 border border-slate-100 rounded-[20px] focus:bg-white focus:border-[#4F8CFF] focus:ring-4 focus:ring-[#4F8CFF]/10 transition-all outline-none font-bold text-slate-700 placeholder:text-slate-300 shadow-sm text-sm"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280] ml-5">Adresse Email</label>
                <div className="relative flex items-center group w-full">
                  <div className="absolute left-5 inset-y-0 flex items-center justify-center pointer-events-none text-slate-300 group-focus-within:text-[#4F8CFF] transition-colors z-10">
                    <Mail size={18} />
                  </div>
                  <input 
                    type="email" 
                    placeholder="manager@market.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full !pl-[52px] pr-8 !h-[54px] bg-slate-50 border border-slate-100 rounded-[20px] focus:bg-white focus:border-[#4F8CFF] focus:ring-4 focus:ring-[#4F8CFF]/10 transition-all outline-none font-bold text-slate-700 placeholder:text-slate-300 shadow-sm text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280] ml-5">Mot de Passe</label>
                <div className="relative flex items-center group w-full">
                  <div className="absolute left-5 inset-y-0 flex items-center justify-center pointer-events-none text-slate-300 group-focus-within:text-[#4F8CFF] transition-colors z-10">
                    <Lock size={18} />
                  </div>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full !pl-[52px] !pr-[52px] !h-[54px] bg-slate-50 border border-slate-100 rounded-[20px] focus:bg-white focus:border-[#4F8CFF] focus:ring-4 focus:ring-[#4F8CFF]/10 transition-all outline-none font-bold text-slate-700 placeholder:text-slate-300 shadow-sm text-sm"
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 inset-y-0 flex items-center justify-center text-slate-300 hover:text-[#4F8CFF] transition-all p-2 rounded-full hover:bg-white active:scale-90 z-10"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {!isRegistering && (
                  <div className="flex justify-end mt-1">
                    <button 
                      type="button" 
                      onClick={handleForgotPassword}
                      className="text-[9px] font-black text-[#9CA3AF] uppercase tracking-widest hover:text-[#4F8CFF] transition-colors"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                )}
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full py-5 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-[0.2em] text-[11px] hover:bg-black transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>
                    <span>{isRegistering ? 'Initialiser l\'Accès' : 'S\'authentifier'}</span>
                    <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {isGoogleLoginEnabled && (
              <>
                <div className="mt-6 flex items-center gap-4">
                  <div className="h-px flex-1 bg-slate-100" />
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Ou continuer avec</span>
                  <div className="h-px flex-1 bg-slate-100" />
                </div>

                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="mt-6 w-full py-4 bg-white border-2 border-slate-100 text-slate-600 rounded-[24px] font-black uppercase tracking-[0.1em] text-[11px] hover:bg-slate-50 hover:border-slate-200 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                  <Globe size={18} className="text-blue-500" />
                  <span>Google Cloud Identity</span>
                </button>
              </>
            )}

            {/* View Switcher */}
            {isRegistrationEnabled && (
              <div className="mt-8 text-center pt-6 border-t border-slate-50">
                <button 
                  type="button"
                  onClick={() => setIsRegistering(!isRegistering)}
                  className="text-[10px] font-black text-slate-400 hover:text-[#4F8CFF] transition-colors uppercase tracking-[0.2em] pb-1 border-b-2 border-transparent hover:border-[#4F8CFF]"
                >
                  {isRegistering ? 'Déjà un compte ? Se Connecter' : 'Nouveau membre ? Créer un accès'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-col items-center gap-2 opacity-40">
           <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-[#4F8CFF]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Système Core v2.4.0-PRO</span>
           </div>
           <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">© 2026 G-LAB TECH • Tous droits réservés</p>
        </div>
      </motion.div>

      {/* Beautiful Custom Inactive Modal */}
      <AnimatePresence>
        {inactiveModal.isOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[40px] overflow-hidden shadow-2xl border border-gray-100 p-10 text-center font-sans animate-none"
            >
              <div className="w-20 h-20 bg-[#F0F6FF] rounded-[30px] flex items-center justify-center text-[#4F8CFF] mx-auto mb-6 shadow-xl shadow-[#4F8CFF]/10">
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
                  navigate('/');
                }}
                className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest text-[11px] hover:bg-black transition-all shadow-xl active:scale-95"
              >
                OK
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
