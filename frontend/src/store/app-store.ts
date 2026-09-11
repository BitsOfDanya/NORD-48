import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { DeploymentPlanJob, DeploymentPlanRequest, DeploymentPlanResult } from "@/types/deployment";
import type { ComparisonResult } from "@/types/comparison";
import type { OptimizationJob, OptimizationRequest, OptimizationResult } from "@/types/optimization";
import type { Scenario } from "@/types/scenario";
import type {
  CriticalityResult,
  CriticalityRow,
  FailureAnalysisResult,
  MonteCarloResult,
  N2Result,
  RoutingAnalysisResult,
} from "@/types/resilience";
import type { RoutingStrategy } from "@/types/simulation";

export type EarthMode = "atlas" | "network" | "night";
export type PlaybackSpeed = 0.5 | 1 | 2 | 4;
export type ResilienceMode = "failure" | "criticality" | "threshold" | "monte-carlo" | "routing";
export type OptimizerTab = "search" | "deployment";

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

/** Last result per resilience tab — kept so switching tabs, or leaving and
 * coming back to /resilience, shows the previous run instead of a blank
 * form (see docs/persistence.md). Each field is independently nullable:
 * a tab the user never ran stays null forever, that's not "stale". */
export interface ResilienceResults {
  failure: FailureAnalysisResult | null;
  criticality: CriticalityResult | null;
  threshold: N2Result | null;
  monteCarlo: MonteCarloResult | null;
  routing: RoutingAnalysisResult | null;
}

export interface OptimizerState {
  formValues: OptimizationRequest | null;
  job: OptimizationJob | null;
  result: OptimizationResult | null;
}

export interface DeploymentPlanState {
  formValues: DeploymentPlanRequest | null;
  job: DeploymentPlanJob | null;
  result: DeploymentPlanResult | null;
}

export interface CompareState {
  selectedRunIds: string[];
  baselineRunId: string | null;
  result: ComparisonResult | null;
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
   * (persisted to this browser) only, never sent anywhere until run. */
  savedVariants: Record<string, Scenario>;
  resilienceResults: ResilienceResults;
  optimizerTab: OptimizerTab;
  optimizer: OptimizerState;
  deploymentPlan: DeploymentPlanState;
  compare: CompareState;

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
  setResilienceResult: <K extends keyof ResilienceResults>(
    mode: K,
    result: ResilienceResults[K]
  ) => void;
  setOptimizerTab: (tab: OptimizerTab) => void;
  setOptimizerState: (patch: Partial<OptimizerState>) => void;
  setDeploymentPlanState: (patch: Partial<DeploymentPlanState>) => void;
  setCompareState: (patch: Partial<CompareState>) => void;
}

const STORE_VERSION = 2;

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
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
      resilienceResults: {
        failure: null,
        criticality: null,
        threshold: null,
        monteCarlo: null,
        routing: null,
      },
      optimizerTab: "search",
      optimizer: { formValues: null, job: null, result: null },
      deploymentPlan: { formValues: null, job: null, result: null },
      compare: { selectedRunIds: [], baselineRunId: null, result: null },

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
      setResilienceResult: (mode, result) =>
        set((s) => ({ resilienceResults: { ...s.resilienceResults, [mode]: result } })),
      setOptimizerTab: (optimizerTab) => set({ optimizerTab }),
      setOptimizerState: (patch) => set((s) => ({ optimizer: { ...s.optimizer, ...patch } })),
      setDeploymentPlanState: (patch) =>
        set((s) => ({ deploymentPlan: { ...s.deploymentPlan, ...patch } })),
      setCompareState: (patch) => set((s) => ({ compare: { ...s.compare, ...patch } })),
    }),
    {
      name: "nord48-app-store",
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Schema changed (new version) -> don't try to reshape old data,
      // just start clean rather than risk shipping a malformed shape into
      // components that assume the current one.
      migrate: (_persisted, version) => (version === STORE_VERSION ? (_persisted as AppState) : undefined),
      // Deliberately excluded: focusNorthernSitesToken (an animation
      // trigger, never meaningful across a reload) and the two dialog-open
      // flags (a page should always open with its dialogs closed).
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(
            ([key]) => !["focusNorthernSitesToken", "calculationInspectorOpen", "summaryOpen"].includes(key)
          )
        ) as AppState,
    }
  )
);
