"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  BarChart2,
  Sparkles,
  Layers,
  Settings,
  ChevronLeft,
  ChevronRight,
  Download,
  Smartphone,
  Monitor,
} from "lucide-react";
import LogoDatenza from "./LogoDatenza";
import BoutonInstallerApp from "./BoutonInstallerApp";

const navigation = [
  { name: "Accueil", href: "/", icon: Home },
  { name: "Analyse", href: "/analyse", icon: BarChart2 },
  { name: "Assistant IA", href: "/assistant-ia", icon: Sparkles },
  { name: "Fusion", href: "/fusion", icon: Layers },
  { name: "Paramètres", href: "/parametres", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [estReduit, setEstReduit] = useState<boolean>(false);
  const [os, setOs] = useState<"windows" | "android">("windows");

  // Détection automatique de l'appareil (Windows ou Android)
  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    if (/android/i.test(ua)) {
      setOs("android");
    } else {
      setOs("windows");
    }
  }, []);

  const estAndroid = os === "android";
  const lienTelechargement = estAndroid ? "/datenza.apk" : "/datenza.msi";
  const nomFichierTelecharge = estAndroid ? "DATENZA.apk" : "DATENZA-Setup.msi";
  const libelleBouton = estAndroid ? "Installer pour Android (.apk)" : "Installer pour Windows (.msi)";
  const texteInfoBouton = estAndroid ? "Télécharger le package Android" : "Télécharger l'installateur Windows";
  const IconeOs = estAndroid ? Smartphone : Monitor;
  const styleCouleur = estAndroid
    ? "bg-emerald-600/15 hover:bg-emerald-600 border-emerald-500/30 hover:border-emerald-500 text-emerald-400 hover:text-white"
    : "bg-blue-600/15 hover:bg-blue-600 border-blue-500/30 hover:border-blue-500 text-blue-400 hover:text-white";

  return (
    <>
      {/* ========================================================
          1. VERSION ORDINATEUR & TABLETTE (>= 768px : Barre latérale)
         ======================================================== */}
      <aside
        className={`hidden md:flex print:hidden bg-slate-900 text-slate-300 border-r border-slate-800 flex-col justify-between shrink-0 min-h-screen transition-all duration-300 ease-in-out ${
          estReduit ? "w-20 p-3" : "w-64 p-4"
        }`}
      >
        <div className="space-y-6">
          {/* En-tête : Logo + Bouton de repli/ouverture */}
          <div
            className={`flex items-center ${
              estReduit ? "flex-col gap-3 justify-center" : "justify-between px-1 py-1"
            }`}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-slate-800/90 border border-slate-700/60 flex items-center justify-center shadow-xs shrink-0">
                <LogoDatenza taille={24} />
              </div>
              {!estReduit && (
                <div className="truncate transition-opacity duration-200">
                  <span className="text-xl font-black tracking-tight text-white block leading-none">
                    DATENZA
                  </span>
                  <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">
                    Data Intelligence
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setEstReduit(!estReduit)}
              title={estReduit ? "Déplier la barre" : "Replier la barre"}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer border border-transparent hover:border-slate-700"
            >
              {estReduit ? (
                <ChevronRight className="w-5 h-5 text-blue-400" />
              ) : (
                <ChevronLeft className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Liens de navigation Desktop */}
          <nav className="space-y-1.5">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  title={estReduit ? item.name : undefined}
                  className={`flex items-center rounded-xl text-sm font-medium transition-all ${
                    estReduit ? "justify-center px-0 py-3" : "gap-3 px-3.5 py-2.5"
                  } ${
                    isActive
                      ? "bg-white text-slate-950 font-bold shadow-xs"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 shrink-0 ${
                      isActive ? "text-slate-900" : "text-slate-400"
                    }`}
                  />
                  {!estReduit && <span className="truncate">{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bas de barre latérale : Installation PWA + Bouton de téléchargement auto-adaptatif */}
        <div className="pt-4 border-t border-slate-800 space-y-2">
          {!estReduit ? (
            <>
              <BoutonInstallerApp />
              <a
                href={lienTelechargement}
                download={nomFichierTelecharge}
                title={texteInfoBouton}
                className={`flex items-center justify-center gap-2 w-full py-2 px-3 border rounded-xl text-xs font-semibold shadow-xs transition-all duration-200 ${styleCouleur}`}
              >
                <IconeOs className="w-4 h-4 shrink-0" />
                <span className="truncate">{libelleBouton}</span>
              </a>
            </>
          ) : (
            <div className="flex justify-center">
              <a
                href={lienTelechargement}
                download={nomFichierTelecharge}
                title={texteInfoBouton}
                className={`p-2.5 rounded-xl border transition-all duration-200 ${styleCouleur}`}
              >
                <Download className="w-5 h-5" />
              </a>
            </div>
          )}
        </div>
      </aside>

      {/* ========================================================
          2. VERSION MOBILE (< 768px : Barre fixée en bas)
         ======================================================== */}
      <nav
        aria-label="Navigation mobile"
        className="md:hidden print:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 flex items-center justify-around px-2 z-50 shadow-lg"
      >
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-all ${
                isActive
                  ? "text-blue-400 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-blue-400" : "text-slate-400"}`} />
              <span className="text-[10px] tracking-tight">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}