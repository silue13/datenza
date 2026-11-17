// app/partage/[id]/layout.tsx — titre, description et image d'aperçu d'un lien partagé (LinkedIn, WhatsApp, X…).
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { lireProjetPartage } from "../../../lib/projets/partageServeur";
import { decrirePartage, normaliserApercu } from "../../../lib/projets/apercu";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const lecture = await lireProjetPartage(id).catch(() => null);
  if (!lecture || lecture.etat !== "ok") {
    return { title: "Projet partagé indisponible — DATENZA", robots: { index: false, follow: false } };
  }
  const { fiche } = lecture;
  const apercu = normaliserApercu((fiche.reglages as { apercu?: unknown } | null)?.apercu);
  const titre = `${fiche.nom} — analyse partagée avec DATENZA`;
  const description = decrirePartage(fiche, apercu);
  return {
    title: titre,
    description,
    // Un lien partagé n'a pas vocation à apparaître dans les moteurs de recherche
    robots: { index: false, follow: false },
    openGraph: { type: "article", title: titre, description, siteName: "DATENZA", locale: "fr_FR" },
    twitter: { card: "summary_large_image", title: titre, description },
  };
}

export default function MiseEnPagePartage({ children }: { children: ReactNode }) {
  return children;
}
