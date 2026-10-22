"use client";
import { useState } from "react";
import {
  appliquerTheme,
  enregistrerGeoStrict,
  enregistrerTheme,
  lireGeoStrict,
  lireTheme,
  type Theme,
} from "../../lib/prefs";

const THEMES: { id: Theme; icone: string; nom: string }[] = [
  { id: "clair", icone: "☀️", nom: "Clair" },
  { id: "sombre", icone: "🌙", nom: "Sombre" },
  { id: "systeme", icone: "💻", nom: "Système" },
];

export default function ParametresPage() {
  // Initialisation paresseuse : ce composant n'est rendu que côté navigateur après hydratation du layout.
  const [theme, setTheme] = useState<Theme>(() => (typeof window === "undefined" ? "systeme" : lireTheme()));
  const [strictGeoCI, setStrictGeoCI] = useState<boolean>(() => (typeof window === "undefined" ? true : lireGeoStrict()));
  const [sauvegardeOk, setSauvegardeOk] = useState(false);

  function choisirTheme(t: Theme) {
    setTheme(t);
    appliquerTheme(t); // aperçu immédiat
  }

  function enregistrer() {
    enregistrerTheme(theme);
    enregistrerGeoStrict(strictGeoCI);
    setSauvegardeOk(true);
    setTimeout(() => setSauvegardeOk(false), 3000);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 font-sans text-slate-800 dark:text-slate-100">
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-purple-600">CONFIGURATION</span>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">Paramètres de l&apos;application</h1>
        <p className="text-slate-500 text-sm">Gérez vos préférences d&apos;affichage et la géolocalisation.</p>
      </div>

      {sauvegardeOk && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-200 text-xs font-semibold rounded-xl">
          ✓ Paramètres enregistrés sur cet appareil.
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
        <h2 className="text-base font-bold border-b border-slate-100 dark:border-slate-800 pb-3">Apparence &amp; Thème</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => choisirTheme(t.id)}
              className={`p-4 rounded-xl border text-xs font-semibold flex flex-col items-center gap-2 transition ${
                theme === t.id
                  ? "border-purple-600 bg-purple-50/50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300"
                  : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
            >
              <span className="text-lg">{t.icone}</span>
              <span>{t.nom}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
        <h2 className="text-base font-bold border-b border-slate-100 dark:border-slate-800 pb-3">Géolocalisation</h2>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={strictGeoCI}
            onChange={(e) => setStrictGeoCI(e.target.checked)}
            className="accent-purple-600 h-4 w-4 rounded mt-0.5"
          />
          <div className="text-xs space-y-0.5">
            <span className="font-bold block">Limiter la recherche en ligne à la Côte d&apos;Ivoire</span>
            <p className="text-slate-500">
              Le référentiel ivoirien intégré est toujours utilisé en premier. Quand un lieu n&apos;y figure pas, la recherche
              OpenStreetMap est restreinte à la Côte d&apos;Ivoire (décoche pour autoriser le monde entier).
            </p>
          </div>
        </label>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-2 shadow-sm">
        <h2 className="text-base font-bold border-b border-slate-100 dark:border-slate-800 pb-3">Assistant IA</h2>
        <p className="text-xs text-slate-500">
          Les clés des services IA sont configurées côté serveur (variables d&apos;environnement) et ne sont jamais saisies ni
          affichées dans l&apos;application.
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={enregistrer}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl shadow transition"
        >
          Enregistrer les modifications
        </button>
      </div>
    </div>
  );
}
