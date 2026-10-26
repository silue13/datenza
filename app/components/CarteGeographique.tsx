"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import { Sparkles, MapPin, Presentation } from "lucide-react";
import { trouverLieuCI, cleGeo } from "../../lib/geoci/data";
import { parseNombre, type Cellule, estValeurVide } from "../../lib/analyse/utils";
import { useData } from "../context/DataContext";

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });
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

const MAX_LIEUX = 50;

// Filtres de détection géographique
const MOTS_CLES_GEO = /(ville|city|commune|region|pays|country|departement|department|district|adresse|lieu|location|zone|secteur|territoire|localite|village|prefecture|province|quartier)/i;
const MOTS_CLES_EXCLUS = /(categorie|category|statut|status|mois|month|annee|year|commercial|vendeur|client|devise|type|produit|article|id|num|reference|ref|remise|taux)/i;

// Palette rotative pour N sources (Remplissage et Bordure)
const COULEURS_COMPARAISON = [
  { fill: "#4f46e5", border: "#3730a3" }, // Source 1 (Indigo)
  { fill: "#0891b2", border: "#0e7490" }, // Source 2 (Cyan)
  { fill: "#f59e0b", border: "#d97706" }, // Source 3 (Ambre)
  { fill: "#10b981", border: "#059669" }, // Source 4 (Émeraude)
  { fill: "#ec4899", border: "#be185d" }, // Source 5 (Rose)
  { fill: "#8b5cf6", border: "#6d28d9" }, // Source 6 (Violet)
];

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const COORDONNEES_FRANCE: Record<string, [number, number]> = {
  "ile-de-france": [48.8499, 2.637],
  idf: [48.8499, 2.637],
  paris: [48.8566, 2.3522],
  nord: [50.4, 3.1],
  sud: [43.6, 3.88],
  est: [48.6, 6.2],
  ouest: [47.8, -1.8],
  centre: [46.8, 2.4],
  "auvergne-rhone-alpes": [45.76, 4.83],
  aura: [45.76, 4.83],
  "provence-alpes-cote d'azur": [43.93, 6.06],
  paca: [43.93, 6.06],
  occitanie: [43.6, 1.44],
  "nouvelle-aquitaine": [44.83, -0.57],
  bretagne: [48.11, -1.67],
  normandie: [49.18, -0.37],
  "grand est": [48.58, 7.75],
  "hauts-de-france": [50.62, 3.05],
  "pays de la loire": [47.21, -1.55],
};

export default function CarteGeographique({ entetes, corps, onAjouterPptx }: Props) {
  const { graphiquesEpingles, epinglerGraphique } = useData();

  // Détection du mode comparaison multi-sources
  const estModeComparaison = entetes.includes("Fichier Source");
  const idxSource = entetes.indexOf("Fichier Source");

  const sourcesFichiers = useMemo(() => {
    if (!estModeComparaison || idxSource === -1) return [];
    return Array.from(new Set(corps.map((l) => String(l[idxSource] ?? "").trim()).filter(Boolean)));
  }, [estModeComparaison, idxSource, corps]);

  const estBenchmarkActif = estModeComparaison && sourcesFichiers.length >= 2;

  // Fichier étalon de référence
  const [sourceRefChoisie, setSourceRefChoisie] = useState<string>("");
  const refSource = sourcesFichiers.includes(sourceRefChoisie)
    ? sourceRefChoisie
    : sourcesFichiers[0] || "";

  // Filtrage strict des colonnes géographiques
  const colonnesGeographiquesEligibles = useMemo(() => {
    return entetes.filter((nom, idx) => {
      if (nom === "Fichier Source") return false;

      const nomNorm = nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

      if (MOTS_CLES_EXCLUS.test(nomNorm)) return false;
      if (MOTS_CLES_GEO.test(nomNorm)) return true;

      const echantillon = corps.map((ligne) => ligne[idx]).filter((v) => !estValeurVide(v));
      if (echantillon.length === 0) return false;

      const nbNombres = echantillon.filter((v) => parseNombre(v) !== null).length;
      if (nbNombres / echantillon.length >= 0.5) return false;

      const echantillonTexte = echantillon.slice(0, 15).map((l) => String(l).trim().toLowerCase());
      return echantillonTexte.some(
        (v) =>
          trouverLieuCI(v) !== null ||
          COORDONNEES_FRANCE[cleGeo(v)] !== undefined ||
          /abidjan|paris|bouake|lyon|marseille|yamoussoukro|daloa|bordeaux/i.test(v)
      );
    });
  }, [entetes, corps]);

  const defaut = useMemo(() => {
    const prioVille = colonnesGeographiquesEligibles.find((h) => /(ville|city|commune)/i.test(h));
    if (prioVille) return prioVille;

    const prioGeo = colonnesGeographiquesEligibles.find((h) => MOTS_CLES_GEO.test(h));
    if (prioGeo) return prioGeo;

    return colonnesGeographiquesEligibles[0] || "";
  }, [colonnesGeographiquesEligibles]);

  const [choix, setChoix] = useState<string | null>(null);
  const colonneGeo = choix !== null && colonnesGeographiquesEligibles.includes(choix) ? choix : defaut;

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

  // Détection du territoire d'atterrissage
  const contexteTerritorial = useMemo<"FR" | "CI" | "MONDE">(() => {
    const idx = entetes.indexOf(colonneGeo);
    if (idx === -1) return "MONDE";

    const valeursLieux = corps.map((r) => String(r[idx] ?? "").toLowerCase().trim());
    const aIndicesFrance = valeursLieux.some((v) =>
      /ile-de-france|idf|paris|lyon|marseille|bretagne|normandie|bordeaux|nord|sud|est|ouest/i.test(v)
    );
    const aIndicesCI = valeursLieux.some((v) =>
      /abidjan|yamoussoukro|bouake|san-pedro|korhogo|gagnoa|daloa/i.test(v)
    );

    if (aIndicesFrance && !aIndicesCI) return "FR";
    if (aIndicesCI && !aIndicesFrance) return "CI";
    return "MONDE";
  }, [entetes, corps, colonneGeo]);

  // Agrégation des points par lieu et par source
  const donneesAgregees = useMemo(() => {
    const idxGeo = entetes.indexOf(colonneGeo);
    if (idxGeo === -1) return [] as { nom: string; totalGlobal: number; parSource: Record<string, number> }[];

    const idxMesure = entetes.indexOf(colonneMesure);
    const mapLieux = new Map<string, { totalSomme: number; totalN: number; totalCompte: number; sources: Map<string, { somme: number; n: number; compte: number }> }>();

    for (const ligne of corps) {
      const lieu = String(ligne[idxGeo] ?? "").trim();
      if (!lieu || lieu === "—" || lieu === "-") continue;

      const sourceActuelle = estModeComparaison && idxSource >= 0 ? String(ligne[idxSource] ?? "").trim() : "Defaut";

      let gLieu = mapLieux.get(lieu);
      if (!gLieu) {
        gLieu = { totalSomme: 0, totalN: 0, totalCompte: 0, sources: new Map() };
        mapLieux.set(lieu, gLieu);
      }

      gLieu.totalCompte++;
      let gSrc = gLieu.sources.get(sourceActuelle);
      if (!gSrc) {
        gSrc = { somme: 0, n: 0, compte: 0 };
        gLieu.sources.set(sourceActuelle, gSrc);
      }
      gSrc.compte++;

      if (agregation !== "Nombre" && idxMesure >= 0) {
        const val = nombreCellule(ligne[idxMesure]);
        if (val !== null) {
          gLieu.totalSomme += val;
          gLieu.totalN++;
          gSrc.somme += val;
          gSrc.n++;
        }
      }
    }

    const calculerValeurFinale = (g: { somme: number; n: number; compte: number }) => {
      if (agregation === "Nombre") return g.compte;
      if (agregation === "Moyenne") return g.n ? Math.round((g.somme / g.n) * 100) / 100 : 0;
      return Math.round(g.somme * 100) / 100;
    };

    setEstDejaInclus(false);

    return Array.from(mapLieux.entries())
      .map(([nom, gLieu]) => {
        const parSource: Record<string, number> = {};
        for (const [srcNom, gSrc] of gLieu.sources.entries()) {
          parSource[srcNom] = calculerValeurFinale(gSrc);
        }

        const totalGlobal = calculerValeurFinale({
          somme: gLieu.totalSomme,
          n: gLieu.totalN,
          compte: gLieu.totalCompte,
        });

        return { nom, totalGlobal, parSource };
      })
      .sort((a, b) => b.totalGlobal - a.totalGlobal)
      .slice(0, MAX_LIEUX);
  }, [entetes, corps, colonneGeo, colonneMesure, agregation, estModeComparaison, idxSource]);

  function resoudreCoordonnees(nom: string): [number, number] | null {
    const cle = cleGeo(nom);
    if (contexteTerritorial === "FR" && COORDONNEES_FRANCE[cle]) return COORDONNEES_FRANCE[cle];
    if (contexteTerritorial === "CI") {
      const lieuCI = trouverLieuCI(nom);
      if (lieuCI) return lieuCI;
    }
    if (COORDONNEES_FRANCE[cle]) return COORDONNEES_FRANCE[cle];
    const lieuCI = trouverLieuCI(nom);
    if (lieuCI) return lieuCI;
    return null;
  }

  const inconnus = useMemo(
    () => donneesAgregees.map((d) => d.nom).filter((nom) => !resoudreCoordonnees(nom)),
    [donneesAgregees, contexteTerritorial]
  );

  // Géocodage asynchrone OpenStreetMap (fallback)
  useEffect(() => {
    let annule = false;
    async function executer() {
      for (const nom of inconnus) {
        if (annule) return;
        if (demandes.current.has(nom)) continue;
        demandes.current.add(nom);

        let resultat: { lat: number; lng: number } | null = null;
        try {
          const suffixePays =
            contexteTerritorial === "FR" ? ", France" : contexteTerritorial === "CI" ? ", Côte d'Ivoire" : "";
          const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
            nom + suffixePays
          )}`;
          const res = await fetch(url, { headers: { "Accept-Language": "fr" } });
          if (res.ok) {
            const data = (await res.json()) as { lat: string; lon: string }[];
            if (data.length > 0) {
              resultat = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            }
          }
        } catch {
          resultat = null;
        }

        if (!annule) {
          setExternes((prev) => ({ ...prev, [nom]: resultat }));
        }
        await pause(1050);
      }
    }
    void executer();
    return () => {
      annule = true;
    };
  }, [inconnus, contexteTerritorial]);

  // Construction des points cartographiques pour N sources
  const points = useMemo<PointComparatif[]>(() => {
    const pts: PointComparatif[] = [];

    for (const d of donneesAgregees) {
      const coord = resoudreCoordonnees(d.nom) || (externes[d.nom] ? [externes[d.nom]!.lat, externes[d.nom]!.lng] : null);
      if (!coord) continue;

      let leader = sourcesFichiers[0] || "Général";
      let maxVal = -Infinity;
      let minVal = Infinity;

      sourcesFichiers.forEach((src) => {
        const v = d.parSource[src] || 0;
        if (v > maxVal) {
          maxVal = v;
          leader = src;
        }
        if (v < minVal) {
          minVal = v;
        }
      });

      const valeurLeader = maxVal === -Infinity ? 0 : maxVal;
      const amplitude = Math.round((valeurLeader - (minVal === Infinity ? 0 : minVal)) * 100) / 100;

      // Écart par rapport au fichier de référence
      const vRef = d.parSource[refSource] || 0;
      const ecartVsRef = Math.round((valeurLeader - vRef) * 100) / 100;
      const variationPctVsRef = vRef > 0 ? Math.round((ecartVsRef / vRef) * 1000) / 10 : 0;

      pts.push({
        nom: d.nom,
        lat: coord[0],
        lng: coord[1],
        totalGlobal: d.totalGlobal,
        valeursParSource: d.parSource,
        leader,
        valeurLeader,
        amplitude,
        ecartVsRef,
        variationPctVsRef,
      });
    }

    return pts;
  }, [donneesAgregees, externes, sourcesFichiers, refSource, contexteTerritorial]);

  const maxValMesure = useMemo(() => {
    if (!points.length) return 1;
    let m = 0;
    points.forEach((p) => {
      Object.values(p.valeursParSource).forEach((v) => {
        if (v > m) m = v;
      });
      if (p.totalGlobal > m) m = p.totalGlobal;
    });
    return m || 1;
  }, [points]);

  const rayonPoint = (val: number) => {
    const ratio = Math.max(0, val / maxValMesure);
    return Math.round(6 + ratio * 22);
  };

  // Diagnostic comparatif exhaustif (pour N >= 2 sources)
  const analyseBenchmark = useMemo(() => {
    if (!estBenchmarkActif || sourcesFichiers.length < 2 || points.length === 0) return null;

    const victoiresParSource: Record<string, number> = {};
    sourcesFichiers.forEach((s) => (victoiresParSource[s] = 0));

    let plusGrosEcart = points[0];

    points.forEach((p) => {
      if (p.leader && victoiresParSource[p.leader] !== undefined) {
        victoiresParSource[p.leader]++;
      }
      if (p.amplitude > plusGrosEcart.amplitude) {
        plusGrosEcart = p;
      }
    });

    const classementVictoires = Object.entries(victoiresParSource).sort((a, b) => b[1] - a[1]);
    const grandGagnant = classementVictoires[0];

    return {
      victoiresParSource,
      classementVictoires,
      grandGagnant,
      plusGrosEcart,
      nbZones: points.length,
    };
  }, [estBenchmarkActif, sourcesFichiers, points]);

  // ID unique pour le suivi d'inclusion PPTX
  const idGraphiqueCarte = `carte-geo-${colonneGeo}-${agregation}-${colonneMesure || "compte"}`;

 const estInclusPptx = useMemo(() => {
    return (
      (graphiquesEpingles || []).some((g) => String(g.id) === String(idGraphiqueCarte)) || estDejaInclus
    );
  }, [graphiquesEpingles, idGraphiqueCarte, estDejaInclus]);
  // Préparation et conversion automatique de la carte pour PowerPoint
  const preparerExportPptx = () => {
    if (!points.length) return;
    const topPoints = points.slice(0, 10);
    const labels = topPoints.map((p) => p.nom);

    let datasets: { label: string; data: number[]; backgroundColor?: string; borderColor?: string }[] = [];

    if (estBenchmarkActif && sourcesFichiers.length >= 2) {
      datasets = sourcesFichiers.map((src, i) => {
        const couleur = COULEURS_COMPARAISON[i % COULEURS_COMPARAISON.length];
        return {
          label: src,
          data: topPoints.map((p) => p.valeursParSource[src] || 0),
          backgroundColor: couleur.fill,
          borderColor: couleur.border,
        };
      });
    } else {
      datasets = [
        {
          label: agregation === "Nombre" ? "Nombre d'enregistrements" : `${agregation} — ${colonneMesure}`,
          data: topPoints.map((p) => p.totalGlobal),
          backgroundColor: "#0891b2",
          borderColor: "#0e7490",
        },
      ];
    }

    const titrePptx = estBenchmarkActif
      ? `Benchmark Spatial : ${agregation === "Nombre" ? "Effectifs" : agregation + " de " + colonneMesure} par ${colonneGeo}`
      : `Synthèse Géographique : ${agregation === "Nombre" ? "Effectifs" : agregation + " de " + colonneMesure} par ${colonneGeo}`;

    const interpretation = estBenchmarkActif
      ? `Confrontation territoriale sur les ${topPoints.length} premiers pôles géographiques.\n\nLeader spatial : « ${analyseBenchmark?.grandGagnant?.[0] || topPoints[0]?.nom || ""} » avec ${analyseBenchmark?.grandGagnant?.[1] || 1} zone(s) dominée(s).`
      : `Répartition spatiale sur les ${topPoints.length} premiers territoires.\n\nPôle dominant : « ${topPoints[0]?.nom || ""} » avec ${topPoints[0]?.totalGlobal.toLocaleString("fr-FR")} enregistrés.`;

    const objetExport = {
      id: idGraphiqueCarte,
      titre: titrePptx,
      type: "Barres",
      chartType: "bar",
      labels,
      datasets,
      interpretation,
    };

    if (onAjouterPptx) {
      onAjouterPptx(objetExport);
    }
    if (epinglerGraphique) {
      epinglerGraphique(objetExport as any);
    }
    setEstDejaInclus(true);
  };

  const centreDefaut: [number, number] = contexteTerritorial === "FR" ? [46.8, 2.5] : [7.54, -5.55];
  const zoomDefaut = contexteTerritorial === "FR" ? 5 : 6;

  return (
    <div className="bloc-carte-print print-eviter-coupure bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
      {/* En-tête de la carte */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {estBenchmarkActif
                ? `Cartographie Comparative des Territoires (${sourcesFichiers.length} fichiers)`
                : `Carte géographique — ${colonneGeo}`}
            </h3>
            <p className="text-xs text-slate-400">
              {estBenchmarkActif
                ? "Confrontation géographique multi-sources (cercles concentriques imbriqués du plus grand au plus petit)"
                : "Répartition spatiale et concentration territoriale"}
            </p>
          </div>
        </div>

        {/* Sélecteurs de configuration & Bouton PPTX */}
        <div className="no-print flex flex-wrap items-center gap-2">
          {estBenchmarkActif && (
            <select
              value={refSource}
              onChange={(e) => setSourceRefChoisie(e.target.value)}
              className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg p-2 text-xs font-bold text-indigo-700 dark:text-indigo-300"
            >
              {sourcesFichiers.map((s) => (
                <option key={s} value={s}>Réf : {s}</option>
              ))}
            </select>
          )}

          <select
            value={colonneGeo}
            onChange={(e) => setChoix(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold text-purple-700 dark:text-purple-300"
          >
            {colonnesGeographiquesEligibles.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>

          <select
            value={agregation}
            onChange={(e) => {
              const val = e.target.value as AgregationCarte;
              setAgregation(val);
              if (val !== "Nombre" && !colonneMesure && colonnesNumeriques.length) {
                setColonneMesure(colonnesNumeriques[0]);
              }
            }}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-medium"
          >
            <option value="Somme" disabled={!colonnesNumeriques.length}>Somme cumulée</option>
            <option value="Moyenne" disabled={!colonnesNumeriques.length}>Moyenne</option>
            <option value="Nombre">Nombre d’enregistrements</option>
          </select>

          {agregation !== "Nombre" && (
            <select
              value={colonneMesure}
              onChange={(e) => setColonneMesure(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-medium"
            >
              {colonnesNumeriques.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          )}

          {/* Bouton d'ajout au PowerPoint */}
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

      {/* Légende comparative multi-sources */}
      {estBenchmarkActif && (
        <div className="flex flex-wrap items-center gap-3 text-xs font-bold pt-1">
          <span className="text-slate-400 text-[11px] uppercase tracking-wider">Légende :</span>
          {sourcesFichiers.map((src, i) => {
            const couleur = COULEURS_COMPARAISON[i % COULEURS_COMPARAISON.length];
            const estRef = src === refSource;
            return (
              <div key={src} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-full border shadow-xs"
                  style={{ backgroundColor: couleur.fill, borderColor: couleur.border }}
                />
                <span className={`text-slate-700 dark:text-slate-300 ${estRef ? "font-black underline decoration-purple-500" : ""}`}>
                  {src} {estRef && <span className="text-[10px] text-purple-600 dark:text-purple-400">(Réf)</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Rendu Leaflet */}
      {colonneGeo === "" ? (
        <p className="text-xs text-slate-500 p-4 border border-dashed rounded-xl">
          Aucune colonne géographique reconnue.
        </p>
      ) : (
        <div className="h-80 w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 relative z-0">
          <MapContainer center={centreDefaut} zoom={zoomDefaut} scrollWheelZoom={false} className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <AjusterVue points={points} />

            {/* Rendu des points */}
            {points.map((p) => {
              if (estBenchmarkActif) {
                const itemsTries = sourcesFichiers
                  .map((src, i) => ({
                    nom: src,
                    val: p.valeursParSource[src] || 0,
                    couleur: COULEURS_COMPARAISON[i % COULEURS_COMPARAISON.length],
                    estRef: src === refSource,
                  }))
                  .sort((a, b) => b.val - a.val);

                return (
                  <div key={p.nom}>
                    {itemsTries.map((item, idx) => {
                      const opacite = idx === 0 ? 0.4 : 0.65 + (idx / itemsTries.length) * 0.25;

                      return (
                        <CircleMarker
                          key={`${p.nom}-${item.nom}`}
                          center={[p.lat, p.lng]}
                          radius={rayonPoint(item.val)}
                          pathOptions={{
                            fillColor: item.couleur.fill,
                            color: item.couleur.border,
                            weight: item.estRef ? 2.5 : 1.5,
                            fillOpacity: opacite,
                          }}
                        >
                          <Popup>
                            <div className="text-xs font-sans space-y-1.5 p-0.5 min-w-[180px]">
                              <div className="border-b pb-1">
                                <p className="font-bold text-slate-900 text-sm">{p.nom}</p>
                                <p className="text-[10px] text-slate-400">
                                  {agregation} : {colonneMesure || "Enregistrements"}
                                </p>
                              </div>

                              <div className="space-y-1 pt-0.5">
                                {sourcesFichiers.map((src, i) => {
                                  const v = p.valeursParSource[src] || 0;
                                  const c = COULEURS_COMPARAISON[i % COULEURS_COMPARAISON.length];
                                  const estLeader = src === p.leader;

                                  return (
                                    <div key={src} className="flex justify-between items-center text-[11px]">
                                      <span style={{ color: c.fill }} className="font-semibold flex items-center gap-1">
                                        {src} {estLeader && <span className="text-[9px] px-1 bg-amber-100 text-amber-800 rounded font-bold">1er</span>}
                                      </span>
                                      <span className="font-mono font-bold text-slate-800">
                                        {v.toLocaleString("fr-FR")}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="pt-1.5 border-t text-[11px] font-bold text-slate-700 flex justify-between items-center">
                                <span>Leader ({p.leader}) vs {refSource} :</span>
                                <span className={p.ecartVsRef >= 0 ? "text-emerald-600 font-mono" : "text-rose-600 font-mono"}>
                                  {p.ecartVsRef >= 0 ? `+${p.ecartVsRef.toLocaleString("fr-FR")}` : `-${p.ecartVsRef.toLocaleString("fr-FR")}`} ({p.variationPctVsRef >= 0 ? "+" : ""}{p.variationPctVsRef} %)
                                </span>
                              </div>
                            </div>
                          </Popup>
                        </CircleMarker>
                      );
                    })}
                  </div>
                );
              }

              return (
                <CircleMarker
                  key={p.nom}
                  center={[p.lat, p.lng]}
                  radius={rayonPoint(p.totalGlobal)}
                  pathOptions={{
                    fillColor: "#7c3aed",
                    color: "#5b21b6",
                    weight: 2,
                    fillOpacity: 0.7,
                  }}
                >
                  <Popup>
                    <div className="text-xs font-semibold p-1">
                      <p className="text-purple-700 font-bold">{p.nom}</p>
                      <p className="text-slate-700 mt-0.5">
                        {p.totalGlobal.toLocaleString("fr-FR")}{" "}
                        {agregation === "Nombre" ? "enregistrements" : `(${agregation} de ${colonneMesure})`}
                      </p>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      )}

      {/* Synthèse comparative multi-sources */}
      {analyseBenchmark ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 p-4 space-y-2.5 text-xs leading-relaxed">
          <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <h5 className="font-bold text-slate-800 dark:text-slate-200">
              Diagnostic territorial comparatif ({sourcesFichiers.length} fichiers confrontés) :
            </h5>
          </div>

          <p className="text-slate-600 dark:text-slate-400">
            Confrontation spatiale sur <strong>{analyseBenchmark.nbZones} zones géographiques</strong>.
          </p>

          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-start gap-1.5">
              <span className="font-bold text-indigo-600">•</span>
              <p className="text-slate-700 dark:text-slate-300">
                <strong>Répartition de la domination territoriale : </strong>
                {analyseBenchmark.classementVictoires.map(([nom, victoires], i) => (
                  <span key={nom}>
                    <strong>« {nom} »</strong> mène sur {victoires} zone(s)
                    {i < analyseBenchmark.classementVictoires.length - 1 ? ", " : "."}
                  </span>
                ))}
              </p>
            </div>

            <div className="flex items-start gap-1.5">
              <span className="font-bold text-indigo-600">•</span>
              <p className="text-slate-700 dark:text-slate-300">
                <strong>Leader spatial global : </strong>
                <strong>« {analyseBenchmark.grandGagnant[0]} »</strong> domine la couverture géographique avec {analyseBenchmark.grandGagnant[1]} zone(s) en première position sur {analyseBenchmark.nbZones}.
              </p>
            </div>

            <div className="flex items-start gap-1.5">
              <span className="font-bold text-indigo-600">•</span>
              <p className="text-slate-700 dark:text-slate-300">
                <strong>Plus forte divergence territoriale : </strong>
                La zone <strong>« {analyseBenchmark.plusGrosEcart.nom} »</strong> enregistre le contraste le plus marqué avec une amplitude de <strong>{analyseBenchmark.plusGrosEcart.amplitude.toLocaleString("fr-FR")}</strong> entre la source en tête (<strong>{analyseBenchmark.plusGrosEcart.leader}</strong>) et la source la plus faible.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>{points.length} zone(s) localisée(s)</span>
        </div>
      )}
    </div>
  );
}