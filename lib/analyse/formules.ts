// lib/analyse/formules.ts — mesures réutilisables : formules nommées, définies une fois, calculées partout
// (indicateurs, graphiques, assistant). Inspiré des mesures de Power BI, avec des noms de fonctions en français.
//
//   SOMME([Quantité] * [Prix])                     chiffre d'affaires
//   SOMME([Montant]) - SOMME([Coût])               marge
//   [Marge] / [Chiffre d'affaires]                 taux de marge (réutilise deux mesures)
//   SOMME([Montant]; [Culture] = "Cacao")          somme filtrée
//   SOMME([Montant]) / TOTAL(SOMME([Montant]))     part du total, quel que soit le regroupement
//
// Agrégats : SOMME, MOYENNE, MEDIANE, MIN, MAX, NOMBRE, DISTINCT (et leurs équivalents anglais).
// Une division par zéro, ou un agrégat sans aucune valeur, donne « vide » (null), jamais 0.
import { estValeurVide, parseNombre, percentile, type Cellule } from "./utils";

export type FormatMesure = "nombre" | "pourcentage";

export interface DefinitionMesure {
  id: string;
  nom: string;
  formule: string;
  format: FormatMesure;
  /** Unité affichée après la valeur (« FCFA », « t »…). */
  unite?: string;
  decimales?: number;
}

// ---------------------------------------------------------------- Arbre de la formule

type Agregat = "somme" | "moyenne" | "mediane" | "min" | "max" | "nombre" | "distinct";
type Comparateur = "=" | "<>" | "<" | "<=" | ">" | ">=";

export type Noeud =
  | { t: "nombre"; v: number }
  | { t: "texte"; v: string }
  | { t: "ref"; nom: string }
  | { t: "neg"; e: Noeud }
  | { t: "op"; op: "+" | "-" | "*" | "/"; a: Noeud; b: Noeud }
  | { t: "cmp"; op: Comparateur; a: Noeud; b: Noeud }
  | { t: "logique"; op: "et" | "ou"; a: Noeud; b: Noeud }
  | { t: "non"; e: Noeud }
  | { t: "agregat"; f: Agregat; expr: Noeud | null; condition: Noeud | null }
  | { t: "total"; e: Noeud }
  | { t: "si"; condition: Noeud; alors: Noeud; sinon: Noeud }
  | { t: "fonction"; f: "abs" | "arrondi"; args: Noeud[] };

const AGREGATS: Record<string, Agregat> = {
  somme: "somme", sum: "somme",
  moyenne: "moyenne", average: "moyenne", avg: "moyenne",
  mediane: "mediane", median: "mediane",
  min: "min", minimum: "min",
  max: "max", maximum: "max",
  nombre: "nombre", count: "nombre", nb: "nombre",
  distinct: "distinct", distinctcount: "distinct", "nb.distinct": "distinct", nbdistinct: "distinct",
};

const normaliserMot = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export class ErreurFormule extends Error {}

// ---------------------------------------------------------------- Lecture (analyse lexicale et syntaxique)

type Jeton =
  | { k: "nombre"; v: number }
  | { k: "texte"; v: string }
  | { k: "ref"; v: string }
  | { k: "mot"; v: string }
  | { k: "sym"; v: string };

function decouper(source: string): Jeton[] {
  const jetons: Jeton[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "[") {
      const fin = source.indexOf("]", i + 1);
      if (fin === -1) throw new ErreurFormule("Un crochet « [ » n'est pas refermé.");
      const nom = source.slice(i + 1, fin).trim();
      if (!nom) throw new ErreurFormule("Des crochets vides « [] » : indiquez le nom d'une colonne ou d'une mesure.");
      jetons.push({ k: "ref", v: nom });
      i = fin + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "«") {
      const fermeture = c === "«" ? "»" : c;
      const fin = source.indexOf(fermeture, i + 1);
      if (fin === -1) throw new ErreurFormule("Un texte entre guillemets n'est pas refermé.");
      jetons.push({ k: "texte", v: source.slice(i + 1, fin).trim() });
      i = fin + 1;
      continue;
    }
    // Nombre : 12, 12.5 ou 12,5 (la virgule n'est décimale qu'entre deux chiffres)
    const nombre = source.slice(i).match(/^\d+(?:[.,]\d+)?/);
    if (nombre) {
      jetons.push({ k: "nombre", v: Number(nombre[0].replace(",", ".")) });
      i += nombre[0].length;
      continue;
    }
    const mot = source.slice(i).match(/^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*/);
    if (mot) {
      jetons.push({ k: "mot", v: mot[0] });
      i += mot[0].length;
      continue;
    }
    const deux = source.slice(i, i + 2);
    if (["<>", "<=", ">=", "!=", "&&", "||"].includes(deux)) {
      jetons.push({ k: "sym", v: deux === "!=" ? "<>" : deux });
      i += 2;
      continue;
    }
    if ("+-*/()=<>;,".includes(c)) {
      jetons.push({ k: "sym", v: c });
      i++;
      continue;
    }
    throw new ErreurFormule(`Caractère inattendu « ${c} ».`);
  }
  return jetons;
}

class Lecteur {
  private p = 0;
  constructor(private jetons: Jeton[]) {}

  lire(): Noeud {
    if (!this.jetons.length) throw new ErreurFormule("La formule est vide.");
    const n = this.ou();
    if (this.p < this.jetons.length) throw new ErreurFormule(`« ${this.decrire(this.jetons[this.p])} » est en trop ou mal placé.`);
    return n;
  }

  private decrire(j: Jeton): string {
    return j.k === "ref" ? `[${j.v}]` : j.k === "texte" ? `"${j.v}"` : String(j.v);
  }
  private voir(): Jeton | undefined {
    return this.jetons[this.p];
  }
  private estSym(v: string) {
    const j = this.voir();
    return j?.k === "sym" && j.v === v;
  }
  private estMot(...mots: string[]) {
    const j = this.voir();
    return j?.k === "mot" && mots.includes(normaliserMot(j.v));
  }
  private attendre(v: string, message: string) {
    if (!this.estSym(v)) throw new ErreurFormule(message);
    this.p++;
  }

  private ou(): Noeud {
    let a = this.et();
    while (this.estMot("ou", "or") || this.estSym("||")) {
      this.p++;
      a = { t: "logique", op: "ou", a, b: this.et() };
    }
    return a;
  }
  private et(): Noeud {
    let a = this.non();
    while (this.estMot("et", "and") || this.estSym("&&")) {
      this.p++;
      a = { t: "logique", op: "et", a, b: this.non() };
    }
    return a;
  }
  private non(): Noeud {
    if (this.estMot("non", "not") && this.jetons[this.p + 1]?.k !== "sym") {
      this.p++;
      return { t: "non", e: this.non() };
    }
    return this.comparaison();
  }
  private comparaison(): Noeud {
    const a = this.somme();
    const j = this.voir();
    if (j?.k === "sym" && ["=", "<>", "<", "<=", ">", ">="].includes(j.v)) {
      this.p++;
      return { t: "cmp", op: j.v as Comparateur, a, b: this.somme() };
    }
    return a;
  }
  private somme(): Noeud {
    let a = this.produit();
    while (this.estSym("+") || this.estSym("-")) {
      const op = (this.jetons[this.p++] as { v: "+" | "-" }).v;
      a = { t: "op", op, a, b: this.produit() };
    }
    return a;
  }
  private produit(): Noeud {
    let a = this.unaire();
    while (this.estSym("*") || this.estSym("/")) {
      const op = (this.jetons[this.p++] as { v: "*" | "/" }).v;
      a = { t: "op", op, a, b: this.unaire() };
    }
    return a;
  }
  private unaire(): Noeud {
    if (this.estSym("-")) {
      this.p++;
      return { t: "neg", e: this.unaire() };
    }
    if (this.estSym("+")) {
      this.p++;
      return this.unaire();
    }
    return this.primaire();
  }
  /** Arguments séparés par « ; » ou « , » (la virgule décimale est déjà lue dans les nombres). */
  private arguments(nomFonction: string): Noeud[] {
    this.attendre("(", `Ouvrez une parenthèse après ${nomFonction}.`);
    const args: Noeud[] = [];
    if (this.estSym(")")) {
      this.p++;
      return args;
    }
    for (;;) {
      args.push(this.ou());
      if (this.estSym(";") || this.estSym(",")) {
        this.p++;
        continue;
      }
      this.attendre(")", `Une parenthèse n'est pas refermée après ${nomFonction}.`);
      return args;
    }
  }
  private primaire(): Noeud {
    const j = this.voir();
    if (!j) throw new ErreurFormule("La formule s'arrête trop tôt.");
    if (j.k === "nombre") {
      this.p++;
      return { t: "nombre", v: j.v };
    }
    if (j.k === "texte") {
      this.p++;
      return { t: "texte", v: j.v };
    }
    if (j.k === "ref") {
      this.p++;
      return { t: "ref", nom: j.v };
    }
    if (j.k === "sym" && j.v === "(") {
      this.p++;
      const n = this.ou();
      this.attendre(")", "Une parenthèse n'est pas refermée.");
      return n;
    }
    if (j.k === "mot") {
      const mot = normaliserMot(j.v);
      this.p++;
      if (mot === "vrai" || mot === "true") return { t: "nombre", v: 1 };
      if (mot === "faux" || mot === "false") return { t: "nombre", v: 0 };
      const f = AGREGATS[mot];
      if (f) {
        const args = this.arguments(j.v.toUpperCase());
        if (args.length > 2) throw new ErreurFormule(`${j.v.toUpperCase()} accepte au plus deux arguments : la valeur et une condition.`);
        if (f !== "nombre" && !args.length) throw new ErreurFormule(`${j.v.toUpperCase()} demande une colonne, par exemple ${j.v.toUpperCase()}([Montant]).`);
        return { t: "agregat", f, expr: args[0] ?? null, condition: args[1] ?? null };
      }
      if (mot === "total") {
        const args = this.arguments("TOTAL");
        if (args.length !== 1) throw new ErreurFormule("TOTAL accepte un seul argument, par exemple TOTAL(SOMME([Montant])).");
        return { t: "total", e: args[0] };
      }
      if (mot === "si" || mot === "if") {
        const args = this.arguments("SI");
        if (args.length !== 3) throw new ErreurFormule("SI demande trois arguments : SI(condition; valeur si vrai; valeur si faux).");
        return { t: "si", condition: args[0], alors: args[1], sinon: args[2] };
      }
      if (mot === "abs" || mot === "arrondi" || mot === "round") {
        const args = this.arguments(j.v.toUpperCase());
        const nom = mot === "abs" ? "abs" : "arrondi";
        if (nom === "abs" ? args.length !== 1 : args.length < 1 || args.length > 2) throw new ErreurFormule(`Nombre d'arguments incorrect pour ${j.v.toUpperCase()}.`);
        return { t: "fonction", f: nom, args };
      }
      if (mot === "diviser" || mot === "divide") {
        const args = this.arguments("DIVISER");
        if (args.length !== 2) throw new ErreurFormule("DIVISER demande deux arguments : DIVISER(numérateur; dénominateur).");
        return { t: "op", op: "/", a: args[0], b: args[1] };
      }
      throw new ErreurFormule(`Fonction inconnue « ${j.v} ». Fonctions disponibles : SOMME, MOYENNE, MEDIANE, MIN, MAX, NOMBRE, DISTINCT, TOTAL, SI, DIVISER, ABS, ARRONDI. Les noms de colonnes s'écrivent entre crochets : [${j.v}].`);
    }
    throw new ErreurFormule(`« ${j.v} » est mal placé.`);
  }
}

export function lireFormule(source: string): Noeud {
  return new Lecteur(decouper(source ?? "")).lire();
}

// ---------------------------------------------------------------- Validation

export interface Validation {
  ok: boolean;
  erreur: string | null;
  /** Colonnes et mesures citées par la formule. */
  colonnes: string[];
  mesures: string[];
}

const trouverNom = (liste: string[], nom: string) => liste.find((x) => normaliserMot(x.trim()) === normaliserMot(nom.trim())) ?? null;

/**
 * Vérifie une formule : syntaxe, colonnes et mesures existantes, références circulaires,
 * et place de chaque élément (une colonne ne s'utilise qu'à l'intérieur d'un agrégat ; une mesure, à l'extérieur).
 */
export function validerFormule(formule: string, colonnes: string[], mesures: DefinitionMesure[], idMesure?: string): Validation {
  const citees = { colonnes: new Set<string>(), mesures: new Set<string>() };
  const autres = mesures.filter((m) => m.id !== idMesure);
  try {
    const arbre = lireFormule(formule);
    const parcourir = (n: Noeud, dansAgregat: boolean) => {
      switch (n.t) {
        case "ref": {
          const mesure = autres.find((m) => normaliserMot(m.nom.trim()) === normaliserMot(n.nom.trim()));
          const colonne = trouverNom(colonnes, n.nom);
          if (dansAgregat) {
            if (colonne) citees.colonnes.add(colonne);
            else if (mesure) throw new ErreurFormule(`[${n.nom}] est une mesure : elle ne peut pas être placée dans un agrégat. Écrivez simplement [${n.nom}].`);
            else throw new ErreurFormule(`Colonne introuvable : [${n.nom}].`);
          } else if (mesure) citees.mesures.add(mesure.nom);
          else if (colonne) throw new ErreurFormule(`La colonne [${n.nom}] doit être agrégée, par exemple SOMME([${n.nom}]) ou MOYENNE([${n.nom}]).`);
          else throw new ErreurFormule(`Ni colonne ni mesure ne s'appelle [${n.nom}].`);
          return;
        }
        case "agregat":
          if (dansAgregat) throw new ErreurFormule("Un agrégat ne peut pas en contenir un autre.");
          if (n.expr) parcourir(n.expr, true);
          if (n.condition) parcourir(n.condition, true);
          return;
        case "total":
          if (dansAgregat) throw new ErreurFormule("TOTAL ne peut pas être placé dans un agrégat.");
          parcourir(n.e, false);
          return;
        case "neg":
        case "non":
          parcourir(n.e, dansAgregat);
          return;
        case "op":
        case "cmp":
        case "logique":
          parcourir(n.a, dansAgregat);
          parcourir(n.b, dansAgregat);
          return;
        case "si":
          parcourir(n.condition, dansAgregat);
          parcourir(n.alors, dansAgregat);
          parcourir(n.sinon, dansAgregat);
          return;
        case "fonction":
          n.args.forEach((a) => parcourir(a, dansAgregat));
          return;
        default:
          return;
      }
    };
    parcourir(arbre, false);

    // Références circulaires : la mesure ne doit pas se retrouver dans ses propres dépendances
    const nomActuel = idMesure ? mesures.find((m) => m.id === idMesure)?.nom : undefined;
    const visite = new Set<string>();
    const dependances = (nomMesure: string, chemin: string[]): void => {
      const cle = normaliserMot(nomMesure);
      if (nomActuel && cle === normaliserMot(nomActuel)) throw new ErreurFormule(`Référence circulaire : ${[...chemin, nomMesure].join(" → ")}.`);
      if (visite.has(cle)) return;
      visite.add(cle);
      const m = mesures.find((x) => normaliserMot(x.nom) === cle);
      if (!m) return;
      try {
        for (const dep of mesuresCitees(lireFormule(m.formule))) dependances(dep, [...chemin, m.nom]);
      } catch (e) {
        if (e instanceof ErreurFormule && /circulaire/.test(e.message)) throw e;
      }
    };
    for (const m of citees.mesures) dependances(m, [nomActuel ?? "cette mesure"]);
    return { ok: true, erreur: null, colonnes: [...citees.colonnes], mesures: [...citees.mesures] };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Formule invalide.", colonnes: [...citees.colonnes], mesures: [...citees.mesures] };
  }
}

function mesuresCitees(n: Noeud, dansAgregat = false): string[] {
  switch (n.t) {
    case "ref":
      return dansAgregat ? [] : [n.nom];
    case "agregat":
      return [];
    case "total":
    case "neg":
    case "non":
      return mesuresCitees(n.e, dansAgregat);
    case "op":
    case "cmp":
    case "logique":
      return [...mesuresCitees(n.a, dansAgregat), ...mesuresCitees(n.b, dansAgregat)];
    case "si":
      return [...mesuresCitees(n.condition), ...mesuresCitees(n.alors), ...mesuresCitees(n.sinon)];
    case "fonction":
      return n.args.flatMap((a) => mesuresCitees(a, dansAgregat));
    default:
      return [];
  }
}

// ---------------------------------------------------------------- Calcul

type Valeur = number | string | null;

const versNombreMesure = (v: Valeur | Cellule): number | null => {
  if (v === null || v === undefined || typeof v === "boolean") return typeof v === "boolean" ? (v ? 1 : 0) : null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return estValeurVide(v) ? null : parseNombre(v);
};
const versTexte = (v: Valeur | Cellule) => (v === null || v === undefined ? "" : String(v).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
const vrai = (v: Valeur) => (typeof v === "number" ? v !== 0 : typeof v === "string" ? v !== "" : false);

function comparer(op: Comparateur, a: Valeur, b: Valeur): boolean {
  const na = versNombreMesure(a);
  const nb = versNombreMesure(b);
  if (na !== null && nb !== null) {
    switch (op) {
      case "=": return na === nb;
      case "<>": return na !== nb;
      case "<": return na < nb;
      case "<=": return na <= nb;
      case ">": return na > nb;
      case ">=": return na >= nb;
    }
  }
  const ta = versTexte(a);
  const tb = versTexte(b);
  switch (op) {
    case "=": return ta === tb;
    case "<>": return ta !== tb;
    case "<": return ta < tb;
    case "<=": return ta <= tb;
    case ">": return ta > tb;
    case ">=": return ta >= tb;
  }
}

function arith(op: "+" | "-" | "*" | "/", a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return b === 0 ? null : a / b;
  }
}

/** Calcule des mesures sur des groupes de lignes d'un même jeu de données. */
export class CalculateurMesures {
  private arbres = new Map<string, Noeud | ErreurFormule>();
  private index: Map<string, number>;

  constructor(
    private entetes: string[],
    private toutes: Cellule[][],
    private mesures: DefinitionMesure[]
  ) {
    this.index = new Map(entetes.map((h, i) => [normaliserMot(h.trim()), i]));
  }

  private arbre(m: DefinitionMesure): Noeud {
    // Clé : la formule elle-même, pour qu'une mesure modifiée (même identifiant) soit relue
    let a = this.arbres.get(m.formule);
    if (!a) {
      try {
        a = lireFormule(m.formule);
      } catch (e) {
        a = e instanceof ErreurFormule ? e : new ErreurFormule("Formule invalide.");
      }
      this.arbres.set(m.formule, a);
    }
    if (a instanceof ErreurFormule) throw a;
    return a;
  }

  private mesureParNom(nom: string) {
    return this.mesures.find((m) => normaliserMot(m.nom.trim()) === normaliserMot(nom.trim()));
  }

  /** Valeur de la mesure sur les lignes données (null si incalculable). Lève ErreurFormule si la formule est invalide. */
  calculer(mesure: DefinitionMesure, lignes: Cellule[][]): number | null {
    const v = this.evaluer(this.arbre(mesure), lignes, new Set([mesure.id]));
    const n = versNombreMesure(v);
    return n === null || !Number.isFinite(n) ? null : n;
  }

  /** Comme calculer, mais renvoie null au lieu de lever une erreur. */
  calculerOuVide(mesure: DefinitionMesure, lignes: Cellule[][]): number | null {
    try {
      return this.calculer(mesure, lignes);
    } catch {
      return null;
    }
  }

  private evaluer(n: Noeud, lignes: Cellule[][], pile: Set<string>): Valeur {
    switch (n.t) {
      case "nombre":
        return n.v;
      case "texte":
        return n.v;
      case "ref": {
        const m = this.mesureParNom(n.nom);
        if (!m) throw new ErreurFormule(`Mesure introuvable : [${n.nom}].`);
        if (pile.has(m.id)) throw new ErreurFormule(`Référence circulaire sur [${m.nom}].`);
        return this.evaluer(this.arbre(m), lignes, new Set([...pile, m.id]));
      }
      case "neg": {
        const v = versNombreMesure(this.evaluer(n.e, lignes, pile));
        return v === null ? null : -v;
      }
      case "op":
        return arith(n.op, versNombreMesure(this.evaluer(n.a, lignes, pile)), versNombreMesure(this.evaluer(n.b, lignes, pile)));
      case "cmp":
        return comparer(n.op, this.evaluer(n.a, lignes, pile), this.evaluer(n.b, lignes, pile)) ? 1 : 0;
      case "logique": {
        const a = vrai(this.evaluer(n.a, lignes, pile));
        if (n.op === "et" && !a) return 0;
        if (n.op === "ou" && a) return 1;
        return vrai(this.evaluer(n.b, lignes, pile)) ? 1 : 0;
      }
      case "non":
        return vrai(this.evaluer(n.e, lignes, pile)) ? 0 : 1;
      case "si":
        return vrai(this.evaluer(n.condition, lignes, pile)) ? this.evaluer(n.alors, lignes, pile) : this.evaluer(n.sinon, lignes, pile);
      case "fonction": {
        const v = versNombreMesure(this.evaluer(n.args[0], lignes, pile));
        if (v === null) return null;
        if (n.f === "abs") return Math.abs(v);
        const d = n.args[1] ? Math.max(0, Math.min(10, Math.round(versNombreMesure(this.evaluer(n.args[1], lignes, pile)) ?? 0))) : 0;
        return Math.round(v * 10 ** d) / 10 ** d;
      }
      case "total":
        return this.evaluer(n.e, this.toutes, pile);
      case "agregat":
        return this.agreger(n, lignes);
    }
  }

  /** Valeur d'une expression pour une ligne (colonnes, nombres, opérations). */
  private valeurLigne(n: Noeud, ligne: Cellule[]): Valeur {
    switch (n.t) {
      case "nombre":
      case "texte":
        return n.v;
      case "ref": {
        const i = this.index.get(normaliserMot(n.nom.trim()));
        if (i === undefined) throw new ErreurFormule(`Colonne introuvable : [${n.nom}].`);
        const v = ligne[i];
        if (v === null || v === undefined || estValeurVide(v)) return null;
        if (typeof v === "number") return v;
        if (typeof v === "boolean") return v ? 1 : 0;
        return String(v);
      }
      case "neg": {
        const v = versNombreMesure(this.valeurLigne(n.e, ligne));
        return v === null ? null : -v;
      }
      case "op":
        return arith(n.op, versNombreMesure(this.valeurLigne(n.a, ligne)), versNombreMesure(this.valeurLigne(n.b, ligne)));
      case "cmp":
        return comparer(n.op, this.valeurLigne(n.a, ligne), this.valeurLigne(n.b, ligne)) ? 1 : 0;
      case "logique": {
        const a = vrai(this.valeurLigne(n.a, ligne));
        if (n.op === "et" && !a) return 0;
        if (n.op === "ou" && a) return 1;
        return vrai(this.valeurLigne(n.b, ligne)) ? 1 : 0;
      }
      case "non":
        return vrai(this.valeurLigne(n.e, ligne)) ? 0 : 1;
      case "si":
        return vrai(this.valeurLigne(n.condition, ligne)) ? this.valeurLigne(n.alors, ligne) : this.valeurLigne(n.sinon, ligne);
      case "fonction": {
        const v = versNombreMesure(this.valeurLigne(n.args[0], ligne));
        if (v === null) return null;
        if (n.f === "abs") return Math.abs(v);
        const d = n.args[1] ? Math.max(0, Math.min(10, Math.round(versNombreMesure(this.valeurLigne(n.args[1], ligne)) ?? 0))) : 0;
        return Math.round(v * 10 ** d) / 10 ** d;
      }
      default:
        throw new ErreurFormule("Un agrégat, une mesure ou TOTAL ne peut pas être calculé ligne par ligne.");
    }
  }

  private agreger(n: Extract<Noeud, { t: "agregat" }>, lignes: Cellule[][]): Valeur {
    const retenues = n.condition ? lignes.filter((l) => vrai(this.valeurLigne(n.condition as Noeud, l))) : lignes;
    if (n.f === "nombre") {
      if (!n.expr) return retenues.length;
      let c = 0;
      for (const l of retenues) if (this.valeurLigne(n.expr, l) !== null) c++;
      return c;
    }
    if (n.f === "distinct") {
      const vus = new Set<string>();
      for (const l of retenues) {
        const v = this.valeurLigne(n.expr as Noeud, l);
        if (v !== null) vus.add(versTexte(v));
      }
      return vus.size;
    }
    const valeurs: number[] = [];
    for (const l of retenues) {
      const v = versNombreMesure(this.valeurLigne(n.expr as Noeud, l));
      if (v !== null) valeurs.push(v);
    }
    if (!valeurs.length) return null;
    switch (n.f) {
      case "somme":
        return valeurs.reduce((a, b) => a + b, 0);
      case "moyenne":
        return valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
      case "min":
        return valeurs.reduce((a, b) => (b < a ? b : a));
      case "max":
        return valeurs.reduce((a, b) => (b > a ? b : a));
      case "mediane":
        return percentile([...valeurs].sort((a, b) => a - b), 0.5);
    }
  }
}

// ---------------------------------------------------------------- Affichage

/** Une mesure dont la formule n'est faite que de sommes et de nombres s'additionne entre groupes (« Autres » a un sens). */
export function estAdditive(mesure: DefinitionMesure, mesures: DefinitionMesure[]): boolean {
  const ok = (n: Noeud, profondeur = 0): boolean => {
    if (profondeur > 20) return false;
    switch (n.t) {
      case "agregat":
        return n.f === "somme" || n.f === "nombre";
      case "nombre":
        return true;
      case "op":
        return (n.op === "+" || n.op === "-") && ok(n.a, profondeur + 1) && ok(n.b, profondeur + 1);
      case "neg":
        return ok(n.e, profondeur + 1);
      case "ref": {
        const m = mesures.find((x) => normaliserMot(x.nom) === normaliserMot(n.nom));
        if (!m) return false;
        try {
          return ok(lireFormule(m.formule), profondeur + 1);
        } catch {
          return false;
        }
      }
      default:
        return false;
    }
  };
  try {
    return mesure.format !== "pourcentage" && ok(lireFormule(mesure.formule));
  } catch {
    return false;
  }
}

/** « 12 450,5 FCFA », « 37,2 % ». */
export function formaterMesure(valeur: number | null, mesure: Pick<DefinitionMesure, "format" | "unite" | "decimales">): string {
  if (valeur === null || !Number.isFinite(valeur)) return "—";
  const pct = mesure.format === "pourcentage";
  const v = pct ? valeur * 100 : valeur;
  const dec = mesure.decimales ?? (pct ? 1 : Math.abs(v) >= 100 ? 0 : 2);
  const texte = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: dec, minimumFractionDigits: 0 }).format(v);
  return pct ? `${texte} %` : mesure.unite ? `${texte} ${mesure.unite}` : texte;
}

/** Valeur prête à tracer (un pourcentage est multiplié par 100 pour s'afficher en %). */
export const valeurAffichee = (valeur: number | null, mesure: Pick<DefinitionMesure, "format">) =>
  valeur === null ? null : mesure.format === "pourcentage" ? valeur * 100 : valeur;

/** Modèles proposés à la création d'une mesure, selon les colonnes numériques du fichier. */
export function modelesMesures(colonnesNumeriques: string[]): { nom: string; formule: string; format: FormatMesure }[] {
  const [a, b] = colonnesNumeriques;
  const modeles: { nom: string; formule: string; format: FormatMesure }[] = [{ nom: "Nombre de lignes", formule: "NOMBRE()", format: "nombre" }];
  if (a) {
    modeles.push({ nom: `Total ${a}`, formule: `SOMME([${a}])`, format: "nombre" });
    modeles.push({ nom: `Part du total ${a}`, formule: `SOMME([${a}]) / TOTAL(SOMME([${a}]))`, format: "pourcentage" });
  }
  if (a && b) {
    modeles.push({ nom: `${a} × ${b}`, formule: `SOMME([${a}] * [${b}])`, format: "nombre" });
    modeles.push({ nom: `Ratio ${a} / ${b}`, formule: `SOMME([${a}]) / SOMME([${b}])`, format: "nombre" });
  }
  return modeles;
}

/** Relit des mesures enregistrées (session ou projet) ; les entrées mal formées sont ignorées. */
export function normaliserMesures(brut: unknown): DefinitionMesure[] {
  if (!Array.isArray(brut)) return [];
  const vus = new Set<string>();
  const resultat: DefinitionMesure[] = [];
  for (const x of brut) {
    if (!x || typeof x !== "object") continue;
    const m = x as Record<string, unknown>;
    const nom = String(m.nom ?? "").trim().slice(0, 80);
    const formule = String(m.formule ?? "").trim().slice(0, 2000);
    const id = String(m.id ?? "").trim();
    if (!id || !nom || !formule || vus.has(normaliserMot(nom))) continue;
    vus.add(normaliserMot(nom));
    const decimales = Number(m.decimales);
    resultat.push({
      id,
      nom,
      formule,
      format: m.format === "pourcentage" ? "pourcentage" : "nombre",
      ...(typeof m.unite === "string" && m.unite.trim() ? { unite: m.unite.trim().slice(0, 20) } : {}),
      ...(Number.isInteger(decimales) && decimales >= 0 && decimales <= 6 ? { decimales } : {}),
    });
  }
  return resultat;
}
