// lib/geoci/zones.ts — carte colorée par zone (régions ou districts de Côte d'Ivoire).
// Rattache les lieux d'un fichier à une zone, agrège leurs valeurs et les répartit en classes de couleur.
import { cleGeo, purgerPrefixeAdministratif } from "./data";

export type NiveauZone = "regions" | "districts";

/** Les 31 régions et les 2 districts autonomes (noms des contours de public/geo/ci-regions.json). */
export const REGIONS_CI = [
  "Abidjan", "Agnéby-Tiassa", "Bafing", "Bagoué", "Bélier", "Béré", "Bounkani", "Cavally", "Folon", "Gbêkê", "Gbôklé",
  "Gôh", "Gontougo", "Grands-Ponts", "Guémon", "Hambol", "Haut-Sassandra", "Iffou", "Indénié-Djuablin", "Kabadougou",
  "La Mé", "Lôh-Djiboua", "Marahoué", "Moronou", "N'Zi", "Nawa", "Poro", "San-Pédro", "Sud-Comoé", "Tchologo", "Tonkpi",
  "Worodougou", "Yamoussoukro",
];

/** Les 12 districts et les 2 districts autonomes (noms des contours de public/geo/ci-districts.json). */
export const DISTRICTS_CI = [
  "Abidjan", "Bas-Sassandra", "Comoé", "Denguélé", "Gôh-Djiboua", "Lacs", "Lagunes", "Montagnes", "Sassandra-Marahoué",
  "Savanes", "Vallée du Bandama", "Woroba", "Yamoussoukro", "Zanzan",
];

/** Autres écritures courantes d'un nom de zone. */
const VARIANTES: Record<NiveauZone, Record<string, string>> = {
  regions: { me: "La Mé", nzi: "N'Zi", "n zi": "N'Zi", gho: "Gôh", "grand ponts": "Grands-Ponts", "indenie djuablin": "Indénié-Djuablin", "loh djiboua": "Lôh-Djiboua" },
  districts: { "vallee de bandama": "Vallée du Bandama", bandama: "Vallée du Bandama", "bas sassandra": "Bas-Sassandra", "goh djiboua": "Gôh-Djiboua" },
};

const INDEX: Record<NiveauZone, Map<string, string>> = {
  regions: new Map([...REGIONS_CI.map((n) => [cleGeo(n), n] as [string, string]), ...Object.entries(VARIANTES.regions)]),
  districts: new Map([...DISTRICTS_CI.map((n) => [cleGeo(n), n] as [string, string]), ...Object.entries(VARIANTES.districts)]),
};

export const fichierContours = (niveau: NiveauZone) => (niveau === "regions" ? "/geo/ci-regions.json" : "/geo/ci-districts.json");

/** Nom officiel de la zone désignée par un libellé du fichier (« Région du Poro », « GBEKE »…), ou null. */
export function trouverZone(nom: string, niveau: NiveauZone): string | null {
  if (!nom) return null;
  const cle = cleGeo(nom);
  const index = INDEX[niveau];
  return index.get(cle) ?? index.get(purgerPrefixeAdministratif(cle)) ?? null;
}

/**
 * Niveau de découpage le mieux adapté à une colonne de lieux : celui dont elle cite le plus de zones par leur nom.
 * À égalité (par exemple une colonne de villes), les régions, plus fines, sont retenues.
 */
export function detecterNiveau(noms: string[]): { niveau: NiveauZone; nbDirects: number } {
  const compter = (niveau: NiveauZone) => new Set(noms.map((n) => trouverZone(n, niveau)).filter(Boolean)).size;
  const r = compter("regions");
  const d = compter("districts");
  return d > r ? { niveau: "districts", nbDirects: d } : { niveau: "regions", nbDirects: r };
}

// ---------------------------------------------------------------- Géométrie

type Anneau = number[][];
export interface ContourZone {
  type: "Feature";
  properties: { nom: string };
  geometry: { type: "Polygon"; coordinates: Anneau[] } | { type: "MultiPolygon"; coordinates: Anneau[][] };
}
export interface ContoursZones {
  type: "FeatureCollection";
  features: ContourZone[];
  source?: string;
}

function dansAnneau(lng: number, lat: number, anneau: Anneau): boolean {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

const dansPolygone = (lng: number, lat: number, polygone: Anneau[]) =>
  dansAnneau(lng, lat, polygone[0]) && !polygone.slice(1).some((trou) => dansAnneau(lng, lat, trou));

/** Nom de la zone qui contient le point, ou null s'il tombe hors de toutes les zones (mer, pays voisin). */
export function zoneContenant(lat: number, lng: number, contours: ContoursZones): string | null {
  for (const z of contours.features) {
    const polygones = z.geometry.type === "Polygon" ? [z.geometry.coordinates] : z.geometry.coordinates;
    if (polygones.some((p) => dansPolygone(lng, lat, p))) return z.properties.nom;
  }
  return null;
}

// ---------------------------------------------------------------- Agrégation

export interface LieuAgrege {
  nom: string;
  somme: number;
  /** Nombre de valeurs numériques additionnées dans `somme`. */
  n: number;
  /** Nombre de lignes du fichier. */
  compte: number;
}

export interface ValeurZone {
  zone: string;
  valeur: number;
  /** Lieux du fichier rattachés à cette zone. */
  lieux: string[];
}

export interface ResultatZones {
  zones: ValeurZone[];
  /** Lieux qu'aucune zone ne peut accueillir : inconnus, hors du pays, ou d'un découpage plus large que celui de la carte. */
  nonRattaches: string[];
}

/**
 * Regroupe les lieux d'un fichier par zone :
 *  - un lieu qui porte le nom d'une zone lui est rattaché directement ;
 *  - une ville, une commune ou un département est rattaché à la zone qui contient ses coordonnées ;
 *  - un district sur une carte des régions (ou l'inverse) n'est pas rattaché : il couvrirait plusieurs zones.
 * La moyenne d'une zone est recalculée sur toutes ses lignes (ce n'est pas une moyenne de moyennes).
 */
export function agregerParZone(
  lieux: LieuAgrege[],
  niveau: NiveauZone,
  contours: ContoursZones,
  coordonnees: (nom: string) => [number, number] | null,
  agregation: "Nombre" | "Somme" | "Moyenne"
): ResultatZones {
  const autreNiveau: NiveauZone = niveau === "regions" ? "districts" : "regions";
  const acc = new Map<string, { somme: number; n: number; compte: number; lieux: string[] }>();
  const nonRattaches: string[] = [];
  for (const lieu of lieux) {
    let zone = trouverZone(lieu.nom, niveau);
    if (!zone && !trouverZone(lieu.nom, autreNiveau)) {
      const c = coordonnees(lieu.nom);
      if (c) zone = zoneContenant(c[0], c[1], contours);
    }
    if (!zone) {
      nonRattaches.push(lieu.nom);
      continue;
    }
    let a = acc.get(zone);
    if (!a) {
      a = { somme: 0, n: 0, compte: 0, lieux: [] };
      acc.set(zone, a);
    }
    a.somme += lieu.somme;
    a.n += lieu.n;
    a.compte += lieu.compte;
    a.lieux.push(lieu.nom);
  }
  const zones: ValeurZone[] = [];
  for (const [zone, a] of acc) {
    if (agregation !== "Nombre" && !a.n) continue; // aucune valeur numérique : la zone reste « sans donnée », pas à zéro
    const brut = agregation === "Nombre" ? a.compte : agregation === "Moyenne" ? a.somme / a.n : a.somme;
    zones.push({ zone, valeur: Math.round(brut * 100) / 100, lieux: a.lieux });
  }
  zones.sort((x, y) => y.valeur - x.valeur);
  return { zones, nonRattaches };
}

// ---------------------------------------------------------------- Classes de couleur

/** Une seule teinte, du plus clair (valeurs basses) au plus foncé (valeurs hautes). */
export const DEGRADE_ZONES = ["#cfe0f7", "#93bdf0", "#4f8fe6", "#1f5fc4", "#123a7a"];
export const COULEUR_SANS_DONNEE = "#e2e8f0";

export interface ClasseCouleur {
  /** Bornes incluses de la classe. */
  min: number;
  max: number;
  couleur: string;
  effectif: number;
}

/**
 * Répartit les valeurs en 5 classes au plus, de même effectif (quantiles) : quelques zones très élevées
 * n'écrasent pas toutes les autres dans la teinte la plus claire.
 */
export function classerValeurs(valeurs: number[], nbClasses = DEGRADE_ZONES.length): ClasseCouleur[] {
  const tries = [...valeurs].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!tries.length) return [];
  const distinctes = [...new Set(tries)];
  let hauts: number[];
  if (distinctes.length <= nbClasses) hauts = distinctes;
  else {
    hauts = [];
    for (let i = 1; i <= nbClasses; i++) {
      const h = tries[Math.min(tries.length - 1, Math.ceil((i * tries.length) / nbClasses) - 1)];
      if (hauts[hauts.length - 1] !== h) hauts.push(h);
    }
  }
  const k = hauts.length;
  return hauts.map((max, i) => {
    const dans = tries.filter((v) => v <= max && (i === 0 || v > hauts[i - 1]));
    // Avec moins de classes que de teintes, on étale sur tout le dégradé (la plus haute reste la plus foncée)
    const teinte = k === 1 ? nbClasses - 2 : Math.round((i * (nbClasses - 1)) / (k - 1));
    return { min: dans[0], max, couleur: DEGRADE_ZONES[Math.min(DEGRADE_ZONES.length - 1, teinte)], effectif: dans.length };
  });
}

export function couleurPour(valeur: number | undefined, classes: ClasseCouleur[]): string {
  if (valeur === undefined || !classes.length) return COULEUR_SANS_DONNEE;
  return (classes.find((c) => valeur <= c.max) ?? classes[classes.length - 1]).couleur;
}
