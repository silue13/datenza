import { parseNombre, type Cellule, type LigneObjet } from './utils';
import { convertirDate } from './detection';

export interface ConditionFiltre {
  colonne: string;
  operateur: 'egal' | 'different' | 'contient' | 'superieur' | 'inferieur' | 'entre';
  valeur: Cellule;
  valeurFin?: Cellule;
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

/** Valeur comparable : nombre, sinon date (en millisecondes). Permet de filtrer « après le 01/03/2024 ». */
function comparable(v: Cellule): number | null {
  const n = parseNombre(v);
  if (n !== null) return n;
  const d = convertirDate(v);
  return d ? d.getTime() : null;
}

const texte = (v: Cellule) => String(v ?? '').trim().toLowerCase();

/** Égalité tolérante : « 10 », « 10,0 » et 10 sont égaux ; le texte est comparé sans tenir compte de la casse. */
function egal(a: Cellule, b: Cellule): boolean {
  if (texte(a) === texte(b)) return true;
  const na = parseNombre(a);
  const nb = parseNombre(b);
  return na !== null && nb !== null && na === nb;
}

export function appliquerFiltres(
  donnees: LigneObjet[],
  filtres: ConditionFiltre[]
): LigneObjet[] {
  if (!filtres || filtres.length === 0) return donnees;

  return donnees.filter((ligne) => {
    return filtres.every((f) => {
      const valBrute = ligne[f.colonne];
      const valNum = comparable(valBrute);

      switch (f.operateur) {
        case 'egal':
          return egal(valBrute, f.valeur);
        case 'different':
          return !egal(valBrute, f.valeur);
        case 'contient':
          return texte(valBrute).includes(texte(f.valeur));
        case 'superieur': {
          const seuil = comparable(f.valeur);
          return valNum !== null && seuil !== null && valNum >= seuil;
        }
        case 'inferieur': {
          const seuil = comparable(f.valeur);
          return valNum !== null && seuil !== null && valNum <= seuil;
        }
        case 'entre': {
          const seuilMin = comparable(f.valeur);
          const seuilMax = comparable(f.valeurFin);
          return valNum !== null && seuilMin !== null && seuilMax !== null && valNum >= seuilMin && valNum <= seuilMax;
        }
        default:
          return true;
      }
    });
  });
}

export function ajouterColonneCalculee(
  donnees: LigneObjet[],
  definition: DefinitionColonneCalculee
): LigneObjet[] {
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
      // Une cellule lue d'un classeur peut être un objet Date, même si le type des cellules ne le prévoit pas
      const rawDate: unknown = ligne[definition.colonneA];
      const dateVal =
        convertirDate(rawDate) ??
        (rawDate instanceof Date ? rawDate : typeof rawDate === "string" || typeof rawDate === "number" ? new Date(rawDate) : null);
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