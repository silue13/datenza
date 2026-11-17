"use client";

import { catchError, type ErrorInfo } from "next/error";
import AffichageErreur from "./AffichageErreur";

/**
 * Isole une section de l'analyse : si elle plante, seul son encadré affiche le problème
 * et le reste de la page reste utilisable.
 */
function SectionEnErreur(props: { nom: string }, { error, retry }: ErrorInfo) {
  return <AffichageErreur erreur={error} retry={retry} format="section" titre={`La section « ${props.nom} » n'a pas pu s'afficher`} />;
}

export default catchError(SectionEnErreur);
