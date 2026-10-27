"use client";

import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Variable globale pour mémoriser l'événement même avant le montage du composant
let promptGlobal: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    promptGlobal = e as BeforeInstallPromptEvent;
  });
}

export default function BoutonInstallerApp() {
  const [promptInstall, setPromptInstall] = useState<BeforeInstallPromptEvent | null>(() => promptGlobal);
  const [estInstalle, setEstInstalle] = useState(false);
  const [estIos, setEstIos] = useState(false);
  const [modalIosOuverte, setModalIosOuverte] = useState(false);

  useEffect(() => {
    // 1. Détection mode déjà installé
    const enModeAutonome =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (enModeAutonome) {
      setEstInstalle(true);
      return;
    }

    // 2. Détection iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    setEstIos(/iphone|ipad|ipod/.test(userAgent));

    // 3. Récupération de l'événement s'il était déjà prêt
    if (promptGlobal) {
      setPromptInstall(promptGlobal);
    }

    const intercepteurPrompt = (e: Event) => {
      e.preventDefault();
      promptGlobal = e as BeforeInstallPromptEvent;
      setPromptInstall(promptGlobal);
    };

    window.addEventListener("beforeinstallprompt", intercepteurPrompt);

    // 4. Enregistrement du Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker non enregistré:", err);
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", intercepteurPrompt);
    };
  }, []);

  const lancerInstallation = async () => {
    if (estIos) {
      setModalIosOuverte(true);
      return;
    }

    const promptActif = promptInstall || promptGlobal;

    if (!promptActif) {
      alert("Le navigateur prépare encore l'installation. Veuillez rafraîchir la page ou utiliser l'icône d'installation dans la barre d'adresse.");
      return;
    }

    await promptActif.prompt();
    const choix = await promptActif.userChoice;
    if (choix.outcome === "accepted") {
      setEstInstalle(true);
      setPromptInstall(null);
      promptGlobal = null;
    }
  };

  if (estInstalle) return null;

  return (
    <>
      <button
        type="button"
        onClick={lancerInstallation}
        className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition cursor-pointer w-full"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Installer l&apos;application</span>
      </button>

      {modalIosOuverte && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 text-white space-y-4 shadow-2xl animate-in fade-in slide-in-from-bottom-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Download className="w-4 h-4 text-blue-400" />
                Installer sur iPhone / iPad
              </h3>
              <button
                type="button"
                onClick={() => setModalIosOuverte(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ol className="space-y-3 text-xs text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  1
                </span>
                <span>
                  Appuyez sur le bouton <strong>Partager</strong>{" "}
                  <Share className="w-4 h-4 inline-block text-blue-400 mx-1 align-sub" /> en bas de Safari.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  2
                </span>
                <span>
                  Faites défiler et sélectionnez{" "}
                  <strong>Sur l&apos;écran d&apos;accueil</strong>{" "}
                  <PlusSquare className="w-4 h-4 inline-block text-emerald-400 mx-1 align-sub" />.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  3
                </span>
                <span>
                  Appuyez sur <strong>Ajouter</strong> en haut à droite.
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setModalIosOuverte(false)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition"
            >
              J&apos;ai compris
            </button>
          </div>
        </div>
      )}
    </>
  );
}