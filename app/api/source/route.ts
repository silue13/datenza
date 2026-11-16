// app/api/source/route.ts — relais de téléchargement des sources en direct (Google Sheets, fichier par adresse web).
// Le navigateur ne peut pas lire la plupart des adresses externes (règles CORS) : le serveur télécharge le fichier
// et le renvoie tel quel. Rien n'est enregistré ni mis en cache. Les adresses internes sont refusées (voir lib/import/reseau.ts).
import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { estHoteInterdit, estIpInterdite } from "../../../lib/import/reseau";

export const maxDuration = 30;

const TAILLE_MAX_OCTETS = 25 * 1024 * 1024;
const DELAI_MS = 20_000;
const REDIRECTIONS_MAX = 5;

// Garde-fou en mémoire (propre à chaque instance serveur), comme pour /api/ai
const LIMITE = 120;
const FENETRE_MS = 60 * 60 * 1000;
const compteurs = new Map<string, { debut: number; n: number }>();

function depasseLimite(ip: string): boolean {
  const maintenant = Date.now();
  const c = compteurs.get(ip);
  if (!c || maintenant - c.debut > FENETRE_MS) {
    compteurs.set(ip, { debut: maintenant, n: 1 });
    if (compteurs.size > 5000) {
      for (const [k, v] of compteurs) if (maintenant - v.debut > FENETRE_MS) compteurs.delete(k);
    }
    return false;
  }
  c.n++;
  return c.n > LIMITE;
}

class ErreurSource extends Error {
  constructor(message: string, readonly statut: number) {
    super(message);
  }
}

const reponseErreur = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

/** Pour le développement en local uniquement : autorise http://localhost comme source. Ne jamais activer en production. */
const sourcesLocalesAutorisees = () => process.env.SOURCES_LOCALES_AUTORISEES === "1";

/** Refuse toute adresse qui ne mène pas à un serveur public : nom local, IP privée, ou nom qui se résout vers l'une d'elles. */
async function verifierDestination(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ErreurSource("Seules les adresses http:// et https:// sont acceptées.", 400);
  if (url.username || url.password) throw new ErreurSource("Les adresses contenant un identifiant ou un mot de passe ne sont pas acceptées.", 400);
  if (sourcesLocalesAutorisees()) return;
  if (estHoteInterdit(url.hostname)) throw new ErreurSource("Cette adresse désigne un réseau interne : elle ne peut pas servir de source.", 400);
  let adresses: { address: string }[];
  try {
    adresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new ErreurSource(`Le site « ${url.hostname} » est introuvable. Vérifiez l'adresse.`, 502);
  }
  if (!adresses.length || adresses.some((a) => estIpInterdite(a.address))) {
    throw new ErreurSource("Cette adresse désigne un réseau interne : elle ne peut pas servir de source.", 400);
  }
}

const MESSAGE_FEUILLE_PRIVEE =
  "Cette feuille Google n'est pas accessible. Dans Google Sheets : Partager → Accès général → « Tous les utilisateurs disposant du lien » (lecteur), puis réessayez.";

async function telecharger(depart: URL, signal: AbortSignal): Promise<Response> {
  let url = depart;
  for (let saut = 0; saut <= REDIRECTIONS_MAX; saut++) {
    await verifierDestination(url);
    // Une feuille non partagée renvoie vers la page de connexion de Google
    if (url.hostname === "accounts.google.com") throw new ErreurSource(MESSAGE_FEUILLE_PRIVEE, 403);
    let rep: Response;
    try {
      rep = await fetch(url, {
        redirect: "manual",
        signal,
        cache: "no-store",
        headers: { "User-Agent": "DATENZA/1.0 (import de donnees)", Accept: "text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.5" },
      });
    } catch {
      if (signal.aborted) throw new ErreurSource("Le site met trop de temps à répondre (plus de 20 secondes).", 504);
      throw new ErreurSource(`Impossible de joindre « ${url.hostname} ».`, 502);
    }
    if ([301, 302, 303, 307, 308].includes(rep.status)) {
      const suite = rep.headers.get("location");
      await rep.body?.cancel().catch(() => {});
      if (!suite) throw new ErreurSource("Le site renvoie vers une adresse vide.", 502);
      try {
        url = new URL(suite, url);
      } catch {
        throw new ErreurSource("Le site renvoie vers une adresse invalide.", 502);
      }
      continue;
    }
    if (!rep.ok) {
      await rep.body?.cancel().catch(() => {});
      const google = depart.hostname === "docs.google.com";
      if (rep.status === 401 || rep.status === 403) throw new ErreurSource(google ? MESSAGE_FEUILLE_PRIVEE : "Le site refuse l'accès à ce fichier (accès protégé).", 403);
      if (rep.status === 404 || rep.status === 410) throw new ErreurSource(google ? "Feuille Google introuvable : vérifiez le lien, ou qu'elle n'a pas été supprimée." : "Fichier introuvable à cette adresse.", 404);
      if (rep.status === 429) throw new ErreurSource("Le site limite le nombre de téléchargements. Réessayez dans quelques minutes.", 429);
      throw new ErreurSource(`Le site a répondu par une erreur (${rep.status}).`, 502);
    }
    return rep;
  }
  throw new ErreurSource("Trop de redirections : l'adresse ne mène à aucun fichier.", 502);
}

async function lireAvecLimite(rep: Response): Promise<Uint8Array> {
  const annonce = Number(rep.headers.get("content-length"));
  if (annonce > TAILLE_MAX_OCTETS) throw new ErreurSource("Ce fichier dépasse 25 Mo : téléchargez-le puis importez-le depuis votre appareil.", 413);
  if (!rep.body) return new Uint8Array();
  const lecteur = rep.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > TAILLE_MAX_OCTETS) {
      await lecteur.cancel().catch(() => {});
      throw new ErreurSource("Ce fichier dépasse 25 Mo : téléchargez-le puis importez-le depuis votre appareil.", 413);
    }
    morceaux.push(value);
  }
  const octets = new Uint8Array(total);
  let position = 0;
  for (const m of morceaux) {
    octets.set(m, position);
    position += m.byteLength;
  }
  return octets;
}

/** Nom de fichier annoncé par le site (en-tête Content-Disposition), s'il y en a un. */
function nomAnnonce(rep: Response): string {
  const cd = rep.headers.get("content-disposition") ?? "";
  const etendu = cd.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/);
  if (etendu) {
    try {
      return decodeURIComponent(etendu[1].trim());
    } catch {
      // nom mal encodé : on essaie la forme simple
    }
  }
  const simple = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
  return simple ? simple[1].trim() : "";
}

export async function POST(req: Request) {
  // Appels depuis l'application uniquement : un autre site ne peut pas se servir de ce relais dans un navigateur
  const provenance = req.headers.get("sec-fetch-site");
  if (provenance && provenance !== "same-origin" && provenance !== "none") return reponseErreur("Appel non autorisé.", 403);
  const origine = req.headers.get("origin");
  const hote = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origine && hote) {
    try {
      if (new URL(origine).host !== hote) return reponseErreur("Appel non autorisé.", 403);
    } catch {
      return reponseErreur("Appel non autorisé.", 403);
    }
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "inconnue";
  if (depasseLimite(ip)) return reponseErreur("Trop d'actualisations en une heure. Réessayez plus tard.", 429);

  let adresse: unknown;
  try {
    adresse = ((await req.json()) as { url?: unknown }).url;
  } catch {
    return reponseErreur("Requête invalide.", 400);
  }
  if (typeof adresse !== "string" || adresse.length > 2048) return reponseErreur("Adresse manquante ou trop longue.", 400);
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    return reponseErreur("Cette adresse n'est pas valide.", 400);
  }

  const delai = AbortSignal.timeout(DELAI_MS);
  try {
    const rep = await telecharger(url, delai);
    const octets = await lireAvecLimite(rep);
    return new Response(octets as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": "attachment",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        "X-Source-Type": (rep.headers.get("content-type") ?? "").replace(/[^\x20-\x7e]/g, "").slice(0, 120),
        "X-Source-Nom": encodeURIComponent(nomAnnonce(rep)).slice(0, 400),
      },
    });
  } catch (e) {
    if (e instanceof ErreurSource) return reponseErreur(e.message, e.statut);
    if (delai.aborted) return reponseErreur("Le site met trop de temps à répondre (plus de 20 secondes).", 504);
    return reponseErreur("Le téléchargement a échoué.", 502);
  }
}
