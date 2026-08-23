import React, { useEffect, useRef, useState } from "react";
import Globe from "react-globe.gl";
import { geoArea, geoBounds, geoCentroid } from "d3-geo";
import { feature as topoFeature } from "topojson-client";
import worldTopology from "world-atlas/countries-110m.json";
import { NUMERIC_TO_ALPHA2 } from "./isoNumeric";

const IMPORT_COLOR = "#E6A23C";
const EXPORT_COLOR = "#3AAFA9";
const BG_FILL = "#171B20";
const BORDER = "#0A0B0D";
const SELECTED_BORDER = "#F5F7FA";
const HOME_VIEW = { lat: 12, lng: 8, altitude: 2.3 };

// Built once at module load — the topology itself never changes.
const WORLD_FEATURES = topoFeature(
  worldTopology,
  worldTopology.objects.countries,
).features;

const BY_ALPHA2 = {};
for (const f of WORLD_FEATURES) {
  const a2 = NUMERIC_TO_ALPHA2[f.id];
  if (a2) BY_ALPHA2[a2] = f;
}

// geoCentroid on a MultiPolygon is area-weighted across every ring — for
// countries whose overseas territories are bundled into the same feature
// (France + French Guiana, Netherlands + its Caribbean islands, etc.),
// that pulls the point out into open ocean. Find the single largest ring
// by spherical area and centroid just that one instead. Same fix as the
// flat-map version, just using d3-geo's spherical (lon/lat) functions
// instead of a projected path, since the globe has no projection to key
// off of.
function mainlandCentroid(feature) {
  const geom = feature?.geometry;
  if (!geom) return [0, 0];
  if (geom.type !== "MultiPolygon" || geom.coordinates.length <= 1) {
    return geoCentroid(feature);
  }
  let best = null;
  let bestArea = -Infinity;
  for (const coords of geom.coordinates) {
    const poly = { type: "Polygon", coordinates: coords };
    const area = Math.abs(geoArea(poly));
    if (area > bestArea) {
      bestArea = area;
      best = poly;
    }
  }
  return best ? geoCentroid(best) : geoCentroid(feature);
}

// [lng, lat] per alpha-2, computed once — no projection or container size
// dependency here (unlike the flat map), since the globe works directly
// in spherical coordinates.
const CENTROID = {};
for (const a2 in BY_ALPHA2) {
  CENTROID[a2] = mainlandCentroid(BY_ALPHA2[a2]);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Camera altitude (globe radius units) sized to fit a country's angular
// extent — mirrors the old boundsToTransform's "fit bounds" logic, just
// in lat/lng degrees instead of projected pixels.
function altitudeForFeature(feature) {
  const [[x0, y0], [x1, y1]] = geoBounds(feature);
  let dx = x1 - x0;
  if (dx < 0) dx += 360; // antimeridian wrap
  const dy = y1 - y0;
  const span = Math.max(dx, dy, 3);
  return clamp(span / 30, 1.5, 2.3);
}

// Approximate altitude to fit a group of countries by their centroids —
// good enough for a "pull back to reveal partners" shot; doesn't need to
// be pixel-exact the way the flat map's fit-to-bounds did.
function altitudeForGroup(a2s) {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const a2 of a2s) {
    const c = CENTROID[a2];
    if (!c) continue;
    x0 = Math.min(x0, c[0]);
    x1 = Math.max(x1, c[0]);
    y0 = Math.min(y0, c[1]);
    y1 = Math.max(y1, c[1]);
  }
  if (!isFinite(x0)) return 1;
  const span = Math.max(x1 - x0, y1 - y0, 3);
  return clamp(span / 22, 0.4, 2.4);
}

// Blend a hex color toward the background fill, used for the "dim" look
// on countries outside the current selection/partner set — the closest
// globe-friendly equivalent of the flat map's opacity: 0.12.
function dim(hex, factor = 0.18) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const bn = parseInt(BG_FILL.replace("#", ""), 16);
  const br = (bn >> 16) & 255,
    bg = (bn >> 8) & 255,
    bb = bn & 255;
  const mix = (a, c) => Math.round(a * factor + c * (1 - factor));
  return `rgb(${mix(r, br)}, ${mix(g, bg)}, ${mix(b, bb)})`;
}

export default function MapView({
  countries,
  edges,
  ids,
  selected,
  onSelectCountry,
  onBackground,
  colorFn,
  lang = "en",
}) {
  const wrapRef = useRef(null);
  const globeEl = useRef(null);
  const stepRef = useRef(null);
  const lastSize = useRef({ width: 0, height: 0 });
  const [size, setSize] = useState({ width: 900, height: 520 });
  const [chosenEdges, setChosenEdges] = useState([]);
  const [visible, setVisible] = useState(new Set()); // alpha2 codes lit up

  useEffect(() => {
    if (!wrapRef.current) return;
    let raf = null;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      if (
        Math.abs(box.width - lastSize.current.width) < 2 &&
        Math.abs(box.height - lastSize.current.height) < 2
      ) {
        return;
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (box.width > 0 && box.height > 0) {
          lastSize.current = { width: box.width, height: box.height };
          setSize({ width: box.width, height: box.height });
        }
      });
    });
    ro.observe(wrapRef.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const other = (id) =>
    countries.find(
      (c) => String(c.id).toLowerCase() === String(id).toLowerCase(),
    );

  // Localized name: French name when in French and present, falling back
  // to the English name, and finally the raw code — mirrors i18n.js's
  // displayName so both views agree on labeling.
  const nameFor = (a2) => {
    const c = other(a2);
    return (lang === "fr" ? c?.name_fr || c?.name : c?.name) || "";
  };

  const partnersOf = (id) => {
    const outgoing = edges
      .filter((e) => e.source === id)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);
    const incoming = edges
      .filter((e) => e.target === id)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);
    return [...outgoing, ...incoming];
  };

  // Camera sequence: zoom to the selected country, then — once the new
  // arcs/labels have had a moment to mount and fade in — pull back to
  // frame it together with its top partners. Same two-phase shape as the
  // flat map, but the tween itself is handled internally by the globe
  // (pointOfView's own camera interpolation), so there's no custom rAF
  // loop or transform math to keep in sync here.
  useEffect(() => {
    clearTimeout(stepRef.current);

    if (!globeEl.current) return;

    if (!selected) {
      setChosenEdges([]);
      setVisible(new Set());
      return;
    }

    const feature = BY_ALPHA2[selected.id];
    if (!feature) return;

    const [lng, lat] = CENTROID[selected.id] || [0, 0];
    const altitude1 = altitudeForFeature(feature);

    // Reset relationship layers before starting the camera movement
    setChosenEdges([]);
    setVisible(new Set([selected.id]));

    // Phase 1: move cleanly to the selected country
    globeEl.current.pointOfView({ lat, lng, altitude: altitude1 }, 1000);

    // Wait until the first camera transition has actually finished
    stepRef.current = setTimeout(() => {
      if (!globeEl.current) return;

      const partnerEdges = partnersOf(selected.id);

      const partnerIds = partnerEdges.map((e) =>
        e.source === selected.id ? e.target : e.source,
      );

      // Now reveal relationships
      setChosenEdges(partnerEdges);
      setVisible(new Set([selected.id, ...partnerIds]));

      if (!partnerIds.length) return;

      const altitude2 = Math.max(
        altitude1,
        altitudeForGroup([selected.id, ...partnerIds]),
      );

      // Phase 2: smoothly pull back if necessary
      globeEl.current.pointOfView({ lat, lng, altitude: altitude2 }, 1600);
    }, 1000);

    return () => clearTimeout(stepRef.current);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    if (globeEl.current) globeEl.current.pointOfView(HOME_VIEW, 0);
  }, []);

  const polygonCapColor = (f) => {
    const a2 = NUMERIC_TO_ALPHA2[f.id];
    const inData = a2 && ids.has(a2);
    if (!inData) return BG_FILL;
    const base = colorFn(other(a2)?.net_dominance);
    const isDim = !!selected && !visible.has(a2);
    return isDim ? dim(base) : base;
  };
  const polygonStrokeColor = (f) => {
    const a2 = NUMERIC_TO_ALPHA2[f.id];
    return a2 === selected?.id ? SELECTED_BORDER : BORDER;
  };
  const polygonAltitude = (f) => {
    const a2 = NUMERIC_TO_ALPHA2[f.id];
    return a2 === selected?.id ? 0.02 : 0.01;
  };
  const polygonLabel = (f) => {
    const a2 = NUMERIC_TO_ALPHA2[f.id];
    const c = a2 && ids.has(a2) ? other(a2) : null;
    if (!c) return "";
    return nameFor(a2) || c.id || "";
  };

  const handlePolygonClick = (f, event) => {
    const a2 = NUMERIC_TO_ALPHA2[f.id];
    if (a2 && ids.has(a2)) {
      onSelectCountry(a2);
    } else {
      onBackground?.(event);
    }
  };

  const labelsData = selected ? [...visible].filter((a2) => CENTROID[a2]) : [];

  return (
    <div ref={wrapRef} className="map-wrap">
      <Globe
        ref={globeEl}
        width={size.width}
        height={size.height}
        backgroundColor="#0B0D10"
        showAtmosphere
        atmosphereColor="#3cd2ca"
        atmosphereAltitude={0.12}
        polygonsData={WORLD_FEATURES}
        polygonCapColor={polygonCapColor}
        polygonSideColor={() => "rgba(10, 11, 13, 0.6)"}
        polygonStrokeColor={polygonStrokeColor}
        polygonAltitude={polygonAltitude}
        polygonLabel={polygonLabel}
        polygonsTransitionDuration={0}
        onPolygonClick={handlePolygonClick}
        onGlobeClick={(coords, event) => onBackground?.(event)}
        arcsData={selected ? chosenEdges : []}
        arcStartLat={(e) => {
          const fromId = e.source === selected?.id ? selected.id : e.source;

          return CENTROID[fromId]?.[1];
        }}
        arcStartLng={(e) => {
          const fromId = e.source === selected?.id ? selected.id : e.source;

          return CENTROID[fromId]?.[0];
        }}
        arcEndLat={(e) => {
          const toId = e.source === selected?.id ? e.target : selected.id;

          return CENTROID[toId]?.[1];
        }}
        arcEndLng={(e) => {
          const toId = e.source === selected?.id ? e.target : selected.id;

          return CENTROID[toId]?.[0];
        }}
        arcColor={(e) =>
          e.source === selected?.id ? EXPORT_COLOR : IMPORT_COLOR
        }
        arcStroke={(e) => Math.max(0.3, Math.min(1.4, e.weight * 6))}
        arcAltitudeAutoScale={0.35}
        arcDashLength={0.5}
        arcDashGap={0.3}
        arcDashAnimateTime={2200}
        arcsTransitionDuration={400}
        labelsData={labelsData}
        labelLat={(a2) => CENTROID[a2]?.[1]}
        labelLng={(a2) => CENTROID[a2]?.[0]}
        labelText={(a2) => nameFor(a2) || a2.toUpperCase()}
        labelSize={(a2) => (a2 === selected?.id ? 0.9 : 0.6)}
        labelColor={(a2) => (a2 === selected?.id ? "#ffffff" : "#F2F3F5")}
        labelDotRadius={0}
        labelAltitude={0.022}
        labelsTransitionDuration={0}
      />
    </div>
  );
}
