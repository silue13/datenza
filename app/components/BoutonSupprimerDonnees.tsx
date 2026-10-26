"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useData } from "../context/DataContext";

// Bouton de suppression volontaire des données sauvegardées (confirmation en deux clics)
export default function BoutonSupprimerDonnees() {
  const { entetes, supprimerDonnees } = useData();
  const [confirmer, setConfirmer] = useState(false);

  if (!entetes.length) return null;

  if (!confirmer) {
    return (
      <button
        onClick={() => setConfirmer(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-rose-900/60 text-slate-200 border border-slate-700 text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
      >
        <Trash2 className="w-4 h-4 text-rose-400" />
        Supprimer les données
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-rose-950/60 border border-rose-800 rounded-xl text-xs">
      <span className="font-bold text-rose-200">Tout effacer ?</span>
      <button
        onClick={() => {
          supprimerDonnees();
          setConfirmer(false);
        }}
        className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
      >
        Oui, supprimer
      </button>
      <button
        onClick={() => setConfirmer(false)}
        className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold cursor-pointer"
      >
        Annuler
      </button>
    </div>
  );
}
