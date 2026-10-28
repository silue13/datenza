"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
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
  arrondir,
  estValeurVide,
  parseNombre,
  estColonneIdentifiant,
  estColonneTemporelle,
  type Cellule,
} from "../../lib/analyse/utils";
import { useData, type GraphiqueEpingle, type TypeGraphique } from "../context/DataContext";
import { lireFournisseur } from "../../lib/prefs";

type Agregation =
  | "Nombre"
  | "Somme"
  | "Moyenne"
  | "Mediane"
  | "Minimum"
  | "Maximum"
  | "Valeurs distinctes"
  | "Pourcentage";

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
];

const PALETTE_COMPARAISON = [
  { fill: "#1d4ed8", border: "#1e40af", bgLeger: "rgba(29, 78, 216, 0.12)" },
  { fill: "#0891b2", border: "#0e7490", bgLeger: "rgba(8, 145, 178, 0.12)" },
  { fill: "#d97706", border: "#b45309", bgLeger: "rgba(217, 119, 6, 0.12)" },
  { fill: "#059669", border: "#047857", bgLeger: "rgba(5, 150, 105, 0.12)" },
  { fill: "#dc2626", border: "#b91c1c", bgLeger: "rgba(220, 38, 38, 0.12)" },
  { fill: "#4f46e5", border: "#4338ca", bgLeger: "rgba(79, 70, 229, 0.12)" },
];

const MAX_CATEGORIES = 100;

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

// Générateur d'options Chart.js dynamique et sans surcharge de chiffres
// APRÈS (compatible avec Line, Bar, Pie et Doughnut)
function creerOptionsChart(nbPoints: number): any {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          boxWidth: 12,
          font: { size: 11, weight: "bold" as const },
        },
      },
      datalabels: {
        display: false,
      },
      tooltip: {
        enabled: true,
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        grid: { color: "rgba(148,163,184,0.15)" },
        ticks: { font: { size: 10 } },
        grace: "10%",
      },
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 10 },
          maxRotation: 45,
          minRotation: 0,
          autoSkip: nbPoints <= 15,
        },
      },
    },
  };
}

export default function GraphiqueGenerateur({ entetes, corps, onEpingler }: GraphiqueGenerateurProps) {
  const { graphiquesEpingles, epinglerGraphique, nomFichier } = useData();
  const actionEpingler = onEpingler || epinglerGraphique;

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
  const [agregation, setAgregation] = useState<Agregation>("Moyenne");
  const [ventilerParFichier, setVentilerParFichier] = useState<boolean>(estModeComparaison);
  const [graphiquesGeneres, setGraphiquesGeneres] = useState<GraphiqueEpingle[]>([]);
  const [messageErreur, setMessageErreur] = useState<string>("");
  const compteur = useRef(0);

  const estInclusPptx = (id: number | string) => {
    return (graphiquesEpingles || []).some((g) => g.id === id);
  };

  // 2. MOTEUR DE RECOMMANDATION SANS DOUBLON (1 seul graphique par donnée analysée)
  const graphiquesRecommandes = useMemo<GraphiqueEpingle[]>(() => {
    if (!entetes.length || !corps.length) return [];
    const resultats: GraphiqueEpingle[] = [];
    const mesuresDejaUtilisees = new Set<string>();

    // CAS BENCHMARK COMPARATIF (N Fichiers)
    if (estModeComparaison && sourcesFichiers.length >= 2) {
      const colX = colonnesTemporelles[0] || colonnesCategorielles[0] || colonnesSansSource[0];
      const colY = colonnesMesurables[0] || colonnesSansSource.find((c) => c !== colX) || "";

      if (colX && colY) {
        mesuresDejaUtilisees.add(colY);
        const idxX = entetes.indexOf(colX);
        const idxY = entetes.indexOf(colY);

        const modalitesUniques = Array.from(
          new Set(corps.map((l) => String(l[idxX] ?? "").replace(/["'«»“”]/g, "").trim()).filter(Boolean))
        );

        if (colonnesTemporelles.includes(colX)) {
          const sontAnnees = modalitesUniques.every((m) => /^(19|20)\d{2}$/.test(m));
          if (sontAnnees) {
            modalitesUniques.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
          }
        }

        const datasets = sourcesFichiers.map((sourceNom, sIdx) => {
          const couleur = PALETTE_COMPARAISON[sIdx % PALETTE_COMPARAISON.length];
          const data = modalitesUniques.map((mod) => {
            const lignes = corps.filter(
              (l) =>
                String(l[idxSource] ?? "").trim() === sourceNom &&
                String(l[idxX] ?? "").replace(/["'«»“”]/g, "").trim() === mod
            );
            if (!lignes.length) return 0;
            const nums = lignes.map((l) => versNombre(l[idxY])).filter((n): n is number => n !== null);
            if (!nums.length) return 0;
            return arrondir(nums.reduce((a, b) => a + b, 0) / nums.length);
          });

          return {
            label: sourceNom,
            data,
            backgroundColor: couleur.fill,
            borderColor: couleur.border,
            borderWidth: 2,
            borderRadius: 4,
          };
        });

        resultats.push({
          id: 930001,
          titre: `Benchmark (${sourcesFichiers.length} fichiers) : Moyenne de ${colY} selon ${colX}`,
          type: colonnesTemporelles.includes(colX) ? "Courbe" : "Barres",
          labels: modalitesUniques,
          datasets,
        });
      }
    }

    // CAS SÉRIES TEMPORELLES : Exactement 1 courbe par mesure (aucun clone en barres)
    if (colonnesTemporelles.length > 0 && colonnesMesurables.length > 0) {
      const colT = colonnesTemporelles[0];
      const idxT = entetes.indexOf(colT);

      // On explore jusqu'à 2 mesures DIFFÉRENTES (ex: Abidjan puis Adiaké)
      colonnesMesurables.forEach((colM, idxMIndex) => {
        if (mesuresDejaUtilisees.has(colM) || resultats.length >= 2) return;
        mesuresDejaUtilisees.add(colM);

        const idxM = entetes.indexOf(colM);
        const mapT = new Map<string, { somme: number; n: number; ordre: number }>();

        corps.forEach((ligne, i) => {
          if (estValeurVide(ligne[idxT])) return;
          const cle = String(ligne[idxT]).replace(/["'«»“”]/g, "").trim();
          const val = versNombre(ligne[idxM]);
          if (val === null) return;

          let ordre = i;
          if (/^(19|20)\d{2}$/.test(cle)) ordre = parseInt(cle, 10);

          const g = mapT.get(cle) ?? { somme: 0, n: 0, ordre };
          g.somme += val;
          g.n += 1;
          mapT.set(cle, g);
        });

        const pairesT = Array.from(mapT.entries())
          .sort((a, b) => a[1].ordre - b[1].ordre)
          .map(([label, g]) => ({ label, valeur: arrondir(g.somme / g.n) }));

        if (pairesT.length >= 2) {
          resultats.push({
            id: 910001 + idxMIndex,
            titre: `Évolution temporelle : ${colM} selon ${colT}`,
            type: "Courbe",
            labels: pairesT.map((p) => p.label),
            datasets: [
              {
                label: `Moyenne — ${colM}`,
                data: pairesT.map((p) => p.valeur),
                backgroundColor: "rgba(37, 99, 235, 0.12)",
                borderColor: "#2563eb",
                borderWidth: 2.5,
                fill: true,
                pointRadius: pairesT.length > 30 ? 2.5 : 3.5,
              },
            ],
          });
        }
      });
    }

    // CAS DIMENSIONS CATÉGORIELLES (Régions, Statuts, Cultures, etc.)
    if (colonnesCategorielles.length > 0 && colonnesMesurables.length > 0 && resultats.length < 2) {
      const catNom = colonnesCategorielles[0];
      // Privilégie une mesure qui n'a pas encore été analysée
      const mesNom =
        colonnesMesurables.find((m) => !mesuresDejaUtilisees.has(m)) ||
        colonnesMesurables[0];

      if (!mesuresDejaUtilisees.has(mesNom) || resultats.length === 0) {
        mesuresDejaUtilisees.add(mesNom);
        const idxC = entetes.indexOf(catNom);
        const idxM = entetes.indexOf(mesNom);

        const mapC = new Map<string, { somme: number; n: number }>();
        corps.forEach((ligne) => {
          if (estValeurVide(ligne[idxC])) return;
          const cle = String(ligne[idxC]).trim();
          const val = versNombre(ligne[idxM]);
          if (val === null) return;

          const g = mapC.get(cle) ?? { somme: 0, n: 0 };
          g.somme += val;
          g.n += 1;
          mapC.set(cle, g);
        });

        const pairesC = Array.from(mapC.entries())
          .map(([label, g]) => ({ label, valeur: arrondir(g.somme / g.n) }))
          .sort((a, b) => b.valeur - a.valeur)
          .slice(0, 35);

        if (pairesC.length >= 2) {
          resultats.push({
            id: 920001,
            titre: `Distribution : ${mesNom} par ${catNom}`,
            type: "Barres",
            labels: pairesC.map((p) => p.label),
            datasets: [
              {
                label: `Moyenne — ${mesNom}`,
                data: pairesC.map((p) => p.valeur),
                backgroundColor: "#2563eb",
                borderColor: "#1d4ed8",
                borderRadius: 4,
                borderWidth: 1,
              },
            ],
          });
        }
      }
    }

    return resultats;
  }, [entetes, corps, colonnesTemporelles, colonnesMesurables, colonnesCategorielles, colonnesSansSource, estModeComparaison, sourcesFichiers, idxSource]);

  function construireGraphiqueManuel() {
    setMessageErreur("");
    if (!colonneAxeX) {
      setMessageErreur("Veuillez sélectionner une colonne pour l'Axe X.");
      return;
    }

    if (typeGraphique === "Carte") {
      compteur.current += 1;
      const carte: GraphiqueEpingle = {
        id: Date.now() * 1000 + compteur.current,
        titre: `Carte géographique — ${colonneAxeX}`,
        type: "Carte",
        labels: [],
        datasets: [{ label: "Occurrences", data: [], backgroundColor: "#2563eb" }],
      };
      setGraphiquesGeneres((prev) => [carte, ...prev]);
      return;
    }

    const idxX = entetes.indexOf(colonneAxeX);
    const idxY = entetes.indexOf(colonneAxeY);
    const besoinY = !["Nombre", "Pourcentage"].includes(agregation);

    if (besoinY && idxY === -1) {
      setMessageErreur("Veuillez sélectionner une colonne pour l'axe Y.");
      return;
    }

    compteur.current += 1;
    const titreMesure = agregation === "Nombre" ? "Effectif" : `${agregation} — ${colonneAxeY}`;

    if (estModeComparaison && ventilerParFichier && sourcesFichiers.length >= 2) {
      const modalitesUniques = Array.from(
        new Set(corps.map((l) => String(l[idxX] ?? "").replace(/["'«»“”]/g, "").trim()).filter(Boolean))
      ).slice(0, MAX_CATEGORIES);

      if (typeGraphique === "Courbe" && modalitesUniques.every((m) => /^(19|20)\d{2}$/.test(m))) {
        modalitesUniques.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      }

      const datasets = sourcesFichiers.map((sourceNom, sIdx) => {
        const couleur = PALETTE_COMPARAISON[sIdx % PALETTE_COMPARAISON.length];
        const data = modalitesUniques.map((mod) => {
          const lignesFiltrees = corps.filter(
            (l) =>
              String(l[idxSource] ?? "").trim() === sourceNom &&
              String(l[idxX] ?? "").replace(/["'«»“”]/g, "").trim() === mod
          );

          if (!lignesFiltrees.length) return 0;
          if (agregation === "Nombre") return lignesFiltrees.length;

          const valeurs = lignesFiltrees.map((l) => versNombre(l[idxY])).filter((n): n is number => n !== null);
          if (!valeurs.length) return 0;
          const somme = valeurs.reduce((a, b) => a + b, 0);

          if (agregation === "Moyenne") return arrondir(somme / valeurs.length);
          if (agregation === "Minimum") return Math.min(...valeurs);
          if (agregation === "Maximum") return Math.max(...valeurs);
          return arrondir(somme);
        });

        return {
          label: sourceNom,
          data,
          backgroundColor: typeGraphique === "Courbe" ? couleur.bgLeger : couleur.fill,
          borderColor: couleur.border,
          borderWidth: 2,
          borderRadius: 4,
          fill: typeGraphique === "Courbe",
        };
      });

      const nouveau: GraphiqueEpingle = {
        id: Date.now() * 1000 + compteur.current,
        titre: `Benchmark (${sourcesFichiers.length} fichiers) : ${titreMesure} selon ${colonneAxeX}`,
        type: typeGraphique,
        labels: modalitesUniques,
        datasets,
      };

      setGraphiquesGeneres((prev) => [nouveau, ...prev]);
      return;
    }

    const groupes = new Map<string, { somme: number; nNum: number; compte: number; min: number; max: number }>();
    for (const ligne of corps) {
      if (estValeurVide(ligne[idxX])) continue;
      const cle = String(ligne[idxX]).replace(/["'«»“”]/g, "").trim();
      const g = groupes.get(cle) ?? { somme: 0, nNum: 0, compte: 0, min: Infinity, max: -Infinity };
      g.compte += 1;
      if (besoinY && idxY !== -1) {
        const n = versNombre(ligne[idxY]);
        if (n !== null) {
          g.somme += n;
          g.nNum += 1;
          if (n < g.min) g.min = n;
          if (n > g.max) g.max = n;
        }
      }
      groupes.set(cle, g);
    }

    let paires = [...groupes.entries()].map(([label, g]) => {
      let valeur = g.compte;
      if (agregation === "Somme") valeur = g.somme;
      if (agregation === "Moyenne") valeur = g.nNum ? g.somme / g.nNum : 0;
      if (agregation === "Minimum") valeur = g.min !== Infinity ? g.min : 0;
      if (agregation === "Maximum") valeur = g.max !== -Infinity ? g.max : 0;
      return { label, valeur: arrondir(valeur) };
    });

    if (typeGraphique === "Courbe") {
      const sontAnnees = paires.every((p) => /^(19|20)\d{2}$/.test(p.label));
      if (sontAnnees) {
        paires.sort((a, b) => parseInt(a.label, 10) - parseInt(b.label, 10));
      }
    } else {
      paires.sort((a, b) => b.valeur - a.valeur);
    }

    paires = paires.slice(0, MAX_CATEGORIES);

    const nouveau: GraphiqueEpingle = {
      id: Date.now() * 1000 + compteur.current,
      titre: `${titreMesure} selon ${colonneAxeX}`,
      type: typeGraphique,
      labels: paires.map((p) => p.label),
      datasets: [
        {
          label: titreMesure,
          data: paires.map((p) => p.valeur),
          backgroundColor:
            typeGraphique === "Camembert"
              ? paires.map((_, i) => PALETTE[i % PALETTE.length])
              : "#2563eb",
          borderColor: "#1d4ed8",
          borderRadius: 4,
          borderWidth: 1,
        },
      ],
    };

    setGraphiquesGeneres((prev) => [nouveau, ...prev]);
  }

  return (
    <div className="space-y-6">
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
              const prendPleinLargeur = graphiquesRecommandes.length === 1 || nbPoints > 20;

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
                      onClick={() => actionEpingler && actionEpingler(g)}
                      className={`no-print print:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer ${
                        estEpingle
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
                      }`}
                    >
                      <Presentation className="w-3.5 h-3.5" />
                      {estEpingle ? "✓ Inclus au PPTX" : "+ Ajouter au PPTX"}
                    </button>
                  </div>

                  {/* CONTENEUR À LARGEUR ÉTIRÉE AVEC DÉFILEMENT POUR TOUT LE JEU DE DONNÉES */}
                  <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 pb-2">
                    <div
                      style={{
                        minWidth: calculerLargeurConteneur(nbPoints),
                        height: "280px",
                      }}
                      className="relative"
                    >
                      {g.type === "Courbe" ? (
                        <Line data={g} options={creerOptionsChart(nbPoints)} />
                      ) : (
                        <Bar data={g} options={creerOptionsChart(nbPoints)} />
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
                  <option value="Moyenne">Moyenne</option>
                  <option value="Somme">Somme cumulée</option>
                  <option value="Nombre">Nombre d’enregistrements</option>
                  <option value="Minimum">Minimum</option>
                  <option value="Maximum">Maximum</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Axe Y (Mesure)
                </label>
                <select
                  value={colonneAxeY}
                  onChange={(e) => setColonneAxeY(e.target.value)}
                  disabled={colonnesSansSource.length === 0 || agregation === "Nombre"}
                  className={`${selectClasse} disabled:opacity-40`}
                >
                  {colonnesMesurables
                    .filter((c) => c !== colonneAxeX)
                    .map((nom) => (
                      <option key={nom} value={nom}>{nom}</option>
                    ))}
                  {colonnesMesurables.length === 0 &&
                    colonnesSansSource
                      .filter((c) => c !== colonneAxeX)
                      .map((nom) => (
                        <option key={nom} value={nom}>{nom}</option>
                      ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
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
                        onClick={() => actionEpingler && actionEpingler(g)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          estEpingle
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
                        }`}
                      >
                        <Presentation className="w-3.5 h-3.5" />
                        {estEpingle ? "✓ Inclus au PPTX" : "+ Ajouter au PPTX"}
                      </button>
                      <button
                        onClick={() => setGraphiquesGeneres((prev) => prev.filter((x) => x.id !== g.id))}
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
                    {g.type !== "Carte" && (
                      <div
                        style={{
                          minWidth: g.type === "Camembert" || g.type === "Anneau" ? "100%" : calculerLargeurConteneur(nbPoints),
                          height: "280px",
                        }}
                        className="relative"
                      >
                        {g.type === "Barres" && <Bar data={g} options={creerOptionsChart(nbPoints)} />}
                        {g.type === "Courbe" && <Line data={g} options={creerOptionsChart(nbPoints)} />}
                        {g.type === "Camembert" && <Pie data={g} options={creerOptionsChart(nbPoints)} />}
                        {g.type === "Anneau" && <Doughnut data={g} options={{ ...creerOptionsChart(nbPoints), cutout: "68%" }} />}
                      </div>
                    )}
                  </div>

                  <ExplicationDetailleeGraphique graphique={g} nomFichier={nomFichier} />
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
  const estComparatifMultiSeries = (graphique.datasets || []).length >= 2;

  const [syntheseDecisionnelle, setSyntheseDecisionnelle] = useState<string | null>(null);
  const [chargement, setChargement] = useState<boolean>(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const analyse = useMemo(() => {
    const labels = (graphique.labels || []).map(String);
    const datasets = graphique.datasets || [];
    if (!labels.length || !datasets.length) return null;

    if (estComparatifMultiSeries) {
      const syntheseDatasets = datasets.map((d) => {
        const nums = (d.data || []).map((v) => Number(v) || 0);
        const total = nums.reduce((acc, v) => acc + v, 0);
        const moyenne = nums.length ? total / nums.length : 0;
        return {
          nom: d.label || "Série",
          total: Math.round(total * 100) / 100,
          moyenne: Math.round(moyenne * 100) / 100,
          data: nums,
        };
      });

      const classement = [...syntheseDatasets].sort((a, b) => b.total - a.total);
      const leader = classement[0];
      const dauphin = classement[1];
      const ecartLeaderDauphin = Math.round((leader.total - dauphin.total) * 100) / 100;
      const pctAvance = dauphin.total > 0 ? Math.round((ecartLeaderDauphin / dauphin.total) * 1000) / 10 : 0;

      const victoiresParSource: Record<string, number> = {};
      syntheseDatasets.forEach((d) => (victoiresParSource[d.nom] = 0));

      let plusGrosEcart = {
        label: labels[0],
        amplitude: -1,
        premier: "",
        valeurPremier: 0,
        second: "",
        valeurSecond: 0,
      };

      labels.forEach((lab, idx) => {
        const pointsSurCat = syntheseDatasets
          .map((d) => ({ nom: d.nom, val: d.data[idx] || 0 }))
          .sort((a, b) => b.val - a.val);

        const premierCat = pointsSurCat[0];
        const secondCat = pointsSurCat[1] || { nom: "", val: 0 };
        const amplitudeCat = Math.round((premierCat.val - secondCat.val) * 100) / 100;

        if (premierCat && victoiresParSource[premierCat.nom] !== undefined) {
          victoiresParSource[premierCat.nom]++;
        }

        if (amplitudeCat > plusGrosEcart.amplitude) {
          plusGrosEcart = {
            label: lab,
            amplitude: amplitudeCat,
            premier: premierCat.nom,
            valeurPremier: premierCat.val,
            second: secondCat.nom,
            valeurSecond: secondCat.val,
          };
        }
      });

      const classementVictoires = Object.entries(victoiresParSource).sort((a, b) => b[1] - a[1]);

      return {
        estComparatif: true as const,
        nombreSeries: datasets.length,
        syntheseDatasets,
        classement,
        leader,
        dauphin,
        ecartLeaderDauphin,
        pctAvance,
        victoiresParSource,
        classementVictoires,
        plusGrosEcart,
        nbPoints: labels.length,
      };
    }

    const points = labels.map((l, idx) => ({
      label: l,
      valeur: Number(datasets[0]?.data[idx]) || 0,
    }));

    const total = points.reduce((acc, p) => acc + p.valeur, 0);
    const triees = [...points].sort((a, b) => b.valeur - a.valeur);
    const max = triees[0];
    const min = triees[triees.length - 1];
    const ecartAbsolu = Math.round((max.valeur - min.valeur) * 100) / 100;
    const ratio = min.valeur > 0 ? Math.round((max.valeur / min.valeur) * 10) / 10 : null;

    return {
      estComparatif: false as const,
      max,
      min,
      ecartAbsolu,
      ratio,
      moyenne: Math.round((total / points.length) * 100) / 100,
      nbModalites: points.length,
    };
  }, [graphique, estComparatifMultiSeries]);

  async function genererSyntheseApprofondie() {
    setChargement(true);
    setErreur(null);
    try {
      const labels = (graphique.labels || []).map(String);
      const resumePoints = labels.slice(0, 10).map((lab, i) => {
        const val = (graphique.datasets || []).map((d) => `${d.label || "Valeur"}: ${d.data[i] ?? 0}`).join(", ");
        return `${lab} (${val})`;
      });

      const contexteUltraCourt = JSON.stringify({
        fichier: nomFichier || "Données",
        graphique: graphique.titre,
        type: graphique.type,
        donnees: resumePoints,
      });

      const question = `Rédige une analyse managériale concise de ce graphique intitulé "${graphique.titre}" :
- Constat majeur chiffré (volume, part dominante ou concentration).
- Contraste ou divergence opérationnelle notable.
- Recommandation concrète d'action.
Reste concis, précis, direct et professionnel, sans formule d'introduction ni de conclusion. Ne mentionne jamais que tu es une IA.`;

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
            {analyse.estComparatif
              ? `Lecture comparative multi-sources (${analyse.nombreSeries} fichiers) :`
              : "Indicateurs & Points clés :"}
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

      {analyse.estComparatif ? (
        <div className="space-y-1.5">
          <div className="flex items-start gap-1.5">
            <span className="font-bold text-blue-600">•</span>
            <p className="text-slate-700 dark:text-slate-300">
              <strong>Leader global du graphique : </strong>
              <strong>« {analyse.leader.nom} »</strong> arrive en première position avec un volume cumulé de{" "}
              <strong>{analyse.leader.total.toLocaleString("fr-FR")}</strong> (moyenne de {analyse.leader.moyenne.toLocaleString("fr-FR")} par élément), devançant <strong>« {analyse.dauphin.nom} »</strong> de{" "}
              <span className="font-bold text-emerald-600">
                +{analyse.ecartLeaderDauphin.toLocaleString("fr-FR")} (+{analyse.pctAvance} %)
              </span>.
            </p>
          </div>

          <div className="flex items-start gap-1.5">
            <span className="font-bold text-blue-600">•</span>
            <p className="text-slate-700 dark:text-slate-300">
              <strong>Répartition des positions : </strong>
              {analyse.classementVictoires.map(([nom, victoires], i) => (
                <span key={nom}>
                  <strong>« {nom} »</strong> l&apos;emporte sur {victoires} catégorie(s)
                  {i < analyse.classementVictoires.length - 1 ? ", " : "."}
                </span>
              ))}
            </p>
          </div>

          <div className="flex items-start gap-1.5">
            <span className="font-bold text-blue-600">•</span>
            <p className="text-slate-700 dark:text-slate-300">
              <strong>Plus forte divergence constatée : </strong>
              Sur <strong>« {analyse.plusGrosEcart.label} »</strong>, l&apos;écart atteint{" "}
              <strong>{analyse.plusGrosEcart.amplitude.toLocaleString("fr-FR")}</strong> en faveur de{" "}
              <strong>« {analyse.plusGrosEcart.premier} »</strong> ({analyse.plusGrosEcart.valeurPremier.toLocaleString("fr-FR")} vs {analyse.plusGrosEcart.valeurSecond.toLocaleString("fr-FR")} pour {analyse.plusGrosEcart.second}).
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-start gap-1.5">
            <span className="font-bold text-blue-600">•</span>
            <p className="text-slate-700 dark:text-slate-300">
              <strong>Pôle dominant :</strong> <strong>{analyse.max.label}</strong> ({analyse.max.valeur.toLocaleString("fr-FR")}).
            </p>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="font-bold text-blue-600">•</span>
            <p className="text-slate-700 dark:text-slate-300">
              <strong>Pôle en retrait :</strong> <strong>{analyse.min.label}</strong> ({analyse.min.valeur.toLocaleString("fr-FR")}).
            </p>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="font-bold text-blue-600">•</span>
            <p className="text-slate-700 dark:text-slate-300">
              <strong>Disparité :</strong> Écart de <strong>{analyse.ecartAbsolu.toLocaleString("fr-FR")}</strong>
              {analyse.ratio ? ` (ratio de ${analyse.ratio}×)` : ""}.
            </p>
          </div>
        </div>
      )}

      {syntheseDecisionnelle && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            <span className="uppercase tracking-wider">Synthèse décisionnelle &amp; Recommandations :</span>
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