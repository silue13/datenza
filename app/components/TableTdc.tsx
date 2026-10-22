"use client";
import { COMPTE, VALEUR_UNIQUE, type Agregation, type ResultatTdc } from "../../lib/analyse/tdc";

export const LIBELLES_AGG: Record<Agregation, string> = {
  nombre: "Nombre",
  somme: "Somme",
  moyenne: "Moyenne",
  min: "Minimum",
  max: "Maximum",
};

function libelleColonne(col: ResultatTdc["colonnes"][number], agg: Agregation, plusieursValeurs: boolean): string {
  const valeur = col.champValeur === COMPTE ? "Nombre de lignes" : `${LIBELLES_AGG[agg]} — ${col.champValeur}`;
  if (col.colonneBase === VALEUR_UNIQUE) return valeur;
  return plusieursValeurs ? `${col.colonneBase} · ${valeur}` : col.colonneBase;
}

const fmt = (v: number) => v.toLocaleString("fr-FR");

/** Tableau croisé : affichage seul, partagé par l'onglet Analyse et l'assistant IA. */
export default function TableTdc({
  donnees,
  agregation,
  titreLignes,
  plusieursValeurs,
}: {
  donnees: ResultatTdc;
  agregation: Agregation;
  titreLignes: string;
  plusieursValeurs: boolean;
}) {
  // Les totaux n'ont de sens que pour un nombre ou une somme (pas pour moyenne/min/max).
  const totaux = agregation === "nombre" || agregation === "somme";
  const totalLigne = (row: (number | null)[]) => row.reduce<number>((a, b) => a + (b ?? 0), 0);

  return (
    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="bg-purple-50 dark:bg-purple-950/40 border-b border-slate-200 dark:border-slate-800 text-purple-900 dark:text-purple-200 font-bold">
            <th className="p-3">{titreLignes}</th>
            {donnees.colonnes.map((c, j) => (
              <th key={j} className="p-3 text-right whitespace-nowrap">{libelleColonne(c, agregation, plusieursValeurs)}</th>
            ))}
            {totaux && <th className="p-3 text-right">Total</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
          {donnees.lignes.map((l, i) => (
            <tr key={l} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{l}</td>
              {donnees.matrice[i].map((v, j) => (
                <td key={j} className="p-3 text-right text-slate-600 dark:text-slate-400">{v === null ? "—" : fmt(v)}</td>
              ))}
              {totaux && <td className="p-3 text-right font-bold">{fmt(totalLigne(donnees.matrice[i]))}</td>}
            </tr>
          ))}
        </tbody>
        {totaux && (
          <tfoot>
            <tr className="bg-purple-50 dark:bg-purple-950/40 font-bold">
              <td className="p-3">Total</td>
              {donnees.colonnes.map((_, j) => (
                <td key={j} className="p-3 text-right">{fmt(donnees.matrice.reduce((a, row) => a + (row[j] ?? 0), 0))}</td>
              ))}
              <td className="p-3 text-right">{fmt(donnees.matrice.reduce((a, row) => a + totalLigne(row), 0))}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
