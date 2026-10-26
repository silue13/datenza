"use client";

import { useMemo, useRef, useState } from "react";
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2";
import {
  Sparkles,
  AlertCircle,
  Plus,
  Trash2,
  Scale,
} from "lucide-react";
import CarteGeographique from "./CarteGeographique";
import "./chartSetup";
import { arrondir, estValeurVide, parseNombre, type Cellule } from "../../lib/analyse/utils";
import type { GraphiqueEpingle, TypeGraphique } from "../context/DataContext";

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
  "#0891b2",
  "#6366f1",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#e11d48",
  "#64748b",
  "#14b8a6",
];

// Palette rotative pour N sources (Remplissage, Bordure et Fond léger pour courbes)
const PALETTE_COMPARAISON = [
  { fill: "#4f46e5", border: "#3730a3", bgLeger: "rgba(79, 70, 229, 0.12)" }, // Source 1 (Indigo)
  { fill: "#0891b2", border: "#0e7490", bgLeger: "rgba(8, 145, 178, 0.12)" }, // Source 2 (Cyan)
  { fill: "#f59e0b", border: "#d97706", bgLeger: "rgba(245, 158, 11, 0.12)" }, // Source 3 (Ambre)
  { fill: "#10b981", border: "#059669", bgLeger: "rgba(16, 185, 129, 0.12)" }, // Source 4 (Émeraude)
  { fill: "#ec4899", border: "#be185d", bgLeger: "rgba(236, 72, 153, 0.12)" }, // Source 5 (Rose)
  { fill: "#8b5cf6", border: "#6d28d9", bgLeger: "rgba(139, 92, 246, 0.12)" }, // Source 6 (Violet)
];

const MAX_CATEGORIES = 15;

function versNombre(v: Cellule): number | null {
  if (estValeurVide(v)) return null;
  return parseNombre(v);
}

const selectClasse =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-medium focus:ring-2 focus:ring-purple-500";

export default function GraphiqueGenerateur({ entetes, corps, onEpingler }: GraphiqueGenerateurProps) {
  // Détection du mode comparaison multi-sources
  const estModeComparaison = entetes.includes("Fichier Source");
  const idxSource = entetes.indexOf("Fichier Source");

  const sourcesFichiers = useMemo(() => {
    if (!estModeComparaison || idxSource === -1) return [];
    return Array.from(new Set(corps.map((l) => String(l[idxSource] ?? "").trim()).filter(Boolean)));
  }, [estModeComparaison, idxSource, corps]);

  const colonnesSansSource = useMemo(() => {
    return entetes.filter((h) => h !== "Fichier Source");
  }, [entetes]);

  const [typeGraphique, setTypeGraphique] = useState<TypeGraphique>("Barres");
  const [colonneAxeX, setColonneAxeX] = useState<string>(colonnesSansSource[0] || entetes[0] || "");
  const [colonneAxeY, setColonneAxeY] = useState<string>(colonnesSansSource[1] || colonnesSansSource[0] || "");
  const [agregation, setAgregation] = useState<Agregation>("Moyenne");
  const [ventilerParFichier, setVentilerParFichier] = useState<boolean>(estModeComparaison);
  const [graphiquesGeneres, setGraphiquesGeneres] = useState<GraphiqueEpingle[]>([]);
  const [messageErreur, setMessageErreur] = useState<string>("");
  const compteur = useRef(0);

  // 1. RECOMMANDATIONS AUTOMATIQUES (Standard ou Benchmark N)
  const graphiquesRecommandes = useMemo<GraphiqueEpingle[]>(() => {
    if (!entetes.length || !corps.length) return [];

    const normaliser = (v: Cellule) => String(v ?? "").trim();
    const normaliserNom = (v: string) =>
      v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    const colonnes = colonnesSansSource.map((nom) => {
      const index = entetes.indexOf(nom);
      const valeurs = corps.map((ligne) => ligne[index]).filter((v) => !estValeurVide(v));
      const nombres = valeurs.map(versNombre).filter((v): v is number => v !== null);
      const uniques = new Set(valeurs.map(normaliser));
      const nomN = normaliserNom(nom);
      const tauxNumerique = valeurs.length ? nombres.length / valeurs.length : 0;
      const tauxUnique = valeurs.length ? uniques.size / valeurs.length : 0;

      const identifiant =
        /(^|[^a-z])(id|uuid|matricule|code|reference|ref|numero|num)([^a-z]|$)/.test(nomN) ||
        (valeurs.length >= 12 && tauxUnique >= 0.9 && tauxNumerique < 0.9);

      const numerique = tauxNumerique >= 0.8 && nombres.length >= 3 && !identifiant;
      const categorielle = !numerique && !identifiant && uniques.size >= 2 && uniques.size <= 12;

      return { nom, index, numerique, categorielle, uniques: Array.from(uniques) };
    });

    const numeriques = colonnes.filter((c) => c.numerique);
    const categories = colonnes.filter((c) => c.categorielle);
    const resultats: GraphiqueEpingle[] = [];

    // SCÉNARIO A : RECOMMANDATIONS DE BENCHMARK MULTI-SOURCES
    if (estModeComparaison && sourcesFichiers.length >= 2 && numeriques.length > 0 && categories.length > 0) {
      const mesure = numeriques[0];
      const cat = categories[0];
      const modalites = cat.uniques.slice(0, 7);

      const datasets = sourcesFichiers.map((sourceNom, sIdx) => {
        const couleur = PALETTE_COMPARAISON[sIdx % PALETTE_COMPARAISON.length];
        const data = modalites.map((modalite) => {
          const valeurs = corps
            .filter(
              (l) =>
                String(l[idxSource] ?? "").trim() === sourceNom &&
                String(l[cat.index] ?? "").trim() === modalite
            )
            .map((l) => versNombre(l[mesure.index]))
            .filter((n): n is number => n !== null);

          if (!valeurs.length) return 0;
          const somme = valeurs.reduce((a, b) => a + b, 0);
          return arrondir(somme / valeurs.length);
        });

        return {
          label: sourceNom,
          data,
          backgroundColor: couleur.fill,
          borderColor: couleur.border,
          borderWidth: 1,
          borderRadius: 4,
        };
      });

      resultats.push({
        id: 930001,
        titre: `Benchmark : Moyenne de ${mesure.nom} par ${cat.nom}`,
        type: "Barres",
        labels: modalites,
        datasets,
      });

      if (categories.length > 1) {
        const cat2 = categories[1];
        const modalites2 = cat2.uniques.slice(0, 7);

        const datasets2 = sourcesFichiers.map((sourceNom, sIdx) => {
          const couleur = PALETTE_COMPARAISON[sIdx % PALETTE_COMPARAISON.length];
          const data = modalites2.map((modalite) => {
            const valeurs = corps
              .filter(
                (l) =>
                  String(l[idxSource] ?? "").trim() === sourceNom &&
                  String(l[cat2.index] ?? "").trim() === modalite
              )
              .map((l) => versNombre(l[mesure.index]))
              .filter((n): n is number => n !== null);

            if (!valeurs.length) return 0;
            const somme = valeurs.reduce((a, b) => a + b, 0);
            return arrondir(somme / valeurs.length);
          });

          return {
            label: sourceNom,
            data,
            backgroundColor: couleur.fill,
            borderColor: couleur.border,
            borderWidth: 1,
            borderRadius: 4,
          };
        });

        resultats.push({
          id: 930002,
          titre: `Benchmark : ${mesure.nom} selon ${cat2.nom}`,
          type: "Barres",
          labels: modalites2,
          datasets: datasets2,
        });
      }

      return resultats;
    }

    // SCÉNARIO B : RECOMMANDATIONS CLASSIQUES (1 FICHIER)
    for (const cat of categories) {
      if (resultats.length >= 2) break;
      const mesure = numeriques[0];
      if (!mesure) continue;

      const groupes = new Map<string, { somme: number; n: number }>();
      for (const ligne of corps) {
        const cVal = normaliser(ligne[cat.index]);
        const mVal = versNombre(ligne[mesure.index]);
        if (!cVal || mVal === null) continue;
        const g = groupes.get(cVal) ?? { somme: 0, n: 0 };
        g.somme += mVal;
        g.n += 1;
        groupes.set(cVal, g);
      }

      const pts = [...groupes.entries()]
        .filter(([, g]) => g.n > 0)
        .map(([label, g]) => ({ label, valeur: arrondir(g.somme / g.n) }))
        .sort((a, b) => b.valeur - a.valeur)
        .slice(0, 8);

      if (pts.length >= 2) {
        resultats.push({
          id: 920010 + resultats.length,
          titre: `Moyenne de ${mesure.nom} par ${cat.nom}`,
          type: "Barres",
          labels: pts.map((p) => p.label),
          datasets: [
            {
              label: `Moyenne — ${mesure.nom}`,
              data: pts.map((p) => p.valeur),
              backgroundColor: "#0891b2",
              borderColor: "#0e7490",
              borderRadius: 4,
              borderWidth: 1,
            },
          ],
        });
      }
    }

    return resultats;
  }, [entetes, corps, colonnesSansSource, estModeComparaison, sourcesFichiers, idxSource]);

  // Construction manuelle d'un graphique (avec support N fichiers)
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
        datasets: [{ label: "Occurrences", data: [], backgroundColor: "#0891b2" }],
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
    const titreMesure =
      agregation === "Nombre"
        ? "Effectif"
        : `${agregation} — ${colonneAxeY}`;

    // OPTION BENCHMARK MULTI-SOURCES : Séries dédiées côte à côte
    if (estModeComparaison && ventilerParFichier && sourcesFichiers.length >= 2) {
      const modalitesUniques = Array.from(
        new Set(corps.map((l) => String(l[idxX] ?? "").trim()).filter(Boolean))
      ).slice(0, MAX_CATEGORIES);

      const datasets = sourcesFichiers.map((sourceNom, sIdx) => {
        const couleur = PALETTE_COMPARAISON[sIdx % PALETTE_COMPARAISON.length];
        const data = modalitesUniques.map((mod) => {
          const lignesFiltrees = corps.filter(
            (l) =>
              String(l[idxSource] ?? "").trim() === sourceNom &&
              String(l[idxX] ?? "").trim() === mod
          );

          if (!lignesFiltrees.length) return 0;
          if (agregation === "Nombre") return lignesFiltrees.length;

          const valeurs = lignesFiltrees
            .map((l) => versNombre(l[idxY]))
            .filter((n): n is number => n !== null);

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

    // MODE STANDARD (Série unique)
    const groupes = new Map<string, { somme: number; nNum: number; compte: number }>();
    for (const ligne of corps) {
      if (estValeurVide(ligne[idxX])) continue;
      const cle = String(ligne[idxX]).trim();
      const g = groupes.get(cle) ?? { somme: 0, nNum: 0, compte: 0 };
      g.compte += 1;
      if (besoinY && idxY !== -1) {
        const n = versNombre(ligne[idxY]);
        if (n !== null) {
          g.somme += n;
          g.nNum += 1;
        }
      }
      groupes.set(cle, g);
    }

    let paires = [...groupes.entries()].map(([label, g]) => {
      let valeur = g.compte;
      if (agregation === "Somme") valeur = g.somme;
      if (agregation === "Moyenne") valeur = g.nNum ? g.somme / g.nNum : 0;
      if (agregation === "Minimum" || agregation === "Maximum") valeur = g.somme;
      return { label, valeur: arrondir(valeur) };
    });

    if (typeGraphique !== "Courbe") paires.sort((a, b) => b.valeur - a.valeur);
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
              : "#0891b2",
          borderColor: "#0e7490",
          borderRadius: 4,
          borderWidth: 1,
        },
      ],
    };

    setGraphiquesGeneres((prev) => [nouveau, ...prev]);
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: { boxWidth: 12, font: { size: 11, weight: "bold" as const } },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "rgba(148,163,184,0.15)" },
        ticks: { font: { size: 10 } },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0 },
      },
    },
  };

  return (
    <div className="space-y-6">
      {/* BANNIÈRE DE BENCHMARK ACTIF */}
      {estModeComparaison && (
        <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                Mode Comparatif Actif ({sourcesFichiers.length} fichiers confrontés)
              </p>
              <p className="text-[11px] text-indigo-600 dark:text-indigo-400">
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

      {/* 1. SECTION RECOMMANDATIONS */}
      {graphiquesRecommandes.length > 0 && (
        <section className="space-y-4">
          <div className="no-print">
            <h4 className="text-base font-bold text-slate-900 dark:text-white">
              {estModeComparaison ? "Analyses comparatives suggérées" : "Graphiques recommandés automatiquement"}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Visualisations optimisées avec calcul automatique des écarts, des classements et des dominances.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {graphiquesRecommandes.map((g, index) => (
              <div
                key={g.id}
                className="print-eviter-coupure bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {g.titre}
                  </h4>
                  <span className="text-[10px] bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
                    {estModeComparaison ? `Benchmark #${index + 1}` : `Recommandation #${index + 1}`}
                  </span>
                </div>

                <div className="h-64 w-full relative">
                  {g.type === "Courbe" ? <Line data={g} options={options} /> : <Bar data={g} options={options} />}
                </div>

                <ExplicationDetailleeGraphique graphique={g} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2. FORMULAIRE DE CRÉATION MANUELLE */}
      <div className="no-print bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
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
                className="accent-indigo-600 h-4 w-4 rounded cursor-pointer"
              />
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                Dédier une série par fichier ({sourcesFichiers.length} sources)
              </span>
            </label>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Format d&apos;affichage
            </label>
            <select
              value={typeGraphique}
              onChange={(e) => setTypeGraphique(e.target.value as TypeGraphique)}
              className={selectClasse}
            >
              <option value="Barres">Barres (côte à côte)</option>
              <option value="Courbe">Courbes superposées</option>
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

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Opération de calcul
            </label>
            <select
              value={agregation}
              onChange={(e) => setAgregation(e.target.value as Agregation)}
              className={selectClasse}
            >
              <option value="Somme">Somme cumulée</option>
              <option value="Moyenne">Moyenne</option>
              <option value="Nombre">Nombre de lignes (effectif)</option>
              <option value="Minimum">Minimum</option>
              <option value="Maximum">Maximum</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Axe Y (valeurs numériques)
            </label>
            <select
              value={colonneAxeY}
              onChange={(e) => setColonneAxeY(e.target.value)}
              disabled={colonnesSansSource.length === 0 || agregation === "Nombre"}
              className={`${selectClasse} disabled:opacity-40`}
            >
              {colonnesSansSource.map((nom) => (
                <option key={nom} value={nom}>{nom}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={construireGraphiqueManuel}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs rounded-xl shadow transition cursor-pointer"
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

      {/* 3. VOS GRAPHIQUES CRÉÉS */}
      {graphiquesGeneres.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
            Vos graphiques créés ({graphiquesGeneres.length})
          </h4>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {graphiquesGeneres.map((g) => (
              <div
                key={g.id}
                className="print-eviter-coupure bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {g.titre}
                  </h4>
                  <div className="no-print flex items-center gap-2">
                    {onEpingler && (
                      <button
                        onClick={() => onEpingler(g)}
                        className="text-xs font-semibold text-purple-700 hover:text-purple-900 border border-purple-200 px-2.5 py-1 rounded-lg cursor-pointer"
                      >
                        ★ Épingler
                      </button>
                    )}
                    <button
                      onClick={() => setGraphiquesGeneres((prev) => prev.filter((x) => x.id !== g.id))}
                      className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className={g.type === "Carte" ? "w-full min-h-[340px]" : "h-64 w-full relative"}>
                  {g.type === "Carte" && <CarteGeographique entetes={entetes} corps={corps} />}
                  {g.type === "Barres" && <Bar data={g} options={options} />}
                  {g.type === "Courbe" && <Line data={g} options={options} />}
                  {g.type === "Camembert" && <Pie data={g} options={options} />}
                  {g.type === "Anneau" && <Doughnut data={g} options={{ ...options, cutout: "68%" }} />}
                </div>

                <ExplicationDetailleeGraphique graphique={g} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** COMPOSANT D'EXPLICATION AUTOMATIQUE (CALCUL APPROFONDI POUR N >= 2 FICHIERS) */
function ExplicationDetailleeGraphique({ graphique }: { graphique: GraphiqueEpingle }) {
  const estComparatifMultiSeries = (graphique.datasets || []).length >= 2;

  const analyse = useMemo(() => {
    const labels = (graphique.labels || []).map(String);
    const datasets = graphique.datasets || [];
    if (!labels.length || !datasets.length) return null;

    // SCÉNARIO 1 : ANALYSE COMPARATIVE MULTI-SOURCES (N >= 2)
    if (estComparatifMultiSeries) {
      // 1. Calcul des totaux et moyennes pour chaque dataset
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

      // Classement par volume total
      const classement = [...syntheseDatasets].sort((a, b) => b.total - a.total);
      const leader = classement[0];
      const dauphin = classement[1];
      const ecartLeaderDauphin = Math.round((leader.total - dauphin.total) * 100) / 100;
      const pctAvance = dauphin.total > 0 ? Math.round((ecartLeaderDauphin / dauphin.total) * 1000) / 10 : 0;

      // 2. Décompte des victoires par catégorie (qui mène sur quoi ?)
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

    // SCÉNARIO 2 : ANALYSE STANDARD (SÉRIE UNIQUE)
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

  if (!analyse) return null;

  return (
    <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 p-3.5 space-y-2 text-[11px] leading-relaxed">
      <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-1.5">
        <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
        <h5 className="font-bold text-slate-800 dark:text-slate-200">
          {analyse.estComparatif
            ? `Lecture comparative multi-sources (${analyse.nombreSeries} fichiers confrontés) :`
            : "Comprendre ce graphique en détail :"}
        </h5>
      </div>

      {analyse.estComparatif ? (
        <div className="space-y-1.5">
          {/* Bilan des volumes et leader */}
          <div className="flex items-start gap-1.5">
            <span className="font-bold text-indigo-600">•</span>
            <p className="text-slate-700 dark:text-slate-300">
              <strong>Leader global du graphique : </strong>
              <strong>« {analyse.leader.nom} »</strong> arrive en première position avec un volume cumulé de{" "}
              <strong>{analyse.leader.total.toLocaleString("fr-FR")}</strong> (moyenne de {analyse.leader.moyenne.toLocaleString("fr-FR")} par élément), devançant <strong>« {analyse.dauphin.nom} »</strong> de{" "}
              <span className="font-bold text-emerald-600">
                +{analyse.ecartLeaderDauphin.toLocaleString("fr-FR")} (+{analyse.pctAvance} %)
              </span>.
            </p>
          </div>

          {/* Décompte des victoires par catégorie */}
          <div className="flex items-start gap-1.5">
            <span className="font-bold text-indigo-600">•</span>
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

          {/* Plus forte divergence */}
          <div className="flex items-start gap-1.5">
            <span className="font-bold text-indigo-600">•</span>
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
            <span className="font-bold text-purple-600">•</span>
            <p className="text-slate-700 dark:text-slate-300">
              <strong>Pôle dominant :</strong> <strong>{analyse.max.label}</strong> ({analyse.max.valeur.toLocaleString("fr-FR")}).
            </p>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="font-bold text-purple-600">•</span>
            <p className="text-slate-700 dark:text-slate-300">
              <strong>Pôle en retrait :</strong> <strong>{analyse.min.label}</strong> ({analyse.min.valeur.toLocaleString("fr-FR")}).
            </p>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="font-bold text-purple-600">•</span>
            <p className="text-slate-700 dark:text-slate-300">
              <strong>Disparité :</strong> Écart de <strong>{analyse.ecartAbsolu.toLocaleString("fr-FR")}</strong>
              {analyse.ratio ? ` (ratio de ${analyse.ratio}×)` : ""}.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}