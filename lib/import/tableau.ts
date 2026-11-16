// lib/import/tableau.ts — transforme n'importe quel contenu brut (CSV, lignes de tableur, JSON)
// en un tableau propre : en-têtes + lignes. Aucune dépendance externe : tout est testable.
import { estLigneTotal, estValeurVide, parseNombre, type Cellule } from "../analyse/utils";
import { convertirDate, detecterOrdreDate, formaterDateISO } from "../analyse/dates";

export interface TableauImporte {
  entetes: string[];
  corps: Cellule[][];
  /** Ce que l'import a corrigé tout seul, à afficher à l'utilisateur. */
  avertissements: string[];
}

/** Décode un fichier texte : UTF-8 (avec ou sans BOM), UTF-16, sinon Windows-1252 (CSV Excel français). */
export function decoderTexte(octets: Uint8Array): string {
  if (octets.length >= 2 && octets[0] === 0xff && octets[1] === 0xfe) return new TextDecoder("utf-16le").decode(octets.subarray(2));
  if (octets.length >= 2 && octets[0] === 0xfe && octets[1] === 0xff) return new TextDecoder("utf-16be").decode(octets.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(octets).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(octets);
  }
}

const SEPARATEURS = [";", ",", "\t", "|"];

/** Compte les séparateurs d'une ligne en ignorant ceux placés entre guillemets. */
function compterHorsGuillemets(ligne: string, sep: string): number {
  let n = 0;
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') dansGuillemets = !dansGuillemets;
    else if (c === sep && !dansGuillemets) n++;
  }
  return n;
}

/**
 * Détection du séparateur : celui qui découpe les lignes de façon régulière.
 * Une virgule décimale dans les données ne trompe plus la détection.
 */
export function detecterSeparateur(texte: string): string {
  const lignes = texte.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "").slice(0, 30);
  if (!lignes.length) return ",";
  let meilleur = ",";
  let meilleurScore = 0;
  for (const sep of SEPARATEURS) {
    const comptes = lignes.map((l) => compterHorsGuillemets(l, sep));
    const tries = [...comptes].sort((a, b) => a - b);
    const mediane = tries[Math.floor(tries.length / 2)];
    if (mediane === 0) continue;
    const reguliers = comptes.filter((c) => c === mediane).length / comptes.length;
    const score = reguliers * 1000 + Math.min(mediane, 200) + (comptes[0] === mediane ? 50 : 0);
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = sep;
    }
  }
  return meilleur;
}

/** Lecteur CSV conforme RFC 4180 : guillemets, guillemets doublés, retours à la ligne dans une cellule. */
export function parserCsv(texte: string, separateur?: string): string[][] {
  const sep = separateur ?? detecterSeparateur(texte);
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let cellule = "";
  let dansGuillemets = false;
  let i = 0;
  const n = texte.length;
  while (i < n) {
    const c = texte[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          cellule += '"';
          i += 2;
          continue;
        }
        dansGuillemets = false;
      } else cellule += c;
      i++;
      continue;
    }
    if (c === '"' && cellule.trim() === "") {
      cellule = "";
      dansGuillemets = true;
    } else if (c === sep) {
      ligne.push(cellule);
      cellule = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(cellule);
      lignes.push(ligne);
      ligne = [];
      cellule = "";
    } else cellule += c;
    i++;
  }
  if (cellule !== "" || ligne.length) {
    ligne.push(cellule);
    lignes.push(ligne);
  }
  return lignes;
}

/** JSON : tableau d'objets, ou objet contenant un tableau d'objets (data, rows, records, results…). */
export function jsonVersLignes(texte: string): unknown[][] {
  const racine: unknown = JSON.parse(texte);
  let liste: unknown = racine;
  if (!Array.isArray(liste) && liste && typeof liste === "object") {
    liste = Object.values(liste as Record<string, unknown>).find((v) => Array.isArray(v) && v.length > 0) ?? [];
  }
  if (!Array.isArray(liste) || !liste.length) return [];
  if (Array.isArray(liste[0])) return liste as unknown[][];
  const cles: string[] = [];
  const vues = new Set<string>();
  const aplatir = (o: unknown, prefixe = "", sortie: Record<string, unknown> = {}) => {
    if (o && typeof o === "object" && !Array.isArray(o)) {
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) aplatir(v, prefixe ? `${prefixe}.${k}` : k, sortie);
    } else sortie[prefixe || "valeur"] = Array.isArray(o) ? o.join(", ") : o;
    return sortie;
  };
  const plats = (liste as unknown[]).map((o) => aplatir(o));
  for (const p of plats) for (const k of Object.keys(p)) if (!vues.has(k)) (vues.add(k), cles.push(k));
  return [cles, ...plats.map((p) => cles.map((k) => p[k] ?? ""))];
}

function versCellule(v: unknown): Cellule {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : formaterDateISO(v);
  if (typeof v === "number") return Number.isFinite(v) ? v : "";
  if (typeof v === "boolean") return v;
  // Espaces insécables et retours à la ligne internes : sources classiques de « doublons » invisibles
  return String(v).replace(/^﻿/, "").replace(/[  ]/g, " ").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

const nbRemplies = (l: Cellule[]) => l.reduce<number>((s, c) => s + (estValeurVide(c) ? 0 : 1), 0);

/**
 * Repère la vraie ligne d'en-têtes : beaucoup de fichiers commencent par un titre,
 * une date d'extraction ou des lignes vides avant le tableau.
 */
export function detecterLigneEntete(lignes: Cellule[][]): number {
  const limite = Math.min(lignes.length, 300);
  const remplissages: number[] = [];
  for (let i = 0; i < limite; i++) {
    const r = nbRemplies(lignes[i]);
    if (r > 0) remplissages.push(r);
  }
  if (!remplissages.length) return 0;
  const tries = [...remplissages].sort((a, b) => a - b);
  const largeurTypique = tries[Math.floor(tries.length / 2)];
  const seuil = Math.max(1, Math.ceil(largeurTypique * 0.6));

  for (let i = 0; i < Math.min(lignes.length - 1, 40); i++) {
    const l = lignes[i];
    const r = nbRemplies(l);
    if (r < seuil) continue;
    // Un en-tête est fait de libellés : au moins la moitié des cellules remplies ne sont pas des nombres
    const libelles = l.filter((c) => !estValeurVide(c) && (typeof c === "string" ? parseNombre(c) === null || /^(1[89]|20)\d{2}$/.test(c.trim()) : false)).length;
    const anneesNumeriques = l.filter((c) => typeof c === "number" && c >= 1800 && c <= 2100).length;
    if ((libelles + anneesNumeriques) / r < 0.5) continue;
    return i;
  }
  return lignes.findIndex((l) => nbRemplies(l) > 0);
}

function entetesUniques(brut: Cellule[], largeur: number): string[] {
  const vus = new Map<string, number>();
  const res: string[] = [];
  for (let i = 0; i < largeur; i++) {
    let base = String(brut[i] ?? "").replace(/^["'«»“”]+|["'«»“”]+$/g, "").replace(/\s+/g, " ").trim();
    if (!base) base = `Colonne ${i + 1}`;
    const n = (vus.get(base.toLowerCase()) ?? 0) + 1;
    vus.set(base.toLowerCase(), n);
    res.push(n === 1 ? base : `${base} (${n})`);
  }
  return res;
}

/**
 * Colonne de nombres écrits à l'anglaise (« 1,234 », « 1,234,567.89 ») : on la convertit en vrais nombres,
 * sinon « 1,234 » serait lu 1,234 (un virgule deux cent trente-quatre) au lieu de 1234.
 * On n'agit que sur preuve formelle : un groupe de milliers répété ou un point décimal après la virgule.
 */
function normaliserNombresAnglais(corps: Cellule[][], j: number): boolean {
  let preuveAnglaise = 0;
  let preuveFrancaise = 0;
  let ambigus = 0;
  let textes = 0;
  for (const l of corps) {
    const v = l[j];
    if (typeof v !== "string" || !v.includes(",")) continue;
    const s = v.replace(/["'\s  ]/g, "").replace(/^[-+(]?[€$£]?/, "").replace(/[€$£%)]+$/, "");
    if (!/^[\d.,]+$/.test(s)) {
      if (++textes > 20) return false;
      continue;
    }
    if (/^\d{1,3}(,\d{3}){2,}(\.\d+)?$/.test(s) || /^\d{1,3}(,\d{3})+\.\d+$/.test(s)) preuveAnglaise++;
    else if (/^\d{1,3},\d{3}$/.test(s) && !s.startsWith("0")) ambigus++;
    else preuveFrancaise++;
  }
  if (!preuveAnglaise || preuveFrancaise) return false;
  for (const l of corps) {
    const v = l[j];
    if (typeof v !== "string" || !v.includes(",")) continue;
    const n = parseNombre(v.replace(/,(?=\d{3})/g, ""));
    if (n !== null) l[j] = n;
  }
  return preuveAnglaise + ambigus > 0;
}

const MOTS_COMPTAGE = new Set([
  "homme", "hommes", "femme", "femmes", "population", "pop", "menage", "menages", "habitant", "habitants", "effectif",
  "effectifs", "nombre", "nb", "nbre", "total", "electeurs", "inscrits", "votants", "eleves", "etudiants", "naissances",
  "deces", "enfants", "filles", "garcons", "personnes", "individus", "agents", "logements", "exploitations", "cas",
]);
const MOTS_PAS_COMPTAGE = new Set([
  "moyen", "moyenne", "moyens", "moyennes", "taille", "taux", "ratio", "rapport", "densite", "indice", "part",
  "pourcentage", "prix", "cout", "superficie", "surface", "latitude", "longitude", "poids", "duree", "age",
]);

/**
 * Point utilisé comme séparateur de milliers (« 9.073 » = neuf mille soixante-treize), courant dans les
 * tableaux de recensement. Lu tel quel, 832.371 habitants devenait 832,371. On ne convertit que sur indices
 * concordants ; les colonnes converties sont signalées à l'utilisateur.
 *  - texte : toutes les valeurs à point ont exactement 3 chiffres après le point, aucune ne commence par « 0. »,
 *    et il existe une preuve : « 1.234.567 », ou des entiers sans point tous inférieurs à 1000, ou un nom de comptage ;
 *  - nombres (fichier déjà enregistré avec la mauvaise lecture) : même forme, et le nom de la colonne
 *    doit désigner un comptage (hommes, population, ménages…), qui ne peut pas avoir de décimales.
 */
function normaliserMilliersPoint(corps: Cellule[][], j: number, nom: string): boolean {
  const n = nom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const mots = n.split(/[^a-z0-9]+/).filter(Boolean);
  const nomComptage = mots.some((m) => MOTS_COMPTAGE.has(m)) && !mots.some((m) => MOTS_PAS_COMPTAGE.has(m));

  let txt3 = 0;
  let txtMulti = 0;
  let num3 = 0;
  let numCourt = 0;
  let entiers = 0;
  let maxEntier = 0;
  let total = 0;
  for (const l of corps) {
    const v = l[j];
    if (estValeurVide(v)) continue;
    total++;
    if (typeof v === "number") {
      if (Number.isInteger(v)) {
        entiers++;
        maxEntier = Math.max(maxEntier, Math.abs(v));
        continue;
      }
      const a = Math.abs(v);
      const dec = (String(a).split(".")[1] ?? "").length;
      if (a < 1 || a >= 1000 || dec > 3 || String(a).includes("e")) return false;
      if (dec === 3) num3++;
      else numCourt++;
      continue;
    }
    if (typeof v !== "string") return false;
    const s = v.replace(/[\s\u00A0\u202F]/g, "");
    if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
      txt3++;
      if (s.split(".").length > 2) txtMulti++;
    } else if (/^-?\d+$/.test(s)) {
      entiers++;
      maxEntier = Math.max(maxEntier, Math.abs(Number(s)));
    } else return false; // autre forme (6.4, 0.250, 12,5, texte) : ce n'est pas une colonne de milliers à point
  }
  if (maxEntier >= 1000) return false;

  const texte = txt3 >= 3 && num3 + numCourt === 0 && (txtMulti > 0 || entiers > 0 || nomComptage);
  const nombres = txt3 === 0 && nomComptage && num3 >= 3 && num3 >= 0.6 * (num3 + numCourt);
  if (!texte && !nombres) return false;

  for (const l of corps) {
    const v = l[j];
    if (typeof v === "string") {
      const s = v.replace(/[\s\u00A0\u202F]/g, "");
      if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) l[j] = Number(s.replace(/\./g, ""));
      else if (/^-?\d+$/.test(s)) l[j] = Number(s);
    } else if (typeof v === "number" && !Number.isInteger(v)) {
      l[j] = Math.round(v * 1000);
    }
  }
  return true;
}

/** Colonne de dates américaines (12/25/2024) : réécrite en ISO pour que toute l'application la comprenne. */
function normaliserDatesAmericaines(corps: Cellule[][], j: number): boolean {
  const valeurs: string[] = [];
  for (const l of corps) {
    const v = l[j];
    if (typeof v === "string" && /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(v.trim())) valeurs.push(v);
  }
  if (valeurs.length < 3 || detecterOrdreDate(valeurs) !== "MJA") return false;
  for (const l of corps) {
    const v = l[j];
    if (typeof v !== "string") continue;
    const d = convertirDate(v, "MJA");
    if (d) l[j] = formaterDateISO(d);
  }
  return true;
}

/**
 * Point d'entrée unique : lignes brutes -> tableau prêt à analyser.
 * Titre au-dessus du tableau, colonnes vides, lignes vides, lignes de total, en-têtes en double,
 * nombres anglais, dates américaines : tout est traité ici, une seule fois.
 */
export function preparerTableau(lignesBrutes: unknown[][]): TableauImporte {
  const avertissements: string[] = [];
  const lignes: Cellule[][] = lignesBrutes.map((l) => (Array.isArray(l) ? l.map(versCellule) : []));

  const iEntete = detecterLigneEntete(lignes);
  if (iEntete < 0 || !lignes.length) return { entetes: [], corps: [], avertissements };
  if (iEntete > 0) avertissements.push(`${iEntete} ligne(s) de titre ignorée(s) avant le tableau.`);

  const donnees = lignes.slice(iEntete + 1);
  const largeur = Math.max(lignes[iEntete].length, ...donnees.slice(0, 2000).map((l) => l.length));

  // Colonnes à garder : un en-tête ou au moins une valeur
  const gardees: number[] = [];
  for (let j = 0; j < largeur; j++) {
    if (!estValeurVide(lignes[iEntete][j]) || donnees.some((l) => !estValeurVide(l[j]))) gardees.push(j);
  }
  if (gardees.length < largeur) avertissements.push(`${largeur - gardees.length} colonne(s) entièrement vide(s) retirée(s).`);

  const entetes = entetesUniques(gardees.map((j) => lignes[iEntete][j]), gardees.length);
  let nbTotaux = 0;
  let nbEntetesRepetes = 0;
  const signatureEntete = gardees.map((j) => String(lignes[iEntete][j] ?? "").trim().toLowerCase()).join("\u0001");
  const corps: Cellule[][] = [];
  for (const l of donnees) {
    const ligne = gardees.map((j) => l[j] ?? "");
    if (!ligne.some((c) => !estValeurVide(c))) continue;
    if (estLigneTotal(ligne)) {
      nbTotaux++;
      continue;
    }
    // En-tête répété au milieu du fichier (export paginé, fichiers concaténés)
    if (gardees.length > 1 && ligne.map((c) => String(c ?? "").trim().toLowerCase()).join("\u0001") === signatureEntete) {
      nbEntetesRepetes++;
      continue;
    }
    corps.push(ligne);
  }
  if (nbTotaux) avertissements.push(`${nbTotaux} ligne(s) de total ou de sous-total écartée(s) pour ne pas compter deux fois.`);
  if (nbEntetesRepetes) avertissements.push(`${nbEntetesRepetes} ligne(s) d'en-tête répétée(s) retirée(s).`);

  const colsNombres: string[] = [];
  const colsDates: string[] = [];
  const colsMilliers: string[] = [];
  for (let j = 0; j < entetes.length; j++) {
    if (normaliserMilliersPoint(corps, j, entetes[j])) colsMilliers.push(entetes[j]);
    else if (normaliserNombresAnglais(corps, j)) colsNombres.push(entetes[j]);
    else if (normaliserDatesAmericaines(corps, j)) colsDates.push(entetes[j]);
  }
  if (colsMilliers.length) {
    avertissements.push(
      `Point lu comme séparateur de milliers (9.073 = 9 073) dans : ${colsMilliers.join(", ")}. Vérifiez ces colonnes.`
    );
  }
  if (colsNombres.length) avertissements.push(`Nombres au format anglais convertis : ${colsNombres.join(", ")}.`);
  if (colsDates.length) avertissements.push(`Dates au format mois/jour/année converties : ${colsDates.join(", ")}.`);

  return { entetes, corps, avertissements };
}
