"use client";

import AffichageErreur from "./components/AffichageErreur";

/** Erreur dans une page : le menu reste en place, seule la page affiche le problème. */
export default function ErreurPage({ error, retry }: { error: unknown; retry: () => void }) {
  return <AffichageErreur erreur={error} retry={retry} format="page" />;
}
