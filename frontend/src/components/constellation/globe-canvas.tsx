"use client";

import { useEffect, useMemo, useRef } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { AmbientLight, DirectionalLight } from "three";

import { INITIAL_VIEW, NORTHERN_SITES_VIEW } from "@/components/constellation/camera-presets";
import type { SatelliteMeta } from "@/hooks/use-satellite-meta";
import type { EarthMode, VisualizationLayers } from "@/store/app-store";
import type { GroundSite } from "@/types/scenario";
import type { EdgeView, RouteRecord, SatelliteView } from "@/types/simulation";
import type { CriticalityRow } from "@/types/resilience";

const EARTH_RADIUS_KM = 6371;
const MAX_PIXEL_RATIO = 2;

const EARTH_TEXTURES: Record<EarthMode, { globe: string; bump: string | null }> = {
  atlas: { globe: "/earth/earth-natural.jpg", bump: "/earth/earth-bump.jpg" },
  network: { globe: "/earth/earth-network.jpg", bump: null },
  night: { globe: "/earth/earth-night.jpg", bump: null },
};

const COLOR = {
  satelliteActive: "#62c6f2",
  satelliteInactive: "#6c7f88",
  satelliteSelected: "#ffffff",
  client: "#f0a63a",
  clientSelected: "#f2c14e",
  gateway: "#58c991",
  isl: "rgba(67, 169, 223, 0.2)",
  islSelectedPlane: "rgba(98, 198, 242, 0.55)",
  groundLink: "rgba(88, 201, 145, 0.22)",
  route: "#f2c14e",
  orbitPlane: ["rgba(67,169,223,0.35)", "rgba(98,198,242,0.3)", "rgba(35,118,168,0.4)"],
};

interface GlobePoint {
  id: string;
  kind: "satellite" | "ground";
  label: string;
  lat: number;
  lng: number;
  alt: number;
  color: string;
  radius: number;
}

interface GlobeArc {
  id: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  stroke: number;
}

export function GlobeCanvas({
  width,
  height,
  satellites,
  groundSites,
  edges,
  selectedClientId,
  selectedRoute,
  resetToken,
  focusNorthernSitesToken,
  earthMode,
  layers,
  satelliteMeta,
  selectedSatelliteId,
  onSelectSatellite,
  criticalityBySatellite,
  highlightedSatelliteIds,
}: {
  width: number;
  height: number;
  satellites: SatelliteView[];
  groundSites: GroundSite[];
  edges: EdgeView[];
  selectedClientId: string | null;
  selectedRoute: RouteRecord | undefined;
  /** Bumped by the parent to trigger a camera reset (see GlobeView). */
  resetToken: number;
  /** Bumped by the parent to fly to the northern ground sites (see GlobeView). */
  focusNorthernSitesToken: number;
  earthMode: EarthMode;
  layers: VisualizationLayers;
  satelliteMeta: Map<string, SatelliteMeta>;
  selectedSatelliteId: string | null;
  onSelectSatellite: (id: string | null) => void;
  criticalityBySatellite: Record<string, CriticalityRow>;
  highlightedSatelliteIds: string[];
}) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);

  // `width`/`height` are 0 until the parent's ResizeObserver reports a real
  // size, so <Globe> doesn't render on the very first pass — a plain
  // `useEffect(fn, [])` here would fire while globeRef.current is still
  // undefined and never run again. `onGlobeReady` fires once the Globe
  // instance actually exists, whichever render that turns out to be.
  const handleGlobeReady = () => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.pointOfView(INITIAL_VIEW, 0);
    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    const controls = globe.controls();
    controls.autoRotate = false;
    controls.enableZoom = true;
    controls.enableRotate = true;

    // react-globe.gl's default lighting under-lights matte textures — the
    // night side reads as pure black. Replace with a brighter ambient +
    // directional pair so the surface stays legible all the way around.
    globe.lights([
      new AmbientLight(0xffffff, 1.4),
      new DirectionalLight(0xffffff, 0.55),
    ]);
  };

  useEffect(() => {
    if (resetToken > 0) globeRef.current?.pointOfView(INITIAL_VIEW, 600);
  }, [resetToken]);

  useEffect(() => {
    if (focusNorthernSitesToken > 0) globeRef.current?.pointOfView(NORTHERN_SITES_VIEW, 800);
  }, [focusNorthernSitesToken]);

  const texture = EARTH_TEXTURES[earthMode];

  const criticalityThresholds = useMemo(() => {
    const values = Object.values(criticalityBySatellite)
      .map((row) => row.worst_client_availability_drop_pp)
      .sort((a, b) => a - b);
    if (!values.length) return null;
    return {
      low: values[Math.floor((values.length - 1) / 3)],
      high: values[Math.floor(((values.length - 1) * 2) / 3)],
    };
  }, [criticalityBySatellite]);

  const points = useMemo<GlobePoint[]>(() => {
    const satellitePoints: GlobePoint[] = layers.satellites
      ? satellites
          .filter((sat) => sat.active || layers.showInactive)
          .map((sat) => {
            const isSelected = sat.id === selectedSatelliteId;
            const isHighlighted = highlightedSatelliteIds.includes(sat.id);
            const meta = satelliteMeta.get(sat.id);
            const impact = criticalityBySatellite[sat.id]?.worst_client_availability_drop_pp;
            const criticalityColor =
              layers.criticality && impact != null && criticalityThresholds
                ? impact <= criticalityThresholds.low
                  ? "#62c6f2"
                  : impact <= criticalityThresholds.high
                    ? "#f2c14e"
                    : "#f27d6d"
                : null;
            return {
              id: sat.id,
              kind: "satellite" as const,
              label: [
                sat.id,
                meta ? `Плоскость ${meta.planeId}` : null,
                sat.active ? "Статус: активен" : "Статус: недоступен",
              ]
                .filter(Boolean)
                .join(" · "),
              lat: sat.lat_deg,
              lng: sat.lon_deg,
              alt: Math.max(sat.altitude_km / EARTH_RADIUS_KM, 0.01),
              color: isSelected || isHighlighted
                ? COLOR.satelliteSelected
                : criticalityColor ?? (sat.active
                  ? COLOR.satelliteActive
                  : COLOR.satelliteInactive),
              radius: isSelected || isHighlighted ? 0.55 : sat.active ? 0.38 : 0.2,
            };
          })
      : [];

    const groundPoints: GlobePoint[] = groundSites.map((g) => {
      const isSelectedClient = g.id === selectedClientId;
      return {
        id: g.id,
        kind: "ground" as const,
        label:
          g.role === "gateway"
            ? `${g.id} · Шлюз · ${g.name ?? ""}`
            : `${g.id} · Наземный пункт · ${g.lat_deg.toFixed(1)}° N / ${g.lon_deg.toFixed(1)}° E`,
        lat: g.lat_deg,
        lng: g.lon_deg,
        alt: 0.015,
        color:
          g.role === "gateway" ? COLOR.gateway : isSelectedClient ? COLOR.clientSelected : COLOR.client,
        radius: isSelectedClient ? 0.62 : g.role === "gateway" ? 0.48 : 0.4,
      };
    });

    return [...satellitePoints, ...groundPoints];
  }, [satellites, groundSites, selectedClientId, selectedSatelliteId, satelliteMeta, layers, criticalityBySatellite, criticalityThresholds, highlightedSatelliteIds]);

  const coordsById = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    for (const sat of satellites) map.set(sat.id, { lat: sat.lat_deg, lng: sat.lon_deg });
    for (const g of groundSites) map.set(g.id, { lat: g.lat_deg, lng: g.lon_deg });
    return map;
  }, [satellites, groundSites]);

  const arcs = useMemo<GlobeArc[]>(() => {
    const baseArcs: GlobeArc[] = edges.flatMap((edge, i) => {
      const isIsl = edge.kind === "isl";
      if (isIsl && !layers.isl) return [];
      if (!isIsl && !layers.groundLinks) return [];
      const start = coordsById.get(edge.a);
      const end = coordsById.get(edge.b);
      if (!start || !end) return [];
      return [
        {
          id: `edge-${i}`,
          startLat: start.lat,
          startLng: start.lng,
          endLat: end.lat,
          endLng: end.lng,
          color: isIsl ? COLOR.isl : COLOR.groundLink,
          stroke: 0.12,
        },
      ];
    });

    const routeArcs: GlobeArc[] = [];
    if (layers.route && selectedRoute?.available) {
      for (let i = 0; i < selectedRoute.path.length - 1; i++) {
        const start = coordsById.get(selectedRoute.path[i]);
        const end = coordsById.get(selectedRoute.path[i + 1]);
        if (!start || !end) continue;
        routeArcs.push({
          id: `route-${i}`,
          startLat: start.lat,
          startLng: start.lng,
          endLat: end.lat,
          endLng: end.lng,
          color: COLOR.route,
          stroke: 0.6,
        });
      }
    }

    return [...baseArcs, ...routeArcs];
  }, [edges, coordsById, selectedRoute, layers]);

  // Orbital plane guides: a closed ring per plane connecting that plane's
  // satellites, using their ALREADY-COMPUTED positions from the backend
  // snapshot. No orbital mechanics run here — this only connects existing
  // points (sorted by longitude to close a sensible loop), it never
  // derives a position.
  const orbitPaths = useMemo(() => {
    if (!layers.orbitPlanes) return [];
    const byPlane = new Map<string, { lat: number; lng: number }[]>();
    for (const sat of satellites) {
      const meta = satelliteMeta.get(sat.id);
      if (!meta) continue;
      const list = byPlane.get(meta.planeId) ?? [];
      list.push({ lat: sat.lat_deg, lng: sat.lon_deg });
      byPlane.set(meta.planeId, list);
    }
    return Array.from(byPlane.entries()).map(([planeId, list], i) => {
      const sorted = [...list].sort((a, b) => a.lng - b.lng);
      const points: [number, number][] = [...sorted, sorted[0]].map((p) => [p.lat, p.lng]);
      return { id: `plane-${planeId}`, points, color: COLOR.orbitPlane[i % COLOR.orbitPlane.length] };
    });
  }, [layers.orbitPlanes, satellites, satelliteMeta]);

  const gatewayRings = useMemo(
    () =>
      groundSites
        .filter((g) => g.role === "gateway")
        .map((g) => ({ id: g.id, lat: g.lat_deg, lng: g.lon_deg })),
    [groundSites]
  );

  if (width <= 0 || height <= 0) return null;

  return (
    <Globe
      ref={globeRef}
      width={width}
      height={height}
      onGlobeReady={handleGlobeReady}
      globeImageUrl={texture.globe}
      bumpImageUrl={texture.bump}
      backgroundImageUrl="/earth/stars.jpg"
      showAtmosphere
      atmosphereColor="#43a9df"
      atmosphereAltitude={0.16}
      pointsData={points}
      pointLat="lat"
      pointLng="lng"
      pointAltitude="alt"
      pointColor="color"
      pointRadius="radius"
      pointLabel="label"
      pointResolution={12}
      onPointClick={(point) => {
        const p = point as GlobePoint;
        onSelectSatellite(p.kind === "satellite" ? p.id : null);
      }}
      arcsData={arcs}
      arcStartLat="startLat"
      arcStartLng="startLng"
      arcEndLat="endLat"
      arcEndLng="endLng"
      arcColor="color"
      arcStroke="stroke"
      arcAltitudeAutoScale={0.3}
      pathsData={orbitPaths}
      pathPoints="points"
      pathPointLat={(p: [number, number]) => p[0]}
      pathPointLng={(p: [number, number]) => p[1]}
      pathColor="color"
      pathStroke={0.4}
      ringsData={gatewayRings}
      ringLat="lat"
      ringLng="lng"
      ringColor={() => COLOR.gateway}
      ringMaxRadius={2.2}
      ringPropagationSpeed={1.4}
      ringRepeatPeriod={2200}
    />
  );
}
