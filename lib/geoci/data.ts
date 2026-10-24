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
  "La Mé": [5.842, -3.881],
  "Lôh-Djiboua": [5.841, -5.361],
  "Marahoué": [7.091, -5.941],
  "Nawa": [5.786, -6.602],
  "Poro": [9.458, -5.629],
  "San-Pédro": [4.748, -6.636],
  "Sud-Comoé": [5.481, -3.211],
  "Tchologo": [9.591, -5.191],
  "Tonkpi": [7.412, -7.553],
  "Worodougou": [8.151, -6.601],
  "Gôh": [6.131, -5.951],
  "Ghô": [6.131, -5.951], // Tolérance coquille
  "Moronou": [6.651, -4.331],
  "Hambol": [8.141, -5.101],
  "Bounkani / Gontougo": [8.033, -2.802],

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

  // --- PRINCIPALES VILLES ET TOUS LES CHEFS-LIEUX DE RÉGION ---
  "Grand-Bassam": [5.211, -3.738],
  "Bouaké": [7.69, -5.03],
  "Daloa": [6.877, -6.45],
  "Korhogo": [9.458, -5.629],
  "Gagnoa": [6.131, -5.951],
  "Man": [7.412, -7.553],
  "San-Pedro": [4.748, -6.636],
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

  // --- AÉROPORTS ET INFRASTRUCTURES MAJEURES ---
  "Aéroport Félix Houphouët-Boigny": [5.261, -3.926],
  "Aéroport d'Abidjan": [5.261, -3.926],
  "Aéroport de Bouaké": [7.738, -5.074],
  "Aéroport de San-Pédro": [4.746, -6.661],
  "Aéroport de Korhogo": [9.387, -5.556],
  "Port Autonome d'Abidjan": [5.283, -4.015],
  "Port de San-Pédro": [4.745, -6.612],
};

/** Clé de recherche tolérante : minuscules, sans accents, tirets/apostrophes/espaces unifiés */
export function cleGeo(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`_\-/.,;:()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INDEX_GEO = new Map<string, [number, number]>(
  Object.entries(GEO_CI_EXHAUSTIF).map(([nom, coord]) => [cleGeo(nom), coord])
);

/**
 * Retourne [latitude, longitude] si le lieu figure dans le référentiel ivoirien.
 * Tolérant aux variations de tirets, accents et majuscules.
 */
export function trouverLieuCI(nom: string): [number, number] | null {
  if (!nom || typeof nom !== "string") return null;
  return INDEX_GEO.get(cleGeo(nom)) ?? null;
}