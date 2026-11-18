"use client";
// app/components/PartageReseaux.tsx — boutons pour publier le lien d'un projet partagé sur les réseaux sociaux et messageries.

import { useSyncExternalStore, type ReactNode } from "react";
import { Mail, MessageCircle, Send, Share2 } from "lucide-react";
import { RESEAUX, lienReseau, texteDePartage, type Reseau } from "../../lib/projets/partageReseaux";

const STYLE: Record<Reseau, { couleur: string; icone: ReactNode }> = {
  whatsapp: { couleur: "bg-[#25D366] hover:bg-[#1ebe5b]", icone: <MessageCircle className="w-3.5 h-3.5" /> },
  linkedin: { couleur: "bg-[#0A66C2] hover:bg-[#08559f]", icone: <span className="text-[11px] font-black leading-none">in</span> },
  facebook: { couleur: "bg-[#1877F2] hover:bg-[#0f63d1]", icone: <span className="text-[13px] font-black leading-none">f</span> },
  x: { couleur: "bg-black hover:bg-slate-800 dark:ring-1 dark:ring-slate-600", icone: null },
  telegram: { couleur: "bg-[#229ED9] hover:bg-[#1a8bc0]", icone: <Send className="w-3.5 h-3.5" /> },
  email: { couleur: "bg-slate-600 hover:bg-slate-700", icone: <Mail className="w-3.5 h-3.5" /> },
};

const BOUTON =
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-white rounded-lg transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1";

const ignorer = () => () => {};

export default function PartageReseaux({ url, nomProjet }: { url: string; nomProjet: string }) {
  const texte = texteDePartage(nomProjet);
  // Menu de partage du téléphone (WhatsApp Business, Messenger, SMS…) : proposé seulement là où le navigateur le permet
  const partageNatif = useSyncExternalStore(
    ignorer,
    () => typeof navigator.share === "function",
    () => false,
  );

  async function partagerNatif() {
    try {
      await navigator.share({ title: nomProjet, text: texte, url });
    } catch {
      // Fenêtre fermée par l'utilisateur : rien à signaler
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Partager sur les réseaux sociaux">
      <span className="text-[11px] text-slate-500 mr-1">Partager sur :</span>
      {RESEAUX.map(({ id, nom }) => (
        <a
          key={id}
          href={lienReseau(id, url, texte)}
          target={id === "email" ? undefined : "_blank"}
          rel="noopener noreferrer"
          className={`${BOUTON} ${STYLE[id].couleur}`}
          aria-label={`Partager sur ${nom}`}
          title={`Partager sur ${nom}`}
        >
          {STYLE[id].icone}
          {nom}
        </a>
      ))}
      {partageNatif && (
        <button type="button" onClick={() => void partagerNatif()} className={`${BOUTON} bg-blue-600 hover:bg-blue-700`}>
          <Share2 className="w-3.5 h-3.5" />
          Autres applis
        </button>
      )}
    </div>
  );
}
