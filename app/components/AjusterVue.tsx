"use client";
import { useEffect } from "react";
import { useMap } from "react-leaflet";

/**
 * Recadre la carte sur les lieux localisés, qu'ils soient en Côte d'Ivoire ou ailleurs dans le monde.
 *
 * Le recadrage se fait sans animation : un zoom animé de Leaflet programme un minuteur de 250 ms
 * que `map.remove()` n'annule pas. Si la carte est démontée entre-temps (changement de `key` du
 * MapContainer : colonne, période, cercles/zones), ce minuteur s'exécute sur une carte détruite et
 * lève « Cannot read properties of undefined (reading '_leaflet_pos') ».
 */
export default function AjusterVue({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    let actif = true;

    map.whenReady(() => {
      // Carte démontée, ou conteneur détaché du DOM, avant que le recadrage ne s'exécute
      if (!actif || !(map as unknown as { _mapPane?: HTMLElement })._mapPane || !map.getContainer()?.isConnected) return;
      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 6, { animate: false });
        return;
      }
      map.fitBounds(
        points.map((p) => [p.lat, p.lng] as [number, number]),
        { padding: [30, 30], maxZoom: 8, animate: false }
      );
    });

    return () => {
      actif = false;
    };
  }, [map, points]);
  return null;
}
