"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import { MapPin, Presentation, Calendar } from "lucide-react";
import { trouverLieuCI, cleGeo, PAYS_DU_MONDE } from "../../lib/geoci/data";
// APRÈS
import { parseNombre, type Cellule, estValeurVide, arrondir } from "../../lib/analyse/utils";
import { useData } from "../context/DataContext";

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });
const Tooltip = dynamic(() => import("react-leaflet").then((m) => m.Tooltip), { ssr: false });
const AjusterVue = dynamic(() => import("./AjusterVue"), { ssr: false });

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

const COULEURS_COMPARAISON = [
  { fill: "#2563eb", border: "#1d4ed8" },
  { fill: "#0891b2", border: "#0e7490" },
  { fill: "#d97706", border: "#b45309" },
  { fill: "#059669", border: "#047857" },
  { fill: "#dc2626", border: "#b91c1c" },
  { fill: "#7c3aed", border: "#6d28d9" },
];

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function estDansFrontieresCI(lat: number, lng: number): boolean {
  return lat >= 4.2 && lat <= 10.9 && lng >= -8.7 && lng <= -2.4;
}

export default function CarteGeographique({ entetes, corps, onAjouterPptx }: Props) {
  const { graphiquesEpingles, epinglerGraphique } = useData();

  const estModeComparaison = entetes.includes("Fichier Source");
  const idxSource = entetes.indexOf("Fichier Source");

  const sourcesFichiers = useMemo(() => {
    if (!estModeComparaison || idxSource === -1) return [];
    return Array.from(new Set(corps.map((l) => String(l[idxSource] ?? "").trim()).filter(Boolean)));
  }, [estModeComparaison, idxSource, corps]);

  const estBenchmarkActif = estModeComparaison && sourcesFichiers.length >= 2;

  const [sourceRefChoisie, setSourceRefChoisie] = useState<string>("");
  const refSource = sourcesFichiers.includes(sourceRefChoisie)
    ? sourceRefChoisie
    : sourcesFichiers[0] || "";

  // 1. DÉTECTION DU FORMAT MATRICIEL (Les colonnes elles-mêmes sont des villes/stations CI)
  const colonnesEnTetesGeographiques = useMemo(() => {
    return entetes.filter((h) => {
      if (h === "Fichier Source") return false;
      return trouverLieuCI(h) !== null;
    });
  }, [entetes]);

  const estFormatMatriciel = colonnesEnTetesGeographiques.length >= 2;

  // 2. DÉTECTION DU FORMAT STANDARD (Une colonne de lieux textuels en lignes)
  const colonnesGeographiquesEligibles = useMemo(() => {
    return entetes.filter((nom, idx) => {
      if (nom === "Fichier Source") return false;

      const echantillon = corps.map((ligne) => ligne[idx]).filter((v) => !estValeurVide(v));
      if (echantillon.length === 0) return false;

      // FILTRAGE STRICT : Une colonne dont les valeurs sont des nombres ou des années n'est JAMAIS géographique
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

  // Sélecteur pour le format standard
  const defautStandard = useMemo(() => {
    return colonnesGeographiquesEligibles[0] || "";
  }, [colonnesGeographiquesEligibles]);

  const [choix, setChoix] = useState<string | null>(null);
  const colonneGeo = choix !== null && colonnesGeographiquesEligibles.includes(choix) ? choix : defautStandard;

  // Sélecteur de période en format matriciel (ex: 2022, 2021...)
  const periodesDisponibles = useMemo(() => {
    if (!estFormatMatriciel || corps.length === 0) return [];
    // La 1re colonne non géographique contient généralement l'année/la période
    const idxPeriode = entetes.findIndex((h) => !colonnesEnTetesGeographiques.includes(h) && h !== "Fichier Source");
    if (idxPeriode === -1) return [];
    const vals = Array.from(new Set(corps.map((l) => String(l[idxPeriode] ?? "").trim()).filter(Boolean)));
    return vals;
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

    // CAS A : FORMAT MATRICIEL (Les colonnes représentent les villes/stations)
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

    // CAS B : FORMAT STANDARD (Une colonne de lieux en lignes)
    const idxGeo = entetes.indexOf(colonneGeo);
    if (idxGeo === -1) return [];

    const idxMesure = entetes.indexOf(colonneMesure);
    const mapLieux = new Map<string, { totalSomme: number; totalN: number; totalCompte: number }>();

    for (const ligne of corps) {
      const lieu = String(ligne[idxGeo] ?? "").replace(/["'«»“”]/g, "").trim();
      // GARDE-FOU : Écarte formellement les années et les nombres purs
      if (!lieu || /^\d+$/.test(lieu) || lieu === "—" || lieu === "-" || /^total/i.test(lieu)) continue;

      let gLieu = mapLieux.get(lieu);
      if (!gLieu) {
        gLieu = { totalSomme: 0, totalN: 0, totalCompte: 0 };
        mapLieux.set(lieu, gLieu);
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

    Array.from(mapLieux.entries()).forEach(([nom, g]) => {
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

  // 4. GÉOCODAGE OPENSTREETMAP SÉCURISÉ (Ne géocode JAMAIS des chiffres ou années)
  useEffect(() => {
    if (estFormatMatriciel) return;
    let annule = false;

    async function executer() {
      const idxGeo = entetes.indexOf(colonneGeo);
      if (idxGeo === -1) return;

      const candidats = Array.from(new Set(corps.map((l) => String(l[idxGeo] ?? "").trim())));

      for (const nom of candidats) {
        if (annule) return;
        // Interdiction formelle de chercher des années ou des nombres purs
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

  const idGraphiqueCarte = `carte-geo-${estFormatMatriciel ? "stations-colonnes" : colonneGeo}-${agregation}`;
  const estInclusPptx =
    (graphiquesEpingles || []).some((g) => String(g.id) === String(idGraphiqueCarte)) || estDejaInclus;

  const preparerExportPptx = () => {
    if (!points.length || !onAjouterPptx) return;
    const topPoints = points.slice(0, 10);
    const labels = topPoints.map((p) => p.nom);

    const objetExport = {
      id: idGraphiqueCarte,
      titre: estFormatMatriciel
        ? `Répartition Spatiale des Stations (${periodeChoisie === "Toutes" ? "Cumul" : periodeChoisie})`
        : `Synthèse Territoriale : ${agregation} de ${colonneMesure || "volumes"} par ${colonneGeo}`,
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

    onAjouterPptx(objetExport as any);
    if (epinglerGraphique) epinglerGraphique(objetExport as any);
    setEstDejaInclus(true);
  };

  // GARDE-FOU : Aucune donnée géographique
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
    <div className="bloc-carte-print print-eviter-coupure bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {estFormatMatriciel
                ? `Cartographie des Stations (${colonnesEnTetesGeographiques.length} pôles localisés)`
                : `Carte géographique — ${colonneGeo}`}
            </h3>
            <p className="text-xs text-slate-400">
              {estFormatMatriciel
                ? "Données matricielles : chaque colonne correspond à une station géographique officielle"
                : "Répartition spatiale et concentration territoriale"}
            </p>
          </div>
        </div>

        {/* Contrôles interactifs */}
        <div className="no-print print:hidden flex flex-wrap items-center gap-2">
          {/* FORMAT MATRICIEL : Sélecteur de période */}
          {estFormatMatriciel ? (
            <>
              {periodesDisponibles.length > 0 && (
                <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg px-2.5 py-1.5">
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
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-medium"
              >
                <option value="Somme">Somme</option>
                <option value="Moyenne">Moyenne</option>
              </select>
            </>
          ) : (
            /* FORMAT STANDARD : Sélecteurs habituels */
            <>
              <select
                value={colonneGeo}
                onChange={(e) => setChoix(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold text-slate-700 dark:text-slate-300"
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
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-medium"
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
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-medium"
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

          <button
            onClick={preparerExportPptx}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer ${
              estInclusPptx
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
            }`}
          >
            <Presentation className="w-3.5 h-3.5" />
            {estInclusPptx ? "✓ Inclus au PPTX" : "+ Ajouter au PPTX"}
          </button>
        </div>
      </div>

      {/* Rendu Leaflet */}
      <div className="h-72 sm:h-96 w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 relative z-0">
        <MapContainer
          center={centreCI}
          zoom={zoomCI}
          scrollWheelZoom={false}
          dragging={typeof window !== "undefined" && window.innerWidth > 768}
          touchZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <AjusterVue points={points} />

          {points.map((p) => {
            const r = rayonPoint(p.totalGlobal);

            return (
              <CircleMarker
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
                <Tooltip direction="top" offset={[0, -r - 2]} opacity={0.95}>
                  <div className="text-xs font-bold font-sans text-slate-900 leading-tight">
                    <span>{p.nom}</span>
                    <span className="block font-black text-blue-600 mt-0.5">
                      {p.totalGlobal.toLocaleString("fr-FR")}
                    </span>
                  </div>
                </Tooltip>

                <Popup>
                  <div className="text-xs font-sans space-y-1 p-1">
                    <p className="font-bold text-slate-900 text-sm border-b pb-1">{p.nom}</p>
                    <p className="text-slate-600 pt-1">
                      Valeur :{" "}
                      <strong className="text-blue-600">
                        {p.totalGlobal.toLocaleString("fr-FR")}
                      </strong>
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {/* Ruban des zones localisées */}
      {points.length > 0 && (
        <div className="space-y-1.5 pt-1 text-xs">
          <span className="font-bold text-slate-600 dark:text-slate-300">
            {points.length} station(s) localisée(s) en Côte d&apos;Ivoire :
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