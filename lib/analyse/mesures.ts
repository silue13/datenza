import { arrondir, estValeurVide, versNombre, type Cellule } from "./utils";

export interface LigneRepartition {
  valeur: string;
  total: number;
  part: number | null;
  effectif: number;
}

export interface RepartitionMesure {
  dimension: string;
  role: string;
  nbCategories: number;
  lignes: LigneRepartition[];
}

export interface MesureRepartie {
  colonne: string;
  operation: "somme" | "moyenne";
  totalGlobal: number | null;
  repartitions: RepartitionMesure[];
}

interface InfoMinimale {
  type: string;
  role: string;
  nbValides: number;
  nbVides: number;
  stats: Record<string, unknown>;
}

const MAX_MESURES = 3;
const MAX_DIMENSIONS_PREMIERE = 3;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const RE_PAS_MESURE = /(annee|year|mois|month|jour|day|semaine|week|heure|hour|minute|trimestre|quarter|code|numero|\bid\b|rang|rank|latitude|longitude|\blat\b|\blon\b|\blng\b|gps|postal|zip)/;
const RE_ADDITIVE = /(total|montant|somme|quantite|quantity|\bqte\b|nombre|nb\b|nbre|effectif|count|volume|superficie|surface|area|population|poids|weight|capacite|stock|cout|cost|depense|budget|revenu|revenue|recette|production|passagers|passengers|vente|sales|chiffre|\bca\b|benefice|profit|marge|salaire|amount|tonnage|recolte|commande|orders|hommes?\b|femmes?\b|menages?\b|habitants|electeurs|inscrits|votants|eleves|etudiants|naissances|deces|enfants|filles|garcons|personnes|individus|logements)/;
const RE_MOYENNE = /(prix|price|unitaire|taux|\brate\b|\bnote|score|\bage\b|temperature|pourcentage|percent|ratio|moyenne|average|indice|index|densite|rendement|yield|vitesse|speed|duree|duration|delai|retard|delay|distance|niveau|level)/;

const RE_VRAIE_MESURE = /(nombre|\bnb\b|nbre|duree|total|montant|quantite|volume|cumul|travaille|worked|count)/;
/** Colonne numérique qui n'est pas une mesure (année, code, latitude…). « Nombre de jours » reste une mesure. */
export const estPseudoMesure = (nom: string): boolean => {
  const n = norm(nom);
  return RE_PAS_MESURE.test(n) && !RE_VRAIE_MESURE.test(n);
};

/** Somme pour les grandeurs qui s'additionnent (montants, quantités), moyenne pour les autres (prix, taux, notes). */
export function operationPour(nom: string): "somme" | "moyenne" {
  const n = norm(nom);
  const aExpliciteSomme = /(total|somme|cumul)/.test(n);
  const aExpliciteMoyenne = /(moyen|moyenne|average|unitaire|ratio|taux|rate|pourcent|percent)/.test(n);

  if (aExpliciteSomme && !aExpliciteMoyenne) return "somme";
  if (aExpliciteMoyenne && !aExpliciteSomme) return "moyenne";

  if (RE_ADDITIVE.test(n) && !RE_MOYENNE.test(n)) return "somme";
  if (RE_MOYENNE.test(n) && !RE_ADDITIVE.test(n)) return "moyenne";

  if (aExpliciteSomme) return "somme";
  if (aExpliciteMoyenne) return "moyenne";
  if (RE_ADDITIVE.test(n)) return "somme";
  return "moyenne";
}

function scoreDimension(role: string, nbCat: number): number {
  return (role === "statut" ? 100 : 40) + (nbCat >= 2 && nbCat <= 15 ? 30 : 0) - (nbCat > 50 ? 40 : 0);
}

export function calculerMesures(
  entetes: string[],
  corps: Cellule[][],
  statistiques: Record<string, InfoMinimale>
): MesureRepartie[] {
  const noms = Object.keys(statistiques);

  const candidates = noms
    .map((nom, ordre) => ({ nom, ordre, info: statistiques[nom] }))
    .filter(({ nom, info }) => {
      if (info.type !== "numerique" || info.role === "identifiant") return false;
      if (estPseudoMesure(nom)) return false;
      const s = info.stats as { n?: number; min?: number | null; max?: number | null };
      return Number(s.n ?? 0) >= 3 && s.min !== s.max;
    })
    .map((c) => {
      const total = c.info.nbValides + c.info.nbVides;
      const remplissage = total ? c.info.nbValides / total : 0;
      const n = norm(c.nom);
      let score = 10 * remplissage;
      // Une seule nature par colonne : « Taille moyenne ménage » est une moyenne, pas un volume
      if (operationPour(c.nom) === "somme" && RE_ADDITIVE.test(n)) score += 6;
      else if (RE_MOYENNE.test(n)) score += 4;
      // Un total explicite (« Population totale ») passe avant ses composantes (« Hommes », « Femmes »)
      if (/(total|global|ensemble)/.test(n) && operationPour(c.nom) === "somme") score += 2;
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score || a.ordre - b.ordre)
    .slice(0, MAX_MESURES);
  if (!candidates.length) return [];

  const dimensions = noms
    .filter((n) => {
      const i = statistiques[n];
      const nb = Number(i.stats.nbCategoriesDistinctes ?? 0);
      return i.type === "categorielle" && i.role !== "identifiant" && nb >= 2 && nb <= 50;
    })
    .sort(
      (a, b) =>
        scoreDimension(statistiques[b].role, Number(statistiques[b].stats.nbCategoriesDistinctes)) -
        scoreDimension(statistiques[a].role, Number(statistiques[a].stats.nbCategoriesDistinctes))
    );

  return candidates.map((cand, rang) => {
    const iMesure = entetes.indexOf(cand.nom);
    const operation = operationPour(cand.nom);
    const dims = dimensions.slice(0, rang === 0 ? MAX_DIMENSIONS_PREMIERE : 1);

    const repartitions: RepartitionMesure[] = dims.map((dim) => {
      const iDim = entetes.indexOf(dim);
      const groupes = new Map<string, { somme: number; n: number }>();
      for (const ligne of corps) {
        if (estValeurVide(ligne[iDim])) continue;
        const m = versNombre(ligne[iMesure]);
        if (m === null) continue;
        const cle = String(ligne[iDim]).trim();
        const g = groupes.get(cle) ?? { somme: 0, n: 0 };
        g.somme += m;
        g.n += 1;
        groupes.set(cle, g);
      }
      const brut = [...groupes.entries()].map(([valeur, g]) => ({
        valeur,
        effectif: g.n,
        total: operation === "somme" ? g.somme : g.somme / g.n,
      }));
      const sommeTotale = brut.reduce((s, x) => s + x.total, 0);
      const partsValides = operation === "somme" && sommeTotale > 0 && brut.every((x) => x.total >= 0);
      brut.sort((a, b) => b.total - a.total);
      return {
        dimension: dim,
        role: statistiques[dim].role,
        nbCategories: brut.length,
        lignes: brut.slice(0, 5).map((x) => ({
          valeur: x.valeur,
          effectif: x.effectif,
          total: arrondir(x.total),
          part: partsValides ? arrondir((100 * x.total) / sommeTotale) : null,
        })),
      };
    });

    const totalGlobal =
      operation === "somme" ? arrondir(corps.reduce((s, l) => s + (versNombre(l[iMesure]) ?? 0), 0)) : null;
    return { colonne: cand.nom, operation, totalGlobal, repartitions };
  });
}