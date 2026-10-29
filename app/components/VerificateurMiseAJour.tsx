"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Download, Sparkles, X } from "lucide-react";

interface InfoVersion {
  versionCode: number;
  versionName: string;
  notes?: string;
  url: string;
}

export default function BanniereMiseAJour() {
  const [majDisponible, setMajDisponible] = useState<InfoVersion | null>(null);
  const [masque, setMasque] = useState(false);

  useEffect(() => {
    // Vérification uniquement si l'application tourne dans l'APK natif Android
    if (!Capacitor.isNativePlatform()) return;

    async function verifierMiseAJour() {
      try {
        // 1. Lire la version locale installée sur le smartphone
        const appInfo = await App.getInfo();
        const codeLocal = parseInt(appInfo.build, 10);

        // 2. Récupérer la dernière version déclarée sur Vercel (sans cache)
        const res = await fetch(`https://datenza.vercel.app/version.json?t=${Date.now()}`);
        if (!res.ok) return;

        const infoDistante: InfoVersion = await res.json();

        // 3. Comparer : si la version distante est strictement supérieure
        if (infoDistante.versionCode > codeLocal) {
          setMajDisponible(infoDistante);
        }
      } catch (err) {
        console.warn("Impossible de vérifier les mises à jour :", err);
      }
    }

    verifierMiseAJour();
  }, []);

  if (!majDisponible || masque) return null;

  return (
    <aside
      role="alert"
      className="fixed top-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-emerald-500/40 bg-slate-900/95 p-4 text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Mise à jour disponible ({majDisponible.versionName})</h3>
            <p className="mt-0.5 text-xs text-slate-300">
              {majDisponible.notes || "Une nouvelle version de DATENZA est prête."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMasque(true)}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          title="Fermer pour l'instant"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex justify-end">
        <a
          href={majDisponible.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-500 active:scale-95"
        >
          <Download className="h-4 w-4" />
          Mettre à jour maintenant
        </a>
      </div>
    </aside>
  );
}