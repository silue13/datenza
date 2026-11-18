// lib/analyse/fusion.ts
import { parseNombre, estValeurVide, estColonneIdentifiant, type Cellule } from "./utils";
import { convertirDate, formaterDateISO } from "./dates";

export interface FichierEntree {
  nom: string;
  entetes: string[];
  corps: Cellule[][];
}

export type ModeAssemblage = "empilement" | "jointure";
export type TypeJointure = "inter" | "anti_gauche" | "anti_droite" | "gauche_externe" | "externe_complete" | "comparaison";

export interface ConfigurationJointure {
  indexFichierA: number;
  indexFichierB: number;
  cleFichierA: string;
  cleFichierB: string;
  typeJointure: TypeJointure;
  /** Mode « comparaison » : colonnes à comparer (noms de A). Toutes les colonnes communes par défaut. */
  colonnesAComparer?: string[];
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
  /** Lignes de A dont la clé existe dans B. */
  nbCorrespondances?: number;
  /** Lignes de A dont la clé est absente de B. */
  nbOrphelinsA?: number;
  /** Lignes de B dont la clé est absente de A. */
  nbOrphelinsB?: number;
  /** Lignes sans clé (cellule vide), écartées du rapprochement. */
  lignesSansCleA?: number;
  lignesSansCleB?: number;
  /** Clés présentes plusieurs fois : chaque ligne de A est alors répétée pour chaque ligne de B correspondante. */
  clesMultiplesA?: number;
  clesMultiplesB?: number;
  /** Mode « comparaison » : lignes identiques, différentes, et nombre d'écarts par colonne. */
  nbIdentiques?: number;
  nbDifferentes?: number;
  ecartsParColonne?: { colonne: string; nb: number }[];
  colonnesComparees?: string[];
}

export interface ResultatFusionNettoyage {
  entetes: string[];
  corps: Cellule[][];
  rapport: RapportNettoyage;
}

/**
 * Clé de rapprochement : sans accents, sans casse, espaces réduits.
 * Un code purement numérique perd ses zéros de tête et sa partie décimale nulle :
 * « 00123 », « 123 » et « 123.0 » désignent la même ligne (Excel supprime souvent ces zéros).
 */
export function normaliserCle(v: Cellule): string {
  let s = String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^-?\d+([.,]0+)?$/.test(s)) s = s.replace(/[.,]0+$/, "").replace(/^(-?)0+(?=\d)/, "$1");
  return s;
}

export function normaliserCleColonne(nom: string): string {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

const MOTS_PAS_DATE = new Set([
  "prix", "price", "montant", "amount", "total", "cout", "cost", "quantite", "qty", "qte", "somme", "valeur", "solde",
  "salaire", "remise", "taux", "rate", "id", "code", "num", "numero", "ref", "reference", "matricule",
]);

/** Mots entiers : « Période de validité » ou « Préfecture » ne sont plus écartées à cause de « id » ou « ref ». */
function estColonneExclueDeDate(nomCol: string): boolean {
  return nomCol
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .some((m) => MOTS_PAS_DATE.has(m));
}

function normaliserFormatDate(v: Cellule): string | null {
  if (estValeurVide(v)) return null;

  if ((v as unknown) instanceof Date && !isNaN((v as unknown as Date).getTime())) {
    // Date locale écrite telle quelle (toISOString décalait le jour selon le fuseau)
    return formaterDateISO(v as unknown as Date).slice(0, 10);
  }

  if (typeof v === "number") return null;

  const str = String(v).trim();
  if (/^\d+([.,]\d+)?$/.test(str)) return null;

  // Dates complètes uniquement (jour, mois, année). La date est validée : « 31/02/2024 » est laissée telle quelle,
  // et « 12/25/2024 » (format américain) donne bien le 25 décembre au lieu d'un « 2024-25-12 » impossible.
  if (!/^\d{1,2}[\/\-.]\d{1,2}[\/\-.](\d{4}|\d{2})$/.test(str) && !/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(str)) return null;
  const d = convertirDate(str);
  if (d) return formaterDateISO(d).slice(0, 10);

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
      const estColId = estColonneIdentifiant(nomCol, []);
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
    const { indexFichierA, indexFichierB, cleFichierA, cleFichierB, typeJointure } = options.jointure;

    const tableA = fichiers[indexFichierA] || fichiers[0];
    const tableB = fichiers[indexFichierB] || fichiers[1];
    const idxCleA = tableA.entetes.indexOf(cleFichierA);
    const idxCleB = tableB.entetes.indexOf(cleFichierB);
    const sansExtension = (nom: string) => nom.replace(/\.[^/.]+$/, "");

    // Index des deux tables par clé normalisée, et bilan commun à tous les types de jointure
    const indexer = (corps: Cellule[][], idx: number) => {
      const map = new Map<string, Cellule[][]>();
      let sansCle = 0;
      for (const ligne of corps) {
        const cle = idx === -1 ? "" : normaliserCle(ligne[idx]);
        if (!cle) {
          sansCle++;
          continue;
        }
        const liste = map.get(cle);
        if (liste) liste.push(ligne);
        else map.set(cle, [ligne]);
      }
      let multiples = 0;
      map.forEach((l) => {
        if (l.length > 1) multiples++;
      });
      return { map, sansCle, multiples };
    };
    const indexA = indexer(tableA.corps, idxCleA);
    const indexB = indexer(tableB.corps, idxCleB);
    let nbCorrespondances = 0;
    let nbOrphelinsA = 0;
    let nbOrphelinsB = 0;
    indexA.map.forEach((lignes, cle) => {
      if (indexB.map.has(cle)) nbCorrespondances += lignes.length;
      else nbOrphelinsA += lignes.length;
    });
    indexB.map.forEach((lignes, cle) => {
      if (!indexA.map.has(cle)) nbOrphelinsB += lignes.length;
    });

    // Colonnes de A (hors Fichier Source) et de B (hors clé et Fichier Source), renommées en cas de doublon
    const indicesColsA: number[] = [];
    const colsA: string[] = [];
    tableA.entetes.forEach((col, idx) => {
      if (col !== "Fichier Source") {
        colsA.push(col);
        indicesColsA.push(idx);
      }
    });
    const indicesColsBIncluses: number[] = [];
    const entetesColsBAjoutees: string[] = [];
    tableB.entetes.forEach((nomColB, iB) => {
      if (iB === idxCleB || nomColB === "Fichier Source") return;
      const nomFinal = colsA.includes(nomColB) ? `${nomColB}_${sansExtension(tableB.nom).slice(0, 10)}` : nomColB;
      entetesColsBAjoutees.push(nomFinal);
      indicesColsBIncluses.push(iB);
    });
    const valeursA = (ligne: Cellule[]) => indicesColsA.map((i) => ligne[i] ?? "");
    const valeursB = (ligne: Cellule[]) => indicesColsBIncluses.map((i) => ligne[i] ?? "");
    const videsB = () => new Array(indicesColsBIncluses.length).fill("");

    let entetesFinaux: string[] = [];
    const lignesBrutesJointes: Cellule[][] = [];
    const sourceCommune = `${tableA.nom} + ${tableB.nom}`;
    let bilanComparaison: Pick<RapportNettoyage, "nbIdentiques" | "nbDifferentes" | "ecartsParColonne" | "colonnesComparees"> = {};

    if (typeJointure === "inter" || typeJointure === "gauche_externe" || typeJointure === "externe_complete") {
      entetesFinaux = ["Fichier Source", ...colsA, ...entetesColsBAjoutees];
      for (const ligneA of tableA.corps) {
        const cleA = idxCleA === -1 ? "" : normaliserCle(ligneA[idxCleA]);
        const matchs = cleA ? indexB.map.get(cleA) : undefined;
        if (matchs) {
          for (const ligneB of matchs) lignesBrutesJointes.push([sourceCommune, ...valeursA(ligneA), ...valeursB(ligneB)]);
        } else if (typeJointure !== "inter") {
          lignesBrutesJointes.push([tableA.nom, ...valeursA(ligneA), ...videsB()]);
        }
      }
      if (typeJointure === "externe_complete") {
        // Lignes de B sans correspondance : la clé est reportée dans la colonne clé de A
        const posCleA = colsA.indexOf(cleFichierA);
        for (const ligneB of tableB.corps) {
          const cleB = idxCleB === -1 ? "" : normaliserCle(ligneB[idxCleB]);
          if (cleB && indexA.map.has(cleB)) continue;
          const partieA: Cellule[] = new Array(colsA.length).fill("");
          if (posCleA !== -1) partieA[posCleA] = ligneB[idxCleB] ?? "";
          lignesBrutesJointes.push([tableB.nom, ...partieA, ...valeursB(ligneB)]);
        }
      }
    } else if (typeJointure === "anti_gauche") {
      entetesFinaux = ["Fichier Source", ...colsA];
      for (const ligneA of tableA.corps) {
        const cleA = idxCleA === -1 ? "" : normaliserCle(ligneA[idxCleA]);
        if (cleA && !indexB.map.has(cleA)) lignesBrutesJointes.push([tableA.nom, ...valeursA(ligneA)]);
      }
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
      for (const ligneB of tableB.corps) {
        const cleB = idxCleB === -1 ? "" : normaliserCle(ligneB[idxCleB]);
        if (cleB && !indexA.map.has(cleB)) lignesBrutesJointes.push([tableB.nom, ...indicesColsB.map((i) => ligneB[i] ?? "")]);
      }
    } else if (typeJointure === "comparaison") {
      const resultat = comparerValeurs(tableA, tableB, idxCleA, idxCleB, indexA.map, indexB.map, options.jointure.colonnesAComparer);
      entetesFinaux = resultat.entetes;
      lignesBrutesJointes.push(...resultat.corps);
      bilanComparaison = resultat.bilan;
    }

    const corpsFinal: Cellule[][] = [];
    const empreintes = new Set<string>();
    // La comparaison garde les valeurs telles quelles : c'est précisément ce qu'on veut voir
    const nettoyer = typeJointure !== "comparaison";
    for (const ligne of lignesBrutesJointes) {
      const lignePropre = nettoyer ? assainirLigne(ligne, entetesFinaux, options, compteurs) : ligne;
      if (options.supprimerDoublons && nettoyer) {
        const emp = lignePropre
          .filter((_, idx) => entetesFinaux[idx] !== "Fichier Source")
          .map((v) => String(v ?? "").toLowerCase().trim())
          .join("§");
        if (empreintes.has(emp)) {
          doublonsSupprimes++;
          continue;
        }
        empreintes.add(emp);
      }
      corpsFinal.push(lignePropre);
    }

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
        lignesSansCleA: indexA.sansCle,
        lignesSansCleB: indexB.sansCle,
        clesMultiplesA: indexA.multiples,
        clesMultiplesB: indexB.multiples,
        ...bilanComparaison,
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

// ---------------------------------------------------------------- Comparaison des valeurs

const RE_DATE = /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.](\d{4}|\d{2})|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/;

/** Deux cellules ont-elles la même valeur, au format près (« 1 000 » = 1000, « 05/01/2024 » = « 2024-01-05 », casse et espaces ignorés) ? */
export function valeursEquivalentes(a: Cellule, b: Cellule): boolean {
  const videA = estValeurVide(a);
  const videB = estValeurVide(b);
  if (videA || videB) return videA && videB;
  const dA = (a as unknown) instanceof Date || RE_DATE.test(String(a).trim()) ? normaliserFormatDate(a) : null;
  const dB = (b as unknown) instanceof Date || RE_DATE.test(String(b).trim()) ? normaliserFormatDate(b) : null;
  if (dA && dB) return dA === dB;
  const nA = typeof a === "number" ? a : dA ? null : parseNombre(a);
  const nB = typeof b === "number" ? b : dB ? null : parseNombre(b);
  if (nA !== null && nB !== null) return Math.abs(nA - nB) <= 1e-9 * Math.max(1, Math.abs(nA), Math.abs(nB));
  const t = (v: Cellule) => String(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  return t(a) === t(b);
}

/**
 * Compare, clé par clé, les colonnes portant le même nom dans A et B.
 * Une ligne par clé : statut (Identique, Différent, Absent de B, Absent de A), colonnes en écart,
 * puis pour chaque colonne comparée la valeur de A, celle de B et, si elle est numérique, l'écart B − A.
 * Quand une clé apparaît plusieurs fois, la première ligne de chaque fichier est comparée.
 */
function comparerValeurs(
  tableA: FichierEntree,
  tableB: FichierEntree,
  idxCleA: number,
  idxCleB: number,
  mapA: Map<string, Cellule[][]>,
  mapB: Map<string, Cellule[][]>,
  colonnesAComparer?: string[]
): { entetes: string[]; corps: Cellule[][]; bilan: Pick<RapportNettoyage, "nbIdentiques" | "nbDifferentes" | "ecartsParColonne" | "colonnesComparees"> } {
  const communes: { nom: string; iA: number; iB: number; numerique: boolean }[] = [];
  tableA.entetes.forEach((col, iA) => {
    if (iA === idxCleA || col === "Fichier Source") return;
    if (colonnesAComparer && !colonnesAComparer.includes(col)) return;
    const iB = tableB.entetes.findIndex((c, j) => j !== idxCleB && c !== "Fichier Source" && normaliserCleColonne(c) === normaliserCleColonne(col));
    if (iB === -1) return;
    const estNum = (corps: Cellule[][], i: number) => {
      let n = 0;
      let num = 0;
      for (const l of corps) {
        const v = l[i];
        if (estValeurVide(v)) continue;
        n++;
        if (typeof v === "number" || (!RE_DATE.test(String(v).trim()) && parseNombre(v) !== null)) num++;
      }
      return n > 0 && num / n >= 0.8;
    };
    communes.push({ nom: col, iA, iB, numerique: estNum(tableA.corps, iA) && estNum(tableB.corps, iB) });
  });

  const nomCle = tableA.entetes[idxCleA] ?? "Clé";
  const entetes = ["Statut", nomCle, "Colonnes en écart"];
  for (const c of communes) {
    entetes.push(`${c.nom} (A)`, `${c.nom} (B)`);
    if (c.numerique) entetes.push(`${c.nom} (écart B − A)`);
  }

  const ecarts = new Map<string, number>(communes.map((c) => [c.nom, 0]));
  let nbIdentiques = 0;
  let nbDifferentes = 0;
  const corps: Cellule[][] = [];
  const ligneComparee = (statut: string, cle: Cellule, la: Cellule[] | null, lb: Cellule[] | null, differences: string[]) => {
    const ligne: Cellule[] = [statut, cle ?? "", differences.join(", ")];
    for (const c of communes) {
      const va = la ? (la[c.iA] ?? "") : "";
      const vb = lb ? (lb[c.iB] ?? "") : "";
      ligne.push(va, vb);
      if (c.numerique) {
        const na = typeof va === "number" ? va : parseNombre(va);
        const nb = typeof vb === "number" ? vb : parseNombre(vb);
        ligne.push(la && lb && na !== null && nb !== null ? Math.round((nb - na) * 1e6) / 1e6 : "");
      }
    }
    corps.push(ligne);
  };

  mapA.forEach((lignesA, cle) => {
    const la = lignesA[0];
    const lb = mapB.get(cle)?.[0];
    if (!lb) {
      ligneComparee("Absent de B", la[idxCleA], la, null, []);
      return;
    }
    const differences = communes.filter((c) => !valeursEquivalentes(la[c.iA], lb[c.iB])).map((c) => c.nom);
    differences.forEach((d) => ecarts.set(d, (ecarts.get(d) ?? 0) + 1));
    if (differences.length) nbDifferentes++;
    else nbIdentiques++;
    ligneComparee(differences.length ? "Différent" : "Identique", la[idxCleA], la, lb, differences);
  });
  mapB.forEach((lignesB, cle) => {
    if (!mapA.has(cle)) ligneComparee("Absent de A", lignesB[0][idxCleB], null, lignesB[0], []);
  });

  // Les écarts d'abord, puis les absences, puis les lignes identiques
  const ordre: Record<string, number> = { "Différent": 0, "Absent de B": 1, "Absent de A": 2, Identique: 3 };
  corps.sort((x, y) => (ordre[String(x[0])] ?? 9) - (ordre[String(y[0])] ?? 9));

  return {
    entetes,
    corps,
    bilan: {
      nbIdentiques,
      nbDifferentes,
      colonnesComparees: communes.map((c) => c.nom),
      ecartsParColonne: [...ecarts.entries()].filter(([, nb]) => nb > 0).map(([colonne, nb]) => ({ colonne, nb })).sort((x, y) => y.nb - x.nb),
    },
  };
}

// ---------------------------------------------------------------- Choix de la clé

export interface SuggestionCles {
  cleA: string;
  cleB: string;
  /** Part des clés distinctes de A retrouvées dans B (0 à 1). */
  taux: number;
}

function valeursDistinctes(f: FichierEntree, idx: number, max = 5000): { valeurs: Set<string>; nbLignes: number } {
  const valeurs = new Set<string>();
  let nbLignes = 0;
  for (const ligne of f.corps.slice(0, max)) {
    const cle = normaliserCle(ligne[idx]);
    if (!cle) continue;
    nbLignes++;
    valeurs.add(cle);
  }
  return { valeurs, nbLignes };
}

/**
 * Propose le couple de colonnes qui rapproche le mieux les deux fichiers : celui dont les valeurs se retrouvent
 * le plus d'un fichier à l'autre, en préférant les colonnes aux valeurs uniques (identifiants, codes) et les noms proches.
 */
export function suggererCles(tableA: FichierEntree, tableB: FichierEntree): SuggestionCles | null {
  const profilsB = tableB.entetes.map((col, i) => ({ col, ...valeursDistinctes(tableB, i) }));
  let meilleure: (SuggestionCles & { score: number }) | null = null;
  tableA.entetes.forEach((colA, iA) => {
    if (colA === "Fichier Source") return;
    const pa = valeursDistinctes(tableA, iA);
    if (pa.valeurs.size < 2) return;
    const uniciteA = pa.valeurs.size / Math.max(1, pa.nbLignes);
    for (const pb of profilsB) {
      if (pb.col === "Fichier Source" || pb.valeurs.size < 2) continue;
      let communs = 0;
      const [petit, grand] = pa.valeurs.size <= pb.valeurs.size ? [pa.valeurs, pb.valeurs] : [pb.valeurs, pa.valeurs];
      petit.forEach((v) => {
        if (grand.has(v)) communs++;
      });
      if (!communs) continue;
      const recouvrement = communs / Math.min(pa.valeurs.size, pb.valeurs.size);
      const uniciteB = pb.valeurs.size / Math.max(1, pb.nbLignes);
      const memeNom = normaliserCleColonne(colA) === normaliserCleColonne(pb.col) ? 0.15 : 0;
      const score = recouvrement * (0.4 + 0.6 * Math.max(uniciteA, uniciteB)) + memeNom;
      if (!meilleure || score > meilleure.score) meilleure = { cleA: colA, cleB: pb.col, taux: communs / pa.valeurs.size, score };
    }
  });
  if (!meilleure) return null;
  const { cleA, cleB, taux } = meilleure as SuggestionCles & { score: number };
  return { cleA, cleB, taux };
}

/** Aperçu avant lancement : part des lignes de A dont la clé existe dans B, et inversement. */
export function apercuCorrespondance(tableA: FichierEntree, tableB: FichierEntree, cleA: string, cleB: string): { partA: number; partB: number } | null {
  const iA = tableA.entetes.indexOf(cleA);
  const iB = tableB.entetes.indexOf(cleB);
  if (iA === -1 || iB === -1) return null;
  const clesA = new Set(tableA.corps.map((l) => normaliserCle(l[iA])).filter(Boolean));
  const clesB = new Set(tableB.corps.map((l) => normaliserCle(l[iB])).filter(Boolean));
  const part = (corps: Cellule[][], i: number, autres: Set<string>) => {
    let n = 0;
    let ok = 0;
    for (const l of corps) {
      const c = normaliserCle(l[i]);
      if (!c) continue;
      n++;
      if (autres.has(c)) ok++;
    }
    return n ? ok / n : 0;
  };
  return { partA: part(tableA.corps, iA, clesB), partB: part(tableB.corps, iB, clesA) };
}

/** Colonnes de A qui ont un équivalent de même nom dans B (hors clés) : celles que le mode « comparaison » peut comparer. */
export function colonnesComparables(tableA: FichierEntree, tableB: FichierEntree, cleA: string, cleB: string): string[] {
  const nomsB = new Set(tableB.entetes.filter((c) => c !== cleB && c !== "Fichier Source").map(normaliserCleColonne));
  return tableA.entetes.filter((c) => c !== cleA && c !== "Fichier Source" && nomsB.has(normaliserCleColonne(c)));
}
