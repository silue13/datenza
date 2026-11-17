import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import { DataProvider } from "./context/DataContext";
import { AuthProvider } from "./context/AuthContext";
import ThemeInit from "./components/ThemeInit";
import PwaUpdater from "./components/PwaUpdater";
import VerificateurMiseAJour from "./components/VerificateurMiseAJour";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/** Adresse publique du site, pour les liens absolus des aperçus (image partagée sur LinkedIn…). */
function adresseSite(): URL {
  const explicite = process.env.NEXT_PUBLIC_SITE_URL;
  const vercel =
    process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  try {
    return new URL(explicite || (vercel ? `https://${vercel}` : "http://localhost:3000"));
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: adresseSite(),
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

// Affichage téléphone : largeur de l'appareil, zoom autorisé (accessibilité), prise en compte de l'encoche
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <ThemeInit />
        <PwaUpdater />
        <VerificateurMiseAJour />
        <AuthProvider>
        <DataProvider>
          {/* Le menu lit l'adresse en cours, inconnue à la construction pour /partage/… */}
          <Suspense fallback={null}>
            <Sidebar />
          </Suspense>
          <main className="flex-1 w-full min-w-0 overflow-y-auto p-3.5 sm:p-6 md:p-10 pb-24 md:pb-10">
            {children}
          </main>
        </DataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}