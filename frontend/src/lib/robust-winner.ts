import type { Scenario } from "@/types/scenario";

/**
 * RAAN/phase of the Recommended Robust configuration found by Robust
 * Design Search 2.0 (see docs/robust-design-search.md) — frozen, verified
 * numbers, single source of truth reused by every comparison view (ISL
 * sensitivity, failure degradation, Acceptance Matrix) instead of each
 * one hand-copying the angles.
 */
export const ROBUST_WINNER_LABEL = "Recommended Robust";

export const ROBUST_WINNER_PLANES: Record<string, { raan_deg: number; phase_deg: number }> = {
  P1: { raan_deg: 104.47125962122719, phase_deg: 303.7966152991311 },
  P2: { raan_deg: 226.2918165087214, phase_deg: 247.99724234679812 },
  P3: { raan_deg: 159.35288435343463, phase_deg: 241.55945892515913 },
};

/** Derive a scenario with the same design/environment but the Recommended
 * Robust plane angles — client-side field substitution only (no orbital
 * math), mirroring what the backend's own `apply_plane_parameters` does. */
export function applyRobustWinnerPlanes(scenario: Scenario): Scenario {
  return {
    ...scenario,
    meta: { ...scenario.meta, id: `${scenario.meta.id}__robust_winner` },
    design: {
      ...scenario.design,
      planes: scenario.design.planes.map((plane) => ({
        ...plane,
        ...(ROBUST_WINNER_PLANES[plane.id] ?? {}),
      })),
    },
  };
}
