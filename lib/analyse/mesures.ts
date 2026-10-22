import { arrondir, estValeurVide, type Cellule } from "./utils";

export interface LigneRepartition {
  valeur: string;
  total: number; // somme ou moyenne de la mesure pour cette catégorie
  part: number | null; // % du total (uniquement pour une somme de valeurs positives)
  effectif: number; // nombre de lignes avec une valeur exploitable
}

export interface RepartitionMesure {
  dimension: string;
  role: string;
  nbCategories: number;
  lignes: LigneRepartition[]; // les 5 premières, triées par valeur décroissante
}

export interface MesureRepartie {
  colonne: string;
  operation: "somme" | "moyenne";
  totalGlobal: number | null; // somme sur tout le fichier (null pour une moyenne)
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

// Colonnes numériques qui ne sont PAS des mesures : repères temporels, codes, coordonnées.
const RE_PAS_MESURE = /(annee|year|mois|month|jour|day|semaine|week|heure|hour|minute|trimestre|quarter|code|numero|\bid\b|rang|rank|latitude|longitude|\blat\b|\blon\b|\blng\b|gps|postal|zip)/;
// Grandeurs qui s'additionnent (quel que soit le domaine : effectifs, surfaces, volumes, coûts, durées cumulées…).
const RE_ADDITIVE = /(total|montant|somme|quantite|quantity|nombre|nb\b|effectif|count|volume|superficie|surface|area|population|poids|weight|capacite|stock|cout|cost|depense|budget|revenu|revenue|recette|production|passagers|passengers)/;
// Grandeurs qui se moyennent : leur somme n'a pas de sens.
const RE_MOYENNE = /(prix|price|unitaire|taux|rate|note|score|age|temperature|pourcentage|percent|ratio|moyenne|average|indice|index|densite|rendement|yield|vitesse|speed|duree|duration|delai|retard|delay|distance|niveau|level)/;

/** Colonne numérique qui sert de repère (année, mois, code, coordonnée…) et non de grandeur à résumer. */
export const estPseudoMesure = (nom: string): boolean => RE_PAS_MESURE.test(norm(nom));

function operationPour(nom: string): "somme" | "moyenne" {
  const n = norm(nom);
  if (RE_MOYENNE.test(n)) return "moyenne";
  if (RE_ADDITIVE.test(n)) return "somme";
  return "moyenne"; // inconnu : une moyenne n'est jamais trompeuse, une somme peut l'être
}

function scoreDimension(role: string, nbCat: number): number {
  return (role === "statut" ? 100 : 40) + (nbCat >= 2 && nbCat <= 15 ? 30 : 0) - (nbCat > 50 ? 40 : 0);
}

function versNombre(v: Cellule): number | null {
  if (estValeurVide(v)) return null;
  const n = Number(typeof v === "string" ? v.trim().replace(",", ".") : v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sélectionne les mesures numériques les plus pertinentes d'après les données
 * (taux de remplissage, variabilité) et le sens du nom, sans supposer de domaine,
 * puis les répartit par catégorie.
 */
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
      return Number(s.n ?? 0) >= 3 && s.min !== s.max; // une colonne constante n'apprend rien
    })
    .map((c) => {
      const total = c.info.nbValides + c.info.nbVides;
      const remplissage = total ? c.info.nbValides / total : 0;
      const n = norm(c.nom);
      let score = 10 * remplissage;
      if (RE_ADDITIVE.test(n)) score += 6;
      if (RE_MOYENNE.test(n)) score += 4;
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score || a.ordre - b.ordre) // à égalité, l'ordre du fichier
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
    // La mesure principale est détaillée sur plusieurs dimensions, les autres sur la meilleure seulement.
    const dims = dimensions.slice(0, rang === 0 ? MAX_DIMENSIONS_PREMIERE : 1);

    const repartitions: RepartitionMesure[] = dims.map((dim) => {
      const iDim = entetes.indexOf(dim);
      const groupes = new Map<string, { somme: number; n: number }>();
      for (const ligne of corps) {
        if (estValeurVide(ligne[iDim])) continue;
        const m = versNombre(ligne[iMesure]);
        if (m === null) continue; // une cellule vide n'est pas un zéro
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
