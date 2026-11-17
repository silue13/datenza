/**
 * Erreurs d'affichage : distinguer une version périmée de l'application d'un vrai bug.
 *
 * Après une mise en ligne, un onglet (ou l'application installée) resté ouvert sur l'ancienne version
 * demande des fichiers de code qui n'existent plus sur le serveur. Le navigateur lève alors une erreur
 * de chargement de module : il suffit de recharger la page pour obtenir la nouvelle version.
 */

const MOTIFS_VERSION_PERIMEE = [
  /ChunkLoadError/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
  /Failed to load chunk/i,
];

export function messageErreur(erreur: unknown): string {
  if (erreur instanceof Error) return erreur.message || erreur.name;
  if (typeof erreur === "string") return erreur;
  try {
    return JSON.stringify(erreur);
  } catch {
    return String(erreur);
  }
}

export function estVersionPerimee(erreur: unknown): boolean {
  const nom = erreur instanceof Error ? erreur.name : "";
  const texte = `${nom} ${messageErreur(erreur)}`;
  return MOTIFS_VERSION_PERIMEE.some((m) => m.test(texte));
}

const CLE = "datenza:rechargement-version";
const DELAI_MS = 60_000;

/**
 * Recharge la page pour récupérer la nouvelle version, une seule fois par minute :
 * si l'erreur persiste après un rechargement, c'est un vrai problème et on ne boucle pas.
 * Renvoie true si un rechargement a été lancé.
 */
export function rechargerPourNouvelleVersion(maintenant = Date.now()): boolean {
  try {
    const dernier = Number(sessionStorage.getItem(CLE) ?? 0);
    if (maintenant - dernier < DELAI_MS) return false;
    sessionStorage.setItem(CLE, String(maintenant));
  } catch {
    // Stockage indisponible : on recharge quand même, une boucle est alors peu probable
  }
  window.location.reload();
  return true;
}
