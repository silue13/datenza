"use client";

import React, { useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import "./chartSetup";
import {
  TrendingUp,
  Info,
  Calendar,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Lightbulb,
  Target,
  ShieldAlert,
  Flame,
  Activity,
  Scale,
  ArrowUpRight,
  Trophy,
  Presentation,
  RotateCcw,
} from "lucide-react";
import {
  agregerSerieGenerique,
  calculerPrevisionGenerale,
  type TypeAgregationTemporelle,
} from "@/lib/analyse/prevision";
import {
  parseNombre,
  type Cellule,
  estValeurVide,
  estColonneIdentifiant,
  estColonneTemporelle,
} from "@/lib/analyse/utils";
import { useData, type GraphiqueEpingle } from "../context/DataContext";
import type { Chart, ChartDataset, LegendItem, TooltipItem } from "chart.js";

/** Jeu de données d'une courbe de prévision ; indexDerniereDonnee situe la dernière valeur observée. */
type JeuPrevision = ChartDataset<"line", (number | null)[]> & { label: string; indexDerniereDonnee?: number };
import { formaterCompact, libellePeriode } from "../../lib/analyse/graphique";

interface ModulePrevisionsProps {
  entetes: string[];
  corps: Cellule[][];
  onEpingler?: (graphique: GraphiqueEpingle) => void;
}

interface SourceCalculee {
  nomSrc: string;
  historique: { periode: string; valeur: number }[];
  projections: { periode: string; valeurPrevue: number; borneBasse: number; borneHaute: number }[];
  dernierReel: number;
  cibleFinale: number;
  variationPct: number;
  fiabilite: "Élevée" | "Moyenne" | "Faible";
  r2: number;
}

const PALETTE_COMPARAISON = [
  { reel: "#4f46e5", proj: "#6366f1" }, // Indigo
  { reel: "#0891b2", proj: "#06b6d4" }, // Cyan
  { reel: "#f59e0b", proj: "#fbbf24" }, // Ambre
  { reel: "#10b981", proj: "#34d399" }, // Émeraude
  { reel: "#ec4899", proj: "#f472b6" }, // Rose
  { reel: "#8b5cf6", proj: "#a78bfa" }, // Violet
];

function hashChaineEnNombre(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Trait vertical entre la dernière donnée observée et la première projection, avec les mentions « observé » et « prévu ».
 * La position est lue sur le premier jeu de données (indexDerniereDonnee) pour suivre les changements de série.
 */
const MARQUEUR_PREVISION = {
  id: "marqueurPrevision",
  afterDatasetsDraw(chart: Chart) {
    const index = (chart.data?.datasets as JeuPrevision[] | undefined)?.find((d) => typeof d.indexDerniereDonnee === "number")?.indexDerniereDonnee;
    if (typeof index !== "number" || index < 0 || !chart.scales?.x || !chart.chartArea) return;
    const x = chart.scales.x.getPixelForValue(index);
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(100, 116, 139, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(100, 116, 139, 0.95)";
    ctx.font = "600 10px sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "right";
    ctx.fillText("observé", x - 6, top + 2);
    ctx.textAlign = "left";
    ctx.fillText("prévu", x + 6, top + 2);
    ctx.restore();
  },
};

export default function ModulePrevisions({ entetes, corps, onEpingler }: ModulePrevisionsProps) {
  const {
    graphiquesEpingles,
    epinglerGraphique,
    filtresActifs,
    reinitialiserFiltres,
  } = useData();

  const actionEpingler = onEpingler || epinglerGraphique;
  // Graphique (et référence) déjà ajouté au PPTX : tout changement de réglage en produit un nouveau, non inclus
  const [inclusPour, setInclusPour] = useState<string | null>(null);

  // 1. Détection du mode benchmark multi-fichiers
  const estModeComparaison = entetes.includes("Fichier Source");
  const idxSource = entetes.indexOf("Fichier Source");

  const sourcesFichiers = useMemo(() => {
    if (!estModeComparaison || idxSource === -1) return [];
    return Array.from(new Set(corps.map((l) => String(l[idxSource] ?? "").trim()).filter(Boolean)));
  }, [estModeComparaison, idxSource, corps]);

  const estBenchmarkActif = estModeComparaison && sourcesFichiers.length >= 2;

  // Fichier étalon (référence) pour calculer les deltas relatifs
  const [sourceRefChoisie, setSourceRefChoisie] = useState<string>("");
  const refSource = sourcesFichiers.includes(sourceRefChoisie)
    ? sourceRefChoisie
    : sourcesFichiers[0] || "";

  // 2. Détection stricte des colonnes temporelles vs mesurables (Empêche Y = X)
  const colonnesDisponibles = useMemo(() => {
    const temporelles: string[] = [];
    const mesurables: string[] = [];

    entetes.forEach((nom, colIdx) => {
      if (nom === "Fichier Source") return;

      const nonVides = corps
        .map((ligne) => ligne[colIdx])
        .filter((v) => !estValeurVide(v));

      if (nonVides.length === 0) return;

      const estId = estColonneIdentifiant(nom, nonVides);
      const estTemps = estColonneTemporelle(nom, nonVides);
      const nbNombres = nonVides.filter((v) => parseNombre(v) !== null).length;
      const estNum = nbNombres / nonVides.length >= 0.6;

      if (estTemps) {
        temporelles.push(nom);
      }
      // Une colonne est mesurable uniquement si elle est numérique ET n'est ni un ID, ni une date/année
      if (estNum && !estId && !estTemps) {
        mesurables.push(nom);
      }
    });

    // Repli de secours si aucune mesure pure n'a été isolée
    if (mesurables.length === 0) {
      entetes.forEach((nom, colIdx) => {
        if (nom === "Fichier Source" || temporelles.includes(nom)) return;
        const nonVides = corps.map((ligne) => ligne[colIdx]).filter((v) => !estValeurVide(v));
        if (nonVides.some((v) => parseNombre(v) !== null)) {
          mesurables.push(nom);
        }
      });
    }

    return { temporelles, mesurables };
  }, [entetes, corps]);

  const defautTemps = colonnesDisponibles.temporelles[0] || "";
  const defautMesure =
    colonnesDisponibles.mesurables.find((c) => c !== defautTemps) ||
    colonnesDisponibles.mesurables[0] ||
    "";

  const [colonneTempsChoisie, setColonneTemps] = useState<string>(defautTemps);
  const [colonneMesureChoisie, setColonneMesure] = useState<string>(defautMesure);
  const [modeAgregation, setModeAgregation] = useState<TypeAgregationTemporelle>("somme");
  const [horizon, setHorizon] = useState<number>(3);
  const [ongletExplication, setOngletExplication] = useState<"scenarios" | "calendrier" | "historique" | "guide">("scenarios");

  // Colonnes effectives : choix de l'utilisateur s'il reste valable, sinon une colonne disponible
  // (jamais la même colonne pour le temps et la mesure). Calculées à chaque rendu, sans effet de synchronisation.
  const colonneTemps = colonneTempsChoisie || colonnesDisponibles.temporelles[0] || "";
  const colonneMesure =
    colonneMesureChoisie && colonneMesureChoisie !== colonneTemps
      ? colonneMesureChoisie
      : colonnesDisponibles.mesurables.find((c) => c !== colonneTemps) || colonnesDisponibles.mesurables[0] || "";

  const idGraphiqueCourant = useMemo(() => {
    return hashChaineEnNombre(`prevision-${colonneTemps}-${colonneMesure}-${horizon}-${modeAgregation}`);
  }, [colonneTemps, colonneMesure, horizon, modeAgregation]);

  const estInclusPptx = useMemo(() => {
    return (
      (graphiquesEpingles || []).some((g) => g.id === idGraphiqueCourant) ||
      inclusPour === `${idGraphiqueCourant}|${refSource}`
    );
  }, [graphiquesEpingles, idGraphiqueCourant, inclusPour, refSource]);


  // Alerte métier si agrégation inappropriée
  const alerteMetier = useMemo(() => {
    const nom = colonneMesure.toLowerCase();
    const estIntensif =
      nom.includes("prix") ||
      nom.includes("taux") ||
      nom.includes("%") ||
      nom.includes("remise") ||
      nom.includes("marge");
    if (estIntensif && modeAgregation === "somme") {
      return `Vous appliquez une « Somme cumulée » sur une variable unitaire (${colonneMesure}). Pour observer le niveau réel constaté, privilégiez le mode « Moyenne de la période ».`;
    }
    return null;
  }, [colonneMesure, modeAgregation]);

  // 3. Calcul en mode FICHIER UNIQUE
  const diagnosticOuResultat = useMemo(() => {
    if (estBenchmarkActif) return null;

    if (!colonnesDisponibles.temporelles.length) {
      return {
        possible: false as const,
        code: "PAS_DE_TEMPS" as const,
        titre: "Aucune colonne temporelle identifiée",
        explication: "Le jeu de données ne comporte aucune colonne reconnue comme date ou année.",
        actionConseillee: "Une colonne de date ou d'année est indispensable pour ordonner la série temporelle.",
      };
    }

    if (!colonnesDisponibles.mesurables.length) {
      return {
        possible: false as const,
        code: "PAS_DE_MESURE" as const,
        titre: "Aucune mesure chiffrée à projeter",
        explication: "Toutes les colonnes actuelles sont de nature textuelle ou temporelle.",
        actionConseillee: "Sélectionnez une variable numérique (montant, volume, quantité, ratio, etc.).",
      };
    }

    const { serie, format } = agregerSerieGenerique(
      entetes,
      corps,
      colonneTemps || colonnesDisponibles.temporelles[0],
      colonneMesure || colonnesDisponibles.mesurables[0],
      modeAgregation
    );

    return calculerPrevisionGenerale(serie, format, horizon);
  }, [entetes, corps, colonnesDisponibles, colonneTemps, colonneMesure, modeAgregation, horizon, estBenchmarkActif]);

  // 4. Calcul en mode BENCHMARK COMPARATIF (N Sources)
  const calculsComparatifs = useMemo(() => {
    if (!estBenchmarkActif) return null;

    if (!colonnesDisponibles.temporelles.length || !colonnesDisponibles.mesurables.length) {
      return { possible: false as const };
    }

    const cTemps = colonneTemps || colonnesDisponibles.temporelles[0];
    const cMesure = colonneMesure || colonnesDisponibles.mesurables[0];

    const sourcesValides: SourceCalculee[] = [];

    sourcesFichiers.forEach((nomSrc) => {
      const corpsFiltre = corps.filter((l) => String(l[idxSource] ?? "").trim() === nomSrc);
      const { serie, format } = agregerSerieGenerique(entetes, corpsFiltre, cTemps, cMesure, modeAgregation);
      const prev = calculerPrevisionGenerale(serie, format, horizon);

      if (prev.possible && prev.historique.length > 0 && prev.projections.length > 0) {
        sourcesValides.push({
          nomSrc,
          historique: prev.historique,
          projections: prev.projections,
          dernierReel: prev.historique[prev.historique.length - 1].valeur,
          cibleFinale: prev.projections[prev.projections.length - 1].valeurPrevue,
          variationPct: prev.metriques.variationEstimeePct,
          fiabilite: prev.metriques.fiabilite,
          r2: prev.metriques.r2,
        });
      }
    });

    if (sourcesValides.length === 0) return { possible: false as const };

    const classementCible = [...sourcesValides].sort((a, b) => b.cibleFinale - a.cibleFinale);
    const leader = classementCible[0];
    const dernier = classementCible[classementCible.length - 1];
    const amplitudeTotale = Math.round((leader.cibleFinale - dernier.cibleFinale) * 100) / 100;
    const plusDynamique = [...sourcesValides].sort((a, b) => b.variationPct - a.variationPct)[0];
    const sourceRefData = sourcesValides.find((s) => s.nomSrc === refSource) || sourcesValides[0];

    return {
      possible: true as const,
      sources: sourcesValides,
      leader,
      dernier,
      amplitudeTotale,
      plusDynamique,
      sourceRefData,
      horizon,
    };
  }, [estBenchmarkActif, sourcesFichiers, corps, idxSource, entetes, colonneTemps, colonneMesure, colonnesDisponibles, modeAgregation, horizon, refSource]);

  // Source active utilisée pour alimenter les 4 onglets d'explication
  const sourceActive = useMemo(() => {
    if (estBenchmarkActif && calculsComparatifs && calculsComparatifs.possible) {
      return {
        nom: calculsComparatifs.sourceRefData.nomSrc,
        historique: calculsComparatifs.sourceRefData.historique,
        projections: calculsComparatifs.sourceRefData.projections,
        metriques: {
          fiabilite: calculsComparatifs.sourceRefData.fiabilite,
          r2: calculsComparatifs.sourceRefData.r2,
          variationEstimeePct: calculsComparatifs.sourceRefData.variationPct,
          sensTendance: calculsComparatifs.sourceRefData.variationPct >= 0 ? ("hausse" as const) : ("baisse" as const),
        },
      };
    }
    if (diagnosticOuResultat && diagnosticOuResultat.possible) {
      return {
        nom: "Série active",
        historique: diagnosticOuResultat.historique,
        projections: diagnosticOuResultat.projections,
        metriques: diagnosticOuResultat.metriques,
      };
    }
    return null;
  }, [estBenchmarkActif, calculsComparatifs, diagnosticOuResultat]);

  // Analyse rétrospective avancée
  const analyseAvancee = useMemo(() => {
    if (!sourceActive || sourceActive.historique.length === 0 || sourceActive.projections.length === 0) return null;
    const hist = sourceActive.historique;

    let pointMin = hist[0];
    let pointMax = hist[0];
    let somme = 0;

    hist.forEach((p) => {
      if (p.valeur < pointMin.valeur) pointMin = p;
      if (p.valeur > pointMax.valeur) pointMax = p;
      somme += p.valeur;
    });

    const moyenneHist = somme / hist.length;
    const ecartExtremes = pointMin.valeur > 0 ? Math.round((pointMax.valeur / pointMin.valeur) * 10) / 10 : null;

    const variance = hist.reduce((acc, p) => acc + Math.pow(p.valeur - moyenneHist, 2), 0) / hist.length;
    const ecartType = Math.sqrt(variance);
    const volatilitePct = Math.abs(moyenneHist) > 0 ? Math.round((ecartType / Math.abs(moyenneHist)) * 100) : 0;

    const derniereProj = sourceActive.projections[sourceActive.projections.length - 1];

    return {
      pointMin,
      pointMax,
      moyenneHist: Math.round(moyenneHist * 100) / 100,
      ecartExtremes,
      volatilitePct,
      derniereProj,
    };
  }, [sourceActive]);

  // Moteur de calcul des recommandations opérationnelles
  const calculsDecisionnels = useMemo(() => {
    if (!sourceActive || sourceActive.historique.length === 0 || sourceActive.projections.length === 0) return null;
    const hist = sourceActive.historique;
    const proj = sourceActive.projections;

    const dernierReelVal = hist[hist.length - 1].valeur;
    const cibleFinale = proj[proj.length - 1];
    const prochainMois = proj[0];

    const deltaTotal = cibleFinale.valeurPrevue - dernierReelVal;
    const effortMensuelMoyen = proj.length > 0 ? Math.round((deltaTotal / proj.length) * 100) / 100 : 0;

    const seuilAlerteJ30 = Math.round(
      prochainMois.valeurPrevue - (prochainMois.valeurPrevue - prochainMois.borneBasse) * 0.4
    );

    let pireChute = 0;
    let pireChuteDe = "";
    let pireChuteA = "";
    for (let i = 1; i < hist.length; i++) {
      const chute = hist[i - 1].valeur - hist[i].valeur;
      if (chute > pireChute) {
        pireChute = chute;
        pireChuteDe = hist[i - 1].periode;
        pireChuteA = hist[i].periode;
      }
    }

    const plafondEngagement = Math.round(
      cibleFinale.borneBasse + (cibleFinale.valeurPrevue - cibleFinale.borneBasse) * 0.25
    );

    return {
      effortMensuelMoyen,
      seuilAlerteJ30,
      pireChute: Math.round(pireChute),
      pireChuteDe,
      pireChuteA,
      plafondEngagement,
      prochainMois,
      cibleFinale,
      dernierReelVal,
    };
  }, [sourceActive]);

  // 5. Préparation des datasets Chart.js
  let chartData: { labels: string[]; datasets: JeuPrevision[] } = { labels: [], datasets: [] };

  if (estBenchmarkActif && calculsComparatifs && calculsComparatifs.possible) {
    const { sources } = calculsComparatifs;
    const premiere = sources[0];
    const labelsHisto = premiere.historique.map((p) => p.periode);
    const labelsProj = premiere.projections.map((p) => p.periode);
    const tousLabels = [...labelsHisto, ...labelsProj];
    const nbHisto = labelsHisto.length;

    const datasets: JeuPrevision[] = [];

    sources.forEach((s, idx) => {
      const palette = PALETTE_COMPARAISON[idx % PALETTE_COMPARAISON.length];
      const estRef = s.nomSrc === refSource;

      datasets.push({
        label: `${s.nomSrc} (Réalisé)`,
        data: [...s.historique.map((p) => p.valeur), ...Array(labelsProj.length).fill(null)],
        borderColor: palette.reel,
        backgroundColor: palette.reel,
        borderWidth: estRef ? 3 : 2,
        tension: 0.2,
        pointRadius: estRef ? 3.5 : 2.5,
      });

      datasets.push({
        label: `${s.nomSrc} (Projeté)`,
        data: [...Array(nbHisto - 1).fill(null), s.dernierReel, ...s.projections.map((p) => p.valeurPrevue)],
        borderColor: palette.proj,
        borderDash: [5, 5],
        borderWidth: 2,
        tension: 0.2,
        pointRadius: 3,
        pointStyle: "rectRot",
      });
    });

    chartData = { labels: tousLabels, datasets };
  } else if (diagnosticOuResultat && diagnosticOuResultat.possible) {
    const res = diagnosticOuResultat;
    const labels = [...res.historique.map((p) => p.periode), ...res.projections.map((p) => p.periode)].map((l) => libellePeriode(l));
    const dernierReel = res.historique[res.historique.length - 1].valeur;
    const nbH = res.historique.length;
    const vide = (n: number) => Array(Math.max(0, n)).fill(null);

    chartData = {
      labels,
      datasets: [
        {
          label: "Données observées",
          data: [...res.historique.map((p) => p.valeur), ...vide(res.projections.length)],
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.10)",
          pointBackgroundColor: "#2563eb",
          borderWidth: 2.5,
          // Courbe « monotone » : elle passe par les points sans dessiner de creux ni de bosses qui n'existent pas
          cubicInterpolationMode: "monotone" as const,
          fill: "origin",
          pointRadius: nbH > 48 ? 0 : 3,
          pointHoverRadius: 5,
          order: 2,
          // Repère lu par le marqueur vertical « observé | prévu »
          indexDerniereDonnee: nbH - 1,
        },
        ...(res.ajustement
          ? [
              {
                label: res.metriques.saisonnalite ? "Modèle (tendance + cycle annuel)" : "Modèle (tendance)",
                data: [...res.ajustement.map((p) => p.valeur), ...vide(res.projections.length)],
                borderColor: "rgba(100, 116, 139, 0.75)",
                backgroundColor: "transparent",
                borderWidth: 1.5,
                borderDash: [3, 3],
                cubicInterpolationMode: "monotone" as const,
                pointRadius: 0,
                pointHoverRadius: 0,
                order: 3,
              },
            ]
          : []),
        {
          label: "Projection",
          data: [...vide(nbH - 1), dernierReel, ...res.projections.map((p) => p.valeurPrevue)],
          borderColor: "#ea580c",
          backgroundColor: "#ea580c",
          borderDash: [6, 4],
          borderWidth: 2.5,
          cubicInterpolationMode: "monotone" as const,
          pointRadius: [...vide(nbH - 1), 0, ...res.projections.map(() => 4)],
          pointHoverRadius: 6,
          pointBackgroundColor: "#ea580c",
          order: 1,
        },
        {
          label: "Intervalle de confiance (95%)",
          data: [...vide(nbH - 1), dernierReel, ...res.projections.map((p) => p.borneHaute)],
          borderColor: "transparent",
          backgroundColor: "rgba(234, 88, 12, 0.14)",
          cubicInterpolationMode: "monotone" as const,
          fill: "+1",
          pointRadius: 0,
          pointHoverRadius: 0,
          order: 4,
        },
        {
          label: "Borne basse",
          data: [...vide(nbH - 1), dernierReel, ...res.projections.map((p) => p.borneBasse)],
          borderColor: "transparent",
          backgroundColor: "transparent",
          cubicInterpolationMode: "monotone" as const,
          pointRadius: 0,
          pointHoverRadius: 0,
          order: 5,
        },
      ],
    };
  }

  // Export PowerPoint
  const preparerExportPptx = () => {
    if (!chartData || !chartData.labels.length) return;

    const labels = chartData.labels;
    const datasets = chartData.datasets
      .filter((d) => !d.label.includes("Borne basse") && !d.label.includes("Intervalle") && !d.label.startsWith("Modèle"))
      .map((d) => ({
        label: d.label,
        data: d.data.map((v) => (v === null || v === undefined ? 0 : Number(v) || 0)),
        borderColor: typeof d.borderColor === "string" ? d.borderColor : "#2563EB",
        backgroundColor: typeof d.borderColor === "string" ? d.borderColor : "#2563EB",
      }));

    const titrePptx = estBenchmarkActif
      ? `Benchmark Prévisionnel : ${colonneMesure} par ${colonneTemps} (+${horizon} périodes)`
      : `Prévisions & Projections : ${colonneMesure} par ${colonneTemps} (+${horizon} périodes)`;

    let interpretation = "";
    if (estBenchmarkActif && calculsComparatifs && calculsComparatifs.possible) {
      interpretation = `Confrontation prévisionnelle sur ${sourcesFichiers.length} sources.\nLeader projeté : « ${calculsComparatifs.leader.nomSrc} » (${calculsComparatifs.leader.cibleFinale.toLocaleString("fr-FR")}).\nPlus forte dynamique : « ${calculsComparatifs.plusDynamique.nomSrc} » (${calculsComparatifs.plusDynamique.variationPct >= 0 ? "+" : ""}${calculsComparatifs.plusDynamique.variationPct} %).`;
    } else if (sourceActive && calculsDecisionnels) {
      interpretation = `Projection à +${horizon} périodes.\nFiabilité : ${sourceActive.metriques.fiabilite} (R² = ${sourceActive.metriques.r2}).\nAtterrissage projeté : ${calculsDecisionnels.cibleFinale.valeurPrevue.toLocaleString("fr-FR")} (${sourceActive.metriques.variationEstimeePct >= 0 ? "+" : ""}${sourceActive.metriques.variationEstimeePct} %). Seuil de vigilance pour la prochaine période : ${calculsDecisionnels.seuilAlerteJ30.toLocaleString("fr-FR")}.`;
    }

    const objetExport: GraphiqueEpingle = {
      id: idGraphiqueCourant,
      titre: titrePptx,
      type: "Courbe",
      chartType: "line",
      labels,
      datasets,
      interpretation,
    };

    if (actionEpingler) {
      actionEpingler(objetExport);
    }
    setInclusPour(`${idGraphiqueCourant}|${refSource}`);
  };

  // Options du graphique de prévision
  const toutesValeurs = chartData.datasets.flatMap((d) => (d.data as (number | null)[]).filter((v): v is number => typeof v === "number"));
  const jamaisNegatif = toutesValeurs.length > 0 && toutesValeurs.every((v) => v >= 0);
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      datalabels: {
        display: false,
      },
      legend: {
        position: "top" as const,
        align: "end" as const,
        labels: {
          filter: (item: LegendItem) => !item.text.includes("Borne basse"),
          usePointStyle: true,
          boxWidth: 7,
          boxHeight: 7,
          color: "#64748b",
          font: { size: 11 },
        },
      },
      tooltip: {
        // Les deux bornes ne sont pas listées une par une : elles sont résumées sous la projection
        filter: (item: TooltipItem<"line">) => !/Borne basse|Intervalle/.test(item.dataset.label ?? "") && item.parsed.y !== null,
        callbacks: {
          label: (context: TooltipItem<"line">) => {
            const v = context.parsed.y;
            return v !== null ? `${context.dataset.label} : ${v.toLocaleString("fr-FR")}` : "";
          },
          afterBody: (items: TooltipItem<"line">[]) => {
            const i = items[0]?.dataIndex;
            const jeux = items[0]?.chart?.data?.datasets ?? [];
            const haut = jeux.find((d) => String(d.label).includes("Intervalle"))?.data?.[i];
            const bas = jeux.find((d) => String(d.label).includes("Borne basse"))?.data?.[i];
            const projection = jeux.find((d) => d.label === "Projection")?.data?.[i];
            const observe = jeux[0]?.data?.[i];
            if (typeof haut !== "number" || typeof bas !== "number" || typeof projection !== "number" || typeof observe === "number") return "";
            return `Fourchette probable (95 %) : ${bas.toLocaleString("fr-FR")} à ${haut.toLocaleString("fr-FR")}`;
          },
        },
      },
    },
    scales: {
      y: {
        // Une grandeur toujours positive part de zéro : la hauteur de la courbe reste proportionnelle aux valeurs
        beginAtZero: jamaisNegatif,
        grid: { color: "rgba(148, 163, 184, 0.15)" },
        border: { display: false },
        ticks: { color: "#64748b", font: { size: 10 }, callback: (v: number | string) => formaterCompact(Number(v)) },
      },
      x: {
        grid: { display: false },
        ticks: { color: "#64748b", font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
      },
    },
  };

  // Repères utilisés par les textes d'explication (fichier unique)
  const resultatSimple = !estBenchmarkActif && diagnosticOuResultat && diagnosticOuResultat.possible ? diagnosticOuResultat : null;
  const cycleAnnuel = Boolean(resultatSimple?.metriques.saisonnalite);
  // Écart moyen entre le modèle et les valeurs réellement observées : c'est lui qui fixe la largeur de la fourchette
  const erreurTypique =
    resultatSimple?.ajustement && resultatSimple.ajustement.length === resultatSimple.historique.length
      ? Math.round(
          (resultatSimple.historique.reduce((t, p, i) => t + Math.abs(p.valeur - resultatSimple.ajustement![i].valeur), 0) /
            resultatSimple.historique.length) *
            100
        ) / 100
      : null;
  // Pente de la tendance (hors cycle) ; à défaut, progression moyenne des projections
  const rythmeFond = resultatSimple ? resultatSimple.metriques.pente : calculsDecisionnels?.effortMensuelMoyen ?? 0;

  const estPrevisionPossible = estBenchmarkActif
    ? Boolean(calculsComparatifs?.possible)
    : Boolean(diagnosticOuResultat?.possible);

  // Fichier sans aucun axe de temps : une simple ligne d'information, pas un module vide plein écran
  if (
    !estBenchmarkActif &&
    diagnosticOuResultat &&
    !diagnosticOuResultat.possible &&
    diagnosticOuResultat.code === "PAS_DE_TEMPS" &&
    !(filtresActifs && filtresActifs.length > 0)
  ) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-3 sm:px-5 sm:py-4 shadow-sm flex items-start gap-3 text-xs">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
        <div>
          <p className="font-bold text-slate-800 dark:text-slate-200">Prévisions : non disponibles pour ce fichier</p>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5">
            Une projection demande une colonne de dates, d&apos;années ou de périodes (mois, trimestres). Ce fichier n&apos;en contient pas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-sm">
      {/* En-tête du module */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${estPrevisionPossible ? "bg-cyan-600" : "bg-slate-400"}`}></div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {estBenchmarkActif
              ? `Confrontation Prévisionnelle & Projections (${sourcesFichiers.length} fichiers)`
              : "Prévisions & Projections Statistiques"}
          </h3>
          {!estPrevisionPossible && (
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium">
              Non disponible
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {estBenchmarkActif ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <Scale className="w-3.5 h-3.5" />
              Benchmark Multi-Sources ({sourcesFichiers.length} séries)
            </span>
          ) : (
            sourceActive && (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  sourceActive.metriques.fiabilite === "Élevée"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    : sourceActive.metriques.fiabilite === "Moyenne"
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                }`}
              >
                {sourceActive.metriques.fiabilite === "Faible" ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                Fiabilité {sourceActive.metriques.fiabilite} (R² = {sourceActive.metriques.r2})
              </span>
            )
          )}
          {!estBenchmarkActif && diagnosticOuResultat && diagnosticOuResultat.possible && diagnosticOuResultat.metriques.saisonnalite && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800"
              title="Le même mois se comporte de la même façon d'une année sur l'autre : les projections en tiennent compte."
            >
              Cycle annuel détecté{horizon < 12 ? " — choisissez 12 périodes pour le voir en entier" : ""}
            </span>
          )}

          {/* Bouton d'export vers PowerPoint */}
          {estPrevisionPossible && (
            <button
              onClick={preparerExportPptx}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                estInclusPptx
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
              }`}
            >
              <Presentation className="w-3.5 h-3.5" />
              {estInclusPptx ? "✓ Inclus au PPTX" : "+ Ajouter au PPTX"}
            </button>
          )}
        </div>
      </div>

      {alerteMetier && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-200">
          <Lightbulb className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{alerteMetier}</p>
        </div>
      )}

      {/* Barre de paramétrage (Empêche de sélectionner l'axe temporel comme indicateur à projeter) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 sm:p-4 rounded-xl text-xs">
        <div>
          <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Axe temporel / Séquence</label>
          <select
            value={colonneTemps}
            onChange={(e) => setColonneTemps(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-medium focus:ring-2 focus:ring-purple-500"
          >
            {colonnesDisponibles.temporelles.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Indicateur à projeter</label>
          <select
            value={colonneMesure}
            onChange={(e) => setColonneMesure(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-medium focus:ring-2 focus:ring-purple-500"
          >
            {colonnesDisponibles.mesurables
              .filter((c) => c !== colonneTemps)
              .map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
          </select>
        </div>

        <div>
          <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Calcul par période</label>
          <select
            value={modeAgregation}
            onChange={(e) => setModeAgregation(e.target.value as TypeAgregationTemporelle)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-medium focus:ring-2 focus:ring-purple-500"
          >
            <option value="somme">Somme cumulée</option>
            <option value="moyenne">Moyenne de la période</option>
          </select>
        </div>

        <div>
          <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Horizon futur</label>
          <select
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-medium focus:ring-2 focus:ring-purple-500"
          >
            <option value={3}>+ 3 périodes</option>
            <option value={6}>+ 6 périodes</option>
            <option value={12}>+ 12 périodes</option>
          </select>
        </div>
      </div>

      {/* Sélecteur de référence en mode benchmark */}
      {estBenchmarkActif && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-indigo-50/50 dark:bg-indigo-950/30 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-indigo-950 dark:text-indigo-200">Fichier de Référence (Étalon) :</span>
            <select
              value={refSource}
              onChange={(e) => setSourceRefChoisie(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2.5 py-1 font-bold text-indigo-700 dark:text-indigo-300"
            >
              {sourcesFichiers.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <span className="text-[11px] text-slate-500">
            Le tableau comparatif et les 4 onglets d&apos;explication se synchronisent sur cette série.
          </span>
        </div>
      )}

      {/* Cas d'impossibilité ou filtres trop stricts */}
      {!estBenchmarkActif && diagnosticOuResultat && !diagnosticOuResultat.possible && (
        <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-4 text-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold">
              <Info className="w-4 h-4 shrink-0" />
              <span>{diagnosticOuResultat.titre}</span>
            </div>
            {filtresActifs && filtresActifs.length > 0 && (
              <button
                type="button"
                onClick={reinitialiserFiltres}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-[11px] transition cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Réinitialiser les filtres ({filtresActifs.length} actif(s))</span>
              </button>
            )}
          </div>
          <p className="text-amber-700/90 dark:text-amber-400 leading-relaxed">
            {diagnosticOuResultat.explication}
          </p>
          <p className="text-slate-500 dark:text-slate-400 pt-2 border-t border-amber-200/50 dark:border-amber-900/40">
            <strong>Conseil :</strong> Changez l&apos;axe temporel ci-dessus ou désactivez les filtres pour récupérer l&apos;historique complet.
          </p>
        </div>
      )}

      {/* Rendu graphique épuré */}
      {estPrevisionPossible && (
        <>
          <div className="h-60 sm:h-80 w-full p-2 bg-gradient-to-b from-slate-50/50 to-white dark:from-slate-800/30 dark:to-slate-900 rounded-xl">
            <Line data={chartData} options={options} plugins={[MARQUEUR_PREVISION]} />
          </div>

          {/* Section benchmark comparatif */}
          {estBenchmarkActif && calculsComparatifs && calculsComparatifs.possible && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-slate-50/50 dark:bg-slate-900/60 space-y-4 text-xs">
              <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <h4 className="font-bold text-slate-900 dark:text-white">
                  Diagnostic d&apos;atterrissage comparatif (à horizon +{calculsComparatifs.horizon} périodes) :
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5 text-amber-500" /> Leader Projeté (1re place)
                  </span>
                  <p className="text-base font-black text-indigo-600 dark:text-indigo-400 truncate">
                    {calculsComparatifs.leader.nomSrc}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Atterrissage prévu à <strong>{calculsComparatifs.leader.cibleFinale.toLocaleString("fr-FR")}</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> Plus Forte Accélération
                  </span>
                  <p className="text-base font-black text-emerald-600 dark:text-emerald-400 truncate">
                    {calculsComparatifs.plusDynamique.nomSrc}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Dynamique de <strong>{calculsComparatifs.plusDynamique.variationPct >= 0 ? "+" : ""}{calculsComparatifs.plusDynamique.variationPct} %</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Amplitude du Benchmark</span>
                  <p className="text-base font-black text-slate-800 dark:text-slate-100">
                    {calculsComparatifs.amplitudeTotale.toLocaleString("fr-FR")}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Écart entre {calculsComparatifs.leader.nomSrc} et {calculsComparatifs.dernier.nomSrc}.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mt-2">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-700 dark:text-slate-300">
                      <th className="p-3">Fichier / Source</th>
                      <th className="p-3 text-right">Dernier Réalisé</th>
                      <th className="p-3 text-right font-black text-purple-700 dark:text-purple-300">Atterrissage Projeté</th>
                      <th className="p-3 text-right">Écart vs Réf ({refSource})</th>
                      <th className="p-3 text-center">Tendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {calculsComparatifs.sources.map((s, idx) => {
                      const refCible = calculsComparatifs.sourceRefData.cibleFinale;
                      const deltaVsRef = Math.round((s.cibleFinale - refCible) * 100) / 100;
                      const pctVsRef = Math.abs(refCible) > 0 ? Math.round((deltaVsRef / Math.abs(refCible)) * 1000) / 10 : 0;
                      const estRef = s.nomSrc === refSource;

                      return (
                        <tr key={s.nomSrc} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${estRef ? "bg-purple-50/30 dark:bg-purple-950/20" : ""}`}>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: PALETTE_COMPARAISON[idx % PALETTE_COMPARAISON.length].reel }}
                            ></span>
                            {s.nomSrc} {estRef && <span className="text-[10px] text-purple-600 font-bold">(Réf)</span>}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                            {s.dernierReel.toLocaleString("fr-FR")}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-purple-700 dark:text-purple-300">
                            {s.cibleFinale.toLocaleString("fr-FR")}
                          </td>
                          <td className="p-3 text-right font-mono font-bold">
                            {estRef ? (
                              <span className="text-slate-400 font-normal">—</span>
                            ) : (
                              <span className={deltaVsRef >= 0 ? "text-emerald-600" : "text-rose-600"}>
                                {deltaVsRef >= 0 ? "+" : ""}{deltaVsRef.toLocaleString("fr-FR")} ({pctVsRef >= 0 ? "+" : ""}{pctVsRef} %)
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                s.variationPct >= 0
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"
                                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/40"
                              }`}
                            >
                              {s.variationPct >= 0 ? "+" : ""}{s.variationPct} %
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Onglets d'explication */}
          {sourceActive && analyseAvancee && calculsDecisionnels && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/40 dark:bg-slate-900/60">
              <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pt-2 gap-2 text-xs overflow-x-auto">
                <button
                  onClick={() => setOngletExplication("scenarios")}
                  className={`pb-2.5 px-3 font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                    ongletExplication === "scenarios"
                      ? "border-purple-600 text-purple-700 dark:text-purple-300"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Target className="w-3.5 h-3.5" />
                  1. Les 3 Scénarios d&apos;atterrissage
                </button>

                <button
                  onClick={() => setOngletExplication("calendrier")}
                  className={`pb-2.5 px-3 font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                    ongletExplication === "calendrier"
                      ? "border-purple-600 text-purple-700 dark:text-purple-300"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  2. Calendrier mois par mois
                </button>

                <button
                  onClick={() => setOngletExplication("historique")}
                  className={`pb-2.5 px-3 font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                    ongletExplication === "historique"
                      ? "border-purple-600 text-purple-700 dark:text-purple-300"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  3. Origine de l&apos;incertitude passée
                </button>

                <button
                  onClick={() => setOngletExplication("guide")}
                  className={`pb-2.5 px-3 font-bold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                    ongletExplication === "guide"
                      ? "border-purple-600 text-purple-700 dark:text-purple-300"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  4. Recommandations concrètes
                </button>
              </div>

              <div className="p-5 text-xs">
                {ongletExplication === "scenarios" && (
                  <div className="space-y-4">
                    <p className="text-slate-600 dark:text-slate-400">
                      À l&apos;horizon <strong>{libellePeriode(analyseAvancee.derniereProj.periode)}</strong>
                      {estBenchmarkActif && (
                        <span> pour la série <strong>{sourceActive.nom}</strong></span>
                      )}
                      , voici les trois trajectoires envisageables pour arbitrer vos décisions :
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <ShieldAlert className="w-4 h-4 text-amber-600" />
                            Scénario Prudent (Bas)
                          </span>
                          <span className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-0.5 rounded-full font-bold">
                            Borne basse à 95 %
                          </span>
                        </div>
                        <div className="text-xl font-black text-slate-900 dark:text-white">
                          {analyseAvancee.derniereProj.borneBasse.toLocaleString("fr-FR")}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          D&apos;après les écarts constatés par le passé, il y a environ 2,5 % de chances que la valeur réelle soit plus basse. C&apos;est l&apos;hypothèse à retenir pour rester prudent.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                            <Target className="w-4 h-4 text-purple-600" />
                            Scénario Médian (Cible)
                          </span>
                          <span className="text-[10px] bg-purple-200/80 text-purple-800 dark:bg-purple-900 dark:text-purple-200 px-2 py-0.5 rounded-full font-bold">
                            Projection centrale
                          </span>
                        </div>
                        <div className="text-xl font-black text-purple-700 dark:text-purple-300">
                          {analyseAvancee.derniereProj.valeurPrevue.toLocaleString("fr-FR")}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                          L&apos;atterrissage le plus probable d&apos;après le prolongement mathématique de la tendance ({sourceActive.metriques.variationEstimeePct >= 0 ? "+" : ""}{sourceActive.metriques.variationEstimeePct} %{"referenceVariation" in sourceActive.metriques && sourceActive.metriques.referenceVariation ? ` par rapport à ${libellePeriode(String(sourceActive.metriques.referenceVariation))}` : ""}). Votre repère d&apos;objectifs.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <Flame className="w-4 h-4 text-emerald-600" />
                            Scénario Favorable (Haut)
                          </span>
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                            Borne haute à 95 %
                          </span>
                        </div>
                        <div className="text-xl font-black text-slate-900 dark:text-white">
                          {analyseAvancee.derniereProj.borneHaute.toLocaleString("fr-FR")}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          Il y a environ 2,5 % de chances que la valeur réelle soit plus haute. Ce n&apos;est pas un maximum possible, mais une limite rarement dépassée.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {ongletExplication === "calendrier" && (
                  <div className="space-y-3">
                    <p className="text-slate-600 dark:text-slate-400">
                      Détail de la progression estimée sur chacune des périodes à venir
                      {estBenchmarkActif && (
                        <span> pour <strong>{sourceActive.nom}</strong></span>
                      )} :
                    </p>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-700 dark:text-slate-300">
                            <th className="p-3">Période</th>
                            <th className="p-3 text-right">Borne Basse (Prudent)</th>
                            <th className="p-3 text-right font-black text-purple-700 dark:text-purple-300">Projection Médiane</th>
                            <th className="p-3 text-right">Borne Haute (Favorable)</th>
                            <th className="p-3 text-center">Incertitude</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                          {sourceActive.projections.map((p, idx) => {
                            const amplitude = p.borneHaute - p.borneBasse;
                            return (
                              <tr key={p.periode} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td className="p-3 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-cyan-600"></span>
                                  {libellePeriode(p.periode)} {idx === 0 && <span className="text-[10px] text-slate-400 font-normal">(prochaine période)</span>}
                                </td>
                                <td className="p-3 text-right text-slate-600 dark:text-slate-400 font-mono">
                                  {p.borneBasse.toLocaleString("fr-FR")}
                                </td>
                                <td className="p-3 text-right font-bold text-purple-700 dark:text-purple-300 font-mono text-sm">
                                  {p.valeurPrevue.toLocaleString("fr-FR")}
                                </td>
                                <td className="p-3 text-right text-slate-600 dark:text-slate-400 font-mono">
                                  {p.borneHaute.toLocaleString("fr-FR")}
                                </td>
                                <td className="p-3 text-center">
                                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500">
                                    ± {Math.round(amplitude / 2).toLocaleString("fr-FR")}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {ongletExplication === "historique" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-400 block text-[11px]">Creux historique le plus bas</span>
                        <strong className="text-rose-600 text-sm">{libellePeriode(analyseAvancee.pointMin.periode)}</strong>
                        <p className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                          {analyseAvancee.pointMin.valeur.toLocaleString("fr-FR")}
                        </p>
                      </div>

                      <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-400 block text-[11px]">Pic historique le plus haut</span>
                        <strong className="text-emerald-600 text-sm">{libellePeriode(analyseAvancee.pointMax.periode)}</strong>
                        <p className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                          {analyseAvancee.pointMax.valeur.toLocaleString("fr-FR")}
                        </p>
                      </div>

                      <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-400 block text-[11px]">Dispersion des valeurs passées</span>
                        <strong className="text-purple-600 text-sm">écart-type = {analyseAvancee.volatilitePct} % de la moyenne</strong>
                        <p className="text-slate-500 text-[11px] mt-0.5">
                          {analyseAvancee.ecartExtremes !== null
                            ? `Écart max/min de ${analyseAvancee.ecartExtremes}×`
                            : "Amplitude calculée sur valeurs nulles ou négatives"}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                      <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        D&apos;où vient la fourchette ?
                      </h4>
                      <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        Sur la période observée, les valeurs ont varié entre{" "}
                        <strong>{analyseAvancee.pointMin.valeur.toLocaleString("fr-FR")}</strong> ({libellePeriode(analyseAvancee.pointMin.periode)}) et{" "}
                        <strong>{analyseAvancee.pointMax.valeur.toLocaleString("fr-FR")}</strong> ({libellePeriode(analyseAvancee.pointMax.periode)}).
                      </p>
                      <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        La fourchette ne vient pas de ces extrêmes, mais de l&apos;écart entre le modèle et ce qui s&apos;est réellement passé{erreurTypique !== null ? ` : en moyenne, le modèle s'est écarté de ${erreurTypique.toLocaleString("fr-FR")} par période` : ""} (R² = {sourceActive.metriques.r2}). Plus la période prévue est lointaine, plus la fourchette s&apos;élargit.
                      </p>
                    </div>
                  </div>
                )}

                {ongletExplication === "guide" && (
                  <div className="space-y-4">
                    {alerteMetier && (
                      <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                        <div className="flex items-center gap-2 font-bold">
                          <ShieldAlert className="w-4 h-4 text-amber-600" />
                          <span>Attention à l&apos;interprétation de cette grandeur</span>
                        </div>
                        <p className="leading-relaxed">{alerteMetier}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Target className="w-4 h-4 text-purple-600" />
                            Seuil de vigilance pour {libellePeriode(calculsDecisionnels.prochainMois.periode)}
                          </span>
                          <span className="text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 px-2 py-0.5 rounded-full">
                            Prochaine période
                          </span>
                        </div>
                        <p className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono">
                          &lt; {calculsDecisionnels.seuilAlerteJ30.toLocaleString("fr-FR")}
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                          La valeur prévue pour la prochaine période est de <strong>{calculsDecisionnels.prochainMois.valeurPrevue.toLocaleString("fr-FR")}</strong>. Si la valeur réelle passe sous{" "}
                          <strong>{calculsDecisionnels.seuilAlerteJ30.toLocaleString("fr-FR")}</strong>, elle s&apos;écarte nettement de la prévision (près de la moitié du chemin vers la borne basse) : la tendance utilisée ne tient plus, et la projection doit être recalculée avec les nouvelles données.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4 text-emerald-600" />
                            Tendance de fond
                          </span>
                          <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                            Rythme constaté
                          </span>
                        </div>
                        <p className="text-xl font-black text-slate-900 dark:text-white font-mono">
                          {rythmeFond >= 0 ? "+" : ""}
                          {rythmeFond.toLocaleString("fr-FR")} / période
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                          {cycleAnnuel ? "Une fois le cycle annuel mis de côté, la" : "La"} série évolue en moyenne de cette valeur d&apos;une période à la suivante. C&apos;est une tendance constatée dans les données, pas un objectif à atteindre.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <ShieldAlert className="w-4 h-4 text-amber-600" />
                            Valeur prudente pour planifier
                          </span>
                          <span className="text-[10px] font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 px-2 py-0.5 rounded-full">
                            Hypothèse basse
                          </span>
                        </div>
                        <p className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono">
                          {calculsDecisionnels.plafondEngagement.toLocaleString("fr-FR")}
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                          Valeur située entre la borne basse et la projection centrale de {libellePeriode(calculsDecisionnels.cibleFinale.periode)}. Pour dimensionner un budget, un stock ou un effectif, elle laisse une marge si la réalité est moins bonne que prévu (fiabilité {sourceActive.metriques.fiabilite.toLowerCase()}).
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Activity className="w-4 h-4 text-cyan-600" />
                            Plus forte baisse d&apos;une période à l&apos;autre
                          </span>
                          <span className="text-[10px] font-bold bg-cyan-50 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300 px-2 py-0.5 rounded-full">
                            Historique
                          </span>
                        </div>
                        <p className="text-xl font-black text-cyan-600 dark:text-cyan-400 font-mono">
                          {calculsDecisionnels.pireChute > 0 ? `− ${calculsDecisionnels.pireChute.toLocaleString("fr-FR")}` : "Aucune baisse"}
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                          {calculsDecisionnels.pireChute > 0 ? `Observée entre ${libellePeriode(calculsDecisionnels.pireChuteDe)} et ${libellePeriode(calculsDecisionnels.pireChuteA)}. ${cycleAnnuel ? "Avec un cycle annuel, une telle baisse juste après un pic est attendue : elle est déjà intégrée aux projections." : "Une baisse de cet ordre s'est déjà produite : elle peut se reproduire."}` : "La série n'a jamais baissé d'une période à la suivante sur l'historique."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}