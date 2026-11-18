// lib/analyse/imageCarte.ts — capture d'une carte Leaflet affichée (fond de carte, zones et cercles) dans un canevas.
// Les tuiles du fond de carte sont rechargées en mode CORS pour que l'image reste exportable.

const RESOLUTION = 2;

function chargerImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Dessine la carte telle qu'elle est affichée. `conteneur` est l'élément `.leaflet-container`. */
export async function capturerCarte(conteneur: HTMLElement): Promise<{ canvas: HTMLCanvasElement; largeurCss: number }> {
  const cadre = conteneur.getBoundingClientRect();
  if (!cadre.width || !cadre.height) throw new Error("La carte n'est pas affichée.");
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cadre.width * RESOLUTION);
  canvas.height = Math.round(cadre.height * RESOLUTION);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Votre navigateur ne permet pas de créer l'image.");
  ctx.scale(RESOLUTION, RESOLUTION);
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, 0, cadre.width, cadre.height);

  const placer = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - cadre.left, y: r.top - cadre.top, l: r.width, h: r.height };
  };

  // 1. Fond de carte : seules les tuiles visibles et chargées
  const tuiles = Array.from(conteneur.querySelectorAll<HTMLImageElement>(".leaflet-tile-pane img.leaflet-tile")).filter(
    (img) => img.complete && img.naturalWidth > 0,
  );
  const chargees = await Promise.all(tuiles.map((t) => chargerImage(t.currentSrc || t.src)));
  tuiles.forEach((t, i) => {
    const img = chargees[i];
    if (!img) return;
    const { x, y, l, h } = placer(t);
    if (x + l < 0 || y + h < 0 || x > cadre.width || y > cadre.height) return;
    ctx.drawImage(img, x, y, l, h);
  });

  // 2. Zones colorées et cercles : couches SVG (ou canevas) de Leaflet
  for (const couche of Array.from(conteneur.querySelectorAll(".leaflet-overlay-pane > *, .leaflet-marker-pane canvas"))) {
    const { x, y, l, h } = placer(couche);
    if (!l || !h) continue;
    if (couche instanceof HTMLCanvasElement) {
      ctx.drawImage(couche, x, y, l, h);
      continue;
    }
    if (!(couche instanceof SVGSVGElement)) continue;
    const copie = couche.cloneNode(true) as SVGSVGElement;
    copie.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copie.setAttribute("width", String(l));
    copie.setAttribute("height", String(h));
    copie.style.transform = "";
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copie)], { type: "image/svg+xml" }));
    try {
      const img = await chargerImage(url);
      if (img) ctx.drawImage(img, x, y, l, h);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return { canvas, largeurCss: cadre.width };
}
