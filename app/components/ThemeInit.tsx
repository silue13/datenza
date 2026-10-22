"use client";
import { useEffect } from "react";
import { appliquerTheme, lireTheme } from "../../lib/prefs";

/** Applique le thème enregistré dès le chargement de l'application. */
export default function ThemeInit() {
  useEffect(() => {
    appliquerTheme(lireTheme());
  }, []);
  return null;
}
