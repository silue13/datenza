export interface SuggestionNettoyage {
  type: 'casse_variante' | 'espaces_inutiles' | 'doublon_ligne';
  colonne?: string;
  valeurOriginale?: any;
  valeurSuggeree?: any;
  occurrences?: number;
  indicesLignes?: number[];
  description: string;
}

export interface RapportNettoyage {
  totalDoublonsLignes: number;
  suggestionsParColonne: Record<string, SuggestionNettoyage[]>;
}

/**
 * Normalise un texte (supprime accents, espaces superflus et passe en minuscule)
 */
function normaliserTexteInterne(val: string): string {
  if (!val) return '';
  return val
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Analyse un tableau d'objets (données brutes) et détecte les opportunités de nettoyage
 */
export function analyserNettoyage(donnees: Record<string, any>[]): RapportNettoyage {
  if (!donnees || donnees.length === 0) {
    return { totalDoublonsLignes: 0, suggestionsParColonne: {} };
  }

  const colonnes = Object.keys(donnees[0]);
  const suggestionsParColonne: Record<string, SuggestionNettoyage[]> = {};

  // 1. Détection des variantes de texte (ex: "Abidjan", "abidjan", " ABIDJAN ")
  for (const col of colonnes) {
    const suggestionsCol: SuggestionNettoyage[] = [];
    const groupes = new Map<string, Map<string, number>>();

    donnees.forEach((ligne) => {
      const val = ligne[col];
      if (typeof val === 'string' && val.trim() !== '') {
        const cleNormalisee = normaliserTexteInterne(val);
        if (!groupes.has(cleNormalisee)) {
          groupes.set(cleNormalisee, new Map());
        }
        const mapVariantes = groupes.get(cleNormalisee)!;
        mapVariantes.set(val, (mapVariantes.get(val) || 0) + 1);
      }
    });

    groupes.forEach((mapVariantes) => {
      if (mapVariantes.size > 1) {
        let varianteDominante = '';
        let maxCount = -1;

        mapVariantes.forEach((count, variante) => {
          if (count > maxCount) {
            maxCount = count;
            varianteDominante = variante;
          }
        });

        mapVariantes.forEach((count, variante) => {
          if (variante !== varianteDominante) {
            suggestionsCol.push({
              type: 'casse_variante',
              colonne: col,
              valeurOriginale: variante,
              valeurSuggeree: varianteDominante,
              occurrences: count,
              description: `Harmoniser "${variante}" vers "${varianteDominante}" (${count} occurrence(s))`
            });
          }
        });
      }
    });

    if (suggestionsCol.length > 0) {
      suggestionsParColonne[col] = suggestionsCol;
    }
  }

  // 2. Détection des doublons de lignes complètes
  const empreintesLignes = new Map<string, number[]>();
  donnees.forEach((ligne, index) => {
    const empreinte = JSON.stringify(ligne);
    if (!empreintesLignes.has(empreinte)) {
      empreintesLignes.set(empreinte, []);
    }
    empreintesLignes.get(empreinte)!.push(index);
  });

  let totalDoublonsLignes = 0;
  empreintesLignes.forEach((indices) => {
    if (indices.length > 1) {
      totalDoublonsLignes += indices.length - 1;
    }
  });

  return {
    totalDoublonsLignes,
    suggestionsParColonne
  };
}

/**
 * Applique une liste de corrections validées par l'utilisateur sur les données
 */
export function appliquerCorrections(
  donnees: Record<string, any>[],
  corrections: { colonne: string; valeurOriginale: any; valeurSuggeree: any }[]
): Record<string, any>[] {
  return donnees.map((ligne) => {
    const nouvelleLigne = { ...ligne };
    for (const corr of corrections) {
      if (nouvelleLigne[corr.colonne] === corr.valeurOriginale) {
        nouvelleLigne[corr.colonne] = corr.valeurSuggeree;
      }
    }
    return nouvelleLigne;
  });
}