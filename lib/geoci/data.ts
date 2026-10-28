// lib/geoCI/data.ts — Référentiel cartographique exhaustif (Côte d'Ivoire & Monde)

export const GEO_CI_EXHAUSTIF: Record<string, [number, number]> = {
  // --- DISTRICTS AUTONOMES ---
  "Abidjan": [5.359952, -4.008256],
  "Yamoussoukro": [6.8861, -5.2728],

  // --- LES 31 RÉGIONS OFFICIELLES DE CÔTE D'IVOIRE ---
  "Agnéby-Tiassa": [5.926, -4.218],
  "Bafing": [8.271, -7.531],
  "Bagoué": [9.845, -6.148],
  "Bélier": [6.913, -5.029],
  "Béré": [8.053, -6.071],
  "Bounkani": [9.261, -3.003],
  "Cavally": [6.551, -7.962],
  "Folon": [9.882, -7.521],
  "Gbêkê": [7.691, -5.031],
  "Gbôklé": [4.952, -6.091],
  "Gontougo": [8.033, -2.802],
  "Grands-Ponts": [5.311, -4.521],
  "Guémon": [6.932, -7.361],
  "Haut-Sassandra": [6.881, -6.451],
  "Iffou": [7.281, -3.962],
  "Indénié-Djuablin": [6.732, -3.481],
  "Kabadougou": [9.501, -7.561],
  "N'Zi": [6.642, -4.701],
  "Nzi": [6.642, -4.701], // Tolérance sans apostrophe
  "La Mé": [5.842, -3.881],
  "Mé": [5.842, -3.881],
  "Lôh-Djiboua": [5.841, -5.361],
  "Marahoué": [7.091, -5.941],
  "Nawa": [5.786, -6.602],
  "Poro": [9.458, -5.629],
  "San-Pédro": [4.748, -6.636],
  "San-Pedro": [4.748, -6.636],
  "Sud-Comoé": [5.481, -3.211],
  "Tchologo": [9.591, -5.191],
  "Tonkpi": [7.412, -7.553],
  "Worodougou": [8.151, -6.601],
  "Gôh": [6.131, -5.951],
  "Goh": [6.131, -5.951],
  "Ghô": [6.131, -5.951], // Tolérance coquille
  "Moronou": [6.651, -4.331],
  "Hambol": [8.141, -5.101],
  "Bounkani / Gontougo": [8.033, -2.802],

  // --- LES 12 DISTRICTS HISTORIQUES / ADMINISTRATIFS DE CI ---
  "Savanes": [9.500, -5.600],
  "Vallée du Bandama": [7.900, -5.050],
  "Lacs": [6.900, -4.700],
  "Montagnes": [7.200, -7.550],
  "Bas-Sassandra": [5.200, -6.600],
  "Sassandra-Marahoué": [6.900, -6.200],
  "Gôh-Djiboua": [6.000, -5.600],
  "Lagunes": [5.600, -4.200],
  "Comoé": [6.200, -3.350],
  "Zanzan": [8.600, -3.000],
  "Denguélé": [9.700, -7.600],
  "Woroba": [8.200, -6.600],

  // --- MACRO-RÉGIONS / ORIENTATIONS HISTORIQUES CI ---
  "Sud": [5.359952, -4.008256],
  "Nord": [9.458, -5.629],
  "Est": [6.75, -3.48],
  "Ouest": [7.412, -7.553],
  "Centre": [6.886, -5.272],

  // --- COMMUNES DE LA VILLE D'ABIDJAN ---
  "Abobo": [5.416, -4.016],
  "Adjamé": [5.354, -4.022],
  "Attécoubé": [5.338, -4.041],
  "Cocody": [5.359, -3.985],
  "Koumassi": [5.298, -3.956],
  "Marcory": [5.302, -3.981],
  "Plateau": [5.326, -4.021],
  "Port-Bouët": [5.258, -3.931],
  "Treichville": [5.308, -4.009],
  "Yopougon": [5.348, -4.075],
  "Anyama": [5.494, -4.052],
  "Bingerville": [5.356, -3.887],
  "Songon": [5.316, -4.256],

  // --- DÉPARTEMENTS, CHEFS-LIEUX ET GRANDES VILLES DE CI ---
  "Grand-Bassam": [5.211, -3.738],
  "Bouaké": [7.69, -5.03],
  "Daloa": [6.877, -6.45],
  "Korhogo": [9.458, -5.629],
  "Gagnoa": [6.131, -5.951],
  "Man": [7.412, -7.553],
  "Abengourou": [6.73, -3.48],
  "Agboville": [5.928, -4.214],
  "Divo": [5.837, -5.357],
  "Soubré": [5.786, -6.602],
  "Dimbokro": [6.646, -4.705],
  "Bongouanou": [6.65, -4.333],
  "Boundiali": [9.521, -6.487],
  "Daoukro": [7.059, -3.963],
  "Touba": [8.283, -7.683],
  "Mankono": [8.059, -6.189],
  "Minignan": [10.0, -7.833],
  "Sinfra": [6.618, -5.912],
  "Katiola": [8.138, -5.101],
  "Bondoukou": [8.04, -2.8],
  "Oumé": [6.383, -5.417],
  "Ferkessédougou": [9.593, -5.195],
  "Séguéla": [7.961, -6.673],
  "Guiglo": [6.544, -7.494],
  "Odienné": [9.508, -7.564],
  "Toumodi": [6.556, -5.018],
  "Sassandra": [4.954, -6.086],
  "Aboisso": [5.467, -3.207],
  "Dabou": [5.325, -4.377],
  "Bouna": [9.269, -2.996],
  "Duékoué": [6.746, -7.349],
  "Tanda": [7.803, -3.268],
  "Adzopé": [6.107, -3.862],
  "Danané": [7.259, -8.155],
  "Issia": [6.492, -6.586],
  "M'Bahiakro": [7.452, -4.338],
  "Tiassalé": [5.898, -4.823],
  "Grand-Lahou": [5.136, -5.024],
  "Adiaké": [5.286, -3.300],
  "Dabakala": [8.363, -4.433],
  "Jacqueville": [5.205, -4.417],
  "Tengréla": [10.483, -6.417],
  "Tingréla": [10.483, -6.417],
  "Kouto": [9.883, -6.400],
  "Sinématiali": [9.583, -5.383],
  "Dikodougou": [9.067, -5.767],
  "M'Bengué": [10.000, -5.900],
  "Ouangolodougou": [9.967, -5.150],
  "Kong": [9.150, -4.617],
  "Niakaramandougou": [8.667, -5.283],
  "Niakara": [8.667, -5.283],
  "Béoumi": [7.667, -5.567],
  "Sakassou": [7.450, -5.283],
  "Botro": [7.850, -5.317],
  "Bocanda": [7.067, -4.500],
  "Kouassi-Kouassikro": [7.133, -4.667],
  "Arrah": [6.667, -3.967],
  "M'Batto": [6.467, -4.367],
  "Prikro": [7.633, -3.983],
  "Akoupé": [6.383, -3.883],
  "Alépé": [5.500, -3.667],
  "Yakassé-Attobrou": [6.183, -3.650],
  "Sikensi": [5.667, -4.567],
  "Taabo": [6.233, -5.083],
  "Fresco": [5.083, -5.567],
  "Guitry": [5.517, -5.233],
  "Lakota": [5.850, -5.683],
  "Vavoua": [7.383, -6.483],
  "Zoukougbeu": [6.767, -6.867],
  "Zuénoula": [7.433, -6.050],
  "Guibéroua": [6.233, -6.167],
  "Ouaragahio": [6.150, -5.900],
  "Méagui": [5.400, -6.950],
  "Buyo": [6.267, -7.050],
  "Guéyo": [5.683, -6.067],
  "Tabou": [4.417, -7.350],
  "Grabo": [4.900, -7.500],
  "Bangolo": [7.017, -7.483],
  "Kouibly": [7.267, -7.233],
  "Facobly": [7.417, -7.417],
  "Bloléquin": [6.567, -8.000],
  "Toulepleu": [6.583, -8.417],
  "Taï": [5.867, -7.467],
  "Biankouma": [7.733, -7.617],
  "Zouan-Hounien": [6.917, -8.200],
  "Sipilou": [7.883, -7.900],
  "Koro": [8.550, -7.467],
  "Ouaninou": [8.233, -7.867],
  "Kani": [8.483, -6.600],
  "Dianra": [8.983, -6.250],
  "Kounahiri": [7.833, -5.850],
  "Samatiguila": [9.817, -7.567],
  "Gbéléban": [9.600, -8.133],
  "Madinani": [9.617, -6.950],
  "Seydougou": [9.733, -7.683],
  "Kaniasso": [9.850, -7.533],
  "Sandégué": [7.950, -3.583],
  "Koun-Fao": [7.483, -3.250],
  "Transua": [7.583, -3.000],
  "Doropo": [9.817, -3.333],
  "Nassian": [8.467, -3.467],
  "Téhini": [9.633, -3.617],
  "Tiapoum": [5.133, -3.017],
  "Agnibilékrou": [7.133, -3.200],
  "Bettié": [6.083, -3.400],
  "Afféry": [6.317, -3.950],
  "Assinie": [5.133, -3.283],
  "Grand-Béréby": [4.650, -6.933],

  // --- INFRASTRUCTURES MAJEURES ---
  "Aéroport Félix Houphouët-Boigny": [5.261, -3.926],
  "Aéroport d'Abidjan": [5.261, -3.926],
  "Aéroport de Bouaké": [7.738, -5.074],
  "Aéroport de San-Pédro": [4.746, -6.661],
  "Aéroport de Korhogo": [9.387, -5.556],
  "Port Autonome d'Abidjan": [5.283, -4.015],
  "Port de San-Pédro": [4.745, -6.612],
};

// --- RÉFÉRENTIEL MONDIAL DES PAYS (Centroïdes officiels) ---
export const PAYS_DU_MONDE: Record<string, [number, number]> = {
  // Afrique
  "Côte d'Ivoire": [7.540, -5.547],
  "Ghana": [7.946, -1.023],
  "Burkina Faso": [12.238, -1.561],
  "Mali": [17.570, -3.996],
  "Guinée": [9.945, -9.696],
  "Libéria": [6.428, -9.429],
  "Sénégal": [14.497, -14.452],
  "Togo": [8.619, 0.824],
  "Bénin": [9.307, 2.315],
  "Nigeria": [9.082, 8.675],
  "Niger": [17.607, 8.081],
  "Mauritanie": [21.007, -10.940],
  "Sierra Leone": [8.460, -11.779],
  "Gambie": [13.443, -15.310],
  "Guinée-Bissau": [11.803, -15.180],
  "Cameroun": [7.369, 12.354],
  "Gabon": [-0.803, 11.609],
  "Congo": [-0.228, 15.827],
  "République Démocratique du Congo": [-4.038, 21.758],
  "RDC": [-4.038, 21.758],
  "Tchad": [15.454, 18.732],
  "Centrafrique": [6.611, 20.939],
  "Guinée Équatoriale": [1.650, 10.267],
  "Maroc": [31.791, -7.092],
  "Algérie": [28.033, 1.659],
  "Tunisie": [33.886, 9.537],
  "Égypte": [26.820, 30.802],
  "Afrique du Sud": [-30.559, 22.937],
  "Kenya": [-0.023, 37.906],
  "Éthiopie": [9.145, 40.489],
  "Angola": [-11.202, 17.873],
  "Rwanda": [-1.940, 29.873],

  // Europe
  "France": [46.603, 1.888],
  "Allemagne": [51.165, 10.451],
  "Italie": [41.871, 12.567],
  "Espagne": [40.463, -3.749],
  "Royaume-Uni": [55.378, -3.435],
  "Angleterre": [52.355, -1.174],
  "Belgique": [50.503, 4.469],
  "Pays-Bas": [52.132, 5.291],
  "Suisse": [46.818, 8.227],
  "Portugal": [39.399, -8.224],
  "Suède": [60.128, 18.643],
  "Norvège": [60.472, 8.468],
  "Danemark": [56.263, 9.501],
  "Pologne": [51.919, 19.145],
  "Russie": [61.524, 105.318],
  "Turquie": [38.963, 35.243],

  // Asie & Moyen-Orient
  "Chine": [35.861, 104.195],
  "Inde": [20.593, 78.962],
  "Japon": [36.204, 138.252],
  "Viêt Nam": [14.058, 108.277],
  "Vietnam": [14.058, 108.277],
  "Thaïlande": [15.870, 100.992],
  "Indonésie": [-0.789, 113.921],
  "Singapour": [1.352, 103.819],
  "Malaisie": [4.210, 101.975],
  "Émirats Arabes Unis": [23.424, 53.847],
  "Dubaï": [25.204, 55.270],
  "Arabie Saoudite": [23.885, 45.079],
  "Corée du Sud": [35.907, 127.766],
  "Liban": [33.854, 35.862],

  // Amériques
  "États-Unis": [37.090, -95.712],
  "USA": [37.090, -95.712],
  "Canada": [56.130, -106.346],
  "Brésil": [-14.235, -51.925],
  "Argentine": [-38.416, -63.616],
  "Mexique": [23.634, -102.552],
  "Colombie": [4.570, -74.297],

  // Océanie
  "Australie": [-25.274, 133.775],
};

/** Clé de recherche tolérante : minuscules, sans accents, tirets/apostrophes/espaces unifiés */
export function cleGeo(texte: string): string {
  if (!texte) return "";
  return texte
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`_\-/.,;:()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nettoie les préfixes administratifs fréquents (ex: "Région du Tchologo" -> "Tchologo") */
export function purgerPrefixeAdministratif(cle: string): string {
  const motif =
    /^(district autonome|district|region|departement|prefecture|sous prefecture|commune|ville|station|pays)\s+(de l[\' ]|de la\s|des\s|du\s|d[\' ]|de\s)?/i;
  return cle.replace(motif, "").trim();
}

// Index mémoires ultra-rapides
const INDEX_GEO_CI = new Map<string, [number, number]>(
  Object.entries(GEO_CI_EXHAUSTIF).map(([nom, coord]) => [cleGeo(nom), coord])
);

const INDEX_PAYS = new Map<string, [number, number]>(
  Object.entries(PAYS_DU_MONDE).map(([nom, coord]) => [cleGeo(nom), coord])
);

/**
 * Recherche un lieu en Côte d'Ivoire (régions, districts, départements, communes, villes).
 * Tolérant aux variations de casse, d'accents et de préfixes ("Région de...", "District de...").
 */
export function trouverLieuCI(nom: string): [number, number] | null {
  if (!nom || typeof nom !== "string") return null;

  const cle = cleGeo(nom);
  if (INDEX_GEO_CI.has(cle)) {
    return INDEX_GEO_CI.get(cle)!;
  }

  // Essai après suppression du préfixe administratif
  const sansPrefixe = purgerPrefixeAdministratif(cle);
  if (INDEX_GEO_CI.has(sansPrefixe)) {
    return INDEX_GEO_CI.get(sansPrefixe)!;
  }

  return null;
}

/**
 * Recherche un pays dans le référentiel mondial officiel.
 */
export function trouverPays(nom: string): [number, number] | null {
  if (!nom || typeof nom !== "string") return null;

  const cle = cleGeo(nom);
  if (INDEX_PAYS.has(cle)) {
    return INDEX_PAYS.get(cle)!;
  }

  const sansPrefixe = purgerPrefixeAdministratif(cle);
  if (INDEX_PAYS.has(sansPrefixe)) {
    return INDEX_PAYS.get(sansPrefixe)!;
  }

  return null;
}

/**
 * Résolveur universel : cherche d'abord en Côte d'Ivoire, puis dans les pays du monde.
 */
export function trouverLieu(nom: string): [number, number] | null {
  return trouverLieuCI(nom) || trouverPays(nom);
}