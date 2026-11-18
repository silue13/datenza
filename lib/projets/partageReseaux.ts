// lib/projets/partageReseaux.ts — liens « partager sur… » des réseaux sociaux et messageries pour un projet partagé.

export type Reseau = "whatsapp" | "linkedin" | "facebook" | "x" | "telegram" | "email";

export const RESEAUX: { id: Reseau; nom: string }[] = [
  { id: "whatsapp", nom: "WhatsApp" },
  { id: "linkedin", nom: "LinkedIn" },
  { id: "facebook", nom: "Facebook" },
  { id: "x", nom: "X (Twitter)" },
  { id: "telegram", nom: "Telegram" },
  { id: "email", nom: "E-mail" },
];

/** Texte d'accompagnement proposé avec le lien. */
export function texteDePartage(nomProjet: string): string {
  const nom = nomProjet.trim();
  return nom ? `Découvrez mon analyse « ${nom} » réalisée avec DATENZA` : "Découvrez mon analyse réalisée avec DATENZA";
}

/** Adresse qui ouvre la fenêtre de publication du réseau, pré-remplie avec le lien (et le texte quand le réseau l'accepte). */
export function lienReseau(reseau: Reseau, url: string, texte: string): string {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(texte);
  switch (reseau) {
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${texte} : ${url}`)}`;
    case "linkedin":
      // LinkedIn ne reprend que l'adresse : titre, description et image viennent de l'aperçu du lien
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "x":
      return `https://x.com/intent/post?text=${t}&url=${u}`;
    case "telegram":
      return `https://t.me/share/url?url=${u}&text=${t}`;
    case "email":
      return `mailto:?subject=${t}&body=${encodeURIComponent(`${texte} :\n${url}`)}`;
  }
}
