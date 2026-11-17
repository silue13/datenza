"use client";

import { useEffect } from "react";
import { estVersionPerimee, messageErreur, rechargerPourNouvelleVersion } from "../lib/erreurs";

/**
 * Dernier recours : erreur dans la mise en page racine. Ce document remplace toute l'application
 * et ne reçoit pas les styles globaux : la mise en forme est donc écrite ici.
 */
export default function ErreurGlobale({ error, retry }: { error: unknown; retry: () => void }) {
  const perimee = estVersionPerimee(error);
  useEffect(() => {
    console.error(error);
    if (perimee) rechargerPourNouvelleVersion();
  }, [error, perimee]);

  const bouton = { padding: "8px 14px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, cursor: "pointer" } as const;
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f8fafc", color: "#0f172a", margin: 0 }}>
        <title>DATENZA</title>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "64px 16px" }}>
          <h1 style={{ fontSize: 22 }}>{perimee ? "Une nouvelle version de DATENZA est disponible" : "DATENZA n'a pas pu s'afficher"}</h1>
          <p style={{ color: "#475569", fontSize: 14 }}>
            {perimee ? "Chargement de la nouvelle version… Vos données importées sont conservées." : "Vos données importées sont conservées. Rechargez ; si le problème revient, transmettez le détail ci-dessous."}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={bouton} onClick={() => window.location.reload()}>Recharger</button>
            {!perimee && <button type="button" style={{ ...bouton, background: "#e2e8f0", color: "#0f172a" }} onClick={() => retry()}>Réessayer</button>}
          </div>
          {!perimee && <pre style={{ marginTop: 16, fontSize: 11, color: "#64748b", whiteSpace: "pre-wrap" }}>{messageErreur(error)}</pre>}
        </main>
      </body>
    </html>
  );
}
