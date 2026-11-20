// Les jeux de test fournis à l'utilisateur : l'application doit retrouver les résultats annoncés dans leur LISEZ-MOI.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lireFichier } from "../import/lecture";
import {
  comparerFichiers,
  colonnesCommunes,
  proposerCle,
  descriptionRapprochements,
  empilerPourComparaison,
  STATUT_ECART,
  STATUT_IDENTIQUE,
  type FichierAComparer,
} from "./comparaison";
import { fusionnerEtNettoyer } from "./fusion";

const DOSSIER = join(__dirname, "fixtures", "jeux-de-test");

async function charger(nom: string): Promise<FichierAComparer> {
  const t = await lireFichier(new File([readFileSync(join(DOSSIER, nom))], nom));
  return { nom, entetes: t.entetes, corps: t.corps };
}

const compter = (corps: unknown[][], i: number, val: string) => corps.filter((l) => l[i] === val).length;

describe("factures et paiements (2 fichiers)", () => {
  it("propose N° Facture ↔ Référence facture et retrouve les écarts annoncés", async () => {
    const fichiers = [await charger("02_factures_2025.xlsx"), await charger("03_paiements_2025.csv")];
    const communes = colonnesCommunes(fichiers);
    const cle = proposerCle(fichiers, communes)!;
    expect(cle.colonne.variantes).toEqual(["N° Facture", "Référence facture"]);
    expect(Math.round(cle.taux[1] * 100)).toBe(92);

    // « Montant réglé » face à « Montant TTC » : impossible à deviner, choisi à la main
    expect(communes.some((c) => c.nom === "Montant TTC")).toBe(false);
    const r = comparerFichiers(fichiers, {
      cles: ["N° Facture"],
      manuelles: { "03_paiements_2025.csv": { "Montant TTC": "Montant réglé" } },
    });
    const iStatut = r.entetes.indexOf("Statut");
    expect(compter(r.corps, iStatut, STATUT_IDENTIQUE)).toBe(384);
    expect(compter(r.corps, iStatut, STATUT_ECART)).toBe(30);
    expect(compter(r.corps, iStatut, "Absent de : 03_paiements_2025")).toBe(36);
    expect(compter(r.corps, iStatut, "Absent de : 02_factures_2025")).toBe(9);
    expect(r.bilan.doublonsIgnores).toEqual([{ nom: "03_paiements_2025", nbLignes: 4, cles: expect.any(Array) }]);
    expect(r.entetes).toContain("Montant TTC — écart 03_paiements_2025 vs 02_factures_2025");
  });
});

describe("portefeuille sur 3 mois", () => {
  it("rapproche les colonnes renommées et compte les clients apparus et disparus", async () => {
    const fichiers = [
      await charger("04_portefeuille_janvier_2025.csv"),
      await charger("05_portefeuille_fevrier_2025.csv"),
      await charger("06_portefeuille_mars_2025.xlsx"),
    ];
    const communes = colonnesCommunes(fichiers);
    const variantes = Object.fromEntries(communes.map((c) => [c.nom, c.variantes]));
    expect(variantes["Code client"]).toEqual(["Code client", "Réf client", "Code"]);
    expect(variantes["Ville"]).toEqual(["Ville", "Localité", "Commune"]);
    expect(variantes["Nom"]).toEqual(["Nom", "Nom du client", "Client"]);
    expect(variantes["Encours"]).toEqual(["Encours", "Encours", "Solde"]);
    expect(variantes["Encours"]).toBeDefined();
    expect(proposerCle(fichiers, communes)!.colonne.nom).toBe("Code client");

    const r = comparerFichiers(fichiers, { cles: ["Code client"] });
    const iPres = r.entetes.indexOf("Présence");
    const iStatut = r.entetes.indexOf("Statut");
    expect(r.bilan.nbCles).toBe(172);
    expect(compter(r.corps, iPres, "3/3")).toBe(136);
    const iJan = r.entetes.indexOf("Encours [04_portefeuille_janvier_2025]");
    const iMars = r.entetes.indexOf("Encours [06_portefeuille_mars_2025]");
    expect(r.corps.filter((l) => l[iJan] === "" && l[iMars] !== "").length).toBe(22);
    expect(r.corps.filter((l) => l[iJan] !== "" && l[iMars] === "").length).toBe(14);
    expect(compter(r.corps, iStatut, STATUT_ECART)).toBeGreaterThan(40);
  });
});

describe("ventes de 3 agences", () => {
  const charge = async () => [
    await charger("07_agence_abidjan.xlsx"),
    await charger("08_agence_bouake.xlsx"),
    await charger("09_agence_korhogo.xlsx"),
  ];

  it("empile 720 lignes en rapprochant toutes les colonnes", async () => {
    const fichiers = await charge();
    const r = fusionnerEtNettoyer(fichiers, {
      mode: "empilement",
      supprimerDoublons: true,
      harmoniserFormatsNumeriques: true,
      harmoniserDates: true,
      nettoyerEspaces: true,
      remplirValeursVides: false,
      valeurRemplacementVide: "N/A",
      alignerColonnesSimilaires: true,
    });
    expect(r.entetes).toEqual(["Fichier Source", "Mois", "Produit", "Catégorie", "Qté", "CA"]);
    expect(r.corps).toHaveLength(720);
    expect(r.rapport.doublonsSupprimes).toBe(0);
    expect(descriptionRapprochements(colonnesCommunes(fichiers))).toEqual([
      "Produit = Article",
      "Catégorie = Famille",
      "Qté = Quantité",
      "CA = Chiffre d'affaires = Ventes",
    ]);
  });

  it("donne les évolutions 2024 → 2025 annoncées pour chaque agence", async () => {
    const { entetes, corps } = empilerPourComparaison(await charge());
    const iCa = entetes.indexOf("CA");
    const iMois = entetes.indexOf("Mois");
    const evolution = (agence: string) => {
      const total = (an: string) =>
        corps.filter((l) => l[0] === agence && String(l[iMois]).startsWith(an)).reduce((a, l) => a + Number(l[iCa]), 0);
      return Math.round((total("2025") / total("2024") - 1) * 100);
    };
    expect(evolution("07_agence_abidjan.xlsx")).toBeCloseTo(11, -1);
    expect(evolution("08_agence_bouake.xlsx")).toBeCloseTo(-3, -1);
    expect(evolution("09_agence_korhogo.xlsx")).toBeCloseTo(33, -1);
  });
});
