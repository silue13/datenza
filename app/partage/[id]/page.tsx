"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Eye } from "lucide-react";
import { DataProvider, useData } from "../../context/DataContext";
import AnalysePage from "../../analyse/page";
import { chargerPartage, type ProjetPartage } from "../../../lib/projets/depot";
import PartageReseaux from "../../components/PartageReseaux";

/** L'analyse s'affiche une fois le projet partagé chargé dans son propre contexte de données. */
function Contenu() {
  const { restaurationTerminee } = useData();
  if (!restaurationTerminee) return null;
  return <AnalysePage />;
}

const ATTENTE = <p className="max-w-xl mx-auto py-16 text-center text-sm text-slate-500">Ouverture du projet partagé…</p>;

/** L'identifiant du lien n'est connu qu'à la visite : la page attend dans un Suspense. */
export default function PartagePage() {
  return (
    <Suspense fallback={ATTENTE}>
      <ProjetPartageVue />
    </Suspense>
  );
}

function ProjetPartageVue() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  // Résultat mémorisé avec l'identifiant du lien : un autre lien affiche « chargement » sans remise à zéro manuelle
  const [resultat, setResultat] = useState<{ id: string; projet: ProjetPartage | null; erreur: string | null } | null>(null);
  const projet = resultat && resultat.id === id ? resultat.projet : null;
  const erreur = resultat && resultat.id === id ? resultat.erreur : null;

  useEffect(() => {
    if (!id) return;
    let annule = false;
    chargerPartage(id)
      .then((p) => {
        if (!annule) setResultat({ id, projet: p, erreur: null });
      })
      .catch((e) => {
        if (!annule) setResultat({ id, projet: null, erreur: e instanceof Error ? e.message : "Ce projet partagé est indisponible." });
      });
    return () => {
      annule = true;
    };
  }, [id]);

  if (erreur) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Projet partagé indisponible</h1>
        <p className="text-sm text-slate-500">{erreur}</p>
        <Link href="/" className="inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition">
          Découvrir DATENZA
        </Link>
      </div>
    );
  }

  if (!projet) {
    return ATTENTE;
  }

  const majLe = projet.majLe ? new Date(projet.majLe) : null;

  return (
    <div className="space-y-5">
      <div className="max-w-6xl mx-auto print:hidden flex flex-col sm:flex-row sm:items-center gap-2 rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-xs text-blue-900 dark:text-blue-200">
        <Eye className="w-4 h-4 shrink-0" />
        <p className="flex-1">
          <strong>{projet.nom}</strong> — projet partagé en lecture seule
          {majLe && !isNaN(majLe.getTime()) ? `, mis à jour le ${majLe.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}` : ""}.
          Vous pouvez filtrer et explorer : rien n&apos;est modifié chez son propriétaire, et vos propres fichiers ne sont pas touchés.
        </p>
      </div>
      <div className="max-w-6xl mx-auto print:hidden px-1">
        <PartageReseaux url={`${window.location.origin}/partage/${id}`} nomProjet={projet.nom} visiteur />
      </div>
      {/* Contexte de données isolé : la session du visiteur n'est ni lue ni écrasée */}
      <DataProvider key={id} etatInitial={projet.etat} lectureSeule>
        <Contenu />
      </DataProvider>
    </div>
  );
}
