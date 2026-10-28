// src/lib/analyse/utils.ts

export type Cellule = string | number | boolean | null | undefined;

export interface StatsNumeriques {
  n: number;
  moyenne: number | null;
  mediane: number | null;
  ecartType: number | null;
  min: number | null;
  max: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  atypiques: number;
}

/**
 * Normalise une chaîne de caractères :
 * Supprime le BOM UTF-8, retire les accents et passe en minuscules.
 */
export function normaliserTexte(txt: string | null | undefined): string {
  if (!txt) return "";
  return String(txt)
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Nettoie une liste d'en-têtes en purgeant le BOM et les guillemets résiduels.
 */
export function nettoyerEntetes(entetes: string[]): string[] {
  return entetes.map((h) =>
    String(h ?? "")
      .replace(/^\uFEFF/, "")
      .replace(/^["']|["']$/g, "")
      .trim()
  );
}

/**
 * Détecte si une valeur ou une ligne correspond à une ligne de calcul parasite
 * (Total, Sous-total, Variation, Moyenne, Bilan).
 */
export function estLigneTotal(ligne: Cellule[]): boolean {
  if (!ligne || ligne.length === 0) return true;
  const premierNonVide = ligne.find((c) => !estValeurVide(c));
  if (!premierNonVide) return true;
  const s = normaliserTexte(String(premierNonVide));
  return /^(total|sous[- ]?total|variation|moyenne|ensemble|general|bilan|somme|ecart)/i.test(s);
}

/**
 * Vérifie si une cellule est vide ou correspond à une mention d'absence de donnée
 * (ex: "-", "—", "ND", "N/A", "SO").
 */
export function estValeurVide(v: Cellule): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v)
    .replace(/^\uFEFF/, "")
    .replace(/["'«»“”]/g, "")
    .trim();
  return (
    s === "" ||
    s === "-" ||
    s === "—" ||
    s === "–" ||
    s === "." ||
    s === ".." ||
    /^(n\/?a|na|nan|null|undefined|none|vide|missing|n\.?d\.?|nd|s\/?o|so)$/i.test(s)
  );
}

/**
 * Convertit toute cellule en nombre exploitable.
 * Gère les guillemets, devises, espaces insécables, pourcentages et séparateurs décimaux.
 */
export function parseNombre(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return isNaN(val) ? null : val;

  let str = String(val).replace(/^\uFEFF/, "").trim();
  if (str === "") return null;

  // 1. Purge des guillemets (ex: "-402,6" -> -402,6)
  str = str.replace(/["'«»“”]/g, "").trim();

  // 2. Gestion de la notation comptable négative entre parenthèses : (1 250) -> -1250
  if (str.startsWith("(") && str.endsWith(")")) {
    str = "-" + str.slice(1, -1);
  }

  // 3. Normalisation des tirets négatifs (Unicode minus, en-dash, em-dash)
  str = str.replace(/^[−–—]\s*/, "-");

  // 4. Nettoyage des devises, unités monétaires et pourcentages
  str = str.replace(/\b(FCFA|CFA|XOF|EUR|USD|GBP)\b/gi, "").trim();
  str = str.replace(/[€$£%]/g, "").trim();

  // 5. Suppression des espaces standards et insécables (\u00A0, \u202F)
  str = str.replace(/[\s\u00A0\u202F]+/g, "");

  if (str === "" || str === "-" || str === "+" || str === "—" || str === ".") return null;

  // 6. Normalisation de la virgule et du point décimal
  if (str.includes(",") && str.includes(".")) {
    if (str.lastIndexOf(",") < str.lastIndexOf(".")) {
      str = str.replace(/,/g, "");
    } else {
      str = str.replace(/\./g, "").replace(/,/g, ".");
    }
  } else if ((str.match(/,/g) || []).length > 1) {
    str = str.replace(/,/g, "");
  } else if ((str.match(/\./g) || []).length > 1) {
    str = str.replace(/\./g, "");
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  }

  const num = Number(str);
  return isNaN(num) ? null : num;
}

export function versNombre(v: Cellule): number | null {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  return parseNombre(v);
}

export function versNumeriques(valeurs: Cellule[]): number[] {
  return valeurs.map(versNombre).filter((n): n is number => n !== null);
}

export function arrondir(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Détermine si une colonne est un identifiant / numéro de référence
 * et ne doit jamais faire l'objet de calculs additifs (sommes, moyennes, prévisions).
 * Protège les colonnes de montants financiers d'une fausse classification.
 */
export function estColonneIdentifiant(nomColonne: string, valeurs: Cellule[]): boolean {
  const nomNorm = normaliserTexte(nomColonne);

  // 1. Règle absolue : si le nom contient des mots-clés de métriques financières, ce n'est JAMAIS un identifiant
  const motifMesure =
    /\b(prix|cout|couts|revenu|revenus|montant|montants|budget|chiffre|ca|marge|benefice|valeur|valeurs|effectif|effectifs|poids|superficie|quantite|volume|solde|score|depense|depenses|salaire|salaires|taux|ratio|pourcentage)\b/i;
  if (motifMesure.test(nomNorm)) {
    return false;
  }

  // 2. Si le nom contient une unité monétaire explicite, ce n'est pas un identifiant
  if (/(fcfa|cfa|xof|eur|usd|gbp|[€$£%])/i.test(nomNorm)) {
    return false;
  }

  // 3. Mots-clés universels d'identification
  const motifIdentifiant =
    /(^|[^a-z0-9])(id|uuid|num|numero|n°|no|matricule|code|ref|reference|dossier|demande|parcelle|compte|client|ordre|rang|index|sequence|tel|telephone|postal|zip|cin|cni)([^a-z0-9]|$)/i;
  if (motifIdentifiant.test(nomNorm)) {
    return true;
  }

  // 4. Détection statistique : entiers séquentiels à forte unicité (ex: clés 1001, 1002...)
  const nonVides = valeurs.filter((v) => !estValeurVide(v));
  if (nonVides.length >= 10) {
    const uniques = new Set(nonVides.map((v) => String(v).trim()));
    const tauxUnicite = uniques.size / nonVides.length;

    if (tauxUnicite >= 0.9) {
      const echantillon = nonVides.slice(0, 50);
      const nombres = echantillon.map(versNombre);

      const tousEntiersPositifs = nombres.every(
        (n) => n !== null && Number.isInteger(n) && n >= 0
      );

      if (tousEntiersPositifs) {
        // Exclut formellement les années (1900 à 2100)
        const sontDesAnnees = nombres.every((n) => n !== null && n >= 1900 && n <= 2100);
        if (sontDesAnnees) return false;

        // Présence de zéros initiaux (ex: "00123") typique des codes
        const aZerosInitiaux = echantillon.some((v) => {
          const s = String(v).trim();
          return s.startsWith("0") && s.length > 1;
        });
        if (aZerosInitiaux) return true;

        // Entiers de numérotation séquentielle courte
        const maxVal = Math.max(...(nombres as number[]));
        if (maxVal <= nonVides.length * 5) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Détecte si une colonne représente un axe temporel (date, année, mois).
 * Gère notamment les colonnes nommées "INDICATEUR" de data.gouv.ci contenant des années.
 */
export function estColonneTemporelle(nomColonne: string, valeurs: Cellule[]): boolean {
  const nomNorm = normaliserTexte(nomColonne);
  const nonVides = valeurs.filter((v) => !estValeurVide(v));
  if (nonVides.length === 0) return false;

  const nbAnnees = nonVides.filter((v) => {
    const s = String(v).replace(/["'«»“”]/g, "").trim();
    return /^(19|20)\d{2}$/.test(s);
  }).length;

  const nbDates = nonVides.filter((v) => {
    const s = String(v).replace(/["'«»“”]/g, "").trim();
    return (/[\/-]|T/.test(s) && !Number.isNaN(Date.parse(s))) || /^(19|20)\d{2}$/.test(s);
  }).length;

  if (nomNorm === "indicateur" && nbAnnees / nonVides.length >= 0.7) {
    return true;
  }

  const aMotCleDate = /\b(annee|an|annees|date|dates|periode|periodes|mois|trimestre|semaine|exercice)\b/i.test(
    nomNorm
  );
  if (aMotCleDate) return true;
  if (nbDates / nonVides.length >= 0.6) return true;

  return false;
}

export function detecterUniteColonne(nomColonne: string, valeursBrutes: Cellule[]): string | null {
  const nomNorm = nomColonne.toUpperCase();
  if (nomNorm.includes("%")) return "%";
  if (nomNorm.includes("FCFA") || nomNorm.includes("CFA")) return "FCFA";
  if (nomNorm.includes("MIL") || nomNorm.includes("MILLIARD")) return "milliards";
  if (nomNorm.includes("€") || nomNorm.includes("EUR")) return "€";
  if (nomNorm.includes("$") || nomNorm.includes("USD")) return "$";

  const echantillon = valeursBrutes
    .filter((v) => !estValeurVide(v))
    .slice(0, 50)
    .map((v) => String(v).trim().toUpperCase());

  if (echantillon.length === 0) return null;

  let comptePourcentage = 0;
  let compteFCFA = 0;
  let compteEuro = 0;
  let compteDollar = 0;

  for (const v of echantillon) {
    if (v.includes("%")) comptePourcentage++;
    else if (v.includes("FCFA") || v.includes("CFA")) compteFCFA++;
    else if (v.includes("€") || v.includes("EUR")) compteEuro++;
    else if (v.includes("$") || v.includes("USD")) compteDollar++;
  }

  const seuil = echantillon.length * 0.4;
  if (comptePourcentage >= seuil) return "%";
  if (compteFCFA >= seuil) return "FCFA";
  if (compteEuro >= seuil) return "€";
  if (compteDollar >= seuil) return "$";

  return null;
}

export function formaterValeurAvecUnite(valeur: number, unite: string | null): string {
  const valArrondie = Math.round(valeur * 100) / 100;
  const chaineFormatee = valArrondie.toLocaleString("fr-FR");

  if (!unite) return chaineFormatee;
  if (unite === "%") return `${chaineFormatee} %`;
  if (unite === "FCFA") return `${chaineFormatee} FCFA`;
  if (unite === "milliards") return `${chaineFormatee} Mrd`;
  if (unite === "€") return `${chaineFormatee} €`;
  if (unite === "$") return `$ ${chaineFormatee}`;

  return `${chaineFormatee} ${unite}`;
}

export function percentile(trie: number[], p: number): number {
  const idx = p * (trie.length - 1);
  const bas = Math.floor(idx);
  const haut = Math.ceil(idx);
  if (bas === haut) return trie[bas];
  return trie[bas] + (trie[haut] - trie[bas]) * (idx - bas);
}

export function statistiquesNumeriques(valeurs: number[]): StatsNumeriques {
  if (!valeurs.length) {
    return {
      n: 0,
      moyenne: null,
      mediane: null,
      ecartType: null,
      min: null,
      max: null,
      q1: null,
      q3: null,
      iqr: null,
      atypiques: 0,
    };
  }

  const trie = [...valeurs].sort((a, b) => a - b);
  const n = trie.length;
  const moyenne = trie.reduce((s, x) => s + x, 0) / n;
  const variance = trie.reduce((s, x) => s + (x - moyenne) ** 2, 0) / n;

  const q1 = percentile(trie, 0.25);
  const q3 = percentile(trie, 0.75);
  const iqr = q3 - q1;
  const atypiques = trie.filter((x) => x < q1 - 1.5 * iqr || x > q3 + 1.5 * iqr).length;

  return {
    n,
    moyenne: arrondir(moyenne),
    mediane: arrondir(percentile(trie, 0.5)),
    ecartType: arrondir(Math.sqrt(variance)),
    min: arrondir(trie[0]),
    max: arrondir(trie[n - 1]),
    q1: arrondir(q1),
    q3: arrondir(q3),
    iqr: arrondir(iqr),
    atypiques,
  };
}