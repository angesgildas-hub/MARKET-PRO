import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowRight, 
  Users, 
  Receipt, 
  LayoutDashboard, 
  PieChart, 
  Bell, 
  Calculator,
  CheckCircle2, 
  ShieldCheck, 
  Star,
  Quote,
  ShoppingBag
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { StoreSettings } from '../types';
import LegalDocsModal from './LegalDocsModal';

const features = [
  {
    icon: Users,
    title: "Gestion Clients",
    description: "Centralisez les données de vos clients, suivez leurs historiques d'achats et gérez la fidélité en temps réel.",
    color: "bg-blue-500"
  },
  {
    icon: Receipt,
    title: "Facturation",
    description: "Émettez des factures professionnelles et suivez les paiements en attente automatiquement.",
    color: "bg-orange-500"
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    description: "Une vue d'ensemble instantanée sur vos performances, stocks et alertes critiques.",
    color: "bg-purple-500"
  },
  {
    icon: PieChart,
    title: "Statistiques",
    description: "Analyse avancée de vos ventes et dépenses pour des décisions basées sur les données.",
    color: "bg-green-500"
  },
  {
    icon: Bell,
    title: "Notifications",
    description: "Restez informé des stocks bas, des licences expirant et des événements importants du système.",
    color: "bg-red-500"
  },
  {
    icon: Calculator,
    title: "Comptabilité",
    description: "Gérez vos entrées, sorties et balances financières avec une rigueur professionnelle.",
    color: "bg-amber-600"
  }
];

const pricing = [
  {
    name: "Starter",
    price: "10.000",
    description: "Parfait pour les petits commerces débutants.",
    features: ["1 Utilisateur", "Gestion de stock basique", "Facturation standard", "Support email"],
    highlight: false
  },
  {
    name: "Business",
    price: "20.000",
    description: "L'option préférée pour les boutiques en croissance.",
    features: ["5 Utilisateurs", "Inventaire multi-boutique", "Comptabilité avancée", "Support prioritaire 24/7"],
    highlight: true
  },
  {
    name: "Enterprise",
    price: "Sur mesure",
    description: "Solutions personnalisées pour grandes entreprises.",
    features: ["Utilisateurs illimités", "API Intégration", "Hébergement dédié", "Gestionnaire de compte"],
    highlight: false
  }
];

const testimonials = [
  {
    name: "Abdoulaye Koné",
    role: "Gérant, Supermarché Azur",
    content: "Depuis que nous utilisons Market Pro, notre gestion de stock est impeccable. Les alertes de péremption nous ont sauvé des milliers de FCFA.",
    avatar: "https://i.pravatar.cc/150?u=abdou"
  },
  {
    name: "Sarah Traoré",
    role: "Propriétaire, Boutique Élégance",
    content: "La facturation est devenue un jeu d'enfant. Mes clients adorent recevoir leurs factures directement par WhatsApp.",
    avatar: "https://i.pravatar.cc/150?u=sarah"
  }
];

export default function LandingPage() {
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<'cgu' | 'privacy'>('cgu');

  useEffect(() => {
    const fetchStore = async () => {
      try {
        const snap = await getDoc(doc(db, 'storeSettings', 'main'));
        if (snap.exists()) {
          setStoreSettings(snap.data() as StoreSettings);
        }
      } catch (e) {
        console.error("Error fetching store settings for landing:", e);
      }
    };
    fetchStore();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 lg:px-12 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 bg-gradient-to-tr from-orange-500 to-orange-400 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 transform rotate-6 group-hover:rotate-0 transition-transform overflow-hidden">
            {storeSettings?.logoUrl ? (
              <img src={storeSettings.logoUrl} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <ShoppingBag size={20} className="text-white" />
            )}
          </div>
          <span className="text-xl font-black tracking-tight text-slate-900 italic uppercase">{storeSettings?.name || 'MARKET PRO'}</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link to="/login" className="text-sm font-black uppercase tracking-widest text-slate-400 hover:text-orange-500 transition-colors">Connexion</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-24 px-6 lg:px-12 max-w-7xl mx-auto overflow-hidden">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h1 className="text-5xl lg:text-7xl font-black text-slate-900 leading-[1.1] mb-8 italic">
              Gérez votre business avec <span className="text-orange-500">précision</span> et simplicité.
            </h1>
            <p className="text-lg text-slate-500 mb-10 max-w-lg font-medium leading-relaxed">
              La plateforme tout-en-un pour les commerçants modernes. Automatisez vos ventes, suivez vos stocks et boostez votre croissance.
            </p>
            <Link 
              to="/register"
              className="inline-flex items-center gap-4 px-8 py-5 bg-orange-600 text-white rounded-[32px] font-black uppercase tracking-[0.2em] text-sm hover:bg-orange-700 transition-all shadow-2xl shadow-orange-600/30 group"
            >
              <span>Commencer Maintenant</span>
              <ArrowRight className="group-hover:translate-x-2 transition-transform" />
            </Link>
            
            <div className="mt-12 flex items-center gap-8 opacity-60 grayscale hover:grayscale-0 transition-all">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} />
                <span className="text-[10px] font-black uppercase tracking-widest">Sécurisé par Cloud Identity</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} />
                <span className="text-[10px] font-black uppercase tracking-widest">Conformité RGPD</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="relative z-10 rounded-[48px] overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] border-8 border-white">
              <img 
                src="https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&q=80&w=1200" 
                alt="Dashboard illustrative" 
                className="w-full aspect-[4/3] object-cover"
              />
            </div>
            {/* Floating UI Elements */}
            <motion.div 
              animate={{ y: [0, -20, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-8 -right-8 z-20 bg-white p-6 rounded-3xl shadow-2xl border border-gray-100 flex items-center gap-4"
            >
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center font-black">
                +24%
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest leading-none mb-1">Croissance</p>
                <p className="text-xl font-bold text-gray-900 leading-none">Ventes Mensuelles</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6 lg:px-12 max-w-7xl mx-auto mb-24 relative">
        <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-orange-500/5 blur-[100px]" />
        
        <div className="relative z-10 w-full">
          <div className="text-center mb-20">
            <h2 className="text-4xl lg:text-5xl font-black mb-6 italic text-slate-900">Fonctionnalités Clés</h2>
            <p className="text-slate-500 max-w-2xl mx-auto font-medium">Tout ce dont vous avez besoin pour piloter votre entreprise d'une main de maître en un seul endroit.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm hover:shadow-xl transition-all group"
              >
                <div className={`${feature.color} w-16 h-16 rounded-2xl flex items-center justify-center mb-8 shadow-md group-hover:scale-110 transition-transform`}>
                  <feature.icon className="text-white" size={28} />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-slate-900">{feature.title}</h3>
                <p className="text-slate-500 leading-relaxed font-sans">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 px-6 lg:px-12 max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="text-4xl lg:text-5xl font-black mb-6 italic text-slate-900">Une tarification transparente</h2>
          <p className="text-slate-500 max-w-2xl mx-auto font-medium">Choisissez le forfait qui correspond à la taille de votre ambition.</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-10">
          {pricing.map((plan, idx) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className={`p-10 rounded-[48px] border-2 transition-all ${plan.highlight ? 'bg-white border-orange-500 shadow-2xl scale-105' : 'bg-transparent border-slate-200'}`}
            >
              <div className="mb-10">
                <h3 className="text-2xl font-black text-slate-900 mb-2 italic uppercase tracking-tighter">{plan.name}</h3>
                <p className="text-slate-500 font-medium text-sm leading-relaxed">{plan.description}</p>
              </div>
              <div className="mb-10">
                <span className="text-5xl font-black text-slate-900 leading-none">{plan.price}</span>
                {plan.price !== 'Sur mesure' && <span className="text-slate-400 font-bold ml-2">FCFA / mois</span>}
              </div>
              <ul className="space-y-4 mb-10">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-3 text-slate-600 font-medium font-sans">
                    <CheckCircle2 size={18} className="text-orange-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a 
                href={`https://wa.me/22891033004?text=${encodeURIComponent(`Bonjour, je souhaite souscrire au forfait ${plan.name} de MARKET PRO.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full py-5 rounded-[24px] font-black uppercase tracking-widest text-[11px] flex items-center justify-center transition-all ${plan.highlight ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-xl shadow-orange-200' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'}`}
              >
                Commencer
              </a>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-16 px-6 lg:px-12 bg-white rounded-t-[64px] border-t border-gray-100">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-16 items-start">
            <div className="lg:w-1/3">
              <h2 className="text-4xl font-black text-slate-900 mb-6 italic leading-tight">Ils propulsent leur boutique avec <span className="text-orange-500">Market Pro</span>.</h2>
              <p className="text-slate-500 font-medium mb-10 leading-relaxed">Rejoignez plus de 500 commerçants satisfaits partout en Afrique de l'Ouest.</p>
              <div className="flex items-center gap-4">
                <div className="flex -space-x-3">
                  {[1,2,3,4].map(i => (
                    <img key={i} src={`https://i.pravatar.cc/150?u=${i}`} className="w-10 h-10 rounded-full border-2 border-white" alt="" />
                  ))}
                </div>
                <div className="flex flex-col">
                  <div className="flex text-orange-500">
                    {[1,2,3,4,5].map(i => <Star key={i} size={14} fill="currentColor" />)}
                  </div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">4.9/5 satisfaction</span>
                </div>
              </div>
            </div>

            <div className="lg:w-2/3 grid md:grid-cols-2 gap-8">
              {testimonials.map((t, idx) => (
                <motion.div
                  key={t.name}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.2 }}
                  className="bg-slate-50 p-10 rounded-[40px] relative group hover:bg-white hover:shadow-xl transition-all"
                >
                  <Quote className="absolute top-10 right-10 text-slate-200 group-hover:text-orange-100 transition-colors" size={40} />
                  <p className="text-lg text-slate-600 font-medium leading-relaxed italic mb-8 relative z-10">"{t.content}"</p>
                  <div className="flex items-center gap-4">
                    <img src={t.avatar} className="w-14 h-14 rounded-2xl object-cover shadow-lg" alt="" />
                    <div>
                      <p className="font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">{t.name}</p>
                      <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">{t.role}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="mt-12 pt-12 border-t border-gray-100 flex flex-wrap items-center justify-center gap-12 lg:gap-24 opacity-30 grayscale pointer-events-none">
             <div className="text-3xl font-black tracking-tighter text-slate-900 border-2 border-slate-900 px-4 py-1">GLOBEX</div>
             <div className="text-3xl font-bold tracking-widest text-slate-900 italic font-serif">Avenue Corp</div>
             <div className="text-3xl font-black tracking-tight text-slate-900 bg-slate-900 text-white px-6 py-1 italic">Vortex</div>
             <div className="text-3xl font-bold tracking-tight text-slate-900 uppercase">Astra Labs</div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white text-slate-900 py-12 px-6 lg:px-12 border-t border-gray-100">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-tr from-orange-500 to-orange-400 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 transform rotate-6 overflow-hidden">
                {storeSettings?.logoUrl ? (
                  <img src={storeSettings.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <ShoppingBag size={20} className="text-white" />
                )}
              </div>
              <span className="text-xl font-black tracking-tight italic uppercase text-slate-900">{storeSettings?.name || 'MARKET PRO'}</span>
            </div>
            <p className="text-slate-500 text-sm max-w-xs font-sans">Propulsé par G-LAB TECH. Solutions logicielles intelligentes pour l'Afrique de demain.</p>
          </div>
          
          <div className="flex gap-12">
            <div className="flex flex-col gap-3">
               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Produit</span>
               <a href="#" className="text-sm font-bold text-slate-700 hover:text-orange-500 transition-colors">Tarifs</a>
               <a href="#" className="text-sm font-bold text-slate-700 hover:text-orange-500 transition-colors">Support</a>
            </div>
            <div className="flex flex-col gap-3">
               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Légal</span>
               <button onClick={() => { setLegalTab('privacy'); setIsLegalOpen(true); }} className="text-sm font-bold text-slate-700 hover:text-orange-500 transition-colors text-left">Confidentialité</button>
               <button onClick={() => { setLegalTab('cgu'); setIsLegalOpen(true); }} className="text-sm font-bold text-slate-700 hover:text-orange-500 transition-colors text-left">CGV</button>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-10 pt-4 border-t border-gray-100 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">© 2026 G-LAB TECH • TOUS DROITS RÉSERVÉS</p>
        </div>
      </footer>

      <LegalDocsModal 
        isOpen={isLegalOpen} 
        onClose={() => setIsLegalOpen(false)} 
        defaultTab={legalTab} 
      />
    </div>
  );
}
