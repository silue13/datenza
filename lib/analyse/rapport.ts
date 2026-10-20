import { arrondir } from "./utils";
import { interpreterCorrelation } from "./stats";
import type { analyserColonnes } from "./analyse";

type Resultat = ReturnType<typeof analyserColonnes>;
export type Langue = "fr" | "en";
export interface BlocRapport {
  type: "intro" | "qualite" | "categorie" | "numerique" | "booleen" | "date" | "correlation";
  texte: string;
}

type Cat = { total: number; nbCategoriesDistinctes: number; topValeurs: { valeur: string; effectif: number; pourcentage: number }[] };
type Num = { n: number; moyenne: number; mediane: number; min: number; max: number; atypiques: number };
type Dat = { n: number; min: string; max: string };
type Boo = { vrai: number; faux: number };

export function genererRapport(res: Resultat, langue: Langue = "fr"): BlocRapport[] {
  const L = (fr: string, en: string) => (langue === "en" ? en : fr);
  const blocs: BlocRapport[] = [];
  const st = res.statistiques;
  const noms = Object.keys(st);
  const de = (type: string) => noms.filter((n) => st[n].type === type);
  const cellules = res.nbLignes * noms.length;
  const manquants = noms.reduce((s, n) => s + st[n].nbVides, 0);

  blocs.push({ type: "intro", texte: L(`${res.nbLignes} lignes analysées sur ${noms.length} champ(s).`, `${res.nbLignes} rows analyzed across ${noms.length} field(s).`) });
  blocs.push({
    type: "qualite",
    texte: manquants
      ? L(`${manquants} valeur(s) manquante(s) sur ${cellules} cellules (${arrondir((100 * manquants) / cellules)} %).`, `${manquants} missing value(s) out of ${cellules} cells (${arrondir((100 * manquants) / cellules)} %).`)
      : L(`Aucune valeur manquante sur ${cellules} cellules.`, `No missing values across ${cellules} cells.`),
  });

  const score = (n: string) => {
    const d = (st[n].stats as Cat).nbCategoriesDistinctes;
    return (st[n].role === "statut" ? 100 : 40) + (d >= 2 && d <= 15 ? 30 : 0) - (d > 50 ? 40 : 0);
  };
  de("categorielle").sort((a, b) => score(b) - score(a)).slice(0, 6).forEach((n) => {
    const s = st[n].stats as Cat;
    const top = s.topValeurs[0];
    if (!top) return;
    let t = L(
      `${n} : « ${top.valeur} » est la modalité la plus fréquente (${top.effectif} lignes, ${top.pourcentage} %) sur ${s.total} valeurs renseignées.`,
      `${n}: “${top.valeur}” is the most frequent value (${top.effectif} rows, ${top.pourcentage} %) out of ${s.total} reported values.`
    );
    if (st[n].role === "statut" && s.topValeurs.length > 1)
      t += L(" Principaux statuts : ", " Main statuses: ") + s.topValeurs.map((v) => `${v.valeur} (${v.pourcentage} %)`).join(", ") + ".";
    blocs.push({ type: "categorie", texte: t });
  });

  de("numerique").slice(0, 8).forEach((n) => {
    const s = st[n].stats as Num;
    if (!s.n) return;
    let t = L(
      `${n} : moyenne ${s.moyenne}, médiane ${s.mediane}, minimum ${s.min}, maximum ${s.max}.`,
      `${n}: average ${s.moyenne}, median ${s.mediane}, minimum ${s.min}, maximum ${s.max}.`
    );
    if (s.atypiques) t += L(` ${s.atypiques} valeur(s) atypique(s) à examiner.`, ` ${s.atypiques} potential outlier(s) to review.`);
    blocs.push({ type: "numerique", texte: t });
  });

  de("booleen").forEach((n) => {
    const s = st[n].stats as Boo;
    blocs.push({ type: "booleen", texte: L(`${n} : ${s.vrai} oui, ${s.faux} non.`, `${n}: ${s.vrai} yes, ${s.faux} no.`) });
  });

  de("date").forEach((n) => {
    const s = st[n].stats as Dat;
    if (!s.n) return;
    blocs.push({ type: "date", texte: L(`${n} : du ${s.min.slice(0, 10)} au ${s.max.slice(0, 10)}.`, `${n}: from ${s.min.slice(0, 10)} to ${s.max.slice(0, 10)}.`) });
  });

  res.correlations
    .filter((c) => Math.abs(c.coefficient) >= 0.6)
    .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))
    .slice(0, 3)
    .forEach((c) => {
      const force = interpreterCorrelation(c.coefficient, langue);
      blocs.push({
        type: "correlation",
        texte: L(`${c.colonneA} et ${c.colonneB} : relation ${force} (r = ${c.coefficient}).`, `${c.colonneA} and ${c.colonneB}: ${force} relationship (r = ${c.coefficient}).`),
      });
    });

  return blocs;
}