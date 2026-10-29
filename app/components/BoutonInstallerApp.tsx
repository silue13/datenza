"use client";

import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, X, Smartphone, Monitor } from "lucide-react";
import { Capacitor } from "@capacitor/core";

export default function BoutonInstallerApp() {
  const [estInstalle, setEstInstalle] = useState(false);
  const [os, setOs] = useState<"android" | "ios" | "windows">("windows");
  const [modalIosOuverte, setModalIosOuverte] = useState(false);

  useEffect(() => {
    // 1. Détection si l'application est déjà lancée en mode natif ou PWA
    const enModeAutonome =
      (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches) ||
      (typeof window !== "undefined" && (window.navigator as unknown as { standalone?: boolean }).standalone === true) ||
      (typeof window !== "undefined" && Capacitor.isNativePlatform());

    if (enModeAutonome) {
      setEstInstalle(true);
      return;
    }

    // 2. Détection du système d'exploitation
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setOs("ios");
    } else if (/android/.test(userAgent)) {
      setOs("android");
    } else {
      setOs("windows");
    }
  }, []);

  // Ne rien afficher si l'utilisateur est déjà dans l'application installée
  if (estInstalle) return null;

  const styleBouton =
    "inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition cursor-pointer w-full active:scale-95";

  return (
    <>
      {/* 1. Cas iPhone / iPad : Déclenche la modale avec les instructions Safari */}
      {os === "ios" && (
        <button
          type="button"
          onClick={() => setModalIosOuverte(true)}
          className={styleBouton}
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>Installer sur iPhone / iPad</span>
        </button>
      )}

      {/* 2. Cas Android : Téléchargement direct de l'APK officiel */}
      {os === "android" && (
        <a
          href="/datenza.apk?v=2"
          download="DATENZA.apk"
          target="_blank"
          rel="noopener noreferrer"
          className={styleBouton}
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Télécharger pour Android (.apk)</span>
        </a>
      )}

      {/* 3. Cas Ordinateur / Windows : Téléchargement de l'installateur MSI */}
      {os === "windows" && (
        <a
          href="/datenza.msi"
          download="DATENZA-Setup.msi"
          target="_blank"
          rel="noopener noreferrer"
          className={styleBouton}
        >
          <Monitor className="w-4 h-4 shrink-0" />
          <span>Installer pour Windows (.msi)</span>
        </a>
      )}

      {/* Modale d'instructions dédiée Safari pour iPhone */}
      {modalIosOuverte && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 text-white space-y-4 shadow-2xl animate-in fade-in slide-in-from-bottom-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-400" />
                Installer sur iPhone / iPad
              </h3>
              <button
                type="button"
                onClick={() => setModalIosOuverte(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
                aria-label="Fermer"
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