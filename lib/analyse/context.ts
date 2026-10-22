// lib/analyse/context.ts
import type { analyserColonnes } from "./analyse";
import type { Cellule } from "./utils";

type Resultat = ReturnType<typeof analyserColonnes>;

export interface ContexteIA {
  fichier: string;
  lignes: number;
  colonnesTotales: number;
  colonnesAnalysees: string[];
  toutesLesColonnes: string[];
  statistiques: Record<string, unknown>;
  correlations: { colonneA: string; colonneB: string; coefficient: number }[];
  mesures: Resultat["mesures"];
  apercuPremieresLignes: Record<string, Cellule>[];
  note: string;
}

export function construireContexte(
  nomFichier: string,
  entetes: string[],
  corps: Cellule[][],
  res: Resultat
): ContexteIA {
  const selection = Object.keys(res.statistiques);
  const apercu = corps.slice(0, 8).map((ligne) => {
    const o: Record<string, Cellule> = {};
    for (const nom of selection) o[nom] = ligne[entetes.indexOf(nom)] ?? "";
    return o;
  });
  return {
    fichier: nomFichier || "Fichier analysé",
    lignes: res.nbLignes,
    colonnesTotales: entetes.length,
    colonnesAnalysees: selection,
    toutesLesColonnes: entetes,
    statistiques: res.statistiques,
    correlations: res.correlations,
    mesures: res.mesures,
    apercuPremieresLignes: apercu,
    note: "The complete raw data stays in the browser. Statistics are computed over the complete imported dataset. The preview contains only the first rows.",
  };
}