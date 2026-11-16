import { describe, it, expect } from "vitest";
import { convertirDate, detecterOrdreDate, formaterDateISO, trierChronologiquement, estPeriode } from "./dates";

const iso = (v: unknown, ordre?: "JMA" | "MJA") => {
  const d = convertirDate(v, ordre);
  return d ? formaterDateISO(d) : null;
};

describe("analyse/dates", () => {
  it("lit les formats chiffrés français, ISO et américains", () => {
    expect(iso("15/02/2024")).toBe("2024-02-15");
    expect(iso("15/02/24")).toBe("2024-02-15");
    expect(iso("2024-01-15")).toBe("2024-01-15");
    expect(iso("2024-01-15T10:30:00Z")).toBe("2024-01-15 10:30");
    expect(iso("12/25/2024")).toBe("2024-12-25");
    expect(iso("03/04/2024")).toBe("2024-04-03");
    expect(iso("03/04/2024", "MJA")).toBe("2024-03-04");
  });
  it("lit les mois écrits en lettres", () => {
    expect(iso("15 janvier 2024")).toBe("2024-01-15");
    expect(iso("1er mars 2023")).toBe("2023-03-01");
    expect(iso("lundi 15 janvier 2024")).toBe("2024-01-15");
    expect(iso("Jan 15, 2024")).toBe("2024-01-15");
    expect(iso("15-Jan-24")).toBe("2024-01-15");
    expect(iso("févr. 2024")).toBe("2024-02-01");
    expect(iso("03/2024")).toBe("2024-03-01");
  });
  it("refuse ce qui n'est pas une date", () => {
    for (const v of ["2024-02-30", "2023", "12.5", "1,5", "abc", "", null, 45123]) expect(convertirDate(v)).toBeNull();
  });
  it("devine l'ordre jour/mois d'une colonne", () => {
    expect(detecterOrdreDate(["1/5/2024", "12/25/2024"])).toBe("MJA");
    expect(detecterOrdreDate(["01/05/2024", "25/12/2024"])).toBe("JMA");
    expect(detecterOrdreDate(["01/05/2024"])).toBe("JMA");
  });
  it("trie les périodes dans l'ordre du calendrier", () => {
    const tri = (l: string[]) => trierChronologiquement(l, (x) => x);
    expect(tri(["Mars", "Janvier", "Février"])).toEqual(["Janvier", "Février", "Mars"]);
    expect(tri(["T3 2024", "T1 2024", "T4 2023"])).toEqual(["T4 2023", "T1 2024", "T3 2024"]);
    expect(tri(["2024/2025", "2022/2023", "2023/2024"])).toEqual(["2022/2023", "2023/2024", "2024/2025"]);
    expect(tri(["15/03/2024", "02/01/2024"])).toEqual(["02/01/2024", "15/03/2024"]);
    expect(tri(["Poro", "Gbeke"])).toBeNull();
    expect(estPeriode("S2 2023")).toBe(true);
    expect(estPeriode("Abidjan")).toBe(false);
  });
});
