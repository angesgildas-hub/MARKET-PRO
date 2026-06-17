import { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Scale, 
  ShieldCheck, 
  Download, 
  Copy, 
  Printer, 
  Check, 
  ExternalLink,
  ChevronRight,
  Bookmark,
  Building,
  Lock,
  Briefcase
} from 'lucide-react';

interface LegalDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'cgu' | 'privacy';
}

interface LegalSection {
  id: string;
  article?: string;
  title: string;
  content: string;
  tags: string[];
}

export default function LegalDocsModal({ isOpen, onClose, defaultTab = 'cgu' }: LegalDocsModalProps) {
  const [activeTab, setActiveTab] = useState<'cgu' | 'privacy'>(defaultTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // Togo Legal Content CGU
  const cguSections: LegalSection[] = useMemo(() => [
    {
      id: 'cgu-preambule',
      title: 'Préambule / Cadre Légal Autoritif',
      content: 'Les présentes Conditions Générales d\'Utilisation (CGU) régissent l\'accès et l\'utilisation du progiciel de facturation et Point de Vente MARKET PRO, développé par G-LAB TECH. L\'accès et l\'utilisation du service sont régis par les lois et règlements applicables en République Togolaise, notamment la Loi N° 2017-007 du 22 juin 2017 relative aux transactions électroniques au Togo et la Loi N° 2019-014 relative à la protection des données à caractère personnel.',
      tags: ['loi', 'togo', 'g-lab tech', 'introduction', 'préambule', 'cgu']
    },
    {
      id: 'cgu-definition',
      title: '1. Définitions & Objet',
      content: '« Client » désigne toute boutique, supermarché ou gérant titulaire d\'un compte MARKET PRO. « Utilisateur » correspond à tout membre du personnel nommé par le gérant (caissiers, comptables, gérants de stock). MARKET PRO est une solution SaaS permettant le calcul rapide des ventes, la gestion de stocks en temps réel et la facturation sécurisée.',
      tags: ['définitions', 'produit', 'saas', 'commerce', 'objet']
    },
    {
      id: 'cgu-inscription',
      title: '2. Inscription, Compte et Sécurité',
      content: 'Aux termes de la réglementation togolaise sur les services e-commerce, toute création de compte nécessite la fourniture d\'informations exactes (nom d\'entreprise, adresse physique au Togo, coordonnées téléphoniques TMoney/Moov Money). Vous êtes responsable de la confidentialité absolue de vos identifiants Firebase. Tout accès suspect doit être notifié immédiatement à l\'adresse de support.',
      tags: ['sécurité', 'compte', 'email', 'mot de passe', 'boutique', 'togo']
    },
    {
      id: 'cgu-paiement',
      title: '3. Modes de Règlement et Mobile Money',
      content: 'MARKET PRO intègre des modules de paiement locaux (TMoney du groupe TOGOCOM et Moov Money de MOOV AFRICA TOCO). Les transactions réalisées sont soumises aux termes et frais d\'interconnexion agrégés conformément aux directives de l\'ARCEP Togo (Autorité de Régulation des Communications Électroniques et des Postes).',
      tags: ['tmoney', 'moov', 'mobile money', 'paiement', 'arcep', 'tarifs', 'togo']
    },
    {
      id: 'cgu-responsabilite',
      title: '4. Obligations et Limites de Responsabilité',
      content: 'Le Client est seul responsable de l\'exactitude de ses inventaires, des taux de taxes appliqués et de la validité de ses déclarations fiscales auprès de l\'Office Togolais des Recettes (OTR). G-LAB TECH décline toute responsabilité pour les pertes d\'exploitation découlant de pannes de réseaux de télécommunication tiers ou de cas de force majeure.',
      tags: ['responsabilité', 'otr', 'fiscalité', 'impôts', 'limites', 'force majeure']
    },
    {
      id: 'cgu-intellectuelle',
      title: '5. Propriété Intellectuelle',
      content: 'Tous les éléments composant l\'interface de MARKET PRO (logos, codes sources, icônes, configurations CSS, chartes graphiques) sont la propriété exclusive de G-LAB TECH, sous la protection de l\'Accord de Bangui (OAPI - Organisation Africaine de la Propriété Intellectuelle). Toute copie, décompilation ou revente sans accord écrit est strictement passible de poursuites pénales.',
      tags: ['propriété intellectuelle', 'g-tech', 'oapi', 'droits', 'copie']
    },
    {
      id: 'cgu-juridiction',
      title: '6. Loi Applicable et Résolution des Litiges',
      content: 'Les présentes CGU sont régies, interprétées et appliquées conformément aux lois de la République Togolaise. Tout litige relatif à leur interprétation, leur validité ou leur exécution, qui ne peut être réglé à l\'amiable, sera soumis à la compétence exclusive des Tribunaux de Grande Instance de Lomé (Togo).',
      tags: ['loi', 'juridiction', 'lomé', 'justice', 'togo', 'litige']
    }
  ], []);

  // Togo Legal Content Privacy Policy
  const privacySections: LegalSection[] = useMemo(() => [
    {
      id: 'priv-loi',
      article: 'Article 1',
      title: 'Cadre Réglementaire Togolais (Loi LPDCP)',
      content: 'Nous prenons le respect de la vie privée très au sérieux. Les traitements de données à caractère personnel relatifs à MARKET PRO sont édifiés en conformité avec la Loi N° 2019-014 du 29 octobre 2019 relative à la protection des données à caractère personnel (LPDCP) en République Togolaise. Ces traitements sont initiés sous la supervision de l\'Instance de Protection des Données à Caractère Personnel (IPDCP) du Togo.',
      tags: ['loi', 'ipdcp', 'togo', 'règlement', 'protection']
    },
    {
      id: 'priv-collecte',
      article: 'Article 2',
      title: 'Données Collectées et Consentement',
      content: 'Pour le fonctionnement de l\'application, nous collectons de manière transparente : les informations nominatives du gérant (nom, e-mail), le numéro de téléphone pour l\'authentification ou le Mobile Money, les données d\'inventaire, l\'identité des employés locaux (caissiers) avec leurs rôles applicatifs, et les reçus de vente. Aucune donnée n\'est collectée à l\'insu de l\'utilisateur.',
      tags: ['données', 'consentement', 'inventaire', 'téléphone', 'caissier']
    },
    {
      id: 'priv-finalite',
      article: 'Article 3',
      title: 'Finalités des Traitements',
      content: 'Les données enregistrées servent exclusivement à : l\'exécution des transactions de vente au comptoir, la tenue des journaux de caisse, l\'édition instantanée de factures ou reçus PDF, l\'analyse des bénéfices pour le gérant de la boutique, de même qu\'à la prévention des écarts de caisse et des fraudes internes.',
      tags: ['finalité', 'but', 'factures', 'pdf', 'journal', 'bénéfices']
    },
    {
      id: 'priv-conservation',
      article: 'Article 4',
      title: 'Durée de Conservation et Hébergement Sécurisé',
      content: 'Les données d\'inventaire et d\'historique des ventes sont conservées pendant toute la durée active d\'exercice du supermarché ou de l\'abonnement. Les bases de données sont sécurisées par l\'infrastructure Firebase Cloud (avec règles de sécurité renforcées par rôle d\'accès). En cas de résiliation définitive du compte, toutes les données associées sont purgées de nos serveurs actifs dans un délai de 30 jours.',
      tags: ['conservation', 'durée', 'calculs', 'firebase', 'sécurité']
    },
    {
      id: 'priv-droits',
      article: 'Article 5',
      title: 'Vos Droits (Accès, Rectification, Opposition)',
      content: 'Conformément aux dispositions de la Loi LPDCP, vous disposez d\'un droit d\'accès permanent, de rectification, de suppression et d\'opposition concernant vos données à caractère personnel. Pour exercer ces droits, vous pouvez modifier votre profil directement dans l\'onglet des paramètres de l\'application ou faire parvenir votre demande par courrier électronique à l\'adresse de l\'éditeur d\'application (gildas@gmail.com ou anges.gildas@gmail.com).',
      tags: ['droits', 'accès', 'rectification', 'suppression', 'contact', 'togo']
    },
    {
      id: 'priv-divulgation',
      article: 'Article 6',
      title: 'Non-Divulgation et Tiers autorisés',
      content: 'Nous nous interdisons formellement de vendre, louer ou divulguer vos données commerciales ou listes de clients à des fins publicitaires tierces. Les données financières ne peuvent être communiquées que sur réquisition judiciaire légitime ou pour la mise en œuvre de transactions bancaires légitimes.',
      tags: ['confidentialité', 'partage', 'tiers', 'banque', 'justice']
    }
  ], []);

  // Filter sections by search text
  const currentSections = activeTab === 'cgu' ? cguSections : privacySections;
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return currentSections;
    const q = searchQuery.toLowerCase();
    return currentSections.filter(sec => 
      sec.title.toLowerCase().includes(q) || 
      sec.content.toLowerCase().includes(q) ||
      sec.tags.some(t => t.includes(q))
    );
  }, [currentSections, searchQuery]);

  // Copy textual legal terms to clipboard
  const handleCopyToClipboard = async () => {
    let text = `=== MARKET PRO - ${activeTab === 'cgu' ? 'Conditions Générales d\'Utilisation (Togo)' : 'Politique de Confidentialité (Togo)'} ===\n\n`;
    text += `Généré en conformité avec les régulations de la République Togolaise.\n`;
    text += `Dernière mise à jour : Juin 2026\n\n`;
    
    currentSections.forEach(sec => {
      text += `${sec.article ? sec.article + ' - ' : ''}${sec.title}\n`;
      text += `${sec.content}\n\n`;
    });

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  // Modern Print layout
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/85 backdrop-blur-sm animate-fade-in print:bg-white print:p-0 print:absolute">
      <div className="relative bg-white w-full max-w-4xl rounded-[32px] shadow-2xl border border-gray-100 flex flex-col h-[90vh] print:h-auto print:border-none print:shadow-none print:rounded-none overflow-hidden">
        
        {/* Header Block */}
        <div className="p-6 sm:p-8 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between shrink-0 print:text-black print:bg-none print:p-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-2xl border border-white/15 text-orange-400 shrink-0 print:hidden">
              {activeTab === 'cgu' ? <Scale size={24} /> : <ShieldCheck size={24} />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded-full border border-orange-500/20 print:hidden">
                  Cadre Légal du Togo
                </span>
                <span className="text-[10.5px] font-mono text-slate-400 print:text-black">
                  Loi N° 2019-014 (LPDCP) & N° 2017-007 (LTE)
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black italic tracking-tight uppercase mt-1 print:text-black">
                {activeTab === 'cgu' ? 'Conditions Générales d\'Utilisation' : 'Politique de Confidentialité'}
              </h2>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-colors print:hidden"
            title="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Selection, Actions & Search Bar */}
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-gray-100 flex flex-col md:flex-row gap-4 items-center justify-between shrink-0 print:hidden">
          
          {/* Dual Toggle Tabs */}
          <div className="flex bg-slate-200/60 p-1.5 rounded-2xl w-full md:w-auto">
            <button
              onClick={() => { setActiveTab('cgu'); setSearchQuery(''); }}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                activeTab === 'cgu' 
                  ? 'bg-white text-slate-900 shadow-md translate-y-0' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Briefcase size={13} />
              <span>CGU (Conditions)</span>
            </button>
            <button
              onClick={() => { setActiveTab('privacy'); setSearchQuery(''); }}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                activeTab === 'privacy' 
                  ? 'bg-white text-slate-900 shadow-md translate-y-0' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Lock size={13} />
              <span>Confidentialité</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:max-w-xs group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-orange-500 transition-colors" size={15} />
            <input 
              type="text"
              placeholder="Rechercher par mot-clé..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          {/* Utility Tools */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={handleCopyToClipboard}
              className={`p-2 rounded-xl border flex items-center justify-center gap-1.5 min-w-[90px] text-xs font-bold transition-all ${
                copied 
                  ? 'bg-green-50 border-green-200 text-green-600' 
                  : 'bg-white border-gray-200 text-slate-600 hover:bg-slate-50'
              }`}
              title="Copier le texte complet"
            >
              {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              <span>{copied ? 'Copié !' : 'Copier'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="p-2 bg-white border border-gray-200 text-slate-600 hover:bg-slate-100 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all"
              title="Imprimer ou enregistrer en PDF"
            >
              <Printer size={14} />
              <span>Imprimer</span>
            </button>
          </div>

        </div>

        {/* Scrollable Contents Pane */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 bg-white font-sans text-slate-700 select-text leading-relaxed print:overflow-visible print:p-0">
          
          {/* Regulatory Information Banner */}
          <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex gap-3.5 text-xs text-orange-950 items-start print:hidden">
            <Building className="text-orange-600 shrink-0 mt-0.5" size={18} />
            <div>
              <p className="font-extrabold uppercase tracking-wide text-orange-800">Note relative à la Souveraineté Juridique</p>
              <p className="font-medium text-amber-900 mt-1">
                La présente documentation constitue l'affirmation légale des engagements de la plateforme vis-à-vis de l'<strong>Instance de Protection des Données à Caractère Personnel (IPDCP)</strong> et de l'<strong>ARCEP de la République Togolaise</strong>. Elle encadre la responsabilité civile et pénale de l'utilisateur sous la compétence exclusive du tribunal de Lomé.
              </p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <Search size={28} className="text-slate-300" />
              <p className="text-sm font-bold">Aucun terme ou article ne correspond à "{searchQuery}"</p>
              <button 
                onClick={() => setSearchQuery('')}
                className="text-xs text-orange-500 font-extrabold hover:underline"
              >
                Effacer la recherche
              </button>
            </div>
          ) : (
            <div className="space-y-6 max-w-3xl mx-auto divide-y divide-gray-100/80">
              {filtered.map((sec, i) => (
                <div 
                  key={sec.id} 
                  className={`pt-5 first:pt-0 ${
                    searchQuery ? 'bg-orange-50/20 p-4 rounded-2xl border border-orange-100/50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-2.5">
                    {sec.article ? (
                      <span className="font-mono text-[10px] font-black uppercase text-orange-500 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                        {sec.article}
                      </span>
                    ) : (
                      <span className="p-1 bg-slate-100 rounded text-slate-400">
                        <Bookmark size={11} />
                      </span>
                    )}
                    <h3 className="text-md font-extrabold text-slate-900 tracking-tight">
                      {sec.title}
                    </h3>
                  </div>
                  <p className="text-sm text-slate-600 font-normal leading-relaxed text-justify">
                    {sec.content}
                  </p>
                  
                  {/* Semantic Tags Footer */}
                  <div className="flex flex-wrap gap-1.5 mt-3 print:hidden">
                    {sec.tags.map((tag) => (
                      <span 
                        key={tag}
                        onClick={() => setSearchQuery(tag)} 
                        className="text-[9px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full cursor-pointer hover:bg-slate-200 transition-colors"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Togolese Sign-off */}
          <div className="pt-8 border-t border-gray-100 mt-12 text-center text-slate-400 max-w-lg mx-auto space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Instance de Signature Administrative</p>
            <p className="text-[10px] font-sans leading-relaxed">
              Fait à Lomé (Togo), pour le compte de MARKET PRO par G-LAB TECH.<br />
              Dernière révision légale : 07 Juin 2026.<br />
              Conforme à l'ordonnance sur la cybercriminalité et au décret d'application N°2019-014.
            </p>
            <div className="w-16 h-1 w-2/5 bg-slate-200 rounded mx-auto mt-4" />
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-5 bg-slate-50 border-t border-gray-100 flex items-center justify-between shrink-0 print:hidden">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider hidden sm:block">
            En naviguant, vous acceptez le cadre IPDCP
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all w-full sm:w-auto shadow-md"
          >
            J'ai compris / Fermer
          </button>
        </div>

      </div>
    </div>
  );
}
