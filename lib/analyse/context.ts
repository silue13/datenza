// lib/analyse/context.ts
import type { analyserColonnes } from "./analyse";
import type { Cellule } from "./utils";
import { calculerSerie, type AgregationGraphique } from "./graphique";
import { formaterP } from "./inference";
import { interpreterTest, libelleEffet, nomMethode } from "./testsStatistiques";

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
  /** Évolution réelle des principales mesures le long de l'axe de temps (périodes dans l'ordre du calendrier). */
  evolutions?: { mesure: string; calcul: string; periode: string; granularite: string | null; points: { periode: string; valeur: number | null }[] }[];
  /** Classements détaillés (jusqu'à 15 modalités) des principales mesures par dimension. */
  classements?: { mesure: string; calcul: string; dimension: string; nbModalites: number; lignes: { valeur: string; resultat: number | null; lignes: number }[] }[];
  /** Tests statistiques déjà calculés (p-valeurs corrigées de Holm) : à citer plutôt qu'à deviner. */
  testsStatistiques?: { methode: string; pValeur: string; effet: string; significatif: boolean; conclusion: string }[];
  apercuPremieresLignes: Record<string, Cellule>[];
  note: string;
}

// Mots entiers uniquement : « hôtel », « contribution », « compteur » ou « carte » ne sont pas des données sensibles.
const MOTS_SENSIBLES = new Set([
  "password", "passwd", "mdp", "secret", "iban", "rib", "bic", "cb", "cvv", "ssn", "secu", "nir", "cni", "cin",
  "passeport", "passport", "email", "mail", "courriel", "tel", "telephone", "phone", "mobile", "portable",
  "salaire", "salaires", "remuneration", "salary", "adresse", "address", "naissance", "birth",
]);
const RE_SENSIBLE_COMPOSE = /(mot de passe|carte bancaire|carte de credit|credit card|numero de compte|compte bancaire|securite sociale|date de naissance)/;

export function estColonneSensible(nomColonne: string): boolean {
  const n = nomColonne.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (RE_SENSIBLE_COMPOSE.test(n.replace(/[_\-.]+/g, " "))) return true;
  return n.split(/[^a-z0-9]+/).some((m) => MOTS_SENSIBLES.has(m));
}

const MAX_POINTS_SERIE = 36;
const MAX_LIGNES_REPARTITION = 15;

export function construireContexte(
  nomFichier: string,
  entetes: string[],
  corps: Cellule[][],
  res: Resultat
): ContexteIA {
  const selection = Object.keys(res.statistiques);
  const apercu = corps.slice(0, 8).map((ligne) => {
    const o: Record<string, Cellule> = {};
    for (const nom of selection) {
      if (estColonneSensible(nom)) {
        o[nom] = "[MASQUÉ - CONFIDENTIEL]";
      } else {
        o[nom] = ligne[entetes.indexOf(nom)] ?? "";
      }
    }
    return o;
  });

  // Les modalités d'une colonne sensible (e-mails, téléphones…) ne partent pas non plus dans les statistiques
  const statistiques: Record<string, unknown> = {};
  for (const nom of selection) {
    const info = res.statistiques[nom];
    statistiques[nom] = estColonneSensible(nom) && "topValeurs" in info.stats ? { ...info, stats: { ...info.stats, topValeurs: [] } } : info;
  }

  // Séries et classements calculés sur toutes les lignes : l'IA cite des chiffres réels au lieu d'extrapoler l'aperçu
  const mesures = res.mesures.map((m) => ({ nom: m.colonne, agregation: (m.operation === "somme" ? "Somme" : "Moyenne") as AgregationGraphique }));
  const colTemps = selection.find((n) => res.statistiques[n].type === "date");
  const evolutions: NonNullable<ContexteIA["evolutions"]> = [];
  if (colTemps) {
    for (const m of mesures.slice(0, 3)) {
      const s = calculerSerie(entetes, corps, colTemps, m.nom, { agregation: m.agregation, limite: MAX_POINTS_SERIE });
      if (s.points.length >= 2) {
        evolutions.push({
          mesure: m.nom,
          calcul: m.agregation,
          periode: colTemps,
          granularite: s.granularite,
          points: s.points.map((p) => ({ periode: p.label, valeur: p.valeur })),
        });
      }
    }
  }
  const dimensions = selection
    .filter((n) => {
      const i = res.statistiques[n];
      const nb = Number((i.stats as { nbCategoriesDistinctes?: number }).nbCategoriesDistinctes ?? 0);
      return i.type === "categorielle" && nb >= 2 && nb <= 200 && !estColonneSensible(n);
    })
    .slice(0, 4);
  const classements: NonNullable<ContexteIA["classements"]> = [];
  for (const m of mesures.slice(0, 2)) {
    for (const d of dimensions) {
      const s = calculerSerie(entetes, corps, d, m.nom, { agregation: m.agregation, limite: MAX_LIGNES_REPARTITION });
      if (s.points.length >= 2) {
        classements.push({
          mesure: m.nom,
          calcul: m.agregation,
          dimension: d,
          nbModalites: s.nbCategoriesTotal,
          lignes: s.points.map((p) => ({ valeur: p.label, resultat: p.valeur, lignes: p.effectif })),
        });
      }
    }
  }

  return {
    fichier: nomFichier || "Fichier analysé",
    lignes: res.nbLignes,
    colonnesTotales: entetes.length,
    colonnesAnalysees: selection,
    toutesLesColonnes: entetes,
    statistiques,
    correlations: res.correlations,
    mesures: res.mesures,
    ...(evolutions.length ? { evolutions } : {}),
    ...(classements.length ? { classements } : {}),
    ...(res.tests?.length
      ? {
          testsStatistiques: res.tests.map((t) => ({
            methode: nomMethode(t, "en"),
            pValeur: formaterP(t.pAjustee, "en"),
            effet: libelleEffet(t, "en"),
            significatif: t.significatif,
            conclusion: interpreterTest(t),
          })),
        }
      : {}),
    apercuPremieresLignes: apercu,
    note: "The complete raw data stays in the browser. Sensitive columns are masked. Statistics, 'evolutions' and 'classements' are computed over the complete imported dataset: quote those figures. The preview contains only the first rows and must never be used to compute totals. 'testsStatistiques' holds significance tests already run on the full data: rely on them before claiming a difference or link is real.",
  };
}