import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import { DataProvider } from "./context/DataContext";
import ThemeInit from "./components/ThemeInit";
import PwaUpdater from "./components/PwaUpdater";
import VerificateurMiseAJour from "./components/VerificateurMiseAJour";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DATENZA - Plateforme d'Analyse et Données Publiques",
  description: "Analyse de données, Open Data et Gestion Agricole MonChamp",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DATENZA",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <ThemeInit />
        <PwaUpdater />
        <VerificateurMiseAJour />
        <DataProvider>
          <Sidebar />
          <main className="flex-1 w-full min-w-0 overflow-y-auto p-3.5 sm:p-6 md:p-10 pb-24 md:pb-10">
            {children}
          </main>
        </DataProvider>
      </body>
    </html>
  );
}