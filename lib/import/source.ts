// lib/import/source.ts — sources en direct : Google Sheets ou fichier désigné par une adresse web.
// Aucun appel réseau ici : reconnaissance de l'adresse, du format reçu et forme de la source mémorisée.

export type TypeSource = "google-sheets" | "url";
export type FormatFichier = "csv" | "json" | "classeur";

/** Source en direct d'un jeu de données : ce qu'il faut pour le retélécharger. */
export interface SourceDistante {
  type: TypeSource;
  /** Adresse saisie par l'utilisateur (affichée telle quelle). */
  adresse: string;
  /** Adresse réellement téléchargée (export CSV d'une feuille Google, lien direct…). */
  urlTelechargement: string;
  /** Date ISO du dernier téléchargement réussi. */
  derniereMaj: string;
  /** Actualisation automatique tant que l'application est ouverte ; 0 = seulement à la demande. */
  intervalleMinutes: number;
}

export const INTERVALLES_ACTUALISATION = [0, 5, 15, 60];

export interface AdresseAnalysee {
  type: TypeSource;
  urlTelechargement: string;
  /** Nom affiché dans l'application tant que le fichier n'en fournit pas de meilleur. */
  nomPropose: string;
}

const erreur = (message: string) => new Error(message);

/**
 * Reconnaît l'adresse saisie et en déduit l'adresse à télécharger :
 *  - feuille Google (lien de partage ou d'édition) : export CSV de l'onglet affiché ;
 *  - feuille Google « publiée sur le web » : sortie CSV ;
 *  - lien Dropbox : téléchargement direct ; page GitHub d'un fichier : contenu brut ;
 *  - toute autre adresse http(s) : utilisée telle quelle.
 */
export function analyserAdresse(saisie: string): AdresseAnalysee {
  const texte = (saisie ?? "").trim();
  if (!texte) throw erreur("Collez l'adresse d'une feuille Google Sheets ou d'un fichier en ligne.");
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(texte) ? texte : `https://${texte}`);
  } catch {
    throw erreur("Cette adresse n'est pas valide. Elle doit ressembler à https://exemple.com/donnees.csv");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw erreur("Seules les adresses http:// et https:// sont acceptées.");
  if (url.username || url.password) throw erreur("Les adresses contenant un identifiant ou un mot de passe ne sont pas acceptées.");
  const hote = url.hostname.toLowerCase();

  if (hote === "docs.google.com" && url.pathname.startsWith("/spreadsheets/")) {
    // L'onglet est indiqué par « gid », dans l'adresse ou après le # (lien copié depuis la barre d'adresse)
    const gid = url.searchParams.get("gid") ?? new URLSearchParams(url.hash.replace(/^#/, "")).get("gid");
    const gidValide = gid && /^\d+$/.test(gid) ? gid : null;
    const publiee = url.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)/);
    if (publiee) {
      return {
        type: "google-sheets",
        urlTelechargement: `https://docs.google.com/spreadsheets/d/e/${publiee[1]}/pub?output=csv${gidValide ? `&gid=${gidValide}&single=true` : ""}`,
        nomPropose: "Feuille Google Sheets",
      };
    }
    const classique = url.pathname.match(/^\/spreadsheets\/d\/([\w-]+)/);
    if (!classique) throw erreur("Adresse Google Sheets non reconnue. Copiez le lien depuis le bouton « Partager » de la feuille.");
    return {
      type: "google-sheets",
      urlTelechargement: `https://docs.google.com/spreadsheets/d/${classique[1]}/export?format=csv${gidValide ? `&gid=${gidValide}` : ""}`,
      nomPropose: "Feuille Google Sheets",
    };
  }
  if (hote === "docs.google.com" || hote === "drive.google.com") {
    throw erreur("Seules les feuilles Google Sheets sont prises en charge (adresse commençant par docs.google.com/spreadsheets).");
  }

  if (hote === "www.dropbox.com" || hote === "dropbox.com") {
    url.searchParams.set("dl", "1");
  } else if (hote === "github.com") {
    const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (m) url = new URL(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`);
  }
  url.hash = "";
  const dernier = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
  return { type: "url", urlTelechargement: url.toString(), nomPropose: /\.[a-z0-9]{2,5}$/i.test(dernier) ? dernier : url.hostname };
}

const EXT_CLASSEUR = /\.(xlsx|xlsm|xlsb|xls|ods)$/i;

/**
 * Format du contenu reçu, d'après ses premiers octets d'abord (ils ne mentent pas), puis le type annoncé et le nom.
 * Une page web à la place d'un fichier est une erreur : c'est le signe d'une feuille non partagée ou d'un mauvais lien.
 */
export function detecterFormat(octets: Uint8Array, typeContenu: string, nom: string): FormatFichier {
  if (!octets.length) throw erreur("L'adresse a répondu, mais le fichier est vide.");
  const zip = octets[0] === 0x50 && octets[1] === 0x4b;
  const ole = octets[0] === 0xd0 && octets[1] === 0xcf && octets[2] === 0x11 && octets[3] === 0xe0;
  if (zip || ole) return "classeur";
  const debut = new TextDecoder("utf-8").decode(octets.slice(0, 600)).replace(/^﻿/, "").trimStart().toLowerCase();
  if (debut.startsWith("<!doctype html") || debut.startsWith("<html") || debut.startsWith("<head") || debut.startsWith("<body")) {
    throw erreur("Cette adresse renvoie une page web, pas un fichier de données.");
  }
  if (debut.startsWith("<?xml") || debut.startsWith("<")) throw erreur("Ce format (XML) n'est pas pris en charge. Formats acceptés : CSV, Excel, JSON.");
  const type = typeContenu.toLowerCase();
  if (debut.startsWith("{") || debut.startsWith("[") || type.includes("json") || /\.json$/i.test(nom)) {
    // Un CSV peut commencer par un crochet (« [id];nom ») : on ne conclut au JSON que si le type ou le nom le confirme, ou si le début s'y prête
    if (type.includes("json") || /\.json$/i.test(nom) || /^[[{]\s*["[{\]}]/.test(debut)) return "json";
  }
  if (EXT_CLASSEUR.test(nom) && !type.includes("text/")) return "classeur";
  return "csv";
}

/** Relit une source mémorisée (session locale ou projet enregistré) ; null si elle est absente ou incohérente. */
export function normaliserSource(brut: unknown): SourceDistante | null {
  if (!brut || typeof brut !== "object") return null;
  const s = brut as Partial<SourceDistante>;
  if (s.type !== "google-sheets" && s.type !== "url") return null;
  if (typeof s.adresse !== "string" || typeof s.urlTelechargement !== "string") return null;
  try {
    const u = new URL(s.urlTelechargement);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  } catch {
    return null;
  }
  const intervalle = Number(s.intervalleMinutes);
  return {
    type: s.type,
    adresse: s.adresse,
    urlTelechargement: s.urlTelechargement,
    derniereMaj: typeof s.derniereMaj === "string" && !Number.isNaN(Date.parse(s.derniereMaj)) ? s.derniereMaj : new Date(0).toISOString(),
    intervalleMinutes: INTERVALLES_ACTUALISATION.includes(intervalle) ? intervalle : 0,
  };
}

export const libelleSource = (s: Pick<SourceDistante, "type">) => (s.type === "google-sheets" ? "Google Sheets" : "Fichier en ligne");

/** « à l'instant », « il y a 12 min », « il y a 3 h », puis la date. */
export function formaterAnciennete(dateIso: string, maintenant: number = Date.now()): string {
  const t = Date.parse(dateIso);
  if (Number.isNaN(t) || t <= 0) return "jamais";
  const minutes = Math.floor((maintenant - t) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  return `le ${new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
}
