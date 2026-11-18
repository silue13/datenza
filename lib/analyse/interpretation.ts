// lib/analyse/interpretation.ts — interprétation pédagogique d'un graphique, sans IA :
// comment le lire, constats complémentaires chiffrés, résumé « en clair » et pistes à creuser.
// Tout est calculé à partir des valeurs dessinées ; aucune cause n'est inventée.
import { arrondir } from "./utils";
import { trierChronologiquement } from "./dates";
import { formaterComplet } from "./graphique";

export interface LigneInterpretation {
  titre: string;
  texte: string;
}

export interface Interpretation {
  /** Comment lire ce type de graphique, en une ou deux phrases simples. */
  guide: string;
  /** Constats complémentaires (tendance, régularité, écarts à la moyenne…). */
  complements: LigneInterpretation[];
  /** Ce qu'il faut retenir, en langage courant. */
  resume: string | null;
  /** Questions à se poser ou vérifications utiles. */
  pistes: string[];
}

export interface GraphiqueAInterpreter {
  titre?: string;
  type?: string;
  labels?: unknown[];
  datasets?: { label?: string; data?: unknown[] }[];
  /** Graphiques déjà expliqués ailleurs (nuage, histogramme, combiné) : seul le guide de lecture est ajouté. */
  constats?: unknown[];
  /** Force la lecture comme une évolution dans le temps (vrai) ou comme des catégories (faux). */
  temporel?: boolean;
  /** Faux quand on ne peut pas cliquer sur le graphique pour filtrer (carte, par exemple). */
  interactif?: boolean;
  /** Nom féminin des éléments comparés, au singulier (« zone », « localité ») ; « catégorie » par défaut. */
  motCategorie?: string;
}

const versValeur = (v: unknown): number | null =>
  v === null || v === undefined || v === "" || typeof v === "boolean" || Number.isNaN(Number(v)) ? null : Number(v);
const estAutres = (label: string) => /^autres \(\d+\)$/i.test(label.trim());
const f = (v: number) => formaterComplet(arrondir(v));
const pct = (v: number) => `${formaterComplet(Math.round(v * 10) / 10)} %`;
const pluriel = (n: number, mot: string) => `${formaterComplet(n)} ${mot}${n > 1 ? "s" : ""}`;

/** Écart-type rapporté à la moyenne, en %. */
function variabilite(vals: number[]): number | null {
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (!m) return null;
  const v = vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length;
  return (Math.sqrt(v) / Math.abs(m)) * 100;
}

/** Droite des moindres carrés sur les rangs 0..n-1 : pente par période et part de variation expliquée (R²). */
function tendance(vals: number[]): { pente: number; r2: number } | null {
  const n = vals.length;
  if (n < 3) return null;
  const mx = (n - 1) / 2;
  const my = vals.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  vals.forEach((y, x) => {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  });
  if (!sxx) return null;
  const pente = sxy / sxx;
  return { pente, r2: syy ? (sxy * sxy) / (sxx * syy) : 0 };
}

function motVariabilite(cv: number): string {
  if (cv < 10) return "très stables";
  if (cv < 25) return "assez stables";
  if (cv < 50) return "variables";
  return "très irrégulières";
}

/** Guide de lecture selon le type de graphique. */
export function guideLecture(type: string, temporel = false): string {
  const t = type.toLowerCase();
  if (t.includes("nuage"))
    return "Chaque point est une ligne du fichier, placée selon la mesure de l'axe horizontal (X) et celle de l'axe vertical (Y). Si les points forment une bande qui monte de gauche à droite, les deux mesures augmentent ensemble ; s'ils descendent, l'une baisse quand l'autre monte ; s'ils forment un nuage sans direction, il n'y a pas de lien visible. Les points isolés, loin des autres, sont des cas atypiques à examiner.";
  if (t.includes("histogramme"))
    return "Chaque barre couvre un intervalle de valeurs ; sa hauteur indique combien de lignes ont une valeur dans cet intervalle. Une forme en cloche signifie que la plupart des valeurs sont proches du centre ; une longue traîne vers la droite signifie que quelques valeurs sont beaucoup plus élevées que les autres.";
  if (t.includes("combin"))
    return "Deux mesures sont superposées : les barres pour la première, la courbe pour la seconde. Comparez la forme des deux : si elles montent et descendent ensemble, les mesures sont liées. Quand il y a deux axes, chaque mesure se lit sur son propre axe (gauche ou droite).";
  if (t.includes("camembert") || t.includes("anneau"))
    return "Le cercle entier représente le total (100 %). Chaque part correspond à une catégorie : plus elle est grande, plus la catégorie pèse dans le total. Ce graphique sert à voir qui pèse le plus, pas à suivre une évolution. Survolez une part pour voir sa valeur exacte et son pourcentage ; cliquez dessus pour filtrer toute l'analyse sur cette catégorie.";
  if (t.includes("carte"))
    return "Chaque lieu (ou chaque zone) est coloré ou dimensionné selon sa valeur : plus la couleur est foncée ou le cercle grand, plus la valeur est élevée. Les zones grises n'ont aucune donnée dans le fichier. Survolez un lieu pour voir sa valeur exacte.";
  if (t.includes("courbe") || t.includes("aire") || temporel)
    return "L'axe horizontal suit le temps, du plus ancien (à gauche) au plus récent (à droite) ; l'axe vertical donne la valeur. Une courbe qui monte signale une hausse, une courbe qui descend une baisse. Regardez d'abord la direction générale, puis les pics et les creux. Survolez un point pour voir la valeur exacte ; cliquez dessus pour filtrer l'analyse sur cette période.";
  return "Chaque barre représente une catégorie ; sa longueur est proportionnelle à la valeur. Comparez les longueurs : plus la barre est longue, plus la valeur est grande. Survolez une barre pour voir la valeur exacte ; cliquez dessus pour filtrer toute l'analyse sur cette catégorie.";
}

/** Nom de la mesure tel qu'il apparaît dans la légende, sans le préfixe d'agrégation (« Somme — Montant » -> « Montant »). */
function nomMesure(label: string): string {
  return label.replace(/^(somme|moyenne|m[ée]diane|nombre|minimum|maximum)\s*[—:-]\s*/i, "").trim() || label;
}

/**
 * Interprétation détaillée d'un graphique de barres, de courbe, d'aires ou de parts.
 * Complète `expliquerGraphique` (constats de base) sans le répéter.
 */
export function interpreterGraphique(g: GraphiqueAInterpreter): Interpretation | null {
  const brut = interpreterBrut(g);
  if (!brut) return null;
  const mot = g.motCategorie;
  if (!mot || mot === "catégorie") return brut;
  const remplacer = (t: string) => t.replace(/catégorie/g, mot).replace(/Catégorie/g, mot.charAt(0).toUpperCase() + mot.slice(1));
  return {
    guide: brut.guide,
    resume: brut.resume && remplacer(brut.resume),
    complements: brut.complements.map((l) => ({ titre: remplacer(l.titre), texte: remplacer(l.texte) })),
    pistes: brut.pistes.map(remplacer),
  };
}

function interpreterBrut(g: GraphiqueAInterpreter): Interpretation | null {
  const type = String(g.type ?? "");
  const labels = (g.labels ?? []).map((l) => String(l ?? ""));
  const temporel =
    g.temporel ??
    (/courbe|aire/i.test(type) || (labels.length >= 3 && !/camembert|anneau/i.test(type) && trierChronologiquement(labels, (x) => x) !== null));
  const guide = guideLecture(type, temporel);
  if (g.constats || /nuage|histogramme|combin/i.test(type)) return { guide, complements: [], resume: null, pistes: [] };

  const series = (g.datasets ?? []).map((d) => ({ nom: nomMesure(String(d.label ?? "Série")), valeurs: labels.map((_, i) => versValeur(d.data?.[i])) }));
  if (!labels.length || !series.length) return { guide, complements: [], resume: null, pistes: [] };

  const descriptif = `${g.titre ?? ""} ${(g.datasets ?? [])[0]?.label ?? ""}`;
  const nonAdditif = /(moyenne|m[ée]diane|minimum|maximum|average|median)/i.test(descriptif);
  const complements: LigneInterpretation[] = [];
  const pistes: string[] = [];
  let resume: string | null = null;

  // ---------------------------------------------------------------- Plusieurs séries
  if (series.length >= 2) {
    const evolutions: string[] = [];
    const scores = series.map((s) => {
      const vals = s.valeurs.filter((v): v is number => v !== null);
      return { nom: s.nom, vals, niveau: vals.length ? vals.reduce((a, b) => a + b, 0) / (nonAdditif ? vals.length : 1) : null };
    });
    if (temporel) {
      for (const s of scores.slice(0, 6)) {
        if (s.vals.length < 2) continue;
        const a = s.vals[0];
        const b = s.vals[s.vals.length - 1];
        evolutions.push(`« ${s.nom} » ${b > a ? "en hausse" : b < a ? "en baisse" : "stable"}${a !== 0 && b !== a ? ` (${b > a ? "+" : "−"}${pct(Math.abs(((b - a) / Math.abs(a)) * 100))})` : ""}`);
      }
      if (evolutions.length) complements.push({ titre: "Évolution de chaque série", texte: `Entre la première et la dernière période : ${evolutions.join(" ; ")}.` });
    }
    // Régularité du classement : la série en tête l'est-elle partout ?
    const classees = scores.filter((s) => s.niveau !== null).sort((a, b) => (b.niveau as number) - (a.niveau as number));
    const leader = classees[0];
    if (leader) {
      let comparables = 0;
      let enTete = 0;
      labels.forEach((_, i) => {
        const pts = series.map((s) => ({ nom: s.nom, v: s.valeurs[i] })).filter((p): p is { nom: string; v: number } => p.v !== null);
        if (pts.length < 2) return;
        comparables++;
        if (pts.reduce((a, p) => (p.v > a.v ? p : a)).nom === leader.nom) enTete++;
      });
      const unite = temporel ? "périodes" : "catégories";
      if (comparables) {
        const part = enTete / comparables;
        resume =
          part >= 0.75
            ? `« ${leader.nom} » domine de façon constante : elle arrive en tête sur ${enTete} ${unite} sur ${comparables}.`
            : part >= 0.5
            ? `« ${leader.nom} » arrive en tête dans l'ensemble, mais pas partout (${enTete} ${unite} sur ${comparables}) : l'avantage change selon les cas.`
            : `Aucune série ne domine nettement : « ${leader.nom} » a le niveau ${nonAdditif ? "moyen" : "global"} le plus élevé, mais n'est en tête que sur ${enTete} ${unite} sur ${comparables}.`;
        if (part < 0.75) pistes.push(`Repérez les ${unite} où « ${leader.nom} » est devancée : ce sont elles qui expliquent les différences entre séries.`);
      }
    }
    pistes.push("Les séries se comparent sur la même échelle : un écart de hauteur correspond à un écart réel de valeur.");
    return { guide, complements, resume, pistes };
  }

  // ---------------------------------------------------------------- Une seule série
  const mesure = series[0].nom;
  const tous = labels.map((label, i) => ({ label, v: series[0].valeurs[i] }));
  const points = tous.filter((p): p is { label: string; v: number } => p.v !== null);
  if (points.length < 2) return { guide, complements, resume: null, pistes };
  const vals = points.map((p) => p.v);
  const moyenne = vals.reduce((a, b) => a + b, 0) / vals.length;
  const cv = variabilite(vals);

  if (temporel) {
    const t = tendance(vals);
    const premier = points[0];
    const dernier = points[points.length - 1];
    const avantDernier = points[points.length - 2];

    // Tendance de fond
    let sensTendance: "hausse" | "baisse" | "plat" = "plat";
    if (t && points.length >= 3) {
      const rel = moyenne ? (t.pente / Math.abs(moyenne)) * 100 : 0;
      if (t.r2 < 0.15 || Math.abs(rel) < 0.5) {
        complements.push({ titre: "Tendance de fond", texte: `Pas de direction nette : les valeurs oscillent autour de ${f(moyenne)} sans monter ni descendre durablement.` });
      } else {
        sensTendance = t.pente > 0 ? "hausse" : "baisse";
        complements.push({
          titre: "Tendance de fond",
          texte: `${sensTendance === "hausse" ? "À la hausse" : "À la baisse"} : en moyenne ${t.pente > 0 ? "+" : "−"}${f(Math.abs(t.pente))} par période (${t.pente > 0 ? "+" : "−"}${pct(Math.abs(rel))} de la moyenne). ${
            t.r2 >= 0.6 ? "Cette tendance est régulière : la plupart des points suivent la même direction." : "Cette tendance est irrégulière : elle se dessine malgré des à-coups importants."
          }`,
        });
      }
    }

    // Dernière variation
    const d = dernier.v - avantDernier.v;
    complements.push({
      titre: "Dernière évolution",
      texte:
        d === 0
          ? `« ${dernier.label} » est au même niveau que « ${avantDernier.label} » (${f(dernier.v)}).`
          : `De « ${avantDernier.label} » à « ${dernier.label} » : ${d > 0 ? "hausse" : "baisse"} de ${f(Math.abs(d))}${avantDernier.v !== 0 ? ` (${d > 0 ? "+" : "−"}${pct(Math.abs((d / Math.abs(avantDernier.v)) * 100))})` : ""}.`,
    });

    // Hausses / baisses et plus forts mouvements
    let hausses = 0;
    let baisses = 0;
    let plusForteHausse: { de: string; a: string; e: number } | null = null;
    let plusForteBaisse: { de: string; a: string; e: number } | null = null;
    for (let i = 1; i < points.length; i++) {
      const e = points[i].v - points[i - 1].v;
      if (e > 0) hausses++;
      else if (e < 0) baisses++;
      if (e > 0 && (!plusForteHausse || e > plusForteHausse.e)) plusForteHausse = { de: points[i - 1].label, a: points[i].label, e };
      if (e < 0 && (!plusForteBaisse || e < plusForteBaisse.e)) plusForteBaisse = { de: points[i - 1].label, a: points[i].label, e };
    }
    if (points.length >= 3) {
      const morceaux = [`${pluriel(hausses, "hausse")} et ${pluriel(baisses, "baisse")} d'une période à l'autre`];
      if (plusForteHausse) morceaux.push(`plus forte hausse en « ${plusForteHausse.a} » (+${f(plusForteHausse.e)})`);
      if (plusForteBaisse) morceaux.push(`plus forte baisse en « ${plusForteBaisse.a} » (−${f(Math.abs(plusForteBaisse.e))})`);
      complements.push({ titre: "Mouvements", texte: `${morceaux.join(" ; ")}.` });
    }
    if (cv !== null && points.length >= 3) {
      complements.push({
        titre: "Régularité",
        texte: `Les valeurs sont ${motVariabilite(cv)} : elles s'écartent en moyenne de ${pct(cv)} de leur moyenne (${f(moyenne)}).`,
      });
    }

    // Résumé
    const global = dernier.v > premier.v ? "a progressé" : dernier.v < premier.v ? "a reculé" : "est revenu à son niveau de départ";
    resume =
      `« ${mesure} » ${global} entre « ${premier.label} » et « ${dernier.label} »` +
      (sensTendance === "plat" ? ", sans tendance durable" : sensTendance === "hausse" ? ", avec une tendance de fond à la hausse" : ", avec une tendance de fond à la baisse") +
      `. La dernière période (${f(dernier.v)}) est ${dernier.v >= moyenne ? "au-dessus" : "en dessous"} de la moyenne de la période (${f(moyenne)}).`;

    // Pistes
    if (d < 0 && avantDernier.v !== 0 && Math.abs(d / avantDernier.v) >= 0.3)
      pistes.push(`La chute de la dernière période est forte : vérifiez d'abord que « ${dernier.label} » est complète (période en cours, données pas encore saisies) avant de conclure à une baisse réelle.`);
    if (cv !== null && points.length >= 4) {
      const ecartType = (cv / 100) * Math.abs(moyenne);
      const haut = points.reduce((a, p) => (p.v > a.v ? p : a));
      const bas = points.reduce((a, p) => (p.v < a.v ? p : a));
      if (ecartType > 0 && haut.v - moyenne > 2 * ecartType)
        pistes.push(`Le pic de « ${haut.label} » sort nettement de l'ordinaire : cherchez ce qui s'est passé à ce moment-là (opération exceptionnelle, saisie en double, événement particulier).`);
      if (ecartType > 0 && moyenne - bas.v > 2 * ecartType)
        pistes.push(`Le creux de « ${bas.label} » est anormalement bas : données manquantes, arrêt d'activité ou vrai recul ? À vérifier.`);
    }
    if (sensTendance === "baisse") pistes.push("La tendance est à la baisse : filtrez par catégorie (région, produit…) pour voir lesquelles expliquent ce recul ; l'onglet « Analyses métier › Évolution » le fait automatiquement.");
    if (sensTendance === "hausse") pistes.push("Pour confirmer la hausse, comparez avec la même période de l'année précédente : une partie peut venir d'un effet saisonnier.");
    if (cv !== null && cv >= 50) pistes.push("Les valeurs varient beaucoup d'une période à l'autre : regroupez par trimestre ou par année pour mieux voir la tendance.");
    if (points.length >= 3) pistes.push("Le module « Prévisions » prolonge cette courbe et donne une fourchette pour les prochaines périodes.");
    return { guide, complements, resume, pistes: pistes.slice(0, 4) };
  }

  // ---------------------------------------------------------------- Catégories
  const nommes = points.filter((p) => !estAutres(p.label)).sort((a, b) => b.v - a.v);
  if (nommes.length < 2) return { guide, complements, resume: null, pistes };
  const total = vals.reduce((a, b) => a + b, 0);
  const parts = !nonAdditif && total > 0 && vals.every((v) => v >= 0);
  const [tete, second] = nommes;
  const queue = nommes[nommes.length - 1];
  const auDessus = nommes.filter((p) => p.v > moyenne).length;

  complements.push({
    titre: "Par rapport à la moyenne",
    texte: `La moyenne par catégorie est de ${f(moyenne)}. ${auDessus} catégorie${auDessus > 1 ? "s" : ""} sur ${nommes.length} ${auDessus > 1 ? "sont" : "est"} au-dessus${
      moyenne > 0 && tete.v > 0 ? ` ; « ${tete.label} » fait ${formaterComplet(Math.round((tete.v / moyenne) * 10) / 10)} fois la moyenne` : ""
    }.`,
  });

  const ecartDeux = second.v > 0 ? tete.v / second.v : null;
  complements.push({
    titre: "Écart entre les deux premiers",
    texte:
      ecartDeux === null
        ? `« ${tete.label} » (${f(tete.v)}) devant « ${second.label} » (${f(second.v)}).`
        : ecartDeux >= 1.5
        ? `« ${tete.label} » devance nettement « ${second.label} » : ${formaterComplet(Math.round(ecartDeux * 10) / 10)} fois plus (${f(tete.v)} contre ${f(second.v)}).`
        : `« ${tete.label} » et « ${second.label} » sont proches : ${f(tete.v)} contre ${f(second.v)}, soit ${pct((ecartDeux - 1) * 100)} d'écart.`,
  });

  let verdict: "forte" | "moyenne" | "faible" | null = null;
  if (parts && nommes.length >= 4) {
    // Combien de catégories faut-il pour faire la moitié du total ?
    let cumul = 0;
    let k = 0;
    for (const p of nommes) {
      cumul += p.v;
      k++;
      if (cumul >= total / 2) break;
    }
    const partCat = k / points.length;
    verdict = partCat <= 0.2 ? "forte" : partCat <= 0.35 ? "moyenne" : "faible";
    complements.push({
      titre: "Répartition",
      texte: `${k} catégorie${k > 1 ? "s" : ""} sur ${points.length} suffi${k > 1 ? "sent" : "t"} à faire la moitié du total : la répartition est ${
        verdict === "forte" ? "très concentrée sur quelques catégories" : verdict === "moyenne" ? "assez concentrée" : "plutôt équilibrée"
      }.`,
    });
    // Le premier pèse-t-il autant que plusieurs derniers réunis ?
    let somme = 0;
    let n = 0;
    for (let i = nommes.length - 1; i > 0 && somme + nommes[i].v <= tete.v; i--) {
      somme += nommes[i].v;
      n++;
    }
    if (n >= 2) complements.push({ titre: "Poids du premier", texte: `« ${tete.label} » pèse à lui seul plus que les ${n} dernières catégories réunies.` });
  }

  resume =
    (ecartDeux !== null && ecartDeux >= 1.5 ? `« ${tete.label} » domine nettement` : `« ${tete.label} » arrive en tête, de peu devant « ${second.label} »`) +
    (parts ? ` avec ${pct((tete.v / total) * 100)} du total` : "") +
    `, tandis que « ${queue.label} » ferme la marche (${f(queue.v)}).` +
    (verdict === "forte" ? " L'essentiel repose sur un petit nombre de catégories." : verdict === "faible" ? " Le total est bien réparti entre les catégories." : "");

  if (verdict === "forte" || verdict === "moyenne")
    pistes.push(`Une grande part du total dépend de quelques catégories : surveillez « ${tete.label} »${second ? ` et « ${second.label} »` : ""} en priorité, une baisse de leur côté pèserait lourd.`);
  if (queue.v >= 0 && tete.v > 0 && queue.v < moyenne * 0.3)
    pistes.push(`« ${queue.label} » est très en dessous de la moyenne : potentiel à développer, ou données incomplètes à vérifier ?`);
  if (nonAdditif)
    pistes.push("Ce sont des moyennes : une catégorie qui ne compte que quelques lignes peut afficher une valeur extrême. Vérifiez le nombre de lignes derrière les valeurs les plus hautes et les plus basses.");
  if (nommes.length < points.length) pistes.push("La barre « Autres » regroupe les plus petites catégories : augmentez le « Nombre de valeurs affichées » pour les voir en détail.");
  if (g.interactif !== false) pistes.push("Cliquez sur une catégorie pour filtrer toute l'analyse sur elle et voir ce qui la compose.");
  return { guide, complements, resume, pistes: pistes.slice(0, 4) };
}
