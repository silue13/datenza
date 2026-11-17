import { estValeurVide, versNombre, type Cellule } from "./utils";
import {
  anova,
  corrigerHolm,
  formaterP,
  LIBELLES_AMPLEUR,
  LIBELLES_EFFET,
  resumerGroupe,
  SEUIL_SIGNIFICATIVITE,
  testKhiDeux,
  testWelch,
  type ResultatKhiDeux,
  type ResultatTest,
  type ResumeGroupe,
} from "./inference";

/**
 * Choisit et exécute les tests statistiques utiles sur un fichier :
 * - chaque mesure principale comparée entre les groupes de chaque dimension (t de Welch ou ANOVA de Welch) ;
 * - les paires de colonnes catégorielles testées pour un lien (khi-deux).
 * Les p-valeurs sont corrigées (Holm) car plusieurs tests sont lancés d'un coup : sans correction,
 * environ un test sur vingt sortirait « significatif » par pur hasard.
 */

export type Prudence = "petitEchantillon" | "approximatif" | "effetNegligeable" | "groupesExclus" | "redondant";

interface Base {
  pAjustee: number;
  significatif: boolean;
  prudences: Prudence[];
  nbLignes: number;
}

export interface ComparaisonGroupes extends Base {
  type: "comparaison";
  mesure: string;
  dimension: string;
  methode: "t-welch" | "anova-welch" | "anova";
  test: ResultatTest;
  /** Groupes testés, du plus élevé au plus bas en moyenne (au plus MAX_GROUPES_AFFICHES). */
  groupes: ResumeGroupe[];
  nbGroupes: number;
}

export interface LienCategories extends Base {
  type: "lien";
  colonneA: string;
  colonneB: string;
  test: ResultatKhiDeux;
  nbModalitesA: number;
  nbModalitesB: number;
}

export type TestStatistique = ComparaisonGroupes | LienCategories;

interface InfoMinimale {
  type: string;
  role: string;
  stats: Record<string, unknown>;
}

const MAX_COMPARAISONS = 8;
const MAX_DIMENSIONS_PAR_MESURE = 3;
const MAX_GROUPES = 20;
const MAX_GROUPES_AFFICHES = 12;
const MAX_MODALITES_LIEN = 12;
const MAX_COLONNES_LIEN = 4;
const MAX_LIGNES = 100000;
const MIN_PAR_GROUPE = 2;

function nbModalites(info: InfoMinimale): number {
  if (info.type === "booleen") return 2;
  return Number(info.stats.nbCategoriesDistinctes ?? 0);
}

function scoreDimension(info: InfoMinimale): number {
  const nb = nbModalites(info);
  return (info.role === "statut" ? 100 : 40) + (nb >= 2 && nb <= 10 ? 30 : 0) + (info.type === "booleen" ? 10 : 0);
}

export function executerTestsStatistiques(
  entetes: string[],
  corps: Cellule[][],
  statistiques: Record<string, InfoMinimale>,
  mesures: string[]
): TestStatistique[] {
  const lignes = corps.length > MAX_LIGNES ? corps.slice(0, MAX_LIGNES) : corps;
  const dimensions = Object.keys(statistiques)
    .filter((n) => {
      const i = statistiques[n];
      if (n === "Fichier Source" || i.role === "identifiant") return false;
      if (i.type !== "categorielle" && i.type !== "booleen") return false;
      const nb = nbModalites(i);
      return nb >= 2 && nb <= MAX_GROUPES;
    })
    .sort((a, b) => scoreDimension(statistiques[b]) - scoreDimension(statistiques[a]));

  type SansDecision<T> = T extends TestStatistique ? Omit<T, "pAjustee" | "significatif"> : never;
  const bruts: SansDecision<TestStatistique>[] = [];

  // 1. Une mesure varie-t-elle selon les groupes ?
  for (const mesure of mesures) {
    const iM = entetes.indexOf(mesure);
    if (iM === -1) continue;
    for (const dim of dimensions.slice(0, MAX_DIMENSIONS_PAR_MESURE)) {
      if (bruts.length >= MAX_COMPARAISONS) break;
      const iD = entetes.indexOf(dim);
      const parGroupe = new Map<string, number[]>();
      for (const l of lignes) {
        if (estValeurVide(l[iD])) continue;
        const x = versNombre(l[iM]);
        if (x === null) continue;
        const cle = String(l[iD]).trim();
        const g = parGroupe.get(cle);
        if (g) g.push(x);
        else parGroupe.set(cle, [x]);
      }
      const retenus = [...parGroupe].filter(([, v]) => v.length >= MIN_PAR_GROUPE);
      if (retenus.length < 2) continue;
      const valeurs = retenus.map(([, v]) => v);
      const nbLignes = valeurs.reduce((s, v) => s + v.length, 0);

      let test: ResultatTest | null;
      let methode: ComparaisonGroupes["methode"];
      if (retenus.length === 2) {
        test = testWelch(valeurs[0], valeurs[1]);
        methode = "t-welch";
      } else {
        const a = anova(valeurs);
        test = a;
        methode = a?.methode === "classique" ? "anova" : "anova-welch";
      }
      if (!test) continue;

      const prudences: Prudence[] = [];
      if (retenus.length < parGroupe.size) prudences.push("groupesExclus");
      if (nbLignes < 20 || Math.min(...valeurs.map((v) => v.length)) < 5) prudences.push("petitEchantillon");

      const groupes = retenus
        .map(([nom, v]) => resumerGroupe(nom, v))
        .sort((a, b) => b.moyenne - a.moyenne);
      // Pour 2 groupes, le sens du d de Cohen suit l'ordre des groupes : on le rend positif (groupe le plus haut d'abord)
      if (methode === "t-welch") test = { ...test, statistique: Math.abs(test.statistique), effet: Math.abs(test.effet) };
      bruts.push({
        type: "comparaison",
        mesure,
        dimension: dim,
        methode,
        test,
        groupes: groupes.length > MAX_GROUPES_AFFICHES ? [...groupes.slice(0, MAX_GROUPES_AFFICHES - 1), groupes[groupes.length - 1]] : groupes,
        nbGroupes: groupes.length,
        nbLignes,
        prudences,
      });
    }
  }

  // 2. Deux colonnes catégorielles sont-elles liées ?
  const colsLien = dimensions.filter((d) => nbModalites(statistiques[d]) <= MAX_MODALITES_LIEN).slice(0, MAX_COLONNES_LIEN);
  for (let a = 0; a < colsLien.length; a++) {
    for (let b = a + 1; b < colsLien.length; b++) {
      const iA = entetes.indexOf(colsLien[a]), iB = entetes.indexOf(colsLien[b]);
      if (iA === -1 || iB === -1) continue;
      const modA = new Map<string, number>(), modB = new Map<string, number>();
      const paires: [number, number][] = [];
      for (const l of lignes) {
        if (estValeurVide(l[iA]) || estValeurVide(l[iB])) continue;
        const va = String(l[iA]).trim(), vb = String(l[iB]).trim();
        if (!modA.has(va)) modA.set(va, modA.size);
        if (!modB.has(vb)) modB.set(vb, modB.size);
        paires.push([modA.get(va)!, modB.get(vb)!]);
      }
      if (modA.size < 2 || modB.size < 2 || paires.length < 10) continue;
      const table = [...modA].map(() => new Array<number>(modB.size).fill(0));
      for (const [i, j] of paires) table[i][j]++;
      const test = testKhiDeux(table, [...modA.keys()], [...modB.keys()]);
      if (!test) continue;
      const prudences: Prudence[] = [];
      if (test.approximatif) prudences.push("approximatif");
      if (paires.length < 30) prudences.push("petitEchantillon");
      if (test.effet >= 0.95) prudences.push("redondant");
      bruts.push({
        type: "lien",
        colonneA: colsLien[a],
        colonneB: colsLien[b],
        test,
        nbModalitesA: modA.size,
        nbModalitesB: modB.size,
        nbLignes: paires.length,
        prudences,
      });
    }
  }

  const ajustees = corrigerHolm(bruts.map((t) => t.test.pValeur));
  return bruts.map((t, i) => {
    const significatif = ajustees[i] < SEUIL_SIGNIFICATIVITE;
    const prudences = [...t.prudences];
    if (significatif && t.test.ampleur === "negligeable") prudences.push("effetNegligeable");
    return { ...t, pAjustee: ajustees[i], significatif, prudences } as TestStatistique;
  });
}

// ---------------------------------------------------------------------------
// Interprétation en langage courant
// ---------------------------------------------------------------------------

type Langue = "fr" | "en";

function nombre(x: number, langue: Langue): string {
  const a = Math.abs(x);
  const dec = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  return x.toLocaleString(langue === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: dec });
}

const NOMS_METHODE: Record<ComparaisonGroupes["methode"] | "khi2", { fr: string; en: string }> = {
  "t-welch": { fr: "test t de Welch", en: "Welch's t-test" },
  "anova-welch": { fr: "ANOVA de Welch", en: "Welch's ANOVA" },
  anova: { fr: "ANOVA", en: "ANOVA" },
  khi2: { fr: "test du khi-deux", en: "chi-square test" },
};

export function nomMethode(t: TestStatistique, langue: Langue = "fr"): string {
  return NOMS_METHODE[t.type === "lien" ? "khi2" : t.methode][langue];
}

export function libelleEffet(t: TestStatistique, langue: Langue = "fr"): string {
  const nom = t.type === "lien" ? (langue === "en" ? "Cramér's V" : "V de Cramér") : t.methode === "t-welch" ? "d" : "η²";
  // Un effet minuscule mais non nul ne doit pas s'afficher « 0 »
  const minuscule = t.test.effet !== 0 && Math.abs(t.test.effet) < 0.005;
  return minuscule ? `${nom} < ${nombre(0.01, langue)}` : `${nom} = ${nombre(t.test.effet, langue)}`;
}

/** Phrase qui dit ce que le test permet de conclure, et ce qu'il ne permet pas. */
export function interpreterTest(t: TestStatistique, langue: Langue = "fr"): string {
  const L = (fr: string, en: string) => (langue === "en" ? en : fr);
  const p = formaterP(t.pAjustee, langue);
  const ampleur = LIBELLES_AMPLEUR[t.test.ampleur][langue];
  const effet = LIBELLES_EFFET[t.test.ampleur][langue];
  const methode = nomMethode(t, langue);
  let texte: string;

  if (t.type === "comparaison") {
    const haut = t.groupes[0], bas = t.groupes[t.groupes.length - 1];
    if (t.significatif) {
      texte = t.methode === "t-welch"
        ? L(
            `« ${t.mesure} » est plus élevé pour « ${haut.nom} » (moyenne ${nombre(haut.moyenne, langue)}) que pour « ${bas.nom} » (${nombre(bas.moyenne, langue)}). L'écart est statistiquement significatif (${methode}, ${p}), avec un effet ${effet}.`,
            `“${t.mesure}” is higher for “${haut.nom}” (average ${nombre(haut.moyenne, langue)}) than for “${bas.nom}” (${nombre(bas.moyenne, langue)}). The gap is statistically significant (${methode}, ${p}), with a ${effet} effect.`
          )
        : L(
            `« ${t.mesure} » varie réellement selon « ${t.dimension} » (${methode}, ${p}), avec un effet ${effet} : les groupes expliquent ${nombre(100 * t.test.effet, langue)} % de la variation. Moyenne la plus haute : « ${haut.nom} » (${nombre(haut.moyenne, langue)}) ; la plus basse : « ${bas.nom} » (${nombre(bas.moyenne, langue)}).`,
            `“${t.mesure}” genuinely varies by “${t.dimension}” (${methode}, ${p}), with a ${effet} effect: groups explain ${nombre(100 * t.test.effet, langue)} % of the variation. Highest average: “${haut.nom}” (${nombre(haut.moyenne, langue)}); lowest: “${bas.nom}” (${nombre(bas.moyenne, langue)}).`
          );
    } else {
      texte = L(
        `Aucune différence démontrée de « ${t.mesure} » selon « ${t.dimension} » (${methode}, ${p}) : les écarts observés entre groupes peuvent s'expliquer par le hasard.`,
        `No demonstrated difference in “${t.mesure}” by “${t.dimension}” (${methode}, ${p}): the observed gaps between groups may be due to chance.`
      );
    }
  } else {
    if (t.prudences.includes("redondant")) {
      texte = L(
        `« ${t.colonneA} » et « ${t.colonneB} » se déterminent presque entièrement l'une l'autre (V de Cramér = ${nombre(t.test.effet, langue)}) : l'une découle de l'autre (par exemple une ville et sa région), ce lien n'apprend rien de nouveau.`,
        `“${t.colonneA}” and “${t.colonneB}” almost fully determine each other (Cramér's V = ${nombre(t.test.effet, langue)}): one derives from the other (e.g. a city and its region), so this link adds no new insight.`
      );
    } else if (t.significatif) {
      const e = t.test.ecartMax;
      texte = L(
        `« ${t.colonneA} » et « ${t.colonneB} » sont liés (${methode}, ${p}), avec un lien d'intensité ${ampleur} (V de Cramér = ${nombre(t.test.effet, langue)}).`,
        `“${t.colonneA}” and “${t.colonneB}” are related (${methode}, ${p}), with a ${ampleur} association (Cramér's V = ${nombre(t.test.effet, langue)}).`
      );
      if (e) texte += L(
        ` Combinaison la plus sur-représentée : « ${e.ligne} » avec « ${e.colonne} » (${e.observe} lignes, contre ${nombre(e.attendu, langue)} attendues sans lien).`,
        ` Most over-represented combination: “${e.ligne}” with “${e.colonne}” (${e.observe} rows, versus ${nombre(e.attendu, langue)} expected without a link).`
      );
    } else {
      texte = L(
        `Aucun lien démontré entre « ${t.colonneA} » et « ${t.colonneB} » (${methode}, ${p}).`,
        `No demonstrated link between “${t.colonneA}” and “${t.colonneB}” (${methode}, ${p}).`
      );
    }
  }

  for (const pr of t.prudences) {
    if (pr === "effetNegligeable") texte += L(" L'écart est réel mais trop faible pour compter en pratique.", " The gap is real but too small to matter in practice.");
    if (pr === "petitEchantillon") texte += L(" Peu de données : à confirmer sur un échantillon plus large.", " Limited data: confirm on a larger sample.");
    if (pr === "approximatif") texte += L(" Plusieurs combinaisons sont rares : le résultat est approximatif.", " Several combinations are rare: the result is approximate.");
    if (pr === "groupesExclus") texte += L(" Les groupes d'une seule ligne ont été écartés du test.", " Single-row groups were left out of the test.");
  }
  return texte;
}

export const AVERTISSEMENT_TESTS = {
  fr: "Un résultat significatif indique qu'un écart ne s'explique probablement pas par le hasard ; il ne prouve pas que l'un cause l'autre. Les p-valeurs sont corrigées (méthode de Holm) parce que plusieurs tests sont menés en même temps.",
  en: "A significant result means a gap is unlikely to be due to chance; it does not prove that one causes the other. P-values are adjusted (Holm method) because several tests are run at once.",
};

// ---------------------------------------------------------------------------
// Présentation commune (page Analyse, PowerPoint, Excel)
// ---------------------------------------------------------------------------

export type Verdict = "demontre" | "faible" | "nonDemontre" | "redondant";

export const LIBELLES_VERDICT: Record<Verdict, string> = {
  demontre: "Démontré",
  faible: "Réel mais faible",
  nonDemontre: "Non démontré",
  redondant: "Redondant",
};

export function verdictTest(t: TestStatistique): Verdict {
  if (t.prudences.includes("redondant")) return "redondant";
  if (!t.significatif) return "nonDemontre";
  return t.test.ampleur === "negligeable" ? "faible" : "demontre";
}

/** La question posée, en une ligne : « Montant selon Region » ou « Statut ↔ Canal ». */
export function questionTest(t: TestStatistique): string {
  return t.type === "comparaison" ? `${t.mesure} selon ${t.dimension}` : `${t.colonneA} ↔ ${t.colonneB}`;
}

/** Les résultats démontrés d'abord, du plus net au moins net ; les liens redondants à la fin. */
export function trierTests<T extends TestStatistique>(tests: T[]): T[] {
  const rang: Record<Verdict, number> = { demontre: 0, faible: 1, nonDemontre: 2, redondant: 3 };
  return [...tests].sort((a, b) => rang[verdictTest(a)] - rang[verdictTest(b)] || a.pAjustee - b.pAjustee);
}
