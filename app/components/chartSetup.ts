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

// Enregistrement unique des composants Chart.js (importé par l'analyse ET le tableau de bord).
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, RadarController, RadialLinearScale, Filler, Title, Tooltip, Legend);
