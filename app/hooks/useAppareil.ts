"use client";

import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";

export type SystemeAppareil = "ios" | "android" | "mac" | "windows";

export interface Appareil {
  systeme: SystemeAppareil;
  /** Application installée (écran d'accueil, application native) plutôt qu'un onglet du navigateur. */
  autonome: boolean;
  /** Faux pendant le rendu serveur et l'hydratation : les valeurs ci-dessus sont alors celles par défaut. */
  connu: boolean;
}

const PAR_DEFAUT: Appareil = { systeme: "windows", autonome: false, connu: false };
let enCache: Appareil | null = null;

function detecter(): Appareil {
  if (enCache) return enCache;
  const ua = window.navigator.userAgent.toLowerCase();
  // Les iPad récents se présentent comme un Mac : on les reconnaît à l'écran tactile
  const estIpadTactile = /macintosh/.test(ua) && window.navigator.maxTouchPoints > 1;
  const systeme: SystemeAppareil =
    /iphone|ipad|ipod/.test(ua) || estIpadTactile ? "ios" : /android/.test(ua) ? "android" : /macintosh|mac os x/.test(ua) ? "mac" : "windows";
  const autonome =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    Capacitor.isNativePlatform();
  enCache = { systeme, autonome, connu: true };
  return enCache;
}

const sAbonner = () => () => {};

/**
 * Système de l'appareil, lu une fois dans le navigateur. Le rendu serveur et l'hydratation utilisent
 * la valeur par défaut, puis React affiche la vraie valeur sans second rendu déclenché par un effet.
 */
export function useAppareil(): Appareil {
  return useSyncExternalStore(sAbonner, detecter, () => PAR_DEFAUT);
}
