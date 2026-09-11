"use client";

import { useEffect, useMemo, useRef } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";

import type { EdgeView, RouteRecord, SatelliteView } from "@/types/simulation";
import type { GroundSite } from "@/types/scenario";

const EARTH_RADIUS_KM = 6371;
const GLOBE_TEXTURE_URL = "https://unpkg.com/three-globe/example/img/earth-dark.jpg";
const BUMP_TEXTURE_URL = "https://unpkg.com/three-globe/example/img/earth-topology.png";
const MAX_PIXEL_RATIO = 2;

// Northern Russia, framed wide enough to see the whole constellation.
const INITIAL_VIEW = { lat: 66, lng: 85, altitude: 2.2 };

interface GlobePoint {
  id: string;
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
}) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.pointOfView(INITIAL_VIEW, 0);
    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    const controls = globe.controls();
    controls.autoRotate = false;
    controls.enableZoom = true;
    controls.enableRotate = true;
  }, []);

  useEffect(() => {
    if (resetToken > 0) globeRef.current?.pointOfView(INITIAL_VIEW, 600);
  }, [resetToken]);

  const points = useMemo<GlobePoint[]>(() => {
    const satellitePoints = satellites.map((sat) => ({
      id: sat.id,
      label: `${sat.id}${sat.active ? "" : " — недоступен"}`,
      lat: sat.lat_deg,
      lng: sat.lon_deg,
      alt: Math.max(sat.altitude_km / EARTH_RADIUS_KM, 0.01),
      color: sat.active ? "#38bdf8" : "#4b5768",
      radius: sat.active ? 0.32 : 0.2,
    }));

    const groundPoints = groundSites.map((g) => ({
      id: g.id,
      label: g.name ?? g.id,
      lat: g.lat_deg,
      lng: g.lon_deg,
      alt: 0.015,
      color:
        g.role === "gateway"
          ? "#22c55e"
          : g.id === selectedClientId
            ? "#fbbf24"
            : "#f59e0b",
      radius: g.id === selectedClientId ? 0.6 : 0.42,
    }));

    return [...satellitePoints, ...groundPoints];
  }, [satellites, groundSites, selectedClientId]);

  const coordsById = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    for (const sat of satellites) map.set(sat.id, { lat: sat.lat_deg, lng: sat.lon_deg });
    for (const g of groundSites) map.set(g.id, { lat: g.lat_deg, lng: g.lon_deg });
    return map;
  }, [satellites, groundSites]);

  const arcs = useMemo<GlobeArc[]>(() => {
    const baseArcs: GlobeArc[] = edges.flatMap((edge, i) => {
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
          color: edge.kind === "isl" ? "rgba(56,189,248,0.22)" : "rgba(34,197,94,0.2)",
          stroke: 0.14,
        },
      ];
    });

    const routeArcs: GlobeArc[] = [];
    if (selectedRoute?.available) {
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
          color: "#fbbf24",
          stroke: 0.7,
        });
      }
    }

    return [...baseArcs, ...routeArcs];
  }, [edges, coordsById, selectedRoute]);

  if (width <= 0 || height <= 0) return null;

  return (
    <Globe
      ref={globeRef}
      width={width}
      height={height}
      globeImageUrl={GLOBE_TEXTURE_URL}
      bumpImageUrl={BUMP_TEXTURE_URL}
      backgroundColor="rgba(0,0,0,0)"
      atmosphereColor="#38bdf8"
      atmosphereAltitude={0.18}
      pointsData={points}
      pointLat="lat"
      pointLng="lng"
      pointAltitude="alt"
      pointColor="color"
      pointRadius="radius"
      pointLabel="label"
      pointResolution={12}
      arcsData={arcs}
      arcStartLat="startLat"
      arcStartLng="startLng"
      arcEndLat="endLat"
      arcEndLng="endLng"
      arcColor="color"
      arcStroke="stroke"
      arcAltitudeAutoScale={0.3}
    />
  );
}
