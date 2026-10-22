import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import { DataProvider } from "./context/DataContext";
import ThemeInit from "./components/ThemeInit";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DATENZA - Plateforme d'Analyse et Données Publiques",
  description: "Analyse de données, Open Data et Gestion Agricole MonChamp",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <ThemeInit />
        <DataProvider>
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6 md:p-10">{children}</main>
        </DataProvider>
      </body>
    </html>
  );
}