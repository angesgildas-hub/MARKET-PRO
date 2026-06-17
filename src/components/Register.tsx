import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Store, 
  User, 
  MapPin, 
  Mail, 
  Lock, 
  Globe, 
  CreditCard, 
  Smartphone, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Loader2,
  ShieldCheck,
  SmartphoneNfc
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import LegalDocsModal from './LegalDocsModal';
import { 
  createUserWithEmailAndPassword, 
  updateProfile, 
  signOut 
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';

const countries = [
  { 
    code: 'TG', 
    name: 'Togo', 
    dialCode: '+228',
    operators: [
      { id: 'tmoney_tg', name: 'TMoney', icon: Smartphone },
      { id: 'moov_tg', name: 'Moov Money', icon: Smartphone },
    ]
  },
  { 
    code: 'CI', 
    name: 'Côte d\'Ivoire', 
    dialCode: '+225',
    operators: [
      { id: 'orange_ci', name: 'Orange Money', icon: Smartphone },
      { id: 'mtn_ci', name: 'MTN Mobile Money', icon: Smartphone },
      { id: 'moov_ci', name: 'Moov Money', icon: Smartphone },
      { id: 'wave_ci', name: 'Wave', icon: Smartphone },
    ]
  },
  { 
    code: 'SN', 
    name: 'Sénégal', 
    dialCode: '+221',
    operators: [
      { id: 'orange_sn', name: 'Orange Money', icon: Smartphone },
      { id: 'free_sn', name: 'Free Money', icon: Smartphone },
      { id: 'wave_sn', name: 'Wave', icon: Smartphone },
    ]
  },
  { 
    code: 'BF', 
    name: 'Burkina Faso', 
    dialCode: '+226',
    operators: [
      { id: 'orange_bf', name: 'Orange Money', icon: Smartphone },
      { id: 'moov_bf', name: 'Moov Money', icon: Smartphone },
    ]
  },
  { 
    code: 'ML', 
    name: 'Mali', 
    dialCode: '+223',
    operators: [
      { id: 'orange_ml', name: 'Orange Money', icon: Smartphone },
      { id: 'moov_ml', name: 'Moov Money', icon: Smartphone },
    ]
  },
  { 
    code: 'BJ', 
    name: 'Bénin', 
    dialCode: '+229',
    operators: [
      { id: 'mtn_bj', name: 'MTN Mobile Money', icon: Smartphone },
      { id: 'moov_bj', name: 'Moov Money', icon: Smartphone },
    ]
  },
  { 
    code: 'GN', 
    name: 'Guinée', 
    dialCode: '+224',
    operators: [
      { id: 'orange_gn', name: 'Orange Money', icon: Smartphone },
      { id: 'mtn_gn', name: 'MTN Mobile Money', icon: Smartphone },
    ]
  },
  { 
    code: 'CM', 
    name: 'Cameroun', 
    dialCode: '+237',
    operators: [
      { id: 'orange_cm', name: 'Orange Money', icon: Smartphone },
      { id: 'mtn_cm', name: 'MTN Mobile Money', icon: Smartphone },
    ]
  },
];

const paymentOptions = [
  { id: 'card', name: 'Carte Bancaire (Visa/Mastercard)', icon: CreditCard },
  { id: 'mobile', name: 'Mobile Money', icon: SmartphoneNfc },
];

export default function Register() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<'cgu' | 'privacy'>('cgu');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const navigate = useNavigate();

  // Form State
  const [formData, setFormData] = useState({
    storeName: '',
    address: '',
    email: '',
    password: '',
    displayName: '',
    country: countries[0].code,
    paymentMethods: [] as string[],
    selectedOperators: [] as string[],
    operatorNumbers: {} as Record<string, string>,
  });

  const subdomain = formData.storeName 
    ? formData.storeName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.marketpro.com' 
    : 'ma-boutique.marketpro.com';

  const handleTogglePayment = (id: string) => {
    setFormData(prev => ({
      ...prev,
      paymentMethods: prev.paymentMethods.includes(id)
        ? prev.paymentMethods.filter(m => m !== id)
        : [...prev.paymentMethods, id]
    }));
  };

  const handleToggleOperator = (id: string) => {
    setFormData(prev => ({
      ...prev,
      selectedOperators: prev.selectedOperators.includes(id)
        ? prev.selectedOperators.filter(m => m !== id)
        : [...prev.selectedOperators, id]
    }));
  };

  const handleOperatorNumberChange = (id: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      operatorNumbers: {
        ...prev.operatorNumbers,
        [id]: value
      }
    }));
  };

  const currentCountry = countries.find(c => c.code === formData.country);

  const handleSubmit = async () => {
    if (!termsAccepted) {
      alert("Veuillez accepter les Conditions d'Utilisation et la Politique de Confidentialité régies au Togo avant de poursuivre l'inscription.");
      return;
    }
    setLoading(true);
    try {
      // 1. Create Auth User
      const result = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      await updateProfile(result.user, { displayName: formData.displayName });

      const storeId = result.user.uid;

      // Map registration operator numbers to mobileMoneySettings format
      const mappedMerchantNumbers: Record<string, string> = {};
      if (formData.operatorNumbers) {
        Object.entries(formData.operatorNumbers).forEach(([key, val]) => {
          const value = typeof val === 'string' ? val : '';
          if (value && value.trim() !== '') {
            const lastUnderscoreIndex = key.lastIndexOf('_');
            if (lastUnderscoreIndex !== -1) {
              const operatorPart = key.substring(0, lastUnderscoreIndex);
              const rootKey = `${formData.country}_${operatorPart}`;
              mappedMerchantNumbers[rootKey] = value.trim();
            } else {
              const rootKey = `${formData.country}_${key}`;
              mappedMerchantNumbers[rootKey] = value.trim();
            }
          }
        });
      }

      await setDoc(doc(db, 'mobileMoneySettings', storeId), {
        selectedCountry: formData.country,
        merchantNumbers: mappedMerchantNumbers,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 2. Create Store Settings
      await setDoc(doc(db, 'storeSettings', storeId), {
        id: storeId,
        name: formData.storeName,
        subdomain: subdomain,
        address: formData.address,
        phone: '', // Can be added later
        licenseStatus: 'pending',
        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        country: formData.country,
        paymentMethods: formData.paymentMethods,
        selectedOperators: formData.selectedOperators,
        operatorNumbers: formData.operatorNumbers,
        updatedAt: new Date().toISOString()
      });

      // 3. Create User Profile
      await setDoc(doc(db, 'users', result.user.uid), {
        uid: result.user.uid,
        storeId: storeId,
        parentStoreId: storeId,
        email: formData.email,
        displayName: formData.displayName,
        role: 'admin',
        isActive: false, // Default to false for pending approval
        pendingApproval: true,
        country: formData.country,
        createdAt: serverTimestamp(),
        password: formData.password,
        permissions: {
          pos: { read: true, create: true, update: true, delete: true },
          inventory: { read: true, create: true, update: true, delete: true },
          accounting: { read: true, create: true, update: true, delete: true },
          settings: { read: true, create: true, update: true, delete: true },
          reports: { read: true, create: true, update: true, delete: true },
          personnel: { read: true, create: true, update: true, delete: true },
          clients: { read: true, create: true, update: true, delete: true },
          sales: { read: true, create: true, update: true, delete: true }
        }
      });

      // 4. Send email notification to Super Admin
      try {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'store_requested',
            data: {
              storeName: formData.storeName,
              email: formData.email,
              displayName: formData.displayName,
              address: formData.address || '',
              country: formData.country || ''
            }
          })
        });
        console.log("Super Admin notification email request sent.");
      } catch (emailErr) {
        console.error("Failed to call send-email api:", emailErr);
      }

      // 5. Sign out
      await signOut(auth);
      setSuccess(true);
    } catch (error: any) {
      console.error("Registration error:", error);
      alert(error.message || "Une erreur est survenue lors de la création de votre compte.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617] p-6 font-sans">
        <div 
          className="max-w-md w-full bg-white rounded-[56px] p-12 text-center shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 blur-3xl -z-10" />
          <div className="w-24 h-24 bg-green-100 text-green-600 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-xl shadow-green-100/50">
            <CheckCircle2 size={48} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-6 italic tracking-tight uppercase leading-tight">Compte créé avec succès !</h2>
          <div className="space-y-4 mb-10">
            <p className="text-slate-500 font-medium leading-relaxed">
              Félicitations, votre demande de création pour <span className="text-orange-500 font-black">"{formData.storeName}"</span> a été enregistrée.
            </p>
            <div className="p-6 bg-orange-50 rounded-3xl border border-orange-100 flex items-start gap-4 text-left">
              <ShieldCheck className="text-orange-500 shrink-0" size={24} />
              <p className="text-orange-950 text-sm font-bold leading-relaxed">
                Votre compte est en cours d'activation. Veuillez contacter l'administrateur principal pour finaliser l'accès.
              </p>
            </div>
            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-left">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Votre Installation</p>
              <p className="text-slate-900 font-black text-sm">{subdomain}</p>
              <p className="text-[10px] text-slate-400 mt-1">Vous pourrez y accéder dès activation.</p>
            </div>
          </div>
          <Link 
            to="/" 
            className="w-full py-5 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest text-[11px] hover:bg-black transition-all shadow-xl shadow-slate-200 block"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] p-6 font-sans relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[5%] w-[40%] h-[40%] bg-orange-500/5 rounded-full blur-[100px]" />
        <div className="absolute -bottom-[10%] -right-[5%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-xl w-full z-10">
        <div className="bg-white/10 backdrop-blur-3xl p-1 rounded-[28px] border border-white/10 shadow-2xl overflow-hidden">
          <div className="bg-white rounded-[24px] p-6 md:p-10">
            
            {/* Header */}
            <div className="text-center mb-10">
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className={`w-3 h-3 rounded-full transition-all ${step === 1 ? 'bg-orange-500 scale-125 shadow-lg shadow-orange-500/30' : 'bg-slate-200'}`} />
                <div className="w-8 h-1 bg-slate-100 rounded-full" />
                <span className={`w-3 h-3 rounded-full transition-all ${step === 2 ? 'bg-orange-500 scale-125 shadow-lg shadow-orange-500/30' : 'bg-slate-200'}`} />
              </div>
              <h1 className="text-4xl font-black text-slate-900 mb-2 italic tracking-tight uppercase">Configuration</h1>
              <p className="text-slate-400 font-bold text-[9px] uppercase tracking-[0.4em]">Propulsez votre boutique physique</p>
            </div>

            <div>
              {step === 1 ? (
                <div className="space-y-6 animate-none">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1 col-span-2 md:col-span-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-3">Nom de la Boutique</label>
                      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-1.5 hover:bg-slate-100/50 transition-all shadow-sm">
                        <Store className="text-slate-400 shrink-0" size={14} />
                        <input 
                          type="text" 
                          placeholder="Market Pro Plus"
                          value={formData.storeName}
                          onChange={(e) => setFormData(prev => ({ ...prev, storeName: e.target.value }))}
                          className="register-input w-full font-bold text-slate-700 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1 col-span-2 md:col-span-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-3">Sous-domaine Professionnel</label>
                      <div className="h-[38px] px-4 bg-slate-100/50 rounded-xl border border-dashed border-slate-200 flex items-center">
                        <span className="text-[9px] font-black text-orange-600 uppercase tracking-widest truncate">{subdomain}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-3">Adresse Physique</label>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-1.5 hover:bg-slate-100/50 transition-all shadow-sm">
                      <MapPin className="text-slate-400 shrink-0" size={14} />
                      <input 
                        type="text" 
                        placeholder="Lomé, Agoè-Nyivé, Togo"
                        value={formData.address}
                        onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                        className="register-input w-full font-bold text-slate-700 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-3">Nom d'Administrateur</label>
                       <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-1.5 hover:bg-slate-100/50 transition-all shadow-sm">
                         <User className="text-slate-400 shrink-0" size={14} />
                         <input 
                           type="text" 
                           placeholder="Jean Dupont"
                           value={formData.displayName}
                           onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                           className="register-input w-full font-bold text-slate-700 text-xs"
                         />
                       </div>
                    </div>
                    <div className="space-y-1">
                       <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-3">Email Professionnel</label>
                       <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-1.5 hover:bg-slate-100/50 transition-all shadow-sm">
                         <Mail className="text-slate-400 shrink-0" size={14} />
                         <input 
                           type="email" 
                           placeholder="admin@boutique.com"
                           value={formData.email}
                           onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                           className="register-input w-full font-bold text-slate-700 text-xs"
                         />
                       </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-3">Mot de Passe Système</label>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-1.5 hover:bg-slate-100/50 transition-all shadow-sm">
                      <Lock className="text-slate-400 shrink-0" size={14} />
                      <input 
                        type="password" 
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        className="register-input w-full font-bold text-slate-700 text-xs"
                      />
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      if (!formData.storeName || !formData.email || !formData.password || !formData.displayName) {
                        alert("Veuillez remplir tous les champs obligatoires.");
                        return;
                      }
                      setStep(2);
                    }}
                    className="w-full py-3.5 bg-orange-600 text-white rounded-xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-orange-700 transition-all shadow-xl shadow-orange-100 flex items-center justify-center gap-3 group"
                  >
                    <span>Suivant</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              ) : (
                <div className="space-y-8 animate-none">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-3">Pays de Résidence</label>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-2 hover:bg-slate-100/50 transition-all shadow-sm">
                      <Globe className="text-slate-400 shrink-0" size={16} />
                      <select 
                        value={formData.country}
                        onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                        className="register-select w-full font-bold text-slate-700 cursor-pointer text-xs"
                      >
                        {countries.map(c => (
                          <option key={c.code} value={c.code} className="bg-white text-slate-700 font-bold">{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-5 block">Modes de Paiement Principaux</label>
                    <div className="grid grid-cols-2 gap-4">
                      {paymentOptions.map(option => {
                        const isSelected = formData.paymentMethods.includes(option.id);
                        return (
                          <button
                            key={option.id}
                            onClick={() => handleTogglePayment(option.id)}
                            className={`p-6 rounded-[32px] border-2 flex flex-col items-center gap-3 transition-all ${isSelected ? 'bg-orange-50 border-orange-500 shadow-lg scale-105' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}
                          >
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isSelected ? 'bg-orange-500 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>
                              <option.icon size={24} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest leading-tight text-center">{option.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {formData.paymentMethods.includes('mobile') && currentCountry?.operators && (
                    <div className="space-y-6">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-5 block">Opérateurs Mobiles Disponibles ({currentCountry.name})</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {currentCountry.operators.map(op => {
                          const isSelected = formData.selectedOperators.includes(op.id);
                          return (
                            <button
                              key={op.id}
                              onClick={() => handleToggleOperator(op.id)}
                              className={`p-4 rounded-3xl border-2 flex flex-col items-center gap-2 transition-all ${isSelected ? 'bg-orange-50 border-orange-500/50' : 'bg-slate-50 border-transparent'}`}
                            >
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSelected ? 'bg-orange-500 text-white' : 'bg-white text-slate-400'}`}>
                                <Smartphone size={20} />
                              </div>
                              <span className="text-[9px] font-black uppercase tracking-tight text-center">{op.name}</span>
                            </button>
                          );
                        })}
                      </div>

                      {formData.selectedOperators.length > 0 && (
                        <div className="space-y-4 pt-4 border-t border-slate-100">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-5 block">Numéros de réception</label>
                          <div className="space-y-3">
                            {formData.selectedOperators.map(opId => {
                              const op = currentCountry.operators?.find(o => o.id === opId);
                              return (
                                <div key={opId} className="space-y-1">
                                  <p className="text-[9px] font-black text-slate-400 uppercase ml-5">{op?.name}</p>
                                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-2 hover:bg-slate-100/50 transition-all shadow-sm">
                                    <SmartphoneNfc className="text-slate-400 shrink-0" size={16} />
                                    <div className="font-black text-slate-400 text-xs border-r border-slate-200 pr-3 shrink-0">
                                      {currentCountry?.dialCode}
                                    </div>
                                    <input 
                                      type="tel" 
                                      placeholder="Numéro de paiement"
                                      value={formData.operatorNumbers[opId] || ''}
                                      onChange={(e) => handleOperatorNumberChange(opId, e.target.value)}
                                      className="register-input w-full font-bold text-slate-700 text-xs"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Togolese GDPR & Legal Terms Acceptance check */}
                  <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-100/85 rounded-[24px] mt-4 select-none">
                    <input 
                      type="checkbox" 
                      id="accept-togo-terms"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-1 w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-0 cursor-pointer"
                    />
                    <label htmlFor="accept-togo-terms" className="text-[10px] font-bold text-slate-500 leading-normal cursor-pointer text-left select-none">
                      En cochant cette case, j'accepte les{' '}
                      <button 
                        type="button"
                        onClick={() => { setLegalTab('cgu'); setIsLegalOpen(true); }}
                        className="text-orange-500 hover:underline hover:text-orange-600 font-extrabold"
                      >
                        Conditions Générales d'Utilisation
                      </button>{' '}
                      et la{' '}
                      <button 
                        type="button"
                        onClick={() => { setLegalTab('privacy'); setIsLegalOpen(true); }}
                        className="text-orange-500 hover:underline hover:text-orange-600 font-extrabold"
                      >
                        Politique de Confidentialité
                      </button>{' '}
                      applicables en République du Togo.
                    </label>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button 
                      onClick={() => setStep(1)}
                      className="w-1/3 py-3 bg-slate-100 text-slate-600 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                    >
                      <ArrowLeft size={14} />
                      <span>Back</span>
                    </button>
                    <button 
                      onClick={handleSubmit}
                      disabled={loading}
                      className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-black transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {loading ? (
                        <Loader2 className="animate-spin" size={18} />
                      ) : (
                        <>
                          <span>Terminer</span>
                          <CheckCircle2 size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-10 text-center">
              <Link to="/" className="text-[10px] font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest transition-colors">Annuler et revenir</Link>
            </div>
          </div>
        </div>
      </div>

      <LegalDocsModal 
        isOpen={isLegalOpen} 
        onClose={() => setIsLegalOpen(false)} 
        defaultTab={legalTab} 
      />
    </div>
  );
}
