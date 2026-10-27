import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  RadarController,
  RadialLinearScale,
  Filler,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Enregistrement de Chart.js + Plugin DataLabels
ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement, LineElement, 
  ArcElement, RadarController, RadialLinearScale, Filler, Title, Tooltip, Legend,
  ChartDataLabels // <-- Ajout du plugin ici
);