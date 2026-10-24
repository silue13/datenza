"use client";

import { useMemo } from "react";
import { COMPTE, VALEUR_UNIQUE, type Agregation, type ResultatTdc } from "../../lib/analyse/tdc";
import { useData } from "../context/DataContext";

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

/** Détecte l'unité monétaire ou le pourcentage d'une colonne */
function detecterUnite(nomColonne: string, indexCol: number, corps: (string | number | boolean | null | undefined)[][]): string | null {
  // 1. Détection par le nom de colonne
  const nomMinuscule = nomColonne.toLowerCase();
  if (nomMinuscule.includes("%") || nomMinuscule.includes("taux") || nomMinuscule.includes("pourcent")) return "%";
  if (nomMinuscule.includes("fcfa") || nomMinuscule.includes("cfa")) return "FCFA";
  if (nomMinuscule.includes("€") || nomMinuscule.includes("eur")) return "€";
  if (nomMinuscule.includes("$") || nomMinuscule.includes("usd")) return "$";

  // 2. Détection par analyse des valeurs brutes de la colonne
  if (indexCol >= 0) {
    const echantillon = corps
      .map((ligne) => String(ligne[indexCol] ?? ""))
      .filter((v) => v.trim() !== "")
      .slice(0, 40);

    for (const val of echantillon) {
      if (val.includes("%")) return "%";
      if (/fcfa|cfa/i.test(val)) return "FCFA";
      if (val.includes("€") || /eur/i.test(val)) return "€";
      if (val.includes("$") || /usd/i.test(val)) return "$";
    }
  }

  return null;
}

/** Formate un nombre en ajoutant l'unité adéquate */
function formater(v: number, unite: string | null): string {
  const valFormatee = Math.round(v * 100) / 100;
  const str = valFormatee.toLocaleString("fr-FR");

  if (!unite) return str;
  if (unite === "%") return `${str} %`;
  if (unite === "FCFA") return `${str} FCFA`;
  if (unite === "€") return `${str} €`;
  if (unite === "$") return `${str} $`;
  return `${str} ${unite}`;
}

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
  const { entetes, corps } = useData();

  // Carte des unités détectées pour chaque colonne de résultat
  const unitesColonnes = useMemo(() => {
    return donnees.colonnes.map((col) => {
      if (col.champValeur === COMPTE) return null;
      const indexCol = entetes.indexOf(col.champValeur);
      return detecterUnite(col.champValeur, indexCol, corps);
    });
  }, [donnees.colonnes, entetes, corps]);

  const totaux = agregation === "nombre" || agregation === "somme";
  const totalLigne = (row: (number | null)[]) => row.reduce<number>((a, b) => a + (b ?? 0), 0);

  // Unité par défaut pour le total général (si toutes les colonnes partagent la même unité)
  const uniteGlobale = useMemo(() => {
    const unitesActives = unitesColonnes.filter((u): u is string => u !== null);
    if (unitesActives.length === 0) return null;
    const premiere = unitesActives[0];
    return unitesActives.every((u) => u === premiere) ? premiere : null;
  }, [unitesColonnes]);

  return (
    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="bg-purple-50 dark:bg-purple-950/40 border-b border-slate-200 dark:border-slate-800 text-purple-900 dark:text-purple-200 font-bold">
            <th className="p-3">{titreLignes}</th>
            {donnees.colonnes.map((c, j) => (
              <th key={j} className="p-3 text-right whitespace-nowrap">
                {libelleColonne(c, agregation, plusieursValeurs)}
              </th>
            ))}
            {totaux && <th className="p-3 text-right">Total</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
          {donnees.lignes.map((l, i) => (
            <tr key={l} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{l}</td>
              {donnees.matrice[i].map((v, j) => (
                <td key={j} className="p-3 text-right text-slate-600 dark:text-slate-400">
                  {v === null ? "—" : formater(v, unitesColonnes[j])}
                </td>
              ))}
              {totaux && (
                <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100">
                  {formater(totalLigne(donnees.matrice[i]), uniteGlobale)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {totaux && (
          <tfoot>
            <tr className="bg-purple-50 dark:bg-purple-950/40 font-bold text-slate-900 dark:text-slate-100">
              <td className="p-3">Total</td>
              {donnees.colonnes.map((_, j) => (
                <td key={j} className="p-3 text-right">
                  {formater(
                    donnees.matrice.reduce((a, row) => a + (row[j] ?? 0), 0),
                    unitesColonnes[j]
                  )}
                </td>
              ))}
              <td className="p-3 text-right">
                {formater(
                  donnees.matrice.reduce((a, row) => a + totalLigne(row), 0),
                  uniteGlobale
                )}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}