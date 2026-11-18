// lib/analyse/interpretationFusion.ts — bilan en clair d'une fusion ou d'une réconciliation de fichiers.
import type { Interpretation, LigneInterpretation } from "./interpretation";
import type { RapportNettoyage } from "./fusion";
import type { BilanMultiComparaison } from "./comparaison";

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

/** Bilan en clair d'une comparaison ligne à ligne de plusieurs fichiers. */
export function interpreterMultiComparaison(b: BilanMultiComparaison): Interpretation {
  const premier = b.fichiers[0];
  const dernier = b.fichiers[b.fichiers.length - 1];
  const guide = `Chaque ligne du tableau est une clé (client, produit, facture…) retrouvée dans au moins un des ${b.fichiers.length} fichiers. Les colonnes « Dans … » indiquent dans quels fichiers elle figure. « Apparue » : absente du premier fichier (${premier}) mais présente dans le dernier (${dernier}) ; « Disparue » : l'inverse. Les fichiers sont lus dans l'ordre de la liste : mettez-les dans l'ordre chronologique pour suivre une évolution. Les colonnes de même nom sont comparées d'un fichier à l'autre, au format près.`;
  const complements: LigneInterpretation[] = [
    { titre: "Présentes dans tous les fichiers", texte: `${nf(b.partout)} sur ${nf(b.nbCles)} (${pct(b.partout, b.nbCles)}).` },
    { titre: "Apparues / disparues", texte: `${nf(b.apparues)} apparue(s) et ${nf(b.disparues)} disparue(s) entre « ${premier} » et « ${dernier} ».` },
  ];
  const uniques = b.uniques.filter((u) => u.nb > 0);
  if (uniques.length) complements.push({ titre: "Présentes dans un seul fichier", texte: uniques.map((u) => `« ${u.fichier} » : ${nf(u.nb)}`).join(" ; ") + "." });
  if (b.colonnes.length) complements.push({ titre: "Colonnes comparées", texte: b.colonnes.map((c) => `« ${c} »`).join(", ") + "." });
  if (b.changementsParColonne.length)
    complements.push({ titre: "Valeurs qui changent", texte: b.changementsParColonne.map((c) => `« ${c.colonne} » : ${nf(c.nb)} clé(s)`).join(" ; ") + "." });
  if (b.clesEnDouble) complements.push({ titre: "Clés en double", texte: `${nf(b.clesEnDouble)} ligne(s) répètent une clé déjà vue dans le même fichier : seule la première est comparée.` });

  const resume =
    `Sur ${nf(b.nbCles)} clé(s), ${pct(b.partout, b.nbCles)} figurent dans les ${b.fichiers.length} fichiers. ` +
    (b.apparues || b.disparues ? `Entre « ${premier} » et « ${dernier} », ${nf(b.apparues)} sont apparues et ${nf(b.disparues)} ont disparu.` : `Aucune clé n'est apparue ni n'a disparu entre le premier et le dernier fichier.`);

  const pistes: string[] = [];
  if (b.disparues) pistes.push("Les clés « Disparue » sont en tête des absences : clients perdus, produits retirés, agents partis… à vérifier une par une.");
  if (b.changementsParColonne.length) pistes.push(`Les clés dont les valeurs changent sont en tête du tableau ; commencez par « ${b.changementsParColonne[0].colonne} ».`);
  pistes.push("Pour comparer les totaux et les tendances de chaque fichier (graphiques, prévisions par fichier), utilisez « Analyse comparée des fichiers ».");
  if (b.partout / Math.max(1, b.nbCles) < 0.2) pistes.push("Très peu de clés communes : vérifiez que la colonne choisie dans chaque fichier contient bien le même identifiant.");
  return { guide, complements, resume, pistes };
}
