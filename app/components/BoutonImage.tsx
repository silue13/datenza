"use client";
// app/components/BoutonImage.tsx — bouton « Image » : télécharge un graphique (ou une carte) en PNG prêt à publier.

import { useState } from "react";
import { ImageDown, Loader2 } from "lucide-react";
import { telechargerGraphiqueEnImage } from "../../lib/analyse/imageGraphique";

type Props = {
  titre: string;
  source?: string;
  /**
   * Création de l'image à partir du bloc qui contient le bouton (`[data-carte-graphique]`).
   * Par défaut : le premier graphique Chart.js de ce bloc.
   */
  generer?: (bloc: HTMLElement) => Promise<void>;
};

export default function BoutonImage({ titre, source, generer }: Props) {
  const [etat, setEtat] = useState<"repos" | "en-cours" | "erreur">("repos");
  return (
    <button
      type="button"
      onClick={async (e) => {
        const bloc = e.currentTarget.closest("[data-carte-graphique]") as HTMLElement | null;
        if (!bloc) return;
        setEtat("en-cours");
        try {
          if (generer) await generer(bloc);
          else {
            const canvas = bloc.querySelector("canvas");
            if (!canvas) throw new Error("Aucun graphique à exporter.");
            await telechargerGraphiqueEnImage(canvas, titre, source);
          }
          setEtat("repos");
        } catch {
          setEtat("erreur");
        }
      }}
      disabled={etat === "en-cours"}
      title={etat === "erreur" ? "L'image n'a pas pu être créée. Réessayez." : "Télécharger en image (PNG), par exemple pour LinkedIn ou un rapport"}
      aria-label="Télécharger en image"
      className={`no-print print:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer border disabled:opacity-60 ${
        etat === "erreur"
          ? "border-rose-200 text-rose-700 bg-rose-50"
          : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
    >
      {etat === "en-cours" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}
      <span className="hidden sm:inline">Image</span>
    </button>
  );
}
