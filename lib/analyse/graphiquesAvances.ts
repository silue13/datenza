// lib/analyse/graphiquesAvances.ts — nuage de points, histogramme et graphique combiné.
// Calculs séparés de l'affichage pour être testables, comme lib/analyse/graphique.ts.
import { arrondir, estValeurVide, parseNombre, percentile, type Cellule } from "./utils";
import { correlationPearson } from "./stats";
import { calculerSerie, formaterComplet, type AgregationGraphique, type Granularite, type LigneExplication } from "./graphique";

const nombre = (v: Cellule): number | null => (estValeurVide(v) || typeof v === "boolean" ? null : parseNombre(v));
const nettoyerLibelle = (v: Cellule) => String(v).replace(/["«»“”]/g, "").trim();
const f = (v: number) => formaterComplet(arrondir(v));
const pluriel = (n: number, mot: string) => `${formaterComplet(n)} ${mot}${n > 1 ? "s" : ""}`;

// ---------------------------------------------------------------- Nuage de points

export interface PointNuage {
  x: number;
  y: number;
}

export interface NuagePoints {
  series: { nom: string; points: PointNuage[] }[];
  /** Lignes où X et Y sont tous deux des nombres. */
  nbPoints: number;
  /** Points réellement dessinés (échantillon régulier au-delà de la limite). */
  nbAffiches: number;
  /** Lignes écartées parce que X ou Y n'est pas un nombre. */
  nbIgnores: number;
  nbSeriesTotal: number;
  /** Corrélation de Pearson, calculée sur toutes les paires valides (pas seulement l'échantillon). */
  r: number | null;
  /** Droite des moindres carrés y = pente × x + ordonnee, avec ses deux extrémités sur l'étendue de X. */
  droite: { pente: number; ordonnee: number; x1: number; y1: number; x2: number; y2: number } | null;
}

export interface OptionsNuage {
  /** Colonne de catégories : une couleur par valeur. */
  colonneSerie?: string;
  maxPoints?: number;
  limiteSeries?: number;
}

/**
 * Prépare un nuage de points : une ligne du fichier = un point (aucune agrégation).
 * Au-delà de `maxPoints`, un échantillon régulier est dessiné, mais la corrélation
 * et la droite de tendance restent calculées sur toutes les lignes.
 */
export function calculerNuage(entetes: string[], corps: Cellule[][], colonneX: string, colonneY: string, options: OptionsNuage = {}): NuagePoints {
  const idxX = entetes.indexOf(colonneX);
  const idxY = entetes.indexOf(colonneY);
  const idxS = options.colonneSerie ? entetes.indexOf(options.colonneSerie) : -1;
  const vide: NuagePoints = { series: [], nbPoints: 0, nbAffiches: 0, nbIgnores: 0, nbSeriesTotal: 0, r: null, droite: null };
  if (idxX === -1 || idxY === -1) return vide;

  const paires: { x: number; y: number; serie: string }[] = [];
  let nbIgnores = 0;
  for (const l of corps) {
    if (estValeurVide(l[idxX]) && estValeurVide(l[idxY])) continue;
    const x = nombre(l[idxX]);
    const y = nombre(l[idxY]);
    if (x === null || y === null) {
      nbIgnores++;
      continue;
    }
    const serie = idxS === -1 ? "" : estValeurVide(l[idxS]) ? "(vide)" : nettoyerLibelle(l[idxS]);
    paires.push({ x, y, serie });
  }
  if (!paires.length) return { ...vide, nbIgnores };

  // Statistiques sur l'ensemble des paires
  const xs = paires.map((p) => p.x);
  const ys = paires.map((p) => p.y);
  const r = correlationPearson(xs, ys);
  let droite: NuagePoints["droite"] = null;
  if (paires.length >= 3 && r !== null) {
    const n = paires.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let cov = 0;
    let vx = 0;
    for (let i = 0; i < n; i++) {
      cov += (xs[i] - mx) * (ys[i] - my);
      vx += (xs[i] - mx) ** 2;
    }
    if (vx > 0) {
      const pente = cov / vx;
      const ordonnee = my - pente * mx;
      let x1 = Infinity;
      let x2 = -Infinity;
      for (const x of xs) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
      }
      droite = { pente, ordonnee, x1, y1: pente * x1 + ordonnee, x2, y2: pente * x2 + ordonnee };
    }
  }

  // Échantillon régulier (déterministe) pour garder un graphique fluide
  const maxPoints = options.maxPoints ?? 2000;
  const pas = paires.length > maxPoints ? paires.length / maxPoints : 1;
  const affiches = pas === 1 ? paires : Array.from({ length: maxPoints }, (_, i) => paires[Math.floor(i * pas)]);

  // Séries : les valeurs les plus fréquentes gardent leur couleur, le reste part dans « Autres »
  const effectifs = new Map<string, number>();
  for (const p of paires) effectifs.set(p.serie, (effectifs.get(p.serie) ?? 0) + 1);
  const toutes = [...effectifs.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const limiteSeries = options.limiteSeries ?? 8;
  const gardees = new Set(toutes.slice(0, limiteSeries));
  const libelleAutres = `Autres (${toutes.length - gardees.size})`;
  const parSerie = new Map<string, PointNuage[]>();
  for (const nom of toutes.slice(0, limiteSeries)) parSerie.set(nom, []);
  for (const p of affiches) {
    const nom = gardees.has(p.serie) ? p.serie : libelleAutres;
    let liste = parSerie.get(nom);
    if (!liste) {
      liste = [];
      parSerie.set(nom, liste);
    }
    liste.push({ x: p.x, y: p.y });
  }

  return {
    series: [...parSerie.entries()].filter(([, pts]) => pts.length).map(([nom, points]) => ({ nom, points })),
    nbPoints: paires.length,
    nbAffiches: affiches.length,
    nbIgnores,
    nbSeriesTotal: idxS === -1 ? 0 : toutes.length,
    r,
    droite,
  };
}

/** Constats vérifiables sur un nuage de points : force et sens du lien, droite de tendance, périmètre. */
export function expliquerNuage(n: NuagePoints, colonneX: string, colonneY: string): LigneExplication[] {
  if (!n.nbPoints) return [];
  const lignes: LigneExplication[] = [];
  if (n.r === null) {
    lignes.push({
      titre: "Relation",
      texte: n.nbPoints < 2 ? "Un seul point : aucune relation ne peut être mesurée." : `« ${colonneX} » ou « ${colonneY} » ne varie pas : aucune relation ne peut être mesurée.`,
    });
  } else {
    const a = Math.abs(n.r);
    const force = a >= 0.8 ? "très forte" : a >= 0.6 ? "forte" : a >= 0.4 ? "modérée" : a >= 0.2 ? "faible" : null;
    lignes.push({
      titre: "Relation",
      texte: force
        ? `Liaison ${force} (r = ${formaterComplet(n.r)}) : quand « ${colonneX} » augmente, « ${colonneY} » a tendance à ${n.r > 0 ? "augmenter" : "diminuer"}. Cela ne prouve pas que l'un cause l'autre.`
        : `Pas de liaison linéaire visible (r = ${formaterComplet(n.r)}) : « ${colonneY} » ne monte ni ne descend nettement quand « ${colonneX} » augmente.`,
    });
    if (force && n.droite) {
      lignes.push({
        titre: "Droite de tendance",
        texte: `En moyenne, une unité de plus de « ${colonneX} » s'accompagne de ${n.droite.pente >= 0 ? "+" : "−"}${f(Math.abs(n.droite.pente))} de « ${colonneY} ».`,
      });
    }
  }
  const notes = [`${pluriel(n.nbPoints, "ligne")} placée${n.nbPoints > 1 ? "s" : ""}, une par point`];
  if (n.nbAffiches < n.nbPoints) notes.push(`${formaterComplet(n.nbAffiches)} points dessinés (échantillon régulier), calculs faits sur toutes les lignes`);
  if (n.nbIgnores) notes.push(`${pluriel(n.nbIgnores, "ligne")} sans valeur numérique écartée${n.nbIgnores > 1 ? "s" : ""}`);
  lignes.push({ titre: "Périmètre", texte: `${notes.join(" ; ")}.` });
  return lignes;
}

// ---------------------------------------------------------------- Histogramme

export interface ClasseHistogramme {
  /** Borne basse, incluse. */
  min: number;
  /** Borne haute, exclue (incluse pour la dernière classe). */
  max: number;
  label: string;
  effectif: number;
  /** Plus petite et plus grande valeur réellement présentes dans la classe (pour le filtrage au clic). */
  minObserve: number | null;
  maxObserve: number | null;
}

export interface Histogramme {
  classes: ClasseHistogramme[];
  n: number;
  nbIgnores: number;
  pas: number;
  moyenne: number | null;
  mediane: number | null;
  q1: number | null;
  q3: number | null;
  min: number | null;
  max: number | null;
}

/** Pas « rond » (1, 2, 2,5, 5 × 10^k) immédiatement supérieur ou égal au pas brut. */
export function pasRond(brut: number): number {
  if (!(brut > 0) || !Number.isFinite(brut)) return 1;
  const e = Math.floor(Math.log10(brut));
  const base = 10 ** e;
  const m = brut / base;
  const choix = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  // Les puissances négatives de 10 ne sont pas exactes en binaire : on recale sur 12 chiffres significatifs
  return Number((choix * base).toPrecision(12));
}

/**
 * Répartit les valeurs d'une colonne numérique en classes de largeur égale, à bornes rondes.
 * Sans `nbClasses`, la règle de Sturges fixe le nombre de classes (entre 5 et 20).
 * Une colonne d'entiers n'est jamais découpée en classes plus fines que 1.
 */
export function calculerHistogramme(entetes: string[], corps: Cellule[][], colonne: string, options: { nbClasses?: number } = {}): Histogramme {
  const idx = entetes.indexOf(colonne);
  const vide: Histogramme = { classes: [], n: 0, nbIgnores: 0, pas: 0, moyenne: null, mediane: null, q1: null, q3: null, min: null, max: null };
  if (idx === -1) return vide;
  const valeurs: number[] = [];
  let nbIgnores = 0;
  for (const l of corps) {
    if (estValeurVide(l[idx])) continue;
    const v = nombre(l[idx]);
    if (v === null) nbIgnores++;
    else valeurs.push(v);
  }
  if (!valeurs.length) return { ...vide, nbIgnores };

  const tries = [...valeurs].sort((a, b) => a - b);
  const min = tries[0];
  const max = tries[tries.length - 1];
  const n = tries.length;
  const cible = options.nbClasses && options.nbClasses > 0 ? options.nbClasses : Math.max(5, Math.min(20, Math.ceil(Math.log2(n) + 1)));
  const entiers = tries.every((v) => Number.isInteger(v));
  let pas = max === min ? 1 : pasRond((max - min) / cible);
  if (entiers && pas < 1) pas = 1;

  const decimales = Math.max((String(pas).split(".")[1] ?? "").length, pas < 1 ? Math.ceil(-Math.log10(pas)) : 0);
  const net = (v: number) => Number(v.toFixed(Math.min(12, decimales + 2)));
  const debut = net(Math.floor(min / pas + 1e-9) * pas);
  // Le maximum appartient à la dernière classe, même quand il tombe pile sur une borne
  const nb = Math.max(1, Math.ceil((max - debut) / pas - 1e-9));
  const classes: ClasseHistogramme[] = Array.from({ length: nb }, (_, i) => {
    const a = net(debut + i * pas);
    const b = net(debut + (i + 1) * pas);
    return { min: a, max: b, label: `${formaterComplet(a)} – ${formaterComplet(b)}`, effectif: 0, minObserve: null, maxObserve: null };
  });
  for (const v of tries) {
    const c = classes[Math.min(nb - 1, Math.max(0, Math.floor((v - debut) / pas + 1e-9)))];
    c.effectif++;
    if (c.minObserve === null) c.minObserve = v;
    c.maxObserve = v;
  }

  return {
    classes,
    n,
    nbIgnores,
    pas,
    moyenne: arrondir(tries.reduce((a, b) => a + b, 0) / n),
    mediane: arrondir(percentile(tries, 0.5)),
    q1: arrondir(percentile(tries, 0.25)),
    q3: arrondir(percentile(tries, 0.75)),
    min,
    max,
  };
}

/** Constats vérifiables sur un histogramme : classe la plus fréquente, centre, dispersion. */
export function expliquerHistogramme(h: Histogramme, colonne: string): LigneExplication[] {
  if (!h.n || h.moyenne === null || h.mediane === null || h.min === null || h.max === null) return [];
  const lignes: LigneExplication[] = [];
  if (h.min === h.max) {
    return [{ titre: "Une seule valeur", texte: `Les ${pluriel(h.n, "ligne")} de « ${colonne} » valent toutes ${f(h.min)}.` }];
  }
  const modale = h.classes.reduce((a, c) => (c.effectif > a.effectif ? c : a));
  lignes.push({
    titre: "Classe la plus fréquente",
    texte: `De ${formaterComplet(modale.min)} à ${formaterComplet(modale.max)} : ${pluriel(modale.effectif, "ligne")}, soit ${formaterComplet(Math.round((1000 * modale.effectif) / h.n) / 10)} % des ${formaterComplet(h.n)} valeurs.`,
  });
  let centre = `Médiane ${f(h.mediane)}, moyenne ${f(h.moyenne)}.`;
  const iqr = (h.q3 ?? 0) - (h.q1 ?? 0);
  if (iqr > 0 && Math.abs(h.moyenne - h.mediane) > 0.25 * iqr) {
    centre += ` La moyenne est tirée vers le ${h.moyenne > h.mediane ? "haut" : "bas"} par quelques valeurs ${h.moyenne > h.mediane ? "élevées" : "basses"} : la médiane décrit mieux la valeur typique.`;
  }
  lignes.push({ titre: "Centre", texte: centre });
  lignes.push({
    titre: "Dispersion",
    texte: `De ${f(h.min)} à ${f(h.max)}${h.q1 !== null && h.q3 !== null ? ` ; la moitié des valeurs se situe entre ${f(h.q1)} et ${f(h.q3)}` : ""}.`,
  });
  const vides = h.classes.filter((c) => c.effectif === 0).length;
  const notes = [`Classes de largeur ${formaterComplet(h.pas)} ; chaque classe inclut sa borne basse et exclut sa borne haute (sauf la dernière)`];
  if (vides) notes.push(`${pluriel(vides, "classe")} vide${vides > 1 ? "s" : ""}`);
  if (h.nbIgnores) notes.push(`${pluriel(h.nbIgnores, "valeur")} non numérique${h.nbIgnores > 1 ? "s" : ""} écartée${h.nbIgnores > 1 ? "s" : ""}`);
  lignes.push({ titre: "Lecture", texte: `${notes.join(" ; ")}.` });
  return lignes;
}

// ---------------------------------------------------------------- Graphique combiné (barres + courbe)

export interface MesureCombinee {
  colonne: string | null;
  agregation: AgregationGraphique;
  /** Mesure personnalisée (remplace colonne et agrégation). */
  evaluer?: (lignes: Cellule[][]) => number | null;
}

export interface GraphiqueCombine {
  axe: { cle?: string; label: string }[];
  barres: (number | null)[];
  courbe: (number | null)[];
  temporel: boolean;
  granularite: Granularite | null;
  nbCategoriesTotal: number;
  tronque: boolean;
  /**
   * Vrai quand les deux mesures ont des ordres de grandeur trop éloignés pour partager un axe :
   * sur une échelle commune, la plus petite serait écrasée contre zéro.
   */
  echellesEloignees: boolean;
}

/** Rapport entre les plus grandes valeurs absolues des deux séries au-delà duquel une échelle commune écrase la plus petite. */
export const RAPPORT_ECHELLES_MAX = 5;

/**
 * Deux mesures sur le même axe de catégories ou de dates : la première en barres, la seconde en courbe.
 * L'axe (ordre, limite) est celui de la mesure en barres ; il n'y a pas de regroupement « Autres »,
 * qui n'aurait pas de sens pour une courbe de moyennes ou de taux.
 */
export function calculerCombine(
  entetes: string[],
  corps: Cellule[][],
  colonneX: string,
  mesureBarres: MesureCombinee,
  mesureCourbe: MesureCombinee,
  options: { limite?: number } = {}
): GraphiqueCombine {
  const base = calculerSerie(entetes, corps, colonneX, mesureBarres.colonne, { agregation: mesureBarres.agregation, limite: options.limite, regrouperAutres: false, evaluer: mesureBarres.evaluer });
  const seconde = calculerSerie(entetes, corps, colonneX, mesureCourbe.colonne, { agregation: mesureCourbe.agregation, limite: 0, regrouperAutres: false, evaluer: mesureCourbe.evaluer });
  const index = new Map(seconde.points.map((p) => [p.cle, p.valeur]));
  const barres = base.points.map((p) => p.valeur);
  const courbe = base.points.map((p) => index.get(p.cle) ?? null);
  const maxAbs = (liste: (number | null)[]) => liste.reduce<number>((m, v) => (v === null ? m : Math.max(m, Math.abs(v))), 0);
  const mb = maxAbs(barres);
  const mc = maxAbs(courbe);
  return {
    axe: base.points.map((p) => ({ cle: p.cle, label: p.label })),
    barres,
    courbe,
    temporel: base.temporel,
    granularite: base.granularite,
    nbCategoriesTotal: base.nbCategoriesTotal,
    tronque: base.tronque,
    echellesEloignees: mb > 0 && mc > 0 && Math.max(mb, mc) / Math.min(mb, mc) > RAPPORT_ECHELLES_MAX,
  };
}

/** Constats vérifiables sur un graphique combiné : le maximum de chaque mesure et leur évolution conjointe. */
export function expliquerCombine(
  c: GraphiqueCombine,
  libelles: string[],
  nomBarres: string,
  nomCourbe: string,
  deuxAxes: boolean
): LigneExplication[] {
  const lignes: LigneExplication[] = [];
  const unite = c.temporel ? "période" : "catégorie";
  const sommet = (valeurs: (number | null)[]) => {
    let meilleur = -1;
    valeurs.forEach((v, i) => {
      if (v !== null && (meilleur === -1 || v > (valeurs[meilleur] as number))) meilleur = i;
    });
    return meilleur;
  };
  const ib = sommet(c.barres);
  const ic = sommet(c.courbe);
  if (ib === -1 && ic === -1) return [];
  if (ib !== -1) lignes.push({ titre: `Barres — ${nomBarres}`, texte: `Maximum sur « ${libelles[ib]} » : ${f(c.barres[ib] as number)}.` });
  if (ic !== -1) lignes.push({ titre: `Courbe — ${nomCourbe}`, texte: `Maximum sur « ${libelles[ic]} » : ${f(c.courbe[ic] as number)}.` });

  const xs: number[] = [];
  const ys: number[] = [];
  c.barres.forEach((v, i) => {
    const w = c.courbe[i];
    if (v !== null && w !== null) {
      xs.push(v);
      ys.push(w);
    }
  });
  if (xs.length >= 4) {
    const r = correlationPearson(xs, ys);
    if (r !== null) {
      const a = Math.abs(r);
      lignes.push({
        titre: "Lecture conjointe",
        texte:
          a < 0.4
            ? `Sur les ${xs.length} ${unite}s, les deux mesures n'évoluent pas nettement ensemble (r = ${formaterComplet(r)}).`
            : `Sur les ${xs.length} ${unite}s, les deux mesures évoluent ${r > 0 ? "dans le même sens" : "en sens inverse"} (r = ${formaterComplet(r)}) : là où l'une est élevée, l'autre est plutôt ${r > 0 ? "élevée" : "basse"}.`,
      });
    }
  }
  if (deuxAxes) {
    lignes.push({
      titre: "Deux échelles",
      texte: "Les barres se lisent sur l'axe de gauche, la courbe sur l'axe de droite. Ne comparez pas la hauteur d'une barre à celle de la courbe : seules les formes se comparent.",
    });
  }
  return lignes;
}
