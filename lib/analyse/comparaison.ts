// lib/analyse/comparaison.ts — assemble plusieurs fichiers pour les comparer (mode « benchmark » de l'analyse).
import { estValeurVide, parseNombre, type Cellule } from "./utils";
import { normaliserCle, normaliserCleColonne, valeursEquivalentes } from "./fusion";
import { appliquerCorrespondance, suggererCorrespondance } from "./correspondance";

export interface FichierAComparer {
  nom: string;
  entetes: string[];
  corps: Cellule[][];
}

export interface ResultatComparaison {
  entetes: string[];
  corps: Cellule[][];
  /** Noms de source utilisés (un nom répété est numéroté : « ventes.xlsx (2) »). */
  sources: string[];
  /** Colonnes reconnues comme identiques malgré une écriture différente (« Montant » / « montant_ »). */
  colonnesAlignees: { nomFinal: string; variantes: string[] }[];
  /** Colonnes écartées parce qu'elles manquent dans au moins un fichier. */
  colonnesIgnorees: string[];
}

/**
 * Empile les fichiers sur leurs colonnes communes, avec une colonne « Fichier Source ».
 * Les noms de colonnes sont rapprochés sans tenir compte de la casse, des accents, des espaces ni de la ponctuation.
 * Renvoie null si aucune colonne n'est commune à tous les fichiers.
 */
export function assemblerComparaison(fichiersBruts: FichierAComparer[], rapprocherSynonymes = true): ResultatComparaison | null {
  if (fichiersBruts.length < 2) return null;
  // Colonnes de même sens sous un autre nom (« CA » / « Chiffre d'affaires ») : renommées comme dans le premier fichier
  const synonymes: { nomFinal: string; variantes: string[] }[] = [];
  const fichiers = rapprocherSynonymes
    ? fichiersBruts.map((f, i) => {
        if (i === 0) return f;
        const corr = suggererCorrespondance(fichiersBruts[0], f);
        Object.entries(corr).forEach(([ref, col]) => {
          if (col && col !== ref) {
            const e = synonymes.find((x) => x.nomFinal === ref);
            if (e) e.variantes.push(col);
            else synonymes.push({ nomFinal: ref, variantes: [ref, col] });
          }
        });
        return appliquerCorrespondance(f, corr);
      })
    : fichiersBruts;
  const cles = (f: FichierAComparer) => new Map(f.entetes.filter((h) => h !== "Fichier Source").map((h, i) => [normaliserCleColonne(h) || `#${i}`, h]));
  const parFichier = fichiers.map(cles);
  const communes = [...parFichier[0].keys()].filter((k) => parFichier.every((m) => m.has(k)));
  if (!communes.length) return null;

  const nomsFinaux = communes.map((k) => parFichier[0].get(k) as string);
  const colonnesAlignees = communes
    .map((k, i) => {
      const variantes = new Set(parFichier.map((m) => m.get(k) as string));
      synonymes.find((x) => x.nomFinal === nomsFinaux[i])?.variantes.forEach((v) => variantes.add(v));
      return { nomFinal: nomsFinaux[i], variantes: [...variantes] };
    })
    .filter((c) => c.variantes.length > 1);
  const ignorees = new Set<string>();
  parFichier.forEach((m) => m.forEach((nom, k) => !communes.includes(k) && ignorees.add(nom)));

  const vus = new Map<string, number>();
  const sources = fichiers.map((f) => {
    const n = (vus.get(f.nom) ?? 0) + 1;
    vus.set(f.nom, n);
    return n > 1 ? `${f.nom} (${n})` : f.nom;
  });

  const corps: Cellule[][] = [];
  fichiers.forEach((f, iF) => {
    const indices = communes.map((k) => f.entetes.indexOf(parFichier[iF].get(k) as string));
    for (const ligne of f.corps) corps.push([sources[iF], ...indices.map((i) => (i === -1 ? "" : (ligne[i] ?? "")))]);
  });

  return { entetes: ["Fichier Source", ...nomsFinaux], corps, sources, colonnesAlignees, colonnesIgnorees: [...ignorees] };
}

// ---------------------------------------------------------------- Comparaison ligne à ligne de plusieurs fichiers

export interface BilanMultiComparaison {
  fichiers: string[];
  nbCles: number;
  /** Clés présentes dans tous les fichiers. */
  partout: number;
  /** Clés présentes dans un seul fichier, par fichier. */
  uniques: { fichier: string; nb: number }[];
  /** Absentes du premier fichier mais présentes dans le dernier. */
  apparues: number;
  /** Présentes dans le premier fichier mais absentes du dernier. */
  disparues: number;
  colonnes: string[];
  /** Pour chaque colonne comparée : nombre de clés dont la valeur change d'un fichier à l'autre. */
  changementsParColonne: { colonne: string; nb: number }[];
  /** Clés présentes plusieurs fois dans un même fichier (la première ligne est retenue). */
  clesEnDouble: number;
}

export interface ResultatMultiComparaison {
  entetes: string[];
  corps: Cellule[][];
  bilan: BilanMultiComparaison;
}

const sansExtension = (nom: string) => nom.replace(/\.[^/.]+$/, "");

/** Colonnes (hors clés) présentes sous le même nom dans au moins deux fichiers. */
export function colonnesCommunesMulti(fichiers: FichierAComparer[], cles: string[]): string[] {
  const vus = new Map<string, { nom: string; nb: number }>();
  fichiers.forEach((f, i) => {
    const deja = new Set<string>();
    f.entetes.forEach((h) => {
      if (h === cles[i] || h === "Fichier Source") return;
      const k = normaliserCleColonne(h);
      if (!k || deja.has(k)) return;
      deja.add(k);
      const e = vus.get(k);
      if (e) e.nb++;
      else vus.set(k, { nom: h, nb: 1 });
    });
  });
  return [...vus.values()].filter((e) => e.nb >= 2).map((e) => e.nom);
}

/**
 * Rapproche plusieurs fichiers ligne à ligne sur une clé (une colonne par fichier).
 * Une ligne par clé : statut, nombre de fichiers où elle figure, présence dans chaque fichier, colonnes qui changent,
 * puis la valeur de chaque colonne comparée dans chaque fichier et, si elle est numérique, l'évolution du premier au dernier fichier.
 * L'ordre des fichiers est celui de la liste (par exemple chronologique : janvier, février, mars).
 */
export function comparerPlusieursFichiers(fichiers: FichierAComparer[], cles: string[], colonnes?: string[]): ResultatMultiComparaison {
  const vus = new Map<string, number>();
  const noms = fichiers.map((f) => {
    const base = sansExtension(f.nom);
    const n = (vus.get(base) ?? 0) + 1;
    vus.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });

  let clesEnDouble = 0;
  const ordre: string[] = [];
  const brutes = new Map<string, Cellule>();
  const index = fichiers.map((f, i) => {
    const iCle = f.entetes.indexOf(cles[i]);
    const map = new Map<string, Cellule[]>();
    if (iCle === -1) return map;
    for (const ligne of f.corps) {
      const k = normaliserCle(ligne[iCle]);
      if (!k) continue;
      if (map.has(k)) {
        clesEnDouble++;
        continue;
      }
      map.set(k, ligne);
      if (!brutes.has(k)) {
        brutes.set(k, ligne[iCle]);
        ordre.push(k);
      }
    }
    return map;
  });

  const choisies = (colonnes ?? colonnesCommunesMulti(fichiers, cles)).map((c) => ({ nom: c, k: normaliserCleColonne(c) }));
  const comparees = choisies.map((c) => {
    const indices = fichiers.map((f, i) => f.entetes.findIndex((h) => h !== cles[i] && h !== "Fichier Source" && normaliserCleColonne(h) === c.k));
    let n = 0;
    let num = 0;
    fichiers.forEach((f, i) => {
      if (indices[i] === -1) return;
      for (const l of f.corps) {
        const v = l[indices[i]];
        if (estValeurVide(v)) continue;
        n++;
        if (typeof v === "number" || (!/^\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}/.test(String(v).trim()) && parseNombre(v) !== null)) num++;
      }
    });
    return { nom: c.nom, indices, numerique: n > 0 && num / n >= 0.8 };
  });

  const entetes = [cles[0] || "Clé", "Statut", "Nombre de fichiers", ...noms.map((n) => `Dans ${n}`), "Colonnes qui changent"];
  for (const c of comparees) {
    noms.forEach((n) => entetes.push(`${c.nom} (${n})`));
    if (c.numerique) entetes.push(`${c.nom} : évolution (${noms[noms.length - 1]} − ${noms[0]})`);
  }

  const dernier = fichiers.length - 1;
  let partout = 0;
  let apparues = 0;
  let disparues = 0;
  const uniques = noms.map((n) => ({ fichier: n, nb: 0 }));
  const changements = new Map<string, number>(comparees.map((c) => [c.nom, 0]));
  const corps: Cellule[][] = [];

  for (const k of ordre) {
    const lignes = index.map((m) => m.get(k) ?? null);
    const presents = lignes.map((l) => l !== null);
    const nb = presents.filter(Boolean).length;
    let statut: string;
    if (nb === fichiers.length) {
      statut = "Partout";
      partout++;
    } else if (nb === 1) {
      const i = presents.indexOf(true);
      statut = `Seulement dans ${noms[i]}`;
      uniques[i].nb++;
    } else if (!presents[0] && presents[dernier]) statut = "Apparue";
    else if (presents[0] && !presents[dernier]) statut = "Disparue";
    else statut = "Partielle";
    if (!presents[0] && presents[dernier]) apparues++;
    if (presents[0] && !presents[dernier]) disparues++;

    const changent: string[] = [];
    const valeurs: Cellule[] = [];
    for (const c of comparees) {
      const vals = lignes.map((l, i) => (l && c.indices[i] !== -1 ? (l[c.indices[i]] ?? "") : ""));
      const renseignees = vals.filter((v, i) => lignes[i] && c.indices[i] !== -1 && !estValeurVide(v));
      if (renseignees.length >= 2 && renseignees.some((v) => !valeursEquivalentes(v, renseignees[0]))) {
        changent.push(c.nom);
        changements.set(c.nom, (changements.get(c.nom) ?? 0) + 1);
      }
      valeurs.push(...vals);
      if (c.numerique) {
        const a = typeof vals[0] === "number" ? vals[0] : parseNombre(vals[0]);
        const b = typeof vals[dernier] === "number" ? vals[dernier] : parseNombre(vals[dernier]);
        valeurs.push(lignes[0] && lignes[dernier] && a !== null && b !== null ? Math.round((b - a) * 1e6) / 1e6 : "");
      }
    }
    corps.push([brutes.get(k) ?? k, statut, nb, ...presents.map((p) => (p ? "Oui" : "Non")), changent.join(", "), ...valeurs]);
  }

  // Les clés qui posent question d'abord : celles qui changent, puis les absences, puis les stables
  const rang = (l: Cellule[]) => (l[1] === "Partout" ? (l[3 + fichiers.length] ? 0 : 3) : l[1] === "Partielle" ? 2 : 1);
  corps.sort((x, y) => rang(x) - rang(y));

  return {
    entetes,
    corps,
    bilan: {
      fichiers: noms,
      nbCles: ordre.length,
      partout,
      uniques,
      apparues,
      disparues,
      colonnes: comparees.map((c) => c.nom),
      changementsParColonne: [...changements.entries()].filter(([, n]) => n > 0).map(([colonne, nb]) => ({ colonne, nb })).sort((a, b) => b.nb - a.nb),
      clesEnDouble,
    },
  };
}
