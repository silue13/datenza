import { parseNombre } from './utils';
import { convertirDate } from './detection';

export interface ConditionFiltre {
  colonne: string;
  operateur: 'egal' | 'different' | 'contient' | 'superieur' | 'inferieur' | 'entre';
  valeur: any;
  valeurFin?: any;
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
        case 'superieur': {
          const seuil = parseNombre(f.valeur);
          return valNum !== null && seuil !== null && valNum >= seuil;
        }
        case 'inferieur': {
          const seuil = parseNombre(f.valeur);
          return valNum !== null && seuil !== null && valNum <= seuil;
        }
        case 'entre': {
          const seuilMin = parseNombre(f.valeur);
          const seuilMax = parseNombre(f.valeurFin);
          return valNum !== null && seuilMin !== null && seuilMax !== null && valNum >= seuilMin && valNum <= seuilMax;
        }
        default:
          return true;
      }
    });
  });
}

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
      const rawDate = ligne[definition.colonneA];
      const dateVal = convertirDate(rawDate) ?? (rawDate instanceof Date ? rawDate : new Date(rawDate));
      if (!dateVal || isNaN(dateVal.getTime())) {
        nouvelleLigne[definition.nomNouvelleColonne] = null;
      } else {
        if (definition.uniteDate === 'annee') nouvelleLigne[definition.nomNouvelleColonne] = dateVal.getFullYear();
        if (definition.uniteDate === 'mois') nouvelleLigne[definition.nomNouvelleColonne] = dateVal.getMonth() + 1;
        if (definition.uniteDate === 'jour') nouvelleLigne[definition.nomNouvelleColonne] = dateVal.getDate();
        if (definition.uniteDate === 'annee_mois') {
          nouvelleLigne[definition.nomNouvelleColonne] = `${dateVal.getFullYear()}-${String(dateVal.getMonth() + 1).padStart(2, '0')}`;
        }
      }
    } else if (definition.type === 'tranches' && definition.tranches) {
      if (valA === null) {
        nouvelleLigne[definition.nomNouvelleColonne] = null;
      } else {
        const trancheTrouvee = definition.tranches.find((t) => valA >= t.min && valA <= t.max);
        nouvelleLigne[definition.nomNouvelleColonne] = trancheTrouvee ? trancheTrouvee.label : 'Autre';
      }
    }

    return nouvelleLigne;
  });
}