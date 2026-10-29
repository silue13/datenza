"use client";
import { useState } from "react";
import { Check, Download, Monitor, Moon, Palette, Smartphone, Sun, type LucideIcon } from "lucide-react";
import { appliquerTheme, enregistrerTheme, lireTheme, type Theme } from "../../lib/prefs";

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
    id === "clair" ? "bg-white" : id === "sombre" ? "bg-slate-900" : "bg-gradient-to-r from-white from-50% to-slate-900 to-50%";
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

  function choisirTheme(t: Theme) {
    setTheme(t);
    appliquerTheme(t);
    enregistrerTheme(t);
    setConfirme(true);
    setTimeout(() => setConfirme(false), 2500);
  }

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

      {/* Section 2 : Application Mobile & Installation */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Application Android (APK)</h2>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Installez le paquet natif autonome DATENZA directement sur votre téléphone ou tablette Android.
            </p>
          </div>

          <a
            href="/datenza.apk"
            download="DATENZA.apk"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-xs transition-all shrink-0 cursor-pointer"
          >
            <Download className="h-4 w-4" aria-hidden />
            <span>Télécharger l'APK (~1 Mo)</span>
          </a>
        </div>
      </section>
    </div>
  );
}