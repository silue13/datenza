"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bar, Line, Pie, Doughnut, Scatter } from "react-chartjs-2";
import type { ActiveElement, ChartData, ChartDataset, ChartEvent, ChartOptions, TooltipItem } from "chart.js";
import type { Context as ContexteEtiquette } from "chartjs-plugin-datalabels";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  Plus,
  Trash2,
  Scale,
  Presentation,
  Loader2,
  RefreshCw,
  BarChart3,
  FileText,
} from "lucide-react";
import BoutonImage from "./BoutonImage";
import BlocInterpretation from "./BlocInterpretation";
import { interpreterGraphique } from "../../lib/analyse/interpretation";
import CarteGeographique from "./CarteGeographique";
import "./chartSetup";
import {
  estValeurVide,
  parseNombre,
  estColonneIdentifiant,
  estColonneTemporelle,
  type Cellule,
} from "../../lib/analyse/utils";
import {
  calculerSerie,
  calculerSeriesVentilees,
  recommanderGraphiques,
  expliquerGraphique,
  nomLisible,
  filtrePourPoint,
  alignerSeries,
  formaterCompact,
  formaterComplet,
  libellePeriode,
  type AgregationGraphique,
} from "../../lib/analyse/graphique";
import {
  calculerNuage,
  expliquerNuage,
  calculerHistogramme,
  expliquerHistogramme,
  calculerCombine,
  expliquerCombine,
} from "../../lib/analyse/graphiquesAvances";
import { interpreterCorrelation } from "../../lib/analyse/stats";
import { CalculateurMesures, estAdditive, formaterMesure, valeurAffichee, type DefinitionMesure } from "../../lib/analyse/formules";
import { operationPour, estPseudoMesure } from "../../lib/analyse/mesures";
import type { ConditionFiltre } from "../../lib/analyse/filtres";
import { useData, type GraphiqueEpingle, type TypeGraphique } from "../context/DataContext";
import { lireFournisseur } from "../../lib/prefs";
import { appelerIA } from "../../lib/ia/appelIA";

type Agregation = AgregationGraphique;

const LIBELLES_AGREGATION: Record<Agregation, string> = {
  Nombre: "Nombre",
  Somme: "Somme",
  Moyenne: "Moyenne",
  Mediane: "Médiane",
  Minimum: "Minimum",
  Maximum: "Maximum",
  "Valeurs distinctes": "Valeurs distinctes",
  Pourcentage: "Part des lignes (%)",
};

interface GraphiqueGenerateurProps {
  entetes: string[];
  corps: Cellule[][];
  onEpingler?: (graphique: GraphiqueEpingle) => void;
}

const PALETTE = [
  "#2563eb",
  "#0891b2",
  "#4f46e5",
  "#d97706",
  "#059669",
  "#dc2626",
  "#475569",
  "#0d9488",
  "#9333ea",
  "#ca8a04",
];

const MAX_PARTS_CIRCULAIRE = 8;
const COULEUR_AUTRES = "#94a3b8";
const COULEUR_COURBE_COMBINEE = "#d97706";

/** Types qui ne passent pas par l'agrégation « catégorie → valeur » habituelle. */
const estNuageOuHistogramme = (type: TypeGraphique) => type === "Nuage" || type === "Histogramme";

/** Nombre d'éléments sur l'axe ; pour un nuage, 1 dès qu'il y a au moins un point. */
const compterPoints = (g: GraphiqueEpingle) => (g.type === "Nuage" ? Math.min(1, g.nuage?.nbPoints ?? 0) : g.labels?.length || 0);

/** Libellé d'une mesure agrégée : « Somme — Ventes », « Effectif »… */
const nomMesure = (agg: Agregation, colonne: string) =>
  agg === "Nombre" ? "Effectif" : agg === "Pourcentage" ? LIBELLES_AGREGATION.Pourcentage : `${LIBELLES_AGREGATION[agg]} — ${colonne}`;

const estCirculaire = (type: TypeGraphique) => type === "Camembert" || type === "Anneau";

const NOMS_GRANULARITE: Record<string, string> = { jour: "par jour", mois: "par mois", trimestre: "par trimestre", annee: "par année" };

/** Habillage d'une série unique selon le type de graphique. */
function habillerSerie(type: TypeGraphique, label: string, data: (number | null)[]): GraphiqueEpingle["datasets"] {
  if (estCirculaire(type)) {
    return [{ label, data, backgroundColor: data.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: "#ffffff", borderWidth: 2 }];
  }
  if (type === "Courbe" || type === "Aires") {
    return [
      {
        label,
        data,
        backgroundColor: "rgba(37, 99, 235, 0.14)",
        borderColor: "#2563eb",
        borderWidth: 2.5,
        fill: type === "Aires",
        pointRadius: data.length > 40 ? 0 : data.length > 20 ? 2 : 3.5,
      },
    ];
  }
  return [{ label, data, backgroundColor: "#2563eb", borderColor: "#1d4ed8", borderRadius: 4, borderWidth: 0 }];
}

const PALETTE_COMPARAISON = [
  { fill: "#1d4ed8", border: "#1e40af", bgLeger: "rgba(29, 78, 216, 0.12)" },
  { fill: "#0891b2", border: "#0e7490", bgLeger: "rgba(8, 145, 178, 0.12)" },
  { fill: "#d97706", border: "#b45309", bgLeger: "rgba(217, 119, 6, 0.12)" },
  { fill: "#059669", border: "#047857", bgLeger: "rgba(5, 150, 105, 0.12)" },
  { fill: "#dc2626", border: "#b91c1c", bgLeger: "rgba(220, 38, 38, 0.12)" },
  { fill: "#4f46e5", border: "#4338ca", bgLeger: "rgba(79, 70, 229, 0.12)" },
];

function versNombre(v: Cellule): number | null {
  if (estValeurVide(v)) return null;
  return parseNombre(v);
}

const OPTIONS_AGREGATION = (
  <>
    <option value="Somme">Somme</option>
    <option value="Moyenne">Moyenne</option>
    <option value="Mediane">Médiane</option>
    <option value="Minimum">Minimum</option>
    <option value="Maximum">Maximum</option>
    <option value="Nombre">Nombre d’enregistrements</option>
    <option value="Pourcentage">Part des lignes (%)</option>
    <option value="Valeurs distinctes">Nombre de valeurs distinctes</option>
  </>
);

/** Valeur d'option d'une mesure personnalisée dans les listes « Opération de calcul ». */
const PREFIXE_MESURE = "mesure:";

/** Libellé d'une mesure personnalisée dans un titre ou une légende : « Taux de marge (%) », « CA (FCFA) ». */
const libelleMesurePerso = (m: DefinitionMesure) => `${m.nom}${m.format === "pourcentage" ? " (%)" : m.unite ? ` (${m.unite})` : ""}`;

function OptionsCalcul({ mesures }: { mesures: DefinitionMesure[] }) {
  return (
    <>
      {OPTIONS_AGREGATION}
      {mesures.length > 0 && (
        <optgroup label="Vos mesures">
          {mesures.map((m) => (
            <option key={m.id} value={`${PREFIXE_MESURE}${m.id}`}>
              {m.nom}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

const selectClasse =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-medium focus:ring-2 focus:ring-blue-500";

const H = ({ children }: { children?: ReactNode }) => (
  <h6 className="text-[11px] font-bold mt-2.5 mb-1 text-slate-900 dark:text-slate-100 uppercase tracking-wide">
    {children}
  </h6>
);

const MD_GRAPH: Components = {
  h1: H,
  h2: H,
  h3: H,
  h4: H,
  p: ({ children }) => <p className="my-1 leading-relaxed text-slate-700 dark:text-slate-300">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-1 text-slate-700 dark:text-slate-300">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-1 text-slate-700 dark:text-slate-300">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>,
};

// Calcule la largeur dynamique requise pour donner tout l'espace aux données
function calculerLargeurConteneur(nbPoints: number): string {
  if (nbPoints > 15) {
    return `${Math.max(900, nbPoints * 40)}px`;
  }
  return "100%";
}

// Options Chart.js adaptées à chaque type de graphique :
// - barres et aires : l'axe des valeurs part de zéro (une barre tronquée fausse la comparaison) ;
// - camembert / anneau : aucun axe, part en % sur chaque secteur, légende à droite ;
// - axes en notation compacte (1,2 M), infobulles avec la valeur complète ;
// - étiquettes de valeurs affichées quand le graphique reste lisible (12 points au plus).
type TypeCartesienOuCirculaire = "bar" | "line" | "pie" | "doughnut";

/**
 * Un graphique épinglé a la forme des données Chart.js (labels, datasets) plus des champs propres à DATENZA
 * (titre, constats, filtres…). On transmet le même objet plutôt qu'une copie : une copie à chaque rendu
 * relancerait l'animation du graphique à chaque mise à jour de la page.
 */
function donneesGraphique<T extends TypeCartesienOuCirculaire>(g: GraphiqueEpingle): ChartData<T> {
  return g as unknown as ChartData<T>;
}

function creerOptionsChart<T extends TypeCartesienOuCirculaire>(g: GraphiqueEpingle, nbPoints: number, onSelection?: (index: number) => void): ChartOptions<T> {
  const circulaire = estCirculaire(g.type);
  const horizontal = !!g.horizontal && g.type === "Barres";
  const empile = !!g.empile && !circulaire;
  const cliquable = !!onSelection && (g.filtresClic ?? []).some(Boolean);
  // Sur téléphone, une légende à droite écrase le camembert : on la place dessous
  const ecranEtroit = typeof window !== "undefined" && window.innerWidth < 640;
  const multi = (g.datasets || []).length > 1;
  const valeurs = (g.datasets?.[0]?.data ?? []) as (number | null)[];
  const total = valeurs.reduce<number>((s, v) => s + Math.abs(v ?? 0), 0);
  const pourcent = (v: number) => `${formaterComplet(Math.round((1000 * Math.abs(v)) / total) / 10)} %`;

  const commun = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? ("y" as const) : ("x" as const),
    interaction: { mode: circulaire ? ("nearest" as const) : ("index" as const), intersect: circulaire, axis: horizontal ? ("y" as const) : ("x" as const) },
    // Filtrage croisé : un clic sur une barre, un point ou un secteur filtre tous les graphiques
    onClick: (_evt: ChartEvent, elements: ActiveElement[]) => {
      if (cliquable && elements.length && g.filtresClic?.[elements[0].index]) onSelection!(elements[0].index);
    },
    onHover: (evt: ChartEvent, elements: ActiveElement[]) => {
      const cible = evt?.native?.target as HTMLElement | undefined;
      if (cible) cible.style.cursor = cliquable && elements.length && g.filtresClic?.[elements[0].index] ? "pointer" : "default";
    },
    elements: { line: { tension: 0.25 }, point: { hoverRadius: 5 } },
    // Quelques barres ne s'étalent plus sur toute la largeur de l'écran ; celles d'un histogramme se touchent presque
    datasets: {
      bar: g.type === "Histogramme" ? { categoryPercentage: 1, barPercentage: 0.96 } : { maxBarThickness: 56, categoryPercentage: 0.72, barPercentage: 0.9 },
    },
    plugins: {
      legend: {
        display: circulaire || multi,
        position: circulaire ? (ecranEtroit ? ("bottom" as const) : ("right" as const)) : ("top" as const),
        labels: {
          boxWidth: 10,
          usePointStyle: true,
          color: "#64748b",
          font: { size: 11, weight: "bold" as const },
        },
      },
      datalabels: circulaire
        ? {
            display: (ctx: ContexteEtiquette) => total > 0 && Math.abs(Number(ctx.dataset.data[ctx.dataIndex] ?? 0)) / total >= 0.04,
            color: "#ffffff",
            font: { size: 10, weight: "bold" as const },
            formatter: (v: number | null) => (v === null || !total ? "" : pourcent(v)),
          }
        : {
            display: !multi && nbPoints <= 12 ? ("auto" as const) : false,
            anchor: "end" as const,
            align: horizontal ? ("right" as const) : ("end" as const),
            offset: 2,
            clamp: true,
            color: "#64748b",
            font: { size: 10, weight: "bold" as const },
            formatter: (v: number | null) => (v === null ? "" : formaterCompact(v)),
          },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (ctx: TooltipItem<TypeCartesienOuCirculaire>) => {
            // Camembert : un nombre ; barres et courbes : un point { x, y }
            const p = ctx.parsed as number | { x: number; y: number } | null;
            const v: number | null | undefined = typeof p === "number" ? p : horizontal ? p?.x : p?.y;
            if (v === null || v === undefined || Number.isNaN(v)) return `${ctx.dataset.label ?? ""} : aucune donnée`;
            const nom = circulaire ? ctx.label : ctx.dataset.label;
            return `${nom} : ${formaterComplet(v)}${circulaire && total ? ` (${pourcent(v)})` : ""}`;
          },
        },
      },
    },
  };

  // Options construites ci-dessus, communes aux quatre types : on les annonce pour le type demandé
  if (circulaire) return commun as unknown as ChartOptions<T>;

  const titreAxe = (texte?: string) => ({ display: !!texte, text: texte ?? "", color: "#64748b", font: { size: 10, weight: "bold" as const } });
  const axeValeurs = {
    title: titreAxe(g.axes?.y),
    beginAtZero: g.type !== "Courbe" || empile,
    stacked: empile,
    grid: { color: "rgba(148,163,184,0.18)" },
    border: { display: false },
    ticks: { color: "#64748b", font: { size: 10 }, callback: (v: number | string) => formaterCompact(Number(v)) },
    grace: "8%",
  };
  const axeCategories = {
    title: titreAxe(g.axes?.x),
    stacked: empile,
    grid: { display: false },
    ticks: {
      color: "#64748b",
      font: { size: 10 },
      maxRotation: 45,
      minRotation: 0,
      autoSkip: horizontal ? false : nbPoints <= 15,
    },
  };

  // Graphique combiné à deux échelles : l'axe de droite porte la courbe et ne trace pas de seconde grille
  const deuxAxes = g.type === "Combine" && (g.datasets || []).some((d) => d.yAxisID === "y1");
  const axeDroite = { ...axeValeurs, title: titreAxe(g.axes?.y2), position: "right" as const, grid: { drawOnChartArea: false } };

  return {
    ...commun,
    scales: horizontal
      ? { x: axeValeurs, y: axeCategories }
      : { y: axeValeurs, x: axeCategories, ...(deuxAxes ? { y1: axeDroite } : {}) },
  } as unknown as ChartOptions<T>;
}

/** Données Chart.js d'un nuage de points : une série par catégorie, puis la droite de tendance. */
type Point = { x: number; y: number };

function donneesNuage(g: GraphiqueEpingle): ChartData<"scatter", Point[]> {
  const n = g.nuage;
  if (!n) return { datasets: [] };
  const dense = n.series.reduce((t, s) => t + s.points.length, 0) > 400;
  // Les points d'une série, puis la droite de tendance tracée en ligne par-dessus le nuage
  const datasets: ChartDataset<"scatter" | "line", Point[]>[] = n.series.map((s, i) => {
    const couleur = /^Autres \(\d+\)$/.test(s.nom) ? COULEUR_AUTRES : PALETTE[i % PALETTE.length];
    return {
      label: s.nom || g.axes?.y || "Lignes",
      data: s.points,
      backgroundColor: `${couleur}${dense ? "80" : "b3"}`,
      borderColor: "#ffffff",
      borderWidth: dense ? 0 : 1,
      pointRadius: dense ? 3 : 4.5,
      pointHoverRadius: 7,
    };
  });
  if (n.droite) {
    datasets.push({
      type: "line",
      label: "Droite de tendance",
      data: [
        { x: n.droite.x1, y: n.droite.y1 },
        { x: n.droite.x2, y: n.droite.y2 },
      ],
      borderColor: "#475569",
      backgroundColor: "#475569",
      borderWidth: 2,
      borderDash: [6, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      pointHitRadius: 0,
      pointStyle: "line",
    });
  }
  return { datasets: datasets as ChartDataset<"scatter", Point[]>[] };
}

function creerOptionsNuage(g: GraphiqueEpingle): ChartOptions<"scatter"> {
  const axe = (texte?: string) => ({
    type: "linear" as const,
    title: { display: !!texte, text: texte ?? "", color: "#64748b", font: { size: 10, weight: "bold" as const } },
    grid: { color: "rgba(148,163,184,0.18)" },
    border: { display: false },
    ticks: { color: "#64748b", font: { size: 10 }, callback: (v: number | string) => formaterCompact(Number(v)) },
  });
  return {
    responsive: true,
    maintainAspectRatio: false,
    // Des milliers de points : pas d'animation, l'affichage reste immédiat
    animation: false,
    interaction: { mode: "nearest" as const, intersect: true },
    plugins: {
      legend: {
        display: (g.nuage?.series.length ?? 0) > 1 || !!g.nuage?.droite,
        position: "top" as const,
        labels: { boxWidth: 10, boxHeight: 8, pointStyleWidth: 14, usePointStyle: true, color: "#64748b", font: { size: 11, weight: "bold" as const } },
      },
      datalabels: { display: false },
      tooltip: {
        filter: (item: TooltipItem<"scatter">) => (item.dataset as { type?: string }).type !== "line",
        callbacks: {
          title: (items: TooltipItem<"scatter">[]) => (items[0]?.dataset?.label && (g.nuage?.series.length ?? 0) > 1 ? items[0].dataset.label : ""),
          label: (ctx: TooltipItem<"scatter">) => [`${g.axes?.x ?? "X"} : ${ctx.parsed.x === null ? "—" : formaterComplet(ctx.parsed.x)}`, `${g.axes?.y ?? "Y"} : ${ctx.parsed.y === null ? "—" : formaterComplet(ctx.parsed.y)}`],
        },
      },
    },
    scales: { x: axe(g.axes?.x), y: axe(g.axes?.y) },
  };
}


/** Réglages d'un graphique créé par l'utilisateur : le graphique est recalculé à chaque changement de données ou de filtre. */
interface SpecGraphique {
  id: number;
  type: TypeGraphique;
  x: string;
  y: string;
  agregation: Agregation;
  limite: number;
  legende: string;
  horizontal: boolean;
  empile: boolean;
  parFichier: boolean;
  /** Graphique combiné : mesure de la courbe et choix de son échelle. */
  y2: string;
  agregation2: Agregation;
  echelle: EchelleCourbe;
  /** Histogramme : nombre de classes demandé, 0 pour un choix automatique. */
  classes: number;
  /** Mesure personnalisée à la place de l'opération et de la colonne Y (et de la courbe d'un graphique combiné). */
  mesure?: string;
  mesure2?: string;
}

type EchelleCourbe = "auto" | "commune" | "separee";

const libelleFiltre = (f: ConditionFiltre) =>
  f.operateur === "entre"
    ? `${f.colonne} : ${String(f.valeur)} → ${String(f.valeurFin ?? "").slice(0, 10)}`
    : `${f.colonne} ${f.operateur === "egal" ? "=" : f.operateur} ${String(f.valeur)}`;

const memeFiltre = (a: ConditionFiltre, b: ConditionFiltre) =>
  a.colonne === b.colonne && a.operateur === b.operateur && String(a.valeur) === String(b.valeur) && String(a.valeurFin ?? "") === String(b.valeurFin ?? "");

export default function GraphiqueGenerateur({ entetes, corps }: GraphiqueGenerateurProps) {
  const {
    nomFichier,
    filtresActifs,
    ajouterFiltre,
    supprimerFiltre,
    reinitialiserFiltres,
    publierGraphiquesAffiches,
    mesures,
    graphiquesExclus,
    basculerExclusionGraphique,
  } = useData();

  const estModeComparaison = entetes.includes("Fichier Source");
  const idxSource = entetes.indexOf("Fichier Source");

  const sourcesFichiers = useMemo(() => {
    if (!estModeComparaison || idxSource === -1) return [];
    return Array.from(new Set(corps.map((l) => String(l[idxSource] ?? "").trim()).filter(Boolean)));
  }, [estModeComparaison, idxSource, corps]);

  const colonnesSansSource = useMemo(() => {
    return entetes.filter((h) => h !== "Fichier Source");
  }, [entetes]);

  // 1. Classification rigoureuse des colonnes
  const { colonnesTemporelles, colonnesMesurables, colonnesCategorielles } = useMemo(() => {
    const temporelles: string[] = [];
    const mesurables: string[] = [];
    const categorielles: string[] = [];

    colonnesSansSource.forEach((nom) => {
      const idx = entetes.indexOf(nom);
      const nonVides = corps.map((l) => l[idx]).filter((v) => !estValeurVide(v));
      if (!nonVides.length) return;

      if (estColonneIdentifiant(nom, nonVides)) return;

      if (estColonneTemporelle(nom, nonVides)) {
        temporelles.push(nom);
        return;
      }

      const nums = nonVides.map(versNombre).filter((n): n is number => n !== null);
      if (nums.length / nonVides.length >= 0.6) {
        mesurables.push(nom);
      } else {
        const uniques = new Set(nonVides.map((v) => String(v).trim()));
        if (uniques.size >= 2 && uniques.size <= 60) {
          categorielles.push(nom);
        }
      }
    });

    return { colonnesTemporelles: temporelles, colonnesMesurables: mesurables, colonnesCategorielles: categorielles };
  }, [colonnesSansSource, entetes, corps]);

  const defautX = colonnesTemporelles[0] || colonnesCategorielles[0] || colonnesSansSource[0] || "";
  const defautY =
    colonnesMesurables.find((c) => c !== defautX) ||
    colonnesMesurables[0] ||
    colonnesSansSource.find((c) => c !== defautX) ||
    "";

  const [typeGraphique, setTypeGraphique] = useState<TypeGraphique>("Barres");
  const [colonneAxeX, setColonneAxeX] = useState<string>(defautX);
  const [colonneAxeY, setColonneAxeY] = useState<string>(defautY);
  const [agregation, setAgregation] = useState<Agregation>(() =>
    colonnesMesurables.includes(defautY) ? (operationPour(defautY) === "somme" ? "Somme" : "Moyenne") : "Nombre"
  );
  const [limite, setLimite] = useState<number>(20);
  const [messageInfo, setMessageInfo] = useState<string>("");
  const [ventilerParFichier, setVentilerParFichier] = useState<boolean>(estModeComparaison);
  const [specs, setSpecs] = useState<SpecGraphique[]>([]);
  const [colonneLegende, setColonneLegende] = useState<string>("");
  const [horizontal, setHorizontal] = useState<boolean>(false);
  const [empile, setEmpile] = useState<boolean>(true);
  const [messageErreur, setMessageErreur] = useState<string>("");
  const [colonneY2, setColonneY2] = useState<string>("");
  const [agregation2, setAgregation2] = useState<Agregation>("Moyenne");
  const [mesureChoisie, setMesureChoisie] = useState<string>("");
  const [mesureChoisie2, setMesureChoisie2] = useState<string>("");
  const mesureActive = mesures.find((m) => m.id === mesureChoisie) ?? null;
  const mesureActive2 = mesures.find((m) => m.id === mesureChoisie2) ?? null;

  // Mesures personnalisées : calculées sur les données affichées (filtres compris)
  const calculateur = useMemo(() => new CalculateurMesures(entetes, corps, mesures), [entetes, corps, mesures]);
  const evaluateur = (def: DefinitionMesure) => (lignes: Cellule[][]) => valeurAffichee(calculateur.calculerOuVide(def, lignes), def);
  const [echelle, setEchelle] = useState<EchelleCourbe>("auto");
  const [nbClasses, setNbClasses] = useState<number>(0);
  const compteur = useRef(0);

  /** Changer de format ajuste les colonnes proposées : un nuage ou un histogramme ne portent que sur des mesures. */
  function changerType(type: TypeGraphique) {
    setTypeGraphique(type);
    setMessageErreur("");
    setMessageInfo("");
    if (estNuageOuHistogramme(type)) {
      const x = colonnesMesurables.includes(colonneAxeX) ? colonneAxeX : colonnesMesurables[0] ?? "";
      setColonneAxeX(x);
      if (type === "Nuage" && (!colonnesMesurables.includes(colonneAxeY) || colonneAxeY === x)) {
        setColonneAxeY(colonnesMesurables.find((c) => c !== x) ?? "");
      }
    }
    if (type === "Combine") {
      const autre = colonnesMesurables.find((c) => c !== colonneAxeY && c !== colonneAxeX);
      if (!colonneY2 || colonneY2 === colonneAxeY || !colonnesMesurables.includes(colonneY2)) {
        setColonneY2(autre ?? "");
        setAgregation2(autre ? (operationPour(autre) === "somme" ? "Somme" : "Moyenne") : "Nombre");
      }
    }
  }

  // Tout graphique affiché part dans le PowerPoint, sauf si l'utilisateur l'en a retiré
  const estInclusPptx = (id: number | string) => {
    return !(graphiquesExclus || []).includes(String(id));
  };

  // 2. MOTEUR DE RECOMMANDATION SANS DOUBLON (1 seul graphique par donnée analysée)
  const graphiquesRecommandes = useMemo<GraphiqueEpingle[]>(() => {
    if (!entetes.length || !corps.length) return [];
    const resultats: GraphiqueEpingle[] = [];
    const mesuresDejaUtilisees = new Set<string>();
    // Somme pour ce qui s'additionne (montants, quantités), moyenne pour le reste (prix, taux, notes)
    const operation = (col: string): Agregation => (operationPour(col) === "somme" ? "Somme" : "Moyenne");

    // CAS BENCHMARK COMPARATIF (N fichiers) : une série par fichier, alignée sur le même axe
    if (estModeComparaison && sourcesFichiers.length >= 2) {
      const colX = colonnesTemporelles[0] || colonnesCategorielles[0] || colonnesSansSource[0];
      const colY = colonnesMesurables[0] || "";

      if (colX) {
        if (colY) mesuresDejaUtilisees.add(colY);
        const agg: Agregation = colY ? operation(colY) : "Nombre";
        const series = sourcesFichiers.map((sourceNom) =>
          calculerSerie(entetes, corps, colX, colY || null, { agregation: agg, regrouperAutres: false }, (l) => String(l[idxSource] ?? "").trim() === sourceNom)
        );
        const temporel = series.some((x) => x.temporel);
        const aligne = alignerSeries(series);
        const garder = <T,>(liste: T[]) => (temporel ? liste.slice(-60) : liste.slice(0, 30));
        const labels = garder(aligne.labels).map((l: string) => (series.some((x) => x.granularite) ? libellePeriode(l) : l));

        if (labels.length >= 1) {
          resultats.push({
            id: 930001,
            titre: `Benchmark (${sourcesFichiers.length} fichiers) : ${colY ? `${LIBELLES_AGREGATION[agg]} de ${colY}` : "Effectif"} selon ${colX}`,
            type: temporel ? "Courbe" : "Barres",
            labels,
            datasets: sourcesFichiers.map((sourceNom, sIdx) => {
              const couleur = PALETTE_COMPARAISON[sIdx % PALETTE_COMPARAISON.length];
              return {
                label: sourceNom,
                data: garder(aligne.donnees[sIdx]),
                backgroundColor: couleur.fill,
                borderColor: couleur.border,
                borderWidth: 2,
                borderRadius: 4,
              };
            }),
          });
        }
      }
    }

    // Hors mode comparatif : un petit tableau de bord de 4 graphiques complémentaires au plus
    if (!(estModeComparaison && sourcesFichiers.length >= 2)) {
      const recos = recommanderGraphiques(
        entetes,
        corps,
        { temporelles: colonnesTemporelles, mesurables: colonnesMesurables, categorielles: colonnesCategorielles },
        operationPour,
        estPseudoMesure
      );
      for (const r of recos) {
        const lignes = r.type === "Courbe" || r.type === "Aires";
        if (r.mesures.length <= 1) {
          const m = r.mesures[0] ?? null;
          const serie = calculerSerie(entetes, corps, r.x, m, { agregation: r.agregation, limite: r.limite });
          const points = r.type === "Anneau" ? serie.points.filter((p) => p.valeur !== null && p.valeur > 0) : serie.points;
          if (points.filter((p) => p.valeur !== null).length < 2) continue;
          resultats.push({
            id: `reco-${r.cle}`,
            titre: r.titre,
            type: r.type,
            horizontal: r.horizontal,
            labels: points.map((p) => (serie.granularite ? libellePeriode(p.label) : p.label)),
            filtresClic: points.map((p) => filtrePourPoint(r.x, p.cle, serie.granularite)),
            datasets: habillerSerie(r.type, m ? `${LIBELLES_AGREGATION[r.agregation]} — ${nomLisible(m)}` : "Effectif", points.map((p) => p.valeur)),
          });
          continue;
        }
        // Plusieurs mesures : une série par mesure sur le même axe
        const series = r.mesures.map((m) => calculerSerie(entetes, corps, r.x, m, { agregation: r.agregation, regrouperAutres: false }));
        const temporel = series.some((x) => x.temporel);
        const granularite = series.find((x) => x.granularite)?.granularite ?? null;
        const aligne = alignerSeries(series);
        if (aligne.labels.length < 2) continue;
        const garder = <T,>(liste: T[]) => (temporel ? liste.slice(-r.limite) : liste.slice(0, r.limite));
        const cles = garder(aligne.labels);
        resultats.push({
          id: `reco-${r.cle}`,
          titre: r.titre,
          type: r.type,
          horizontal: r.horizontal,
          empile: r.empile,
          labels: cles.map((l) => (granularite ? libellePeriode(l) : l)),
          filtresClic: cles.map((l) => filtrePourPoint(r.x, l, granularite)),
          datasets: r.mesures.map((m, k) => {
            const couleur = PALETTE[k % PALETTE.length];
            return {
              label: nomLisible(m),
              data: garder(aligne.donnees[k]),
              backgroundColor: lignes ? `${couleur}22` : couleur,
              borderColor: couleur,
              borderWidth: lignes ? 2 : 0,
              borderRadius: 3,
            };
          }),
        });
      }
    }

    return resultats;
  }, [entetes, corps, colonnesTemporelles, colonnesMesurables, colonnesCategorielles, colonnesSansSource, estModeComparaison, sourcesFichiers, idxSource]);

  /** Calcule un graphique à partir de ses réglages et des données courantes (filtres compris). */
  function construire(spec: SpecGraphique): { graphique: GraphiqueEpingle | null; erreur?: string; info?: string } {
    if (spec.type === "Carte") {
      return {
        graphique: {
          id: spec.id,
          titre: `Carte géographique — ${spec.x}`,
          type: "Carte",
          labels: [],
          datasets: [{ label: "Occurrences", data: [], backgroundColor: "#2563eb" }],
        },
      };
    }

    const { agregation: agg, limite: lim } = spec;
    const defMesure = spec.mesure ? mesures.find((m) => m.id === spec.mesure) ?? null : null;
    if (spec.mesure && !defMesure) return { graphique: null, erreur: "La mesure de ce graphique a été supprimée." };
    const evaluer = defMesure ? evaluateur(defMesure) : undefined;
    const besoinY = !defMesure && !["Nombre", "Pourcentage"].includes(agg);
    if (entetes.indexOf(spec.x) === -1) return { graphique: null, erreur: spec.x ? `La colonne « ${spec.x} » n'existe plus.` : "Veuillez sélectionner une colonne." };

    // NUAGE DE POINTS : une ligne du fichier par point, sans agrégation
    if (spec.type === "Nuage") {
      if (entetes.indexOf(spec.y) === -1) return { graphique: null, erreur: "Veuillez sélectionner une mesure pour l'axe Y." };
      if (spec.x === spec.y) return { graphique: null, erreur: "Choisissez deux colonnes différentes pour l'axe X et l'axe Y." };
      const couleur = spec.legende && spec.legende !== spec.x && spec.legende !== spec.y && entetes.includes(spec.legende) ? spec.legende : "";
      const n = calculerNuage(entetes, corps, spec.x, spec.y, { colonneSerie: couleur || undefined });
      if (!n.nbPoints) return { graphique: null, erreur: `Aucune ligne n'a de valeur numérique à la fois dans « ${spec.x} » et « ${spec.y} ».` };
      const notes: string[] = [];
      if (n.nbAffiches < n.nbPoints) notes.push(`${formaterComplet(n.nbPoints)} lignes : ${formaterComplet(n.nbAffiches)} points sont dessinés, les calculs portent sur toutes.`);
      if (couleur && n.nbSeriesTotal > 8) notes.push(`${n.nbSeriesTotal} valeurs dans « ${couleur} » : les 8 plus fréquentes ont leur couleur, le reste est en gris.`);
      return {
        graphique: {
          id: spec.id,
          type: "Nuage",
          titre: `${spec.y} en fonction de ${spec.x}${couleur ? `, par ${couleur}` : ""}`,
          labels: [],
          datasets: [],
          nuage: { series: n.series, droite: n.droite, r: n.r, nbPoints: n.nbPoints },
          axes: { x: spec.x, y: spec.y },
          constats: expliquerNuage(n, spec.x, spec.y),
          indicateurs: [
            { titre: "CORRÉLATION", valeur: n.r === null ? "—" : `r = ${formaterComplet(n.r)}`, detail: n.r === null ? "non mesurable" : `liaison ${interpreterCorrelation(n.r)}` },
            { titre: "POINTS", valeur: formaterComplet(n.nbPoints), detail: "une ligne du fichier par point" },
          ],
        },
        info: notes.join(" "),
      };
    }

    // HISTOGRAMME : répartition d'une colonne numérique en classes de largeur égale
    if (spec.type === "Histogramme") {
      const h = calculerHistogramme(entetes, corps, spec.x, { nbClasses: spec.classes || undefined });
      if (!h.n) return { graphique: null, erreur: `« ${spec.x} » ne contient aucune valeur numérique.` };
      return {
        graphique: {
          id: spec.id,
          type: "Histogramme",
          titre: `Répartition de ${spec.x}`,
          labels: h.classes.map((c) => c.label),
          // Un clic filtre sur les valeurs réellement présentes dans la classe (la borne haute en est exclue)
          filtresClic: h.classes.map((c) =>
            c.effectif && c.minObserve !== null && c.maxObserve !== null
              ? { colonne: spec.x, operateur: "entre" as const, valeur: c.minObserve, valeurFin: c.maxObserve }
              : null
          ),
          datasets: [{ label: "Nombre de lignes", data: h.classes.map((c) => c.effectif), backgroundColor: "#2563eb", borderRadius: 2, borderWidth: 0 }],
          axes: { x: spec.x, y: "Nombre de lignes" },
          constats: expliquerHistogramme(h, spec.x),
          indicateurs: [
            { titre: "MÉDIANE", valeur: formaterComplet(h.mediane ?? 0), detail: `Moyenne : ${formaterComplet(h.moyenne ?? 0)}` },
            { titre: "VALEURS", valeur: formaterComplet(h.n), detail: `de ${formaterComplet(h.min ?? 0)} à ${formaterComplet(h.max ?? 0)}` },
          ],
        },
        info: h.nbIgnores ? `${h.nbIgnores} valeur(s) non numérique(s) ignorée(s) dans « ${spec.x} ».` : "",
      };
    }

    // GRAPHIQUE COMBINÉ : une mesure en barres, une autre en courbe, sur le même axe
    if (spec.type === "Combine") {
      const defMesure2 = spec.mesure2 ? mesures.find((m) => m.id === spec.mesure2) ?? null : null;
      if (spec.mesure2 && !defMesure2) return { graphique: null, erreur: "La mesure de la courbe a été supprimée." };
      const besoinY2 = !defMesure2 && !["Nombre", "Pourcentage"].includes(spec.agregation2);
      if (besoinY && entetes.indexOf(spec.y) === -1) return { graphique: null, erreur: "Veuillez sélectionner la mesure des barres." };
      if (besoinY2 && entetes.indexOf(spec.y2) === -1) return { graphique: null, erreur: "Veuillez sélectionner la mesure de la courbe." };
      const nomBarres = defMesure ? libelleMesurePerso(defMesure) : nomMesure(agg, spec.y);
      const nomCourbe = defMesure2 ? libelleMesurePerso(defMesure2) : nomMesure(spec.agregation2, spec.y2);
      if (nomBarres === nomCourbe) return { graphique: null, erreur: "Les barres et la courbe montrent la même mesure : choisissez-en deux différentes." };
      const c = calculerCombine(
        entetes,
        corps,
        spec.x,
        { colonne: besoinY ? spec.y : null, agregation: agg, evaluer },
        { colonne: besoinY2 ? spec.y2 : null, agregation: spec.agregation2, evaluer: defMesure2 ? evaluateur(defMesure2) : undefined },
        { limite: lim }
      );
      if (!c.axe.length || (!c.barres.some((v) => v !== null) && !c.courbe.some((v) => v !== null))) {
        return { graphique: null, erreur: "Aucune donnée exploitable pour cette combinaison de colonnes." };
      }
      const deuxAxes = spec.echelle === "separee" || (spec.echelle === "auto" && c.echellesEloignees);
      const libelles = c.axe.map((a) => (c.granularite ? libellePeriode(a.label) : a.label));
      const notes: string[] = [];
      if (c.tronque) notes.push(`${c.nbCategoriesTotal} ${c.temporel ? "périodes" : "catégories"} : les ${lim} ${c.temporel ? "plus récentes" : "premières"} sont affichées.`);
      if (deuxAxes && spec.echelle === "auto") notes.push("Les deux mesures n'ont pas le même ordre de grandeur : la courbe a sa propre échelle, à droite.");
      const sommet = (valeurs: (number | null)[]) => valeurs.reduce<number>((m, v) => (v !== null && v > m ? v : m), -Infinity);
      const texteSommet = (valeurs: (number | null)[]) => (Number.isFinite(sommet(valeurs)) ? formaterComplet(sommet(valeurs)) : "—");
      return {
        graphique: {
          id: spec.id,
          type: "Combine",
          titre: `${nomBarres} et ${nomCourbe} selon ${spec.x}${c.granularite ? ` (${NOMS_GRANULARITE[c.granularite]})` : ""}`,
          labels: libelles,
          filtresClic: c.axe.map((a) => filtrePourPoint(spec.x, a.cle, c.granularite)),
          datasets: [
            { type: "bar", label: nomBarres, data: c.barres, backgroundColor: "#2563eb", borderRadius: 4, borderWidth: 0, yAxisID: "y", order: 1 },
            {
              type: "line",
              label: nomCourbe,
              data: c.courbe,
              backgroundColor: COULEUR_COURBE_COMBINEE,
              borderColor: COULEUR_COURBE_COMBINEE,
              borderWidth: 2.5,
              pointRadius: c.axe.length > 40 ? 0 : 3.5,
              fill: false,
              yAxisID: deuxAxes ? "y1" : "y",
              order: 0,
            },
          ],
          axes: deuxAxes ? { y: nomBarres, y2: nomCourbe } : {},
          constats: expliquerCombine(c, libelles, nomBarres, nomCourbe, deuxAxes),
          indicateurs: [
            { titre: "MAXIMUM — BARRES", valeur: texteSommet(c.barres), detail: nomBarres },
            { titre: "MAXIMUM — COURBE", valeur: texteSommet(c.courbe), detail: nomCourbe },
          ],
        },
        info: notes.join(" "),
      };
    }

    if (besoinY && entetes.indexOf(spec.y) === -1) return { graphique: null, erreur: "Veuillez sélectionner une colonne pour l'axe Y." };

    const colY = besoinY ? spec.y : null;
    const circulaire = estCirculaire(spec.type);
    const lignes = spec.type === "Courbe" || spec.type === "Aires";
    const limiteEffective = circulaire ? Math.min(lim, MAX_PARTS_CIRCULAIRE) : lim;
    const titreMesure = defMesure ? libelleMesurePerso(defMesure) : nomMesure(agg, spec.y);
    const additif = defMesure ? estAdditive(defMesure, mesures) : ["Somme", "Nombre", "Pourcentage"].includes(agg);
    const base = { id: spec.id, type: spec.type, horizontal: spec.horizontal && spec.type === "Barres" };

    // MODE COMPARATIF : une série par fichier, alignée sur un axe commun
    if (estModeComparaison && spec.parFichier && sourcesFichiers.length >= 2 && !circulaire) {
      const series = sourcesFichiers.map((sourceNom) =>
        calculerSerie(entetes, corps, spec.x, colY, { agregation: agg, regrouperAutres: false, evaluer }, (l) => String(l[idxSource] ?? "").trim() === sourceNom)
      );
      const temporel = series.some((x) => x.temporel);
      const granularite = series.find((x) => x.granularite)?.granularite ?? null;
      const aligne = alignerSeries(series);
      if (!aligne.labels.length) return { graphique: null, erreur: "Aucune donnée exploitable pour cette combinaison de colonnes." };
      const garder = <T,>(liste: T[]) => (temporel ? liste.slice(-lim) : liste.slice(0, lim));
      const cles = garder(aligne.labels);
      return {
        graphique: {
          ...base,
          titre: `Benchmark (${sourcesFichiers.length} fichiers) : ${titreMesure} selon ${spec.x}`,
          labels: cles.map((l) => (granularite ? libellePeriode(l) : l)),
          filtresClic: cles.map((l) => filtrePourPoint(spec.x, l, granularite)),
          empile: spec.empile && additif && spec.type !== "Courbe",
          datasets: sourcesFichiers.map((sourceNom, sIdx) => {
            const couleur = PALETTE_COMPARAISON[sIdx % PALETTE_COMPARAISON.length];
            return {
              label: sourceNom,
              data: garder(aligne.donnees[sIdx]),
              backgroundColor: lignes ? couleur.bgLeger : couleur.fill,
              borderColor: couleur.border,
              borderWidth: 2,
              borderRadius: 4,
              fill: spec.type === "Aires",
            };
          }),
        },
        info:
          aligne.labels.length > lim
            ? `${aligne.labels.length} valeurs sur l'axe X : les ${lim} ${temporel ? "plus récentes" : "plus importantes"} sont affichées.`
            : "",
      };
    }

    // VENTILATION PAR LÉGENDE : barres groupées ou empilées, courbes multiples
    if (spec.legende && spec.legende !== spec.x && entetes.indexOf(spec.legende) !== -1 && !circulaire) {
      const v = calculerSeriesVentilees(entetes, corps, spec.x, spec.legende, colY, { agregation: agg, limite: lim, limiteSeries: 8, evaluer });
      if (!v.axe.length || !v.series.length) return { graphique: null, erreur: "Aucune donnée exploitable pour cette combinaison de colonnes." };
      const empiler = spec.empile && additif && spec.type !== "Courbe";
      const notes: string[] = [];
      if (v.nbSeriesTotal > 8) notes.push(`${v.nbSeriesTotal} valeurs dans « ${spec.legende} » : les 8 plus fréquentes sont affichées${additif ? ", le reste dans « Autres »" : ""}.`);
      if (spec.empile && !additif)
        notes.push(defMesure ? `La mesure « ${defMesure.nom} » ne s'additionne pas : les séries sont affichées côte à côte.` : `Une ${LIBELLES_AGREGATION[agg].toLowerCase()} ne s'additionne pas : les séries sont affichées côte à côte.`);
      return {
        graphique: {
          ...base,
          titre: `${titreMesure} selon ${spec.x}, par ${spec.legende}${v.granularite ? ` (${NOMS_GRANULARITE[v.granularite]})` : ""}`,
          labels: v.axe.map((a) => (v.granularite && a.cle !== undefined ? libellePeriode(a.label) : a.label)),
          filtresClic: v.axe.map((a) => filtrePourPoint(spec.x, a.cle, v.granularite)),
          empile: empiler,
          datasets: v.series.map((serie, i) => {
            const couleur = PALETTE[i % PALETTE.length];
            return {
              label: serie.nom,
              data: serie.donnees,
              backgroundColor: lignes ? `${couleur}${spec.type === "Aires" ? "55" : "22"}` : couleur,
              borderColor: couleur,
              borderWidth: lignes ? 2 : 0,
              borderRadius: empiler ? 0 : 3,
              fill: spec.type === "Aires",
              pointRadius: v.axe.length > 40 ? 0 : 2.5,
            };
          }),
        },
        info: notes.join(" "),
      };
    }

    const serie = calculerSerie(entetes, corps, spec.x, colY, { agregation: agg, limite: limiteEffective, evaluer });
    const pointsValides = serie.points.filter((p) => p.valeur !== null);
    if (!pointsValides.length) {
      return {
        graphique: null,
        erreur: defMesure
          ? `La mesure « ${defMesure.nom} » ne donne aucune valeur pour ces données.`
          : besoinY
          ? `« ${spec.y} » ne contient aucune valeur numérique exploitable pour ce calcul.`
          : "Aucune donnée exploitable pour cette colonne.",
      };
    }
    if (circulaire && pointsValides.some((p) => (p.valeur as number) < 0)) {
      return { graphique: null, erreur: "Un camembert ne peut pas représenter des valeurs négatives : choisissez des barres." };
    }

    const notes: string[] = [];
    if (serie.tronque) {
      notes.push(
        serie.temporel
          ? `${serie.nbCategoriesTotal} périodes : les ${limiteEffective} plus récentes sont affichées.`
          : `${serie.nbCategoriesTotal} catégories : les ${limiteEffective} premières sont affichées${additif || defMesure ? ", le reste est regroupé dans « Autres »" : ""}.`
      );
    }
    if (serie.nbNonNumeriques) notes.push(`${serie.nbNonNumeriques} valeur(s) non numérique(s) ignorée(s) dans « ${spec.y} ».`);

    const points = circulaire ? pointsValides : serie.points;
    return {
      graphique: {
        ...base,
        titre: `${titreMesure} selon ${spec.x}${serie.granularite ? ` (${NOMS_GRANULARITE[serie.granularite]})` : ""}`,
        labels: points.map((p) => (serie.granularite ? libellePeriode(p.label) : p.label)),
        filtresClic: points.map((p) => filtrePourPoint(spec.x, p.cle, serie.granularite)),
        datasets: habillerSerie(spec.type, titreMesure, points.map((p) => p.valeur)),
      },
      info: notes.join(" "),
    };
  }

  function construireGraphiqueManuel() {
    setMessageErreur("");
    setMessageInfo("");
    if (!colonneAxeX) {
      setMessageErreur(
        estNuageOuHistogramme(typeGraphique) ? "Ce format demande une colonne de nombres : ce fichier n'en contient pas." : "Veuillez sélectionner une colonne pour l'Axe X."
      );
      return;
    }
    compteur.current += 1;
    const spec: SpecGraphique = {
      id: Date.now() * 1000 + compteur.current,
      type: typeGraphique,
      x: colonneAxeX,
      y: colonneAxeY,
      agregation,
      limite,
      legende: colonneLegende,
      horizontal,
      empile,
      parFichier: ventilerParFichier,
      y2: colonneY2,
      agregation2,
      echelle,
      classes: nbClasses,
      ...(mesureChoisie && !estNuageOuHistogramme(typeGraphique) && typeGraphique !== "Carte" ? { mesure: mesureChoisie } : {}),
      ...(mesureChoisie2 && typeGraphique === "Combine" ? { mesure2: mesureChoisie2 } : {}),
    };
    const essai = construire(spec);
    if (!essai.graphique) {
      setMessageErreur(essai.erreur ?? "Graphique impossible avec ces réglages.");
      return;
    }
    setMessageInfo(essai.info ?? "");
    setSpecs((prev) => [spec, ...prev]);
  }

  // Les graphiques créés sont recalculés dès que les données changent : c'est ce qui permet le filtrage croisé
  const graphiquesGeneres = useMemo<GraphiqueEpingle[]>(
    () =>
      specs.map((spec) => {
        const r = construire(spec);
        return (
          r.graphique ?? {
            id: spec.id,
            titre: `${spec.agregation === "Nombre" ? "Effectif" : spec.y} selon ${spec.x}`,
            type: spec.type,
            labels: [],
            datasets: [],
          }
        );
      }),
    // construire() ne dépend que des données ci-dessous
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [specs, entetes, corps, estModeComparaison, sourcesFichiers, idxSource, mesures, calculateur]
  );

  // Les graphiques affichés (automatiques puis créés à la main) sont ceux du PowerPoint : on les publie
  // à chaque changement de données, de filtre ou de réglage, pour que l'export reflète exactement l'écran.
  useEffect(() => {
    publierGraphiquesAffiches([
      ...graphiquesRecommandes,
      ...graphiquesGeneres.filter((g) => g.type !== "Carte" && compterPoints(g) > 0),
    ]);
    // publierGraphiquesAffiches est recréée à chaque rendu du contexte : seules les listes comptent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphiquesRecommandes, graphiquesGeneres]);

  /** Clic sur un point : ajoute le filtre correspondant, ou le retire s'il est déjà actif. */
  function basculerFiltre(g: GraphiqueEpingle, index: number) {
    const f = g.filtresClic?.[index];
    if (!f) return;
    const existant = (filtresActifs || []).findIndex((x) => memeFiltre(x, f));
    if (existant >= 0) supprimerFiltre(existant);
    else ajouterFiltre(f);
  }

  // Indicateurs clés : recalculés sur les données filtrées
  const indicateurs = useMemo(() => {
    const cartes: { titre: string; texte: string; complet: string; detail: string; perso?: boolean }[] = [
      { titre: "Lignes", texte: formaterCompact(corps.length), complet: formaterComplet(corps.length), detail: "enregistrements" },
    ];
    // Vos mesures d'abord (7 au plus), puis des indicateurs automatiques pour compléter une rangée de 4
    for (const m of mesures.slice(0, 7)) {
      const v = calculateur.calculerOuVide(m, corps);
      cartes.push({ titre: m.nom, texte: formaterMesure(v, m), complet: `${m.nom} = ${m.formule}`, detail: "votre mesure", perso: true });
    }
    for (const col of colonnesMesurables.filter((c) => !estPseudoMesure(c)).slice(0, Math.max(0, 4 - cartes.length))) {
      const idx = entetes.indexOf(col);
      let somme = 0;
      let n = 0;
      for (const l of corps) {
        const x = versNombre(l[idx]);
        if (x !== null) {
          somme += x;
          n++;
        }
      }
      if (!n) continue;
      const enSomme = operationPour(col) === "somme";
      const valeur = enSomme ? somme : somme / n;
      cartes.push({ titre: col, texte: formaterCompact(valeur), complet: formaterComplet(valeur), detail: enSomme ? "total" : "moyenne" });
    }
    return cartes;
  }, [corps, entetes, colonnesMesurables, mesures, calculateur]);

  return (
    <div className="space-y-6">
      {/* INDICATEURS CLÉS */}
      {corps.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {indicateurs.map((k) => (
            <div
              key={k.titre}
              className={`bg-white dark:bg-slate-900 border rounded-2xl px-4 py-3 shadow-sm ${k.perso ? "border-indigo-200 dark:border-indigo-900" : "border-slate-200 dark:border-slate-800"}`}
              title={k.complet}
            >
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">{k.titre}</p>
              <p className={`text-xl font-bold tabular-nums truncate ${k.perso ? "text-indigo-700 dark:text-indigo-300" : "text-slate-900 dark:text-white"}`}>{k.texte}</p>
              <p className="text-[10px] text-slate-400">{k.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* FILTRAGE CROISÉ */}
      <div className="no-print print:hidden flex flex-wrap items-center gap-2 text-xs">
        {(filtresActifs || []).length === 0 ? (
          <span className="text-slate-500 dark:text-slate-400">
            Cliquez sur une barre, un point ou un secteur pour filtrer tous les graphiques et les indicateurs.
          </span>
        ) : (
          <>
            <span className="font-semibold text-slate-600 dark:text-slate-300">Filtres actifs :</span>
            {filtresActifs.map((f, i) => (
              <button
                key={`${libelleFiltre(f)}-${i}`}
                onClick={() => supprimerFiltre(i)}
                title="Retirer ce filtre"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-600 text-white font-semibold cursor-pointer hover:bg-blue-700"
              >
                {libelleFiltre(f)} <span aria-hidden>✕</span>
              </button>
            ))}
            <button onClick={reinitialiserFiltres} className="text-rose-600 hover:underline font-semibold cursor-pointer">
              Tout effacer
            </button>
          </>
        )}
      </div>
      {estModeComparaison && (
        <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-blue-950 dark:text-blue-200">
                Mode Comparatif Actif ({sourcesFichiers.length} fichiers confrontés)
              </p>
              <p className="text-[11px] text-blue-600 dark:text-blue-400">
                Chaque fichier dispose de sa propre couleur pour identifier visuellement les dominances et les écarts.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {sourcesFichiers.map((nom, idx) => (
              <span
                key={nom}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white shadow-xs"
                style={{ backgroundColor: PALETTE_COMPARAISON[idx % PALETTE_COMPARAISON.length].fill }}
              >
                {nom}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* SECTION DES GRAPHIQUES RECOMMANDÉS (Prend tout l'espace requis) */}
      {graphiquesRecommandes.length > 0 && (
        <section className="space-y-4">
          <div className="no-print">
            <h4 className="text-base font-bold text-slate-900 dark:text-white">
              {estModeComparaison ? "Analyses comparatives suggérées" : "Graphiques recommandés automatiquement"}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Visualisations optimisées avec calcul automatique des tendances, classements et dominances.
            </p>
          </div>

          <div
            className={`grid gap-5 ${
              graphiquesRecommandes.length === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
            }`}
          >
            {graphiquesRecommandes.map((g, index) => {
              const estEpingle = estInclusPptx(g.id);
              const nbPoints = g.labels?.length || 0;
              const prendPleinLargeur = graphiquesRecommandes.length === 1 || (nbPoints > 20 && !g.horizontal);

              return (
                <div
                  key={g.id}
                  data-carte-graphique
                  className={`print-eviter-coupure bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm ${
                    prendPleinLargeur ? "lg:col-span-2" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div className="flex items-center gap-2 truncate">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {g.titre}
                      </h4>
                      <span className="text-[10px] bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
                        {estModeComparaison ? `Benchmark #${index + 1}` : `Recommandation #${index + 1}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                    <BoutonImage titre={g.titre} source={nomFichier} />
                    <button
                      onClick={() => basculerExclusionGraphique(g.id)}
                      title={estEpingle ? "Cliquez pour retirer ce graphique du PowerPoint" : "Cliquez pour le remettre dans le PowerPoint"}
                      className={`no-print print:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer ${
                        estEpingle
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
                      }`}
                    >
                      <Presentation className="w-3.5 h-3.5" />
                      {estEpingle ? "✓ Dans le PPTX" : "Retiré du PPTX"}
                    </button>
                    </div>
                  </div>

                  {/* CONTENEUR À LARGEUR ÉTIRÉE AVEC DÉFILEMENT POUR TOUT LE JEU DE DONNÉES */}
                  <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 pb-2">
                    <div
                      style={{
                        minWidth: g.horizontal || g.type === "Anneau" ? "100%" : calculerLargeurConteneur(nbPoints),
                        height: g.horizontal ? `${Math.max(280, nbPoints * 28)}px` : "280px",
                      }}
                      className="relative"
                    >
                      {g.type === "Courbe" || g.type === "Aires" ? (
                        <Line data={donneesGraphique<"line">(g)} options={creerOptionsChart<"line">(g, nbPoints, (i) => basculerFiltre(g, i))} />
                      ) : g.type === "Anneau" ? (
                        <Doughnut data={donneesGraphique<"doughnut">(g)} options={{ ...creerOptionsChart<"doughnut">(g, nbPoints, (i) => basculerFiltre(g, i)), cutout: "62%" }} />
                      ) : (
                        <Bar data={donneesGraphique<"bar">(g)} options={creerOptionsChart<"bar">(g, nbPoints, (i) => basculerFiltre(g, i))} />
                      )}
                    </div>
                  </div>

                  <ExplicationDetailleeGraphique graphique={g} nomFichier={nomFichier} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Créateur de graphiques manuels */}
      <div className="no-print print:hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-0.5">
              Créer un graphique personnalisé
            </h4>
            <p className="text-xs text-slate-500">
              Croisez vos dimensions et comparez vos sources d&apos;un clic.
            </p>
          </div>

          {estModeComparaison && (
            <label className="flex items-center gap-2 cursor-pointer bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <input
                type="checkbox"
                checked={ventilerParFichier}
                onChange={(e) => setVentilerParFichier(e.target.checked)}
                className="accent-blue-600 h-4 w-4 rounded cursor-pointer"
              />
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                Dédier une série par fichier ({sourcesFichiers.length} sources)
              </span>
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4 bg-slate-50 dark:bg-slate-800/40 p-3 sm:p-4 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Format d&apos;affichage</label>
            <select value={typeGraphique} onChange={(e) => changerType(e.target.value as TypeGraphique)} className={selectClasse}>
              <option value="Barres">Barres</option>
              <option value="Courbe">Courbe d’évolution</option>
              <option value="Aires">Aires</option>
              <option value="Combine">Combiné (barres + courbe)</option>
              <option value="Camembert">Camembert</option>
              <option value="Anneau">Anneau</option>
              <option value="Nuage" disabled={colonnesMesurables.length < 2}>Nuage de points</option>
              <option value="Histogramme" disabled={colonnesMesurables.length < 1}>Histogramme</option>
              <option value="Carte">Carte géographique</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              {typeGraphique === "Histogramme" ? "Colonne à répartir" : typeGraphique === "Nuage" ? "Axe X (mesure)" : "Axe X (Catégorie ou Date)"}
            </label>
            <select value={colonneAxeX} onChange={(e) => setColonneAxeX(e.target.value)} className={selectClasse}>
              {(estNuageOuHistogramme(typeGraphique) ? colonnesMesurables : colonnesSansSource).map((nom) => (
                <option key={nom} value={nom}>{nom}</option>
              ))}
            </select>
          </div>

          {typeGraphique === "Nuage" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Axe Y (mesure)</label>
                <select value={colonneAxeY} onChange={(e) => setColonneAxeY(e.target.value)} className={selectClasse}>
                  {colonnesMesurables
                    .filter((c) => c !== colonneAxeX)
                    .map((nom) => (
                      <option key={nom} value={nom}>{nom}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Couleur (par catégorie)</label>
                <select value={colonneLegende} onChange={(e) => setColonneLegende(e.target.value)} className={selectClasse}>
                  <option value="">Aucune</option>
                  {colonnesCategorielles.map((nom) => (
                    <option key={nom} value={nom}>{nom}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {typeGraphique === "Histogramme" && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Nombre de classes</label>
              <select value={nbClasses} onChange={(e) => setNbClasses(Number(e.target.value))} className={selectClasse}>
                <option value={0}>Automatique</option>
                <option value={5}>Environ 5</option>
                <option value={8}>Environ 8</option>
                <option value={10}>Environ 10</option>
                <option value={15}>Environ 15</option>
                <option value={20}>Environ 20</option>
              </select>
            </div>
          )}

          {typeGraphique !== "Carte" && !estNuageOuHistogramme(typeGraphique) && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{typeGraphique === "Combine" ? "Barres : calcul" : "Opération de calcul"}</label>
                <select
                  value={mesureActive ? `${PREFIXE_MESURE}${mesureActive.id}` : agregation}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith(PREFIXE_MESURE)) setMesureChoisie(v.slice(PREFIXE_MESURE.length));
                    else {
                      setMesureChoisie("");
                      setAgregation(v as Agregation);
                    }
                  }}
                  className={selectClasse}
                >
                  <OptionsCalcul mesures={mesures} />
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{typeGraphique === "Combine" ? "Barres : mesure" : "Axe Y (Mesure)"}</label>
                <select
                  value={colonneAxeY}
                  onChange={(e) => setColonneAxeY(e.target.value)}
                  disabled={!!mesureActive || colonnesSansSource.length === 0 || agregation === "Nombre" || agregation === "Pourcentage"}
                  title={mesureActive ? `La mesure « ${mesureActive.nom} » définit déjà son calcul : ${mesureActive.formule}` : undefined}
                  className={`${selectClasse} disabled:opacity-40`}
                >
                  {colonnesMesurables
                    .filter((c) => c !== colonneAxeX)
                    .map((nom) => (
                      <option key={nom} value={nom}>{nom}</option>
                    ))}
                  {(colonnesMesurables.length === 0 || agregation === "Valeurs distinctes") &&
                    colonnesSansSource
                      .filter((c) => !colonnesMesurables.includes(c) || colonnesMesurables.length === 0)
                      .filter((c) => c !== colonneAxeX)
                      .map((nom) => (
                        <option key={nom} value={nom}>{nom}</option>
                      ))}
                </select>
              </div>

              {typeGraphique === "Combine" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Courbe : calcul</label>
                    <select
                      value={mesureActive2 ? `${PREFIXE_MESURE}${mesureActive2.id}` : agregation2}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v.startsWith(PREFIXE_MESURE)) setMesureChoisie2(v.slice(PREFIXE_MESURE.length));
                        else {
                          setMesureChoisie2("");
                          setAgregation2(v as Agregation);
                        }
                      }}
                      className={selectClasse}
                    >
                      <OptionsCalcul mesures={mesures} />
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Courbe : mesure</label>
                    <select
                      value={colonneY2}
                      onChange={(e) => setColonneY2(e.target.value)}
                      disabled={!!mesureActive2 || agregation2 === "Nombre" || agregation2 === "Pourcentage"}
                      className={`${selectClasse} disabled:opacity-40`}
                    >
                      {!colonneY2 && <option value="">Choisir…</option>}
                      {(agregation2 === "Valeurs distinctes" ? colonnesSansSource : colonnesMesurables)
                        .filter((c) => c !== colonneAxeX)
                        .map((nom) => (
                          <option key={nom} value={nom}>{nom}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Échelle de la courbe</label>
                    <select value={echelle} onChange={(e) => setEchelle(e.target.value as EchelleCourbe)} className={selectClasse}>
                      <option value="auto">Automatique</option>
                      <option value="commune">Même axe que les barres</option>
                      <option value="separee">Axe séparé, à droite</option>
                    </select>
                  </div>
                </>
              )}

              {!estCirculaire(typeGraphique) && typeGraphique !== "Combine" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Légende (ventiler par)</label>
                  <select value={colonneLegende} onChange={(e) => setColonneLegende(e.target.value)} className={selectClasse}>
                    <option value="">Aucune</option>
                    {colonnesCategorielles
                      .filter((c) => c !== colonneAxeX)
                      .map((nom) => (
                        <option key={nom} value={nom}>{nom}</option>
                      ))}
                  </select>
                </div>
              )}

              {typeGraphique === "Barres" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Disposition des barres</label>
                  <select value={horizontal ? "h" : "v"} onChange={(e) => setHorizontal(e.target.value === "h")} className={selectClasse}>
                    <option value="v">Verticales</option>
                    <option value="h">Horizontales</option>
                  </select>
                </div>
              )}

              {(colonneLegende || (estModeComparaison && ventilerParFichier)) && (typeGraphique === "Barres" || typeGraphique === "Aires") && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Séries</label>
                  <select value={empile ? "e" : "g"} onChange={(e) => setEmpile(e.target.value === "e")} className={selectClasse}>
                    <option value="e">Empilées</option>
                    <option value="g">Côte à côte</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Nombre de valeurs affichées</label>
                <select value={limite} onChange={(e) => setLimite(Number(e.target.value))} className={selectClasse}>
                  <option value={5}>5 premières</option>
                  <option value={10}>10 premières</option>
                  <option value={20}>20 premières</option>
                  <option value={50}>50 premières</option>
                  <option value={100}>100 premières</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={construireGraphiqueManuel}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Ajouter le graphique
          </button>

          {messageErreur && (
            <span className="text-xs text-rose-600 flex items-center gap-1 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {messageErreur}
            </span>
          )}
          {!messageErreur && messageInfo && (
            <span className="text-xs text-slate-500 dark:text-slate-400">{messageInfo}</span>
          )}
        </div>
      </div>

      {/* Vos graphiques créés manuellement (Prennent tout l'espace nécessaire) */}
      {graphiquesGeneres.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
            Vos graphiques créés ({graphiquesGeneres.length})
          </h4>

          <div
            className={`grid gap-5 ${
              graphiquesGeneres.length === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
            }`}
          >
            {graphiquesGeneres.map((g) => {
              const estEpingle = estInclusPptx(g.id);
              const nbPoints = compterPoints(g);
              const prendPleinLargeur = graphiquesGeneres.length === 1 || nbPoints > 20;

              return (
                <div
                  key={g.id}
                  data-carte-graphique
                  className={`print-eviter-coupure bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm ${
                    prendPleinLargeur ? "lg:col-span-2" : ""
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {g.titre}
                    </h4>
                    <div className="no-print print:hidden flex items-center gap-2 shrink-0">
                      {g.type !== "Carte" && nbPoints > 0 && <BoutonImage titre={g.titre} source={nomFichier} />}
                      <button
                        onClick={() => basculerExclusionGraphique(g.id)}
                      title={estEpingle ? "Cliquez pour retirer ce graphique du PowerPoint" : "Cliquez pour le remettre dans le PowerPoint"}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          estEpingle
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
                        }`}
                      >
                        <Presentation className="w-3.5 h-3.5" />
                        {estEpingle ? "✓ Dans le PPTX" : "Retiré du PPTX"}
                      </button>
                      <button
                        onClick={() => setSpecs((prev) => prev.filter((x) => x.id !== g.id))}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        title="Supprimer ce graphique"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* CONTENEUR À LARGEUR ÉTIRÉE AVEC DÉFILEMENT */}
                  <div className={g.type === "Carte" ? "w-full min-h-[340px]" : "w-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 pb-2"}>
                    {g.type === "Carte" && <CarteGeographique entetes={entetes} corps={corps} />}
                    {g.type !== "Carte" && nbPoints === 0 && (
                      <p className="h-[120px] flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                        Aucune donnée pour ce graphique avec les filtres actifs.
                      </p>
                    )}
                    {g.type !== "Carte" && nbPoints > 0 && (
                      <div
                        style={{
                          minWidth: estCirculaire(g.type) || g.horizontal || g.type === "Nuage" ? "100%" : calculerLargeurConteneur(nbPoints),
                          height: g.horizontal ? `${Math.max(280, nbPoints * 28)}px` : g.type === "Nuage" ? "340px" : "280px",
                        }}
                        className="relative"
                      >
                        {(g.type === "Barres" || g.type === "Histogramme" || g.type === "Combine") && (
                          <Bar data={donneesGraphique<"bar">(g)} options={creerOptionsChart<"bar">(g, nbPoints, (i) => basculerFiltre(g, i))} />
                        )}
                        {g.type === "Nuage" && <Scatter data={donneesNuage(g)} options={creerOptionsNuage(g)} />}
                        {(g.type === "Courbe" || g.type === "Aires") && (
                          <Line data={donneesGraphique<"line">(g)} options={creerOptionsChart<"line">(g, nbPoints, (i) => basculerFiltre(g, i))} />
                        )}
                        {g.type === "Camembert" && <Pie data={donneesGraphique<"pie">(g)} options={creerOptionsChart<"pie">(g, nbPoints, (i) => basculerFiltre(g, i))} />}
                        {g.type === "Anneau" && (
                          <Doughnut data={donneesGraphique<"doughnut">(g)} options={{ ...creerOptionsChart<"doughnut">(g, nbPoints, (i) => basculerFiltre(g, i)), cutout: "62%" }} />
                        )}
                      </div>
                    )}
                  </div>

                  {(nbPoints > 0 || g.type === "Carte") && <ExplicationDetailleeGraphique graphique={g} nomFichier={nomFichier} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ExplicationDetailleeGraphique({
  graphique,
  nomFichier,
}: {
  graphique: GraphiqueEpingle;
  nomFichier?: string;
}) {
  const [syntheseDecisionnelle, setSyntheseDecisionnelle] = useState<string | null>(null);
  const [chargement, setChargement] = useState<boolean>(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Constats calculés sur les valeurs dessinées (fonction testée dans lib/analyse/graphique.ts)
  const analyse = useMemo(() => expliquerGraphique(graphique), [graphique]);
  // Lecture pédagogique : comment lire, tendance, écarts, résumé et pistes (lib/analyse/interpretation.ts)
  const interpretation = useMemo(() => interpreterGraphique(graphique), [graphique]);

  async function genererSyntheseApprofondie() {
    setChargement(true);
    setErreur(null);
    try {
      const labels = (graphique.labels || []).map(String);
      // Jusqu'à 40 points : les plus récents pour une série dans le temps, les premiers pour un classement.
      // Une valeur absente est transmise comme « absente », jamais comme 0.
      const dansLeTemps = graphique.type === "Courbe" || graphique.type === "Aires";
      const debut = dansLeTemps ? Math.max(0, labels.length - 40) : 0;
      const resumePoints = labels.slice(debut, debut + 40).map((lab, k) => {
        const i = debut + k;
        const val = (graphique.datasets || [])
          .map((d) => `${d.label || "Valeur"}: ${d.data[i] === null || d.data[i] === undefined ? "absente" : d.data[i]}`)
          .join(", ");
        return `${lab} (${val})`;
      });

      // Nuage de points : pas d'axe de catégories, on transmet un extrait régulier des points
      if (graphique.nuage) {
        const tous = graphique.nuage.series.flatMap((serie) => serie.points.map((pt) => ({ ...pt, serie: serie.nom })));
        const pas = Math.max(1, Math.floor(tous.length / 40));
        for (let i = 0; i < tous.length && resumePoints.length < 40; i += pas) {
          const pt = tous[i];
          resumePoints.push(`${pt.serie ? `${pt.serie} ` : ""}(${graphique.axes?.x ?? "x"}: ${pt.x}, ${graphique.axes?.y ?? "y"}: ${pt.y})`);
        }
      }

      const contexteUltraCourt = JSON.stringify({
        fichier: nomFichier || "Données",
        graphique: graphique.titre,
        type: graphique.type,
        nombre_de_points: graphique.nuage?.nbPoints ?? labels.length,
        donnees: resumePoints,
        constats_deja_calcules: [...(analyse?.lignes ?? []), ...(interpretation?.complements ?? [])].map((l) => `${l.titre} : ${l.texte}`),
      });

      const question = `Rédige une lecture concise de ce graphique intitulé "${graphique.titre}" :
- Le constat principal, chiffré, à partir des données fournies uniquement.
- Un contraste ou une irrégularité notable.
- Une piste à vérifier ou une question à se poser.
N'invente aucun chiffre, aucune cause et aucun contexte absents des données ; ne contredis pas les constats déjà calculés. Si une valeur est « absente », ne la traite pas comme zéro. Reste concis et direct, sans formule d'introduction ni de conclusion. Ne mentionne jamais que tu es une IA.`;

      const moteurPref = typeof window !== "undefined" ? lireFournisseur() : "auto";

      const rep = await appelerIA({
          question,
          contexte: contexteUltraCourt,
          fournisseur: moteurPref || "auto",
          langueConversation: "fr",
          langueApp: "fr",
        });

      const data = (await rep.json().catch(() => ({}))) as {
        reponse?: string;
        fournisseur?: string;
        error?: string;
      };

      if (!rep.ok || !data.reponse) {
        throw new Error(data.error || `Erreur (${rep.status})`);
      }

      setSyntheseDecisionnelle(data.reponse);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur de connexion.");
    } finally {
      setChargement(false);
    }
  }

  if (!analyse) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-3.5 space-y-2.5 text-[11px] leading-relaxed">
      <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <h5 className="font-bold text-slate-800 dark:text-slate-200">
            {analyse.multiSeries ? `Lecture comparée (${analyse.nbSeries} séries) :` : "Ce que montre ce graphique :"}
          </h5>
        </div>

        <button
          onClick={genererSyntheseApprofondie}
          disabled={chargement}
          className="no-print print:hidden inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-700 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition disabled:opacity-50 cursor-pointer shadow-2xs"
        >
          {chargement ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
              <span>Analyse en cours...</span>
            </>
          ) : syntheseDecisionnelle ? (
            <>
              <RefreshCw className="w-3 h-3" />
              <span>Actualiser l&apos;analyse</span>
            </>
          ) : (
            <>
              <FileText className="w-3 h-3 text-blue-600" />
              <span>Approfondir l&apos;analyse</span>
            </>
          )}
        </button>
      </div>

      <BlocInterpretation
        guide={interpretation?.guide}
        constats={[...analyse.lignes, ...(interpretation?.complements ?? [])]}
        resume={interpretation?.resume}
        pistes={interpretation?.pistes}
      />

      {syntheseDecisionnelle && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            <span className="uppercase tracking-wider">Lecture approfondie (rédigée par l&apos;IA) :</span>
          </div>
          <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_GRAPH}>
              {syntheseDecisionnelle}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {erreur && (
        <p className="no-print print:hidden text-[10px] text-rose-600 font-medium mt-1">
          ⚠ {erreur}
        </p>
      )}
    </div>
  );
}