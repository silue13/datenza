"use client";

import { useEffect } from "react";

export default function PwaUpdater() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Vérifie et force la mise à jour du Service Worker
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;

      // 1. Force la détection de la nouvelle version sur Vercel dès l'ouverture
      registration.update();

      // 2. Si une nouvelle version est déjà téléchargée et attend, forcer son activation
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      // 3. Écoute l'arrivée d'une nouvelle version
      registration.onupdatefound = () => {
        const nouveauWorker = registration.installing;
        if (!nouveauWorker) return;

        nouveauWorker.onstatechange = () => {
          if (
            nouveauWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            // Nouveau bundle détecté : recharge la page pour appliquer les correctifs
            window.location.reload();
          }
        };
      };
    });

    // 4. Dès que le nouveau Service Worker prend la main, rafraîchir l'interface
    let enCoursDeRechargement = false;
    const recharger = () => {
      if (!enCoursDeRechargement) {
        enCoursDeRechargement = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", recharger);

    // 5. Revérifier quand l'utilisateur réactive la fenêtre de l'application
    const verifierAuRetour = () => {
      navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
    };
    window.addEventListener("focus", verifierAuRetour);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", recharger);
      window.removeEventListener("focus", verifierAuRetour);
    };
  }, []);

  return null;
}