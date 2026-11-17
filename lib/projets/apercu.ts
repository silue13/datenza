// lib/projets/apercu.ts — aperçu d'un projet partagé sur les réseaux (LinkedIn…) : titre, description, mini graphique.
// Seules des valeurs agrégées déjà visibles dans l'analyse partagée sont reprises, jamais des lignes du fichier.

export interface ApercuGraphique {
  titre: string;
  /** 8 barres au plus : libellé et valeur (une valeur absente devient null). */
  barres: { label: string; valeur: number | null }[];
}

interface GraphiqueSource {
  titre?: unknown;
  type?: unknown;
  labels?: unknown[];
  datasets?: { data?: unknown[] }[];
}

const MAX_BARRES = 8;
const TYPES_ADAPTES = new Set(["Barres", "Courbe", "Aires", "Anneau", "Camembert", "Histogramme", "Combine"]);

const nombre = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texte = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Premier graphique affiché qui se résume en barres (série principale, 8 premiers points).
 * Une série dans le temps garde ses 8 dernières périodes. Les cartes et les nuages sont ignorés.
 */
export function construireApercu(graphiques: GraphiqueSource[]): ApercuGraphique | null {
  for (const g of graphiques) {
    if (!TYPES_ADAPTES.has(String(g?.type))) continue;
    const labels = Array.isArray(g.labels) ? g.labels : [];
    const valeurs = Array.isArray(g.datasets?.[0]?.data) ? (g.datasets?.[0]?.data as unknown[]) : [];
    const points = labels.map((l, i) => ({ label: texte(l, 40), valeur: nombre(valeurs[i]) }));
    if (points.filter((p) => p.valeur !== null).length < 2) continue;
    const temporel = g.type === "Courbe" || g.type === "Aires";
    return { titre: texte(g.titre, 120), barres: temporel ? points.slice(-MAX_BARRES) : points.slice(0, MAX_BARRES) };
  }
  return null;
}

/** Relit un aperçu enregistré ; null s'il est absent ou mal formé. */
export function normaliserApercu(brut: unknown): ApercuGraphique | null {
  if (!brut || typeof brut !== "object") return null;
  const a = brut as Partial<ApercuGraphique>;
  if (!Array.isArray(a.barres)) return null;
  const barres = a.barres
    .slice(0, MAX_BARRES)
    .map((b) => ({ label: texte((b as { label?: unknown })?.label, 40), valeur: nombre((b as { valeur?: unknown })?.valeur) }));
  if (barres.filter((b) => b.valeur !== null).length < 2) return null;
  return { titre: texte(a.titre, 120), barres };
}

/** Phrase de description du lien partagé : nom du fichier, taille, graphique mis en avant. */
export function decrirePartage(fiche: { nom_fichier?: string | null; nb_lignes?: number | null; nb_colonnes?: number | null }, apercu: ApercuGraphique | null): string {
  const morceaux: string[] = [];
  const lignes = Number(fiche.nb_lignes) || 0;
  const colonnes = Number(fiche.nb_colonnes) || 0;
  if (lignes) morceaux.push(`${lignes.toLocaleString("fr-FR")} lignes${colonnes ? ` et ${colonnes} colonnes` : ""} analysées`);
  if (apercu?.titre) morceaux.push(apercu.titre);
  const base = morceaux.length ? `${morceaux.join(" · ")}.` : "Analyse de données partagée.";
  return `${base} Explorez les graphiques et filtrez les données en lecture seule avec DATENZA.`;
}
