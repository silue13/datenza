"use client";

import React, { useMemo, useState } from "react";
import { useData } from "@/app/context/DataContext";
import { analyserNettoyage } from "@/lib/analyse/nettoyage";

export default function BanniereNettoyage() {
  const { entetes, corps, nettoyerDonnees } = useData();
  const [masque, setMasque] = useState(false);

  // Conversion du corps en objets pour l'analyse des variantes
  const donneesObjets = useMemo(() => {
    if (!entetes.length || !corps.length) return [];
    return corps.map((ligne) => {
      const obj: Record<string, any> = {};
      entetes.forEach((h, idx) => {
        obj[h] = ligne[idx];
      });
      return obj;
    });
  }, [entetes, corps]);

  const rapport = useMemo(() => {
    if (donneesObjets.length === 0) return null;
    return analyserNettoyage(donneesObjets);
  }, [donneesObjets]);

  if (masque || !rapport) return null;

  const toutesLesCorrections: { colonne: string; valeurOriginale: any; valeurSuggeree: any }[] = [];
  Object.values(rapport.suggestionsParColonne).forEach((suggestions) => {
    suggestions.forEach((s) => {
      if (s.colonne && s.valeurOriginale && s.valeurSuggeree) {
        toutesLesCorrections.push({
          colonne: s.colonne,
          valeurOriginale: s.valeurOriginale,
          valeurSuggeree: s.valeurSuggeree,
        });
      }
    });
  });

  if (toutesLesCorrections.length === 0) return null;

  return (
    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-xl">🧹</span>
        <div>
          <h4 className="font-semibold text-amber-900 text-sm">
            Nettoyage recommandé
          </h4>
          <p className="text-amber-800 text-xs mt-0.5">
            {toutesLesCorrections.length} variante(s) de texte ou casse à harmoniser détectée(s).
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => nettoyerDonnees(toutesLesCorrections)}
          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded shadow-sm transition"
        >
          Harmoniser automatiquement ({toutesLesCorrections.length})
        </button>
        <button
          onClick={() => setMasque(true)}
          className="px-2 py-1.5 text-amber-700 hover:text-amber-900 text-xs font-medium"
        >
          Ignorer
        </button>
      </div>
    </div>
  );
}