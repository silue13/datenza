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
import { arrondir, estValeurVide, parseNombre, type Cellule } from "../../lib/analyse/utils";
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

const MAX_CATEGORIES = 15;

function versNombre(v: Cellule): number | null {
  if (estValeurVide(v)) return null;
  return parseNombre(v);
}

const selectClasse =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-medium focus:ring-2 focus:ring-blue-500";

// Traceur unique des valeurs au-dessus des barres et points (évite les doublons)
const pluginValeursSurGraphique = {
  id: "pluginValeursSurGraphique",
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart;
    const type = chart.config.type;
    if (type === "pie" || type === "doughnut" || type === "radar") return;

    chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (!meta || meta.hidden) return;

      meta.data.forEach((element: any, index: number) => {
        const val = dataset.data[index];
        if (val === null || val === undefined || Number.isNaN(val)) return;

        const valNum = Number(val);
        const texte = Number.isInteger(valNum)
          ? valNum.toLocaleString("fr-FR")
          : valNum.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

        ctx.save();
        ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillStyle = "#334155";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        const yPos = valNum < 0 ? element.y + 14 : element.y - 4;
        ctx.fillText(texte, element.x, yPos);
        ctx.restore();
      });
    });
  },
};

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

  const [typeGraphique, setTypeGraphique] = useState<TypeGraphique>("Barres");
  const [colonneAxeX, setColonneAxeX] = useState<string>(colonnesSansSource[0] || entetes[0] || "");
  const [colonneAxeY, setColonneAxeY] = useState<string>(colonnesSansSource[1] || colonnesSansSource[0] || "");
  const [agregation, setAgregation] = useState<Agregation>("Moyenne");
  const [ventilerParFichier, setVentilerParFichier] = useState<boolean>(estModeComparaison);
  const [graphiquesGeneres, setGraphiquesGeneres] = useState<GraphiqueEpingle[]>([]);
  const [messageErreur, setMessageErreur] = useState<string>("");
  const compteur = useRef(0);

  const estInclusPptx = (id: number | string) => {
    return (graphiquesEpingles || []).some((g) => g.id === id);
  };

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

      return resultats;
    }

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
              backgroundColor: "#2563eb",
              borderColor: "#1d4ed8",
              borderRadius: 4,
              borderWidth: 1,
            },
          ],
        });
      }
    }

    return resultats;
  }, [entetes, corps, colonnesSansSource, estModeComparaison, sourcesFichiers, idxSource]);

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
      const cle = String(ligne[idxX]).trim();
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
              : "#2563eb",
          borderColor: "#1d4ed8",
          borderRadius: 4,
          borderWidth: 1,
        },
      ],
    };

    setGraphiquesGeneres((prev) => [nouveau, ...prev]);
  }

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: { boxWidth: 12, font: { size: 11, weight: "bold" } },
      },
      datalabels: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "rgba(148,163,184,0.15)" },
        ticks: { font: { size: 10 } },
        grace: "15%",
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0 },
      },
    },
  };
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
            {graphiquesRecommandes.map((g, index) => {
              const estEpingle = estInclusPptx(g.id);
              return (
                <div
                  key={g.id}
                  className="print-eviter-coupure bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm"
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

                  <div className="h-56 sm:h-64 w-full relative">
                    {g.type === "Courbe" ? (
                      <Line data={g} options={options} plugins={[pluginValeursSurGraphique]} />
                    ) : (
                      <Bar data={g} options={options} plugins={[pluginValeursSurGraphique]} />
                    )}
                  </div>

                  <ExplicationDetailleeGraphique graphique={g} nomFichier={nomFichier} />
                </div>
              );
            })}
          </div>
        </section>
      )}

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

      {graphiquesGeneres.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
            Vos graphiques créés ({graphiquesGeneres.length})
          </h4>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {graphiquesGeneres.map((g) => {
              const estEpingle = estInclusPptx(g.id);
              return (
                <div
                  key={g.id}
                  className="print-eviter-coupure bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm"
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

                  <div className={g.type === "Carte" ? "w-full min-h-[340px]" : "h-64 w-full relative"}>
                    {g.type === "Carte" && <CarteGeographique entetes={entetes} corps={corps} />}
                    {g.type === "Barres" && (
                      <Bar data={g} options={options} plugins={[pluginValeursSurGraphique]} />
                    )}
                    {g.type === "Courbe" && (
                      <Line data={g} options={options} plugins={[pluginValeursSurGraphique]} />
                    )}
                    {g.type === "Camembert" && <Pie data={g} options={options} />}
                    {g.type === "Anneau" && <Doughnut data={g} options={{ ...options, cutout: "68%" }} />}
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
      {/* En-tête sobre : titre exécutif et bouton discret masqué au PDF */}
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

      {/* Rendu sobre et institutionnel de la synthèse managériale (zéro mention d'IA) */}
      {syntheseDecisionnelle && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            <span className="uppercase tracking-wider">Synthèse décisionnelle & Recommandations :</span>
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