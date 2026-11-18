// lib/analyse/imageGraphique.ts — export d'un graphique en image PNG prête à publier (LinkedIn, rapport, message).
// Fond blanc, titre, graphique en haute résolution et mention de la source en pied d'image.
import { Chart } from "chart.js";

const RESOLUTION = 3;
const MARGE = 28;

/** Nom de fichier lisible et sûr : « Ventes par région » -> « ventes-par-region.png ». */
export function nomFichierImage(titre: string): string {
  const base = (titre || "graphique")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "graphique"}.png`;
}

/** Coupe un texte en lignes qui tiennent dans la largeur donnée (2 lignes au plus, la seconde abrégée). */
function couperTexte(ctx: CanvasRenderingContext2D, texte: string, largeur: number, maxLignes = 2): string[] {
  const mots = texte.split(/\s+/).filter(Boolean);
  const lignes: string[] = [];
  let courante = "";
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (ctx.measureText(essai).width <= largeur || !courante) courante = essai;
    else {
      lignes.push(courante);
      courante = mot;
    }
  }
  if (courante) lignes.push(courante);
  if (lignes.length <= maxLignes) return lignes;
  const gardees = lignes.slice(0, maxLignes);
  let derniere = gardees[maxLignes - 1];
  while (derniere.length > 1 && ctx.measureText(`${derniere}…`).width > largeur) derniere = derniere.slice(0, -1);
  gardees[maxLignes - 1] = `${derniere}…`;
  return gardees;
}

/** Capture le canevas d'un graphique Chart.js en haute résolution, puis rend sa résolution d'origine au graphique. */
function capturerHauteResolution(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const chart = Chart.getChart(canvas);
  const copie = document.createElement("canvas");
  if (!chart) {
    copie.width = canvas.width;
    copie.height = canvas.height;
    copie.getContext("2d")?.drawImage(canvas, 0, 0);
    return copie;
  }
  const avant = chart.options.devicePixelRatio;
  try {
    chart.stop();
    chart.options.devicePixelRatio = RESOLUTION;
    chart.resize();
    copie.width = canvas.width;
    copie.height = canvas.height;
    copie.getContext("2d")?.drawImage(canvas, 0, 0);
  } finally {
    chart.options.devicePixelRatio = avant;
    chart.resize();
  }
  return copie;
}

/** Élément de légende dessiné sous l'image (carte colorée par zones, par exemple). */
export type ElementLegende = { couleur: string; libelle: string };

type OptionsImage = {
  source?: string;
  /** Légende dessinée sous le visuel, sur une ou plusieurs lignes. */
  legende?: { titre?: string; elements: ElementLegende[] };
  /** Mention obligatoire du fond de carte, par exemple « © OpenStreetMap ». */
  credit?: string;
};

/**
 * Télécharge le graphique en PNG : titre en haut, graphique au centre, « Source : … · DATENZA » en bas.
 * Le canevas d'origine n'est pas modifié durablement.
 */
export async function telechargerGraphiqueEnImage(canvas: HTMLCanvasElement, titre: string, source?: string): Promise<void> {
  const graphique = capturerHauteResolution(canvas);
  await telechargerVisuelEnImage(graphique, canvas.clientWidth || graphique.width, titre, { source });
}

const POLICE = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Place les éléments de légende en lignes successives ; renvoie les positions et la hauteur totale. */
function placerLegende(ctx: CanvasRenderingContext2D, elements: ElementLegende[], largeur: number, taille: number) {
  const carre = taille;
  const ecart = taille * 1.2;
  const hauteurLigne = taille * 1.8;
  const positions: { x: number; y: number; e: ElementLegende }[] = [];
  let x = 0;
  let y = 0;
  for (const e of elements) {
    const l = carre + taille * 0.5 + ctx.measureText(e.libelle).width;
    if (x > 0 && x + l > largeur) {
      x = 0;
      y += hauteurLigne;
    }
    positions.push({ x, y, e });
    x += l + ecart;
  }
  return { positions, hauteur: elements.length ? y + hauteurLigne : 0 };
}

/**
 * Compose et télécharge l'image finale à partir d'un visuel déjà rendu (graphique, carte) :
 * titre, visuel, légende éventuelle, puis « Source : … » et « Réalisé avec DATENZA ».
 * `largeurCss` est la largeur affichée du visuel à l'écran, qui fixe l'échelle des textes.
 */
export async function telechargerVisuelEnImage(visuel: HTMLCanvasElement, largeurCss: number, titre: string, options: OptionsImage = {}): Promise<void> {
  const echelle = visuel.width / Math.max(1, largeurCss);
  const marge = MARGE * echelle;
  const tailleTitre = 20 * echelle;
  const tailleSource = 12 * echelle;
  const tailleLegende = 12 * echelle;
  const largeurUtile = visuel.width;

  const mesure = document.createElement("canvas").getContext("2d");
  if (!mesure) throw new Error("Votre navigateur ne permet pas de créer l'image.");
  mesure.font = `700 ${tailleTitre}px ${POLICE}`;
  const lignesTitre = couperTexte(mesure, titre, largeurUtile);
  const hauteurTitre = lignesTitre.length * tailleTitre * 1.3;

  const legende = options.legende && options.legende.elements.length ? options.legende : null;
  mesure.font = `500 ${tailleLegende}px ${POLICE}`;
  const placement = legende ? placerLegende(mesure, legende.elements, largeurUtile, tailleLegende) : null;
  const hauteurTitreLegende = legende?.titre ? tailleLegende * 1.8 : 0;
  const hauteurLegende = placement ? marge * 0.6 + hauteurTitreLegende + placement.hauteur : 0;

  const image = document.createElement("canvas");
  image.width = Math.round(largeurUtile + marge * 2);
  image.height = Math.round(marge + hauteurTitre + marge * 0.6 + visuel.height + hauteurLegende + marge * 0.8 + tailleSource * 1.4 + marge * 0.6);
  const ctx = image.getContext("2d");
  if (!ctx) throw new Error("Votre navigateur ne permet pas de créer l'image.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, image.width, image.height);

  ctx.fillStyle = "#0f172a";
  ctx.textBaseline = "top";
  ctx.font = `700 ${tailleTitre}px ${POLICE}`;
  lignesTitre.forEach((ligne, i) => ctx.fillText(ligne, marge, marge + i * tailleTitre * 1.3));

  const yVisuel = marge + hauteurTitre + marge * 0.6;
  ctx.drawImage(visuel, marge, yVisuel);

  if (options.credit) {
    // Mention du fond de carte, en surimpression dans le coin bas droit comme à l'écran
    ctx.font = `500 ${10 * echelle}px ${POLICE}`;
    const l = ctx.measureText(options.credit).width;
    const pad = 4 * echelle;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(marge + visuel.width - l - pad * 2, yVisuel + visuel.height - 10 * echelle - pad * 2, l + pad * 2, 10 * echelle + pad * 2);
    ctx.fillStyle = "#334155";
    ctx.fillText(options.credit, marge + visuel.width - l - pad, yVisuel + visuel.height - 10 * echelle - pad);
  }

  if (legende && placement) {
    let y = yVisuel + visuel.height + marge * 0.6;
    if (legende.titre) {
      ctx.font = `700 ${tailleLegende}px ${POLICE}`;
      ctx.fillStyle = "#334155";
      ctx.fillText(couperTexte(ctx, legende.titre, largeurUtile, 1)[0], marge, y);
      y += hauteurTitreLegende;
    }
    ctx.font = `500 ${tailleLegende}px ${POLICE}`;
    for (const { x, y: dy, e } of placement.positions) {
      ctx.fillStyle = e.couleur;
      ctx.fillRect(marge + x, y + dy, tailleLegende, tailleLegende);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = Math.max(1, echelle * 0.5);
      ctx.strokeRect(marge + x, y + dy, tailleLegende, tailleLegende);
      ctx.fillStyle = "#334155";
      ctx.fillText(e.libelle, marge + x + tailleLegende * 1.5, y + dy);
    }
  }

  const yPied = yVisuel + visuel.height + hauteurLegende + marge * 0.8;
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = Math.max(1, echelle);
  ctx.beginPath();
  ctx.moveTo(marge, yPied - marge * 0.4);
  ctx.lineTo(image.width - marge, yPied - marge * 0.4);
  ctx.stroke();
  ctx.font = `500 ${tailleSource}px ${POLICE}`;
  ctx.fillStyle = "#64748b";
  const nettoyee = (options.source ?? "").replace(/\.(xlsx|xlsm|xls|csv|tsv|txt|json|ods)$/i, "").trim();
  const mention = nettoyee ? `Source : ${nettoyee}` : "";
  if (mention) ctx.fillText(couperTexte(ctx, mention, image.width / 2 - marge, 1)[0], marge, yPied);
  ctx.fillStyle = "#2563eb";
  ctx.font = `800 ${tailleSource}px ${POLICE}`;
  const marque = "Réalisé avec DATENZA";
  ctx.fillText(marque, image.width - marge - ctx.measureText(marque).width, yPied);

  const blob = await new Promise<Blob | null>((resolve) => image.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("L'image n'a pas pu être créée.");
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(blob);
  lien.download = nomFichierImage(titre);
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 10_000);
}
