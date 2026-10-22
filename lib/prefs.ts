// Préférences locales (navigateur) : thème et mode géographique strict.
export type Theme = "clair" | "sombre" | "systeme";

const CLE_THEME = "datenza-theme";
const CLE_GEO_STRICT = "datenza-geo-strict";

function lire(cle: string): string | null {
  try {
    return window.localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(cle: string, valeur: string) {
  try {
    window.localStorage.setItem(cle, valeur);
  } catch {
    /* stockage indisponible : on ignore */
  }
}

export function lireTheme(): Theme {
  const v = lire(CLE_THEME);
  return v === "clair" || v === "sombre" || v === "systeme" ? v : "systeme";
}

export function enregistrerTheme(theme: Theme) {
  ecrire(CLE_THEME, theme);
}

export function appliquerTheme(theme: Theme) {
  const sombre =
    theme === "sombre" || (theme === "systeme" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", sombre);
  document.body.classList.toggle("theme-sombre", sombre);
  document.body.classList.toggle("theme-clair", !sombre);
}

export function lireGeoStrict(): boolean {
  return lire(CLE_GEO_STRICT) !== "0";
}

export function enregistrerGeoStrict(actif: boolean) {
  ecrire(CLE_GEO_STRICT, actif ? "1" : "0");
}
