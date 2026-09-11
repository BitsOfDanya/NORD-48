import { create } from "zustand";

import type { Scenario } from "@/types/scenario";
import type { CriticalityRow } from "@/types/resilience";
import type { RoutingStrategy } from "@/types/simulation";

export type EarthMode = "atlas" | "network" | "night";
export type PlaybackSpeed = 0.5 | 1 | 2 | 4;
export type ResilienceMode = "failure" | "criticality" | "threshold" | "monte-carlo" | "routing";

export interface RunHistoryEntry {
  run_id: string;
  scenario_id: string | null;
  scenario_title: string | null;
  routing_strategy: RoutingStrategy;
  created_at: string;
}

const MAX_RUN_HISTORY = 20;

export interface VisualizationLayers {
  satellites: boolean;
  isl: boolean;
  groundLinks: boolean;
  route: boolean;
  showInactive: boolean;
  orbitPlanes: boolean;
  criticality: boolean;
}

interface AppState {
  selectedScenarioId: string;
  uploadedScenario: Scenario | null;
  selectedClientId: string | null;
  selectedTimeS: number;
  selectedRunId: string | null;
  routingStrategy: RoutingStrategy;

  // Visualization workspace state — purely presentational, never sent to
  // the backend and never affects calculation.
  earthMode: EarthMode;
  layers: VisualizationLayers;
  selectedSatelliteId: string | null;
  playbackSpeed: PlaybackSpeed;
  calculationInspectorOpen: boolean;
  summaryOpen: boolean;
  /** Bumped to ask the globe to fly to the northern ground sites (see GlobeView). */
  focusNorthernSitesToken: number;
  failureLabSatelliteIds: string[];
  highlightedSatelliteIds: string[];
  criticalityBySatellite: Record<string, CriticalityRow>;
  resilienceMode: ResilienceMode;
  /** Completed simulation runs, newest first — the pool Compare picks from. */
  runHistory: RunHistoryEntry[];
  /** run_ids the user explicitly queued for comparison from elsewhere in the app. */
  comparisonQueue: string[];
  /** Named derived variants saved from the scenario editor — kept in memory
   * only (see docs/design-decision.md "Variant Saving"), never persisted. */
  savedVariants: Record<string, Scenario>;

  selectExampleScenario: (id: string) => void;
  setUploadedScenario: (scenario: Scenario) => void;
  setSelectedClientId: (id: string | null) => void;
  setSelectedTimeS: (t: number) => void;
  setSelectedRunId: (id: string | null) => void;
  setRoutingStrategy: (strategy: RoutingStrategy) => void;

  setEarthMode: (mode: EarthMode) => void;
  toggleLayer: (layer: keyof VisualizationLayers) => void;
  setSelectedSatelliteId: (id: string | null) => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  setCalculationInspectorOpen: (open: boolean) => void;
  setSummaryOpen: (open: boolean) => void;
  requestFocusNorthernSites: () => void;
  setFailureLabSatelliteIds: (ids: string[]) => void;
  setHighlightedSatelliteIds: (ids: string[]) => void;
  setCriticality: (rows: CriticalityRow[]) => void;
  setResilienceMode: (mode: ResilienceMode) => void;
  addRunHistoryEntry: (entry: RunHistoryEntry) => void;
  queueForComparison: (runId: string) => void;
  clearComparisonQueue: () => void;
  saveVariant: (name: string, scenario: Scenario) => void;
  deleteVariant: (name: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedScenarioId: "01_full_constellation",
  uploadedScenario: null,
  selectedClientId: null,
  selectedTimeS: 0,
  selectedRunId: null,
  routingStrategy: "minimum_hops",

  earthMode: "network",
  layers: {
    satellites: true,
    isl: true,
    groundLinks: true,
    route: true,
    showInactive: false,
    orbitPlanes: false,
    criticality: false,
  },
  selectedSatelliteId: null,
  playbackSpeed: 1,
  calculationInspectorOpen: false,
  summaryOpen: false,
  focusNorthernSitesToken: 0,
  failureLabSatelliteIds: [],
  highlightedSatelliteIds: [],
  criticalityBySatellite: {},
  resilienceMode: "failure",
  runHistory: [],
  comparisonQueue: [],
  savedVariants: {},

  // Picking a bundled example clears any uploaded scenario — only one can
  // be "active" (about to run) at a time.
  selectExampleScenario: (id) => set({ selectedScenarioId: id, uploadedScenario: null }),
  setUploadedScenario: (scenario) => set({ uploadedScenario: scenario }),
  setSelectedClientId: (id) => set({ selectedClientId: id, selectedSatelliteId: null }),
  setSelectedTimeS: (t) => set({ selectedTimeS: t }),
  setSelectedRunId: (id) => set({ selectedRunId: id }),
  setRoutingStrategy: (strategy) => set({ routingStrategy: strategy }),

  setEarthMode: (mode) => set({ earthMode: mode }),
  toggleLayer: (layer) =>
    set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),
  setSelectedSatelliteId: (id) => set({ selectedSatelliteId: id }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setCalculationInspectorOpen: (open) => set({ calculationInspectorOpen: open }),
  setSummaryOpen: (open) => set({ summaryOpen: open }),
  requestFocusNorthernSites: () =>
    set((s) => ({ focusNorthernSitesToken: s.focusNorthernSitesToken + 1 })),
  setFailureLabSatelliteIds: (ids) => set({ failureLabSatelliteIds: ids }),
  setHighlightedSatelliteIds: (ids) => set({ highlightedSatelliteIds: ids }),
  setCriticality: (rows) =>
    set({ criticalityBySatellite: Object.fromEntries(rows.map((row) => [row.satellite_id, row])) }),
  setResilienceMode: (mode) => set({ resilienceMode: mode }),
  addRunHistoryEntry: (entry) =>
    set((s) => ({
      runHistory: [entry, ...s.runHistory.filter((r) => r.run_id !== entry.run_id)].slice(
        0,
        MAX_RUN_HISTORY
      ),
    })),
  queueForComparison: (runId) =>
    set((s) => ({
      comparisonQueue: s.comparisonQueue.includes(runId)
        ? s.comparisonQueue
        : [...s.comparisonQueue, runId].slice(-10),
    })),
  clearComparisonQueue: () => set({ comparisonQueue: [] }),
  saveVariant: (name, scenario) =>
    set((s) => ({ savedVariants: { ...s.savedVariants, [name]: scenario } })),
  deleteVariant: (name) =>
    set((s) => {
      const next = { ...s.savedVariants };
      delete next[name];
      return { savedVariants: next };
    }),
}));
