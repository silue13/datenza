"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Compass,
  X,
  Home,
  BarChart3,
  Sparkles,
  Layers,
  Settings,
  Laptop,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

interface ModuleGuide {
  id: string;
  nomMenu: string;
  route: string;
  badge: string;
  titre: string;
  finaliteMetier: string;
  icone: any;
  protocole: {
    etape: string;
    description: string;
  }[];
  standardsEtRegles: string[];
  livrables: string[];
  arbitrageDirection: string;
}

const REFERENTIEL_DATENZA: ModuleGuide[] = [
  {
    id: "accueil",
    nomMenu: "Accueil",
    route: "/",
    badge: "Phase 1 · Cadrage & Ingestion",
    titre: "Cadrage & Ingestion des Données",
    finaliteMetier:
      "Normaliser les fichiers bruts (XLSX, CSV), purger les artefacts de calcul et fixer formellement le champ d'audit avant tout traitement analytique.",
    icone: Home,
    protocole: [
      {
        etape: "Dépôt des sources",
        description: "Glisser-déposer un classeur unique ou plusieurs versions comparatives dans l'espace de transit.",
      },
      {
        etape: "Contrôle d'intégrité",
        description: "Contrôler le taux de complétude, l'absence d'erreurs d'encodage et le volume de lignes exploitables.",
      },
      {
        etape: "Sélection des dimensions",
        description: "Cocher les variables stratégiques en écartant les champs techniques non discriminants.",
      },
      {
        etape: "Validation du périmètre",
        description: "Enclencher le moteur décisionnel vers le module d'analyse multidimensionnelle.",
      },
    ],
    standardsEtRegles: [
      "Purge automatique du BOM UTF-8 et détection des séparateurs (; , \\t).",
      "Élimination stricte des lignes de totaux partiels pour ne pas fausser les moyennes.",
      "Vérification de l'unicité des enregistrements et marquage des doublons.",
    ],
    livrables: [
      "Table de données normalisée en mémoire sécurisée",
      "Aperçu matriciel avec colonne pivot figée (Sticky)",
      "Bilan de santé du classeur (% complétude et volumétrie)",
    ],
    arbitrageDirection:
      "Ne conservez que les variables directement reliées à vos objectifs d'arbitrage. Un jeu épuré dès l'ingestion garantit des visualisations immédiatement lisibles.",
  },
  {
    id: "analyse",
    nomMenu: "Analyse",
    route: "/analyse",
    badge: "Phase 2 · Diagnostic & Visualisation",
    titre: "Exploration & Restitution Exécutive",
    finaliteMetier:
      "Profiler les indicateurs univariés et bivariés, cartographier les concentrations territoriales et produire les supports de présentation pour les instances dirigeantes.",
    icone: BarChart3,
    protocole: [
      {
        etape: "Audit de volumétrie",
        description: "Prendre connaissance des 4 cartouches de tête (lignes, champs, complétude, séries).",
      },
      {
        etape: "Analyse des corrélations",
        description: "Vérifier la matrice d'interactions de Pearson (r) pour distinguer synergie réelle et indépendance.",
      },
      {
        etape: "Distribution spatiale",
        description: "Observer les disparités sur la carte interactive calibrée sur le découpage territorial ivoirien.",
      },
      {
        etape: "Matrice de croisement (TCD)",
        description: "Confronter deux dimensions clés avec calcul automatique des écarts nets et des ratios.",
      },
    ],
    standardsEtRegles: [
      "Règle de rigueur statistique : tout coefficient |r| < 0.40 est classé en indépendance sans lien de cause à effet.",
      "Nettoyage sémantique systématique : conversion des identifiants système en formulations managériales.",
      "Garde-fou de diversité : exclusion des regroupements sans variance pour éviter les écarts nuls.",
    ],
    livrables: [
      "Deck PowerPoint (.pptx) au format 16:9 normé Cobalt Executive",
      "Classeur d'audit Excel (.xlsx) avec feuilles d'indicateurs structurées",
      "Synthèse managériale prête pour diffusion en comité",
    ],
    arbitrageDirection:
      "Privilégiez les dimensions affichant entre 2 et 15 modalités (ex. Départements plutôt que Région unique) afin de révéler de véritables contrastes opérationnels.",
  },
  {
    id: "ia",
    nomMenu: "Assistant IA",
    route: "/ia",
    badge: "Phase 3 · Copilote Décisionnel",
    titre: "Requêtage Naturel & Synthèse",
    finaliteMetier:
      "Interroger la donnée consolidée par questions ouvertes pour obtenir des notes de synthèse formulées sous l'angle de la prise de décision managériale.",
    icone: Sparkles,
    protocole: [
      {
        etape: "Formulation du besoin",
        description: "Poser une question ciblée relative à la performance, aux disparités ou aux priorités d'action.",
      },
      {
        etape: "Traitement contextuel",
        description: "L'IA inspecte les statistiques descriptives du fichier actif sans transfert de données externes.",
      },
      {
        etape: "Restitution d'arbitrage",
        description: "Obtenir une note articulée en trois axes : levier moteur, point de vigilance, recommandation.",
      },
    ],
    standardsEtRegles: [
      "Zéro hallucination statistique : les chiffres cités sont strictement ancrés dans les calculs de l'application.",
      "Style exécutif direct : suppression des formules de politesse et des généralités creuses.",
      "Confidentialité préservée : les requêtes utilisent uniquement les métadonnées nécessaires à la formulation.",
    ],
    livrables: [
      "Paragraphes argumentaires exploitables en note de synthèse",
      "Éclairages croisés pour préparer les arbitrages budgétaires",
      "Identification des signaux faibles et anomalies de tendance",
    ],
    arbitrageDirection:
      "Servez-vous de l'Assistant IA pour vérifier vos hypothèses avant de finaliser un rapport : demandez-lui d'identifier le principal paradoxe du jeu de données.",
  },
  {
    id: "fusion",
    nomMenu: "Fusion",
    route: "/fusion",
    badge: "Phase 4 · Consolidation Multi-Bases",
    titre: "Rapprochement & Analyse Comparative",
    finaliteMetier:
      "Harmoniser plusieurs fichiers d'origines ou de millésimes distincts (ex. RGPH 2014 vs 2021) pour quantifier l'évolution des indicateurs par rapport à un étalon.",
    icone: Layers,
    protocole: [
      {
        etape: "Sélection des référentiels",
        description: "Importer les différentes bases devant faire l'objet du rapprochement comparatif.",
      },
      {
        etape: "Définition de l'étalon",
        description: "Désigner expressément le fichier servant de référence pivot pour le calcul des variations.",
      },
      {
        etape: "Cartographie des clés",
        description: "Valider la table de concordance des champs dimensionnels communs.",
      },
      {
        etape: "Export de consolidation",
        description: "Générer la base fusionnée taguée avec l'origine de chaque enregistrement.",
      },
    ],
    standardsEtRegles: [
      "Rapprochement insensible aux variations de casse ou d'accents sur les dénominations géographiques.",
      "Calcul des deltas (Δ = Cible - Réf) et des variations relatives systématiquement documentés.",
      "Conservation de la traçabilité intégrale de la source sur chaque ligne consolidée.",
    ],
    livrables: [
      "Matrice comparative multi-sources consolidée",
      "Tableau de bord de variance avec classement des progressions et reculs",
      "Fichier consolidé réinjectable directement dans le moteur d'analyse",
    ],
    arbitrageDirection:
      "Assurez-vous que l'étalon choisi corresponde bien à la situation de base la plus stable afin de garantir la pertinence des deltas calculés.",
  },
  {
    id: "parametres",
    nomMenu: "Paramètres",
    route: "/parametres",
    badge: "Gouvernance · Souveraineté & Clés",
    titre: "Gouvernance & Configuration",
    finaliteMetier:
      "Administrer les connexions d'intelligence artificielle, contrôler la politique de rétention en mémoire et paramétrer l'environnement d'exécution selon vos exigences de conformité.",
    icone: Settings,
    protocole: [
      {
        etape: "Choix du modèle",
        description: "Sélectionner le moteur de langage adapté (modèles souverains, cloud sécurisé ou instance locale).",
      },
      {
        etape: "Sécurisation des accès",
        description: "Renseigner vos clés API privées, conservées strictement dans le stockage local du navigateur.",
      },
      {
        etape: "Ergonomie de travail",
        description: "Ajuster le thème (mode sombre institutionnel ou mode clair haute lisibilité).",
      },
      {
        etape: "Purge de conformité",
        description: "Activer la réinitialisation complète des états pour ne laisser aucune empreinte de travail.",
      },
    ],
    standardsEtRegles: [
      "Architecture Zero Data Retention (ZDR) : vos fichiers ne sont jamais stockés sur un serveur distant.",
      "Traitement in-browser : l'ensemble des parsing et des calculs s'opère dans la mémoire vive de votre machine.",
      "Chiffrement local des jetons d'accès dans le LocalStorage sans transmission tierce.",
    ],
    livrables: [
      "Environnement d'audit conforme aux politiques internes de sécurité des données",
      "Journal d'état des connexions et des moteurs actifs",
      "Répertoire de préférences utilisateur personnalisé",
    ],
    arbitrageDirection:
      "Pour des données hautement sensibles, vous pouvez utiliser l'ensemble des modules d'analyse et de cartographie sans renseigner de clé API : l'autonomie analytique est totale.",
  },
  {
    id: "desktop",
    nomMenu: "Windows",
    route: "/",
    badge: "Infrastructure · Poste Isolé",
    titre: "Client Windows Natif & Hors-Ligne",
    finaliteMetier:
      "Déployer DATENZA sur station de travail dédiée pour traiter des jeux de données volumineux sans aucune dépendance à une liaison Internet, dans des conditions d'isolation étanche.",
    icone: Laptop,
    protocole: [
      {
        etape: "Téléchargement du package",
        description: "Cliquer sur le lien d'installation Windows situé au bas du panneau de navigation latéral.",
      },
      {
        etape: "Déploiement local",
        description: "Exécuter l'application autonome sur votre poste de travail sans configuration réseau complexe.",
      },
      {
        etape: "Exploitation hors-réseau",
        description: "Auditer des fichiers Excel de grande taille avec une réactivité machine native.",
      },
    ],
    standardsEtRegles: [
      "Isolation complète du trafic sortant pour les environnements bancaires ou institutionnels fermés.",
      "Allocation mémoire étendue contournant les plafonds imposés par les navigateurs web classiques.",
      "Compatibilité totale avec les formats Microsoft Office installés sur le poste.",
    ],
    livrables: [
      "Exécutable autonome certifié pour environnement Windows",
      "Capacité de traitement continue en situation de mobilité ou de coupure réseau",
      "Intégration directe aux dossiers locaux et répertoires réseau d'entreprise",
    ],
    arbitrageDirection:
      "Recommandé pour les audits de conformité ou les données RH/financières confidentielles ne devant sous aucun prétexte circuler sur un réseau externe.",
  },
];

export default function GuideUtilisation() {
  const [ouvert, setOuvert] = useState(false);
  const [indexActif, setIndexActif] = useState(0);
  const router = useRouter();
  
  // Référence pour la zone défilante des onglets
  const ongletsConteneurRef = useRef<HTMLDivElement>(null);
  const zoneContenuRef = useRef<HTMLDivElement>(null);

  const moduleActuel = REFERENTIEL_DATENZA[indexActif];

  // Effet pour faire défiler automatiquement la barre d'onglets
  useEffect(() => {
    if (ongletsConteneurRef.current && ouvert) {
      const boutonActif = ongletsConteneurRef.current.querySelector(`[data-index="${indexActif}"]`);
      if (boutonActif) {
        boutonActif.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center", // Centre l'onglet actif dans la vue
        });
      }
    }
    
    // Remonter le contenu en haut à chaque changement d'onglet
    if (zoneContenuRef.current && ouvert) {
      zoneContenuRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [indexActif, ouvert]);

  const naviguerVersInterface = (route: string) => {
    setOuvert(false);
    router.push(route);
  };

  return (
    <>
      {/* BOUTON DÉCLENCHEUR NAVBAR / HEADER */}
      <button
        onClick={() => setOuvert(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white text-[11px] sm:text-xs font-bold transition shadow-xs cursor-pointer select-none border border-slate-700/50 dark:border-slate-300"
      >
        <Compass className="w-3.5 h-3.5 text-blue-400 dark:text-blue-600" />
        <span className="hidden sm:inline">Référentiel Méthodologique</span>
        <span className="sm:inline font-bold">Guide</span>
      </button>

      {/* DIALOGUE MODAL */}
      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 w-full h-[96vh] sm:h-auto sm:max-h-[92vh] sm:max-w-4xl flex flex-col rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            
            {/* 1. EN-TÊTE FIXE COMPACT */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 shrink-0">
              <div className="flex items-center gap-2.5 truncate">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white dark:bg-blue-600 flex items-center justify-center shrink-0">
                  <Compass className="w-4 h-4 text-blue-400 dark:text-white" />
                </div>
                <div className="truncate">
                  <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate tracking-tight">
                    DATENZA · Guide d&apos;Arbitrage
                  </h2>
                  <p className="text-[10px] text-slate-400 truncate">
                    {indexActif + 1}/6 : {moduleActuel.nomMenu}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setOuvert(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 2. SÉLECTEUR D'ONGLETS HORIZONTAL (TOUCH-SCROLLABLE & AUTO-SCROLL) */}
            <div 
              ref={ongletsConteneurRef}
              className="flex items-center gap-1.5 px-3 sm:px-6 py-2 bg-slate-100/70 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-none snap-x shrink-0 transition-transform scroll-smooth"
            >
              {REFERENTIEL_DATENZA.map((mod, i) => {
                const Icone = mod.icone;
                const estActif = i === indexActif;
                return (
                  <button
                    key={mod.id}
                    data-index={i}
                    onClick={() => setIndexActif(i)}
                    className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer shrink-0 snap-center ${
                      estActif
                        ? "bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs border border-slate-200 dark:border-slate-700"
                        : "text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/70"
                    }`}
                  >
                    <Icone className={`w-3.5 h-3.5 ${estActif ? "text-blue-600 dark:text-blue-400" : "text-slate-400"}`} />
                    <span>{mod.nomMenu}</span>
                  </button>
                );
              })}
            </div>

            {/* 3. CONTENU DÉFILABLE DU MODULE */}
            <div ref={zoneContenuRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 scrollbar-thin">
              
              {/* Titre & Finalité Métier */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    {moduleActuel.badge}
                  </span>
                  <button
                    onClick={() => naviguerVersInterface(moduleActuel.route)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <span>Ouvrir</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug">
                  {moduleActuel.titre}
                </h3>
                
                <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-0.5">
                  {moduleActuel.finaliteMetier}
                </p>
              </div>

              {/* PROTOCOLE OPÉRATOIRE SOUS FORME DE TIMELINE VERTICALE */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Procédure Opérationnelle :
                </span>

                <div className="space-y-2 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
                  {moduleActuel.protocole.map((p, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 relative pl-1">
                      <span className="w-5 h-5 rounded-md bg-blue-600 text-white font-mono font-bold text-[10px] flex items-center justify-center shrink-0 z-10">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-[11px] sm:text-xs text-slate-900 dark:text-slate-100">
                          {p.etape}
                        </p>
                        <p className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                          {p.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* RÈGLES DE CONTRÔLE & RESTITUTIONS (GRILLE 2 COLONNES MÊME SUR SMARTPHONE) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                
                {/* Règles & Contrôles */}
                <div className="p-3 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Garanties &amp; Conformité
                  </span>
                  <ul className="space-y-1.5 text-[10px] sm:text-[11px] text-slate-700 dark:text-slate-300">
                    {moduleActuel.standardsEtRegles.map((regle, i) => (
                      <li key={i} className="flex items-start gap-1.5 leading-snug">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <span>{regle}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Restitutions associées */}
                <div className="p-3 sm:p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 block">
                    Livrables Décisionnels
                  </span>
                  <ul className="space-y-1.5 text-[10px] sm:text-[11px] text-slate-300">
                    {moduleActuel.livrables.map((livrable, i) => (
                      <li key={i} className="flex items-start gap-1.5 leading-snug">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 mt-1.5"></span>
                        <span>{livrable}</span>
                      </li>
                    ))}
                  </ul>
                </div>

              </div>

              {/* RECOMMANDATION DE GOUVERNANCE / DIRECTION */}
              <div className="p-3 sm:p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-900/50 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="font-bold text-blue-950 dark:text-blue-200 block text-[10px] uppercase tracking-wide">
                    Arbitrage de Direction
                  </span>
                  <p className="text-[10px] sm:text-[11px] text-blue-900 dark:text-blue-200/90 leading-snug mt-0.5">
                    {moduleActuel.arbitrageDirection}
                  </p>
                </div>
              </div>

            </div>

            {/* 4. PIED FIXE FLUIDE POUR LE POUCE (STICKY BOTTOM BAR) */}
            <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/80 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                disabled={indexActif === 0}
                onClick={() => setIndexActif((i) => i - 1)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Préc.</span>
              </button>

              {/* Indicateur de position compact */}
              <div className="flex items-center gap-1">
                {REFERENTIEL_DATENZA.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIndexActif(i)}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      i === indexActif ? "w-4 bg-blue-600" : "w-1.5 bg-slate-300 dark:bg-slate-700"
                    }`}
                    title={`Module ${i + 1}`}
                  />
                ))}
              </div>

              {indexActif < REFERENTIEL_DATENZA.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setIndexActif((i) => i + 1)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <span>Suivant</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setOuvert(false)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Terminé</span>
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </>
  );
}