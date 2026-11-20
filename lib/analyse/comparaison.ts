// lib/analyse/comparaison.ts — comparaison de 2 fichiers ou plus, sur toutes les colonnes (nombres, dates et texte).
import { parseNombre, estValeurVide, type Cellule } from "./utils";
import { convertirDate, formaterDateISO } from "./dates";
import { detecterTypeColonne } from "./detection";
import { operationPour } from "./mesures";

export interface FichierAComparer {
  nom: string;
  entetes: string[];
  corps: Cellule[][];
}

export type NatureColonne = "numerique" | "date" | "texte";

/** Une colonne présente dans tous les fichiers, même écrite différemment (« Montant TTC » / « montant_ttc »). */
export interface ColonneCommune {
  nom: string;
  /** Position de la colonne dans chaque fichier, dans l'ordre des fichiers. */
  indices: number[];
  nature: NatureColonne;
}

export const COLONNE_SOURCE = "Fichier Source";

/** Nom de colonne réduit à l'essentiel pour reconnaître les variantes d'écriture. */
export function cleNomColonne(nom: string): string {
  return String(nom ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Nom de fichier sans extension, pour les en-têtes du tableau comparatif. */
export function nomCourt(nom: string): string {
  return String(nom ?? "").replace(/\.[^/.]+$/, "").trim() || String(nom ?? "");
}

const RE_NOMBRE_SEUL = /^[-+−]?\d[\d\s  ]*([.,]\d+)?$/;
const RE_DATE_COMPLETE = /^(\d{1,2}[/\-.]\d{1,2}[/\-.](\d{4}|\d{2})|\d{4}[/\-]\d{1,2}[/\-]\d{1,2})([ T]\d{1,2}:\d{2}(:\d{2})?)?$/;

/**
 * Valeur de rapprochement d'une cellule, quel que soit son type :
 * - nombres : 1001, « 1001 », « 1 001 » et « 1001,00 » se retrouvent ;
 * - dates : une date Excel, « 05/01/2025 » et « 2025-01-05 » se retrouvent ;
 * - texte : sans casse, sans accents, espaces superflus retirés.
 */
export function normaliserValeurCle(v: Cellule | Date): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : formaterDateISO(v).slice(0, 10);
  if (typeof v === "number") return Number.isFinite(v) ? `n:${Number(v.toPrecision(15))}` : "";
  if (typeof v === "boolean") return v ? "vrai" : "faux";
  const s = String(v).trim();
  if (!s || estValeurVide(s)) return "";
  if (RE_NOMBRE_SEUL.test(s)) {
    const n = parseNombre(s);
    if (n !== null) return `n:${Number(n.toPrecision(15))}`;
  }
  if (RE_DATE_COMPLETE.test(s)) {
    const d = convertirDate(s);
    if (d) return formaterDateISO(d).slice(0, 10);
  }
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

function natureDe(nom: string, valeurs: Cellule[]): NatureColonne {
  const { type } = detecterTypeColonne(nom, valeurs);
  if (type === "numerique") return "numerique";
  if (type === "date") return "date";
  return "texte";
}

/** Colonnes présentes dans tous les fichiers (les variantes d'écriture d'un même nom sont réunies). */
export function colonnesCommunes(fichiers: FichierAComparer[]): ColonneCommune[] {
  if (fichiers.length === 0) return [];
  const resultat: ColonneCommune[] = [];
  const dejaVues = new Set<string>();

  fichiers[0].entetes.forEach((nom, i0) => {
    if (nom === COLONNE_SOURCE) return;
    const cle = cleNomColonne(nom);
    if (!cle || dejaVues.has(cle)) return;
    const indices = [i0];
    for (let k = 1; k < fichiers.length; k++) {
      const i = fichiers[k].entetes.findIndex((h) => h !== COLONNE_SOURCE && cleNomColonne(h) === cle);
      if (i === -1) return;
      indices.push(i);
    }
    dejaVues.add(cle);
    const echantillon: Cellule[] = [];
    fichiers.forEach((f, k) => {
      for (const ligne of f.corps.slice(0, 2000)) echantillon.push(ligne[indices[k]]);
    });
    resultat.push({ nom: nom.trim(), indices, nature: natureDe(nom, echantillon) });
  });

  return resultat;
}

/**
 * Empile les fichiers sur leurs colonnes communes, avec une colonne « Fichier Source » :
 * c'est le format du benchmark (une série par fichier sur chaque mesure).
 */
export function empilerPourComparaison(fichiers: FichierAComparer[]): {
  entetes: string[];
  corps: Cellule[][];
  colonnes: ColonneCommune[];
} {
  const colonnes = colonnesCommunes(fichiers);
  const entetes = [COLONNE_SOURCE, ...colonnes.map((c) => c.nom)];
  const corps: Cellule[][] = [];
  fichiers.forEach((f, k) => {
    for (const ligne of f.corps) {
      corps.push([f.nom, ...colonnes.map((c) => ligne[c.indices[k]] ?? "")]);
    }
  });
  return { entetes, corps, colonnes };
}

export interface OptionsComparaison {
  /** Colonnes de rapprochement (une ou plusieurs). Vide : comparaison des totaux de chaque fichier. */
  cles: string[];
  /** Colonnes à comparer ; par défaut toutes les colonnes communes hors clés. */
  colonnes?: string[];
  /** Index du fichier de référence pour les écarts (0 par défaut). */
  reference?: number;
}

export interface SyntheseColonne {
  colonne: string;
  operation: "somme" | "moyenne";
  parFichier: { nom: string; valeur: number | null; nbValeurs: number }[];
  /** Écart de chaque fichier par rapport à la référence. */
  ecarts: { nom: string; ecart: number | null; variationPct: number | null }[];
}

export interface BilanComparaison {
  nbFichiers: number;
  reference: string;
  cles: string[];
  nbCles: number;
  identiques: number;
  avecEcarts: number;
  incompletes: number;
  /** Lignes d'un même fichier ayant la même clé, regroupées (sommées ou moyennées). */
  lignesRegroupees: number;
  parFichier: { nom: string; nbLignes: number; absentes: number }[];
  colonnesComparees: { nom: string; nature: NatureColonne }[];
  colonnesIgnorees: string[];
}

export interface ResultatComparaison {
  entetes: string[];
  corps: Cellule[][];
  synthese: SyntheseColonne[];
  bilan: BilanComparaison;
}

export const STATUT_IDENTIQUE = "Identique";
export const STATUT_ECART = "Écarts de valeurs";
const PREFIXE_ABSENT = "Absent de : ";

const arrondi = (v: number) => Number(v.toPrecision(12));

function variation(ref: number | null, val: number | null): number | null {
  if (ref === null || val === null || ref === 0) return null;
  return Math.round(((val - ref) / Math.abs(ref)) * 1000) / 10;
}

function egauxNombres(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

interface Agregat {
  somme: number;
  n: number;
  premiere: Cellule;
}

/** Somme ou moyenne d'une colonne numérique sur un groupe de lignes. */
function valeurAgregee(a: Agregat | undefined, operation: "somme" | "moyenne"): number | null {
  if (!a || a.n === 0) return null;
  return arrondi(operation === "somme" ? a.somme : a.somme / a.n);
}

/**
 * Compare 2 fichiers ou plus.
 * - Avec une clé : une ligne par valeur de clé, la valeur de chaque fichier côte à côte, l'écart et la variation
 *   pour les nombres, « Identique / Différent » pour le texte et les dates, et un statut (absent d'un fichier…).
 *   Une clé qui revient plusieurs fois dans un même fichier (ex. « Région ») est regroupée : sommes pour les
 *   montants et quantités, moyennes pour les prix et taux.
 * - Sans clé : une ligne par colonne numérique, avec le total (ou la moyenne) de chaque fichier et les écarts.
 */
export function comparerFichiers(fichiers: FichierAComparer[], options: OptionsComparaison): ResultatComparaison {
  if (fichiers.length < 2) throw new Error("Il faut au moins 2 fichiers pour comparer.");
  const reference = Math.min(Math.max(options.reference ?? 0, 0), fichiers.length - 1);
  const communes = colonnesCommunes(fichiers);
  if (communes.length === 0) throw new Error("Ces fichiers ne partagent aucune colonne : comparaison impossible.");

  const parCle = new Map(communes.map((c) => [cleNomColonne(c.nom), c]));
  const cles = options.cles
    .map((nom) => parCle.get(cleNomColonne(nom)))
    .filter((c): c is ColonneCommune => !!c);
  const nomsCles = new Set(cles.map((c) => c.nom));

  const demandees = options.colonnes?.length
    ? new Set(options.colonnes.map(cleNomColonne))
    : null;
  const comparees = communes.filter((c) => !nomsCles.has(c.nom) && (!demandees || demandees.has(cleNomColonne(c.nom))));
  const numeriques = comparees.filter((c) => c.nature === "numerique");
  const noms = fichiers.map((f) => nomCourt(f.nom));
  const nomRef = noms[reference];
  const operations = new Map(numeriques.map((c) => [c.nom, operationPour(c.nom)]));

  // Synthèse globale : total (ou moyenne) de chaque colonne numérique dans chaque fichier
  const synthese: SyntheseColonne[] = numeriques.map((c) => {
    const operation = operations.get(c.nom)!;
    const parFichier = fichiers.map((f, k) => {
      const nums = f.corps.map((l) => parseNombre(l[c.indices[k]])).filter((n): n is number => n !== null);
      const total = nums.reduce((a, b) => a + b, 0);
      return {
        nom: noms[k],
        valeur: nums.length ? arrondi(operation === "somme" ? total : total / nums.length) : null,
        nbValeurs: nums.length,
      };
    });
    const valRef = parFichier[reference].valeur;
    return {
      colonne: c.nom,
      operation,
      parFichier,
      ecarts: parFichier.map((p) => ({
        nom: p.nom,
        ecart: p.valeur !== null && valRef !== null ? arrondi(p.valeur - valRef) : null,
        variationPct: variation(valRef, p.valeur),
      })),
    };
  });

  const autres = noms.map((_, k) => k).filter((k) => k !== reference);
  const bilanBase = {
    nbFichiers: fichiers.length,
    reference: nomRef,
    cles: cles.map((c) => c.nom),
    colonnesComparees: comparees.map((c) => ({ nom: c.nom, nature: c.nature })),
    colonnesIgnorees: fichiers.flatMap((f) =>
      f.entetes.filter((h) => h !== COLONNE_SOURCE && !parCle.has(cleNomColonne(h)))
    ).filter((h, i, t) => t.indexOf(h) === i),
  };

  // ===== Sans clé : comparaison des totaux =====
  if (cles.length === 0) {
    if (numeriques.length === 0) {
      throw new Error("Aucune colonne numérique commune : choisissez une colonne de rapprochement pour comparer le texte.");
    }
    const entetes = [
      "Indicateur",
      "Calcul",
      ...noms,
      ...autres.flatMap((k) => [`Écart ${noms[k]} vs ${nomRef}`, `Variation % ${noms[k]} vs ${nomRef}`]),
    ];
    const corps: Cellule[][] = synthese.map((s) => [
      s.colonne,
      s.operation === "somme" ? "Somme" : "Moyenne",
      ...s.parFichier.map((p) => p.valeur ?? ""),
      ...autres.flatMap((k) => [s.ecarts[k].ecart ?? "", s.ecarts[k].variationPct ?? ""]),
    ]);
    const avecEcarts = synthese.filter((s) => autres.some((k) => s.ecarts[k].ecart !== null && s.ecarts[k].ecart !== 0)).length;
    return {
      entetes,
      corps,
      synthese,
      bilan: {
        ...bilanBase,
        nbCles: synthese.length,
        identiques: synthese.length - avecEcarts,
        avecEcarts,
        incompletes: 0,
        lignesRegroupees: 0,
        parFichier: fichiers.map((f, k) => ({ nom: noms[k], nbLignes: f.corps.length, absentes: 0 })),
      },
    };
  }

  // ===== Avec clé : rapprochement ligne à ligne =====
  type Groupe = { libelles: Cellule[]; parFichier: (Map<string, Agregat> | null)[] };
  const groupes = new Map<string, Groupe>();
  let lignesRegroupees = 0;

  fichiers.forEach((f, k) => {
    for (const ligne of f.corps) {
      const valeursCle = cles.map((c) => normaliserValeurCle(ligne[c.indices[k]]));
      if (valeursCle.every((v) => v === "")) continue;
      const cle = valeursCle.join("§");
      let g = groupes.get(cle);
      if (!g) {
        g = { libelles: cles.map((c) => ligne[c.indices[k]] ?? ""), parFichier: fichiers.map(() => null) };
        groupes.set(cle, g);
      }
      let cellules = g.parFichier[k];
      if (cellules) lignesRegroupees++;
      else {
        cellules = new Map();
        g.parFichier[k] = cellules;
      }
      for (const c of comparees) {
        const brut = ligne[c.indices[k]];
        let a = cellules.get(c.nom);
        if (!a) {
          a = { somme: 0, n: 0, premiere: "" };
          cellules.set(c.nom, a);
        }
        if (estValeurVide(brut)) continue;
        if (estValeurVide(a.premiere)) a.premiere = brut;
        if (c.nature === "numerique") {
          const n = parseNombre(brut);
          if (n !== null) {
            a.somme += n;
            a.n++;
          }
        }
      }
    }
  });

  const entetes: string[] = [...cles.map((c) => c.nom), "Statut", "Présence"];
  for (const c of comparees) {
    noms.forEach((n) => entetes.push(`${c.nom} [${n}]`));
    if (c.nature === "numerique") {
      autres.forEach((k) => {
        entetes.push(`${c.nom} — écart ${noms[k]} vs ${nomRef}`);
        entetes.push(`${c.nom} — variation % ${noms[k]} vs ${nomRef}`);
      });
    } else {
      entetes.push(`${c.nom} — comparaison`);
    }
  }

  let identiques = 0;
  let avecEcarts = 0;
  let incompletes = 0;
  const absentes = fichiers.map(() => 0);
  const corps: Cellule[][] = [];

  for (const g of groupes.values()) {
    const manquants = g.parFichier.map((p, k) => (p ? -1 : k)).filter((k) => k !== -1);
    manquants.forEach((k) => absentes[k]++);
    const presents = g.parFichier.map((p, k) => (p ? k : -1)).filter((k) => k !== -1);
    let difference = false;
    const cellules: Cellule[] = [];

    for (const c of comparees) {
      if (c.nature === "numerique") {
        const op = operations.get(c.nom)!;
        const vals = g.parFichier.map((p) => valeurAgregee(p?.get(c.nom), op));
        vals.forEach((v) => cellules.push(v ?? ""));
        const valRef = vals[reference];
        autres.forEach((k) => {
          const v = vals[k];
          const ecart = v !== null && valRef !== null ? arrondi(v - valRef) : null;
          if (ecart !== null && !egauxNombres(v as number, valRef as number)) difference = true;
          cellules.push(ecart ?? "");
          cellules.push(variation(valRef, v) ?? "");
        });
        const connus = vals.filter((v): v is number => v !== null);
        if (connus.length >= 2 && connus.some((v) => !egauxNombres(v, connus[0]))) difference = true;
      } else {
        const vals = g.parFichier.map((p) => p?.get(c.nom)?.premiere ?? "");
        vals.forEach((v) => cellules.push(v));
        const normes = presents.map((k) => normaliserValeurCle(vals[k]));
        const identique = normes.every((v) => v === normes[0]);
        if (!identique) difference = true;
        cellules.push(presents.length < 2 ? "—" : identique ? "Identique" : "Différent");
      }
    }

    let statut: string;
    if (manquants.length > 0) {
      incompletes++;
      statut = PREFIXE_ABSENT + manquants.map((k) => noms[k]).join(", ");
    } else if (difference) {
      avecEcarts++;
      statut = STATUT_ECART;
    } else {
      identiques++;
      statut = STATUT_IDENTIQUE;
    }

    corps.push([...g.libelles, statut, `${presents.length}/${fichiers.length}`, ...cellules]);
  }

  // Écarts et absences d'abord : ce sont eux que l'on cherche
  const rang = (s: Cellule) => (s === STATUT_IDENTIQUE ? 2 : s === STATUT_ECART ? 0 : 1);
  const idxStatut = cles.length;
  corps.sort((a, b) => rang(a[idxStatut]) - rang(b[idxStatut]));

  return {
    entetes,
    corps,
    synthese,
    bilan: {
      ...bilanBase,
      nbCles: groupes.size,
      identiques,
      avecEcarts,
      incompletes,
      lignesRegroupees,
      parFichier: fichiers.map((f, k) => ({ nom: noms[k], nbLignes: f.corps.length, absentes: absentes[k] })),
    },
  };
}

/** Clé proposée par défaut : un identifiant commun (code, référence, matricule…), sinon aucune. */
export function cleParDefaut(colonnes: ColonneCommune[]): string {
  const id = colonnes.find((c) => /(^|[^a-z])(id|code|ref|reference|matricule|numero|num|sku)([^a-z]|$)/i.test(
    c.nom.normalize("NFD").replace(/[̀-ͯ]/g, "")
  ));
  return id?.nom ?? "";
}
