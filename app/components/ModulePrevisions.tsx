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
} from "lucide-react";
import {
  agregerSerieGenerique,
  calculerPrevisionGenerale,
  type TypeAgregationTemporelle,
} from "@/lib/analyse/prevision";
import { parseNombre, type Cellule } from "@/lib/analyse/utils";

interface ModulePrevisionsProps {
  entetes: string[];
  corps: Cellule[][];
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

export default function ModulePrevisions({ entetes, corps }: ModulePrevisionsProps) {
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

  // 2. Détection des colonnes disponibles (hors "Fichier Source")
  const colonnesDisponibles = useMemo(() => {
    const temporelles: string[] = [];
    const mesurables: string[] = [];

    entetes.forEach((nom, colIdx) => {
      if (nom === "Fichier Source") return;

      const nonVides = corps
        .map((ligne) => ligne[colIdx])
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== "");

      if (nonVides.length === 0) return;

      const nbDates = nonVides.filter((v) => {
        const str = String(v).trim();
        return (/[\/-]|T/.test(str) && !Number.isNaN(Date.parse(str))) || /^(19|20)\d{2}$/.test(str);
      }).length;

      const nbNombres = nonVides.filter((v) => parseNombre(v) !== null).length;

      if (nbDates / nonVides.length >= 0.5) temporelles.push(nom);
      if (nbNombres / nonVides.length >= 0.6) mesurables.push(nom);
    });

    return { temporelles, mesurables };
  }, [entetes, corps]);

  const [colonneTemps, setColonneTemps] = useState<string>(colonnesDisponibles.temporelles[0] || "");
  const [colonneMesure, setColonneMesure] = useState<string>(colonnesDisponibles.mesurables[0] || "");
  const [modeAgregation, setModeAgregation] = useState<TypeAgregationTemporelle>("somme");
  const [horizon, setHorizon] = useState<number>(3);
  const [ongletExplication, setOngletExplication] = useState<"scenarios" | "calendrier" | "historique" | "guide">("scenarios");

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
      return `Vous appliquez une « Somme cumulée » sur une variable unitaire (${colonneMesure}). Si vous cherchez le niveau moyen constaté, privilégiez le mode « Moyenne de la période ».`;
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
        actionConseillee: "Une colonne de date (ex: 2024-01-15, 2023...) est indispensable pour ordonner la série temporelle.",
      };
    }

    if (!colonnesDisponibles.mesurables.length) {
      return {
        possible: false as const,
        code: "PAS_DE_MESURE" as const,
        titre: "Aucune mesure chiffrée à projeter",
        explication: "Toutes les colonnes actuelles sont de nature textuelle.",
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

  // Analyse rétrospective avancée (Actif pour 1 fichier ET pour N fichiers)
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
    const volatilitePct = moyenneHist > 0 ? Math.round((ecartType / moyenneHist) * 100) : 0;

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

  // Moteur de calcul des recommandations opérationnelles chiffrées (Actif pour 1 fichier ET pour N fichiers)
  const calculsDecisionnels = useMemo(() => {
    if (!sourceActive || sourceActive.historique.length === 0 || sourceActive.projections.length === 0) return null;
    const hist = sourceActive.historique;
    const proj = sourceActive.projections;

    const dernierReelVal = hist[hist.length - 1].valeur;
    const cibleFinale = proj[proj.length - 1];
    const prochainMois = proj[0];

    const deltaTotal = cibleFinale.valeurPrevue - dernierReelVal;
    const effortMensuelMoyen = Math.round((deltaTotal / proj.length) * 100) / 100;

    const seuilAlerteJ30 = Math.round(
      prochainMois.valeurPrevue - (prochainMois.valeurPrevue - prochainMois.borneBasse) * 0.4
    );

    let pireChute = 0;
    for (let i = 1; i < hist.length; i++) {
      const chute = hist[i - 1].valeur - hist[i].valeur;
      if (chute > pireChute) pireChute = chute;
    }

    const plafondEngagement = Math.round(
      cibleFinale.borneBasse + (cibleFinale.valeurPrevue - cibleFinale.borneBasse) * 0.25
    );

    return {
      effortMensuelMoyen,
      seuilAlerteJ30,
      pireChute: Math.round(pireChute),
      plafondEngagement,
      prochainMois,
      cibleFinale,
      dernierReelVal,
    };
  }, [sourceActive]);

  if (!estBenchmarkActif && diagnosticOuResultat && !diagnosticOuResultat.possible) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="w-3 h-3 rounded-full bg-slate-400"></div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Prévisions & Projections</h3>
          <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium">
            Non disponible
          </span>
        </div>
        <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-4 text-xs space-y-1.5">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold">
            <Info className="w-4 h-4 shrink-0" />
            <span>{diagnosticOuResultat.titre}</span>
          </div>
          <p className="text-amber-700/90 dark:text-amber-400">{diagnosticOuResultat.explication}</p>
          <p className="text-slate-500 dark:text-slate-400 pt-1 border-t border-amber-200/50 dark:border-amber-900/40">
            <strong>Conseil :</strong> {diagnosticOuResultat.actionConseillee}
          </p>
        </div>
      </div>
    );
  }

  // Préparation du dataset Chart.js
  let chartData: { labels: string[]; datasets: any[] } = { labels: [], datasets: [] };

  if (estBenchmarkActif && calculsComparatifs && calculsComparatifs.possible) {
    const { sources } = calculsComparatifs;
    const premiere = sources[0];
    const labelsHisto = premiere.historique.map((p) => p.periode);
    const labelsProj = premiere.projections.map((p) => p.periode);
    const tousLabels = [...labelsHisto, ...labelsProj];
    const nbHisto = labelsHisto.length;

    const datasets: any[] = [];

    sources.forEach((s, idx) => {
      const palette = PALETTE_COMPARAISON[idx % PALETTE_COMPARAISON.length];
      const estRef = s.nomSrc === refSource;

      // Courbe historique réalisé
      datasets.push({
        label: `${s.nomSrc} (Réalisé)`,
        data: [...s.historique.map((p) => p.valeur), ...Array(labelsProj.length).fill(null)],
        borderColor: palette.reel,
        backgroundColor: palette.reel,
        borderWidth: estRef ? 3 : 2,
        tension: 0.2,
        pointRadius: estRef ? 4 : 3,
      });

      // Projection estimée
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
    const labels = [...res.historique.map((p) => p.periode), ...res.projections.map((p) => p.periode)];
    const dernierReel = res.historique[res.historique.length - 1].valeur;

    chartData = {
      labels,
      datasets: [
        {
          label: "Données observées",
          data: [...res.historique.map((p) => p.valeur), ...Array(res.projections.length).fill(null)],
          borderColor: "#8b5cf6",
          backgroundColor: "#8b5cf6",
          borderWidth: 3,
          tension: 0.2,
          pointRadius: 4,
        },
        {
          label: "Projection estimée",
          data: [...Array(res.historique.length - 1).fill(null), dernierReel, ...res.projections.map((p) => p.valeurPrevue)],
          borderColor: "#0284c7",
          borderDash: [5, 5],
          borderWidth: 2.5,
          tension: 0.2,
          pointRadius: 4,
          pointBackgroundColor: "#0284c7",
        },
        {
          label: "Intervalle de confiance (95%)",
          data: [...Array(res.historique.length - 1).fill(null), dernierReel, ...res.projections.map((p) => p.borneHaute)],
          borderColor: "transparent",
          backgroundColor: "rgba(2, 132, 199, 0.12)",
          fill: "+1",
          pointRadius: 0,
        },
        {
          label: "Borne basse",
          data: [...Array(res.historique.length - 1).fill(null), dernierReel, ...res.projections.map((p) => p.borneBasse)],
          borderColor: "transparent",
          backgroundColor: "transparent",
          pointRadius: 0,
        },
      ],
    };
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          filter: (item: any) => !item.text.includes("Borne basse"),
          usePointStyle: true,
          boxWidth: 8,
          font: { size: 11 },
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const v = context.parsed.y;
            return v !== null ? `${context.dataset.label} : ${v.toLocaleString("fr-FR")}` : "";
          },
        },
      },
    },
    scales: {
      y: {
        grid: { color: "rgba(148, 163, 184, 0.15)" },
        ticks: { font: { size: 10 } },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 } },
      },
    },
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-cyan-600"></div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {estBenchmarkActif
              ? `Confrontation Prévisionnelle & Projections (${sourcesFichiers.length} fichiers)`
              : "Prévisions & Projections Statistiques"}
          </h3>
        </div>

        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {alerteMetier && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-200">
          <Lightbulb className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{alerteMetier}</p>
        </div>
      )}

      {/* Paramétrage */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl text-xs">
        <div>
          <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Axe temporel / Séquence</label>
          <select
            value={colonneTemps}
            onChange={(e) => setColonneTemps(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-medium"
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
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-medium"
          >
            {colonnesDisponibles.mesurables.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Calcul par période</label>
          <select
            value={modeAgregation}
            onChange={(e) => setModeAgregation(e.target.value as TypeAgregationTemporelle)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-medium"
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
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-medium"
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
            Le tableau comparatif et les 4 onglets d&apos;explication ci-dessous se synchronisent sur cette série.
          </span>
        </div>
      )}

      {/* Graphique */}
      <div className="h-80 w-full p-2 bg-gradient-to-b from-slate-50/50 to-white dark:from-slate-800/30 dark:to-slate-900 rounded-xl">
        <Line data={chartData} options={options} />
      </div>

      {/* ============================================================
          SECTION BENCHMARK COMPARATIF (N SOURCES)
         ============================================================ */}
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
                  const pctVsRef = refCible > 0 ? Math.round((deltaVsRef / refCible) * 1000) / 10 : 0;
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

      {/* ============================================================
          SECTION EXPLICATIVE APPROFONDIE (ACTIF EN BENCHMARK & UNIQUE)
         ============================================================ */}
      {sourceActive && analyseAvancee && calculsDecisionnels && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/40 dark:bg-slate-900/60">
          
          {/* Barre d'onglets */}
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
            {/* ONGLET 1 : LES 3 SCÉNARIOS CHIFFRÉS */}
            {ongletExplication === "scenarios" && (
              <div className="space-y-4">
                <p className="text-slate-600 dark:text-slate-400">
                  À l&apos;horizon <strong>{analyseAvancee.derniereProj.periode}</strong>
                  {estBenchmarkActif && (
                    <span> pour la série <strong>{sourceActive.nom}</strong></span>
                  )}
                  , voici les trois trajectoires envisageables pour arbitrer vos décisions :
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Scénario Prudent */}
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-amber-600" />
                        Scénario Prudent (Bas)
                      </span>
                      <span className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-0.5 rounded-full font-bold">
                        Plancher de sécurité
                      </span>
                    </div>
                    <div className="text-xl font-black text-slate-900 dark:text-white">
                      {analyseAvancee.derniereProj.borneBasse.toLocaleString("fr-FR")}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Le seuil minimal statistique si les aléas défavorables se cumulent. Utilisez ce montant pour sécuriser votre trésorerie ou calibrer un budget strict.
                    </p>
                  </div>

                  {/* Scénario Médian */}
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
                      L&apos;atterrissage le plus probable d&apos;après le prolongement mathématique de la tendance ({sourceActive.metriques.variationEstimeePct >= 0 ? "+" : ""}{sourceActive.metriques.variationEstimeePct} %). Votre repère d&apos;objectifs.
                    </p>
                  </div>

                  {/* Scénario Favorable */}
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Flame className="w-4 h-4 text-emerald-600" />
                        Scénario Favorable (Haut)
                      </span>
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                        Potentiel maximal
                      </span>
                    </div>
                    <div className="text-xl font-black text-slate-900 dark:text-white">
                      {analyseAvancee.derniereProj.borneHaute.toLocaleString("fr-FR")}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Le plafond envisageable si l&apos;activité connaît une dynamique particulièrement forte sans à-coups négatifs.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ONGLET 2 : DÉCOMPOSITION MOIS PAR MOIS */}
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
                              {p.periode} {idx === 0 && <span className="text-[10px] text-slate-400 font-normal">(prochain mois)</span>}
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

            {/* ONGLET 3 : DIAGNOSTIC DE L'HISTORIQUE PASSÉ */}
            {ongletExplication === "historique" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Creux historique le plus bas</span>
                    <strong className="text-rose-600 text-sm">{analyseAvancee.pointMin.periode}</strong>
                    <p className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {analyseAvancee.pointMin.valeur.toLocaleString("fr-FR")}
                    </p>
                  </div>

                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Pic historique le plus haut</span>
                    <strong className="text-emerald-600 text-sm">{analyseAvancee.pointMax.periode}</strong>
                    <p className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {analyseAvancee.pointMax.valeur.toLocaleString("fr-FR")}
                    </p>
                  </div>

                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Volatilité mensuelle constatée</span>
                    <strong className="text-purple-600 text-sm">± {analyseAvancee.volatilitePct} % de variation</strong>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Écart max/min de {analyseAvancee.ecartExtremes}×
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                  <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Pourquoi la fourchette est-elle aussi large ?
                  </h4>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    L&apos;historique de <strong>{sourceActive.nom}</strong> ne suit pas une ligne droite régulière : il a connu un creux prononcé en{" "}
                    <strong>{analyseAvancee.pointMin.periode}</strong> ({analyseAvancee.pointMin.valeur.toLocaleString("fr-FR")}) avant de rebondir en{" "}
                    <strong>{analyseAvancee.pointMax.periode}</strong> ({analyseAvancee.pointMax.valeur.toLocaleString("fr-FR")}).
                  </p>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    Le moteur statistique prend en compte cette forte fluctuation passée (R² = {sourceActive.metriques.r2}). Pour ne pas vous induire en erreur avec une certitude artificielle, il élargit automatiquement la zone d&apos;incertitude.
                  </p>
                </div>
              </div>
            )}

            {/* ONGLET 4 : RECOMMANDATIONS OPÉRATIONNELLES CHIFFRÉES */}
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
                  {/* 1. SEUIL D'ALERTE IMMÉDIAT (J+30) */}
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-purple-600" />
                        Seuil d&apos;invalidation à J+30 ({calculsDecisionnels.prochainMois.periode})
                      </span>
                      <span className="text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 px-2 py-0.5 rounded-full">
                        Contrôle immédiat
                      </span>
                    </div>
                    <p className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono">
                      &lt; {calculsDecisionnels.seuilAlerteJ30.toLocaleString("fr-FR")}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      La cible prévue pour le mois prochain sur <strong>{sourceActive.nom}</strong> est de <strong>{calculsDecisionnels.prochainMois.valeurPrevue.toLocaleString("fr-FR")}</strong>. 
                      Si vous clôturez le mois prochain en dessous de <strong>{calculsDecisionnels.seuilAlerteJ30.toLocaleString("fr-FR")}</strong>, la dynamique haussière est compromise : réajustez immédiatement vos objectifs sans attendre la fin du trimestre.
                    </p>
                  </div>

                  {/* 2. CADENCE OPÉRATIONNELLE REQUISE */}
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        Cadence mensuelle requise
                      </span>
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                        Plan d&apos;action
                      </span>
                    </div>
                    <p className="text-xl font-black text-slate-900 dark:text-white font-mono">
                      {calculsDecisionnels.effortMensuelMoyen >= 0 ? "+" : ""}
                      {calculsDecisionnels.effortMensuelMoyen.toLocaleString("fr-FR")} / mois
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      Pour passer du niveau actuel ({calculsDecisionnels.dernierReelVal.toLocaleString("fr-FR")}) à la cible finale de {calculsDecisionnels.cibleFinale.valeurPrevue.toLocaleString("fr-FR")} en {calculsDecisionnels.cibleFinale.periode}, l&apos;activité de {sourceActive.nom} doit générer cette progression nette régulière chaque mois.
                    </p>
                  </div>

                  {/* 3. DIMENSIONNEMENT DES COÛTS & CAPACITÉS */}
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-amber-600" />
                        Plafond d&apos;engagement sécurisé
                      </span>
                      <span className="text-[10px] font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 px-2 py-0.5 rounded-full">
                        Trésorerie / Achats
                      </span>
                    </div>
                    <p className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono">
                      {calculsDecisionnels.plafondEngagement.toLocaleString("fr-FR")} max
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      En raison de l&apos;incertitude constatée ({sourceActive.metriques.fiabilite.toLowerCase()}), ne calibrez pas vos charges fixes ou vos commandes fermes sur la cible de {calculsDecisionnels.cibleFinale.valeurPrevue.toLocaleString("fr-FR")}. Engagez au maximum ce montant pour préserver vos marges en cas de retournement.
                    </p>
                  </div>

                  {/* 4. PROVISION SUR CHOC PASSÉ */}
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-cyan-600" />
                        Coussin d&apos;accident historique
                      </span>
                      <span className="text-[10px] font-bold bg-cyan-50 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300 px-2 py-0.5 rounded-full">
                        Risque de creux
                      </span>
                    </div>
                    <p className="text-xl font-black text-cyan-600 dark:text-cyan-400 font-mono">
                      {calculsDecisionnels.pireChute > 0 ? `${calculsDecisionnels.pireChute.toLocaleString("fr-FR")} de réserve` : "Faible amplitude"}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      La plus forte chute mensuelle observée dans l&apos;historique de {sourceActive.nom} a atteint <strong>{calculsDecisionnels.pireChute.toLocaleString("fr-FR")}</strong>. C&apos;est le montant exact de réserve à conserver pour continuer d&apos;opérer sans stress si un creux similaire venait à se reproduire.
                    </p>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}