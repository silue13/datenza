import { describe, it, expect } from "vitest";
import { analyserAdresse, detecterFormat, normaliserSource, formaterAnciennete } from "./source";
import { estIpInterdite, estHoteInterdit } from "./reseau";

const octets = (t: string) => new TextEncoder().encode(t);

describe("import/source — adresses", () => {
  it("transforme un lien Google Sheets en export CSV de l'onglet affiché", () => {
    expect(analyserAdresse("https://docs.google.com/spreadsheets/d/1AbC-d_E/edit#gid=123456")).toMatchObject({
      type: "google-sheets",
      urlTelechargement: "https://docs.google.com/spreadsheets/d/1AbC-d_E/export?format=csv&gid=123456",
    });
    expect(analyserAdresse("docs.google.com/spreadsheets/d/1AbC/edit?usp=sharing").urlTelechargement).toBe(
      "https://docs.google.com/spreadsheets/d/1AbC/export?format=csv"
    );
    expect(analyserAdresse("https://docs.google.com/spreadsheets/d/1AbC/edit?gid=7#gid=7").urlTelechargement).toContain("gid=7");
  });
  it("reconnaît une feuille publiée sur le web", () => {
    expect(analyserAdresse("https://docs.google.com/spreadsheets/d/e/2PACX-1vXyz/pubhtml?gid=5&single=true").urlTelechargement).toBe(
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vXyz/pub?output=csv&gid=5&single=true"
    );
  });
  it("refuse les autres documents Google", () => {
    expect(() => analyserAdresse("https://docs.google.com/document/d/abc/edit")).toThrow(/Google Sheets/);
    expect(() => analyserAdresse("https://drive.google.com/file/d/abc/view")).toThrow(/Google Sheets/);
  });
  it("rend directs les liens Dropbox et GitHub", () => {
    expect(analyserAdresse("https://www.dropbox.com/s/abc/ventes.xlsx?dl=0").urlTelechargement).toBe("https://www.dropbox.com/s/abc/ventes.xlsx?dl=1");
    expect(analyserAdresse("https://github.com/org/depot/blob/main/data/prix.csv")).toMatchObject({
      type: "url",
      urlTelechargement: "https://raw.githubusercontent.com/org/depot/main/data/prix.csv",
      nomPropose: "prix.csv",
    });
  });
  it("garde une adresse ordinaire et propose un nom", () => {
    expect(analyserAdresse("https://exemple.org/open-data/Production%202024.csv?v=2#haut")).toMatchObject({
      urlTelechargement: "https://exemple.org/open-data/Production%202024.csv?v=2",
      nomPropose: "Production 2024.csv",
    });
    expect(analyserAdresse("https://api.exemple.org/v1/ventes").nomPropose).toBe("api.exemple.org");
  });
  it("refuse ce qui n'est pas une adresse web", () => {
    expect(() => analyserAdresse("")).toThrow();
    expect(() => analyserAdresse("file:///etc/passwd")).toThrow(/http/);
    expect(() => analyserAdresse("ftp://exemple.org/a.csv")).toThrow(/http/);
    expect(() => analyserAdresse("https://moi:secret@exemple.org/a.csv")).toThrow(/mot de passe/);
    expect(() => analyserAdresse("https://")).toThrow();
  });
});

describe("import/source — format reçu", () => {
  it("reconnaît un classeur à ses premiers octets, quel que soit le nom", () => {
    expect(detecterFormat(new Uint8Array([0x50, 0x4b, 3, 4, 0]), "application/octet-stream", "export")).toBe("classeur");
    expect(detecterFormat(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0]), "", "vieux.xls")).toBe("classeur");
  });
  it("distingue JSON et CSV", () => {
    expect(detecterFormat(octets('[{"a":1}]'), "application/json", "x")).toBe("json");
    expect(detecterFormat(octets('  {"lignes":[]}'), "text/plain", "x")).toBe("json");
    expect(detecterFormat(octets("a;b\n1;2"), "text/csv", "x.csv")).toBe("csv");
    expect(detecterFormat(octets("[id];nom\n1;x"), "text/csv", "x.csv")).toBe("csv");
    expect(detecterFormat(octets("﻿nom,valeur\nx,1"), "", "sans-extension")).toBe("csv");
  });
  it("refuse une page web, un fichier vide ou du XML", () => {
    expect(() => detecterFormat(octets("<!DOCTYPE html><html><body>Connexion</body></html>"), "text/html", "edit")).toThrow(/page web/);
    expect(() => detecterFormat(octets("\n  <html lang='fr'>"), "text/csv", "a.csv")).toThrow(/page web/);
    expect(() => detecterFormat(new Uint8Array(), "text/csv", "a.csv")).toThrow(/vide/);
    expect(() => detecterFormat(octets('<?xml version="1.0"?><a/>'), "text/xml", "a.xml")).toThrow(/XML/);
  });
});

describe("import/source — source mémorisée", () => {
  const base = { type: "url", adresse: "exemple.org/a.csv", urlTelechargement: "https://exemple.org/a.csv", derniereMaj: "2026-01-01T10:00:00.000Z", intervalleMinutes: 15 };
  it("relit une source valide et rejette le reste", () => {
    expect(normaliserSource(base)).toEqual(base);
    expect(normaliserSource({ ...base, intervalleMinutes: 3 })?.intervalleMinutes).toBe(0);
    expect(normaliserSource({ ...base, urlTelechargement: "javascript:alert(1)" })).toBeNull();
    expect(normaliserSource({ ...base, type: "ftp" })).toBeNull();
    expect(normaliserSource(null)).toBeNull();
    expect(normaliserSource("https://exemple.org")).toBeNull();
  });
  it("exprime l'ancienneté de la dernière mise à jour", () => {
    const t = Date.parse("2026-01-01T12:00:00Z");
    expect(formaterAnciennete("2026-01-01T11:59:40Z", t)).toBe("à l'instant");
    expect(formaterAnciennete("2026-01-01T11:48:00Z", t)).toBe("il y a 12 min");
    expect(formaterAnciennete("2026-01-01T09:00:00Z", t)).toBe("il y a 3 h");
    expect(formaterAnciennete("2025-12-20T09:00:00Z", t)).toMatch(/^le 20 déc\. 2025$/);
    expect(formaterAnciennete("n'importe quoi", t)).toBe("jamais");
  });
});

describe("import/reseau — adresses internes", () => {
  it("refuse les adresses IP privées, locales et réservées", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
      "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a00:1", "64:ff9b::a00:1", "ff02::1", "pas-une-ip", "999.1.1.1"]) {
      expect(estIpInterdite(ip), ip).toBe(true);
    }
  });
  it("accepte les adresses publiques", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "172.15.0.1", "192.169.1.1", "100.128.0.1", "142.250.74.14", "2a00:1450:4007:80e::200e", "2606:4700::1111", "::ffff:8.8.8.8"]) {
      expect(estIpInterdite(ip), ip).toBe(false);
    }
  });
  it("refuse les noms d'hôtes locaux et les IP déguisées", () => {
    for (const h of ["localhost", "LOCALHOST.", "api.localhost", "imprimante.local", "metadata.google.internal", "intranet", "127.0.0.1", "[::1]", "2130706433", "0x7f000001", "0x7f.0.0.1", "017700000001", "10.0.0.5", ""]) {
      expect(estHoteInterdit(h), h).toBe(true);
    }
  });
  it("accepte les noms d'hôtes publics", () => {
    for (const h of ["docs.google.com", "raw.githubusercontent.com", "data.gouv.ci", "exemple.org", "8.8.8.8", "abc.fr", "cafe.de", "1e100.net", "fad.example.com"]) {
      expect(estHoteInterdit(h), h).toBe(false);
    }
  });
});
