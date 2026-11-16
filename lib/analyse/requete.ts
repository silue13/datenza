// lib/analyse/requete.ts — moteur de calcul à la demande pour l'assistant IA.
// Le modèle ne voit jamais les lignes : il décrit le calcul voulu (filtres, regroupement, mesures, tri),
// ce moteur l'exécute sur TOUTES les lignes, dans le navigateur, et renvoie un petit tableau de résultats.
import { arrondir, estValeurVide, parseNombre, percentile, type Cellule } from "./utils";
import { convertirDate, detecterOrdreDate, estAnnee, trierChronologiquement, type OrdreDate } from "./dates";
import { appliquerFiltres, type ConditionFiltre } from "./filtres";

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
const OPERATEURS: Record<string, ConditionFiltre["operateur"]> = {
  egal: "egal", "=": "egal", "==": "egal", eq: "egal", equals: "egal",
  different: "different", "!=": "different", "<>": "different", neq: "different",
  contient: "contient", contains: "contient",
  superieur: "superieur", ">=": "superieur", ">": "superieur", gte: "superieur", gt: "superieur",
  inferieur: "inferieur", "<=": "inferieur", "<": "inferieur", lte: "inferieur", lt: "inferieur",
  entre: "entre", between: "entre",
};
const LIBELLES_CALCUL: Record<CalculRequete, string> = {
  somme: "Somme", moyenne: "Moyenne", mediane: "Médiane", min: "Minimum", max: "Maximum", nombre: "Nombre", distincts: "Valeurs distinctes",
};

const norm = (s: unknown) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const p2 = (n: number) => String(n).padStart(2, "0");

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
 * `colonnesInterdites` : colonnes sensibles (e-mail, téléphone…) qui ne peuvent servir ni de regroupement ni de mesure.
 */
export function executerRequete(
  entetes: string[],
  corps: Cellule[][],
  specBrute: unknown,
  colonnesInterdites: (nom: string) => boolean = () => false
): ResultatRequete {
  const spec = (specBrute && typeof specBrute === "object" ? specBrute : {}) as SpecRequete;
  const titre = String(spec.titre ?? "Calcul").slice(0, 120);
  const echec = (erreur: string): ResultatRequete => ({ titre, colonnes: [], lignes: [], nbLignesRetenues: 0, nbGroupes: 0, tronque: false, erreur });
  const disponibles = `Colonnes disponibles : ${entetes.join(", ")}.`;

  // 1. Filtres
  const filtres: ConditionFiltre[] = [];
  for (const f of Array.isArray(spec.filtres) ? spec.filtres.slice(0, 8) : []) {
    const colonne = trouverColonne(entetes, (f as ConditionFiltre)?.colonne);
    if (!colonne) return echec(`Filtre : colonne « ${String((f as ConditionFiltre)?.colonne)} » introuvable. ${disponibles}`);
    const operateur = OPERATEURS[norm((f as { operateur?: unknown })?.operateur).replace(/ /g, "")] ?? OPERATEURS[String((f as { operateur?: unknown })?.operateur ?? "").trim()];
    if (!operateur) return echec(`Filtre sur « ${colonne} » : opérateur inconnu. Utilisez egal, different, contient, superieur, inferieur ou entre.`);
    filtres.push({ colonne, operateur, valeur: (f as ConditionFiltre).valeur, valeurFin: (f as ConditionFiltre).valeurFin });
  }

  // 2. Regroupements
  const groupes: string[] = [];
  for (const g of Array.isArray(spec.grouper_par) ? spec.grouper_par.slice(0, MAX_REGROUPEMENTS) : []) {
    const colonne = trouverColonne(entetes, g);
    if (!colonne) return echec(`Regroupement : colonne « ${String(g)} » introuvable. ${disponibles}`);
    if (colonnesInterdites(colonne)) return echec(`La colonne « ${colonne} » contient des données personnelles : elle ne peut pas servir de regroupement.`);
    if (!groupes.includes(colonne)) groupes.push(colonne);
  }

  // 3. Mesures
  const mesures: { colonne: string | null; calcul: CalculRequete; libelle: string }[] = [];
  for (const m of Array.isArray(spec.mesures) ? spec.mesures.slice(0, MAX_MESURES) : []) {
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

  // 4. Filtrage (mêmes règles que les filtres de l'application : nombres, dates, texte sans casse)
  let lignes = corps;
  if (filtres.length) {
    const idx = filtres.map((f) => entetes.indexOf(f.colonne));
    lignes = corps.filter((l) => appliquerFiltres([Object.fromEntries(filtres.map((f, k) => [f.colonne, l[idx[k]]]))], filtres).length === 1);
  }

  // 5. Agrégation
  const idxG = groupes.map((g) => entetes.indexOf(g));
  const idxM = mesures.map((m) => (m.colonne ? entetes.indexOf(m.colonne) : -1));
  let ordre: OrdreDate = "JMA";
  let groupeEstDate = false;
  if (groupes.length) {
    const echantillon = lignes.slice(0, 2000).map((l) => l[idxG[0]]).filter((v) => !estValeurVide(v));
    ordre = detecterOrdreDate(echantillon);
    groupeEstDate = echantillon.length > 0 && echantillon.filter((v) => !estAnnee(v) && convertirDate(v, ordre)).length / echantillon.length >= 0.8;
  }
  const granularite = groupeEstDate ? spec.granularite ?? null : null;
  if (spec.granularite && groupes.length && !groupeEstDate) {
    return echec(`« ${groupes[0]} » n'est pas une colonne de dates : retirez "granularite".`);
  }

  const nouvelAcc = (m: { calcul: CalculRequete }): Acc => ({
    n: 0, somme: 0, nNum: 0, min: Infinity, max: -Infinity,
    valeurs: m.calcul === "mediane" ? [] : null,
    distincts: m.calcul === "distincts" ? new Set() : null,
  });
  const table = new Map<string, { cles: string[]; accs: Acc[] }>();
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
    if (ignorer) continue;
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
  const sens = spec.trier?.ordre === "asc" ? 1 : -1;
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
          if (spec.trier.ordre === "desc") resultat.reverse();
          indexTri = -2;
        }
      }
    }
  }
  if (indexTri >= 0 && indexTri < mesures.length) {
    const i = indexTri;
    resultat.sort((a, b) => (a.vals[i] === null ? 1 : b.vals[i] === null ? -1 : sens * ((a.vals[i] as number) - (b.vals[i] as number))));
  } else if (indexTri !== -2 && groupes.length) {
    const chrono = granularite ? [...resultat].sort((a, b) => a.cles[0].localeCompare(b.cles[0])) : trierChronologiquement(resultat, (r) => r.cles[0], ordre);
    resultat = chrono ?? resultat.sort((a, b) => (a.vals[0] === null ? 1 : b.vals[0] === null ? -1 : (b.vals[0] as number) - (a.vals[0] as number)));
  }

  const limite = Math.min(MAX_LIGNES_RESULTAT, Math.max(1, Math.floor(Number(spec.limite) || 20)));
  const tronque = resultat.length > limite;
  return {
    titre,
    colonnes,
    lignes: resultat.slice(0, limite).map((r) => [...r.cles, ...r.vals]),
    nbLignesRetenues: lignes.length,
    nbGroupes,
    tronque,
  };
}

/** Repère dans une réponse du modèle le bloc DATENZA_REQUETES et renvoie les requêtes demandées (ou null). */
export function extraireRequetes(texte: string): unknown[] | null {
  const m = String(texte ?? "").match(/DATENZA_REQUETES\s*:\s*(\[[\s\S]*\])/i);
  if (!m) return null;
  // Le modèle entoure parfois le JSON de ``` ou ajoute du texte après le crochet fermant : on coupe au bon crochet
  const brut = m[1];
  let profondeur = 0;
  let dansChaine = false;
  for (let i = 0; i < brut.length; i++) {
    const c = brut[i];
    if (dansChaine) {
      if (c === "\\") i++;
      else if (c === '"') dansChaine = false;
    } else if (c === '"') dansChaine = true;
    else if (c === "[") profondeur++;
    else if (c === "]" && --profondeur === 0) {
      try {
        const json: unknown = JSON.parse(brut.slice(0, i + 1));
        return Array.isArray(json) ? json.slice(0, MAX_REQUETES) : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Texte compact des résultats, renvoyé au modèle pour qu'il rédige sa réponse avec les vrais chiffres. */
export function resultatsPourIA(resultats: ResultatRequete[]): string {
  return resultats
    .map((r, i) => {
      if (r.erreur) return `CALCUL ${i + 1} — ${r.titre}\nERREUR : ${r.erreur}`;
      const entete = `CALCUL ${i + 1} — ${r.titre} (${r.nbLignesRetenues} lignes du fichier retenues${r.tronque ? `, ${r.lignes.length} premiers résultats sur ${r.nbGroupes}` : ""})`;
      return [entete, r.colonnes.join(" | "), ...r.lignes.map((l) => l.map((v) => (v === null ? "—" : String(v))).join(" | "))].join("\n");
    })
    .join("\n\n");
}
