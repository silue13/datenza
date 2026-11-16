// lib/import/reseau.ts — garde-fous du relais de téléchargement (app/api/source).
// Le serveur ne doit jamais aller chercher une adresse interne (machine locale, réseau privé, services du fournisseur cloud).

function ipv4VersOctets(ip: string): number[] | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((x) => x <= 255) ? o : null;
}

function ipv4Interdite([a, b]: number[]): boolean {
  return (
    a === 0 || // « ce réseau »
    a === 10 || // privé
    a === 127 || // boucle locale
    (a === 100 && b >= 64 && b <= 127) || // opérateurs (CGNAT)
    (a === 169 && b === 254) || // lien local, dont les métadonnées des clouds
    (a === 172 && b >= 16 && b <= 31) || // privé
    (a === 192 && b === 168) || // privé
    (a === 192 && b === 0) || // réservé
    (a === 198 && (b === 18 || b === 19)) || // bancs d'essai
    a >= 224 // multidiffusion et réservé
  );
}

/** Vrai pour toute adresse IP qui ne désigne pas un serveur public d'Internet. Une adresse illisible est refusée. */
export function estIpInterdite(ip: string): boolean {
  const texte = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = ipv4VersOctets(texte);
  if (v4) return ipv4Interdite(v4);
  if (!texte.includes(":")) return true;
  // IPv4 présentée en IPv6 (::ffff:10.0.0.1)
  const mappee = texte.match(/^(?:::ffff:|::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappee) {
    const o = ipv4VersOctets(mappee[1]);
    return !o || ipv4Interdite(o);
  }
  const mappeeHexa = texte.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappeeHexa) {
    const h = parseInt(mappeeHexa[1], 16);
    const l = parseInt(mappeeHexa[2], 16);
    return ipv4Interdite([h >> 8, h & 255, l >> 8, l & 255]);
  }
  if (texte === "::" || texte === "::1") return true;
  const premier = parseInt(texte.split(":")[0] || "0", 16);
  return (
    (premier & 0xfe00) === 0xfc00 || // fc00::/7 privé
    (premier & 0xffc0) === 0xfe80 || // fe80::/10 lien local
    (premier & 0xff00) === 0xff00 || // multidiffusion
    premier === 0x64 || // 64:ff9b::/96 traduction vers IPv4
    premier === 0x2002 || // 6to4 : peut désigner une IPv4 privée
    premier === 0
  );
}

/** Vrai pour un nom d'hôte qu'on refuse sans même le résoudre. */
export function estHoteInterdit(hote: string): boolean {
  const h = hote.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home.arpa")) return true;
  const nu = h.replace(/^\[|\]$/g, "");
  if (ipv4VersOctets(nu) || nu.includes(":")) return estIpInterdite(nu);
  // IP déguisée (décimal 2130706433, hexadécimal 0x7f.0.0.1, octal 0177.0.0.1) : tous les segments sont des nombres
  if (h.split(".").every((segment) => /^(0x[0-9a-f]+|\d+)$/.test(segment))) return true;
  return !h.includes(".");
}
