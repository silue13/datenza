"use client";
import { useEffect } from "react";
import { useMap } from "react-leaflet";

/** Recadre la carte sur les lieux localisés, qu'ils soient en Côte d'Ivoire ou ailleurs dans le monde. */
export default function AjusterVue({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 6);
      return;
    }
    map.fitBounds(
      points.map((p) => [p.lat, p.lng] as [number, number]),
      { padding: [30, 30], maxZoom: 8 }
    );
  }, [map, points]);
  return null;
}