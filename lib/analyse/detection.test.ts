import { describe, it, expect } from "vitest";
import { convertirDate, detecterTypeColonne, estColonneGeographique } from "./detection";

describe("analyse/detection", () => {
  it("lit les dates ISO et françaises, refuse les dates impossibles", () => {
    expect(convertirDate("2024-01-15")).not.toBeNull();
    expect(convertirDate("15/02/2024")).not.toBeNull();
    expect(convertirDate("2024-02-30")).toBeNull();
  });
  it("détecte un numérique", () => {
    expect(detecterTypeColonne("Montant", ["1", "2,5", "3"]).type).toBe("numerique");
  });
  it("détecte une date", () => {
    const r = detecterTypeColonne("Date de création", ["2024-01-15", "15/02/2024", "2024-03-01"]);
    expect(r.type).toBe("date");
  });
  it("détecte un booléen", () => {
    expect(detecterTypeColonne("Actif", ["oui", "non", "oui"]).type).toBe("booleen");
  });
  it("détecte un identifiant par son nom", () => {
    expect(detecterTypeColonne("Numéro de dossier", ["12-1", "12-2"]).type).toBe("identifiant");
  });
  it("détecte un statut", () => {
    const r = detecterTypeColonne("Statut", ["valide", "rejete", "valide"]);
    expect(r).toMatchObject({ type: "categorielle", role: "statut" });
  });
  it("détecte une colonne géographique sans la prendre pour un identifiant", () => {
    const r = detecterTypeColonne("Région de départ", ["Gbeke", "Poro"]);
    expect(r).toMatchObject({ type: "categorielle", geo: true });
    expect(estColonneGeographique("Report")).toBe(false);
  });
});