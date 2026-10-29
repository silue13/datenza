"use client";

import { useState, useEffect } from "react";
import {
  Check,
  Download,
  Laptop,
  Monitor,
  Moon,
  Palette,
  Share,
  Smartphone,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import { appliquerTheme, enregistrerTheme, lireTheme, type Theme } from "../../lib/prefs";

type Plateforme = "windows" | "android" | "ios" | "mac";

const THEMES: { id: Theme; nom: string; aide: string; Icone: LucideIcon }[] = [
  { id: "clair", nom: "Clair", aide: "Fond blanc, idéal en plein jour", Icone: Sun },
  { id: "sombre", nom: "Sombre", aide: "Fond sombre, moins de lumière", Icone: Moon },
  { id: "systeme", nom: "Système", aide: "Suit le réglage de votre appareil", Icone: Monitor },
];

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900";

/** Mini-tableau de bord qui montre à quoi ressemblera le thème. */
function Apercu({ id }: { id: Theme }) {
  const fond =
    id === "clair"
      ? "bg-white"
      : id === "sombre"
      ? "bg-slate-900"
      : "bg-gradient-to-r from-white from-50% to-slate-900 to-50%";

  return (
    <div className={`flex h-24 w-full gap-2 overflow-hidden rounded-lg border border-slate-200 p-2.5 dark:border-slate-700 ${fond}`}>
      <div className="flex w-5 flex-col gap-1.5 rounded bg-purple-500/80 p-1">
        <div className="h-1 rounded bg-white/70" />
        <div className="h-1 rounded bg-white/50" />
        <div className="h-1 rounded bg-white/50" />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <div className="h-1.5 w-2/5 rounded bg-slate-400/70" />
        <div className="flex flex-1 items-end gap-1.5">
          {[40, 70, 55, 90].map((h, i) => (
            <div key={i} className="flex-1 rounded-sm bg-purple-500/60" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ParametresPage() {
  const [theme, setTheme] = useState<Theme>(() => (typeof window === "undefined" ? "systeme" : lireTheme()));
  const [confirme, setConfirme] = useState(false);
  const [plateforme, setPlateforme] = useState<Plateforme>("windows");
  const [afficherGuideIos, setAfficherGuideIos] = useState(false);

  // Détection automatique du système d'exploitation
  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const estIpadTactile = /macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1;

    if (/iphone|ipad|ipod/i.test(ua) || estIpadTactile) {
      setPlateforme("ios");
    } else if (/android/i.test(ua)) {
      setPlateforme("android");
    } else if (/macintosh|mac os x/i.test(ua)) {
      setPlateforme("mac");
    } else {
      setPlateforme("windows");
    }
  }, []);

  function choisirTheme(t: Theme) {
    setTheme(t);
    appliquerTheme(t);
    enregistrerTheme(t);
    setConfirme(true);
    setTimeout(() => setConfirme(false), 2500);
  }

  // Configurations des installateurs selon la plateforme
  const configurationsBinaires = {
    android: {
      href: "/datenza.apk?v=2",
      download: "DATENZA.apk",
      label: "Télécharger pour Android (.apk)",
      couleur: "bg-emerald-600 hover:bg-emerald-700",
      Icone: Smartphone,
    },
    mac: {
      href: "/datenza.dmg",
      download: "DATENZA.dmg",
      label: "Télécharger pour macOS (.dmg)",
      couleur: "bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100",
      Icone: Laptop,
    },
    windows: {
      href: "/datenza.msi",
      download: "DATENZA-Setup.msi",
      label: "Télécharger pour Windows (.msi)",
      couleur: "bg-blue-600 hover:bg-blue-700",
      Icone: Monitor,
    },
  };

  const configCourante = plateforme === "ios" ? configurationsBinaires.android : configurationsBinaires[plateforme];
  const IconeActive = configCourante.Icone;

  return (
    <div className="mx-auto max-w-3xl pb-12 font-sans text-slate-800 dark:text-slate-100">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Paramètres</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Personnalisez l’affichage et l'utilisation de DATENZA.</p>
      </header>

      {/* Section 1 : Thème & Apparence */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Apparence</h2>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Choisissez le thème de l’interface. Votre choix s’applique tout de suite et reste enregistré sur cet appareil.
            </p>
          </div>
          <p aria-live="polite" className="h-5 shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {confirme && (
              <span className="flex items-center gap-1">
                <Check className="h-4 w-4" aria-hidden /> Enregistré
              </span>
            )}
          </p>
        </div>

        <div role="radiogroup" aria-label="Thème" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {THEMES.map(({ id, nom, aide, Icone }) => {
            const actif = theme === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={actif}
                onClick={() => choisirTheme(id)}
                className={`rounded-xl border p-3 text-left transition ${FOCUS} ${
                  actif
                    ? "border-purple-600 bg-purple-50/60 ring-1 ring-purple-600 dark:bg-purple-950/30"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800/50"
                }`}
              >
                <Apercu id={id} />
                <div className="mt-3 flex items-center justify-between gap-2 px-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                    <Icone className="h-4 w-4" aria-hidden />
                    {nom}
                  </div>
                  {actif && <Check className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden />}
                </div>
                <p className="mt-1 px-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">{aide}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Section 2 : Application & Téléchargements */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
        <div>
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Application DATENZA</h2>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Installez DATENZA sur vos appareils pour un lancement rapide et direct sans passer par la barre d'adresse d'un navigateur.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {plateforme === "ios" ? (
              /* Bouton principal spécifique iOS */
              <button
                type="button"
                onClick={() => setAfficherGuideIos(true)}
                className="inline-flex items-center justify-center gap-2.5 px-5 py-2.5 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
              >
                <Smartphone className="h-4 w-4" aria-hidden />
                <span>Installer sur iPhone / iPad</span>
              </button>
            ) : (
              /* Bouton principal adapté (Android, Mac ou Windows) */
              <a
                href={configCourante.href}
                download={configCourante.download}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center justify-center gap-2.5 px-5 py-2.5 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer ${configCourante.couleur}`}
              >
                <IconeActive className="h-4 w-4" aria-hidden />
                <span>{configCourante.label}</span>
              </a>
            )}
          </div>

          {/* Liens secondaires : tous les autres systèmes non sélectionnés */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-300">Autres systèmes :</span>

            {plateforme !== "android" && (
              <a
                href="/datenza.apk?v=2"
                download="DATENZA.apk"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-slate-900 dark:hover:text-white transition"
              >
                Android (.apk)
              </a>
            )}

            {plateforme !== "ios" && (
              <button
                type="button"
                onClick={() => setAfficherGuideIos(true)}
                className="underline underline-offset-4 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
              >
                iPhone / iPad (iOS)
              </button>
            )}

            {plateforme !== "windows" && (
              <a
                href="/datenza.msi"
                download="DATENZA-Setup.msi"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-slate-900 dark:hover:text-white transition"
              >
                Windows (.msi)
              </a>
            )}

            {plateforme !== "mac" && (
              <a
                href="/datenza.dmg"
                download="DATENZA.dmg"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-slate-900 dark:hover:text-white transition"
              >
                macOS (.dmg)
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Modale d'instructions d'installation dédiée à Safari sur iOS */}
      {afficherGuideIos && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setAfficherGuideIos(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-600 dark:text-blue-400">
                <Smartphone className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Installer sur iOS</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Ajout à l'écran d'accueil</p>
              </div>
            </div>

            <ol className="mt-5 space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                  1
                </span>
                <span>
                  Ouvrez cette page dans le navigateur <strong>Safari</strong>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                  2
                </span>
                <span className="inline-flex items-center gap-1.5 flex-wrap">
                  Touchez le bouton de partage
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                    <Share className="h-3 w-3" /> Partager
                  </span>
                  en bas de l'écran.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                  3
                </span>
                <span>
                  Faites défiler vers le bas et sélectionnez <strong>« Sur l'écran d'accueil »</strong>, puis touchez <strong>Ajouter</strong>.
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setAfficherGuideIos(false)}
              className="mt-6 w-full rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700 active:scale-95"
            >
              J'ai compris
            </button>
          </div>
        </div>
      )}
    </div>
  );
}