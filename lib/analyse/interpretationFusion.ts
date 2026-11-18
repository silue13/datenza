// lib/analyse/interpretationFusion.ts — bilan en clair d'une fusion ou d'une réconciliation de fichiers.
import type { Interpretation, LigneInterpretation } from "./interpretation";
import type { RapportNettoyage } from "./fusion";

const nf = (x: number) => x.toLocaleString("fr-FR");
const pct = (x: number, total: number) => (total ? `${(Math.round((x / total) * 1000) / 10).toLocaleString("fr-FR")} %` : "0 %");

export function interpreterFusion(r: RapportNettoyage, nomA: string, nomB: string): Interpretation {
  const complements: LigneInterpretation[] = [];
  const pistes: string[] = [];

  if (r.mode === "empilement") {
    const guide =
      "L'empilement met les lignes des fichiers les unes sous les autres, comme si on les copiait à la suite dans un seul tableau. La colonne « Fichier Source » indique d'où vient chaque ligne. Les colonnes de même nom (même avec une écriture différente) sont réunies.";
    if (r.colonnesFusionnees.length)
      complements.push({ titre: "Colonnes réunies", texte: r.colonnesFusionnees.map((c) => `« ${c.nomFinal} » (${c.variantesDetectees.join(" / ")})`).join(", ") + "." });
    if (r.doublonsSupprimes) complements.push({ titre: "Doublons", texte: `${nf(r.doublonsSupprimes)} ligne(s) strictement identiques retirée(s).` });
    if (r.nombresHarmonises + r.datesHarmonisees)
      complements.push({ titre: "Formats corrigés", texte: `${nf(r.nombresHarmonises)} nombre(s) et ${nf(r.datesHarmonisees)} date(s) remis au même format.` });
    const resume = `${r.nbFichiers} fichiers réunis : ${nf(r.lignesFinales)} lignes au final sur ${nf(r.lignesInitialesTotal)} au départ${r.doublonsSupprimes ? `, après retrait de ${nf(r.doublonsSupprimes)} doublon(s)` : ""}.`;
    pistes.push("Lancez l'analyse : elle comparera automatiquement les fichiers entre eux grâce à la colonne « Fichier Source ».");
    if (r.colonnesFusionnees.length === 0) pistes.push("Si des colonnes identiques portent des noms très différents (ex. « CA » et « Chiffre d'affaires »), renommez-les avant la fusion pour qu'elles soient réunies.");
    return { guide, complements, resume, pistes };
  }

  const corr = r.nbCorrespondances ?? 0;
  const orphA = r.nbOrphelinsA ?? 0;
  const orphB = r.nbOrphelinsB ?? 0;
  const totalA = corr + orphA;
  const guide =
    "La réconciliation rapproche les lignes des deux fichiers qui ont la même clé (un numéro de facture, un code client…). Les « absents » sont les lignes dont la clé n'existe que dans un des deux fichiers : ce sont souvent elles qui posent question (facture non payée, paiement sans facture, client manquant). Les clés sont comparées sans tenir compte des majuscules, des accents, des espaces en trop ni des zéros devant un numéro.";

  complements.push({ titre: `Lignes de « ${nomA} » retrouvées`, texte: `${nf(corr)} sur ${nf(totalA)} (${pct(corr, totalA)}).` });
  complements.push({ titre: `Présentes seulement dans « ${nomA} »`, texte: `${nf(orphA)} ligne(s).` });
  complements.push({ titre: `Présentes seulement dans « ${nomB} »`, texte: `${nf(orphB)} ligne(s).` });
  if ((r.lignesSansCleA ?? 0) + (r.lignesSansCleB ?? 0) > 0)
    complements.push({ titre: "Lignes sans clé", texte: `${nf(r.lignesSansCleA ?? 0)} dans « ${nomA} » et ${nf(r.lignesSansCleB ?? 0)} dans « ${nomB} » : impossibles à rapprocher, elles sont écartées du bilan.` });
  if ((r.clesMultiplesB ?? 0) > 0 && r.typeJointure !== "comparaison" && r.typeJointure !== "anti_gauche" && r.typeJointure !== "anti_droite")
    complements.push({ titre: "Clés en plusieurs exemplaires", texte: `${nf(r.clesMultiplesB ?? 0)} clé(s) apparaissent plusieurs fois dans « ${nomB} » : la ligne correspondante de « ${nomA} » est répétée pour chacune, ce qui peut gonfler les totaux.` });

  let resume: string;
  if (r.typeJointure === "comparaison") {
    const ident = r.nbIdentiques ?? 0;
    const diff = r.nbDifferentes ?? 0;
    const colonnes = r.colonnesComparees ?? [];
    if (!colonnes.length) {
      resume = "Aucune colonne ne porte le même nom dans les deux fichiers : seules les présences et absences de clés ont pu être comparées.";
      pistes.push("Pour comparer des valeurs, donnez le même nom aux colonnes à comparer dans les deux fichiers (ex. « Montant »).");
    } else {
      resume = `Sur ${nf(ident + diff)} clé(s) présentes dans les deux fichiers, ${nf(ident)} ont exactement les mêmes valeurs et ${nf(diff)} présentent au moins un écart. ${nf(orphA)} sont absentes de « ${nomB} » et ${nf(orphB)} absentes de « ${nomA} ».`;
      complements.push({ titre: "Colonnes comparées", texte: colonnes.map((c) => `« ${c} »`).join(", ") + "." });
      if (r.ecartsParColonne?.length)
        complements.push({ titre: "Écarts par colonne", texte: r.ecartsParColonne.map((e) => `« ${e.colonne} » : ${nf(e.nb)}`).join(" ; ") + "." });
      if (diff) pistes.push(`Commencez par la colonne qui a le plus d'écarts${r.ecartsParColonne?.[0] ? ` (« ${r.ecartsParColonne[0].colonne} »)` : ""} : les lignes « Différent » sont en tête du tableau.`);
      pistes.push("Les colonnes « écart B − A » donnent la différence chiffrée : un écart toujours identique signale souvent une erreur de saisie ou un frais systématique.");
    }
  } else if (r.typeJointure === "anti_gauche") {
    resume = `${nf(orphA)} ligne(s) de « ${nomA} » n'ont aucune correspondance dans « ${nomB} » : c'est la liste ci-dessous.`;
    pistes.push("Exemple : si A = factures et B = paiements, ce sont les factures non réglées.");
  } else if (r.typeJointure === "anti_droite") {
    resume = `${nf(orphB)} ligne(s) de « ${nomB} » n'ont aucune correspondance dans « ${nomA} » : c'est la liste ci-dessous.`;
    pistes.push("Exemple : si A = factures et B = paiements, ce sont les paiements sans facture connue.");
  } else if (r.typeJointure === "gauche_externe") {
    resume = `Toutes les lignes de « ${nomA} » sont conservées ; ${pct(corr, totalA)} ont été complétées avec les colonnes de « ${nomB} ». La colonne « Origine » distingue les lignes complétées des autres.`;
  } else if (r.typeJointure === "externe_complete") {
    resume = `Toutes les lignes des deux fichiers sont conservées : ${nf(corr)} rapprochées, ${nf(orphA)} propres à « ${nomA} », ${nf(orphB)} propres à « ${nomB} ». La colonne « Origine » indique pour chaque ligne si elle est dans les deux fichiers ou dans un seul.`;
  } else {
    resume = `${pct(corr, totalA)} des lignes de « ${nomA} » ont été retrouvées dans « ${nomB} ». Seules ces lignes communes sont gardées.`;
  }

  if (totalA && corr / totalA < 0.2)
    pistes.unshift("Très peu de lignes rapprochées : vérifiez que les deux clés choisies contiennent bien le même type d'information (même code, même format).");
  return { guide, complements, resume, pistes };
}
