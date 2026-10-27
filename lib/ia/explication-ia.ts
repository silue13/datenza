// lib/ia/explication-ia.ts
export type TypeElement = "graphique" | "prevision" | "correlation" | "carte";

export async function genererExplicationIA(
  type: TypeElement,
  donneesResumees: Record<string, unknown>,
  contexteFichier: string
): Promise<string> {
  const invites: Record<TypeElement, string> = {
    graphique: "Rédige une interprétation managériale concise (2 à 3 phrases) de ce graphique : met en valeur le point culminant, les contrastes majeurs et ce que cela implique pour l'activité.",
    prevision: "Analyse cette prévision temporelle en 2 à 3 phrases : commente la fiabilité, la dynamique attendue (hausse/baisse/palier) et formule un point de vigilance ou une opportunité.",
    correlation: "Explique concrètement cette corrélation mathématique entre ces deux colonnes en 2 phrases simples, en évitant le jargon statistique et en expliquant la signification terrain.",
    carte: "Interprète la répartition géographique de ces données en 2 phrases : identifie les pôles dominants et les disparités régionales observées.",
  };

  const question = `${invites[type]}\n\nDONNÉES DU MODULE :\n${JSON.stringify(donneesResumees)}`;

  const rep = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      contexte: contexteFichier,
      fournisseur: "auto",
      langueConversation: "fr",
      langueApp: "fr",
    }),
  });

  const data = await rep.json();
  if (!rep.ok || !data.reponse) {
    throw new Error(data.error || "Échec de génération");
  }

  return data.reponse;
}