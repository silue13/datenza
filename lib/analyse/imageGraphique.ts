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

/**
 * Télécharge le graphique en PNG : titre en haut, graphique au centre, « Source : … · DATENZA » en bas.
 * Le canevas d'origine n'est pas modifié durablement.
 */
export async function telechargerGraphiqueEnImage(canvas: HTMLCanvasElement, titre: string, source?: string): Promise<void> {
  const graphique = capturerHauteResolution(canvas);
  const echelle = graphique.width / Math.max(1, canvas.clientWidth || graphique.width);
  const marge = MARGE * echelle;
  const tailleTitre = 20 * echelle;
  const tailleSource = 12 * echelle;
  const largeurUtile = graphique.width;

  const mesure = document.createElement("canvas").getContext("2d");
  if (!mesure) throw new Error("Votre navigateur ne permet pas de créer l'image.");
  mesure.font = `700 ${tailleTitre}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const lignesTitre = couperTexte(mesure, titre, largeurUtile);
  const hauteurTitre = lignesTitre.length * tailleTitre * 1.3;

  const image = document.createElement("canvas");
  image.width = Math.round(largeurUtile + marge * 2);
  image.height = Math.round(marge + hauteurTitre + marge * 0.6 + graphique.height + marge * 0.8 + tailleSource * 1.4 + marge * 0.6);
  const ctx = image.getContext("2d");
  if (!ctx) throw new Error("Votre navigateur ne permet pas de créer l'image.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, image.width, image.height);

  ctx.fillStyle = "#0f172a";
  ctx.textBaseline = "top";
  ctx.font = `700 ${tailleTitre}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  lignesTitre.forEach((ligne, i) => ctx.fillText(ligne, marge, marge + i * tailleTitre * 1.3));

  const yGraphique = marge + hauteurTitre + marge * 0.6;
  ctx.drawImage(graphique, marge, yGraphique);

  const yPied = yGraphique + graphique.height + marge * 0.8;
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = Math.max(1, echelle);
  ctx.beginPath();
  ctx.moveTo(marge, yPied - marge * 0.4);
  ctx.lineTo(image.width - marge, yPied - marge * 0.4);
  ctx.stroke();
  ctx.font = `500 ${tailleSource}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = "#64748b";
  const nettoyee = (source ?? "").replace(/\.(xlsx|xlsm|xls|csv|tsv|txt|json|ods)$/i, "").trim();
  const mention = nettoyee ? `Source : ${nettoyee}` : "";
  if (mention) ctx.fillText(couperTexte(ctx, mention, image.width / 2 - marge, 1)[0], marge, yPied);
  ctx.fillStyle = "#2563eb";
  ctx.font = `800 ${tailleSource}px system-ui, -apple-system, "Segoe UI", sans-serif`;
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
