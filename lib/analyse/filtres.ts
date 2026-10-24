import { parseNombre } from './utils';

export interface ConditionFiltre {
  colonne: string;
  operateur: 'egal' | 'different' | 'contient' | 'superieur' | 'inferieur' | 'entre';
  valeur: any;
  valeurFin?: any; // Pour l'opérateur 'entre'
}

export interface DefinitionColonneCalculee {
  nomNouvelleColonne: string;
  type: 'operation' | 'extraction_date' | 'tranches';
  colonneA: string;
  colonneB?: string;
  operateur?: '+' | '-' | '*' | '/' | 'ratio';
  uniteDate?: 'annee' | 'mois' | 'jour' | 'annee_mois';
  tranches?: { min: number; max: number; label: string }[];
}

/**
 * Applique une liste de filtres sur les données
 */
export function appliquerFiltres(
  donnees: Record<string, any>[],
  filtres: ConditionFiltre[]
): Record<string, any>[] {
  if (!filtres || filtres.length === 0) return donnees;

  return donnees.filter((ligne) => {
    return filtres.every((f) => {
      const valBrute = ligne[f.colonne];
      const valNum = parseNombre(valBrute);

      switch (f.operateur) {
        case 'egal':
          return String(valBrute ?? '').toLowerCase() === String(f.valeur ?? '').toLowerCase();
        case 'different':
          return String(valBrute ?? '').toLowerCase() !== String(f.valeur ?? '').toLowerCase();
        case 'contient':
          return String(valBrute ?? '').toLowerCase().includes(String(f.valeur ?? '').toLowerCase());
        case 'superieur':
          return valNum !== null && valNum >= Number(f.valeur);
        case 'inferieur':
          return valNum !== null && valNum <= Number(f.valeur);
        case 'entre':
          return valNum !== null && valNum >= Number(f.valeur) && valNum <= Number(f.valeurFin);
        default:
          return true;
      }
    });
  });
}

/**
 * Ajoute une colonne calculée au jeu de données
 */
export function ajouterColonneCalculee(
  donnees: Record<string, any>[],
  definition: DefinitionColonneCalculee
): Record<string, any>[] {
  return donnees.map((ligne) => {
    const nouvelleLigne = { ...ligne };
    const valA = parseNombre(ligne[definition.colonneA]);

    if (definition.type === 'operation' && definition.colonneB && definition.operateur) {
      const valB = parseNombre(ligne[definition.colonneB]);
      if (valA === null || valB === null) {
        nouvelleLigne[definition.nomNouvelleColonne] = null;
      } else {
        switch (definition.operateur) {
          case '+': nouvelleLigne[definition.nomNouvelleColonne] = valA + valB; break;
          case '-': nouvelleLigne[definition.nomNouvelleColonne] = valA - valB; break;
          case '*': nouvelleLigne[definition.nomNouvelleColonne] = valA * valB; break;
          case '/': nouvelleLigne[definition.nomNouvelleColonne] = valB !== 0 ? valA / valB : null; break;
          case 'ratio': nouvelleLigne[definition.nomNouvelleColonne] = valB !== 0 ? (valA / valB) * 100 : null; break;
        }
      }
    } else if (definition.type === 'extraction_date' && definition.uniteDate) {
      const dateVal = new Date(ligne[definition.colonneA]);
      if (isNaN(dateVal.getTime())) {
        nouvelleLigne[definition.nomNouvelleColonne] = null;
      } else {
        if (definition.uniteDate === 'annee') nouvelleLigne[definition.nomNouvelleColonne] = dateVal.getFullYear();
        if (definition.uniteDate === 'mois') nouvelleLigne[definition.nomNouvelleColonne] = dateVal.getMonth() + 1;
        if (definition.uniteDate === 'jour') nouvelleLigne[definition.nomNouvelleColonne] = dateVal.getDate();
        if (definition.uniteDate === 'annee_mois') {
          nouvelleLigne[definition.nomNouvelleColonne] = `${dateVal.getFullYear()}-${String(dateVal.getMonth() + 1).padStart(2, '0')}`;
        }
      }
    }

    return nouvelleLigne;
  });
}