import { lireRecette, type Recette } from "./analyse/recette";

// Recettes enregistrées sur cet appareil. Elles ne contiennent aucune donnée, seulement des réglages :
// le stockage local du navigateur suffit. Toute lecture est revalidée (le stockage peut être vidé ou modifié).

const CLE = "datenza:recettes";
const MAX_RECETTES = 50;

export function listerRecettes(): Recette[] {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return [];
    const liste = JSON.parse(brut);
    if (!Array.isArray(liste)) return [];
    return liste.flatMap((r) => {
      try {
        return [lireRecette(r)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

function ecrire(liste: Recette[]): boolean {
  try {
    localStorage.setItem(CLE, JSON.stringify(liste.slice(0, MAX_RECETTES)));
    return true;
  } catch {
    return false;
  }
}

/** Enregistre une recette ; une recette du même nom est remplacée. Renvoie false si le stockage est indisponible. */
export function enregistrerRecette(recette: Recette): boolean {
  const autres = listerRecettes().filter((r) => r.nom !== recette.nom);
  return ecrire([recette, ...autres]);
}

export function supprimerRecette(nom: string): boolean {
  return ecrire(listerRecettes().filter((r) => r.nom !== nom));
}

/** Nom de fichier sûr pour l'export d'une recette. */
export function nomFichierRecette(recette: Recette): string {
  const base = recette.nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `recette-${base || "datenza"}.json`;
}
