import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import cytoscape from "cytoscape";
import cola from "cytoscape-cola";
import MapView from "./MapView";
import { useLang } from "./i18n";
import "./styles.css";

cytoscape.use(cola);

const pct = (v, lang = "en") =>
  Number.isFinite(Number(v))
    ? new Intl.NumberFormat(lang, {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(Number(v))
    : "—";
const num = (v, lang = "en") =>
  Number.isFinite(Number(v))
    ? new Intl.NumberFormat(lang, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(v))
    : "—";
const color = (v) => {
  v = Math.max(-1, Math.min(1, Number(v) || 0));
  const neutral = [86, 92, 100]; // mid slate — balanced
  const importer = [230, 162, 60]; // ice blue
  const exporter = [60, 210, 202]; // muted gold
  const target = v < 0 ? importer : exporter;
  const t = Math.abs(v);
  const mix = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${mix(neutral[0], target[0])},${mix(neutral[1], target[1])},${mix(neutral[2], target[2])})`;
};
function App() {
  const box = useRef(null),
    cyRef = useRef(null),
    timers = useRef([]),
    homeView = useRef(null);
  const { lang, setLang, t, displayName } = useLang();
  const [data, setData] = useState(null),
    [selected, setSelected] = useState(null),
    [query, setQuery] = useState(""),
    [threshold, setThreshold] = useState(0.03),
    [topOnly, setTopOnly] = useState(false),
    [demo, setDemo] = useState(false),
    [view, setView] = useState("network"); // "network" | "map"
  useEffect(() => {
    fetch("/data/network.json")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setData)
      .catch(() => {
        setDemo(true);
        setData({ countries: [], edges: [] });
      });
  }, []);
  const ids = useMemo(
    () =>
      new Set(data?.countries?.map((c) => String(c.id).toLowerCase()) || []),
    [data],
  );
  const countries = data?.countries || [];
  const edges = useMemo(
    () =>
      data?.edges?.filter(
        (e) =>
          Number(e.weight) >= threshold &&
          e.source !== e.target &&
          ids.has(String(e.source).toLowerCase()) &&
          ids.has(String(e.target).toLowerCase()),
      ) || [],
    [data, threshold, ids],
  );
  const [hover, setHover] = useState(null); // { x, y, text } | null
  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  // Clears the selection (and, for the network view, the camera). Works for
  // whichever view is active — MapView reacts to `selected` becoming null on
  // its own via its internal effect.
  const reset = () => {
    clear();
    setSelected(null);
    setQuery("");
    if (view !== "network") return;
    let cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass(
        "dimmed selected connected import-flow export-flow",
      );
      cy.nodes().style("opacity", 1);
      cy.edges().style("opacity", 0.28);
    });
    cy.forceRender(); // flush the style diff before the camera starts moving
    const target = homeView.current
      ? { pan: homeView.current.pan, zoom: homeView.current.zoom }
      : { fit: { eles: cy.elements(), padding: 65 } };
    cy.animate(target, { duration: 650, easing: "ease-in-out-cubic" });
  };
  // Applies the cytoscape-specific focus visuals (dimming, highlighted
  // neighborhood, camera move). Only relevant while the network view is
  // mounted — it's triggered by the `selected` effect below, not by clicks
  // directly, so map clicks and search both funnel through one code path.
  const applyNetworkFocus = (id) => {
    let cy = cyRef.current,
      n = cy?.getElementById(id);
    if (!n?.length) return;
    clear();
    let hood = n.closedNeighborhood();
    cy.batch(() => {
      cy.elements().removeClass(
        "dimmed selected connected import-flow export-flow",
      );
      cy.nodes().style("opacity", 1);
      cy.edges().style("opacity", 0.28);
      cy.elements()
        .difference(hood)
        .forEach((ele) => ele.style("opacity", ele.isNode() ? 0.15 : 0.08));
      n.style("opacity", 1).addClass("selected");
      hood.edges().addClass("connected").style("opacity", 0.9);
      hood
        .edges()
        .forEach((e) =>
          e.data("source") === id
            ? e.addClass("export-flow")
            : e.addClass("import-flow"),
        );
    });
    cy.animate(
      { center: { eles: n }, zoom: 1.55 },
      { duration: 650, easing: "ease-in-out-cubic" },
    );
  };
  useEffect(() => {
    if (view !== "network") return;
    if (selected) applyNetworkFocus(selected.id);
    // reset() already handles the null case (Reset view button, bg click) —
    // nothing further to do here when selected clears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, view]);
  useEffect(() => {
    if (view !== "network" || !data || !box.current) return;
    clear();
    cyRef.current?.destroy();
    const ns = countries.map((c) => ({
      data: {
        id: String(c.id).toLowerCase(),
        label: String(c.id).toUpperCase(),
        name: c.name,
        name_fr: c.name_fr,
        net: Number(c.net_dominance) || 0,
        size: Number(c.network_involvement) || 0,
        color: color(c.net_dominance),
      },
    }));
    const es = edges.map((e, i) => ({
      data: {
        id: `${e.source}-${e.target}-${i}`,
        source: String(e.source).toLowerCase(),
        target: String(e.target).toLowerCase(),
        weight: Number(e.weight) || 0,
      },
    }));
    let cy = cytoscape({
      container: box.current,
      elements: [...ns, ...es],
      layout: {
        name: "cola",
        animate: true,
        refresh: 1,
        maxSimulationTime: 3000,
        fit: true,
        padding: 65,
        nodeSpacing: 4, // minimum gap enforced between node boundaries
        edgeLength: (edge) => 110,
        avoidOverlap: true, // the key option — hard overlap-removal pass
        nodeDimensionsIncludeLabels: true, // treats label bounding box as part of the node for overlap purposes
        randomize: false,
        convergenceThreshold: 0.01,
      },
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            width: "mapData(size,0,5,12,38)",
            height: "mapData(size,0,5,12,38)",
            "background-color": "data(color)",
            "background-opacity": 0.97,
            "border-width": 0.6,
            "border-color": "#0A0B0D",
            "border-opacity": 0.7,
            color: "#F2F3F5",
            "font-family":
              "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace",
            "font-size": "mapData(size,0,5,7,11)",
            "font-weight": 400,
            "text-valign": "center",
            "text-halign": "center",
            "text-outline-width": 0.6,
            "text-outline-color": "#0A0B0D",
            "text-outline-opacity": 0.95,
            "overlay-opacity": 0,
            opacity: 1,
            "z-index": 2,
            "transition-property":
              "background-color,border-color,border-width,width,height",
            "transition-duration": 200,
          },
        },
        {
          selector: "edge",
          style: {
            width: "mapData(weight,.03,.4,.6,3.5)",
            "line-color": "#454A52",
            "target-arrow-color": "#454A52",
            "target-arrow-shape": "triangle-backcurve",
            "arrow-scale": 0.55,
            "curve-style": "bezier",
            opacity: 0.24,
            "transition-property": "width,line-color,target-arrow-color",
            "transition-duration": 250,
          },
        },
        { selector: ".dimmed", style: {} },
        {
          selector: ".selected",
          style: {
            "border-width": 1.75,
            "border-color": "#F5F7FA",
            "border-opacity": 1,
            "background-opacity": 1,
            width: "mapData(size,0,5,14,42)",
            height: "mapData(size,0,5,14,42)",
            "font-weight": 500,
            "font-size": "mapData(size,0,5,8,12)",
            "z-index": 999,
          },
        },
        {
          selector: ".connected",
          style: {
            "line-color": "#9AA5AF",
            "target-arrow-color": "#9AA5AF",
            "z-index": 500,
          },
        },
        {
          selector: ".import-flow",
          style: {
            "line-color": "#E6A23C",
            "target-arrow-color": "#E6A23C",
          },
        },
        {
          selector: ".export-flow",
          style: {
            "line-color": "#3AAFA9",
            "target-arrow-color": "#3AAFA9",
          },
        },
      ],
      minZoom: 0.25,
      maxZoom: 3,
      wheelSensitivity: 0.4,
    });
    cyRef.current = cy;
    cy.on("layoutstop", () => {
      // capture the fitted view only once the layout has actually finished moving nodes
      cy.fit(cy.elements(), 65);
      homeView.current = { pan: { ...cy.pan() }, zoom: cy.zoom() };
    });
    cy.on("tap", "node", (e) => {
      let id = e.target.id();
      setSelected(
        countries.find((c) => String(c.id).toLowerCase() === id) || null,
      );
    });
    cy.on("tap", (e) => {
      if (e.target === cy) {
        reset();
      }
    });
    cy.on("mouseover", "node", (e) => {
      const n = e.target;
      const pos = n.renderedPosition();
      const nodeLang = localStorage.getItem("lang") || "en";
      const label =
        nodeLang === "fr"
          ? n.data("name_fr") || n.data("name")
          : n.data("name");
      setHover({ x: pos.x, y: pos.y, text: label || n.data("label") });
      box.current.style.cursor = "pointer";
    });

    cy.on("mouseout", "node", () => {
      setHover(null);
      box.current.style.cursor = "default";
    });

    cy.on("pan zoom", () => setHover(null));
    return () => {
      clear();
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, threshold, view]);
  useEffect(() => {
    if (!query.trim() || !data) return;
    let q = query.toLowerCase(),
      c = countries.find(
        (x) =>
          String(x.id).toLowerCase() === q ||
          String(x.name || "")
            .toLowerCase()
            .includes(q) ||
          String(x.name_fr || "")
            .toLowerCase()
            .includes(q),
      );
    if (c) setSelected(c);
  }, [query]);
  const other = (id) =>
    countries.find(
      (c) => String(c.id).toLowerCase() === String(id).toLowerCase(),
    );
  const imports = selected
      ? edges
          .filter((e) => e.target === selected.id)
          .sort((a, b) => b.weight - a.weight)
      : [],
    exports = selected
      ? edges
          .filter((e) => e.source === selected.id)
          .sort((a, b) => b.weight - a.weight)
      : [];
  const rows = (arr, top) => (top ? arr.slice(0, 5) : arr);
  return (
    <div className="app">
      <header>
        <div>
          <div className="eyebrow">INTERACTIVE DASHBOARD</div>
          <h1>{t("title")}</h1>
          <p>{t("tagline")}</p>
        </div>
        <div className="actions">
          <button onClick={() => setLang(lang === "en" ? "fr" : "en")}>
            {lang === "en" ? "FR" : "EN"}
          </button>
          <button
            onClick={() => {
              reset();
              setView((v) => (v === "network" ? "map" : "network"));
            }}
          >
            {view === "network" ? t("mapViewBtn") : t("networkViewBtn")}
          </button>
          <button onClick={reset}>{t("resetBtn")}</button>
        </div>
      </header>
      {demo && (
        <div className="notice">
          {t("noticeDemo")} <code>public/data/network.json</code>.
        </div>
      )}
      <div className="controls">
        <label>
          <span>{t("searchLabel")}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
          />
        </label>
        <label className="range">
          <span>
            {t("thresholdLabel")} <b>{pct(threshold, lang)}</b>
          </span>
          <input
            type="range"
            min=".01"
            max=".20"
            step=".01"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={topOnly}
            onChange={(e) => setTopOnly(e.target.checked)}
          />{" "}
          {t("topOnly")}
        </label>
      </div>
      <main>
        <section className="network-card">
          <div className="meta">
            <span>
              {countries.length} {t("countriesLabel")}
            </span>
            <span>
              {edges.length} {t("relationshipsLabel")}
            </span>
            <span className="hint">{t("hoverHint")}</span>
          </div>
          {view === "network" ? (
            <div className="network" style={{ position: "relative" }}>
              <div ref={box} style={{ position: "absolute", inset: 0 }} />
              {hover && (
                <div
                  className="node-tooltip"
                  style={{ left: hover.x, top: hover.y }}
                >
                  {hover.text}
                </div>
              )}
            </div>
          ) : (
            <MapView
              countries={countries}
              edges={edges}
              ids={ids}
              selected={selected}
              onSelectCountry={(id) => setSelected(other(id) || null)}
              onBackground={reset}
              colorFn={color}
              lang={lang}
            />
          )}
          <div className="legend">
            <div>
              <span className="dot blue" />
              {t("importer")} <span className="dot grey" />
              {t("balanced")} <span className="dot red" />
              {t("exporter")} <span className="line" />
              {t("weak")} <span className="line thick" />
              {t("strong")}
            </div>
            <small>
              {view === "network" ? t("legendNetwork") : t("legendMap")}
            </small>
          </div>
        </section>
        <aside className="panel">
          {!selected ? (
            <div className="empty">
              <div className="icon">↗</div>
              <h2>{t("emptyTitle")}</h2>
              <p>{t("emptyBody")}</p>
            </div>
          ) : (
            <>
              <div className="panel-head">
                <div>
                  <div className="code">
                    {String(selected.id).toUpperCase()}
                  </div>
                  <h2>{displayName(selected)}</h2>
                </div>
                <button className="close" onClick={reset}>
                  ×
                </button>
              </div>
              <div className="composition">
                <div className="comp-label">
                  <span>{t("chartComposition")}</span>
                  <span>
                    {selected.n_weeks ?? "—"} {t("weeks")}
                  </span>
                </div>
                <div className="bar">
                  <i
                    style={{ width: `${(selected.local_share || 0) * 100}%` }}
                  />
                  <i
                    style={{ width: `${(selected.foreign_share || 0) * 100}%` }}
                  />
                </div>
                <div className="labels">
                  <span>
                    {t("localShare")} <b>{pct(selected.local_share, lang)}</b>
                  </span>
                  <span>
                    {t("foreignShare")}{" "}
                    <b>{pct(selected.foreign_share, lang)}</b>
                  </span>
                </div>
                <div className="metrics">
                  <div>
                    <small>{t("unknownMeta")}</small>
                    <b>{pct(selected.unknown_share, lang)}</b>
                  </div>
                  <div>
                    <small>{t("exportIntensity")}</small>
                    <b>{num(selected.export_intensity, lang)}</b>
                  </div>
                  <div>
                    <small>{t("importIntensity")}</small>
                    <b>{num(selected.import_intensity, lang)}</b>
                  </div>
                </div>
              </div>
              <div className="position">
                <span>{t("networkPosition")}</span>
                <b
                  className={
                    selected.net_dominance >= 0 ? "exporter" : "importer"
                  }
                >
                  {selected.net_dominance >= 0 ? t("exporter") : t("importer")}
                </b>
                <span>{num(selected.net_dominance, lang)}</span>
              </div>
              <List
                title={t("mainImports")}
                sub={t("importsSub")}
                data={rows(imports, topOnly)}
                other={other}
                pct={(v) => pct(v, lang)}
                noRelationship={t("noRelationship")}
              />
              <List
                title={t("mainExports")}
                sub={t("exportsSub")}
                data={rows(exports, topOnly)}
                other={other}
                pct={(v) => pct(v, lang)}
                noRelationship={t("noRelationship")}
              />
            </>
          )}
        </aside>
      </main>
      <footer>
        <span>{t("tagline")}</span>
        <span>{t("footerTag")}</span>
      </footer>
    </div>
  );
}
function List({ title, sub, data, other, pct, noRelationship }) {
  const isImports = title.toLowerCase().includes("import") || title.toLowerCase().includes("importation");
  return (
    <section className={`relationships ${isImports ? "imports" : "exports"}`}>
      <h3>{title}</h3>
      <p>{sub}</p>
      {data.length ? (
        <div>
          {data.map((e, i) => {
            let c = other(
              e.source === e.target
                ? e.source
                : isImports
                  ? e.source
                  : e.target,
            );
            return (
              <div className="rel" key={`${e.source}-${e.target}-${i}`}>
                <span>{i + 1}</span>
                <b>{c?.id?.toUpperCase() || "—"}</b>
                <i>
                  <em style={{ width: `${Math.min(100, e.weight * 250)}%` }} />
                </i>
                <strong>{pct(e.weight)}</strong>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="none">{noRelationship}</div>
      )}
    </section>
  );
}
createRoot(document.getElementById("root")).render(<App />);
