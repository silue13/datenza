/**
 * Redessine hors écran les graphiques de l'analyse pour les insérer dans le rapport Word (navigateur uniquement).
 * Fond blanc, haute résolution, sans animation ; les cartes géographiques ne sont pas reproduites.
 */
import type { GraphiqueEpingle } from "../../app/context/DataContext";
import type { ImageRapport } from "./exportWord";

const LARGEUR = 1000;
const HAUTEUR = 560;
const RESOLUTION = 2;
const MAX_GRAPHIQUES = 10;
// L'image est réduite à la largeur d'une page : des libellés plus grands restent lisibles une fois imprimés
const POLICE = 16;

type TypeChart = "bar" | "line" | "pie" | "doughnut" | "radar" | "scatter";

function typeChart(g: GraphiqueEpingle): TypeChart | null {
  switch (g.type) {
    case "Barres":
    case "Histogramme":
    case "Combine":
      return "bar";
    case "Courbe":
    case "Aires":
      return "line";
    case "Camembert":
      return "pie";
    case "Anneau":
      return "doughnut";
    case "Radar":
      return "radar";
    case "Nuage":
      return g.nuage ? "scatter" : null;
    default:
      return null;
  }
}

function commentaire(g: GraphiqueEpingle): string | undefined {
  const premier = g.constats?.[0];
  if (premier) return `${premier.titre} : ${premier.texte}`;
  return g.interpretation?.split("\n").find((l) => l.trim().length > 20)?.trim();
}

async function versOctets(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
  if (!blob) throw new Error("Image du graphique impossible à produire.");
  return new Uint8Array(await blob.arrayBuffer());
}

export async function rendreGraphiques(graphiques: GraphiqueEpingle[]): Promise<ImageRapport[]> {
  const { default: Chart } = await import("chart.js/auto");
  const images: ImageRapport[] = [];
  for (const g of graphiques) {
    if (images.length >= MAX_GRAPHIQUES) break;
    const type = typeChart(g);
    if (!type) continue;
    const canvas = document.createElement("canvas");
    // Taille logique : Chart.js multiplie lui-même par devicePixelRatio (sinon les polices paraissent deux fois trop petites)
    canvas.width = LARGEUR;
    canvas.height = HAUTEUR;
    const circulaire = type === "pie" || type === "doughnut";
    const data =
      type === "scatter" && g.nuage
        ? {
            datasets: g.nuage.series.map((s, i) => ({
              label: s.nom,
              data: s.points,
              backgroundColor: ["#2563eb", "#d97706", "#059669", "#dc2626", "#7c3aed"][i % 5],
              pointRadius: 3,
            })),
          }
        : { labels: g.labels, datasets: g.datasets.map((d) => ({ ...d, fill: g.type === "Aires" ? true : d.fill })) };
    let graphique: InstanceType<typeof Chart> | null = null;
    try {
      graphique = new Chart(canvas, {
        type,
        data: data as never,
        options: {
          responsive: false,
          animation: false,
          devicePixelRatio: RESOLUTION,
          locale: "fr-FR",
          indexAxis: g.horizontal ? "y" : "x",
          plugins: {
            legend: { display: circulaire || g.datasets.length > 1 || type === "scatter", position: "bottom", labels: { font: { size: POLICE }, boxWidth: 18 } },
            title: { display: false },
            // Plugin d'étiquettes éventuellement enregistré ailleurs dans l'application
            ...({ datalabels: { display: false } } as object),
          },
          scales: circulaire || type === "radar"
            ? undefined
            : {
                x: { stacked: g.empile, ticks: { font: { size: POLICE } }, title: { display: !!g.axes?.x, text: g.axes?.x, font: { size: POLICE } } },
                y: { stacked: g.empile, beginAtZero: type !== "scatter", ticks: { font: { size: POLICE } }, title: { display: !!g.axes?.y, text: g.axes?.y, font: { size: POLICE } } },
              },
        },
        plugins: [
          {
            id: "fondBlanc",
            beforeDraw: (c) => {
              const ctx = c.ctx;
              ctx.save();
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, c.width, c.height);
              ctx.restore();
            },
          },
        ],
      });
      images.push({ titre: g.titre, png: await versOctets(canvas), largeur: LARGEUR, hauteur: HAUTEUR, commentaire: commentaire(g) });
    } catch {
      // Un graphique impossible à reproduire ne doit pas empêcher le rapport : il est simplement omis
    } finally {
      graphique?.destroy();
    }
  }
  return images;
}
