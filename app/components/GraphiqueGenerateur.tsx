"use client";
import { useRef, useState } from "react";
import { Bar, Line, Pie } from "react-chartjs-2";
import "./chartSetup";
import { arrondir, estValeurVide, type Cellule } from "../../lib/analyse/utils";
import type { GraphiqueEpingle, TypeGraphique } from "../context/DataContext";

type Agregation = "Somme" | "Nombre" | "Moyenne";

interface GraphiqueGenerateurProps {
  entetes: string[];
  corps: Cellule[][];
  onEpingler?: (graphique: GraphiqueEpingle) => void;
}

const PALETTE = ["#9333ea", "#a855f7", "#c084fc", "#3b82f6", "#60a5fa", "#10b981", "#f59e0b", "#e11d48", "#64748b", "#14b8a6"];
const MAX_CATEGORIES = 20;
const MAX_PARTS_CAMEMBERT = 8;

function versNombre(v: Cellule): number | null {
  if (estValeurVide(v)) return null;
  const n = Number(typeof v === "string" ? v.trim().replace(",", ".") : v);
  return Number.isFinite(n) ? n : null;
}

const selectClasse =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-medium focus:ring-2 focus:ring-purple-500";

export default function GraphiqueGenerateur({ entetes, corps, onEpingler }: GraphiqueGenerateurProps) {
  const [typeGraphique, setTypeGraphique] = useState<TypeGraphique>("Barres");
  const [colonneAxeX, setColonneAxeX] = useState<string>(entetes[0] || "");
  const [colonneAxeY, setColonneAxeY] = useState<string>(entetes[1] || entetes[0] || "");
  const [agregation, setAgregation] = useState<Agregation>("Nombre");
  const [graphiquesGeneres, setGraphiquesGeneres] = useState<GraphiqueEpingle[]>([]);
  const [message, setMessage] = useState<string>("");
  const compteur = useRef(0);

  function construireGraphique() {
    setMessage("");
    if (!colonneAxeX) return;
    const idxX = entetes.indexOf(colonneAxeX);
    const idxY = entetes.indexOf(colonneAxeY);
    const besoinY = agregation !== "Nombre";
    if (besoinY && idxY === -1) return;

    const groupes = new Map<string, { somme: number; nNum: number; compte: number }>();
    for (const ligne of corps) {
      if (estValeurVide(ligne[idxX])) continue; // les lignes sans valeur en X sont ignorées
      const cle = String(ligne[idxX]).trim();
      const g = groupes.get(cle) ?? { somme: 0, nNum: 0, compte: 0 };
      g.compte += 1;
      if (besoinY) {
        const n = versNombre(ligne[idxY]); // cellules vides ou non numériques ignorées
        if (n !== null) {
          g.somme += n;
          g.nNum += 1;
        }
      }
      groupes.set(cle, g);
    }

    let paires = [...groupes.entries()].map(([label, g]) => {
      let valeur = g.compte;
      if (agregation === "Somme") valeur = arrondir(g.somme);
      if (agregation === "Moyenne") valeur = g.nNum ? arrondir(g.somme / g.nNum) : 0;
      return { label, valeur, nNum: g.nNum };
    });

    if (besoinY && paires.every((p) => p.nNum === 0)) {
      setMessage(`La colonne « ${colonneAxeY} » ne contient aucune valeur numérique : choisis une autre colonne ou « Nombre ».`);
      return;
    }
    if (paires.length === 0) {
      setMessage(`La colonne « ${colonneAxeX} » ne contient aucune valeur exploitable.`);
      return;
    }

    if (typeGraphique !== "Courbe") paires.sort((a, b) => b.valeur - a.valeur);
    const limite = typeGraphique === "Camembert" ? MAX_PARTS_CAMEMBERT : MAX_CATEGORIES;
    if (paires.length > limite) {
      const gardes = paires.slice(0, limite);
      const reste = paires.slice(limite);
      if (typeGraphique === "Camembert" && agregation !== "Moyenne") {
        gardes.push({ label: "Autres", valeur: arrondir(reste.reduce((s, p) => s + p.valeur, 0)), nNum: 0 });
      }
      paires = gardes;
      setMessage(`Graphique limité aux ${limite} catégories principales (sur ${groupes.size}).`);
    }

    compteur.current += 1;
    const titreMesure = agregation === "Nombre" ? "Nombre de lignes" : `${agregation} — ${colonneAxeY}`;
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
            typeGraphique === "Camembert" ? paires.map((_, i) => PALETTE[i % PALETTE.length]) : "#9333ea",
          borderColor: "#7e22ce",
          borderWidth: 1,
        },
      ],
    };
    setGraphiquesGeneres((prev) => [nouveau, ...prev]);
  }

  const options = { responsive: true, maintainAspectRatio: false } as const;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-purple-600"></div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Générateur de Graphiques</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Type de graphique</label>
          <select value={typeGraphique} onChange={(e) => setTypeGraphique(e.target.value as TypeGraphique)} className={selectClasse}>
            <option value="Barres">Barres</option>
            <option value="Courbe">Courbe</option>
            <option value="Camembert">Camembert</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Axe X (catégories)</label>
          <select value={colonneAxeX} onChange={(e) => setColonneAxeX(e.target.value)} className={selectClasse}>
            {entetes.map((nom) => (
              <option key={nom} value={nom}>{nom}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Axe Y (valeurs)</label>
          <select
            value={colonneAxeY}
            onChange={(e) => setColonneAxeY(e.target.value)}
            disabled={agregation === "Nombre"}
            className={`${selectClasse} disabled:opacity-50`}
          >
            {entetes.map((nom) => (
              <option key={nom} value={nom}>{nom}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Agrégation</label>
          <select value={agregation} onChange={(e) => setAgregation(e.target.value as Agregation)} className={selectClasse}>
            <option value="Nombre">Nombre de lignes</option>
            <option value="Somme">Somme</option>
            <option value="Moyenne">Moyenne</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={construireGraphique}
          className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs rounded-lg shadow transition"
        >
          + Ajouter le graphique
        </button>
        {message && <span className="text-xs text-amber-600 dark:text-amber-400">{message}</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        {graphiquesGeneres.map((g) => (
          <div
            key={g.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{g.titre}</h4>
              <div className="flex shrink-0 gap-2">
                {onEpingler && (
                  <button
                    onClick={() => onEpingler(g)}
                    className="text-[11px] font-semibold text-purple-600 hover:text-purple-700 border border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-950/30 px-2.5 py-1 rounded-md transition"
                  >
                    ★ Ajouter au tableau de bord
                  </button>
                )}
                <button
                  onClick={() => setGraphiquesGeneres((prev) => prev.filter((x) => x.id !== g.id))}
                  aria-label="Supprimer le graphique"
                  className="text-slate-400 hover:text-rose-600 text-sm px-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="h-64 flex items-center justify-center p-2">
              {g.type === "Barres" && <Bar data={g} options={options} />}
              {g.type === "Courbe" && <Line data={g} options={options} />}
              {g.type === "Camembert" && <Pie data={g} options={options} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
