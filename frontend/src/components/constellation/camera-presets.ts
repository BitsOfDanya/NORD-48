// Plain data, no react-globe.gl import — safe to import from server-rendered
// code (globe-canvas.tsx itself is client-only and loaded via next/dynamic
// with ssr:false; importing anything from it directly would drag that
// import into the SSR bundle).

export interface CameraView {
  lat: number;
  lng: number;
  altitude: number;
}

/** Northern Russia / Arctic, framed wide enough to see the whole constellation. */
export const INITIAL_VIEW: CameraView = { lat: 60, lng: 80, altitude: 2.8 };

/** Closer view centered on the northern ground sites. */
export const NORTHERN_SITES_VIEW: CameraView = { lat: 69, lng: 90, altitude: 1.8 };
