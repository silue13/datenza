// lib/analyse/fusion.ts
import { parseNombre, estValeurVide, type Cellule } from "./utils";

export interface FichierEntree {
  nom: string;
  entetes: string[];
  corps: Cellule[][];
}

export type ModeAssemblage = "empilement" | "jointure";
export type TypeJointure = "inter" | "anti_gauche" | "anti_droite" | "gauche_externe";

export interface ConfigurationJointure {
  indexFichierA: number;
  indexFichierB: number;
  cleFichierA: string;
  cleFichierB: string;
  typeJointure: TypeJointure;
}

export interface OptionsNettoyage {
  mode: ModeAssemblage;
  jointure?: ConfigurationJointure;
  supprimerDoublons: boolean;
  harmoniserFormatsNumeriques: boolean;
  harmoniserDates: boolean;
  nettoyerEspaces: boolean;
  remplirValeursVides: boolean;
  valeurRemplacementVide: string;
  alignerColonnesSimilaires: boolean;
}

export interface RapportNettoyage {
  mode: ModeAssemblage;
  typeJointure?: TypeJointure;
  nbFichiers: number;
  lignesInitialesTotal: number;
  lignesFinales: number;
  doublonsSupprimes: number;
  nombresHarmonises: number;
  datesHarmonisees: number;
  espacesNettoyes: number;
  valeursVidesTraitees: number;
  colonnesFusionnees: { nomFinal: string; variantesDetectees: string[] }[];
  nbCorrespondances?: number;
  nbOrphelinsA?: number;
  nbOrphelinsB?: number;
}

export interface ResultatFusionNettoyage {
  entetes: string[];
  corps: Cellule[][];
  rapport: RapportNettoyage;
}

function normaliserCle(v: Cellule): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normaliserCleColonne(nom: string): string {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function estColonneExclueDeDate(nomCol: string): boolean {
  return /(prix|price|montant|amount|total|cout|cost|quantite|qty|qte|somme|valeur|solde|salaire|remise|taux|rate|id|code|num|ref|matricule)/i.test(
    nomCol
  );
}

function normaliserFormatDate(v: Cellule): string | null {
  if (estValeurVide(v)) return null;

  if ((v as unknown) instanceof Date && !isNaN((v as unknown as Date).getTime())) {
    return (v as unknown as Date).toISOString().slice(0, 10);
  }

  if (typeof v === "number") return null;

  const str = String(v).trim();
  if (/^\d+([.,]\d+)?$/.test(str)) return null;

  const matchFr = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (matchFr) {
    const jour = matchFr[1].padStart(2, "0");
    const mois = matchFr[2].padStart(2, "0");
    const annee = matchFr[3];
    return `${annee}-${mois}-${jour}`;
  }

  const matchIso = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (matchIso) {
    const annee = matchIso[1];
    const mois = matchIso[2].padStart(2, "0");
    const jour = matchIso[3].padStart(2, "0");
    return `${annee}-${mois}-${jour}`;
  }

  return null;
}

function assainirLigne(
  ligneBrute: Cellule[],
  entetes: string[],
  options: OptionsNettoyage,
  compteurs: { nb: number; dates: number; espaces: number; vides: number }
): Cellule[] {
  return ligneBrute.map((valeurBrute, idxCol) => {
    const nomCol = entetes[idxCol] || "";

    // Ne pas altérer la traçabilité du fichier source
    if (nomCol === "Fichier Source") {
      return valeurBrute;
    }

    const exclueDate = estColonneExclueDeDate(nomCol);
    let val: Cellule = valeurBrute;

    if (options.nettoyerEspaces && typeof val === "string") {
      const valNettoyee = val.replace(/\s+/g, " ").trim();
      if (valNettoyee !== val) {
        compteurs.espaces++;
        val = valNettoyee;
      }
    }

    if (estValeurVide(val)) {
      if (options.remplirValeursVides) {
        compteurs.vides++;
        return options.valeurRemplacementVide;
      }
      return "";
    }

    if (options.harmoniserFormatsNumeriques && typeof val === "string") {
      const estColId = /(id|code|num|ref|matricule|tel|phone|postal|zip)/i.test(nomCol);
      const aZeroInitial = /^0\d+/.test(val.trim());
      if (!estColId && !aZeroInitial) {
        const nb = parseNombre(val);
        if (nb !== null && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
          compteurs.nb++;
          val = nb;
        }
      }
    }

    if (options.harmoniserDates && !exclueDate) {
      const dNorm = normaliserFormatDate(val);
      if (dNorm !== null && dNorm !== String(val)) {
        compteurs.dates++;
        val = dNorm;
      }
    }

    return val;
  });
}

export function fusionnerEtNettoyer(
  fichiers: FichierEntree[],
  options: OptionsNettoyage
): ResultatFusionNettoyage {
  const compteurs = { nb: 0, dates: 0, espaces: 0, vides: 0 };
  let doublonsSupprimes = 0;
  const totalLignesInitiales = fichiers.reduce((acc, f) => acc + f.corps.length, 0);

  // ==========================================
  // MODE 1 : JOINTURE RELATIONNELLE
  // ==========================================
  if (options.mode === "jointure" && options.jointure && fichiers.length >= 2) {
    const { indexFichierA, indexFichierB, cleFichierA, cleFichierB, typeJointure } =
      options.jointure;

    const tableA = fichiers[indexFichierA] || fichiers[0];
    const tableB = fichiers[indexFichierB] || fichiers[1];

    const idxCleA = tableA.entetes.indexOf(cleFichierA);
    const idxCleB = tableB.entetes.indexOf(cleFichierB);

    let entetesFinaux: string[] = [];
    const lignesBrutesJointes: Cellule[][] = [];

    const mapTableB = new Map<string, Cellule[][]>();
    tableB.corps.forEach((ligne) => {
      const cleVal = normaliserCle(ligne[idxCleB]);
      if (!cleVal) return;
      if (!mapTableB.has(cleVal)) mapTableB.set(cleVal, []);
      mapTableB.get(cleVal)!.push(ligne);
    });

    const clesCorrespondantes = new Set<string>();
    let nbCorrespondances = 0;
    let nbOrphelinsA = 0;
    let nbOrphelinsB = 0;

    // Colonnes de A (hors Fichier Source déjà existant)
    const indicesColsA: number[] = [];
    const colsA: string[] = [];
    tableA.entetes.forEach((col, idx) => {
      if (col !== "Fichier Source") {
        colsA.push(col);
        indicesColsA.push(idx);
      }
    });

    // Colonnes de B (hors clé et Fichier Source)
    const indicesColsBIncluses: number[] = [];
    const entetesColsBAjoutees: string[] = [];

    tableB.entetes.forEach((nomColB, iB) => {
      if (iB === idxCleB || nomColB === "Fichier Source") return;
      let nomFinal = nomColB;
      if (colsA.includes(nomFinal)) {
        nomFinal = `${nomColB}_${tableB.nom.replace(/\.[^/.]+$/, "").slice(0, 10)}`;
      }
      entetesColsBAjoutees.push(nomFinal);
      indicesColsBIncluses.push(iB);
    });

    if (typeJointure === "inter") {
      entetesFinaux = ["Fichier Source", ...colsA, ...entetesColsBAjoutees];

      tableA.corps.forEach((ligneA) => {
        const cleA = normaliserCle(ligneA[idxCleA]);
        if (!cleA) return;
        const matchsB = mapTableB.get(cleA);

        if (matchsB && matchsB.length > 0) {
          clesCorrespondantes.add(cleA);
          nbCorrespondances++;
          const valsA = indicesColsA.map((iA) => ligneA[iA] ?? "");

          matchsB.forEach((ligneB) => {
            const suiteB = indicesColsBIncluses.map((iB) => ligneB[iB] ?? "");
            lignesBrutesJointes.push([`${tableA.nom} + ${tableB.nom}`, ...valsA, ...suiteB]);
          });
        } else {
          nbOrphelinsA++;
        }
      });

      tableB.corps.forEach((ligneB) => {
        const cleB = normaliserCle(ligneB[idxCleB]);
        if (cleB && !clesCorrespondantes.has(cleB)) nbOrphelinsB++;
      });
    } else if (typeJointure === "anti_gauche") {
      entetesFinaux = ["Fichier Source", ...colsA];

      tableA.corps.forEach((ligneA) => {
        const cleA = normaliserCle(ligneA[idxCleA]);
        if (!cleA) return;
        const matchsB = mapTableB.get(cleA);

        if (!matchsB || matchsB.length === 0) {
          nbOrphelinsA++;
          const valsA = indicesColsA.map((iA) => ligneA[iA] ?? "");
          lignesBrutesJointes.push([tableA.nom, ...valsA]);
        } else {
          nbCorrespondances++;
        }
      });
    } else if (typeJointure === "anti_droite") {
      const indicesColsB: number[] = [];
      const colsB: string[] = [];
      tableB.entetes.forEach((col, idx) => {
        if (col !== "Fichier Source") {
          colsB.push(col);
          indicesColsB.push(idx);
        }
      });

      entetesFinaux = ["Fichier Source", ...colsB];

      const clesTableA = new Set(
        tableA.corps.map((l) => normaliserCle(l[idxCleA])).filter(Boolean)
      );

      tableB.corps.forEach((ligneB) => {
        const cleB = normaliserCle(ligneB[idxCleB]);
        if (!cleB) return;
        if (!clesTableA.has(cleB)) {
          nbOrphelinsB++;
          const valsB = indicesColsB.map((iB) => ligneB[iB] ?? "");
          lignesBrutesJointes.push([tableB.nom, ...valsB]);
        } else {
          nbCorrespondances++;
        }
      });
    } else if (typeJointure === "gauche_externe") {
      entetesFinaux = ["Fichier Source", ...colsA, ...entetesColsBAjoutees];

      tableA.corps.forEach((ligneA) => {
        const cleA = normaliserCle(ligneA[idxCleA]);
        const matchsB = cleA ? mapTableB.get(cleA) : undefined;
        const valsA = indicesColsA.map((iA) => ligneA[iA] ?? "");

        if (matchsB && matchsB.length > 0) {
          nbCorrespondances++;
          matchsB.forEach((ligneB) => {
            const suiteB = indicesColsBIncluses.map((iB) => ligneB[iB] ?? "");
            lignesBrutesJointes.push([`${tableA.nom} + ${tableB.nom}`, ...valsA, ...suiteB]);
          });
        } else {
          if (cleA) nbOrphelinsA++;
          const suiteVide = new Array(indicesColsBIncluses.length).fill("");
          lignesBrutesJointes.push([tableA.nom, ...valsA, ...suiteVide]);
        }
      });
    }

    const corpsFinal: Cellule[][] = [];
    const empreintes = new Set<string>();

    lignesBrutesJointes.forEach((ligne) => {
      const lignePropre = assainirLigne(ligne, entetesFinaux, options, compteurs);

      if (options.supprimerDoublons) {
        const emp = lignePropre
          .filter((_, idx) => entetesFinaux[idx] !== "Fichier Source")
          .map((v) => String(v ?? "").toLowerCase().trim())
          .join("§");

        if (empreintes.has(emp)) {
          doublonsSupprimes++;
          return;
        }
        empreintes.add(emp);
      }

      corpsFinal.push(lignePropre);
    });

    return {
      entetes: entetesFinaux,
      corps: corpsFinal,
      rapport: {
        mode: "jointure",
        typeJointure,
        nbFichiers: 2,
        lignesInitialesTotal: tableA.corps.length + tableB.corps.length,
        lignesFinales: corpsFinal.length,
        doublonsSupprimes,
        nombresHarmonises: compteurs.nb,
        datesHarmonisees: compteurs.dates,
        espacesNettoyes: compteurs.espaces,
        valeursVidesTraitees: compteurs.vides,
        colonnesFusionnees: [],
        nbCorrespondances,
        nbOrphelinsA,
        nbOrphelinsB,
      },
    };
  }

  // ==========================================
  // MODE 2 : EMPILEMENT (APPEND)
  // ==========================================
  const mapNormaliseVersOriginal = new Map<string, string>();
  const mapVariantes = new Map<string, Set<string>>();

  fichiers.forEach((f) => {
    f.entetes.forEach((col) => {
      if (col === "Fichier Source") return;
      const cle = options.alignerColonnesSimilaires ? normaliserCleColonne(col) : col.trim();

      if (!mapNormaliseVersOriginal.has(cle)) {
        mapNormaliseVersOriginal.set(cle, col.trim());
        mapVariantes.set(cle, new Set([col.trim()]));
      } else {
        mapVariantes.get(cle)?.add(col.trim());
      }
    });
  });

  const colonnesDonnees = Array.from(mapNormaliseVersOriginal.values());
  const entetesFinaux = ["Fichier Source", ...colonnesDonnees];

  const colonnesFusionnees: { nomFinal: string; variantesDetectees: string[] }[] = [];
  mapVariantes.forEach((variantes, cle) => {
    if (variantes.size > 1) {
      colonnesFusionnees.push({
        nomFinal: mapNormaliseVersOriginal.get(cle) || "",
        variantesDetectees: Array.from(variantes),
      });
    }
  });

  const corpsNettoyeBrut: Cellule[][] = [];
  const empreintesLignes = new Set<string>();

  fichiers.forEach((f) => {
    const mappingIndex = f.entetes.map((h) => {
      if (h === "Fichier Source") return -1;
      const cle = options.alignerColonnesSimilaires ? normaliserCleColonne(h) : h.trim();
      const nomFinal = mapNormaliseVersOriginal.get(cle);
      return nomFinal ? entetesFinaux.indexOf(nomFinal) : -1;
    });

    f.corps.forEach((ligneOriginale) => {
      const nouvelleLigne: Cellule[] = new Array(entetesFinaux.length).fill(
        options.remplirValeursVides ? options.valeurRemplacementVide : ""
      );

      // Attribution de la source pour chaque enregistrement
      nouvelleLigne[0] = f.nom;

      ligneOriginale.forEach((valeurBrute, idxColSource) => {
        const idxFinal = mappingIndex[idxColSource];
        if (idxFinal === -1) return;
        nouvelleLigne[idxFinal] = valeurBrute;
      });

      const lignePropre = assainirLigne(nouvelleLigne, entetesFinaux, options, compteurs);

      if (options.supprimerDoublons) {
        const empreinte = lignePropre
          .filter((_, idx) => entetesFinaux[idx] !== "Fichier Source")
          .map((v) => String(v ?? "").toLowerCase().trim())
          .join("§");

        if (empreintesLignes.has(empreinte)) {
          doublonsSupprimes++;
          return;
        }
        empreintesLignes.add(empreinte);
      }

      corpsNettoyeBrut.push(lignePropre);
    });
  });

  return {
    entetes: entetesFinaux,
    corps: corpsNettoyeBrut,
    rapport: {
      mode: "empilement",
      nbFichiers: fichiers.length,
      lignesInitialesTotal: totalLignesInitiales,
      lignesFinales: corpsNettoyeBrut.length,
      doublonsSupprimes,
      nombresHarmonises: compteurs.nb,
      datesHarmonisees: compteurs.dates,
      espacesNettoyes: compteurs.espaces,
      valeursVidesTraitees: compteurs.vides,
      colonnesFusionnees,
    },
  };
}