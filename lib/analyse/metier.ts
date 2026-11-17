/**
 * Analyses métier prêtes à l'emploi :
 * - Pareto / ABC : quelle petite part des éléments fait l'essentiel du total ;
 * - Évolution : dernière période comparée à la précédente et à la même période un an plus tôt,
 *   avec les catégories qui expliquent l'écart ;
 * - RFM : segmentation des clients par récence, fréquence et montant ;
 * - Cohortes : fidélité des clients selon le mois de leur premier achat.
 *
 * Chaque analyse renvoie soit un résultat, soit la raison pour laquelle elle ne s'applique pas.
 */
import { detecterOrdreDate, lireDateOuAnnee } from "./detection";
import { estValeurVide, versNombre, type Cellule } from "./utils";

export type Resultat<T> = { ok: true; valeur: T } | { ok: false; raison: string };
const echec = <T>(raison: string): Resultat<T> => ({ ok: false, raison });

const JOUR_MS = 86_400_000;
const MOIS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export const libelleMois = (cle: number) => `${MOIS_FR[cle % 12]} ${Math.floor(cle / 12)}`;
const cleMois = (d: Date) => d.getFullYear() * 12 + d.getMonth();

function index(entetes: string[], ...colonnes: string[]): number[] | null {
  const ix = colonnes.map((c) => entetes.indexOf(c));
  return ix.some((i) => i === -1) ? null : ix;
}

function lecteurDates(corps: Cellule[][], i: number) {
  const ordre = detecterOrdreDate(corps.slice(0, 2000).map((l) => l[i]));
  return (v: Cellule) => {
    const d = lireDateOuAnnee(v, ordre);
    return d && !isNaN(d.getTime()) ? d : null;
  };
}

// ---------------------------------------------------------------------------
// Pareto / ABC
// ---------------------------------------------------------------------------

export interface ElementPareto {
  nom: string;
  total: number;
  part: number;
  cumul: number;
  classe: "A" | "B" | "C";
}

export interface ResultatPareto {
  elements: ElementPareto[];
  total: number;
  classes: Record<"A" | "B" | "C", { nb: number; part: number }>;
  /** Part des éléments (en %) qui fait 80 % du total. */
  partElementsPour80: number;
  nbPour80: number;
}

/** Classe A : jusqu'à 80 % du total cumulé ; B : jusqu'à 95 % ; C : le reste. */
export function analyserPareto(entetes: string[], corps: Cellule[][], dimension: string, mesure: string): Resultat<ResultatPareto> {
  const ix = index(entetes, dimension, mesure);
  if (!ix) return echec("Colonne introuvable.");
  const [iD, iM] = ix;
  const totaux = new Map<string, number>();
  let negatifs = 0;
  for (const l of corps) {
    if (estValeurVide(l[iD])) continue;
    const x = versNombre(l[iM]);
    if (x === null) continue;
    if (x < 0) negatifs++;
    const k = String(l[iD]).trim();
    totaux.set(k, (totaux.get(k) ?? 0) + x);
  }
  if (negatifs) return echec(`« ${mesure} » contient ${negatifs} valeur(s) négative(s) : une répartition en parts du total n'aurait pas de sens.`);
  if (totaux.size < 3) return echec(`Il faut au moins 3 valeurs différentes dans « ${dimension} ».`);
  const total = [...totaux.values()].reduce((s, x) => s + x, 0);
  if (total <= 0) return echec(`Le total de « ${mesure} » est nul.`);

  let cumul = 0;
  const elements: ElementPareto[] = [...totaux]
    .sort((a, b) => b[1] - a[1])
    .map(([nom, t]) => {
      const avant = cumul;
      cumul += t;
      // L'élément qui franchit le seuil appartient encore à la classe : A s'il commence sous 80 %
      const classe: ElementPareto["classe"] = (100 * avant) / total < 80 ? "A" : (100 * avant) / total < 95 ? "B" : "C";
      return { nom, total: t, part: (100 * t) / total, cumul: (100 * cumul) / total, classe };
    });
  const classes = { A: { nb: 0, part: 0 }, B: { nb: 0, part: 0 }, C: { nb: 0, part: 0 } };
  for (const e of elements) {
    classes[e.classe].nb++;
    classes[e.classe].part += e.part;
  }
  const nbPour80 = elements.findIndex((e) => e.cumul >= 80 - 1e-9) + 1;
  return { ok: true, valeur: { elements, total, classes, nbPour80, partElementsPour80: (100 * nbPour80) / elements.length } };
}

// ---------------------------------------------------------------------------
// Évolution : période précédente et même période un an plus tôt
// ---------------------------------------------------------------------------

export interface Contribution {
  nom: string;
  avant: number;
  apres: number;
  ecart: number;
}

export interface Comparaison {
  libelle: string;
  valeur: number;
  ecart: number;
  variation: number | null;
  /** Catégories qui expliquent le plus l'écart, dans le sens de l'écart d'abord. */
  contributions: Contribution[];
}

export interface ResultatEvolution {
  granularite: "mois" | "annee";
  periode: string;
  valeur: number;
  /** Vrai si la dernière période semble inachevée (dernière date avant la fin du mois). */
  incomplete: boolean;
  precedente: Comparaison | null;
  anneePrecedente: Comparaison | null;
  serie: { libelle: string; valeur: number }[];
}

export function analyserEvolution(
  entetes: string[],
  corps: Cellule[][],
  colDate: string,
  mesure: string,
  dimension?: string
): Resultat<ResultatEvolution> {
  const ix = index(entetes, colDate, mesure);
  if (!ix) return echec("Colonne introuvable.");
  const [iT, iM] = ix;
  const iD = dimension ? entetes.indexOf(dimension) : -1;
  const lire = lecteurDates(corps, iT);

  const lignes: { d: Date; x: number; cat: string | null }[] = [];
  const joursDistincts = new Set<number>();
  for (const l of corps) {
    const d = lire(l[iT]);
    const x = versNombre(l[iM]);
    if (!d || x === null) continue;
    lignes.push({ d, x, cat: iD >= 0 && !estValeurVide(l[iD]) ? String(l[iD]).trim() : null });
    joursDistincts.add(Math.floor(d.getTime() / JOUR_MS));
  }
  if (lignes.length < 2) return echec(`Pas assez de dates lisibles dans « ${colDate} ».`);
  // Que des 1er janvier : des années seules ; que des 1er du mois : des mois seuls
  const queDesAnnees = lignes.every((l) => l.d.getMonth() === 0 && l.d.getDate() === 1);
  const granularite: ResultatEvolution["granularite"] = queDesAnnees ? "annee" : "mois";
  const cle = (d: Date) => (granularite === "annee" ? d.getFullYear() : cleMois(d));
  const libelle = (k: number) => (granularite === "annee" ? String(k) : libelleMois(k));

  const parPeriode = new Map<number, { total: number; cats: Map<string, number> }>();
  let dateMax = lignes[0].d;
  for (const { d, x, cat } of lignes) {
    if (d > dateMax) dateMax = d;
    const k = cle(d);
    const p = parPeriode.get(k) ?? { total: 0, cats: new Map() };
    p.total += x;
    if (cat !== null) p.cats.set(cat, (p.cats.get(cat) ?? 0) + x);
    parPeriode.set(k, p);
  }
  const cles = [...parPeriode.keys()].sort((a, b) => a - b);
  if (cles.length < 2) return echec(`Toutes les dates tombent dans la même ${granularite === "annee" ? "année" : "période"} : rien à comparer.`);

  const derniere = cles[cles.length - 1];
  const cur = parPeriode.get(derniere)!;
  const finDuMois = new Date(dateMax.getFullYear(), dateMax.getMonth() + 1, 0).getDate();
  const donneesJournalieres = joursDistincts.size > cles.length * 2;
  const incomplete = granularite === "mois" && donneesJournalieres && dateMax.getDate() < finDuMois - 2;

  const comparer = (kAvant: number): Comparaison | null => {
    const av = parPeriode.get(kAvant);
    if (!av) return null;
    const ecart = cur.total - av.total;
    const noms = new Set([...av.cats.keys(), ...cur.cats.keys()]);
    const contributions = [...noms]
      .map((nom) => {
        const avant = av.cats.get(nom) ?? 0, apres = cur.cats.get(nom) ?? 0;
        return { nom, avant, apres, ecart: apres - avant };
      })
      .filter((c) => c.ecart !== 0)
      .sort((a, b) => (Math.sign(b.ecart) === Math.sign(ecart) ? 1 : 0) - (Math.sign(a.ecart) === Math.sign(ecart) ? 1 : 0) || Math.abs(b.ecart) - Math.abs(a.ecart))
      .slice(0, 5);
    return { libelle: libelle(kAvant), valeur: av.total, ecart, variation: av.total !== 0 ? (100 * ecart) / Math.abs(av.total) : null, contributions };
  };

  return {
    ok: true,
    valeur: {
      granularite,
      periode: libelle(derniere),
      valeur: cur.total,
      incomplete,
      precedente: comparer(cles[cles.length - 2]),
      anneePrecedente: granularite === "mois" ? comparer(derniere - 12) : null,
      serie: cles.slice(-24).map((k) => ({ libelle: libelle(k), valeur: parPeriode.get(k)!.total })),
    },
  };
}

// ---------------------------------------------------------------------------
// RFM
// ---------------------------------------------------------------------------

export type SegmentRFM = "Champions" | "Fidèles" | "Nouveaux" | "Prometteurs" | "À réveiller" | "À risque" | "Perdus";

export const CONSEILS_RFM: Record<SegmentRFM, string> = {
  Champions: "Récents, fréquents et gros acheteurs : les remercier, leur proposer en premier les nouveautés et un programme de parrainage.",
  Fidèles: "Achètent souvent : les récompenser (fidélité, volume) et leur proposer des produits complémentaires.",
  Nouveaux: "Premier achat récent : soigner l'accueil pour déclencher le deuxième achat.",
  Prometteurs: "Récents mais encore peu fréquents : relancer avec une offre ciblée pour installer l'habitude.",
  "À réveiller": "Activité moyenne qui ralentit : relance personnalisée avant qu'ils ne décrochent.",
  "À risque": "Bons clients qui n'achètent plus depuis longtemps : priorité de reconquête (appel, offre dédiée).",
  Perdus: "Peu d'achats, et plus depuis longtemps : relance à faible coût ou sortie du ciblage actif.",
};
export const ORDRE_SEGMENTS: SegmentRFM[] = ["Champions", "Fidèles", "Nouveaux", "Prometteurs", "À réveiller", "À risque", "Perdus"];

export interface ClientRFM {
  client: string;
  recenceJours: number;
  frequence: number;
  montant: number;
  r: number;
  f: number;
  m: number;
  segment: SegmentRFM;
}

export interface ResultatRFM {
  clients: ClientRFM[];
  segments: { segment: SegmentRFM; nb: number; partClients: number; montant: number; partMontant: number; recenceMoyenne: number }[];
  dateReference: string;
  /** Vrai si chaque client n'a qu'une ligne : la fréquence ne distingue alors personne. */
  frequenceUniforme: boolean;
}

/** Note de 1 à 5 par rang (quintiles) ; les ex æquo reçoivent la même note. */
function noterParRang(valeurs: number[], croissant: boolean): number[] {
  const tries = [...valeurs].sort((a, b) => a - b);
  const n = tries.length;
  return valeurs.map((v) => {
    // Rang moyen des ex æquo, pour qu'une même valeur ait toujours la même note
    let bas = 0, haut = n;
    while (bas < haut) { const m = (bas + haut) >> 1; if (tries[m] < v) bas = m + 1; else haut = m; }
    const premier = bas;
    bas = premier; haut = n;
    while (bas < haut) { const m = (bas + haut) >> 1; if (tries[m] <= v) bas = m + 1; else haut = m; }
    const rangMoyen = (premier + bas - 1) / 2;
    const note = Math.min(5, Math.floor((5 * rangMoyen) / n) + 1);
    return croissant ? note : 6 - note;
  });
}

/** `achats` : nombre réel d'achats ; « nouveau » se juge sur ce fait, pas sur une note (les ex æquo faussent les rangs). */
function segmenter(r: number, f: number, achats: number): SegmentRFM {
  if (r >= 4 && f >= 4) return "Champions";
  if (f >= 4) return r >= 3 ? "Fidèles" : "À risque";
  if (r >= 4) return achats === 1 ? "Nouveaux" : "Prometteurs";
  if (r === 3) return "À réveiller";
  return f >= 3 ? "À risque" : "Perdus";
}

export function analyserRFM(entetes: string[], corps: Cellule[][], colClient: string, colDate: string, colMontant: string): Resultat<ResultatRFM> {
  const ix = index(entetes, colClient, colDate, colMontant);
  if (!ix) return echec("Colonne introuvable.");
  const [iC, iT, iM] = ix;
  const lire = lecteurDates(corps, iT);
  const parClient = new Map<string, { derniere: number; n: number; montant: number }>();
  let max = -Infinity;
  for (const l of corps) {
    if (estValeurVide(l[iC])) continue;
    const d = lire(l[iT]);
    const x = versNombre(l[iM]);
    if (!d || x === null) continue;
    const t = d.getTime();
    if (t > max) max = t;
    const k = String(l[iC]).trim();
    const c = parClient.get(k) ?? { derniere: -Infinity, n: 0, montant: 0 };
    c.derniere = Math.max(c.derniere, t);
    c.n++;
    c.montant += x;
    parClient.set(k, c);
  }
  if (parClient.size < 10) return echec(`Il faut au moins 10 clients différents dans « ${colClient} » (${parClient.size} trouvé(s)).`);
  const liste = [...parClient];
  // Date de référence : le lendemain du dernier achat du fichier (pas « aujourd'hui », le fichier peut être ancien)
  const recences = liste.map(([, c]) => Math.round((max - c.derniere) / JOUR_MS));
  const R = noterParRang(recences, false);
  const F = noterParRang(liste.map(([, c]) => c.n), true);
  const M = noterParRang(liste.map(([, c]) => c.montant), true);
  const clients: ClientRFM[] = liste.map(([client, c], i) => ({
    client, recenceJours: recences[i], frequence: c.n, montant: c.montant, r: R[i], f: F[i], m: M[i], segment: segmenter(R[i], F[i], c.n),
  }));
  const totalMontant = clients.reduce((s, c) => s + c.montant, 0);
  const segments = ORDRE_SEGMENTS.map((segment) => {
    const du = clients.filter((c) => c.segment === segment);
    const montant = du.reduce((s, c) => s + c.montant, 0);
    return {
      segment,
      nb: du.length,
      partClients: (100 * du.length) / clients.length,
      montant,
      partMontant: totalMontant ? (100 * montant) / totalMontant : 0,
      recenceMoyenne: du.length ? du.reduce((s, c) => s + c.recenceJours, 0) / du.length : 0,
    };
  }).filter((s) => s.nb > 0);
  const d = new Date(max);
  return {
    ok: true,
    valeur: {
      clients,
      segments,
      dateReference: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`,
      frequenceUniforme: clients.every((c) => c.frequence === 1),
    },
  };
}

// ---------------------------------------------------------------------------
// Cohortes
// ---------------------------------------------------------------------------

export interface Cohorte {
  mois: string;
  taille: number;
  /** % de la cohorte encore actif k mois après son premier achat (k = 0, 1, 2…), null au-delà des données. */
  retention: (number | null)[];
}

export interface ResultatCohortes {
  cohortes: Cohorte[];
  nbMois: number;
  /** Rétention moyenne pondérée à M+1, M+3 et M+6 (null si pas assez de recul). */
  moyenne: { m1: number | null; m3: number | null; m6: number | null };
}

const MAX_COHORTES = 12;

export function analyserCohortes(entetes: string[], corps: Cellule[][], colClient: string, colDate: string): Resultat<ResultatCohortes> {
  const ix = index(entetes, colClient, colDate);
  if (!ix) return echec("Colonne introuvable.");
  const [iC, iT] = ix;
  const lire = lecteurDates(corps, iT);
  const moisParClient = new Map<string, Set<number>>();
  let dernier = -Infinity;
  for (const l of corps) {
    if (estValeurVide(l[iC])) continue;
    const d = lire(l[iT]);
    if (!d) continue;
    const k = cleMois(d);
    if (k > dernier) dernier = k;
    const c = String(l[iC]).trim();
    const s = moisParClient.get(c) ?? new Set<number>();
    s.add(k);
    moisParClient.set(c, s);
  }
  if (moisParClient.size < 10) return echec(`Il faut au moins 10 clients différents dans « ${colClient} ».`);
  const parCohorte = new Map<number, Set<number>[]>();
  for (const mois of moisParClient.values()) {
    const premier = Math.min(...mois);
    const liste = parCohorte.get(premier) ?? [];
    liste.push(mois);
    parCohorte.set(premier, liste);
  }
  const debuts = [...parCohorte.keys()].sort((a, b) => a - b);
  if (debuts.length < 2) return echec("Tous les clients ont commencé le même mois : il faut au moins deux mois de premiers achats.");
  if (!Array.from(moisParClient.values()).some((s) => s.size > 1)) return echec("Aucun client n'a acheté sur deux mois différents : la fidélité ne peut pas être mesurée.");

  const retenus = debuts.slice(-MAX_COHORTES);
  const nbMois = Math.min(12, dernier - retenus[0] + 1);
  const cohortes: Cohorte[] = retenus.map((debut) => {
    const membres = parCohorte.get(debut)!;
    const retention = Array.from({ length: nbMois }, (_, k) =>
      debut + k > dernier ? null : (100 * membres.filter((m) => m.has(debut + k)).length) / membres.length
    );
    return { mois: libelleMois(debut), taille: membres.length, retention };
  });
  const moyenneA = (k: number) => {
    let poids = 0, somme = 0;
    for (const c of cohortes) {
      const v = c.retention[k];
      if (v === null || v === undefined) continue;
      poids += c.taille;
      somme += v * c.taille;
    }
    return poids ? somme / poids : null;
  };
  return { ok: true, valeur: { cohortes, nbMois, moyenne: { m1: moyenneA(1), m3: moyenneA(3), m6: moyenneA(6) } } };
}

// ---------------------------------------------------------------------------
// Détection des colonnes utiles
// ---------------------------------------------------------------------------

interface InfoMinimale {
  type: string;
  role: string;
  stats: Record<string, unknown>;
}

const RE_CLIENT = /(client|customer|acheteur|buyer|abonne|membre|member|patient|usager|adherent|contact|compte|account)/;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export interface ColonnesMetier {
  date: string | null;
  client: string | null;
  mesure: string | null;
  dimensions: string[];
  dates: string[];
  mesures: string[];
  candidatsClient: string[];
}

/** Propose les colonnes de chaque analyse à partir du profil des colonnes (l'utilisateur peut les changer). */
export function detecterColonnesMetier(statistiques: Record<string, InfoMinimale>, mesuresPrincipales: string[]): ColonnesMetier {
  const noms = Object.keys(statistiques).filter((n) => n !== "Fichier Source");
  const dates = noms.filter((n) => statistiques[n].type === "date");
  const mesures = [...new Set([...mesuresPrincipales, ...noms.filter((n) => statistiques[n].type === "numerique")])];
  const dimensions = noms.filter((n) => {
    const i = statistiques[n];
    const nb = Number(i.stats.nbCategoriesDistinctes ?? 0);
    return i.type === "categorielle" && nb >= 3;
  });
  const candidatsClient = noms
    .filter((n) => statistiques[n].type === "identifiant" || statistiques[n].type === "categorielle")
    .sort((a, b) => Number(RE_CLIENT.test(norm(b))) - Number(RE_CLIENT.test(norm(a))));
  const client = candidatsClient.find((n) => RE_CLIENT.test(norm(n))) ?? null;
  return { date: dates[0] ?? null, client, mesure: mesures[0] ?? null, dimensions, dates, mesures, candidatsClient };
}
