// lib/analyse/graphique.ts — calcul des séries d'un graphique, séparé de l'affichage pour être testable.
import { arrondir, estValeurVide, parseNombre, percentile, type Cellule } from "./utils";
import { clePeriode, convertirDate, detecterOrdreDate, estAnnee, trierChronologiquement, type OrdreDate } from "./dates";

export type AgregationGraphique =
  | "Nombre"
  | "Somme"
  | "Moyenne"
  | "Mediane"
  | "Minimum"
  | "Maximum"
  | "Valeurs distinctes"
  | "Pourcentage";

export type TriGraphique = "auto" | "valeur_desc" | "valeur_asc" | "libelle" | "chronologique" | "fichier";
export type Granularite = "auto" | "jour" | "mois" | "trimestre" | "annee";

export interface OptionsSerie {
  agregation: AgregationGraphique;
  /** Nombre maximal de catégories affichées ; le reste est regroupé dans « Autres » quand c'est possible. */
  limite?: number;
  tri?: TriGraphique;
  granularite?: Granularite;
  /** Regrouper le surplus dans une barre/part « Autres » (somme, nombre, pourcentage uniquement). */
  regrouperAutres?: boolean;
  libelleAutres?: string;
  /** Dénominateur imposé pour « Pourcentage » (part du total général quand la série est une sous-partie). */
  totalReference?: number;
}

export interface PointSerie {
  /** Clé brute du groupe : valeur de la colonne, ou clé de période (« 2024-03 »). Absente pour « Autres ». */
  cle?: string;
  label: string;
  valeur: number | null;
  effectif: number;
}

export interface SerieGraphique {
  points: PointSerie[];
  temporel: boolean;
  granularite: Granularite | null;
  nbCategoriesTotal: number;
  tronque: boolean;
  /** Lignes ignorées parce que la mesure n'est pas un nombre. */
  nbNonNumeriques: number;
}

const nettoyerLibelle = (v: Cellule) => String(v).replace(/["«»“”]/g, "").trim();
const p2 = (n: number) => String(n).padStart(2, "0");

function clePourGranularite(d: Date, g: Granularite): string {
  if (g === "annee") return String(d.getFullYear());
  if (g === "trimestre") return `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`;
  if (g === "mois") return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Choisit le niveau de détail d'un axe de dates pour garder un graphique lisible (comme la hiérarchie de dates de Power BI). */
export function choisirGranularite(dates: Date[]): Granularite {
  const jours = new Set<string>();
  const mois = new Set<string>();
  const trimestres = new Set<string>();
  for (const d of dates) {
    jours.add(clePourGranularite(d, "jour"));
    mois.add(clePourGranularite(d, "mois"));
    trimestres.add(clePourGranularite(d, "trimestre"));
  }
  if (jours.size <= 62) return "jour";
  if (mois.size <= 60) return "mois";
  if (trimestres.size <= 60) return "trimestre";
  return "annee";
}

interface Acc {
  somme: number;
  nNum: number;
  compte: number;
  min: number;
  max: number;
  valeurs: number[] | null;
  distincts: Set<string> | null;
  ordre: number;
}

function valeurAgregee(a: Acc, agregation: AgregationGraphique, totalLignes: number): number | null {
  switch (agregation) {
    case "Nombre":
      return a.compte;
    case "Pourcentage":
      return totalLignes ? (100 * a.compte) / totalLignes : null;
    case "Valeurs distinctes":
      return a.distincts ? a.distincts.size : 0;
    case "Somme":
      return a.nNum ? a.somme : null;
    case "Moyenne":
      return a.nNum ? a.somme / a.nNum : null;
    case "Minimum":
      return a.nNum ? a.min : null;
    case "Maximum":
      return a.nNum ? a.max : null;
    case "Mediane":
      return a.valeurs && a.valeurs.length ? percentile([...a.valeurs].sort((x, y) => x - y), 0.5) : null;
  }
}

/**
 * Agrège une mesure selon une colonne d'axe.
 * - axe de dates : regroupement par jour / mois / trimestre / année et tri chronologique ;
 * - axe de périodes (mois en lettres, trimestres, campagnes) : tri chronologique ;
 * - axe de catégories : tri par valeur, puis limite + « Autres » ;
 * - un groupe sans aucune valeur numérique vaut null (trou dans le graphique), jamais 0.
 */
export function calculerSerie(
  entetes: string[],
  corps: Cellule[][],
  colonneX: string,
  colonneY: string | null,
  options: OptionsSerie,
  filtre?: (ligne: Cellule[]) => boolean
): SerieGraphique {
  const { agregation } = options;
  const idxX = entetes.indexOf(colonneX);
  const idxY = colonneY ? entetes.indexOf(colonneY) : -1;
  const vide: SerieGraphique = { points: [], temporel: false, granularite: null, nbCategoriesTotal: 0, tronque: false, nbNonNumeriques: 0 };
  if (idxX === -1) return vide;
  const besoinY = !["Nombre", "Pourcentage"].includes(agregation);
  if (besoinY && idxY === -1) return vide;

  const lignes = filtre ? corps.filter(filtre) : corps;

  // 1. Nature de l'axe : vraies dates, ou simples libellés
  const brutsX: Cellule[] = [];
  for (const l of lignes) if (!estValeurVide(l[idxX])) brutsX.push(l[idxX]);
  if (!brutsX.length) return vide;
  const ordre: OrdreDate = detecterOrdreDate(brutsX);
  const echantillon = brutsX.length > 2000 ? brutsX.slice(0, 2000) : brutsX;
  const datesEchantillon = echantillon.map((v) => (estAnnee(v) ? null : convertirDate(v, ordre)));
  const axeDates = datesEchantillon.filter(Boolean).length / echantillon.length >= 0.8;

  let granularite: Granularite | null = null;
  if (axeDates) {
    granularite =
      options.granularite && options.granularite !== "auto"
        ? options.granularite
        : choisirGranularite(brutsX.map((v) => convertirDate(v, ordre)).filter((d): d is Date => d !== null));
  }

  // 2. Accumulation
  const groupes = new Map<string, Acc>();
  let totalLignes = 0;
  let nbNonNumeriques = 0;
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const brut = l[idxX];
    if (estValeurVide(brut)) continue;
    let cle: string;
    if (axeDates && granularite) {
      const d = convertirDate(brut, ordre);
      if (!d) continue;
      cle = clePourGranularite(d, granularite);
    } else cle = nettoyerLibelle(brut);
    if (!cle) continue;

    let g = groupes.get(cle);
    if (!g) {
      g = {
        somme: 0, nNum: 0, compte: 0, min: Infinity, max: -Infinity,
        valeurs: agregation === "Mediane" ? [] : null,
        distincts: agregation === "Valeurs distinctes" ? new Set() : null,
        ordre: i,
      };
      groupes.set(cle, g);
    }
    g.compte++;
    totalLignes++;
    if (!besoinY) continue;
    const y = l[idxY];
    if (estValeurVide(y)) continue;
    if (g.distincts) {
      g.distincts.add(String(y).trim().toLowerCase());
      continue;
    }
    const n = typeof y === "boolean" ? null : parseNombre(y);
    if (n === null) {
      nbNonNumeriques++;
      continue;
    }
    g.somme += n;
    g.nNum++;
    if (n < g.min) g.min = n;
    if (n > g.max) g.max = n;
    if (g.valeurs) g.valeurs.push(n);
  }

  let points = [...groupes.entries()].map(([label, g]) => ({
    label,
    cle: label as string | undefined,
    valeur: valeurAgregee(g, agregation, options.totalReference ?? totalLignes),
    effectif: g.compte,
    ordre: g.ordre,
  }));
  const nbCategoriesTotal = points.length;

  // 3. Tri
  const chrono = axeDates ? [...points].sort((a, b) => a.label.localeCompare(b.label)) : trierChronologiquement(points, (p) => p.label, ordre);
  const temporel = chrono !== null;
  const tri = options.tri && options.tri !== "auto" ? options.tri : temporel ? "chronologique" : "valeur_desc";
  const parValeur = (sens: 1 | -1) => (a: { valeur: number | null }, b: { valeur: number | null }) =>
    a.valeur === null ? 1 : b.valeur === null ? -1 : sens * (a.valeur - b.valeur);
  if (tri === "chronologique" && chrono) points = chrono;
  else if (tri === "valeur_desc") points.sort(parValeur(-1));
  else if (tri === "valeur_asc") points.sort(parValeur(1));
  else if (tri === "libelle") points.sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
  else points.sort((a, b) => a.ordre - b.ordre);

  // 4. Limite : pour un axe de temps on garde les périodes les plus récentes ; sinon les premières du tri + « Autres »
  const limite = options.limite && options.limite > 0 ? options.limite : 0;
  let tronque = false;
  if (limite && points.length > limite) {
    tronque = true;
    if (temporel && tri === "chronologique") {
      points = points.slice(points.length - limite);
    } else {
      const reste = points.slice(limite);
      points = points.slice(0, limite);
      const additif = agregation === "Somme" || agregation === "Nombre" || agregation === "Pourcentage";
      if (options.regrouperAutres !== false && additif) {
        const somme = reste.reduce((s, p) => s + (p.valeur ?? 0), 0);
        points.push({
          cle: undefined,
          label: `${options.libelleAutres ?? "Autres"} (${reste.length})`,
          valeur: somme,
          effectif: reste.reduce((s, p) => s + p.effectif, 0),
          ordre: Infinity,
        });
      }
    }
  }

  return {
    points: points.map((p) => ({
      ...(p.cle !== undefined ? { cle: p.cle } : {}),
      label: p.label,
      valeur: p.valeur === null ? null : arrondir(p.valeur),
      effectif: p.effectif,
    })),
    temporel,
    granularite,
    nbCategoriesTotal,
    tronque,
    nbNonNumeriques,
  };
}

/** Aligne plusieurs séries (une par fichier, par exemple) sur le même axe, dans l'ordre de la première logique de tri. */
export function alignerSeries(series: SerieGraphique[]): { labels: string[]; donnees: (number | null)[][] } {
  const vus = new Map<string, number>();
  for (const s of series) for (const p of s.points) vus.set(p.label, (vus.get(p.label) ?? 0) + Math.abs(p.valeur ?? 0));
  let labels = [...vus.keys()];
  const chrono = series.some((s) => s.granularite) ? [...labels].sort() : trierChronologiquement(labels, (x) => x);
  labels = chrono ?? labels.sort((a, b) => (vus.get(b) ?? 0) - (vus.get(a) ?? 0));
  const donnees = series.map((s) => {
    const index = new Map(s.points.map((p) => [p.label, p.valeur]));
    return labels.map((l) => index.get(l) ?? null);
  });
  return { labels, donnees };
}

export interface SeriesVentilees {
  /** Axe commun : une entrée par barre / point. */
  axe: { cle?: string; label: string }[];
  series: { nom: string; donnees: (number | null)[] }[];
  temporel: boolean;
  granularite: Granularite | null;
  nbCategoriesTotal: number;
  nbSeriesTotal: number;
  tronque: boolean;
}

/**
 * Ventile une mesure selon deux colonnes : l'axe (colonneX) et la légende (colonneSerie).
 * C'est la base des barres groupées ou empilées et des courbes multiples.
 * Les valeurs de légende les plus fréquentes sont gardées ; le reste est regroupé dans « Autres »
 * quand le calcul s'additionne (somme, nombre, pourcentage).
 */
export function calculerSeriesVentilees(
  entetes: string[],
  corps: Cellule[][],
  colonneX: string,
  colonneSerie: string,
  colonneY: string | null,
  options: OptionsSerie & { limiteSeries?: number }
): SeriesVentilees {
  const idxS = entetes.indexOf(colonneSerie);
  const complet = calculerSerie(entetes, corps, colonneX, colonneY, { ...options, limite: 0 });
  const base = calculerSerie(entetes, corps, colonneX, colonneY, options);
  const vide: SeriesVentilees = { axe: [], series: [], temporel: base.temporel, granularite: base.granularite, nbCategoriesTotal: 0, nbSeriesTotal: 0, tronque: false };
  if (idxS === -1 || !base.points.length) return vide;

  const additif = options.agregation === "Somme" || options.agregation === "Nombre" || options.agregation === "Pourcentage";
  const totalReference = complet.points.reduce((s, p) => s + p.effectif, 0);

  // Valeurs de légende, de la plus fréquente à la moins fréquente
  const effectifs = new Map<string, number>();
  for (const l of corps) {
    if (estValeurVide(l[idxS])) continue;
    const k = nettoyerLibelle(l[idxS]);
    effectifs.set(k, (effectifs.get(k) ?? 0) + 1);
  }
  const toutes = [...effectifs.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const limiteSeries = options.limiteSeries ?? 8;
  const gardees = toutes.slice(0, limiteSeries);
  const ensembleGardees = new Set(gardees);
  const chrono = trierChronologiquement(gardees, (x) => x);
  const ordonnees = chrono ?? gardees;

  const clesAxe = new Set(base.points.filter((p) => p.cle !== undefined).map((p) => p.cle as string));
  const aAutresAxe = base.points.some((p) => p.cle === undefined);

  const serieDe = (filtre: (l: Cellule[]) => boolean) => {
    const s = calculerSerie(entetes, corps, colonneX, colonneY, { ...options, limite: 0, totalReference }, filtre);
    const index = new Map(s.points.map((p) => [p.cle, p.valeur]));
    let reste: number | null = null;
    if (aAutresAxe) {
      for (const p of s.points) {
        if (p.cle !== undefined && !clesAxe.has(p.cle) && p.valeur !== null) reste = (reste ?? 0) + p.valeur;
      }
    }
    return base.points.map((p) => (p.cle === undefined ? (reste === null ? null : arrondir(reste)) : index.get(p.cle) ?? null));
  };

  const series = ordonnees.map((nom) => ({
    nom,
    donnees: serieDe((l) => !estValeurVide(l[idxS]) && nettoyerLibelle(l[idxS]) === nom),
  }));
  if (toutes.length > gardees.length && additif) {
    series.push({
      nom: `Autres (${toutes.length - gardees.length})`,
      donnees: serieDe((l) => !estValeurVide(l[idxS]) && !ensembleGardees.has(nettoyerLibelle(l[idxS]))),
    });
  }

  return {
    axe: base.points.map((p) => ({ cle: p.cle, label: p.label })),
    series,
    temporel: base.temporel,
    granularite: base.granularite,
    nbCategoriesTotal: base.nbCategoriesTotal,
    nbSeriesTotal: toutes.length,
    tronque: base.tronque || toutes.length > gardees.length,
  };
}

export interface FiltreClic {
  colonne: string;
  operateur: "egal" | "entre";
  valeur: string;
  valeurFin?: string;
}

/**
 * Filtre correspondant à un point d'un graphique (pour le filtrage croisé au clic).
 * Catégorie -> égalité ; période regroupée (« 2024-03 ») -> intervalle de dates. Null pour « Autres ».
 */
export function filtrePourPoint(colonne: string, cle: string | undefined, granularite: Granularite | null): FiltreClic | null {
  if (cle === undefined || cle === "") return null;
  if (!granularite) return { colonne, operateur: "egal", valeur: cle };
  const dernier = (a: number, m: number) => new Date(a, m, 0).getDate();
  let m = cle.match(/^(\d{4})$/);
  if (m) return { colonne, operateur: "entre", valeur: `${m[1]}-01-01`, valeurFin: `${m[1]}-12-31 23:59` };
  m = cle.match(/^(\d{4})-T([1-4])$/);
  if (m) {
    const debut = (+m[2] - 1) * 3 + 1;
    return { colonne, operateur: "entre", valeur: `${m[1]}-${p2(debut)}-01`, valeurFin: `${m[1]}-${p2(debut + 2)}-${p2(dernier(+m[1], debut + 2))} 23:59` };
  }
  m = cle.match(/^(\d{4})-(\d{2})$/);
  if (m) return { colonne, operateur: "entre", valeur: `${cle}-01`, valeurFin: `${cle}-${p2(dernier(+m[1], +m[2]))} 23:59` };
  m = cle.match(/^\d{4}-\d{2}-\d{2}$/);
  if (m) return { colonne, operateur: "entre", valeur: cle, valeurFin: `${cle} 23:59` };
  return null;
}

/** Nombre compact pour les axes : 1 250 000 -> « 1,25 M », 3 400 -> « 3,4 k ». */
export function formaterCompact(v: number, langue: "fr" | "en" = "fr"): string {
  if (!Number.isFinite(v)) return "";
  const a = Math.abs(v);
  const loc = langue === "en" ? "en-US" : "fr-FR";
  const f = (x: number, d: number) => new Intl.NumberFormat(loc, { maximumFractionDigits: d }).format(x);
  if (a >= 1e9) return `${f(v / 1e9, 2)} ${langue === "en" ? "B" : "Md"}`;
  if (a >= 1e6) return `${f(v / 1e6, 2)} M`;
  if (a >= 1e4) return `${f(v / 1e3, 1)} k`;
  if (a >= 100) return f(v, 0);
  if (a >= 1) return f(v, 2);
  return f(v, 4);
}

/** Nombre complet pour les infobulles et les étiquettes : « 1 250 000,5 ». */
export function formaterComplet(v: number, langue: "fr" | "en" = "fr"): string {
  if (!Number.isFinite(v)) return "";
  const a = Math.abs(v);
  return new Intl.NumberFormat(langue === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: a >= 100 ? 2 : a >= 1 ? 2 : 4 }).format(v);
}

/** Libellé lisible d'une clé de période : « 2024-03 » -> « mars 2024 », « 2024-T2 » -> « T2 2024 ». */
export function libellePeriode(cle: string, langue: "fr" | "en" = "fr"): string {
  let m = cle.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const mois = new Date(+m[1], +m[2] - 1, 1).toLocaleDateString(langue === "en" ? "en-US" : "fr-FR", { month: "short" });
    return `${mois} ${m[1]}`;
  }
  m = cle.match(/^(\d{4})-T([1-4])$/);
  if (m) return `${langue === "en" ? "Q" : "T"}${m[2]} ${m[1]}`;
  m = cle.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return langue === "en" ? `${m[2]}/${m[3]}/${m[1]}` : `${m[3]}/${m[2]}/${m[1]}`;
  return cle;
}

export { clePeriode };

export type TypeRecommande = "Barres" | "Courbe" | "Aires" | "Anneau";

export interface GraphiqueRecommande {
  cle: string;
  titre: string;
  type: TypeRecommande;
  x: string;
  /** Une mesure = une série ; plusieurs mesures = une série par mesure (ex. Hommes et Femmes côte à côte). */
  mesures: string[];
  agregation: AgregationGraphique;
  limite: number;
  horizontal: boolean;
  empile: boolean;
}

export interface ColonnesClassees {
  temporelles: string[];
  mesurables: string[];
  categorielles: string[];
}

/** « Population_totale » -> « Population totale » : libellé lisible pour les titres. */
export function nomLisible(nom: string): string {
  return nom.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Propose un petit tableau de bord (4 graphiques au plus) adapté au fichier, sans doublon :
 *  1. évolution dans le temps de la mesure principale, s'il existe un axe de temps ;
 *  2. répartition de la mesure principale selon la dimension la plus synthétique (anneau si peu de catégories) ;
 *  3. classement détaillé selon la dimension la plus fine (barres horizontales, 15 premiers) ;
 *  4. comparaison de plusieurs volumes entre eux (ex. Hommes / Femmes) ou, à défaut, une mesure de type moyenne.
 * Sans aucune mesure numérique, on compte simplement les lignes par catégorie.
 */
export function recommanderGraphiques(
  entetes: string[],
  corps: Cellule[][],
  colonnes: ColonnesClassees,
  operation: (nom: string) => "somme" | "moyenne",
  estPseudoMesure: (nom: string) => boolean
): GraphiqueRecommande[] {
  const recos: GraphiqueRecommande[] = [];
  const agg = (m: string): AgregationGraphique => (operation(m) === "somme" ? "Somme" : "Moyenne");
  const lib = (m: string) => `${agg(m) === "Somme" ? "" : "Moyenne de "}${nomLisible(m)}`;

  const mesures = colonnes.mesurables.filter((m) => !estPseudoMesure(m));
  const additives = mesures.filter((m) => operation(m) === "somme");
  const moyennes = mesures.filter((m) => operation(m) === "moyenne");
  // Mesure principale : un total explicite d'abord, sinon le premier volume, sinon la première mesure
  const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const principale = additives.find((m) => /(total|global|ensemble)/.test(norm(m))) ?? additives[0] ?? mesures[0] ?? null;

  // Dimensions avec leur nombre de catégories
  const dims = colonnes.categorielles
    .map((nom) => {
      const idx = entetes.indexOf(nom);
      const vues = new Set<string>();
      for (const l of corps) if (!estValeurVide(l[idx])) vues.add(nettoyerLibelle(l[idx]));
      return { nom, nb: vues.size };
    })
    .filter((d) => d.nb >= 2);
  const synthetique = [...dims].filter((d) => d.nb <= 8).sort((a, b) => a.nb - b.nb)[0] ?? null;
  const fine = [...dims].sort((a, b) => b.nb - a.nb)[0] ?? null;
  const temps = colonnes.temporelles[0] ?? null;

  if (!principale) {
    for (const d of [synthetique, fine]) {
      if (!d || recos.some((r) => r.x === d.nom)) continue;
      recos.push({
        cle: `compte-${d.nom}`,
        titre: `Nombre de lignes par ${nomLisible(d.nom)}`,
        type: d.nb <= 6 ? "Anneau" : "Barres",
        x: d.nom, mesures: [], agregation: "Nombre", limite: d.nb <= 6 ? 6 : 15, horizontal: d.nb > 6, empile: false,
      });
    }
    return recos;
  }

  if (temps) {
    recos.push({
      cle: `temps-${principale}`,
      titre: `Évolution : ${lib(principale)} selon ${nomLisible(temps)}`,
      type: "Aires",
      x: temps, mesures: [principale], agregation: agg(principale), limite: 120, horizontal: false, empile: false,
    });
  }

  if (synthetique) {
    const parts = agg(principale) === "Somme" && synthetique.nb <= 6;
    recos.push({
      cle: `part-${principale}-${synthetique.nom}`,
      titre: `${parts ? "Répartition" : "Comparaison"} : ${lib(principale)} par ${nomLisible(synthetique.nom)}`,
      type: parts ? "Anneau" : "Barres",
      x: synthetique.nom, mesures: [principale], agregation: agg(principale), limite: 8, horizontal: false, empile: false,
    });
  }

  if (fine && fine.nom !== synthetique?.nom) {
    recos.push({
      cle: `rang-${principale}-${fine.nom}`,
      titre: `Classement : ${lib(principale)} par ${nomLisible(fine.nom)}${fine.nb > 15 ? " (15 premiers)" : ""}`,
      type: "Barres",
      x: fine.nom, mesures: [principale], agregation: agg(principale), limite: 15, horizontal: true, empile: false,
    });
  }

  // Plusieurs volumes comparables (hors total) : côte à côte selon la dimension synthétique, ou dans le temps
  const composantes = additives.filter((m) => m !== principale).slice(0, 3);
  const axeCompare = synthetique?.nom ?? temps ?? fine?.nom ?? null;
  if (composantes.length >= 2 && axeCompare) {
    recos.push({
      cle: `compare-${composantes.join("-")}-${axeCompare}`,
      titre: `${composantes.map(nomLisible).join(", ")} par ${nomLisible(axeCompare)}`,
      type: axeCompare === temps ? "Courbe" : "Barres",
      x: axeCompare, mesures: composantes, agregation: "Somme", limite: axeCompare === temps ? 60 : 8, horizontal: false, empile: false,
    });
  }

  const axeMoyenne = fine?.nom ?? synthetique?.nom ?? null;
  if (recos.length < 4 && moyennes.length && axeMoyenne) {
    const m = moyennes[0];
    recos.push({
      cle: `moy-${m}-${axeMoyenne}`,
      titre: `${lib(m)} par ${nomLisible(axeMoyenne)}${(fine?.nb ?? 0) > 15 ? " (15 premiers)" : ""}`,
      type: "Barres",
      x: axeMoyenne, mesures: [m], agregation: "Moyenne", limite: 15, horizontal: axeMoyenne === fine?.nom && (fine?.nb ?? 0) > 6, empile: false,
    });
  }

  return recos.slice(0, 4);
}
