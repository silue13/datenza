// lib/import/telechargement.ts — télécharge une source en direct par le relais du serveur et la lit comme un fichier importé.
import { lireContenu } from "./lecture";
import { detecterFormat } from "./source";
import type { TableauImporte } from "./tableau";

export interface SourceTelechargee {
  tableau: TableauImporte;
  /** Nom annoncé par le site (« Ventes 2024 - Feuille 1.csv »), sinon le nom proposé. */
  nom: string;
}

export async function telechargerSource(urlTelechargement: string, nomPropose: string): Promise<SourceTelechargee> {
  let rep: Response;
  try {
    rep = await fetch("/api/source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: urlTelechargement }),
      cache: "no-store",
    });
  } catch {
    throw new Error("Connexion impossible : vérifiez votre accès à Internet.");
  }
  if (!rep.ok) {
    const detail = (await rep.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error || `Le téléchargement a échoué (${rep.status}).`);
  }
  const octets = new Uint8Array(await rep.arrayBuffer());
  let nomAnnonce = "";
  try {
    nomAnnonce = decodeURIComponent(rep.headers.get("X-Source-Nom") ?? "");
  } catch {
    nomAnnonce = "";
  }
  const nom = nomAnnonce || nomPropose || "Source en ligne";
  let format;
  try {
    format = detecterFormat(octets, rep.headers.get("X-Source-Type") ?? "", nom);
  } catch (e) {
    const google = /^https:\/\/docs\.google\.com\//.test(urlTelechargement);
    const message = e instanceof Error ? e.message : "Contenu illisible.";
    throw new Error(
      google && /page web/.test(message)
        ? "Cette feuille Google n'est pas accessible. Dans Google Sheets : Partager → Accès général → « Tous les utilisateurs disposant du lien » (lecteur), puis réessayez."
        : message
    );
  }
  return { tableau: lireContenu(nom, octets, format), nom };
}
