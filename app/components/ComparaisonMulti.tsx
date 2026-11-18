"use client";
// app/components/ComparaisonMulti.tsx — comparaison ligne à ligne de plusieurs fichiers (réglages et résultats).

import { ArrowDown, ArrowRight, ArrowUp, BarChart2, Download, FileSpreadsheet, Scale } from "lucide-react";
import BlocInterpretation from "./BlocInterpretation";
import type { FichierEntree } from "../../lib/analyse/fusion";
import type { ResultatMultiComparaison } from "../../lib/analyse/comparaison";
import { interpreterMultiComparaison } from "../../lib/analyse/interpretationFusion";

const SELECT =
  "bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg !p-1.5 !text-[11px] font-bold text-purple-700 dark:text-purple-300 truncate !min-w-0 w-full";

type PropsReglages = {
  fichiers: FichierEntree[];
  /** Ordre des fichiers (indices dans `fichiers`), par exemple chronologique. */
  ordre: number[];
  onOrdre: (ordre: number[]) => void;
  cles: string[];
  onCle: (indexFichier: number, cle: string) => void;
  colonnes: string[];
  colonnesExclues: string[];
  onBasculerColonne: (colonne: string) => void;
};

export function ReglagesComparaisonMulti({ fichiers, ordre, onOrdre, cles, onCle, colonnes, colonnesExclues, onBasculerColonne }: PropsReglages) {
  const deplacer = (pos: number, sens: -1 | 1) => {
    const n = [...ordre];
    const cible = pos + sens;
    if (cible < 0 || cible >= n.length) return;
    [n[pos], n[cible]] = [n[cible], n[pos]];
    onOrdre(n);
  };
  return (
    <div className="space-y-3.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Retrouvez chaque client, produit ou facture dans tous les fichiers : présent partout, apparu, disparu, et les valeurs qui changent. Mettez les fichiers dans
        l&apos;ordre (par exemple janvier, février, mars).
      </p>
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase font-bold text-slate-400">Fichiers dans l&apos;ordre, et colonne qui identifie chaque ligne</p>
        {ordre.map((iF, pos) => (
          <div key={iF} className="flex items-center gap-1.5">
            <span className="w-5 h-5 shrink-0 rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 text-[10px] font-black flex items-center justify-center">
              {pos + 1}
            </span>
            <span className="flex-1 min-w-0 truncate font-semibold text-slate-700 dark:text-slate-200" title={fichiers[iF].nom}>
              {fichiers[iF].nom}
            </span>
            <select value={cles[pos] ?? ""} onChange={(e) => onCle(iF, e.target.value)} className={`${SELECT} max-w-[45%]`} aria-label={`Colonne clé de ${fichiers[iF].nom}`}>
              {fichiers[iF].entetes.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => deplacer(pos, -1)} disabled={pos === 0} className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer" aria-label="Monter">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => deplacer(pos, 1)}
              disabled={pos === ordre.length - 1}
              className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
              aria-label="Descendre"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <p className="text-[10px] text-slate-500">Les colonnes clés sont proposées d&apos;après les valeurs communes aux fichiers ; vérifiez-les.</p>
      </div>
      <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
        <p className="text-[10px] uppercase font-bold text-slate-400">Colonnes à comparer</p>
        {colonnes.length === 0 ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Aucune colonne ne porte le même nom dans au moins deux fichiers : seules les présences et absences seront comparées.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {colonnes.map((c) => {
              const coche = !colonnesExclues.includes(c);
              return (
                <label
                  key={c}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] cursor-pointer ${
                    coche ? "border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200" : "border-slate-200 text-slate-500 dark:border-slate-700"
                  }`}
                >
                  <input type="checkbox" checked={coche} onChange={() => onBasculerColonne(c)} className="rounded text-purple-600" />
                  {c}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const STYLE_STATUT_MULTI = (statut: string) =>
  statut === "Partout"
    ? "font-bold text-emerald-600 dark:text-emerald-400"
    : statut === "Disparue"
    ? "font-bold text-rose-600 dark:text-rose-400"
    : statut === "Apparue"
    ? "font-bold text-blue-600 dark:text-blue-400"
    : "font-bold text-amber-600 dark:text-amber-400";

type PropsResultats = {
  resultat: ResultatMultiComparaison;
  onTelecharger: () => void;
  onAnalyserTableau: () => void;
  onAnalyseComparee: () => void;
};

export function ResultatsComparaisonMulti({ resultat, onTelecharger, onAnalyserTableau, onAnalyseComparee }: PropsResultats) {
  const b = resultat.bilan;
  const i = interpreterMultiComparaison(b);
  const cartes = [
    { titre: "Clés retrouvées", valeur: b.nbCles, detail: `dans ${b.fichiers.length} fichiers`, couleur: "text-slate-900 dark:text-white" },
    { titre: "Présentes partout", valeur: b.partout, detail: "dans tous les fichiers", couleur: "text-emerald-600 dark:text-emerald-400" },
    { titre: "Apparues", valeur: b.apparues, detail: `absentes de ${b.fichiers[0]}`, couleur: "text-blue-600 dark:text-blue-400" },
    { titre: "Disparues", valeur: b.disparues, detail: `absentes de ${b.fichiers[b.fichiers.length - 1]}`, couleur: "text-rose-600 dark:text-rose-400" },
  ];
  const iStatut = 1;
  return (
    <section className="space-y-6 pt-4 border-t border-slate-200 dark:border-slate-800">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cartes.map((c) => (
          <div key={c.titre} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase">{c.titre}</span>
            <p className={`text-xl font-black mt-1 ${c.couleur}`}>{c.valeur.toLocaleString("fr-FR")}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">{c.detail}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2 shadow-sm">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Ce qu&apos;il faut retenir</p>
        <BlocInterpretation guide={i.guide} titreGuide="Comment lire cette comparaison ?" constats={i.complements} resume={i.resume} pistes={i.pistes} />
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/40">
          <span className="font-bold text-xs text-slate-700 dark:text-slate-300">Aperçu des 10 premières lignes (les changements et absences en premier)</span>
          <span className="text-[11px] text-slate-400">Total : {resultat.corps.length} clés</span>
        </div>
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300">
                {resultat.entetes.map((h, k) => (
                  <th key={k} className="p-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
              {resultat.corps.slice(0, 10).map((ligne, r) => (
                <tr key={r} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  {ligne.map((cell, k) => (
                    <td key={k} className={`p-3 whitespace-nowrap ${k === iStatut ? STYLE_STATUT_MULTI(String(cell)) : "text-slate-700 dark:text-slate-300"}`}>
                      {String(cell ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 text-right">
        « Analyser ce tableau » étudie la liste des clés ci-dessus. « Analyse comparée des fichiers » compare les fichiers entre eux : totaux, graphiques, cartes et
        prévisions par fichier.
      </p>
      <div className="flex flex-col sm:flex-row flex-wrap items-center justify-end gap-3">
        <button
          onClick={onTelecharger}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 shadow transition cursor-pointer"
        >
          <Download className="w-4 h-4 text-emerald-400" />
          Télécharger en Excel (.xlsx)
        </button>
        <button
          onClick={onAnalyserTableau}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-xs rounded-xl border border-slate-300 dark:border-slate-700 shadow-xs transition cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4 text-purple-600" />
          Analyser ce tableau
        </button>
        <button
          onClick={onAnalyseComparee}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-lg transition cursor-pointer"
        >
          <Scale className="w-4 h-4" />
          Analyse comparée des fichiers
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}

/** Bouton commun « Analyse comparée des fichiers » (réutilisé après une comparaison de 2 fichiers). */
export function BoutonAnalyseComparee({ onClick, nb }: { onClick: () => void; nb: number }) {
  return (
    <button
      onClick={onClick}
      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-xs rounded-xl border border-purple-300 dark:border-purple-800 shadow-xs transition cursor-pointer"
    >
      <BarChart2 className="w-4 h-4 text-purple-600" />
      Analyse comparée des {nb} fichiers
    </button>
  );
}
