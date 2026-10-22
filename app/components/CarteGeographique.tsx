"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import { trouverLieuCI, cleGeo } from "../../lib/geoci/data";
import { lireGeoStrict } from "../../lib/prefs";
import type { Cellule } from "../../lib/analyse/utils";

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });

interface Props {
  entetes: string[];
  corps: Cellule[][];
}

interface PointLocalise {
  nom: string;
  lat: number;
  lng: number;
  total: number;
}

const MAX_LIEUX = 40; // Nominatim : 1 requête/seconde maximum, on limite donc le nombre de lieux inconnus
const RE_GEO = /(pays|country|ville|city|region|departement|department|commune|localite|locality|village|prefecture|district|province|quartier|adresse|lieu|location|aeroport|airport)/;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function CarteGeographique({ entetes, corps }: Props) {
  const defaut = useMemo(() => entetes.find((h) => RE_GEO.test(cleGeo(h))) ?? "", [entetes]);
  const [choix, setChoix] = useState<string | null>(null);
  const colonneGeo = choix !== null && entetes.includes(choix) ? choix : defaut;
  // lieu -> coordonnées trouvées via Nominatim (null = introuvable)
  const [externes, setExternes] = useState<Record<string, { lat: number; lng: number } | null>>({});
  const demandes = useRef(new Set<string>());

  // Décompte des valeurs de la colonne choisie (les plus fréquentes d'abord).
  const decompte = useMemo(() => {
    const idx = entetes.indexOf(colonneGeo);
    if (idx === -1) return [] as [string, number][];
    const m = new Map<string, number>();
    for (const ligne of corps) {
      const v = String(ligne[idx] ?? "").trim();
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_LIEUX);
  }, [entetes, corps, colonneGeo]);

  const inconnus = useMemo(() => decompte.map(([nom]) => nom).filter((nom) => !trouverLieuCI(nom)), [decompte]);

  // Géocodage Nominatim des lieux absents du référentiel, un par seconde, annulable.
  useEffect(() => {
    let annule = false;
    async function executer() {
      const strict = lireGeoStrict();
      for (const nom of inconnus) {
        if (annule) return;
        if (demandes.current.has(nom)) continue;
        demandes.current.add(nom);
        let resultat: { lat: number; lng: number } | null = null;
        try {
          const url =
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(nom)}` +
            (strict ? "&countrycodes=ci" : "");
          const res = await fetch(url);
          if (res.ok) {
            const data = (await res.json()) as { lat: string; lon: string }[];
            if (data.length > 0) resultat = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          }
        } catch {
          resultat = null;
        }
        setExternes((prev) => ({ ...prev, [nom]: resultat })); // on garde le résultat même si la liste a changé
        await pause(1100);
      }
    }
    void executer();
    return () => {
      annule = true;
    };
  }, [inconnus]);

  const { points, nonLocalises, enAttente } = useMemo(() => {
    const pts: PointLocalise[] = [];
    let manques = 0;
    let attente = 0;
    for (const [nom, total] of decompte) {
      const local = trouverLieuCI(nom);
      if (local) {
        pts.push({ nom, lat: local[0], lng: local[1], total });
      } else if (nom in externes) {
        const e = externes[nom];
        if (e) pts.push({ nom, lat: e.lat, lng: e.lng, total });
        else manques++;
      } else {
        attente++;
      }
    }
    return { points: pts, nonLocalises: manques, enAttente: attente };
  }, [decompte, externes]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-purple-600 text-base">🗺️</span>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Carte géographique{colonneGeo ? ` — ${colonneGeo}` : ""}
          </h3>
        </div>

        <select
          value={colonneGeo}
          onChange={(e) => setChoix(e.target.value)}
          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-medium"
        >
          {colonneGeo === "" && <option value="">Choisir une colonne…</option>}
          {entetes.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
      </div>

      {colonneGeo === "" ? (
        <p className="text-xs text-slate-500">
          Aucune colonne géographique détectée automatiquement (région, ville, commune, pays…). Choisis-en une dans la liste.
        </p>
      ) : (
        <div className="h-80 w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 relative">
          <MapContainer center={[7.54, -5.55]} zoom={6} scrollWheelZoom={false} className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {points.map((p) => (
              <CircleMarker
                key={p.nom}
                center={[p.lat, p.lng]}
                radius={Math.min(8 + Math.sqrt(p.total) * 2, 28)}
                pathOptions={{ fillColor: "#8b5cf6", color: "#6d28d9", weight: 2, fillOpacity: 0.65 }}
              >
                <Popup>
                  <div className="text-xs font-semibold p-1">
                    <p className="text-purple-700 font-bold">{p.nom}</p>
                    <p>{p.total} occurrence(s)</p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
        <span className="font-medium text-slate-600 dark:text-slate-400">
          {points.length} lieu(x) localisé(s)
          {nonLocalises > 0 && ` • ${nonLocalises} non localisé(s)`}
          {enAttente > 0 && ` • ${enAttente} en cours de recherche…`}
        </span>
        <div className="flex gap-3 overflow-x-auto">
          {[...points].sort((a, b) => b.total - a.total).slice(0, 5).map((p, i) => (
            <span key={p.nom} className="font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
              {i + 1}. {p.nom} — <strong className="text-purple-600">{p.total}</strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
