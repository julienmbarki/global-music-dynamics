import { useState } from "react";

export const STRINGS = {
  en: {
    title: "Foreign Music Flows",
    tagline: "Foreign music flows across Spotify's national Top 200 charts",
    searchLabel: "Search country",
    searchPlaceholder: "Canada or CA",
    thresholdLabel: "Minimum chart share",
    topOnly: "Top 5 relationships",
    mapViewBtn: "Map view",
    networkViewBtn: "Network view",
    resetBtn: "Reset view",
    consumptionViewBtn: "Consumption view",
    dominanceViewBtn: "Dominance view",
    emptyTitle: "Explore a country",
    emptyBody:
      "Click any country to see local and foreign chart composition, main imports, and main exports.",
    mainImports: "Main imports",
    mainExports: "Main exports",
    importsSub: "Foreign source → this chart",
    exportsSub: "This chart → foreign destination",
    noRelationship: "No relationship above the current threshold.",
    exporter: "Exporter",
    importer: "Importer",
    weeks: "weeks",
    localShare: "Local",
    foreignShare: "Foreign",
    unknownMeta: "Unknown metadata",
    exportIntensity: "Export intensity",
    importIntensity: "Import intensity",
    networkPosition: "Network position",
    hoverHint: "Click a country to explore",
    legendNetwork:
      "Node size = international network involvement · Arrow = source → destination",
    legendMap:
      "Click a country to zoom in, then out to its top 5 trade partners",
    noticeDemo:
      "No network.json found. Put your exported dataset in public/data/network.json.",
    countriesLabel: "countries",
    relationshipsLabel: "visible relationships",
    chartComposition: "Chart composition",
    balanced: "Balanced",
    weak: "weak",
    strong: "strong",
    footerTag: "Interactive dashboard",
    foreignConsumption: "Foreign consumption",
    balancedConsumption: "Balanced consumption",
    localConsumption: "Local consumption",
    legendConsumption: "Color represents the share of local music consumption; link thickness represents relationship strength.",
  },
  fr: {
    title: "Flux Musicaux Internationaux",
    tagline: "Flux de musique étrangère dans les Top 200 nationaux de Spotify",
    searchLabel: "Rechercher un pays",
    searchPlaceholder: "Canada ou CA",
    thresholdLabel: "Part minimale du Top",
    topOnly: "5 principales relations",
    mapViewBtn: "Vue carte",
    networkViewBtn: "Vue réseau",
    resetBtn: "Réinitialiser",
    consumptionViewBtn: "Vue consommation",
    dominanceViewBtn: "Vue dominance",
    emptyTitle: "Explorer un pays",
    emptyBody:
      "Cliquez sur un pays pour voir la composition locale/étrangère du classement, les principales importations et exportations.",
    mainImports: "Principales importations",
    mainExports: "Principales exportations",
    importsSub: "Source étrangère → ce classement",
    exportsSub: "Ce classement → destination étrangère",
    noRelationship: "Aucune relation au-dessus du seuil actuel.",
    exporter: "Exportateur",
    importer: "Importateur",
    weeks: "semaines",
    localShare: "Local",
    foreignShare: "Étranger",
    unknownMeta: "Métadonnées inconnues",
    exportIntensity: "Intensité d'exportation",
    importIntensity: "Intensité d'importation",
    networkPosition: "Position dans le réseau",
    hoverHint: "Cliquez sur un pays pour explorer",
    legendNetwork:
      "Taille du nœud = implication internationale · Flèche = source → destination",
    legendMap:
      "Cliquez sur un pays pour zoomer, puis dézoomer sur ses 5 principaux partenaires",
    noticeDemo:
      "Aucun network.json trouvé. Placez votre jeu de données dans public/data/network.json.",
    countriesLabel: "pays",
    relationshipsLabel: "relations visibles",
    chartComposition: "Composition du classement",
    balanced: "Équilibré",
    weak: "faible",
    strong: "fort",
    footerTag: "Tableau de bord interactif",
    foreignConsumption: "Consommation étrangère",
    balancedConsumption: "Consommation équilibrée",
    localConsumption: "Consommation locale",
    legendConsumption: "La couleur représente la part de consommation de musique locale ; l'épaisseur des liens représente la force des relations.",
  },
};

// Reads/writes the language preference to localStorage so it persists
// across visits. Defaults to English for first-time visitors.
export function useLang() {
  const [lang, setLangState] = useState(
    () => localStorage.getItem("lang") || "en",
  );

  const setLang = (l) => {
    localStorage.setItem("lang", l);
    setLangState(l);
  };

  const t = (key) => STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;

  // Picks the localized country name: name_fr when in French and present,
  // falling back to name (and finally the raw id) — never a blank label.
  const displayName = (c) =>
    (lang === "fr" ? c?.name_fr || c?.name : c?.name) || c?.id || "";

  return { lang, setLang, t, displayName };
}
