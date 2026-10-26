"use client";

import { useMemo, useState, type ReactNode } from "react";
import ModulePrevisions from "../components/ModulePrevisions";
import { Presentation } from "lucide-react";
import { exporterRapportPowerPoint } from "../../lib/analyse/exportPptx";
import {
  ChevronDown,
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  Layers,
  Database,
  PieChart,
  Scale,
  Lightbulb,
} from "lucide-react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { useData } from "../context/DataContext";
import GraphiqueGenerateur from "../components/GraphiqueGenerateur";
import CarteGeographique from "../components/CarteGeographique";
import TableauCroiseDynamique from "../components/TableauCroiseDynamique";
import BarreOutilsDonnees from "../components/BarreOutilsDonnees";
import { parseNombre, estValeurVide, arrondir, type Cellule } from "../../lib/analyse/utils";
import { analyserColonnes } from "../../lib/analyse/analyse";

interface Cat {
  total: number;
  nbCategoriesDistinctes: number;
  topValeurs: { valeur: string; effectif: number; pourcentage: number }[];
}
interface Num {
  n: number;
  moyenne: number | null;
  mediane: number | null;
  min: number | null;
  max: number | null;
  atypiques: number;
}
interface Boo {
  vrai: number;
  faux: number;
}
interface Dat {
  n: number;
  min: string | null;
  max: string | null;
}
interface Ident {
  distincts: number;
  unicite: number;
}

const carteStyle =
  "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm";
const fmt = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : v.toLocaleString("fr-FR");

function calculerPearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const moyX = x.reduce((a, b) => a + b, 0) / n;
  const moyY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - moyX;
    const dy = y[i] - moyY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denom = Math.sqrt(denX * denY);
  return denom === 0 ? 0 : Math.round((num / denom) * 100) / 100;
}

function calculerStatsComplet(nums: number[]) {
  if (!nums.length) {
    return { n: 0, moy: null, med: null, min: null, max: null, somme: 0, atypiques: 0 };
  }
  const tri = [...nums].sort((a, b) => a - b);
  const n = tri.length;
  const somme = tri.reduce((a, b) => a + b, 0);
  const moy = somme / n;
  const med = n % 2 === 1 ? tri[Math.floor(n / 2)] : (tri[n / 2 - 1] + tri[n / 2]) / 2;
  const min = tri[0];
  const max = tri[n - 1];

  const q1 = tri[Math.floor(n * 0.25)];
  const q3 = tri[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  const atypiques = iqr > 0 ? tri.filter((x) => x < q1 - 1.5 * iqr || x > q3 + 1.5 * iqr).length : 0;

  return {
    n,
    moy: arrondir(moy),
    med: arrondir(med),
    min: arrondir(min),
    max: arrondir(max),
    somme: arrondir(somme),
    atypiques,
  };
}

function expliquerCorrelationSimple(colA: string, colB: string, r: number): string {
  if (r >= 0.7) {
    return `Forte synergie directe : lorsque « ${colA} » augmente, « ${colB} » progresse presque systématiquement de façon proportionnelle.`;
  }
  if (r >= 0.3) {
    return `Liaison positive modérée : « ${colA} » et « ${colB} » ont tendance à évoluer dans la même direction, avec de légères variations.`;
  }
  if (r > -0.3) {
    return `Indépendance statistique : les variations de « ${colA} » n'ont pas d'impact linéaire perceptible sur « ${colB} ».`;
  }
  if (r > -0.7) {
    return `Liaison négative modérée : accorder ou observer une hausse de « ${colA} » s'accompagne généralement d'un recul de « ${colB} ».`;
  }
  return `Forte relation inverse : une progression de « ${colA} » entraîne une chute prononcée et systématique de « ${colB} ».`;
}

function expliquerEvolutionCorrelation(
  colA: string,
  colB: string,
  r1: number | null,
  r2: number | null,
  nom1: string,
  nom2: string
): { diagnostic: string; detail: string; alerte: boolean } {
  if (r1 === null || r2 === null) {
    return {
      diagnostic: "Données insuffisantes",
      detail: "Pas assez d'observations communes pour comparer les tendances.",
      alerte: false,
    };
  }

  const diff = Math.round((r2 - r1) * 100) / 100;

  if ((r1 < -0.15 && r2 > 0.15) || (r1 > 0.15 && r2 < -0.15)) {
    return {
      diagnostic: "Inversion complète de la dynamique",
      detail: `La relation s'est totalement inversée d'un fichier à l'autre. Dans ${nom1}, la liaison était ${r1 < 0 ? "négative" : "positive"} (${r1}), alors que dans ${nom2}, elle est devenue ${r2 > 0 ? "positive" : "négative"} (${r2 > 0 ? `+${r2}` : r2}). Ce facteur agit désormais en sens inverse.`,
      alerte: true,
    };
  }

  if (Math.abs(r1) >= 0.4 && Math.abs(r2) < 0.25) {
    return {
      diagnostic: "Découplage / Perte d'influence",
      detail: `Le lien marqué dans ${nom1} (${r1}) s'est effondré dans ${nom2} (${r2}). Les deux grandeurs sont devenues quasi-indépendantes l'une de l'autre.`,
      alerte: false,
    };
  }

  if (Math.abs(r2) - Math.abs(r1) >= 0.25) {
    return {
      diagnostic: "Intensification de la corrélation",
      detail: `Le lien s'est nettement raffermi dans ${nom2}. « ${colB} » est désormais beaucoup plus sensible et prévisible en fonction de « ${colA} ».`,
      alerte: false,
    };
  }

  if (Math.abs(diff) < 0.15) {
    return {
      diagnostic: "Comportement stable",
      detail: `La structure de dépendance entre « ${colA} » et « ${colB} » reste globalement inchangée entre vos deux fichiers (variation marginale de ${diff >= 0 ? `+${diff}` : diff}).`,
      alerte: false,
    };
  }

  if (diff > 0) {
    return {
      diagnostic: "Progression vers une corrélation positive",
      detail: `Le coefficient gagne +${diff} points dans ${nom2}, traduisant un effet d'entraînement plus favorable entre « ${colA} » et « ${colB} ».`,
      alerte: false,
    };
  }

  return {
    diagnostic: "Dégradation / Frein plus marqué",
    detail: `Le coefficient recule de ${diff} points dans ${nom2}, signalant un antagonisme plus fort entre ces deux variables.`,
    alerte: false,
  };
}

export default function AnalysePage() {
  const {
    nomFichier,
    entetes,
    corps,
    resultat,
    rapport,
    graphiquesEpingles,
    epinglerGraphique,
  } = useData();

  const resultatActif = useMemo(() => {
    if (resultat && resultat.statistiques) return resultat;
    if (entetes.length > 0 && corps.length > 0) {
      return analyserColonnes(entetes, corps, entetes);
    }
    return null;
  }, [resultat, entetes, corps]);

  const rapportActif = useMemo(() => {
    if (Array.isArray(rapport) && rapport.length > 0) return rapport;
    if (!resultatActif) return [];
    return Object.entries(resultatActif.statistiques)
      .filter(([h]) => h !== "Fichier Source")
      .slice(0, 8)
      .map(([col, info]: [string, any]) => ({
        type: info.type === "numerique" ? "numerique" : "categorie",
        texte: `Indicateur « ${col} » : profilé avec succès (${info.type}).`,
      }));
  }, [rapport, resultatActif]);

  const estModeComparaison = entetes.includes("Fichier Source");
  const idxSource = entetes.indexOf("Fichier Source");

  const sourcesFichiers = useMemo(() => {
    if (!estModeComparaison || idxSource === -1) return [];
    return Array.from(new Set(corps.map((l) => String(l[idxSource] ?? "").trim()).filter(Boolean)));
  }, [estModeComparaison, idxSource, corps]);

  const estBenchmarkActif = estModeComparaison && sourcesFichiers.length >= 2;

  const [sourceRefChoisie, setSourceRefChoisie] = useState<string>("");
  const [exportEnCours, setExportEnCours] = useState(false);
  const refSource = sourcesFichiers.includes(sourceRefChoisie)
    ? sourceRefChoisie
    : sourcesFichiers[0] || "";

  const autresSources = useMemo(() => {
    return sourcesFichiers.filter((s) => s !== refSource);
  }, [sourcesFichiers, refSource]);

  const noms = useMemo(() => {
    if (!resultatActif?.statistiques) return [];
    return Object.keys(resultatActif.statistiques).filter((h) => h !== "Fichier Source");
  }, [resultatActif]);

  const corpsParSource = useMemo(() => {
    const map = new Map<string, Cellule[][]>();
    sourcesFichiers.forEach((src) => {
      map.set(src, corps.filter((l) => String(l[idxSource] ?? "").trim() === src));
    });
    return map;
  }, [sourcesFichiers, corps, idxSource]);

  const colonnesNumeriques = useMemo(() => {
    return noms.filter((nom) => {
      const idx = entetes.indexOf(nom);
      const nums = corps.map((l) => parseNombre(l[idx])).filter((n): n is number => n !== null);
      return nums.length >= 2;
    });
  }, [noms, entetes, corps]);

  const statsGlobalesMulti = useMemo(() => {
    if (!estBenchmarkActif) return null;

    const resumeSources = sourcesFichiers.map((src) => {
      const lignesSrc = corpsParSource.get(src) || [];
      let vides = 0;
      lignesSrc.forEach((ligne) => {
        noms.forEach((col) => {
          const i = entetes.indexOf(col);
          if (i !== -1 && estValeurVide(ligne[i])) vides++;
        });
      });
      const totalCell = lignesSrc.length * noms.length || 1;
      const completude = Math.round(((totalCell - vides) / totalCell) * 100);

      return {
        nom: src,
        nbLignes: lignesSrc.length,
        completude,
      };
    });

    const refInfo = resumeSources.find((s) => s.nom === refSource) || resumeSources[0];

    return {
      totalSources: sourcesFichiers.length,
      resumeSources,
      refInfo,
    };
  }, [estBenchmarkActif, sourcesFichiers, corpsParSource, noms, entetes, refSource]);

  const syntheseComparativeCards = useMemo(() => {
    if (!estBenchmarkActif || !statsGlobalesMulti) return [];

    const cartes: { type: "numerique" | "categorie" | "qualite"; titre: string; detail: string; deltaBadge?: string; estHausse?: boolean }[] = [];

    if (sourcesFichiers.length === 2) {
      const s1 = sourcesFichiers[0];
      const s2 = sourcesFichiers[1];
      const l1 = corpsParSource.get(s1)?.length || 0;
      const l2 = corpsParSource.get(s2)?.length || 0;
      const delta = l2 - l1;
      const pct = l1 > 0 ? Math.round((delta / l1) * 1000) / 10 : 0;
      cartes.push({
        type: "qualite",
        titre: "Écart de volumétrie",
        detail: `${s2} compte ${l2} lignes contre ${l1} dans ${s1} (${delta >= 0 ? "+" : ""}${pct} %).`,
        deltaBadge: `${delta >= 0 ? "+" : ""}${delta} lignes`,
        estHausse: delta >= 0,
      });
    } else {
      const plusGros = [...statsGlobalesMulti.resumeSources].sort((a, b) => b.nbLignes - a.nbLignes)[0];
      const plusPetit = [...statsGlobalesMulti.resumeSources].sort((a, b) => a.nbLignes - b.nbLignes)[0];
      cartes.push({
        type: "qualite",
        titre: `Volumétrie sur ${sourcesFichiers.length} fichiers`,
        detail: `Le fichier le plus volumineux est « ${plusGros.nom} » (${plusGros.nbLignes} lignes) contre « ${plusPetit.nom} » (${plusPetit.nbLignes} lignes). Référence fixée sur « ${refSource} » (${statsGlobalesMulti.refInfo.nbLignes} lignes).`,
        deltaBadge: `${sourcesFichiers.length} sources`,
        estHausse: true,
      });
    }

    colonnesNumeriques.forEach((nomCol) => {
      const idx = entetes.indexOf(nomCol);
      const perfParSource = sourcesFichiers.map((src) => {
        const lignes = corpsParSource.get(src) || [];
        const nums = lignes.map((l) => parseNombre(l[idx])).filter((n): n is number => n !== null);
        const sum = nums.reduce((a, b) => a + b, 0);
        const moy = nums.length ? sum / nums.length : 0;
        return { src, sum, moy, n: nums.length };
      });

      const leaderSomme = [...perfParSource].sort((a, b) => b.sum - a.sum)[0];
      const refData = perfParSource.find((p) => p.src === refSource) || perfParSource[0];

      if (leaderSomme && refData) {
        const deltaRefLeader = leaderSomme.sum - refData.sum;
        const pctDiff = refData.sum > 0 ? Math.round((deltaRefLeader / refData.sum) * 1000) / 10 : 0;

        cartes.push({
          type: "numerique",
          titre: `Volume total de ${nomCol}`,
          detail: `Dominé par ${leaderSomme.src} (${fmt(arrondir(leaderSomme.sum))}). Référence ${refSource} : ${fmt(arrondir(refData.sum))} (moyenne : ${fmt(arrondir(leaderSomme.moy))} vs ${fmt(arrondir(refData.moy))}).`,
          deltaBadge: leaderSomme.src === refSource ? "Réf en tête" : `+${pctDiff} % vs Réf`,
          estHausse: deltaRefLeader >= 0,
        });
      }
    });

    noms.filter((nom) => !colonnesNumeriques.includes(nom)).forEach((nomCol) => {
      const idx = entetes.indexOf(nomCol);
      const topParSource = sourcesFichiers.map((src) => {
        const lignes = corpsParSource.get(src) || [];
        const vals = lignes.map((l) => String(l[idx] ?? "").trim()).filter(Boolean);
        const freq: Record<string, number> = {};
        vals.forEach((v) => (freq[v] = (freq[v] || 0) + 1));
        const premier = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
        return {
          src,
          premierVal: premier ? premier[0] : "—",
          effectif: premier ? premier[1] : 0,
          pct: vals.length && premier ? Math.round((premier[1] / vals.length) * 100) : 0,
        };
      });

      const tousIdentiques = topParSource.every((t) => t.premierVal === topParSource[0].premierVal);

      cartes.push({
        type: "categorie",
        titre: `Dominance sur ${nomCol}`,
        detail: tousIdentiques
          ? `Convergence : « ${topParSource[0].premierVal} » arrive en tête dans l'ensemble des ${sourcesFichiers.length} fichiers.`
          : `Divergence constatée : ${topParSource.map((t) => `${t.src} : « ${t.premierVal} » (${t.pct} %)`).join(", ")}.`,
        deltaBadge: tousIdentiques ? "Unanime" : "Dispersion",
        estHausse: tousIdentiques,
      });
    });

    return cartes;
  }, [estBenchmarkActif, statsGlobalesMulti, sourcesFichiers, refSource, colonnesNumeriques, noms, entetes, corpsParSource]);

  const correlationsBenchmark = useMemo(() => {
    if (!estBenchmarkActif || colonnesNumeriques.length < 2) return [];

    const couples: {
      colA: string;
      colB: string;
      rRef: number | null;
      comparaisons: {
        source: string;
        r: number | null;
        diff: number;
        expl: ReturnType<typeof expliquerEvolutionCorrelation>;
      }[];
      maxDiffAbs: number;
    }[] = [];

    for (let i = 0; i < colonnesNumeriques.length; i++) {
      for (let j = i + 1; j < colonnesNumeriques.length; j++) {
        const colA = colonnesNumeriques[i];
        const colB = colonnesNumeriques[j];
        const idxA = entetes.indexOf(colA);
        const idxB = entetes.indexOf(colB);

        const lignesRef = corpsParSource.get(refSource) || [];
        const pairesRef = lignesRef
          .map((l) => [parseNombre(l[idxA]), parseNombre(l[idxB])])
          .filter((p): p is [number, number] => p[0] !== null && p[1] !== null);
        const rRef = calculerPearson(pairesRef.map((p) => p[0]), pairesRef.map((p) => p[1]));

        const comparaisons = autresSources.map((src) => {
          const lignesSrc = corpsParSource.get(src) || [];
          const pairesSrc = lignesSrc
            .map((l) => [parseNombre(l[idxA]), parseNombre(l[idxB])])
            .filter((p): p is [number, number] => p[0] !== null && p[1] !== null);
          const rSrc = calculerPearson(pairesSrc.map((p) => p[0]), pairesSrc.map((p) => p[1]));
          const diff = Math.round(((rSrc ?? 0) - (rRef ?? 0)) * 100) / 100;
          const expl = expliquerEvolutionCorrelation(colA, colB, rRef, rSrc, refSource, src);
          return { source: src, r: rSrc, diff, expl };
        });

        const maxDiffAbs = Math.max(...comparaisons.map((c) => Math.abs(c.diff)), 0);
        couples.push({ colA, colB, rRef, comparaisons, maxDiffAbs });
      }
    }

    return couples.sort((a, b) => b.maxDiffAbs - a.maxDiffAbs);
  }, [estBenchmarkActif, colonnesNumeriques, entetes, corpsParSource, refSource, autresSources]);

  const imprimerRapport = () => {
    document.querySelectorAll("details").forEach((el) => el.setAttribute("open", "true"));
    window.print();
  };

    const telechargerExcelPropre = async () => {
    if (!entetes.length || !corps.length || exportEnCours) return;
    setExportEnCours(true);
    await new Promise((r) => setTimeout(r, 50)); // laisse le navigateur afficher "Export en cours…"
    try {
      const feuille = XLSX.utils.aoa_to_sheet([entetes, ...corps], { dense: true });
      const classeur = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(classeur, feuille, "Données nettoyées");
      const nomBase = (nomFichier || "donnees").replace(/\.[^/.]+$/, "");
      XLSX.writeFile(classeur, `${nomBase}_analyse_datenza.xlsx`);
    } finally {
      setExportEnCours(false);
    }
  };

  const correlationsStandard = [...(resultatActif?.correlations ?? [])]
    .filter((c) => c.colonneA !== "Fichier Source" && c.colonneB !== "Fichier Source")
    .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16 text-slate-800 dark:text-slate-100 font-sans">
      
      {/* 1. BANDEAU DE PILOTAGE COBALT EXECUTIVE */}
      <section className="bg-slate-900 border border-slate-800 text-white rounded-3xl p-6 md:p-8 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-bold tracking-wide uppercase">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              {estBenchmarkActif
                ? `DATENZA · Benchmark Multi-Sources (${sourcesFichiers.length} fichiers)`
                : "DATENZA · Centre de pilotage & Analyse"}
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              {estBenchmarkActif ? "Tableau de Bord & Benchmark Comparatif" : "Tableau de bord & Rapport d'analyse"}
            </h1>
            <p className="text-xs md:text-sm text-slate-400 max-w-2xl leading-relaxed">
              {estBenchmarkActif
                ? "Confrontation directe des indicateurs clés, profils détaillés par fichier et analyse des dynamiques de séries."
                : "Vue synthétique, indicateurs clés de qualité et analyses détaillées de votre jeu de données."}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-slate-300">
              <span className="font-semibold text-white">
                {estBenchmarkActif ? "Fichiers confrontés :" : "Fichier actif :"}
              </span>
              {estBenchmarkActif ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {sourcesFichiers.map((src) => (
                    <span
                      key={src}
                      className={`px-2.5 py-1 rounded-lg border font-mono text-[11px] ${
                        src === refSource
                          ? "bg-blue-900/60 border-blue-500 text-blue-200 font-bold"
                          : "bg-slate-800 border-slate-700 text-slate-300"
                      }`}
                    >
                      {src} {src === refSource && "(Réf)"}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 text-blue-300 font-mono">
                  {nomFichier || "Données importées"}
                </span>
              )}
            </div>

            {/* Sélecteur de référence */}
            {estBenchmarkActif && (
              <div className="flex items-center gap-2 pt-2 text-xs">
                <span className="font-semibold text-slate-300">Référence étalon (Pivot) :</span>
                <select
                  value={refSource}
                  onChange={(e) => setSourceRefChoisie(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-blue-300 text-xs font-bold rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-blue-500"
                >
                  {sourcesFichiers.map((src) => (
                    <option key={src} value={src}>{src}</option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400">
                  ({autresSources.length} autre(s) fichier(s) jaugé(s) par rapport à cette base)
                </span>
              </div>
            )}
          </div>

          {/* Actions d'exportation */}
          <div className="flex flex-wrap items-center gap-3 print:hidden shrink-0">
            <button
              onClick={() => {
                exporterRapportPowerPoint({
                  nomProjet: nomFichier || "Analyse Datenza",
                  entetes: entetes,
                  corps: corps,
                  analyse: resultatActif,
                  rapport: rapportActif,
                  graphiquesEpingles: graphiquesEpingles || [],
                });
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
            >
              <Presentation className="w-4 h-4" />
              Exporter PowerPoint (.pptx)
            </button>

            <button
              onClick={imprimerRapport}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Exporter PDF
            </button>

                        <button
              onClick={telechargerExcelPropre}
              disabled={exportEnCours}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              {exportEnCours ? "Export en cours…" : "Télécharger Excel (.xlsx)"}
            </button>
          </div>
        </div>
      </section>

      {/* 2. CARTES D'INDICATEURS CLÉS (KPIs) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4">
        <div className={`${carteStyle} p-5 flex items-center justify-between`}>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {estBenchmarkActif ? "Volumétrie Totale" : "Lignes analysées"}
            </p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {fmt(corps.length)}
            </h3>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5 font-medium">
              {estBenchmarkActif ? (
                <span>
                  Réf {refSource} : <strong>{fmt(corpsParSource.get(refSource)?.length || 0)}</strong> lignes
                </span>
              ) : (
                "• Enregistrements du fichier"
              )}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            {estBenchmarkActif ? <Scale className="w-6 h-6" /> : <Database className="w-6 h-6" />}
          </div>
        </div>

        <div className={`${carteStyle} p-5 flex items-center justify-between`}>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Colonnes Communes</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {noms.length}
            </h3>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5 font-medium">
              {estBenchmarkActif ? "• 100 % alignées" : "• Variables exploitables"}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className={`${carteStyle} p-5 flex items-center justify-between`}>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {estBenchmarkActif ? "Sources Confrontées" : "Visualisations"}
            </p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {estBenchmarkActif ? `${sourcesFichiers.length} fichiers` : graphiquesEpingles.length}
            </h3>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5 font-medium">
              {estBenchmarkActif ? "• Séries synchronisées" : "• Graphiques épinglés"}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            <BarChart3 className="w-6 h-6" />
          </div>
        </div>

        <div className={`${carteStyle} p-5 flex items-center justify-between`}>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Complétude Moyenne</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {statsGlobalesMulti
                ? `${Math.round(statsGlobalesMulti.resumeSources.reduce((a, b) => a + b.completude, 0) / (sourcesFichiers.length || 1))} %`
                : "100 %"}
            </h3>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">
              {estBenchmarkActif ? (
                <span>Réf {refSource} : {statsGlobalesMulti?.refInfo.completude} %</span>
              ) : (
                "• Données prêtes pour l'audit"
              )}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </section>

      {/* 3. BARRE D'OUTILS */}
      <div className="print:hidden">
        <BarreOutilsDonnees />
      </div>

      {/* 4. DÉPLIANT 1 : SYNTHÈSE EXÉCUTIVE */}
      <Depliant
        titre={estBenchmarkActif ? `Synthèse exécutive du Benchmark (${sourcesFichiers.length} fichiers)` : "Synthèse exécutive & Faits marquants"}
        detail={estBenchmarkActif ? `${syntheseComparativeCards.length} constats multi-sources` : `${rapportActif.length} points clés identifiés`}
        parDefautOuvert={true}
      >
        <div className="space-y-5">
          {estBenchmarkActif && (
            <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-950 dark:text-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-bold text-sm text-blue-900 dark:text-blue-100 flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-blue-600" />
                  Confrontation multi-sources · Référence pivot : {refSource}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Les indicateurs ci-dessous mesurent directement les écarts constatés entre vos {sourcesFichiers.length} fichiers importés.
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-block px-3 py-1 rounded-full font-bold text-xs bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200">
                  {fmt(corps.length)} lignes au total
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {estBenchmarkActif
              ? syntheseComparativeCards.map((c, i) => (
                  <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800">
                          {c.type === "numerique" && <BarChart3 className="w-4 h-4 text-blue-600" />}
                          {c.type === "categorie" && <PieChart className="w-4 h-4 text-slate-600" />}
                          {c.type === "qualite" && <Scale className="w-4 h-4 text-emerald-600" />}
                        </div>
                        {c.deltaBadge && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.estHausse ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"}`}>
                            {c.deltaBadge}
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-1">{c.titre}</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{c.detail}</p>
                    </div>
                  </div>
                ))
              : rapportActif
                  .filter((bloc) => !bloc.texte.includes("Fichier Source"))
                  .map((bloc, index) => (
                    <CarteSyntheseItem key={index} bloc={bloc} index={index} />
                  ))}
          </div>
        </div>
      </Depliant>

      {/* DÉPLIANT 2 : STATISTIQUES DÉTAILLÉES PAR COLONNE */}
      <Depliant
        titre={estBenchmarkActif ? `Statistiques détaillées par colonne (vs ${refSource})` : "Statistiques détaillées par colonne"}
        detail={`${noms.length} colonnes profilées`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {noms.map((nom) => {
            const info = resultatActif?.statistiques?.[nom];
            if (!info) return null;
            const s = info.stats;
            const colIdx = entetes.indexOf(nom);

            if (estBenchmarkActif && colIdx !== -1) {
              const estNum = info.type === "numerique";
              const lignesRef = corpsParSource.get(refSource) || [];
              const valsRef = lignesRef.map((l) => l[colIdx]).filter((v) => !estValeurVide(v));
              const completudeRef = lignesRef.length ? Math.round((valsRef.length / lignesRef.length) * 100) : 0;

              if (estNum) {
                const numsRef = valsRef.map(parseNombre).filter((n): n is number => n !== null);
                const statsRef = calculerStatsComplet(numsRef);

                return (
                  <div key={nom} className={`${carteStyle} p-4 space-y-3`}>
                    <div className="flex justify-between items-center gap-2 border-b pb-2 border-slate-100 dark:border-slate-800">
                      <span className="font-bold text-sm truncate text-slate-900 dark:text-slate-100">{nom}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 px-2 py-0.5 rounded-md whitespace-nowrap">
                        Numérique
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-800/40 text-xs space-y-1">
                      <div className="flex justify-between font-bold text-blue-900 dark:text-blue-200 pb-1 border-b border-blue-200/40">
                        <span>Référence : {refSource}</span>
                        <span className="font-mono">{fmt(statsRef.moy)} (Moy)</span>
                      </div>
                      <Ligne l="Médiane" v={fmt(statsRef.med)} />
                      <Ligne l="Min / Max" v={`${fmt(statsRef.min)} / ${fmt(statsRef.max)}`} />
                      <Ligne l="Somme cumulée" v={fmt(statsRef.somme)} />
                      {statsRef.atypiques > 0 && <Ligne l="Valeurs atypiques" v={fmt(statsRef.atypiques)} fort />}
                      <Ligne l="Complétude" v={`${completudeRef} %`} />
                    </div>

                    <div className="space-y-2.5 text-xs">
                      {autresSources.map((src) => {
                        const lignesSrc = corpsParSource.get(src) || [];
                        const valsSrc = lignesSrc.map((l) => l[colIdx]).filter((v) => !estValeurVide(v));
                        const numsSrc = valsSrc.map(parseNombre).filter((n): n is number => n !== null);
                        const statsSrc = calculerStatsComplet(numsSrc);

                        const deltaMoy = statsSrc.moy !== null && statsRef.moy !== null ? arrondir(statsSrc.moy - statsRef.moy) : 0;
                        const pctMoy = statsRef.moy && statsRef.moy > 0 ? Math.round((deltaMoy / statsRef.moy) * 1000) / 10 : 0;
                        const deltaSomme = arrondir(statsSrc.somme - statsRef.somme);
                        const pctSomme = statsRef.somme > 0 ? Math.round((deltaSomme / statsRef.somme) * 1000) / 10 : 0;
                        const completudeSrc = lignesSrc.length ? Math.round((valsSrc.length / lignesSrc.length) * 100) : 0;

                        return (
                          <div key={src} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                            <div className="flex justify-between items-center font-bold text-slate-800 dark:text-slate-200 pb-1 border-b border-slate-200/40 dark:border-slate-700/40">
                              <span className="truncate max-w-[140px]">{src}</span>
                              <span className={deltaMoy >= 0 ? "text-emerald-600 font-mono text-[11px]" : "text-rose-600 font-mono text-[11px]"}>
                                {fmt(statsSrc.moy)} ({deltaMoy >= 0 ? "+" : ""}{pctMoy} %)
                              </span>
                            </div>
                            <Ligne l="Médiane" v={fmt(statsSrc.med)} />
                            <Ligne l="Min / Max" v={`${fmt(statsSrc.min)} / ${fmt(statsSrc.max)}`} />
                            <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400">
                              <span>Somme</span>
                              <span className="font-mono font-semibold">
                                {fmt(statsSrc.somme)} <span className={deltaSomme >= 0 ? "text-emerald-600" : "text-rose-600"}>({deltaSomme >= 0 ? "+" : ""}{pctSomme} %)</span>
                              </span>
                            </div>
                            {statsSrc.atypiques > 0 && <Ligne l="Valeurs atypiques" v={fmt(statsSrc.atypiques)} fort />}
                            <Ligne l="Complétude" v={`${completudeSrc} %`} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              const freqRef: Record<string, number> = {};
              valsRef.forEach((v) => (freqRef[String(v).trim()] = (freqRef[String(v).trim()] || 0) + 1));
              const topRef = Object.entries(freqRef).sort((a, b) => b[1] - a[1])[0];
              const setRef = new Set(valsRef.map((v) => String(v).trim()));

              return (
                <div key={nom} className={`${carteStyle} p-4 space-y-3`}>
                  <div className="flex justify-between items-center gap-2 border-b pb-2 border-slate-100 dark:border-slate-800">
                    <span className="font-bold text-sm truncate text-slate-900 dark:text-slate-100">{nom}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded-md whitespace-nowrap">
                      {info.type}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/40 text-xs space-y-1">
                    <div className="flex justify-between font-bold text-slate-900 dark:text-slate-200 pb-1 border-b border-slate-200/40">
                      <span>Référence : {refSource}</span>
                      <span>{setRef.size} modalité(s)</span>
                    </div>
                    {topRef && (
                      <Ligne
                        l="Dominant"
                        v={`${topRef[0]} (${Math.round((topRef[1] / (valsRef.length || 1)) * 100)} %)`}
                        fort
                      />
                    )}
                    <Ligne l="Complétude" v={`${completudeRef} %`} />
                  </div>

                  <div className="space-y-2 text-xs">
                    {autresSources.map((src) => {
                      const lignesSrc = corpsParSource.get(src) || [];
                      const valsSrc = lignesSrc.map((l) => l[colIdx]).filter((v) => !estValeurVide(v));
                      const setSrc = new Set(valsSrc.map((v) => String(v).trim()));

                      let nouveaux = 0;
                      setSrc.forEach((val) => {
                        if (!setRef.has(val)) nouveaux++;
                      });

                      const freqSrc: Record<string, number> = {};
                      valsSrc.forEach((v) => (freqSrc[String(v).trim()] = (freqSrc[String(v).trim()] || 0) + 1));
                      const topSrc = Object.entries(freqSrc).sort((a, b) => b[1] - a[1])[0];
                      const completudeSrc = lignesSrc.length ? Math.round((valsSrc.length / lignesSrc.length) * 100) : 0;

                      return (
                        <div key={src} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                          <div className="flex justify-between items-center font-bold text-slate-800 dark:text-slate-200 pb-1 border-b border-slate-200/40">
                            <span className="truncate max-w-[140px]">{src}</span>
                            <span>{setSrc.size} cat.</span>
                          </div>
                          {topSrc && (
                            <Ligne
                              l="Dominant"
                              v={`${topSrc[0]} (${Math.round((topSrc[1] / (valsSrc.length || 1)) * 100)} %)`}
                            />
                          )}
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-500">Nouvelles modalités</span>
                            <span className={`font-bold ${nouveaux > 0 ? "text-blue-600" : "text-slate-400"}`}>
                              {nouveaux > 0 ? `+${nouveaux} apparue(s)` : "Identiques"}
                            </span>
                          </div>
                          <Ligne l="Complétude" v={`${completudeSrc} %`} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <div key={nom} className={`${carteStyle} p-4 space-y-2.5`}>
                <div className="flex justify-between items-center gap-2 border-b pb-2 border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-sm truncate text-slate-900 dark:text-slate-100">{nom}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 px-2 py-0.5 rounded-md whitespace-nowrap">
                    {info.type}
                  </span>
                </div>
                <div className="text-xs space-y-1.5 pt-1">
                  {info.type === "numerique" && (() => {
                    const n = s as unknown as Num;
                    return (
                      <>
                        <Ligne l="Moyenne" v={fmt(n.moyenne)} />
                        <Ligne l="Médiane" v={fmt(n.mediane)} />
                        <Ligne l="Min / Max" v={`${fmt(n.min)} / ${fmt(n.max)}`} />
                        {n.atypiques > 0 && <Ligne l="Valeurs atypiques" v={fmt(n.atypiques)} fort />}
                        {info.tendance && <Ligne l="Tendance" v={info.tendance.direction} />}
                      </>
                    );
                  })()}
                  {info.type === "categorielle" && (() => {
                    const c = s as unknown as Cat;
                    return (
                      <>
                        <p className="text-[10px] text-slate-400 pb-1">
                          {fmt(c.total)} valeurs — {fmt(c.nbCategoriesDistinctes)} catégories
                        </p>
                        {c.topValeurs.map((t, i) => (
                          <Ligne
                            key={t.valeur}
                            l={t.valeur}
                            v={`${fmt(t.effectif)} (${t.pourcentage} %)`}
                            fort={i === 0}
                          />
                        ))}
                      </>
                    );
                  })()}
                  {info.type === "booleen" && (() => {
                    const b = s as unknown as Boo;
                    return (
                      <>
                        <Ligne l="Oui" v={fmt(b.vrai)} />
                        <Ligne l="Non" v={fmt(b.faux)} />
                      </>
                    );
                  })()}
                  {info.type === "date" && (() => {
                    const d = s as unknown as Dat;
                    return (
                      <>
                        <Ligne l="Du" v={d.min ? d.min.slice(0, 10) : "—"} />
                        <Ligne l="Au" v={d.max ? d.max.slice(0, 10) : "—"} />
                      </>
                    );
                  })()}
                  {info.type === "identifiant" && (() => {
                    const d = s as unknown as Ident;
                    return (
                      <>
                        <Ligne l="Valeurs distinctes" v={fmt(d.distincts)} />
                        <Ligne l="Unicité" v={`${d.unicite} %`} />
                      </>
                    );
                  })()}
                  <Ligne l="Remplissage" v={`${info.tauxRemplissage} %`} />
                </div>
              </div>
            );
          })}
        </div>
      </Depliant>

      {/* DÉPLIANT 3 : CORRÉLATIONS */}
      <Depliant
        titre={estBenchmarkActif ? `Évolution des corrélations (${sourcesFichiers.length} fichiers)` : "Corrélations significatives"}
        detail={estBenchmarkActif ? `${correlationsBenchmark.length} relations analysées` : `${correlationsStandard.length} relations analysées`}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            {estBenchmarkActif
              ? `Analyse détaillée de la transformation des liens mathématiques par rapport au fichier pivot « ${refSource} ».`
              : "Mesure de la force du lien linéaire entre deux variables avec traduction en impact opérationnel."}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {estBenchmarkActif
              ? correlationsBenchmark.map((c) => (
                  <div
                    key={`${c.colA}|${c.colB}`}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                        {c.colA} <span className="text-blue-500 font-normal">↔</span> {c.colB}
                      </span>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-bold border border-blue-200/50">
                        {refSource} (Réf) : {c.rRef ?? "—"}
                      </span>
                    </div>

                    <div className="space-y-3 pt-1">
                      {c.comparaisons.map((comp) => (
                        <div
                          key={comp.source}
                          className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-2"
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-slate-600 dark:text-slate-300 font-bold">
                              {refSource} ({c.rRef ?? "—"}) → {comp.source} (<strong>{comp.r ?? "—"}</strong>)
                            </span>
                            <span
                              className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                                comp.diff > 0
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"
                                  : comp.diff < 0
                                  ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {comp.diff > 0 ? `+${comp.diff}` : comp.diff}
                            </span>
                          </div>

                          <div className="text-[11px] space-y-1">
                            <div className="flex items-center gap-1.5 font-bold text-blue-700 dark:text-blue-300">
                              <Lightbulb className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span>{comp.expl.diagnostic}</span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed pl-5">
                              {comp.expl.detail}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              : correlationsStandard.slice(0, 10).map((c) => {
                  const explTexte = expliquerCorrelationSimple(c.colonneA, c.colonneB, c.coefficient);
                  return (
                    <div
                      key={`${c.colonneA}|${c.colonneB}`}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                          {c.colonneA} <span className="text-blue-500 font-normal">↔</span> {c.colonneB}
                        </span>
                        <span className="font-mono font-bold bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-md text-xs border border-slate-200/60 dark:border-slate-700">
                          r = {c.coefficient}{" "}
                          <span className="text-[10px] font-normal text-slate-500">
                            ({c.interpretation})
                          </span>
                        </span>
                      </div>

                      <div className="text-[11px] flex items-start gap-1.5 pt-0.5">
                        <Lightbulb className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                          {explTexte}
                        </p>
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      </Depliant>

      {/* 5. MODULES D'EXPLORATION VISUELLE & TABLEAUX */}
      <section className="space-y-8">
        <ModulePrevisions entetes={entetes} corps={corps} />
        <GraphiqueGenerateur key={`g-${nomFichier}`} entetes={entetes} corps={corps} onEpingler={epinglerGraphique} />
        <CarteGeographique key={`c-${nomFichier}`} entetes={entetes} corps={corps} />
        <TableauCroiseDynamique key={`t-${nomFichier}`} entetes={entetes} corps={corps} />
      </section>

    </div>
  );
}

function CarteSyntheseItem({ bloc }: { bloc: { type: string; texte: string }; index: number }) {
  const parties = bloc.texte.split(/:(.+)/);
  const titre = parties.length > 1 ? parties[0].trim() : "Point clé";
  const contenu = parties.length > 1 ? parties[1].trim() : bloc.texte;

  let icone = <TrendingUp className="w-4 h-4 text-blue-600" />;
  let badgeTexte = "Indicateur";
  let badgeCouleur = "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";

  if (bloc.type === "categorie") {
    icone = <PieChart className="w-4 h-4 text-slate-600" />;
    badgeTexte = "Majorité / Catégorie";
    badgeCouleur = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  } else if (bloc.type === "numerique") {
    icone = <BarChart3 className="w-4 h-4 text-blue-600" />;
    badgeTexte = "Distribution chiffrée";
    badgeCouleur = "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  } else if (bloc.type === "qualite" || bloc.type === "intro") {
    icone = <AlertTriangle className="w-4 h-4 text-amber-600" />;
    badgeTexte = "Qualité & Données";
    badgeCouleur = "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  }

  const partiesTexte = contenu.split(/(\d+(?:[.,]\d+)?\s*%)/g);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:shadow transition-shadow">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800">{icone}</div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeCouleur}`}>
            {badgeTexte}
          </span>
        </div>
        <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-1 leading-snug">
          {titre}
        </h4>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          {partiesTexte.map((morceau, i) =>
            /(\d+(?:[.,]\d+)?\s*%)/.test(morceau) ? (
              <span
                key={i}
                className="inline-block px-1.5 py-0.2 mx-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 font-bold text-[11px]"
              >
                {morceau}
              </span>
            ) : (
              morceau
            )
          )}
        </p>
      </div>
    </div>
  );
}

function Depliant({
  titre,
  detail,
  children,
  parDefautOuvert = false,
}: {
  titre: string;
  detail: string;
  children: ReactNode;
  parDefautOuvert?: boolean;
}) {
  return (
    <details className={`group ${carteStyle}`} open={parDefautOuvert}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-6 py-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden">
        <span className="flex items-baseline gap-3">
          <span className="text-base md:text-lg font-bold text-slate-900 dark:text-white">{titre}</span>
          <span className="text-xs text-slate-400 font-medium">{detail}</span>
        </span>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-slate-100 px-6 py-5 dark:border-slate-800">{children}</div>
    </details>
  );
}

function Ligne({ l, v, fort }: { l: string; v: string; fort?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-3 ${
        fort ? "font-bold text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-400"
      }`}
    >
      <span className="truncate">{l}</span>
      <span className="whitespace-nowrap font-semibold">{v}</span>
    </div>
  );
}