"use client";

import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Download, Sparkles, X, CheckCircle2 } from "lucide-react";

interface InfoVersion {
  versionCode: number;
  versionName: string;
  notes?: string;
  url: string;
}

export default function VerificateurMiseAJour() {
  const [majDisponible, setMajDisponible] = useState<InfoVersion | null>(null);
  const [masque, setMasque] = useState(false);
  const [telechargementLance, setTelechargementLance] = useState(false);

  // Fonction de vérification de version
  const verifierVersion = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      // 1. Lire la version locale installée sur le smartphone
      const appInfo = await App.getInfo();
      const codeLocal = parseInt(appInfo.build, 10);

      // 2. Récupérer la dernière version déclarée sur Vercel sans cache
      const res = await fetch(`https://datenza.vercel.app/version.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;

      const infoDistante: InfoVersion = await res.json();

      // 3. Si l'application a bien été mise à jour (codeLocal >= distant) : on retire la bannière
      if (codeLocal >= infoDistante.versionCode) {
        setMajDisponible(null);
        return;
      }

      // 4. Si une version supérieure existe toujours
      if (infoDistante.versionCode > codeLocal) {
        setMajDisponible(infoDistante);
      }
    } catch (err) {
      console.warn("Vérification de mise à jour ignorée :", err);
    }
  }, []);

  useEffect(() => {
    verifierVersion();

    // Re-vérifier automatiquement quand l'utilisateur revient dans l'application après installation
    let handleListener: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform()) {
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
          verifierVersion();
        }
      }).then((handle) => {
        handleListener = handle;
      });
    }

    return () => {
      if (handleListener) handleListener.remove();
    };
  }, [verifierVersion]);

  // Clic sur "Mettre à jour" : confirmation visuelle puis disparition automatique
  const gererClicMiseAJour = () => {
    setTelechargementLance(true);

    // Ferme automatiquement la bannière après 2 secondes sans forcer l'utilisateur à cliquer sur la croix
    setTimeout(() => {
      setMasque(true);
      setTelechargementLance(false);
    }, 2000);
  };

  if (!majDisponible || masque) return null;

  return (
    <aside
      role="alert"
      className="fixed top-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-emerald-500/40 bg-slate-900/95 p-4 text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-400 shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              Mise à jour disponible ({majDisponible.versionName})
            </h3>
            <p className="mt-0.5 text-xs text-slate-300">
              {majDisponible.notes || "Une nouvelle version de DATENZA est prête."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMasque(true)}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          title="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3.5 flex justify-end">
        {telechargementLance ? (
          <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-600/30 px-4 py-2 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 animate-pulse" />
            <span>Téléchargement lancé...</span>
          </div>
        ) : (
          <a
            href={majDisponible.url}
            onClick={gererClicMiseAJour}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-500 active:scale-95 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>Mettre à jour maintenant</span>
          </a>
        )}
      </div>
    </aside>
  );
}