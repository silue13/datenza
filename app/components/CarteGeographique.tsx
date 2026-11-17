"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { MapPin, Presentation, Calendar } from "lucide-react";
import { trouverLieuCI, cleGeo, PAYS_DU_MONDE } from "../../lib/geoci/data";
import { parseNombre, type Cellule, estValeurVide, arrondir } from "../../lib/analyse/utils";
import { useData } from "../context/DataContext";
import {
  agregerParZone,
  classerValeurs,
  couleurPour,
  detecterNiveau,
  fichierContours,
  trouverZone,
  COULEUR_SANS_DONNEE,
  type ContoursZones,
  type LieuAgrege,
  type NiveauZone,
} from "../../lib/geoci/zones";

interface Props {
  entetes: string[];
  corps: Cellule[][];
  onAjouterPptx?: (element: any) => void;
}

interface PointComparatif {
  nom: string;
  lat: number;
  lng: number;
  totalGlobal: number;
  valeursParSource: Record<string, number>;
  leader: string;
  valeurLeader: number;
  amplitude: number;
  ecartVsRef: number;
  variationPctVsRef: number;
}

type AgregationCarte = "Nombre" | "Somme" | "Moyenne";

function nombreCellule(v: Cellule): number | null {
  if (estValeurVide(v)) return null;
  return parseNombre(v);
}

const MAX_LIEUX = 80;

const MOTS_CLES_GEO = /(ville|city|commune|region|pays|country|departement|department|district|adresse|lieu|location|zone|secteur|territoire|localite|village|prefecture|province|quartier)/i;
const MOTS_CLES_EXCLUS = /(categorie|category|statut|status|mois|month|annee|year|commercial|vendeur|client|devise|type|produit|article|id|num|reference|ref|remise|taux)/i;

/** Cadre de la Côte d'Ivoire, pour centrer la carte colorée par zone. */
const CADRE_CI = [
  { lat: 4.35, lng: -8.6 },
  { lat: 10.74, lng: -2.49 },
];
const NOMS_NIVEAU: Record<NiveauZone, { un: string; des: string; colorees: string }> = {
  regions: { un: "région", des: "régions", colorees: "Régions colorées" },
  districts: { un: "district", des: "districts", colorees: "Districts colorés" },
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function estDansFrontieresCI(lat: number, lng: number): boolean {
  return lat >= 4.2 && lat <= 10.9 && lng >= -8.7 && lng <= -2.4;
}

export default function CarteGeographique({ entetes, corps, onAjouterPptx }: Props) {
  const { graphiquesEpingles, epinglerGraphique } = useData();

  // État stockant les composants Leaflet une fois le navigateur prêt
  const [leafletReady, setLeafletReady] = useState<{
    MapContainer: any;
    TileLayer: any;
    CircleMarker: any;
    Popup: any;
    Tooltip: any;
    GeoJSON: any;
    AjusterVue: any;
  } | null>(null);

  // Chargement synchronisé unique de Leaflet côté client
  useEffect(() => {
    let actif = true;

    Promise.all([
      import("react-leaflet"),
      import("./AjusterVue"),
    ])
      .then(([rl, av]) => {
        if (actif) {
          setLeafletReady({
            MapContainer: rl.MapContainer,
            TileLayer: rl.TileLayer,
            CircleMarker: rl.CircleMarker,
            Popup: rl.Popup,
            Tooltip: rl.Tooltip,
            GeoJSON: rl.GeoJSON,
            AjusterVue: av.default || av,
          });
        }
      })
      .catch((err) => {
        console.error("Erreur lors du chargement de Leaflet :", err);
      });

    // La carte elle-même est détruite par MapContainer (react-leaflet) à son démontage :
    // un map.remove() manuel ici la détruirait une seconde fois.
    return () => {
      actif = false;
    };
  }, []);

  // 1. DÉTECTION DU FORMAT MATRICIEL
  const colonnesEnTetesGeographiques = useMemo(() => {
    return entetes.filter((h) => {
      if (h === "Fichier Source") return false;
      return trouverLieuCI(h) !== null;
    });
  }, [entetes]);

  const estFormatMatriciel = colonnesEnTetesGeographiques.length >= 2;

  // 2. DÉTECTION DU FORMAT STANDARD
  const colonnesGeographiquesEligibles = useMemo(() => {
    return entetes.filter((nom, idx) => {
      if (nom === "Fichier Source") return false;

      const echantillon = corps.map((ligne) => ligne[idx]).filter((v) => !estValeurVide(v));
      if (echantillon.length === 0) return false;

      const nbNombres = echantillon.filter((v) => parseNombre(v) !== null).length;
      if (nbNombres / echantillon.length >= 0.4) return false;

      const sontDesAnnees = echantillon.every((v) => /^(19|20)\d{2}$/.test(String(v).trim()));
      if (sontDesAnnees) return false;

      const nomNorm = nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (MOTS_CLES_EXCLUS.test(nomNorm)) return false;

      const echantillonTexte = echantillon.slice(0, 25).map((l) => String(l).trim());
      const aLieuxReconnus = echantillonTexte.some((v) => trouverLieuCI(v) !== null);
      if (aLieuxReconnus) return true;

      return MOTS_CLES_GEO.test(nomNorm);
    });
  }, [entetes, corps]);

  // Colonne proposée par défaut : celle qui place le plus de lieux différents sur la carte
  // (une colonne « Région » à valeur unique donnait un seul point alors que les sous-préfectures en donnent vingt)
  const defautStandard = useMemo(() => {
    let meilleure = colonnesGeographiquesEligibles[0] || "";
    let meilleurScore = -1;
    for (const col of colonnesGeographiquesEligibles) {
      const idx = entetes.indexOf(col);
      const reconnus = new Set<string>();
      for (const ligne of corps.slice(0, 2000)) {
        const v = String(ligne[idx] ?? "").trim();
        if (!v) continue;
        const cle = cleGeo(v);
        if (!reconnus.has(cle) && (trouverLieuCI(v) || PAYS_DU_MONDE[cle])) reconnus.add(cle);
      }
      if (reconnus.size > meilleurScore) {
        meilleurScore = reconnus.size;
        meilleure = col;
      }
    }
    return meilleure;
  }, [colonnesGeographiquesEligibles, entetes, corps]);

  const [choix, setChoix] = useState<string | null>(null);
  const colonneGeo = choix !== null && colonnesGeographiquesEligibles.includes(choix) ? choix : defautStandard;

  const periodesDisponibles = useMemo(() => {
    if (!estFormatMatriciel || corps.length === 0) return [];
    const idxPeriode = entetes.findIndex((h) => !colonnesEnTetesGeographiques.includes(h) && h !== "Fichier Source");
    if (idxPeriode === -1) return [];
    return Array.from(new Set(corps.map((l) => String(l[idxPeriode] ?? "").trim()).filter(Boolean)));
  }, [estFormatMatriciel, corps, entetes, colonnesEnTetesGeographiques]);

  const [periodeChoisie, setPeriodeChoisie] = useState<string>("Toutes");

  const colonnesNumeriques = useMemo(() => {
    return entetes
      .filter((h) => h !== "Fichier Source")
      .filter((h) => {
        const i = entetes.indexOf(h);
        const vals = corps.map((l) => nombreCellule(l[i])).filter((n): n is number => n !== null);
        return vals.length >= 2;
      });
  }, [entetes, corps]);

  const [colonneMesure, setColonneMesure] = useState<string>(colonnesNumeriques[0] || "");
  const [agregation, setAgregation] = useState<AgregationCarte>("Somme");
  const [externes, setExternes] = useState<Record<string, { lat: number; lng: number } | null>>({});
  const demandes = useRef(new Set<string>());
  const [estDejaInclus, setEstDejaInclus] = useState(false);

  // 3. CONSTRUCTION DES POINTS GÉOGRAPHIQUES
  const points = useMemo<PointComparatif[]>(() => {
    const pts: PointComparatif[] = [];

    // CAS A : FORMAT MATRICIEL
    if (estFormatMatriciel) {
      const idxPeriodeCol = entetes.findIndex((h) => !colonnesEnTetesGeographiques.includes(h) && h !== "Fichier Source");

      const lignesFiltrees = periodeChoisie === "Toutes" || idxPeriodeCol === -1
        ? corps
        : corps.filter((l) => String(l[idxPeriodeCol] ?? "").trim() === periodeChoisie);

      colonnesEnTetesGeographiques.forEach((nomVille) => {
        const coord = trouverLieuCI(nomVille);
        if (!coord) return;

        const idxCol = entetes.indexOf(nomVille);
        const valeurs = lignesFiltrees.map((l) => nombreCellule(l[idxCol])).filter((n): n is number => n !== null);
        if (!valeurs.length) return;

        const somme = valeurs.reduce((a, b) => a + b, 0);
        const totalGlobal = agregation === "Moyenne" ? arrondir(somme / valeurs.length) : arrondir(somme);

        pts.push({
          nom: nomVille,
          lat: coord[0],
          lng: coord[1],
          totalGlobal,
          valeursParSource: { Defaut: totalGlobal },
          leader: "Général",
          valeurLeader: totalGlobal,
          amplitude: 0,
          ecartVsRef: 0,
          variationPctVsRef: 0,
        });
      });

      return pts.sort((a, b) => b.totalGlobal - a.totalGlobal);
    }

    // CAS B : FORMAT STANDARD
    const idxGeo = entetes.indexOf(colonneGeo);
    if (idxGeo === -1) return [];

    const idxMesure = entetes.indexOf(colonneMesure);
    // Clé sans casse ni accents : « Abidjan », « ABIDJAN » et « abidjan » forment un seul point sur la carte
    const mapLieux = new Map<string, { nom: string; totalSomme: number; totalN: number; totalCompte: number }>();

    for (const ligne of corps) {
      if (estValeurVide(ligne[idxGeo])) continue;
      const lieu = String(ligne[idxGeo] ?? "").replace(/["'«»“”]/g, "").trim();
      if (!lieu || /^\d+$/.test(lieu) || /^(sous[- ]?)?tota(l|ux)\b/i.test(lieu)) continue;

      const cle = cleGeo(lieu) || lieu;
      let gLieu = mapLieux.get(cle);
      if (!gLieu) {
        gLieu = { nom: lieu, totalSomme: 0, totalN: 0, totalCompte: 0 };
        mapLieux.set(cle, gLieu);
      }

      gLieu.totalCompte++;
      if (agregation !== "Nombre" && idxMesure >= 0) {
        const val = nombreCellule(ligne[idxMesure]);
        if (val !== null) {
          gLieu.totalSomme += val;
          gLieu.totalN++;
        }
      }
    }

    Array.from(mapLieux.values()).forEach((g) => {
      const nom = g.nom;
      let coord = trouverLieuCI(nom) || (PAYS_DU_MONDE[cleGeo(nom)] ?? null);
      if (!coord && externes[nom]) coord = [externes[nom]!.lat, externes[nom]!.lng];
      if (!coord) return;

      const totalGlobal = agregation === "Nombre"
        ? g.totalCompte
        : agregation === "Moyenne"
        ? (g.totalN ? arrondir(g.totalSomme / g.totalN) : 0)
        : arrondir(g.totalSomme);

      pts.push({
        nom,
        lat: coord[0],
        lng: coord[1],
        totalGlobal,
        valeursParSource: { Defaut: totalGlobal },
        leader: "Général",
        valeurLeader: totalGlobal,
        amplitude: 0,
        ecartVsRef: 0,
        variationPctVsRef: 0,
      });
    });

    return pts.sort((a, b) => b.totalGlobal - a.totalGlobal).slice(0, MAX_LIEUX);
  }, [
    estFormatMatriciel,
    colonnesEnTetesGeographiques,
    corps,
    entetes,
    periodeChoisie,
    agregation,
    colonneGeo,
    colonneMesure,
    externes,
  ]);

  // Lieux du fichier qui n'ont pas pu être placés : à signaler, sinon la carte laisse croire qu'elle est complète
  const lieuxNonPlaces = useMemo(() => {
    if (estFormatMatriciel) return [];
    const idxGeo = entetes.indexOf(colonneGeo);
    if (idxGeo === -1) return [];
    const places = new Set(points.map((p) => cleGeo(p.nom) || p.nom));
    const manquants = new Map<string, string>();
    for (const ligne of corps) {
      if (estValeurVide(ligne[idxGeo])) continue;
      const lieu = String(ligne[idxGeo] ?? "").replace(/["'«»“”]/g, "").trim();
      if (!lieu || /^\d+$/.test(lieu) || /^(sous[- ]?)?tota(l|ux)\b/i.test(lieu)) continue;
      const cle = cleGeo(lieu) || lieu;
      if (places.has(cle) || manquants.has(cle)) continue;
      // Encore en cours de recherche (réponse du géocodeur pas arrivée) : on ne l'annonce pas comme introuvable
      if (!trouverLieuCI(lieu) && !PAYS_DU_MONDE[cle] && externes[lieu] === undefined) continue;
      manquants.set(cle, lieu);
    }
    // La carte n'affiche que les MAX_LIEUX premiers : les suivants ne sont pas « introuvables »
    return points.length >= MAX_LIEUX ? [] : [...manquants.values()];
  }, [estFormatMatriciel, entetes, colonneGeo, corps, points, externes]);

  // 3 bis. CARTE COLORÉE PAR ZONE : les valeurs sont regroupées par région (ou par district)
  const lieuxAgreges = useMemo<LieuAgrege[]>(() => {
    if (estFormatMatriciel) {
      const idxPeriodeCol = entetes.findIndex((h) => !colonnesEnTetesGeographiques.includes(h) && h !== "Fichier Source");
      const lignes =
        periodeChoisie === "Toutes" || idxPeriodeCol === -1 ? corps : corps.filter((l) => String(l[idxPeriodeCol] ?? "").trim() === periodeChoisie);
      return colonnesEnTetesGeographiques.map((nom) => {
        const idxCol = entetes.indexOf(nom);
        const valeurs = lignes.map((l) => nombreCellule(l[idxCol])).filter((n): n is number => n !== null);
        return { nom, somme: valeurs.reduce((a, b) => a + b, 0), n: valeurs.length, compte: valeurs.length };
      });
    }
    const idxGeo = entetes.indexOf(colonneGeo);
    if (idxGeo === -1) return [];
    const idxMesure = entetes.indexOf(colonneMesure);
    const parLieu = new Map<string, LieuAgrege>();
    for (const ligne of corps) {
      if (estValeurVide(ligne[idxGeo])) continue;
      const lieu = String(ligne[idxGeo] ?? "").replace(/["'«»“”]/g, "").trim();
      if (!lieu || /^\d+$/.test(lieu) || /^(sous[- ]?)?tota(l|ux)\b/i.test(lieu)) continue;
      const cle = cleGeo(lieu) || lieu;
      let g = parLieu.get(cle);
      if (!g) {
        g = { nom: lieu, somme: 0, n: 0, compte: 0 };
        parLieu.set(cle, g);
      }
      g.compte++;
      const val = idxMesure >= 0 ? nombreCellule(ligne[idxMesure]) : null;
      if (val !== null) {
        g.somme += val;
        g.n++;
      }
    }
    return [...parLieu.values()];
  }, [estFormatMatriciel, colonnesEnTetesGeographiques, entetes, corps, periodeChoisie, colonneGeo, colonneMesure]);

  const { niveau, nbDirects } = useMemo(() => detecterNiveau(lieuxAgreges.map((l) => l.nom)), [lieuxAgreges]);

  // Contours des zones : chargés une fois par découpage, seulement si le fichier contient des lieux
  const [contours, setContours] = useState<Partial<Record<NiveauZone, ContoursZones>>>({});
  const aDesLieux = lieuxAgreges.length > 0;
  useEffect(() => {
    if (!aDesLieux || contours[niveau]) return;
    let annule = false;
    fetch(fichierContours(niveau))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: ContoursZones) => {
        if (!annule) setContours((prev) => ({ ...prev, [niveau]: data }));
      })
      .catch(() => {
        // Sans contours, la carte reste en cercles
      });
    return () => {
      annule = true;
    };
  }, [aDesLieux, niveau, contours]);

  const contoursActifs = contours[niveau] ?? null;
  const resultatZones = useMemo(() => {
    if (!contoursActifs) return null;
    const coordonnees = (nom: string): [number, number] | null => trouverLieuCI(nom) ?? (externes[nom] ? [externes[nom]!.lat, externes[nom]!.lng] : null);
    return agregerParZone(lieuxAgreges, niveau, contoursActifs, coordonnees, agregation);
  }, [contoursActifs, lieuxAgreges, niveau, externes, agregation]);

  const zonesDisponibles = !!resultatZones && resultatZones.zones.length >= 2;
  const [modeChoisi, setModeChoisi] = useState<"cercles" | "zones" | null>(null);
  // Une colonne qui cite directement des régions s'ouvre en carte colorée ; une colonne de villes reste en cercles
  const mode: "cercles" | "zones" = !zonesDisponibles ? "cercles" : modeChoisi ?? (nbDirects >= 3 ? "zones" : "cercles");
  const enZones = mode === "zones" && !!resultatZones && !!contoursActifs;

  const classesZones = useMemo(() => classerValeurs((resultatZones?.zones ?? []).map((z) => z.valeur)), [resultatZones]);
  const valeursZones = useMemo(() => new Map((resultatZones?.zones ?? []).map((z) => [z.zone, z.valeur])), [resultatZones]);
  const signatureZones = useMemo(() => (resultatZones?.zones ?? []).map((z) => `${z.zone}:${z.valeur}`).join("|"), [resultatZones]);

  // Lieux qu'aucune zone n'accueille (hors recherches de coordonnées encore en cours)
  const lieuxNonRattaches = useMemo(
    () =>
      (resultatZones?.nonRattaches ?? []).filter(
        (nom) => trouverLieuCI(nom) || externes[nom] !== undefined || estFormatMatriciel || trouverZone(nom, niveau === "regions" ? "districts" : "regions")
      ),
    [resultatZones, externes, estFormatMatriciel, niveau]
  );

  const lectureZones = useMemo(() => {
    const zones = resultatZones?.zones ?? [];
    if (zones.length < 2 || !contoursActifs) return "";
    const nb = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
    const mots = NOMS_NIVEAU[niveau];
    const premier = zones[0];
    const dernier = zones[zones.length - 1];
    const total = zones.reduce((s, z) => s + z.valeur, 0);
    const additif = agregation !== "Moyenne" && total > 0 && zones.every((z) => z.valeur >= 0);
    let texte = `« ${premier.zone} » arrive en tête avec ${nb(premier.valeur)}`;
    if (additif) texte += `, soit ${nb(Math.round((premier.valeur / total) * 1000) / 10)} % du total des ${zones.length} ${mots.des} renseigné${niveau === "regions" ? "e" : ""}s`;
    texte += `. La valeur la plus faible est celle de « ${dernier.zone} » (${nb(dernier.valeur)}).`;
    const sansDonnee = contoursActifs.features.length - zones.length;
    if (sansDonnee > 0) texte += ` ${sansDonnee} ${sansDonnee > 1 ? mots.des : mots.un} sur ${contoursActifs.features.length} sans donnée (en gris).`;
    if (agregation === "Moyenne") texte += ` Il s'agit de moyennes par ${mots.un} : elles ne s'additionnent pas.`;
    return texte;
  }, [resultatZones, contoursActifs, niveau, agregation]);

  // Phrase de lecture : le premier lieu, sa part si les valeurs s'additionnent, et la concentration
  const lectureCarte = useMemo(() => {
    if (points.length < 2) return "";
    const nb = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
    const tries = [...points].sort((a, b) => b.totalGlobal - a.totalGlobal);
    const premier = tries[0];
    const dernier = tries[tries.length - 1];
    const total = tries.reduce((s, p) => s + p.totalGlobal, 0);
    const additif = agregation !== "Moyenne" && total > 0 && tries.every((p) => p.totalGlobal >= 0);
    let texte = `« ${premier.nom} » arrive en tête avec ${nb(premier.totalGlobal)}`;
    if (additif) texte += `, soit ${nb(Math.round((premier.totalGlobal / total) * 1000) / 10)} % du total des ${points.length} lieux placés`;
    texte += `. Le lieu le plus faible est « ${dernier.nom} » (${nb(dernier.totalGlobal)}).`;
    if (additif && tries.length >= 5) {
      const top3 = tries.slice(0, 3).reduce((s, p) => s + p.totalGlobal, 0);
      texte += ` Les trois premiers lieux concentrent ${nb(Math.round((top3 / total) * 1000) / 10)} % du total.`;
    }
    if (agregation === "Moyenne") texte += " Il s'agit de moyennes par lieu : elles ne s'additionnent pas.";
    return texte;
  }, [points, agregation]);

  // 4. GÉOCODAGE NOMINATIM
  useEffect(() => {
    if (estFormatMatriciel) return;
    let annule = false;

    async function executer() {
      const idxGeo = entetes.indexOf(colonneGeo);
      if (idxGeo === -1) return;

      const candidats = Array.from(new Set(corps.map((l) => String(l[idxGeo] ?? "").trim())));

      for (const nom of candidats) {
        if (annule) return;
        if (!nom || /^\d+$/.test(nom) || nom === "—" || nom === "-" || /^total/i.test(nom)) continue;
        if (trouverLieuCI(nom) || PAYS_DU_MONDE[cleGeo(nom)]) continue;
        if (demandes.current.has(nom)) continue;
        demandes.current.add(nom);

        let resultat: { lat: number; lng: number } | null = null;
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ci&q=${encodeURIComponent(nom)}`;
          const res = await fetch(url, { headers: { "Accept-Language": "fr" } });
          if (res.ok) {
            const data = (await res.json()) as { lat: string; lon: string }[];
            if (data.length > 0) {
              const lat = parseFloat(data[0].lat);
              const lng = parseFloat(data[0].lon);
              if (estDansFrontieresCI(lat, lng)) {
                resultat = { lat, lng };
              }
            }
          }
        } catch {
          resultat = null;
        }

        if (!annule) {
          setExternes((prev) => ({ ...prev, [nom]: resultat }));
        }
        await pause(1000);
      }
    }

    void executer();
    return () => {
      annule = true;
    };
  }, [colonneGeo, corps, entetes, estFormatMatriciel]);

  const maxValMesure = useMemo(() => {
    if (!points.length) return 1;
    let m = 0;
    points.forEach((p) => {
      if (p.totalGlobal > m) m = p.totalGlobal;
    });
    return m || 1;
  }, [points]);

  const rayonPoint = (val: number) => {
    const ratio = Math.max(0, val / maxValMesure);
    return Math.round(9 + ratio * 24);
  };

  const centreCI: [number, number] = [7.54, -5.55];
  const zoomCI = 6.8;

  const idGraphiqueCarte = `carte-geo-${estFormatMatriciel ? "stations-colonnes" : colonneGeo}-${agregation}${enZones ? `-${niveau}` : ""}`;
  const estInclusPptx =
    (graphiquesEpingles || []).some((g) => String(g.id) === String(idGraphiqueCarte)) || estDejaInclus;

  const preparerExportPptx = () => {
    if (!points.length && !enZones) return;
    // En carte colorée, ce sont les valeurs par zone qui partent dans le PowerPoint
    const topPoints = enZones ? (resultatZones?.zones ?? []).slice(0, 15).map((z) => ({ nom: z.zone, totalGlobal: z.valeur })) : points.slice(0, 10);
    if (!topPoints.length) return;
    const labels = topPoints.map((p) => p.nom);

    const objetExport = {
      id: idGraphiqueCarte,
      titre: estFormatMatriciel
        ? `Répartition Spatiale des Stations (${periodeChoisie === "Toutes" ? "Cumul" : periodeChoisie})`
        : `Synthèse Territoriale : ${agregation === "Nombre" ? "nombre de lignes" : `${agregation} de ${colonneMesure || "volumes"}`} par ${enZones ? NOMS_NIVEAU[niveau].un : colonneGeo}`,
      type: "Barres",
      chartType: "bar",
      labels,
      datasets: [
        {
          label: agregation === "Nombre" ? "Effectifs" : `${agregation}`,
          data: topPoints.map((p) => p.totalGlobal),
          backgroundColor: "#2563eb",
          borderColor: "#1d4ed8",
        },
      ],
      interpretation: `Pôle dominant : « ${topPoints[0]?.nom || ""} » avec ${topPoints[0]?.totalGlobal.toLocaleString("fr-FR")}.`,
    };

    onAjouterPptx?.(objetExport as any);
    if (epinglerGraphique) epinglerGraphique(objetExport as any);
    setEstDejaInclus(true);
  };

  // CAS AUCUNE DONNÉE GÉOGRAPHIQUE
  if (!estFormatMatriciel && colonnesGeographiquesEligibles.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center font-bold">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Carte géographique
            </h3>
            <p className="text-xs text-slate-400">
              Module de cartographie territoriale
            </p>
          </div>
        </div>

        <div className="py-8 px-4 text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400">
            <MapPin className="w-6 h-6 stroke-1" />
          </div>
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Aucune donnée géographique détectée
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Ce fichier ne comporte aucune variable spatiale reconnue (région, district, département, ville, commune ou pays). La carte interactive est automatiquement masquée pour ce jeu de données.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bloc-carte-print print-eviter-coupure bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4 shadow-sm">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              {estFormatMatriciel
                ? `Cartographie des Stations (${colonnesEnTetesGeographiques.length} pôles)`
                : `Carte géographique — ${colonneGeo}`}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400">
              {estFormatMatriciel
                ? "Données matricielles : chaque colonne correspond à une station géographique"
                : enZones
                ? `Valeurs regroupées par ${NOMS_NIVEAU[niveau].un}`
                : "Répartition spatiale et concentration territoriale"}
            </p>
          </div>
        </div>

        {/* Contrôles interactifs */}
        <div className="no-print print:hidden flex flex-wrap items-center gap-2">
          {estFormatMatriciel ? (
            <>
              {periodesDisponibles.length > 0 && (
                <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl px-2.5 py-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <select
                    value={periodeChoisie}
                    onChange={(e) => setPeriodeChoisie(e.target.value)}
                    className="bg-transparent text-xs font-bold text-blue-700 dark:text-blue-300 focus:outline-none cursor-pointer"
                  >
                    <option value="Toutes">Toutes les années (Cumul)</option>
                    {periodesDisponibles.map((p) => (
                      <option key={p} value={p}>
                        Année : {p}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <select
                value={agregation}
                onChange={(e) => setAgregation(e.target.value as AgregationCarte)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-medium"
              >
                <option value="Somme">Somme</option>
                <option value="Moyenne">Moyenne</option>
              </select>
            </>
          ) : (
            <>
              <select
                value={colonneGeo}
                onChange={(e) => setChoix(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                {colonnesGeographiquesEligibles.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>

              <select
                value={agregation}
                onChange={(e) => setAgregation(e.target.value as AgregationCarte)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-medium"
              >
                <option value="Somme" disabled={!colonnesNumeriques.length}>
                  Somme cumulée
                </option>
                <option value="Moyenne" disabled={!colonnesNumeriques.length}>
                  Moyenne
                </option>
                <option value="Nombre">Nombre d’enregistrements</option>
              </select>

              {agregation !== "Nombre" && (
                <select
                  value={colonneMesure}
                  onChange={(e) => setColonneMesure(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-medium"
                >
                  {colonnesNumeriques.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

          {zonesDisponibles && (
            <select
              value={mode}
              onChange={(e) => setModeChoisi(e.target.value as "cercles" | "zones")}
              aria-label="Type de carte"
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              <option value="cercles">Cercles par lieu</option>
              <option value="zones">{NOMS_NIVEAU[niveau].colorees}</option>
            </select>
          )}

          <button
            onClick={preparerExportPptx}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              estInclusPptx
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
            }`}
          >
            <Presentation className="w-3.5 h-3.5" />
            <span>{estInclusPptx ? "✓ Inclus au PPTX" : "+ Ajouter au PPTX"}</span>
          </button>
        </div>
      </div>

      {/* Rendu Leaflet Sécurisé (zéro conflit d'instance) */}
      <div className="h-72 sm:h-96 w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 relative z-0">
        {!leafletReady ? (
          <div className="h-full w-full bg-slate-50 dark:bg-slate-900/50 flex flex-col items-center justify-center gap-2 text-xs text-slate-400 animate-pulse">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Chargement de la carte interactive...</span>
          </div>
        ) : (
          <leafletReady.MapContainer
            key={`map-container-${colonneGeo}-${periodeChoisie}-${enZones ? niveau : "cercles"}`}
            center={centreCI}
            zoom={zoomCI}
            scrollWheelZoom={false}
            dragging={typeof window !== "undefined" && window.innerWidth > 768}
            touchZoom={false}
            className="h-full w-full"
          >
            <leafletReady.TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <leafletReady.AjusterVue points={enZones ? CADRE_CI : points} />

            {enZones && (
              <leafletReady.GeoJSON
                key={`zones-${niveau}-${signatureZones}`}
                data={contoursActifs}
                style={(zone: any) => ({
                  fillColor: couleurPour(valeursZones.get(zone?.properties?.nom), classesZones),
                  fillOpacity: 0.88,
                  color: "#ffffff",
                  weight: 1.5,
                })}
                onEachFeature={(zone: any, couche: any) => {
                  const v = valeursZones.get(zone.properties.nom);
                  const ligne = document.createElement("div");
                  ligne.className = "text-xs font-sans text-slate-900 leading-tight";
                  const nom = document.createElement("strong");
                  nom.textContent = zone.properties.nom;
                  const valeur = document.createElement("span");
                  valeur.className = "block mt-0.5";
                  valeur.textContent = v === undefined ? "Sans donnée" : v.toLocaleString("fr-FR");
                  ligne.append(nom, valeur);
                  couche.bindTooltip(ligne, { sticky: true, opacity: 0.95 });
                  couche.on({
                    mouseover: () => couche.setStyle({ weight: 3, color: "#0f172a" }),
                    mouseout: () => couche.setStyle({ weight: 1.5, color: "#ffffff" }),
                  });
                }}
              />
            )}

            {!enZones && points.map((p) => {
              const r = rayonPoint(p.totalGlobal);

              return (
                <leafletReady.CircleMarker
                  key={p.nom}
                  center={[p.lat, p.lng]}
                  radius={r}
                  pathOptions={{
                    fillColor: "#2563eb",
                    color: "#1d4ed8",
                    weight: 2,
                    fillOpacity: 0.65,
                  }}
                >
                  <leafletReady.Tooltip direction="top" offset={[0, -r - 2]} opacity={0.95}>
                    <div className="text-xs font-bold font-sans text-slate-900 leading-tight">
                      <span>{p.nom}</span>
                      <span className="block font-black text-blue-600 mt-0.5">
                        {p.totalGlobal.toLocaleString("fr-FR")}
                      </span>
                    </div>
                  </leafletReady.Tooltip>

                  <leafletReady.Popup>
                    <div className="text-xs font-sans space-y-1 p-1">
                      <p className="font-bold text-slate-900 text-sm border-b pb-1">{p.nom}</p>
                      <p className="text-slate-600 pt-1">
                        Valeur :{" "}
                        <strong className="text-blue-600">
                          {p.totalGlobal.toLocaleString("fr-FR")}
                        </strong>
                      </p>
                    </div>
                  </leafletReady.Popup>
                </leafletReady.CircleMarker>
              );
            })}
          </leafletReady.MapContainer>
        )}
      </div>

      {/* Carte colorée : légende, lecture et valeurs par zone */}
      {enZones && resultatZones && (
        <div className="space-y-2 pt-1 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <span className="font-bold">
              {agregation === "Nombre" ? "Nombre de lignes" : `${agregation === "Moyenne" ? "Moyenne" : "Somme"} de ${estFormatMatriciel ? "la valeur" : colonneMesure}`} par{" "}
              {NOMS_NIVEAU[niveau].un} :
            </span>
            {classesZones.map((c) => (
              <span key={`${c.min}-${c.max}`} className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-sm border border-slate-300 dark:border-slate-600" style={{ backgroundColor: c.couleur }} />
                {c.min === c.max ? c.min.toLocaleString("fr-FR") : `${c.min.toLocaleString("fr-FR")} – ${c.max.toLocaleString("fr-FR")}`}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-sm border border-slate-300 dark:border-slate-600" style={{ backgroundColor: COULEUR_SANS_DONNEE }} />
              Sans donnée
            </span>
          </div>
          {lectureZones && (
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              <strong>Ce que montre la carte :</strong> {lectureZones}
            </p>
          )}
          {lieuxNonRattaches.length > 0 && (
            <p className="text-amber-700 dark:text-amber-400 leading-relaxed">
              <strong>{lieuxNonRattaches.length} lieu(x) non rattaché(s)</strong> à {niveau === "regions" ? "une région" : "un district"}, absents de la carte et des
              chiffres ci-dessus : {lieuxNonRattaches.slice(0, 8).join(", ")}
              {lieuxNonRattaches.length > 8 ? `… (+${lieuxNonRattaches.length - 8})` : ""}.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1 scrollbar-thin">
            {resultatZones.zones.map((z) => (
              <span
                key={z.zone}
                title={z.lieux.length > 1 || z.lieux[0] !== z.zone ? `Lieux du fichier : ${z.lieux.join(", ")}` : undefined}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px]"
              >
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: couleurPour(z.valeur, classesZones) }}></span>
                <strong>{z.zone}</strong> : <span className="font-bold font-mono">{z.valeur.toLocaleString("fr-FR")}</span>
              </span>
            ))}
          </div>
          <p className="text-[10px] text-slate-400">Contours : geoBoundaries, d&apos;après Banque mondiale (2016), licence CC BY 4.0 — tracés simplifiés.</p>
        </div>
      )}

      {/* Ruban des zones localisées */}
      {!enZones && points.length > 0 && (
        <div className="space-y-1.5 pt-1 text-xs">
          {lectureCarte && (
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              <strong>Ce que montre la carte :</strong> {lectureCarte}
            </p>
          )}
          {lieuxNonPlaces.length > 0 && (
            <p className="text-amber-700 dark:text-amber-400 leading-relaxed">
              <strong>{lieuxNonPlaces.length} lieu(x) non placé(s)</strong>, absents de la carte et des chiffres ci-dessus :{" "}
              {lieuxNonPlaces.slice(0, 8).join(", ")}
              {lieuxNonPlaces.length > 8 ? `… (+${lieuxNonPlaces.length - 8})` : ""}. Vérifiez leur orthographe.
            </p>
          )}
          <span className="font-bold text-slate-600 dark:text-slate-300">
            {points.length} lieu(x) localisé(s) sur la carte :
          </span>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1 scrollbar-thin">
            {points.map((p) => (
              <span
                key={p.nom}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px]"
              >
                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                <strong>{p.nom}</strong> :{" "}
                <span className="text-blue-600 dark:text-blue-400 font-bold font-mono">
                  {p.totalGlobal.toLocaleString("fr-FR")}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}