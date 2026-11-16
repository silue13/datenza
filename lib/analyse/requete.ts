// lib/analyse/requete.ts — moteur de calcul à la demande pour l'assistant IA.
// Le modèle ne voit jamais les lignes : il décrit le calcul voulu (filtres, regroupement, mesures, tri),
// ce moteur l'exécute sur TOUTES les lignes, dans le navigateur, et renvoie un petit tableau de résultats.
import { arrondir, estValeurVide, parseNombre, percentile, type Cellule } from "./utils";
import { convertirDate, detecterOrdreDate, estAnnee, trierChronologiquement, type OrdreDate } from "./dates";
import type { ConditionFiltre } from "./filtres";

export type CalculRequete = "somme" | "moyenne" | "mediane" | "min" | "max" | "nombre" | "distincts";
export type GranulariteRequete = "jour" | "mois" | "trimestre" | "annee";

export interface MesureRequete {
  /** Colonne à agréger ; absente pour compter les lignes. */
  colonne?: string | null;
  calcul: CalculRequete;
}

export interface SpecRequete {
  titre?: string;
  filtres?: ConditionFiltre[];
  grouper_par?: string[];
  /** Pour regrouper une colonne de dates par mois, trimestre ou année (s'applique au premier regroupement). */
  granularite?: GranulariteRequete;
  mesures?: MesureRequete[];
  trier?: { par?: string | number; ordre?: "asc" | "desc" };
  limite?: number;
}

export interface ResultatRequete {
  titre: string;
  colonnes: string[];
  lignes: (string | number | null)[][];
  /** Lignes du fichier retenues après filtres. */
  nbLignesRetenues: number;
  /** Lignes retenues mais absentes des groupes : valeur de regroupement vide ou date illisible. */
  nbLignesSansGroupe: number;
  nbGroupes: number;
  tronque: boolean;
  erreur?: string;
}

export const MAX_REQUETES = 5;
const MAX_LIGNES_RESULTAT = 50;
const MAX_REGROUPEMENTS = 2;
const MAX_MESURES = 6;

const CALCULS: Record<string, CalculRequete> = {
  somme: "somme", sum: "somme", total: "somme",
  moyenne: "moyenne", average: "moyenne", avg: "moyenne", mean: "moyenne",
  mediane: "mediane", median: "mediane",
  min: "min", minimum: "min",
  max: "max", maximum: "max",
  nombre: "nombre", count: "nombre", compte: "nombre", effectif: "nombre",
  distincts: "distincts", distinct: "distincts", count_distinct: "distincts", uniques: "distincts",
};
/** « superieur » et « inferieur » incluent la borne (≥, ≤) ; « > » et « < » sont stricts. */
type OperateurRequete = ConditionFiltre["operateur"] | "superieur_strict" | "inferieur_strict";
const OPERATEURS: Record<string, OperateurRequete> = {
  egal: "egal", "=": "egal", "==": "egal", eq: "egal", equals: "egal", dans: "egal", in: "egal",
  different: "different", "!=": "different", "<>": "different", neq: "different",
  contient: "contient", contains: "contient",
  superieur: "superieur", ">=": "superieur", "≥": "superieur", gte: "superieur", superieurouegal: "superieur",
  ">": "superieur_strict", gt: "superieur_strict", superieurstrict: "superieur_strict", strictementsuperieur: "superieur_strict",
  inferieur: "inferieur", "<=": "inferieur", "≤": "inferieur", lte: "inferieur", inferieurouegal: "inferieur",
  "<": "inferieur_strict", lt: "inferieur_strict", inferieurstrict: "inferieur_strict", strictementinferieur: "inferieur_strict",
  entre: "entre", between: "entre",
};
const GRANULARITES: Record<string, GranulariteRequete> = {
  jour: "jour", day: "jour", daily: "jour", date: "jour",
  mois: "mois", month: "mois", monthly: "mois",
  trimestre: "trimestre", quarter: "trimestre", quarterly: "trimestre",
  annee: "annee", an: "annee", year: "annee", yearly: "annee",
};
const LIBELLES_CALCUL: Record<CalculRequete, string> = {
  somme: "Somme", moyenne: "Moyenne", mediane: "Médiane", min: "Minimum", max: "Maximum", nombre: "Nombre", distincts: "Valeurs distinctes",
};

const norm = (s: unknown) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const p2 = (n: number) => String(n).padStart(2, "0");
/** Texte comparé sans casse ni accents : « Bouaké » = « BOUAKE ». */
const texteN = (v: unknown) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** Le modèle envoie parfois un objet ou un texte seul là où une liste est attendue : on l'accepte au lieu de l'ignorer. */
const enListe = (x: unknown): unknown[] => (Array.isArray(x) ? x : x === undefined || x === null || x === "" ? [] : [x]);
const JOUR_MS = 86_400_000;

/** Une colonne est « de dates » si au moins 80 % de ses valeurs se lisent comme des dates ; on en déduit aussi jour/mois ou mois/jour. */
function profilDate(corps: Cellule[][], idx: number): { estDate: boolean; ordre: OrdreDate } {
  const echantillon: Cellule[] = [];
  for (const l of corps) {
    if (!estValeurVide(l[idx])) echantillon.push(l[idx]);
    if (echantillon.length >= 2000) break;
  }
  const ordre = detecterOrdreDate(echantillon);
  const estDate = echantillon.length > 0 && echantillon.filter((v) => !estAnnee(v) && convertirDate(v, ordre)).length / echantillon.length >= 0.8;
  return { estDate, ordre };
}

interface FiltrePret {
  colonne: string;
  idx: number;
  operateur: OperateurRequete;
  valeurs: unknown[];
  valeurFin: unknown;
  estDate: boolean;
  ordre: OrdreDate;
}

/** Valeur d'une cellule sur l'axe de comparaison du filtre : millisecondes pour une colonne de dates, nombre sinon. */
function positionCellule(v: Cellule, f: FiltrePret): number | null {
  if (f.estDate) {
    const d = convertirDate(v, f.ordre);
    if (d) return d.getTime();
    return estAnnee(v) ? new Date(Number(String(v).trim()), 0, 1).getTime() : null;
  }
  const n = typeof v === "boolean" ? null : parseNombre(v);
  if (n !== null) return n;
  const d = convertirDate(v, f.ordre);
  return d ? d.getTime() : null;
}

/**
 * Intervalle [début, fin] désigné par la valeur d'un filtre. Sur une colonne de dates, « 2024 » couvre toute l'année,
 * « 2024-03 » tout le mois et « 15/03/2024 » toute la journée ; ailleurs, c'est un nombre (ou une date) ponctuel.
 */
function bornes(x: unknown, f: FiltrePret): [number, number] | null {
  if (!f.estDate) {
    const n = typeof x === "boolean" ? null : parseNombre(x);
    if (n !== null) return [n, n];
    const d = convertirDate(x, f.ordre);
    return d ? [d.getTime(), d.getTime()] : null;
  }
  const s = String(x ?? "").trim();
  let m = s.match(/^(\d{4})$/);
  if (m) return [new Date(+m[1], 0, 1).getTime(), new Date(+m[1] + 1, 0, 1).getTime() - 1];
  m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return [new Date(+m[1], +m[2] - 1, 1).getTime(), new Date(+m[1], +m[2], 1).getTime() - 1];
  const d = convertirDate(typeof x === "number" ? String(x) : x, f.ordre);
  if (!d) return null;
  const t = d.getTime();
  const minuit = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
  return [t, minuit ? t + JOUR_MS - 1 : t];
}

function memeValeur(v: Cellule, x: unknown, f: FiltrePret): boolean {
  if (f.estDate) {
    const b = bornes(x, f);
    const t = positionCellule(v, f);
    if (b && t !== null) return t >= b[0] && t <= b[1];
  }
  if (texteN(v) === texteN(x)) return true;
  const a = typeof v === "boolean" ? null : parseNombre(v);
  const b = typeof x === "boolean" ? null : parseNombre(x);
  return a !== null && b !== null && a === b;
}

function accepte(v: Cellule, f: FiltrePret): boolean {
  const op = f.operateur;
  if (op === "contient") return f.valeurs.some((x) => texteN(v).includes(texteN(x)));
  if (op === "egal") return f.valeurs.some((x) => memeValeur(v, x, f));
  if (op === "different") return !f.valeurs.some((x) => memeValeur(v, x, f));
  const t = positionCellule(v, f);
  const a = bornes(f.valeurs[0], f);
  if (t === null || !a) return false;
  if (op === "superieur") return t >= a[0];
  if (op === "superieur_strict") return t > a[1];
  if (op === "inferieur") return t <= a[1];
  if (op === "inferieur_strict") return t < a[0];
  const b = bornes(f.valeurFin, f);
  return !!b && t >= a[0] && t <= b[1];
}

/** Retrouve une colonne par son nom exact, sinon sans tenir compte de la casse, des accents ni des tirets bas. */
export function trouverColonne(entetes: string[], nom: unknown): string | null {
  if (typeof nom !== "string" || !nom.trim()) return null;
  if (entetes.includes(nom)) return nom;
  const cible = norm(nom);
  return entetes.find((h) => norm(h) === cible) ?? null;
}

function cleDate(d: Date, g: GranulariteRequete): string {
  if (g === "annee") return String(d.getFullYear());
  if (g === "trimestre") return `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`;
  if (g === "mois") return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

interface Acc {
  n: number;
  somme: number;
  nNum: number;
  min: number;
  max: number;
  valeurs: number[] | null;
  distincts: Set<string> | null;
}

/**
 * Exécute une requête décrite par l'IA. Ne lève jamais d'exception : une demande impossible renvoie
 * un résultat avec `erreur`, que l'on retourne au modèle pour qu'il corrige ou le dise à l'utilisateur.
 * `colonnesInterdites` : colonnes sensibles (e-mail, téléphone…) qui ne peuvent servir ni de filtre, ni de regroupement, ni de mesure.
 */
export function executerRequete(
  entetes: string[],
  corps: Cellule[][],
  specBrute: unknown,
  colonnesInterdites: (nom: string) => boolean = () => false
): ResultatRequete {
  const spec = (specBrute && typeof specBrute === "object" ? specBrute : {}) as SpecRequete;
  const titre = String(spec.titre ?? "Calcul").slice(0, 120);
  const echec = (erreur: string): ResultatRequete => ({ titre, colonnes: [], lignes: [], nbLignesRetenues: 0, nbLignesSansGroupe: 0, nbGroupes: 0, tronque: false, erreur });
  const disponibles = `Colonnes disponibles : ${entetes.join(", ")}.`;

  // 1. Filtres
  // Un filtre mal formé est refusé, jamais ignoré : l'ignorer donnerait un chiffre faux présenté comme exact.
  const filtres: FiltrePret[] = [];
  for (const brut of enListe(spec.filtres).slice(0, 8)) {
    const f = (brut && typeof brut === "object" ? brut : {}) as Partial<ConditionFiltre> & { operateur?: unknown };
    const colonne = trouverColonne(entetes, f.colonne);
    if (!colonne) return echec(`Filtre : colonne « ${String(f.colonne)} » introuvable. ${disponibles}`);
    if (colonnesInterdites(colonne)) return echec(`La colonne « ${colonne} » contient des données personnelles : elle ne peut pas servir de filtre.`);
    const operateur = OPERATEURS[String(f.operateur ?? "").trim()] ?? OPERATEURS[norm(f.operateur).replace(/ /g, "")];
    if (!operateur) return echec(`Filtre sur « ${colonne} » : opérateur inconnu. Utilisez egal, different, contient, superieur, inferieur, entre, ou > et < pour une comparaison stricte.`);
    const idx = entetes.indexOf(colonne);
    const pret: FiltrePret = { colonne, idx, operateur, valeurs: Array.isArray(f.valeur) ? f.valeur.slice(0, 50) : [f.valeur], valeurFin: f.valeurFin, ...profilDate(corps, idx) };
    if (operateur !== "egal" && operateur !== "different" && operateur !== "contient") {
      const attendu = pret.estDate ? "une date" : "un nombre ou une date";
      if (!bornes(pret.valeurs[0], pret)) return echec(`Filtre sur « ${colonne} » : la valeur « ${String(pret.valeurs[0])} » n'est pas ${attendu}.`);
      if (operateur === "entre" && !bornes(pret.valeurFin, pret)) return echec(`Filtre « entre » sur « ${colonne} » : "valeurFin" est absente ou n'est pas ${attendu}.`);
    }
    filtres.push(pret);
  }

  // 2. Regroupements
  const groupes: string[] = [];
  for (const g of enListe(spec.grouper_par).slice(0, MAX_REGROUPEMENTS)) {
    const colonne = trouverColonne(entetes, g);
    if (!colonne) return echec(`Regroupement : colonne « ${String(g)} » introuvable. ${disponibles}`);
    if (colonnesInterdites(colonne)) return echec(`La colonne « ${colonne} » contient des données personnelles : elle ne peut pas servir de regroupement.`);
    if (!groupes.includes(colonne)) groupes.push(colonne);
  }

  // 3. Mesures
  const mesures: { colonne: string | null; calcul: CalculRequete; libelle: string }[] = [];
  for (const m of enListe(spec.mesures).slice(0, MAX_MESURES) as (MesureRequete | null)[]) {
    const calcul = CALCULS[norm(m?.calcul).replace(/ /g, "_")] ?? CALCULS[norm(m?.calcul)];
    if (!calcul) return echec(`Calcul « ${String(m?.calcul)} » inconnu. Utilisez somme, moyenne, mediane, min, max, nombre ou distincts.`);
    if (calcul === "nombre" && !m?.colonne) {
      mesures.push({ colonne: null, calcul, libelle: "Nombre de lignes" });
      continue;
    }
    const colonne = trouverColonne(entetes, m?.colonne);
    if (!colonne) return echec(`Mesure : colonne « ${String(m?.colonne)} » introuvable. ${disponibles}`);
    if (colonnesInterdites(colonne) && calcul !== "nombre" && calcul !== "distincts") {
      return echec(`La colonne « ${colonne} » contient des données personnelles : seuls « nombre » et « distincts » sont permis.`);
    }
    mesures.push({ colonne, calcul, libelle: `${LIBELLES_CALCUL[calcul]} de ${colonne}` });
  }
  if (!mesures.length) mesures.push({ colonne: null, calcul: "nombre", libelle: "Nombre de lignes" });

  // 4. Filtrage : nombres, dates lues dans l'ordre jour/mois de la colonne, texte sans casse ni accents
  const lignes = filtres.length ? corps.filter((l) => filtres.every((f) => accepte(l[f.idx], f))) : corps;

  // 5. Agrégation
  const idxG = groupes.map((g) => entetes.indexOf(g));
  const idxM = mesures.map((m) => (m.colonne ? entetes.indexOf(m.colonne) : -1));
  let ordre: OrdreDate = "JMA";
  let groupeEstDate = false;
  if (groupes.length) {
    const profil = profilDate(corps, idxG[0]);
    ordre = profil.ordre;
    groupeEstDate = profil.estDate;
  }
  const granulariteDemandee = spec.granularite ? GRANULARITES[norm(spec.granularite)] : null;
  if (spec.granularite && !granulariteDemandee) {
    return echec(`Granularité « ${String(spec.granularite)} » inconnue. Utilisez jour, mois, trimestre ou annee.`);
  }
  if (granulariteDemandee && groupes.length && !groupeEstDate) {
    return echec(`« ${groupes[0]} » n'est pas une colonne de dates : retirez "granularite".`);
  }
  const granularite = groupeEstDate ? granulariteDemandee ?? null : null;

  const nouvelAcc = (m: { calcul: CalculRequete }): Acc => ({
    n: 0, somme: 0, nNum: 0, min: Infinity, max: -Infinity,
    valeurs: m.calcul === "mediane" ? [] : null,
    distincts: m.calcul === "distincts" ? new Set() : null,
  });
  const table = new Map<string, { cles: string[]; accs: Acc[] }>();
  let nbLignesSansGroupe = 0;
  for (const l of lignes) {
    const cles: string[] = [];
    let ignorer = false;
    for (let k = 0; k < idxG.length; k++) {
      const v = l[idxG[k]];
      if (estValeurVide(v)) {
        ignorer = true;
        break;
      }
      if (k === 0 && granularite) {
        const d = convertirDate(v, ordre);
        if (!d) {
          ignorer = true;
          break;
        }
        cles.push(cleDate(d, granularite));
      } else cles.push(String(v).replace(/["«»“”]/g, "").trim());
    }
    if (ignorer) {
      nbLignesSansGroupe++;
      continue;
    }
    const cle = cles.join("\u0001");
    let g = table.get(cle);
    if (!g) {
      g = { cles, accs: mesures.map(nouvelAcc) };
      table.set(cle, g);
    }
    for (let k = 0; k < mesures.length; k++) {
      const a = g.accs[k];
      if (idxM[k] === -1) {
        a.n++;
        continue;
      }
      const v = l[idxM[k]];
      if (estValeurVide(v)) continue;
      a.n++;
      if (a.distincts) {
        a.distincts.add(String(v).trim().toLowerCase());
        continue;
      }
      const x = typeof v === "boolean" ? null : parseNombre(v);
      if (x === null) continue;
      a.somme += x;
      a.nNum++;
      if (x < a.min) a.min = x;
      if (x > a.max) a.max = x;
      if (a.valeurs) a.valeurs.push(x);
    }
  }

  const valeur = (a: Acc, calcul: CalculRequete): number | null => {
    if (calcul === "nombre") return a.n;
    if (calcul === "distincts") return a.distincts ? a.distincts.size : 0;
    if (!a.nNum) return null;
    if (calcul === "somme") return arrondir(a.somme);
    if (calcul === "moyenne") return arrondir(a.somme / a.nNum);
    if (calcul === "min") return arrondir(a.min);
    if (calcul === "max") return arrondir(a.max);
    return arrondir(percentile([...(a.valeurs ?? [])].sort((p, q) => p - q), 0.5));
  };

  // Une mesure demandée sur du texte : on le dit plutôt que de renvoyer des cases vides
  for (let k = 0; k < mesures.length; k++) {
    const m = mesures[k];
    if (!m.colonne || m.calcul === "nombre" || m.calcul === "distincts") continue;
    let total = 0;
    let numeriques = 0;
    for (const g of table.values()) {
      total += g.accs[k].n;
      numeriques += g.accs[k].nNum;
    }
    if (total > 0 && numeriques === 0) return echec(`« ${m.colonne} » ne contient pas de nombres : ${LIBELLES_CALCUL[m.calcul].toLowerCase()} impossible. Utilisez « nombre » ou « distincts ».`);
  }

  let resultat = [...table.values()].map((g) => ({ cles: g.cles, vals: g.accs.map((a, k) => valeur(a, mesures[k].calcul)) }));
  if (!groupes.length && !resultat.length) resultat = [{ cles: [], vals: mesures.map((m) => (m.calcul === "nombre" || m.calcul === "distincts" ? 0 : null)) }];
  const nbGroupes = resultat.length;

  // 6. Tri : demandé, sinon chronologique pour des périodes, sinon première mesure décroissante
  const colonnes = [...groupes.map((g, k) => (k === 0 && granularite ? `${g} (${granularite})` : g)), ...mesures.map((m) => m.libelle)];
  const ordreTri = norm(spec.trier?.ordre);
  const croissant = ["asc", "ascending", "ascendant", "croissant"].includes(ordreTri);
  const decroissant = ["desc", "descending", "descendant", "decroissant"].includes(ordreTri);
  const sens = croissant ? 1 : -1;
  let indexTri = -1;
  if (spec.trier?.par !== undefined && spec.trier.par !== null) {
    if (typeof spec.trier.par === "number") indexTri = spec.trier.par;
    else {
      const cible = norm(spec.trier.par);
      indexTri = mesures.findIndex((m) => norm(m.libelle) === cible || norm(m.colonne) === cible || norm(m.calcul) === cible);
      if (indexTri === -1) {
        const iG = groupes.findIndex((g) => norm(g) === cible);
        if (iG >= 0) {
          const chrono = iG === 0 ? trierChronologiquement(resultat, (r) => r.cles[0], ordre) : null;
          resultat = chrono ?? resultat.sort((a, b) => a.cles[iG].localeCompare(b.cles[iG], "fr", { numeric: true }));
          if (decroissant) resultat.reverse();
          indexTri = -2;
        }
        // Colonne de tri non reconnue : on classe sur la première mesure dans le sens demandé, plutôt que d'ignorer « asc »
        else indexTri = 0;
      }
    }
  }
  if (indexTri >= 0 && indexTri < mesures.length) {
    const i = indexTri;
    resultat.sort((a, b) => (a.vals[i] === null ? 1 : b.vals[i] === null ? -1 : sens * ((a.vals[i] as number) - (b.vals[i] as number))));
  } else if (indexTri !== -2 && groupes.length) {
    const chrono = granularite ? [...resultat].sort((a, b) => a.cles[0].localeCompare(b.cles[0])) : trierChronologiquement(resultat, (r) => r.cles[0], ordre);
    if (chrono) resultat = decroissant ? chrono.reverse() : chrono;
    else resultat.sort((a, b) => (a.vals[0] === null ? 1 : b.vals[0] === null ? -1 : sens * ((a.vals[0] as number) - (b.vals[0] as number))));
  }

  const limite = Math.min(MAX_LIGNES_RESULTAT, Math.max(1, Math.floor(Number(spec.limite) || 20)));
  const tronque = resultat.length > limite;
  return {
    titre,
    colonnes,
    lignes: resultat.slice(0, limite).map((r) => [...r.cles, ...r.vals]),
    nbLignesRetenues: lignes.length,
    nbLignesSansGroupe,
    nbGroupes,
    tronque,
  };
}

/** Vrai si la réponse du modèle contient un bloc DATENZA_REQUETES, lisible ou non. */
export function contientBlocRequetes(texte: string): boolean {
  return /DATENZA_REQUETES\s*:/i.test(String(texte ?? ""));
}

/**
 * Repère dans une réponse du modèle le bloc DATENZA_REQUETES et renvoie les requêtes demandées (ou null).
 * Tolère les écarts courants : bloc entouré de ```json, requête unique sans crochets, virgule en trop avant } ou ].
 */
export function extraireRequetes(texte: string): unknown[] | null {
  const m = String(texte ?? "").match(/DATENZA_REQUETES\s*:\s*(?:`{3}\s*(?:json)?\s*)?([[{][\s\S]*)/i);
  if (!m) return null;
  const brut = m[1];
  let profondeur = 0;
  let dansChaine = false;
  for (let i = 0; i < brut.length; i++) {
    const c = brut[i];
    if (dansChaine) {
      if (c === "\\") i++;
      else if (c === '"') dansChaine = false;
    } else if (c === '"') dansChaine = true;
    else if (c === "[" || c === "{") profondeur++;
    else if ((c === "]" || c === "}") && --profondeur === 0) {
      const bloc = brut.slice(0, i + 1);
      for (const essai of [bloc, bloc.replace(/,(\s*[}\]])/g, "$1")]) {
        try {
          const json: unknown = JSON.parse(essai);
          if (Array.isArray(json)) return json.slice(0, MAX_REQUETES);
          return json && typeof json === "object" ? [json] : null;
        } catch {
          // on tente la version sans virgules finales
        }
      }
      return null;
    }
  }
  return null;
}

/** Texte compact des résultats, renvoyé au modèle pour qu'il rédige sa réponse avec les vrais chiffres. */
export function resultatsPourIA(resultats: ResultatRequete[]): string {
  return resultats
    .map((r, i) => {
      if (r.erreur) return `CALCUL ${i + 1} — ${r.titre}\nERREUR : ${r.erreur}`;
      const precisions = [
        `${r.nbLignesRetenues} lignes du fichier retenues`,
        ...(r.nbLignesSansGroupe ? [`dont ${r.nbLignesSansGroupe} sans valeur de regroupement, absentes du tableau`] : []),
        ...(r.tronque ? [`${r.lignes.length} premiers résultats sur ${r.nbGroupes}`] : []),
      ];
      const entete = `CALCUL ${i + 1} — ${r.titre} (${precisions.join(", ")})`;
      return [entete, r.colonnes.join(" | "), ...r.lignes.map((l) => l.map((v) => (v === null ? "—" : String(v))).join(" | "))].join("\n");
    })
    .join("\n\n");
}
