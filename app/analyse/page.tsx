"use client";

import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import ModulePrevisions from "../components/ModulePrevisions";
import GraphiqueGenerateur from "../components/GraphiqueGenerateur";
import TableauCroiseDynamique from "../components/TableauCroiseDynamique";
import BarreOutilsDonnees from "../components/BarreOutilsDonnees";
import { exporterRapportPowerPoint } from "../../lib/analyse/exportPptx";
import { exporterExcelExecutive } from "../../lib/analyse/exportExcel";
import { useData } from "../context/DataContext";
import {
  parseNombre,
  estValeurVide,
  arrondir,
  estColonneIdentifiant,
  estColonneTemporelle,
  type Cellule,
} from "../../lib/analyse/utils";
import { analyserColonnes } from "../../lib/analyse/analyse";
import { lireFournisseur } from "../../lib/prefs";
import Link from "next/link";
import BoutonSupprimerDonnees from "../components/BoutonSupprimerDonnees";
import {
  Presentation,
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
  ChevronDown,
  MapPin,
  Table,
  Link2,
  FileText,
  Sparkles,
  Loader2,
  RefreshCw,
} from "lucide-react";

// Import dynamique sans SSR pour éviter le conflit d'instance DOM de Leaflet
const CarteGeographique = dynamic(
  () => import("../components/CarteGeographique"),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 w-full rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 animate-pulse flex items-center justify-center text-xs text-slate-400">
        Chargement de la carte géographique...
      </div>
    ),
  }
);

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

function nettoyerNomAffichage(nom?: string): string {
  if (!nom) return "";
  let s = String(nom).trim();
  s = s.replace(/\.(xlsx|xls|csv|json)/gi, "");
  s = s.replace(/RGPH\d{4}_region_/gi, "").replace(/rgph\d{4}_/gi, "");
  s = s.replace(/_sous_prefectures/gi, " (Sous-préf.)");
  s = s.replace(/taille_moyenne_menage/gi, "Taille moyenne ménage");
  s = s.replace(/rapport_masculinite/gi, "Rapport masculinité");
  s = s.replace(/population_totale/gi, "Population totale");
  s = s.replace(/sous_prefecture/gi, "Sous-préfecture");
  s = s.replace(/departement/gi, "Département");
  s = s.replace(/_/g, " ");
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  return s.charAt(0).toUpperCase() + s.slice(1).trim();
}

const H_CORR = ({ children }: { children?: ReactNode }) => (
  <h6 className="text-[11px] font-bold mt-2 mb-1 text-slate-900 dark:text-slate-100 uppercase tracking-wide">
    {children}
  </h6>
);

const MD_CORR: Components = {
  h1: H_CORR,
  h2: H_CORR,
  h3: H_CORR,
  h4: H_CORR,
  p: ({ children }) => <p className="my-1 leading-relaxed text-slate-700 dark:text-slate-300">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-1 text-slate-700 dark:text-slate-300">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-1 text-slate-700 dark:text-slate-300">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>,
};

function calculerPearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;
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
  if (denom === 0) return 0;
  const r = num / denom;
  return Math.round(Math.max(-1, Math.min(1, r)) * 100) / 100;
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
  const estTemps = (nom: string) => /annee|année|date|mois|trimestre|semaine|exercice|an|indicateur/i.test(nom);

  if (estTemps(colA) || estTemps(colB)) {
    const colTemps = estTemps(colA) ? colA : colB;
    const colMesure = estTemps(colA) ? colB : colA;
    if (r >= 0.5) return `Tendance haussière : au fil de « ${colTemps} », « ${colMesure} » enregistre une croissance régulière.`;
    if (r <= -0.5) return `Tendance baissière : au fil de « ${colTemps} », « ${colMesure} » subit une érosion continue.`;
    return `Trajectoire neutre : « ${colMesure} » ne présente pas de dynamique linéaire nette au cours de « ${colTemps} ».`;
  }

  if (r >= 0.7) {
    return `Forte synergie directe : lorsque « ${colA} » augmente, « ${colB} » progresse presque proportionnellement.`;
  }
  if (r >= 0.3) {
    return `Liaison positive modérée : « ${colA} » et « ${colB} » ont tendance à évoluer dans la même direction.`;
  }
  if (r > -0.3) {
    return `Indépendance statistique : les variations de « ${colA} » n'ont pas d'impact linéaire perceptible sur « ${colB} ».`;
  }
  if (r > -0.7) {
    return `Liaison négative modérée : une hausse de « ${colA} » s'accompagne d'un recul de « ${colB} ».`;
  }
  return `Forte relation inverse : une progression de « ${colA} » entraîne une baisse systématique de « ${colB} ».`;
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
      detail: "Pas assez d'observations communes.",
      alerte: false,
    };
  }

  const diff = Math.round((r2 - r1) * 100) / 100;

  if ((r1 < -0.15 && r2 > 0.15) || (r1 > 0.15 && r2 < -0.15)) {
    return {
      diagnostic: "Inversion de dynamique",
      detail: `Liaison passée de ${r1} dans ${nom1} à ${r2 > 0 ? `+${r2}` : r2} dans ${nom2}.`,
      alerte: true,
    };
  }

  if (Math.abs(r1) >= 0.4 && Math.abs(r2) < 0.25) {
    return {
      diagnostic: "Découplage",
      detail: `Lien fort (${r1}) retombé à (${r2}). Les variables sont devenues indépendantes.`,
      alerte: false,
    };
  }

  if (Math.abs(r2) - Math.abs(r1) >= 0.25) {
    return {
      diagnostic: "Intensification",
      detail: `Lien nettement raffermi dans ${nom2}. Sensibilité accrue.`,
      alerte: false,
    };
  }

  if (Math.abs(diff) < 0.15) {
    return {
      diagnostic: "Comportement stable",
      detail: `Structure inchangée (variation marginale de ${diff >= 0 ? `+${diff}` : diff}).`,
      alerte: false,
    };
  }

  if (diff > 0) {
    return {
      diagnostic: "Gain de synergie",
      detail: `Coefficient gagne +${diff} points dans ${nom2}.`,
      alerte: false,
    };
  }

  return {
    diagnostic: "Antagonisme accru",
    detail: `Coefficient recule de ${diff} points dans ${nom2}.`,
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

  const [exportExcelEnCours, setExportExcelEnCours] = useState(false);
  const [exportPptxEnCours, setExportPptxEnCours] = useState(false);

  const [syntheseCorrIA, setSyntheseCorrIA] = useState<string | null>(null);
  const [chargementCorrIA, setChargementCorrIA] = useState(false);
  const [erreurCorrIA, setErreurCorrIA] = useState<string | null>(null);

  const allerASection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;

    if (el.tagName === "DETAILS") {
      (el as HTMLDetailsElement).open = true;
    }
    const parentDetails = el.closest("details");
    if (parentDetails) {
      parentDetails.open = true;
    }

    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

  const { colonnesMesurables, colonnesTemporelles, colonnesIdentifiants } = useMemo(() => {
    const mesurables: string[] = [];
    const temporelles: string[] = [];
    const identifiants: string[] = [];

    noms.forEach((nom) => {
      const idx = entetes.indexOf(nom);
      const vals = corps.map((l) => l[idx]).filter((v) => !estValeurVide(v));
      if (!vals.length) return;

      if (estColonneIdentifiant(nom, vals)) {
        identifiants.push(nom);
        return;
      }

      if (estColonneTemporelle(nom, vals)) {
        temporelles.push(nom);
        return;
      }

      const nums = vals.map(parseNombre).filter((n): n is number => n !== null);
      if (nums.length / vals.length >= 0.6) {
        mesurables.push(nom);
      }
    });

    return { colonnesMesurables: mesurables, colonnesTemporelles: temporelles, colonnesIdentifiants: identifiants };
  }, [noms, entetes, corps]);

  const colonnesPourCorrelations = useMemo(() => {
    const list = [...colonnesMesurables];
    if (colonnesTemporelles.length > 0) {
      list.unshift(colonnesTemporelles[0]);
    }
    return list;
  }, [colonnesMesurables, colonnesTemporelles]);

  const completudeGlobale = useMemo(() => {
    if (!corps.length || !noms.length) return 100;
    let totalCellules = 0;
    let totalRemplies = 0;

    corps.forEach((ligne) => {
      noms.forEach((nom) => {
        const idx = entetes.indexOf(nom);
        if (idx !== -1) {
          totalCellules++;
          if (!estValeurVide(ligne[idx])) totalRemplies++;
        }
      });
    });

    return totalCellules ? Math.round((totalRemplies / totalCellules) * 100) : 100;
  }, [corps, noms, entetes]);

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

    const cartes: {
      type: "numerique" | "categorie" | "qualite";
      titre: string;
      detail: string;
      deltaBadge?: string;
      estHausse?: boolean;
    }[] = [];

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
        detail: `« ${nettoyerNomAffichage(s2)} » compte ${l2} lignes contre ${l1} dans « ${nettoyerNomAffichage(s1)} » (${delta >= 0 ? "+" : ""}${pct} %).`,
        deltaBadge: `${delta >= 0 ? "+" : ""}${delta} lig.`,
        estHausse: delta >= 0,
      });
    } else {
      const plusGros = [...statsGlobalesMulti.resumeSources].sort((a, b) => b.nbLignes - a.nbLignes)[0];
      const plusPetit = [...statsGlobalesMulti.resumeSources].sort((a, b) => a.nbLignes - b.nbLignes)[0];
      cartes.push({
        type: "qualite",
        titre: `Volumétrie (${sourcesFichiers.length} fichiers)`,
        detail: `Dominance : « ${nettoyerNomAffichage(plusGros.nom)} » (${plusGros.nbLignes} lig.) vs « ${nettoyerNomAffichage(plusPetit.nom)} » (${plusPetit.nbLignes} lig.). Réf : « ${nettoyerNomAffichage(refSource)} » (${statsGlobalesMulti.refInfo.nbLignes} lig.).`,
        deltaBadge: `${sourcesFichiers.length} sources`,
        estHausse: true,
      });
    }

    colonnesMesurables.forEach((nomCol) => {
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
          titre: `Volume : ${nettoyerNomAffichage(nomCol)}`,
          detail: `Leader : « ${nettoyerNomAffichage(leaderSomme.src)} » (${fmt(arrondir(leaderSomme.sum))}). Réf « ${nettoyerNomAffichage(refSource)} » : ${fmt(
            arrondir(refData.sum)
          )} (moy. ${fmt(arrondir(leaderSomme.moy))} vs ${fmt(arrondir(refData.moy))}).`,
          deltaBadge: leaderSomme.src === refSource ? "Réf leader" : `+${pctDiff}% vs Réf`,
          estHausse: deltaRefLeader >= 0,
        });
      }
    });

    const categorielles = noms.filter(
      (nom) => !colonnesMesurables.includes(nom) && !colonnesTemporelles.includes(nom) && !colonnesIdentifiants.includes(nom)
    );

    categorielles.forEach((nomCol) => {
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
        titre: `Dominance : ${nettoyerNomAffichage(nomCol)}`,
        detail: tousIdentiques
          ? `Convergence unanime : « ${topParSource[0].premierVal} » arrive en tête dans tous les fichiers.`
          : `Dispersion : ${topParSource.map((t) => `${nettoyerNomAffichage(t.src)}: « ${t.premierVal} » (${t.pct}%)`).join(", ")}.`,
        deltaBadge: tousIdentiques ? "Unanime" : "Dispersion",
        estHausse: tousIdentiques,
      });
    });

    return cartes;
  }, [
    estBenchmarkActif,
    statsGlobalesMulti,
    sourcesFichiers,
    refSource,
    colonnesMesurables,
    colonnesTemporelles,
    colonnesIdentifiants,
    noms,
    entetes,
    corpsParSource,
  ]);

  const correlationsBenchmark = useMemo(() => {
    if (!estBenchmarkActif || colonnesPourCorrelations.length < 2) return [];

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

    for (let i = 0; i < colonnesPourCorrelations.length; i++) {
      for (let j = i + 1; j < colonnesPourCorrelations.length; j++) {
        const colA = colonnesPourCorrelations[i];
        const colB = colonnesPourCorrelations[j];

        if (colonnesTemporelles.includes(colA) && colonnesTemporelles.includes(colB)) {
          continue;
        }

        const idxA = entetes.indexOf(colA);
        const idxB = entetes.indexOf(colB);

        const lignesRef = corpsParSource.get(refSource) || [];
        const pairesRef = lignesRef
          .map((l) => [parseNombre(l[idxA]), parseNombre(l[idxB])])
          .filter((p): p is [number, number] => p[0] !== null && p[1] !== null);
        const rRef = calculerPearson(
          pairesRef.map((p) => p[0]),
          pairesRef.map((p) => p[1])
        );

        const comparaisons = autresSources.map((src) => {
          const lignesSrc = corpsParSource.get(src) || [];
          const pairesSrc = lignesSrc
            .map((l) => [parseNombre(l[idxA]), parseNombre(l[idxB])])
            .filter((p): p is [number, number] => p[0] !== null && p[1] !== null);
          const rSrc = calculerPearson(
            pairesSrc.map((p) => p[0]),
            pairesSrc.map((p) => p[1])
          );
          const diff = Math.round(((rSrc ?? 0) - (rRef ?? 0)) * 100) / 100;
          const expl = expliquerEvolutionCorrelation(colA, colB, rRef, rSrc, refSource, src);
          return { source: src, r: rSrc, diff, expl };
        });

        const maxDiffAbs = Math.max(...comparaisons.map((c) => Math.abs(c.diff)), 0);
        couples.push({ colA, colB, rRef, comparaisons, maxDiffAbs });
      }
    }

    return couples.sort((a, b) => b.maxDiffAbs - a.maxDiffAbs);
  }, [estBenchmarkActif, colonnesPourCorrelations, colonnesTemporelles, entetes, corpsParSource, refSource, autresSources]);

  const imprimerRapport = () => {
    document.querySelectorAll("details").forEach((el) => el.setAttribute("open", "true"));
    setTimeout(() => {
      window.print();
    }, 80);
  };

  const telechargerExcelPropre = async () => {
    if (!entetes.length || !corps.length || exportExcelEnCours) return;
    setExportExcelEnCours(true);
    await new Promise((r) => setTimeout(r, 50));
    try {
      await exporterExcelExecutive(
        nomFichier || "Analyse",
        entetes,
        corps,
        resultatActif,
        estBenchmarkActif
          ? syntheseComparativeCards.map((c) => ({ type: c.type, texte: `${c.titre} : ${c.detail}` }))
          : rapportActif
      );
    } catch (error) {
      console.error("Erreur lors de l'export Excel :", error);
    } finally {
      setExportExcelEnCours(false);
    }
  };

  const telechargerPowerPoint = async () => {
    if (!entetes.length || !corps.length || exportPptxEnCours) return;
    setExportPptxEnCours(true);
    await new Promise((r) => setTimeout(r, 50));

    try {
      const rapportFinal = estBenchmarkActif
        ? syntheseComparativeCards.map((c) => ({
            type: c.type,
            texte: `${c.titre} : ${c.detail}`,
          }))
        : (rapportActif as any);

      let tdcManuelExport: any = undefined;
      if (estBenchmarkActif && colonnesMesurables.length > 0) {
        const colCat = noms.find((n) => {
          const idx = entetes.indexOf(n);
          const vals = Array.from(new Set(corps.map((l) => String(l[idx] ?? "").trim()).filter(Boolean)));
          return vals.length >= 2 && vals.length <= 10 && !colonnesMesurables.includes(n) && !colonnesTemporelles.includes(n);
        });

        const metriquePrincipale = colonnesMesurables[0];
        const idxMetrique = entetes.indexOf(metriquePrincipale);

        if (colCat && idxMetrique !== -1) {
          const idxCat = entetes.indexOf(colCat);
          const modalites = Array.from(new Set(corps.map((l) => String(l[idxCat] ?? "").trim()).filter(Boolean))).slice(0, 8);

          const entetesTdc = [
            `${nettoyerNomAffichage(colCat)} \\ Fichier`,
            `${nettoyerNomAffichage(refSource)} (Réf)`,
            ...autresSources.map((s) => nettoyerNomAffichage(s)),
            "Écart",
            "Variation %",
          ];

          let totalRef = 0;
          let totalAutre = 0;

          const lignesTdc = modalites.map((mod) => {
            const lRef = (corpsParSource.get(refSource) || []).filter((l) => String(l[idxCat] ?? "").trim() === mod);
            const sumRef = lRef.map((l) => parseNombre(l[idxMetrique])).filter((n): n is number => n !== null).reduce((a, b) => a + b, 0);

            const row: (string | number)[] = [mod, arrondir(sumRef)];
            totalRef += sumRef;

            autresSources.forEach((src) => {
              const lSrc = (corpsParSource.get(src) || []).filter((l) => String(l[idxCat] ?? "").trim() === mod);
              const sumSrc = lSrc.map((l) => parseNombre(l[idxMetrique])).filter((n): n is number => n !== null).reduce((a, b) => a + b, 0);
              row.push(arrondir(sumSrc));
              totalAutre += sumSrc;
            });

            const ecart = arrondir((Number(row[2]) || 0) - sumRef);
            const pctVar = sumRef > 0 ? `${ecart >= 0 ? "+" : ""}${Math.round((ecart / sumRef) * 1000) / 10} %` : "—";

            row.push(ecart >= 0 ? `+${fmt(ecart)}` : fmt(ecart));
            row.push(pctVar);
            return row;
          });

          const ecartTotal = arrondir(totalAutre - totalRef);
          const pctTotal = totalRef > 0 ? `${ecartTotal >= 0 ? "+" : ""}${Math.round((ecartTotal / totalRef) * 1000) / 10} %` : "—";

          lignesTdc.push([
            "Total Général",
            arrondir(totalRef),
            arrondir(totalAutre),
            ecartTotal >= 0 ? `+${fmt(ecartTotal)}` : fmt(ecartTotal),
            pctTotal,
          ]);

          tdcManuelExport = {
            titre: "TABLEAU CROISÉ DYNAMIQUE COMPARATIF",
            sousTitre: `Confrontation ${nettoyerNomAffichage(metriquePrincipale)} par ${nettoyerNomAffichage(colCat)} (${sourcesFichiers.length} fichiers)`,
            entetes: entetesTdc,
            lignes: lignesTdc,
          };
        }
      }

      let graphiquesExport: any[] = (graphiquesEpingles || []) as any;
      if (graphiquesExport.length === 0 && estBenchmarkActif) {
        const colCat = noms.find((n) => {
          const idx = entetes.indexOf(n);
          const vals = Array.from(new Set(corps.map((l) => String(l[idx] ?? "").trim()).filter(Boolean)));
          return vals.length >= 2 && vals.length <= 8 && !colonnesMesurables.includes(n) && !colonnesTemporelles.includes(n);
        });

        if (colCat) {
          const idxCat = entetes.indexOf(colCat);
          const categories = Array.from(new Set(corps.map((l) => String(l[idxCat] ?? "").trim()).filter(Boolean))).slice(0, 6);

          colonnesMesurables.slice(0, 2).forEach((colMesure, idxChart) => {
            const idxMes = entetes.indexOf(colMesure);
            const datasets = sourcesFichiers.map((src) => {
              const lignesSrc = corpsParSource.get(src) || [];
              const data = categories.map((cat) => {
                const sousLignes = lignesSrc.filter((l) => String(l[idxCat] ?? "").trim() === cat);
                const nums = sousLignes.map((l) => parseNombre(l[idxMes])).filter((n): n is number => n !== null);
                const sum = nums.reduce((a, b) => a + b, 0);
                return nums.length ? Math.round(sum / nums.length) : 0;
              });
              return {
                label: `${nettoyerNomAffichage(src)} (Moy.)`,
                data,
              };
            });

            graphiquesExport.push({
              id: idxChart + 1,
              titre: `Benchmark : ${nettoyerNomAffichage(colMesure)} par ${nettoyerNomAffichage(colCat)}`,
              type: "bar",
              labels: categories,
              datasets,
            });
          });
        }
      }

      await exporterRapportPowerPoint({
        nomProjet: nomFichier || "Analyse Datenza",
        entetes: entetes,
        corps: corps,
        analyse: resultatActif as any,
        rapport: rapportFinal,
        graphiquesEpingles: graphiquesExport,
        tdcManuel: tdcManuelExport,
        syntheseCorrelationsIA: syntheseCorrIA ?? undefined,
      } as any);
    } catch (error) {
      console.error("Erreur lors de l'export PowerPoint :", error);
    } finally {
      setExportPptxEnCours(false);
    }
  };

  const correlationsStandard = useMemo(() => {
    return [...(resultatActif?.correlations ?? [])]
      .filter((c) => {
        if (c.colonneA === "Fichier Source" || c.colonneB === "Fichier Source") return false;
        if (colonnesIdentifiants.includes(c.colonneA) || colonnesIdentifiants.includes(c.colonneB)) return false;
        if (colonnesTemporelles.includes(c.colonneA) && colonnesTemporelles.includes(c.colonneB)) return false;
        return true;
      })
      .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));
  }, [resultatActif, colonnesIdentifiants, colonnesTemporelles]);

  async function genererSyntheseCorrelationsIA() {
    setChargementCorrIA(true);
    setErreurCorrIA(null);
    try {
      const topRelations = (estBenchmarkActif ? correlationsBenchmark.slice(0, 5) : correlationsStandard.slice(0, 6)).map(
        (c: any) => {
          if (estBenchmarkActif) {
            return {
              relation: `${c.colA} ↔ ${c.colB}`,
              reference: `${nettoyerNomAffichage(refSource)} (r = ${c.rRef})`,
              comparaisons: c.comparaisons.map(
                (comp: any) => `${nettoyerNomAffichage(comp.source)}: r = ${comp.r} (${comp.diff > 0 ? "+" : ""}${comp.diff})`
              ),
            };
          }
          return {
            relation: `${c.colonneA} ↔ ${c.colonneB}`,
            coefficient_r: c.coefficient,
            intensite: c.interpretation,
          };
        }
      );

      const question = `Interprète de façon managériale et opérationnelle ces corrélations statistiques dominantes :
${JSON.stringify(topRelations)}

Rédige une synthèse directe et percutante articulée autour de 3 puces :
- Le levier moteur : la relation clé qui stimule directement l'activité.
- Le point de vigilance ou paradoxe : corrélation inverse, stagnation temporelle ou risque sous-jacent.
- La recommandation concrète : décision managériale à prendre sur la base de ces interactions.
Ne mets ni introduction ni conclusion.`;

      const moteurPref = typeof window !== "undefined" ? lireFournisseur() : "auto";

      const rep = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          contexte: JSON.stringify({ fichier: nomFichier, nbLignes: corps.length, topRelations }),
          fournisseur: moteurPref || "auto",
          langueConversation: "fr",
          langueApp: "fr",
        }),
      });

      const data = (await rep.json().catch(() => ({}))) as { reponse?: string; error?: string };
      if (!rep.ok || !data.reponse) {
        throw new Error(data.error || `Erreur (${rep.status})`);
      }

      setSyntheseCorrIA(data.reponse);
    } catch (err) {
      setErreurCorrIA(err instanceof Error ? err.message : "Erreur de connexion.");
    } finally {
      setChargementCorrIA(false);
    }
  }

  if (corps.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Analyse des données</h1>
        <p className="text-slate-500 text-sm">
          Aucun fichier actif n&apos;est chargé. Veuillez importer des fichiers sur l&apos;accueil ou effectuer une consolidation.
        </p>
        <Link
          href="/"
          className="inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16 text-slate-800 dark:text-slate-100 font-sans">
      {/* EN-TÊTE EXCLUSIF À L'EXPORT PDF */}
      <div className="print-only mb-6 pb-3 border-b-2 border-slate-900">
        <div className="flex justify-between items-end">
          <div>
            <span className="text-[10px] font-bold tracking-widest uppercase text-blue-700">
              DATENZA ANALYTICS PLATFORM · RAPPORT D&apos;AUDIT
            </span>
            <h1 className="text-xl font-black text-slate-900 mt-0.5">
              Synthèse Décisionnelle &amp; Tableau de Bord
            </h1>
            <p className="text-xs text-slate-600">
              Jeu de données : <strong>{nettoyerNomAffichage(nomFichier) || "Données importées"}</strong> ({corps.length.toLocaleString("fr-FR")} lignes)
            </p>
          </div>
          <div className="text-right text-[10px] text-slate-500 font-medium">
            <p>Document généré le {new Date().toLocaleDateString("fr-FR")}</p>
            <p className="font-bold text-slate-800">Confidentiel Direction</p>
          </div>
        </div>
      </div>

      {/* 1. BANDEAU DE PILOTAGE COBALT EXECUTIVE */}
      <section className="bg-slate-900 border border-slate-800 text-white rounded-3xl p-5 sm:p-8 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[11px] sm:text-xs font-bold tracking-wide uppercase">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              {estBenchmarkActif
                ? `DATENZA · Benchmark Multi-Sources (${sourcesFichiers.length} fichiers)`
                : "DATENZA · Centre de pilotage & Analyse"}
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-white">
              {estBenchmarkActif ? "Tableau de Bord & Benchmark Comparatif" : "Tableau de bord & Rapport d'analyse"}
            </h1>
            <p className="text-xs md:text-sm text-slate-400 max-w-2xl leading-relaxed">
              {estBenchmarkActif
                ? "Confrontation directe des indicateurs clés, profils détaillés par fichier et analyse des séries."
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
                      title={src}
                      className={`px-2.5 py-1 rounded-lg border font-mono text-[10px] sm:text-[11px] ${
                        src === refSource
                          ? "bg-blue-900/60 border-blue-500 text-blue-200 font-bold"
                          : "bg-slate-800 border-slate-700 text-slate-300"
                      }`}
                    >
                      {nettoyerNomAffichage(src)} {src === refSource && "(Réf)"}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 text-blue-300 font-mono text-xs">
                  {nettoyerNomAffichage(nomFichier) || "Données importées"}
                </span>
              )}
            </div>

            {estBenchmarkActif && (
              <div className="flex items-center gap-2 pt-2 text-xs">
                <span className="font-semibold text-slate-300">Réf étalon (Pivot) :</span>
                <select
                  value={refSource}
                  onChange={(e) => setSourceRefChoisie(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-blue-300 text-xs font-bold rounded-lg px-2 py-1 focus:ring-1 focus:ring-blue-500"
                >
                  {sourcesFichiers.map((src) => (
                    <option key={src} value={src}>{nettoyerNomAffichage(src)}</option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400">
                  ({autresSources.length} autre(s) comparé(s))
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 print:hidden w-full sm:w-auto mt-4 lg:mt-0 shrink-0">
            <button
              onClick={telechargerPowerPoint}
              disabled={exportPptxEnCours}
              className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              <Presentation className="w-4 h-4 shrink-0" />
              <span>{exportPptxEnCours ? "Génération PPTX…" : "PowerPoint (.pptx)"}</span>
            </button>

            <BoutonSupprimerDonnees />

            <button
              onClick={imprimerRapport}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span>PDF</span>
            </button>

            <button
              onClick={telechargerExcelPropre}
              disabled={exportExcelEnCours}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{exportExcelEnCours ? "Export…" : "Excel (.xlsx)"}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. CARTES D'INDICATEURS CLÉS (2x2 SUR MOBILE) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 print:grid-cols-4">
        <div className={`${carteStyle} p-3.5 sm:p-5 flex items-center justify-between`}>
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
              {estBenchmarkActif ? "Volumétrie" : "Lignes"}
            </p>
            <h3 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">
              {fmt(corps.length)}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-blue-600 dark:text-blue-400 mt-0.5 font-medium truncate">
              {estBenchmarkActif ? (
                <span>Réf : <strong>{fmt(corpsParSource.get(refSource)?.length || 0)}</strong> lig.</span>
              ) : (
                "Enregistrements"
              )}
            </p>
          </div>
          <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">
            {estBenchmarkActif ? <Scale className="w-4 h-4 sm:w-6 sm:h-6" /> : <Database className="w-4 h-4 sm:w-6 sm:h-6" />}
          </div>
        </div>

        <div className={`${carteStyle} p-3.5 sm:p-5 flex items-center justify-between`}>
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Variables</p>
            <h3 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">
              {noms.length}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-blue-600 dark:text-blue-400 mt-0.5 font-medium truncate">
              {colonnesMesurables.length} métriques
            </p>
          </div>
          <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold shrink-0">
            <Layers className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className={`${carteStyle} p-3.5 sm:p-5 flex items-center justify-between`}>
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
              {estBenchmarkActif ? "Sources" : "Graphiques"}
            </p>
            <h3 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">
              {estBenchmarkActif ? `${sourcesFichiers.length}` : graphiquesEpingles.length}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-blue-600 dark:text-blue-400 mt-0.5 font-medium truncate">
              {estBenchmarkActif ? "Séries sync" : "Inclus"}
            </p>
          </div>
          <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">
            <BarChart3 className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className={`${carteStyle} p-3.5 sm:p-5 flex items-center justify-between`}>
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Complétude</p>
            <h3 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">
              {estBenchmarkActif && statsGlobalesMulti
                ? `${Math.round(
                    statsGlobalesMulti.resumeSources.reduce((a, b) => a + b.completude, 0) /
                      (sourcesFichiers.length || 1)
                  )} %`
                : `${completudeGlobale} %`}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium truncate">
              Données intègres
            </p>
          </div>
          <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shrink-0">
            <CheckCircle2 className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>
      </section>

      {/* 3. BARRE D'OUTILS */}
      <div className="print:hidden">
        <BarreOutilsDonnees />
      </div>

      {/* BARRE D'ACCÈS RAPIDE */}
      <nav
        aria-label="Navigation rapide de l'analyse"
        className="print:hidden sticky top-3 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-2xl p-2 shadow-xs flex items-center gap-2 overflow-x-auto scrollbar-none"
      >
        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase px-2 shrink-0">
          Aller à :
        </span>

        <button
          type="button"
          onClick={() => allerASection("sec-synthese")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/80 hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-800/80 dark:hover:bg-blue-950/50 dark:hover:text-blue-300 text-xs font-semibold text-slate-700 dark:text-slate-300 transition shrink-0 cursor-pointer border border-transparent hover:border-blue-200/60 dark:hover:border-blue-800/60"
        >
          <FileText className="w-3.5 h-3.5 text-blue-500" />
          <span>Synthèse</span>
        </button>

        <button
          type="button"
          onClick={() => allerASection("sec-stats")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/80 hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-800/80 dark:hover:bg-blue-950/50 dark:hover:text-blue-300 text-xs font-semibold text-slate-700 dark:text-slate-300 transition shrink-0 cursor-pointer border border-transparent hover:border-blue-200/60 dark:hover:border-blue-800/60"
        >
          <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
          <span>Statistiques</span>
        </button>

        <button
          type="button"
          onClick={() => allerASection("sec-correlations")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/80 hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-800/80 dark:hover:bg-blue-950/50 dark:hover:text-blue-300 text-xs font-semibold text-slate-700 dark:text-slate-300 transition shrink-0 cursor-pointer border border-transparent hover:border-blue-200/60 dark:hover:border-blue-800/60"
        >
          <Link2 className="w-3.5 h-3.5 text-cyan-500" />
          <span>Corrélations</span>
        </button>

        <button
          type="button"
          onClick={() => allerASection("sec-previsions")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/80 hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-800/80 dark:hover:bg-blue-950/50 dark:hover:text-blue-300 text-xs font-semibold text-slate-700 dark:text-slate-300 transition shrink-0 cursor-pointer border border-transparent hover:border-blue-200/60 dark:hover:border-blue-800/60"
        >
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          <span>Prévisions</span>
        </button>

        <button
          type="button"
          onClick={() => allerASection("sec-graphiques")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/80 hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-800/80 dark:hover:bg-blue-950/50 dark:hover:text-blue-300 text-xs font-semibold text-slate-700 dark:text-slate-300 transition shrink-0 cursor-pointer border border-transparent hover:border-blue-200/60 dark:hover:border-blue-800/60"
        >
          <PieChart className="w-3.5 h-3.5 text-purple-500" />
          <span>Graphiques</span>
        </button>

        <button
          type="button"
          onClick={() => allerASection("sec-carte")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/80 hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-800/80 dark:hover:bg-blue-950/50 dark:hover:text-blue-300 text-xs font-semibold text-slate-700 dark:text-slate-300 transition shrink-0 cursor-pointer border border-transparent hover:border-blue-200/60 dark:hover:border-blue-800/60"
        >
          <MapPin className="w-3.5 h-3.5 text-rose-500" />
          <span>Carte</span>
        </button>

        <button
          type="button"
          onClick={() => allerASection("sec-tdc")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/80 hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-800/80 dark:hover:bg-blue-950/50 dark:hover:text-blue-300 text-xs font-semibold text-slate-700 dark:text-slate-300 transition shrink-0 cursor-pointer border border-transparent hover:border-blue-200/60 dark:hover:border-blue-800/60"
        >
          <Table className="w-3.5 h-3.5 text-amber-500" />
          <span>Tableau Croisé (TCD)</span>
        </button>
      </nav>

      {/* 4. DÉPLIANT 1 : SYNTHÈSE EXÉCUTIVE (2 COLONNES SUR MOBILE) */}
      <Depliant
        id="sec-synthese"
        titre={estBenchmarkActif ? `Synthèse exécutive (${sourcesFichiers.length} fichiers)` : "Synthèse exécutive & Faits marquants"}
        detail={estBenchmarkActif ? `${syntheseComparativeCards.length} constats` : `${rapportActif.length} points clés`}
        parDefautOuvert={true}
      >
        <div className="space-y-4">
          {estBenchmarkActif && (
            <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-950 dark:text-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
              <div>
                <p className="font-bold text-xs sm:text-sm text-blue-900 dark:text-blue-100 flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-blue-600 shrink-0" />
                  Pivot : {nettoyerNomAffichage(refSource)}
                </p>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Écarts mesurés entre vos {sourcesFichiers.length} fichiers.
                </p>
              </div>
              <div className="text-left sm:text-right shrink-0">
                <span className="inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] sm:text-xs bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200">
                  {fmt(corps.length)} lignes
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
            {estBenchmarkActif
              ? syntheseComparativeCards.map((c, i) => (
                  <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between shadow-xs">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5 sm:mb-2">
                        <div className="p-1 sm:p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800">
                          {c.type === "numerique" && <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />}
                          {c.type === "categorie" && <PieChart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600" />}
                          {c.type === "qualite" && <Scale className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />}
                        </div>
                        {c.deltaBadge && (
                          <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full ${c.estHausse ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"}`}>
                            {c.deltaBadge}
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-[11px] sm:text-xs text-slate-800 dark:text-slate-200 mb-0.5 sm:mb-1 truncate">{c.titre}</h4>
                      <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 leading-snug line-clamp-3 sm:line-clamp-none">{c.detail}</p>
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

      {/* DÉPLIANT 2 : STATISTIQUES PAR COLONNE (2 COLONNES SUR MOBILE) */}
      <Depliant
        id="sec-stats"
        titre={estBenchmarkActif ? `Statistiques par colonne (vs ${nettoyerNomAffichage(refSource)})` : "Statistiques par colonne"}
        detail={`${noms.length} colonnes profilées`}
      >
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
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
                  <div key={nom} className={`${carteStyle} p-2.5 sm:p-4 space-y-2 sm:space-y-3`}>
                    <div className="flex justify-between items-center gap-1 border-b pb-1.5 border-slate-100 dark:border-slate-800">
                      <span className="font-bold text-xs sm:text-sm truncate text-slate-900 dark:text-slate-100">{nettoyerNomAffichage(nom)}</span>
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">
                        Num
                      </span>
                    </div>

                    <div className="p-2 sm:p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-800/40 text-[10px] sm:text-xs space-y-1">
                      <div className="flex justify-between font-bold text-blue-900 dark:text-blue-200 pb-1 border-b border-blue-200/40 truncate">
                        <span>Réf : {nettoyerNomAffichage(refSource)}</span>
                        <span className="font-mono">{fmt(statsRef.moy)}</span>
                      </div>
                      <Ligne l="Médiane" v={fmt(statsRef.med)} />
                      <Ligne l="Min/Max" v={`${fmt(statsRef.min)}/${fmt(statsRef.max)}`} />
                      <Ligne l="Somme" v={fmt(statsRef.somme)} />
                      <Ligne l="Rempli" v={`${completudeRef}%`} />
                    </div>

                    <div className="space-y-1.5 text-[10px] sm:text-xs">
                      {autresSources.map((src) => {
                        const lignesSrc = corpsParSource.get(src) || [];
                        const valsSrc = lignesSrc.map((l) => l[colIdx]).filter((v) => !estValeurVide(v));
                        const numsSrc = valsSrc.map(parseNombre).filter((n): n is number => n !== null);
                        const statsSrc = calculerStatsComplet(numsSrc);

                        const deltaMoy = statsSrc.moy !== null && statsRef.moy !== null ? arrondir(statsSrc.moy - statsRef.moy) : 0;
                        const pctMoy = statsRef.moy && statsRef.moy > 0 ? Math.round((deltaMoy / statsRef.moy) * 1000) / 10 : 0;

                        return (
                          <div key={src} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-0.5">
                            <div className="flex justify-between items-center font-bold text-slate-800 dark:text-slate-200 pb-0.5 border-b border-slate-200/40">
                              <span className="truncate max-w-[80px] sm:max-w-[120px]">{nettoyerNomAffichage(src)}</span>
                              <span className={deltaMoy >= 0 ? "text-emerald-600 font-mono text-[10px]" : "text-rose-600 font-mono text-[10px]"}>
                                {deltaMoy >= 0 ? "+" : ""}{pctMoy}%
                              </span>
                            </div>
                            <Ligne l="Moyenne" v={fmt(statsSrc.moy)} />
                            <Ligne l="Somme" v={fmt(statsSrc.somme)} />
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
                <div key={nom} className={`${carteStyle} p-2.5 sm:p-4 space-y-2 sm:space-y-3`}>
                  <div className="flex justify-between items-center gap-1 border-b pb-1.5 border-slate-100 dark:border-slate-800">
                    <span className="font-bold text-xs sm:text-sm truncate text-slate-900 dark:text-slate-100">{nettoyerNomAffichage(nom)}</span>
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-1.5 py-0.5 rounded shrink-0">
                      Cat
                    </span>
                  </div>

                  <div className="p-2 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/40 text-[10px] sm:text-xs space-y-1">
                    <div className="flex justify-between font-bold text-slate-900 dark:text-slate-200 pb-1 border-b border-slate-200/40">
                      <span>Réf : {nettoyerNomAffichage(refSource)}</span>
                      <span>{setRef.size} cat.</span>
                    </div>
                    {topRef && (
                      <Ligne
                        l="Dominant"
                        v={`${topRef[0]} (${Math.round((topRef[1] / (valsRef.length || 1)) * 100)}%)`}
                        fort
                      />
                    )}
                    <Ligne l="Rempli" v={`${completudeRef}%`} />
                  </div>

                  <div className="space-y-1.5 text-[10px] sm:text-xs">
                    {autresSources.map((src) => {
                      const lignesSrc = corpsParSource.get(src) || [];
                      const valsSrc = lignesSrc.map((l) => l[colIdx]).filter((v) => !estValeurVide(v));
                      const freqSrc: Record<string, number> = {};
                      valsSrc.forEach((v) => (freqSrc[String(v).trim()] = (freqSrc[String(v).trim()] || 0) + 1));
                      const topSrc = Object.entries(freqSrc).sort((a, b) => b[1] - a[1])[0];

                      return (
                        <div key={src} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-0.5">
                          <div className="flex justify-between items-center font-bold text-slate-800 dark:text-slate-200 pb-0.5 border-b border-slate-200/40">
                            <span className="truncate max-w-[80px] sm:max-w-[120px]">{nettoyerNomAffichage(src)}</span>
                            <span>{new Set(valsSrc.map((v) => String(v).trim())).size} cat.</span>
                          </div>
                          {topSrc && (
                            <Ligne
                              l="Dominant"
                              v={`${topSrc[0]} (${Math.round((topSrc[1] / (valsSrc.length || 1)) * 100)}%)`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <div key={nom} className={`${carteStyle} p-2.5 sm:p-4 space-y-2`}>
                <div className="flex justify-between items-center gap-1 border-b pb-1.5 border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-xs sm:text-sm truncate text-slate-900 dark:text-slate-100">{nettoyerNomAffichage(nom)}</span>
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 px-1.5 py-0.5 rounded shrink-0">
                    {info.type.slice(0, 3)}
                  </span>
                </div>
                <div className="text-[10px] sm:text-xs space-y-1 pt-0.5">
                  {info.type === "numerique" && (() => {
                    const n = s as unknown as Num;
                    return (
                      <>
                        <Ligne l="Moyenne" v={fmt(n.moyenne)} />
                        <Ligne l="Médiane" v={fmt(n.mediane)} />
                        <Ligne l="Min/Max" v={`${fmt(n.min)}/${fmt(n.max)}`} />
                        {n.atypiques > 0 && <Ligne l="Atypiques" v={fmt(n.atypiques)} fort />}
                      </>
                    );
                  })()}
                  {info.type === "categorielle" && (() => {
                    const c = s as unknown as Cat;
                    return (
                      <>
                        <p className="text-[9px] text-slate-400 pb-0.5">
                          {fmt(c.total)} val. — {fmt(c.nbCategoriesDistinctes)} cat.
                        </p>
                        {c.topValeurs.slice(0, 2).map((t, i) => (
                          <Ligne
                            key={t.valeur}
                            l={t.valeur}
                            v={`${fmt(t.effectif)} (${t.pourcentage}%)`}
                            fort={i === 0}
                          />
                        ))}
                      </>
                    );
                  })()}
                  {info.type === "identifiant" && (() => {
                    const d = s as unknown as Ident;
                    return (
                      <>
                        <Ligne l="Distincts" v={fmt(d.distincts)} />
                        <Ligne l="Unicité" v={`${d.unicite}%`} />
                      </>
                    );
                  })()}
                  <Ligne l="Rempli" v={`${info.tauxRemplissage}%`} />
                </div>
              </div>
            );
          })}
        </div>
      </Depliant>

      {/* DÉPLIANT 3 : CORRÉLATIONS (2 COLONNES SUR MOBILE) */}
      <Depliant
        id="sec-correlations"
        titre={estBenchmarkActif ? `Corrélations (${sourcesFichiers.length} fichiers)` : "Corrélations significatives"}
        detail={estBenchmarkActif ? `${correlationsBenchmark.length} relations` : `${correlationsStandard.length} relations`}
      >
        <div className="space-y-4">
          <p className="text-[11px] sm:text-xs text-slate-500">
            {estBenchmarkActif
              ? `Transformation des liens mathématiques par rapport au pivot « ${nettoyerNomAffichage(refSource)} ».`
              : "Mesure de la force du lien linéaire entre deux variables."}
          </p>

          <div className="space-y-3">
            <div className="no-print print:hidden bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Synthèse transversale</span>
                </h5>
                <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
                  Leviers moteurs et vigilances opérationnelles.
                </p>
              </div>

              <button
                type="button"
                onClick={genererSyntheseCorrelationsIA}
                disabled={chargementCorrIA}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 transition cursor-pointer self-start sm:self-auto disabled:opacity-50"
              >
                {chargementCorrIA ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    <span>Analyse...</span>
                  </>
                ) : syntheseCorrIA ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Actualiser</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>Générer</span>
                  </>
                )}
              </button>
            </div>

            {syntheseCorrIA && (
              <div className="print-eviter-coupure bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-xs border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  <span className="uppercase tracking-wider">Interactions Décisionnelles</span>
                </div>
                <div className="text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 pt-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_CORR}>
                    {syntheseCorrIA}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {erreurCorrIA && (
              <p className="no-print print:hidden text-[10px] text-rose-600 font-medium px-2">
                ⚠ {erreurCorrIA}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
            {estBenchmarkActif
              ? correlationsBenchmark.map((c) => (
                  <div
                    key={`${c.colA}|${c.colB}`}
                    className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-[11px] sm:text-xs truncate">
                          {nettoyerNomAffichage(c.colA)} <span className="text-blue-500 font-normal">↔</span> {nettoyerNomAffichage(c.colB)}
                        </span>
                        <span className="font-mono text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-bold border border-blue-200/50 self-start sm:self-auto">
                          r = {c.rRef ?? "—"}
                        </span>
                      </div>

                      <div className="space-y-1.5 pt-1.5">
                        {c.comparaisons.map((comp) => (
                          <div
                            key={comp.source}
                            className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1"
                          >
                            <div className="flex items-center justify-between text-[10px] font-mono">
                              <span className="text-slate-600 dark:text-slate-300 truncate max-w-[80px] sm:max-w-none">
                                {nettoyerNomAffichage(comp.source)}
                              </span>
                              <span
                                className={`font-bold px-1 py-0.2 rounded text-[9px] ${
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

                            <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight line-clamp-2">
                              {comp.expl.diagnostic}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              : correlationsStandard.slice(0, 10).map((c) => {
                  const explTexte = expliquerCorrelationSimple(c.colonneA, c.colonneB, c.coefficient);
                  return (
                    <div
                      key={`${c.colonneA}|${c.colonneB}`}
                      className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-1.5 sm:space-y-2 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                          <span className="font-bold text-slate-900 dark:text-slate-100 text-[11px] sm:text-xs truncate">
                            {nettoyerNomAffichage(c.colonneA)} <span className="text-blue-500 font-normal">↔</span> {nettoyerNomAffichage(c.colonneB)}
                          </span>
                          <span className="font-mono font-bold bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] sm:text-xs border border-slate-200/60 dark:border-slate-700 self-start sm:self-auto shrink-0">
                            r = {c.coefficient}
                          </span>
                        </div>

                        <div className="text-[10px] sm:text-[11px] flex items-start gap-1 pt-1">
                          <Lightbulb className="w-3 h-3 text-blue-600 shrink-0 mt-0.5" />
                          <p className="text-slate-600 dark:text-slate-400 leading-snug line-clamp-3 sm:line-clamp-none">
                            {explTexte}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      </Depliant>

      {/* 5. MODULES D'EXPLORATION VISUELLE & TABLEAUX */}
      <section className="space-y-8">
        <div id="sec-previsions" className="scroll-mt-24">
          <ModulePrevisions entetes={entetes} corps={corps} />
        </div>
        <div id="sec-graphiques" className="scroll-mt-24">
          <GraphiqueGenerateur key={`g-${nomFichier}`} entetes={entetes} corps={corps} onEpingler={epinglerGraphique} />
        </div>
        <div id="sec-carte" className="scroll-mt-24">
          <CarteGeographique key={`c-${nomFichier}`} entetes={entetes} corps={corps} />
        </div>
        <div id="sec-tdc" className="scroll-mt-24">
          <TableauCroiseDynamique key={`t-${nomFichier}`} entetes={entetes} corps={corps} />
        </div>
      </section>
    </div>
  );
}

function CarteSyntheseItem({ bloc }: { bloc: { type: string; texte: string }; index: number }) {
  const textePropre = nettoyerNomAffichage(bloc.texte);
  const parties = textePropre.split(/:(.+)/);
  let titre = parties.length > 1 ? parties[0].trim() : "Point clé";
  let contenu = parties.length > 1 ? parties[1].trim() : textePropre;

  if (titre.toLowerCase() === "point cle" || titre.toLowerCase() === "point clé") {
    if (/lignes?|champ/i.test(contenu)) titre = "Périmètre audité";
    else if (/manquant|cellule|doublon/i.test(contenu)) titre = "Intégrité des données";
    else titre = "Constat analytique";
  }

  let icone = <TrendingUp className="w-3.5 h-3.5 text-blue-600" />;
  let badgeTexte = "Indicateur";
  let badgeCouleur = "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";

  if (bloc.type === "categorie") {
    icone = <PieChart className="w-3.5 h-3.5 text-slate-600" />;
    badgeTexte = "Catégorie";
    badgeCouleur = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  } else if (bloc.type === "numerique") {
    icone = <BarChart3 className="w-3.5 h-3.5 text-blue-600" />;
    badgeTexte = "Chiffres";
    badgeCouleur = "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  } else if (bloc.type === "qualite" || bloc.type === "intro") {
    icone = <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />;
    badgeTexte = "Qualité";
    badgeCouleur = "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  }

  const partiesTexte = contenu.split(/(\d+(?:[.,]\d+)?\s*%)/g);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between shadow-xs hover:shadow transition-shadow">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
          <div className="p-1 rounded bg-slate-50 dark:bg-slate-800">{icone}</div>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badgeCouleur}`}>
            {badgeTexte}
          </span>
        </div>
        <h4 className="font-bold text-[11px] sm:text-xs text-slate-800 dark:text-slate-200 mb-1 leading-snug line-clamp-2">
          {titre}
        </h4>
        <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 leading-snug line-clamp-3 sm:line-clamp-none">
          {partiesTexte.map((morceau, i) =>
            /(\d+(?:[.,]\d+)?\s*%)/.test(morceau) ? (
              <span
                key={i}
                className="inline-block px-1 py-0.2 mx-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 font-bold text-[10px]"
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
  id,
  titre,
  detail,
  children,
  parDefautOuvert = false,
}: {
  id?: string;
  titre: string;
  detail: string;
  children: ReactNode;
  parDefautOuvert?: boolean;
}) {
  return (
    <details id={id} className={`group ${carteStyle} scroll-mt-24`} open={parDefautOuvert}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 sm:px-6 py-3 sm:py-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
          <span className="text-sm sm:text-base md:text-lg font-bold text-slate-900 dark:text-white leading-tight">
            {titre}
          </span>
          <span className="text-[10px] sm:text-xs text-slate-400 font-medium">{detail}</span>
        </span>
        <ChevronDown
          className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180 print:hidden"
          aria-hidden
        />
      </summary>
      <div className="border-t border-slate-100 px-3 sm:px-6 py-3.5 sm:py-5 dark:border-slate-800">{children}</div>
    </details>
  );
}

function Ligne({ l, v, fort }: { l: string; v: string; fort?: boolean }) {
  return (
    <div
      className={`flex justify-between items-center gap-1.5 text-[10px] sm:text-xs ${
        fort ? "font-bold text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-400"
      }`}
    >
      <span className="truncate">{l}</span>
      <span className="whitespace-nowrap font-semibold font-mono shrink-0">{v}</span>
    </div>
  );
}