import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { trouverZone, detecterNiveau, zoneContenant, agregerParZone, classerValeurs, couleurPour, REGIONS_CI, DISTRICTS_CI, DEGRADE_ZONES, COULEUR_SANS_DONNEE, type ContoursZones } from "./zones";
import { trouverLieuCI } from "./data";

const lire = (nom: string) => JSON.parse(readFileSync(join(process.cwd(), "public", "geo", nom), "utf8")) as ContoursZones;
const regions = lire("ci-regions.json");
const districts = lire("ci-districts.json");

describe("geoci/zones", () => {
  it("les contours portent exactement les noms du référentiel", () => {
    expect(regions.features.map((f) => f.properties.nom).sort()).toEqual([...REGIONS_CI].sort());
    expect(districts.features.map((f) => f.properties.nom).sort()).toEqual([...DISTRICTS_CI].sort());
  });
  it("reconnaît une zone malgré la casse, les accents et les préfixes", () => {
    expect(trouverZone("GBEKE", "regions")).toBe("Gbêkê");
    expect(trouverZone("Région du Poro", "regions")).toBe("Poro");
    expect(trouverZone("Nzi", "regions")).toBe("N'Zi");
    expect(trouverZone("District autonome d'Abidjan", "districts")).toBe("Abidjan");
    expect(trouverZone("Savanes", "regions")).toBeNull();
    expect(trouverZone("Korhogo", "regions")).toBeNull();
  });
  it("choisit le découpage que la colonne cite le plus", () => {
    expect(detecterNiveau(["Poro", "Gbêkê", "Tonkpi"]).niveau).toBe("regions");
    expect(detecterNiveau(["Savanes", "Lagunes", "Zanzan", "Abidjan"]).niveau).toBe("districts");
    expect(detecterNiveau(["Korhogo", "Bouaké"])).toEqual({ niveau: "regions", nbDirects: 0 });
  });
  it("situe une ville dans sa région et dans son district", () => {
    const korhogo = trouverLieuCI("Korhogo") as [number, number];
    expect(zoneContenant(korhogo[0], korhogo[1], regions)).toBe("Poro");
    expect(zoneContenant(korhogo[0], korhogo[1], districts)).toBe("Savanes");
    const bouake = trouverLieuCI("Bouaké") as [number, number];
    expect(zoneContenant(bouake[0], bouake[1], regions)).toBe("Gbêkê");
    expect(zoneContenant(48.85, 2.35, regions)).toBeNull();
  });
  it("place le repère de chaque région à l'intérieur de son propre contour", () => {
    // Le Bélier entoure Yamoussoukro : son repère (centre géométrique) tombe dans le district autonome
    const ecarts = REGIONS_CI.filter((nom) => nom !== "Bélier").filter((nom) => {
      const c = trouverLieuCI(nom);
      return !c || zoneContenant(c[0], c[1], regions) !== nom;
    });
    expect(ecarts).toEqual([]);
  });
  it("regroupe les villes par région et recalcule la moyenne sur toutes les lignes", () => {
    const lieux = [
      { nom: "Korhogo", somme: 100, n: 1, compte: 1 },
      { nom: "Poro", somme: 20, n: 3, compte: 3 },
      { nom: "Bouaké", somme: 50, n: 2, compte: 2 },
      { nom: "Savanes", somme: 999, n: 1, compte: 1 },
      { nom: "Atlantide", somme: 5, n: 1, compte: 1 },
      { nom: "Tonkpi", somme: 0, n: 0, compte: 4 },
    ];
    const somme = agregerParZone(lieux, "regions", regions, trouverLieuCI, "Somme");
    expect(somme.zones).toEqual([
      { zone: "Poro", valeur: 120, lieux: ["Korhogo", "Poro"] },
      { zone: "Gbêkê", valeur: 50, lieux: ["Bouaké"] },
    ]);
    expect(somme.nonRattaches).toEqual(["Savanes", "Atlantide"]);
    const moyenne = agregerParZone(lieux, "regions", regions, trouverLieuCI, "Moyenne");
    expect(moyenne.zones.find((z) => z.zone === "Poro")?.valeur).toBe(30);
    const nombre = agregerParZone(lieux, "regions", regions, trouverLieuCI, "Nombre");
    expect(nombre.zones.find((z) => z.zone === "Tonkpi")?.valeur).toBe(4);
  });
  it("répartit les valeurs en classes de même effectif, du clair au foncé", () => {
    const classes = classerValeurs([1, 2, 3, 4, 5, 6, 7, 8, 9, 1000]);
    expect(classes.map((c) => c.effectif)).toEqual([2, 2, 2, 2, 2]);
    expect(classes.map((c) => c.couleur)).toEqual(DEGRADE_ZONES);
    expect(couleurPour(1000, classes)).toBe(DEGRADE_ZONES[4]);
    expect(couleurPour(3, classes)).toBe(DEGRADE_ZONES[1]);
    expect(couleurPour(undefined, classes)).toBe(COULEUR_SANS_DONNEE);
  });
  it("garde une classe par valeur quand il y en a peu", () => {
    const classes = classerValeurs([10, 10, 30]);
    expect(classes.map((c) => [c.min, c.max, c.effectif])).toEqual([[10, 10, 2], [30, 30, 1]]);
    expect(classes[1].couleur).toBe(DEGRADE_ZONES[4]);
    expect(classerValeurs([])).toEqual([]);
  });
});
