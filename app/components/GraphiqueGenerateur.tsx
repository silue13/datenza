"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2";
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
  TrendingUp,
  BarChart3,
  FileText,
} from "lucide-react";
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
  type SerieGraphique,
} from "../../lib/analyse/graphique";
import { operationPour, estPseudoMesure } from "../../lib/analyse/mesures";
import type { ConditionFiltre } from "../../lib/analyse/filtres";
import { useData, type GraphiqueEpingle, type TypeGraphique } from "../context/DataContext";
import { lireFournisseur } from "../../lib/prefs";

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

const estCirculaire = (type: TypeGraphique) => type === "Camembert" || type === "Anneau";

/** Libellés d'axe lisibles : « 2024-03 » devient « mars 2024 ». */
const libellesSerie = (s: SerieGraphique) => s.points.map((p) => (s.granularite ? libellePeriode(p.label) : p.label));

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
function creerOptionsChart(g: GraphiqueEpingle, nbPoints: number, onSelection?: (index: number) => void): any {
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
    onClick: (_evt: unknown, elements: { index: number }[]) => {
      if (cliquable && elements.length && g.filtresClic?.[elements[0].index]) onSelection!(elements[0].index);
    },
    onHover: (evt: any, elements: { index: number }[]) => {
      const cible = evt?.native?.target as HTMLElement | undefined;
      if (cible) cible.style.cursor = cliquable && elements.length && g.filtresClic?.[elements[0].index] ? "pointer" : "default";
    },
    elements: { line: { tension: 0.25 }, point: { hoverRadius: 5 } },
    // Quelques barres ne s'étalent plus sur toute la largeur de l'écran
    datasets: { bar: { maxBarThickness: 56, categoryPercentage: 0.72, barPercentage: 0.9 } },
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
            display: (ctx: any) => total > 0 && Math.abs(ctx.dataset.data[ctx.dataIndex] ?? 0) / total >= 0.04,
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
          label: (ctx: any) => {
            const v: number | null | undefined = circulaire ? ctx.parsed : horizontal ? ctx.parsed?.x : ctx.parsed?.y;
            if (v === null || v === undefined || Number.isNaN(v)) return `${ctx.dataset.label ?? ""} : aucune donnée`;
            const nom = circulaire ? ctx.label : ctx.dataset.label;
            return `${nom} : ${formaterComplet(v)}${circulaire && total ? ` (${pourcent(v)})` : ""}`;
          },
        },
      },
    },
  };

  if (circulaire) return commun;

  const axeValeurs = {
    beginAtZero: g.type !== "Courbe" || empile,
    stacked: empile,
    grid: { color: "rgba(148,163,184,0.18)" },
    border: { display: false },
    ticks: { color: "#64748b", font: { size: 10 }, callback: (v: number | string) => formaterCompact(Number(v)) },
    grace: "8%",
  };
  const axeCategories = {
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

  return {
    ...commun,
    scales: horizontal ? { x: axeValeurs, y: axeCategories } : { y: axeValeurs, x: axeCategories },
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
}

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
  const compteur = useRef(0);

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
        const garder = (liste: any[]) => (temporel ? liste.slice(-60) : liste.slice(0, 30));
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
    const besoinY = !["Nombre", "Pourcentage"].includes(agg);
    if (entetes.indexOf(spec.x) === -1) return { graphique: null, erreur: `La colonne « ${spec.x} » n'existe plus.` };
    if (besoinY && entetes.indexOf(spec.y) === -1) return { graphique: null, erreur: "Veuillez sélectionner une colonne pour l'axe Y." };

    const colY = besoinY ? spec.y : null;
    const circulaire = estCirculaire(spec.type);
    const lignes = spec.type === "Courbe" || spec.type === "Aires";
    const limiteEffective = circulaire ? Math.min(lim, MAX_PARTS_CIRCULAIRE) : lim;
    const titreMesure =
      agg === "Nombre" ? "Effectif" : agg === "Pourcentage" ? LIBELLES_AGREGATION.Pourcentage : `${LIBELLES_AGREGATION[agg]} — ${spec.y}`;
    const additif = ["Somme", "Nombre", "Pourcentage"].includes(agg);
    const base = { id: spec.id, type: spec.type, horizontal: spec.horizontal && spec.type === "Barres" };

    // MODE COMPARATIF : une série par fichier, alignée sur un axe commun
    if (estModeComparaison && spec.parFichier && sourcesFichiers.length >= 2 && !circulaire) {
      const series = sourcesFichiers.map((sourceNom) =>
        calculerSerie(entetes, corps, spec.x, colY, { agregation: agg, regrouperAutres: false }, (l) => String(l[idxSource] ?? "").trim() === sourceNom)
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
      const v = calculerSeriesVentilees(entetes, corps, spec.x, spec.legende, colY, { agregation: agg, limite: lim, limiteSeries: 8 });
      if (!v.axe.length || !v.series.length) return { graphique: null, erreur: "Aucune donnée exploitable pour cette combinaison de colonnes." };
      const empiler = spec.empile && additif && spec.type !== "Courbe";
      const notes: string[] = [];
      if (v.nbSeriesTotal > 8) notes.push(`${v.nbSeriesTotal} valeurs dans « ${spec.legende} » : les 8 plus fréquentes sont affichées${additif ? ", le reste dans « Autres »" : ""}.`);
      if (spec.empile && !additif) notes.push(`Une ${LIBELLES_AGREGATION[agg].toLowerCase()} ne s'additionne pas : les séries sont affichées côte à côte.`);
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

    const serie = calculerSerie(entetes, corps, spec.x, colY, { agregation: agg, limite: limiteEffective });
    const pointsValides = serie.points.filter((p) => p.valeur !== null);
    if (!pointsValides.length) {
      return {
        graphique: null,
        erreur: besoinY ? `« ${spec.y} » ne contient aucune valeur numérique exploitable pour ce calcul.` : "Aucune donnée exploitable pour cette colonne.",
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
          : `${serie.nbCategoriesTotal} catégories : les ${limiteEffective} premières sont affichées${additif ? ", le reste est regroupé dans « Autres »" : ""}.`
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
      setMessageErreur("Veuillez sélectionner une colonne pour l'Axe X.");
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
    [specs, entetes, corps, estModeComparaison, sourcesFichiers, idxSource]
  );

  // Les graphiques affichés (automatiques puis créés à la main) sont ceux du PowerPoint : on les publie
  // à chaque changement de données, de filtre ou de réglage, pour que l'export reflète exactement l'écran.
  useEffect(() => {
    publierGraphiquesAffiches([
      ...graphiquesRecommandes,
      ...graphiquesGeneres.filter((g) => g.type !== "Carte" && (g.labels?.length ?? 0) > 0),
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
    const cartes: { titre: string; valeur: number; detail: string }[] = [{ titre: "Lignes", valeur: corps.length, detail: "enregistrements" }];
    for (const col of colonnesMesurables.filter((c) => !estPseudoMesure(c)).slice(0, 3)) {
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
      cartes.push({ titre: col, valeur: enSomme ? somme : somme / n, detail: enSomme ? "total" : "moyenne" });
    }
    return cartes;
  }, [corps, entetes, colonnesMesurables]);

  return (
    <div className="space-y-6">
      {/* INDICATEURS CLÉS */}
      {corps.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {indicateurs.map((k) => (
            <div
              key={k.titre}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 shadow-sm"
              title={formaterComplet(k.valeur)}
            >
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">{k.titre}</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{formaterCompact(k.valeur)}</p>
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
                        <Line data={g} options={creerOptionsChart(g, nbPoints, (i) => basculerFiltre(g, i))} />
                      ) : g.type === "Anneau" ? (
                        <Doughnut data={g} options={{ ...creerOptionsChart(g, nbPoints, (i) => basculerFiltre(g, i)), cutout: "62%" }} />
                      ) : (
                        <Bar data={g} options={creerOptionsChart(g, nbPoints, (i) => basculerFiltre(g, i))} />
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
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Format d&apos;affichage
            </label>
            <select
              value={typeGraphique}
              onChange={(e) => setTypeGraphique(e.target.value as TypeGraphique)}
              className={selectClasse}
            >
              <option value="Barres">Barres verticales</option>
              <option value="Courbe">Courbe d’évolution</option>
              <option value="Aires">Aires</option>
              <option value="Camembert">Camembert</option>
              <option value="Anneau">Anneau</option>
              <option value="Carte">Carte géographique</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Axe X (Catégorie ou Date)
            </label>
            <select
              value={colonneAxeX}
              onChange={(e) => setColonneAxeX(e.target.value)}
              className={selectClasse}
            >
              {colonnesSansSource.map((nom) => (
                <option key={nom} value={nom}>{nom}</option>
              ))}
            </select>
          </div>

          {typeGraphique !== "Carte" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Opération de calcul
                </label>
                <select
                  value={agregation}
                  onChange={(e) => setAgregation(e.target.value as Agregation)}
                  className={selectClasse}
                >
                  <option value="Somme">Somme</option>
                  <option value="Moyenne">Moyenne</option>
                  <option value="Mediane">Médiane</option>
                  <option value="Minimum">Minimum</option>
                  <option value="Maximum">Maximum</option>
                  <option value="Nombre">Nombre d’enregistrements</option>
                  <option value="Pourcentage">Part des lignes (%)</option>
                  <option value="Valeurs distinctes">Nombre de valeurs distinctes</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Axe Y (Mesure)
                </label>
                <select
                  value={colonneAxeY}
                  onChange={(e) => setColonneAxeY(e.target.value)}
                  disabled={colonnesSansSource.length === 0 || agregation === "Nombre" || agregation === "Pourcentage"}
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
              {!estCirculaire(typeGraphique) && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                    Légende (ventiler par)
                  </label>
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
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                    Disposition des barres
                  </label>
                  <select
                    value={horizontal ? "h" : "v"}
                    onChange={(e) => setHorizontal(e.target.value === "h")}
                    className={selectClasse}
                  >
                    <option value="v">Verticales</option>
                    <option value="h">Horizontales</option>
                  </select>
                </div>
              )}

              {(colonneLegende || (estModeComparaison && ventilerParFichier)) && (typeGraphique === "Barres" || typeGraphique === "Aires") && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                    Séries
                  </label>
                  <select value={empile ? "e" : "g"} onChange={(e) => setEmpile(e.target.value === "e")} className={selectClasse}>
                    <option value="e">Empilées</option>
                    <option value="g">Côte à côte</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Nombre de valeurs affichées
                </label>
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
              const nbPoints = g.labels?.length || 0;
              const prendPleinLargeur = graphiquesGeneres.length === 1 || nbPoints > 20;

              return (
                <div
                  key={g.id}
                  className={`print-eviter-coupure bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm ${
                    prendPleinLargeur ? "lg:col-span-2" : ""
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {g.titre}
                    </h4>
                    <div className="no-print print:hidden flex items-center gap-2 shrink-0">
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
                          minWidth: estCirculaire(g.type) || g.horizontal ? "100%" : calculerLargeurConteneur(nbPoints),
                          height: g.horizontal ? `${Math.max(280, nbPoints * 28)}px` : "280px",
                        }}
                        className="relative"
                      >
                        {g.type === "Barres" && <Bar data={g} options={creerOptionsChart(g, nbPoints, (i) => basculerFiltre(g, i))} />}
                        {(g.type === "Courbe" || g.type === "Aires") && (
                          <Line data={g} options={creerOptionsChart(g, nbPoints, (i) => basculerFiltre(g, i))} />
                        )}
                        {g.type === "Camembert" && <Pie data={g} options={creerOptionsChart(g, nbPoints, (i) => basculerFiltre(g, i))} />}
                        {g.type === "Anneau" && (
                          <Doughnut data={g} options={{ ...creerOptionsChart(g, nbPoints, (i) => basculerFiltre(g, i)), cutout: "62%" }} />
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

      const contexteUltraCourt = JSON.stringify({
        fichier: nomFichier || "Données",
        graphique: graphique.titre,
        type: graphique.type,
        nombre_de_points: labels.length,
        donnees: resumePoints,
        constats_deja_calcules: (analyse?.lignes ?? []).map((l) => `${l.titre} : ${l.texte}`),
      });

      const question = `Rédige une lecture concise de ce graphique intitulé "${graphique.titre}" :
- Le constat principal, chiffré, à partir des données fournies uniquement.
- Un contraste ou une irrégularité notable.
- Une piste à vérifier ou une question à se poser.
N'invente aucun chiffre, aucune cause et aucun contexte absents des données ; ne contredis pas les constats déjà calculés. Si une valeur est « absente », ne la traite pas comme zéro. Reste concis et direct, sans formule d'introduction ni de conclusion. Ne mentionne jamais que tu es une IA.`;

      const moteurPref = typeof window !== "undefined" ? lireFournisseur() : "auto";

      const rep = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          contexte: contexteUltraCourt,
          fournisseur: moteurPref || "auto",
          langueConversation: "fr",
          langueApp: "fr",
        }),
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

      <div className="space-y-1">
        {analyse.lignes.map((l) => (
          <div key={l.titre} className="flex items-start gap-1.5">
            <span className="font-bold text-blue-600">•</span>
            <p className="text-slate-700 dark:text-slate-300">
              <strong>{l.titre} :</strong> {l.texte}
            </p>
          </div>
        ))}
      </div>

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