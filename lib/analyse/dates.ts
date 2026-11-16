// lib/analyse/dates.ts — lecture des dates et des périodes, sans dépendance interne.
// Un seul endroit pour tout ce qui touche au temps : formats ISO, français, américains,
// mois écrits en toutes lettres, trimestres, semestres, campagnes (2023/2024).

export type OrdreDate = "JMA" | "MJA";

const MOIS: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1, january: 1,
  fevrier: 2, fevr: 2, fev: 2, february: 2, feb: 2,
  mars: 3, mar: 3, march: 3,
  avril: 4, avr: 4, april: 4, apr: 4,
  mai: 5, may: 5,
  juin: 6, june: 6, jun: 6,
  juillet: 7, juil: 7, july: 7, jul: 7,
  aout: 8, august: 8, aug: 8,
  septembre: 9, sept: 9, sep: 9, september: 9,
  octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11,
  decembre: 12, dec: 12, december: 12,
};

const RE_JOUR_SEMAINE =
  /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\.?,?\s+/;

const RE_ISO = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ t](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*(?:z|[+-]\d{2}:?\d{2})?)?$/;
const RE_NUM = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:[ t,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/;
const RE_ANNEE_MOIS = /^(\d{4})[-/](\d{1,2})$/;
const RE_MOIS_ANNEE = /^(\d{1,2})[-/](\d{4})$/;
const RE_JOUR_MOIS_TEXTE = /^(\d{1,2})(?:er|e|st|nd|rd|th)?[\s\-./]+([a-z]+)\.?,?[\s\-./]+(\d{4}|\d{2})$/;
const RE_MOIS_TEXTE_JOUR = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/;
const RE_MOIS_TEXTE_ANNEE = /^([a-z]+)\.?[\s\-./]+(\d{4}|\d{2})$/;
const RE_ANNEE_MOIS_TEXTE = /^(\d{4})[\s\-./]+([a-z]+)\.?$/;

function sansAccent(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function anneeComplete(a: number, longueur: number): number {
  if (longueur > 2) return a;
  return a < 50 ? 2000 + a : 1900 + a;
}

function fabriquer(a: number, mo: number, j: number, h = 0, mi = 0, s = 0): Date | null {
  if (mo < 1 || mo > 12 || j < 1 || j > 31 || a < 1000 || a > 2999 || h > 23 || mi > 59 || s > 59) return null;
  const d = new Date(a, mo - 1, j, h, mi, s);
  return d.getFullYear() === a && d.getMonth() === mo - 1 && d.getDate() === j ? d : null;
}

/**
 * Convertit une cellule en date. Renvoie null si ce n'est pas une date sûre.
 * `ordre` ne sert que pour les dates ambiguës du type 03/04/2024 (JMA par défaut) ;
 * 25/12/2024 et 12/25/2024 sont toujours comprises, quel que soit l'ordre demandé.
 * Les nombres seuls (2023, 45123) ne sont jamais pris pour des dates ici.
 */
export function convertirDate(v: unknown, ordre: OrdreDate = "JMA"): Date | null {
  if (v === null || v === undefined || typeof v === "number" || typeof v === "boolean") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;

  let s = sansAccent(String(v).replace(/^﻿/, "").replace(/["«»“”]/g, "").trim());
  if (s.length < 5 || s.length > 40 || !/\d/.test(s)) return null;
  s = s.replace(RE_JOUR_SEMAINE, "").replace(/\s+/g, " ");

  let m = s.match(RE_ISO);
  if (m) return fabriquer(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));

  m = s.match(RE_NUM);
  if (m) {
    let j = +m[1];
    let mo = +m[2];
    if (ordre === "MJA") [j, mo] = [mo, j];
    if (mo > 12 && j <= 12) [j, mo] = [mo, j];
    let h = +(m[4] ?? 0);
    if (m[7] === "pm" && h < 12) h += 12;
    if (m[7] === "am" && h === 12) h = 0;
    return fabriquer(anneeComplete(+m[3], m[3].length), mo, j, h, +(m[5] ?? 0), +(m[6] ?? 0));
  }

  m = s.match(RE_ANNEE_MOIS);
  if (m) return fabriquer(+m[1], +m[2], 1);
  m = s.match(RE_MOIS_ANNEE);
  if (m) return fabriquer(+m[2], +m[1], 1);

  m = s.match(RE_JOUR_MOIS_TEXTE);
  if (m && MOIS[m[2]]) return fabriquer(anneeComplete(+m[3], m[3].length), MOIS[m[2]], +m[1]);
  m = s.match(RE_MOIS_TEXTE_JOUR);
  if (m && MOIS[m[1]]) return fabriquer(+m[3], MOIS[m[1]], +m[2]);
  m = s.match(RE_MOIS_TEXTE_ANNEE);
  if (m && MOIS[m[1]]) return fabriquer(anneeComplete(+m[2], m[2].length), MOIS[m[1]], 1);
  m = s.match(RE_ANNEE_MOIS_TEXTE);
  if (m && MOIS[m[2]]) return fabriquer(+m[1], MOIS[m[2]], 1);

  return null;
}

/** Devine si une colonne de dates chiffrées est écrite jour/mois (France) ou mois/jour (États-Unis). */
export function detecterOrdreDate(valeurs: unknown[]): OrdreDate {
  let jma = 0;
  let mja = 0;
  let vus = 0;
  for (const v of valeurs) {
    if (typeof v !== "string") continue;
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/);
    if (!m) continue;
    if (+m[1] > 12 && +m[2] <= 12) jma++;
    else if (+m[2] > 12 && +m[1] <= 12) mja++;
    if (++vus >= 2000) break;
  }
  return mja > jma ? "MJA" : "JMA";
}

/** Date locale -> « 2024-03-08 » (ou « 2024-03-08 14:30 » si une heure est présente). */
export function formaterDateISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const jour = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  if (!d.getHours() && !d.getMinutes() && !d.getSeconds()) return jour;
  return `${jour} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function estAnnee(v: unknown): boolean {
  const s = String(v ?? "").replace(/["'«»“”]/g, "").trim();
  if (!/^\d{4}$/.test(s)) return false;
  const a = +s;
  return a >= 1800 && a <= 2100;
}

/**
 * Clé de tri chronologique pour n'importe quel libellé de période :
 * année, date, « 2024-03 », « mars 2024 », « Janvier », « T1 2024 », « S2 2023 », « 2023/2024 », « Lundi ».
 * Renvoie null si le libellé n'est pas une période.
 */
export function clePeriode(v: unknown, ordre: OrdreDate = "JMA"): number | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  const brut = String(v).replace(/["«»“”]/g, "").trim();
  if (!brut) return null;
  if (estAnnee(brut)) return new Date(+brut, 0, 1).getTime();

  const d = convertirDate(brut, ordre);
  if (d) return d.getTime();

  const s = sansAccent(brut).replace(/\s+/g, " ");

  // Campagnes et exercices : 2023/2024, 2023-2024, 2023-24
  let m = s.match(/^(\d{4})\s?[-/]\s?(\d{4}|\d{2})$/);
  if (m && +m[1] >= 1800 && +m[1] <= 2100) return new Date(+m[1], 0, 1).getTime();

  // Trimestres et semestres : T1 2024, Q3-2023, 2024 T2, 2024-Q1, S1 2024, trimestre 2 2024
  m = s.match(/^(?:(t|q|s|trimestre|trim|quarter|semestre|sem)\.?\s?(\d)(?:er|e|eme)?[\s\-/]*(\d{4})|(\d{4})[\s\-/]*(t|q|s|trimestre|trim|quarter|semestre|sem)\.?\s?(\d))$/);
  if (m) {
    const type = (m[1] ?? m[5])[0];
    const rang = +(m[2] ?? m[6]);
    const annee = +(m[3] ?? m[4]);
    const pas = type === "s" ? 6 : 3;
    if (rang >= 1 && rang <= 12 / pas) return new Date(annee, (rang - 1) * pas, 1).getTime();
  }
  m = s.match(/^(?:t|q|trimestre|trim|quarter)\.?\s?([1-4])(?:er|e|eme)?$/);
  if (m) return new Date(2000, (+m[1] - 1) * 3, 1).getTime();
  m = s.match(/^(?:s|semestre|sem)\.?\s?([12])(?:er|e|eme)?$/);
  if (m) return new Date(2000, (+m[1] - 1) * 6, 1).getTime();

  // Semaines : S12 2024 n'est pas distinguable d'un semestre au-delà de 2 ; W12, semaine 12
  m = s.match(/^(?:w|s|sem|semaine|week)\.?\s?(\d{1,2})(?:[\s\-/]+(\d{4}))?$/);
  if (m && +m[1] >= 1 && +m[1] <= 53) return new Date(+(m[2] ?? 2000), 0, 1 + (+m[1] - 1) * 7).getTime();

  // Mois seul : Janvier, févr., Mar
  const moisSeul = s.replace(/\.$/, "");
  if (MOIS[moisSeul]) return new Date(2000, MOIS[moisSeul] - 1, 1).getTime();

  // Jours de la semaine (lundi en premier)
  const jours = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const ij = jours.indexOf(s) >= 0 ? jours.indexOf(s) : days.indexOf(s);
  if (ij >= 0) return new Date(2000, 0, 3 + ij).getTime();

  return null;
}

/** Vrai si le libellé est une période reconnue (date, année, mois, trimestre, campagne…). */
export function estPeriode(v: unknown): boolean {
  return clePeriode(v) !== null;
}

/**
 * Trie des libellés dans l'ordre chronologique s'ils sont (presque) tous des périodes.
 * Renvoie null quand ce ne sont pas des périodes : l'appelant garde alors son propre tri.
 */
export function trierChronologiquement<T>(elements: T[], libelle: (e: T) => string, ordre: OrdreDate = "JMA"): T[] | null {
  if (elements.length < 2) return null;
  const cles = elements.map((e) => clePeriode(libelle(e), ordre));
  const reconnus = cles.filter((c) => c !== null).length;
  if (reconnus / elements.length < 0.9) return null;
  return elements
    .map((e, i) => ({ e, c: cles[i], i }))
    .sort((a, b) => (a.c === null ? 1 : b.c === null ? -1 : a.c - b.c) || a.i - b.i)
    .map((x) => x.e);
}
