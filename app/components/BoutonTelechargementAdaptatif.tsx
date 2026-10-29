"use client";

import { useEffect, useState } from "react";
import { Download, Monitor, Smartphone } from "lucide-react";

interface Props {
  className?: string;
  variante?: "compact" | "complet";
}

export default function BoutonTelechargementAdaptatif({ className = "", variante = "complet" }: Props) {
  // 'windows' par défaut pour le rendu initial serveur (SSR)
  const [os, setOs] = useState<"windows" | "android" | "autre">("windows");
  const [estCharge, setEstCharge] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();

    if (/android/i.test(ua)) {
      setOs("android");
    } else if (/win/i.test(ua)) {
      setOs("windows");
    } else {
      setOs("windows"); // Fallback par défaut si OS indéterminé ou Mac/Linux
    }
    setEstCharge(true);
  }, []);

  const config = {
    windows: {
      href: "/datenza.msi",
      nomFichier: "DATENZA-Setup.msi",
      titre: "Télécharger pour Windows",
      label: "Installer sur Windows (.msi)",
      labelCompact: "Windows",
      couleur: "bg-blue-600 hover:bg-blue-700 text-white",
      icone: Monitor,
      autreOs: "android" as const,
      autreLabel: "Besoin de la version Android ?",
    },
    android: {
      href: "/datenza.apk",
      nomFichier: "DATENZA.apk",
      titre: "Télécharger pour Android",
      label: "Installer sur Android (.apk)",
      labelCompact: "Android",
      couleur: "bg-emerald-600 hover:bg-emerald-700 text-white",
      icone: Smartphone,
      autreOs: "windows" as const,
      autreLabel: "Besoin de la version Windows ?",
    },
    autre: {
      href: "/datenza.msi",
      nomFichier: "DATENZA-Setup.msi",
      titre: "Télécharger DATENZA",
      label: "Télécharger DATENZA",
      labelCompact: "App",
      couleur: "bg-purple-600 hover:bg-purple-700 text-white",
      icone: Download,
      autreOs: "android" as const,
      autreLabel: "Version Android (.apk)",
    },
  }[os];

  const IconePrincipale = config.icone;
  const configAutre = config.autreOs === "android"
    ? { href: "/datenza.apk", download: "DATENZA.apk", label: "Android (.apk)" }
    : { href: "/datenza.msi", download: "DATENZA-Setup.msi", label: "Windows (.msi)" };

  // Rendu compact (idéal pour la barre latérale)
  if (variante === "compact") {
    return (
      <a
        href={config.href}
        download={config.nomFichier}
        title={config.titre}
        className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold shadow-xs transition-all active:scale-95 ${config.couleur} ${className}`}
      >
        <IconePrincipale className="w-4 h-4 shrink-0" />
        <span>{config.labelCompact}</span>
      </a>
    );
  }

  // Rendu complet (idéal pour la page Paramètres)
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        {/* Bouton principal intelligent */}
        <a
          href={config.href}
          download={config.nomFichier}
          className={`inline-flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer ${config.couleur}`}
        >
          <IconePrincipale className="h-4 w-4" />
          <span>{config.label}</span>
        </a>

        {/* Lien secondaire discret pour l'autre OS */}
        <a
          href={configAutre.href}
          download={configAutre.download}
          className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 underline underline-offset-4 transition"
        >
          {config.autreLabel}
        </a>
      </div>
    </div>
  );
}