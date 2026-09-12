import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type {
  DeploymentPlanJob,
  DeploymentPlanRequest,
  DeploymentPlanResult,
  ThresholdVerificationJob,
  ThresholdVerificationRequest,
  ThresholdVerificationResult,
} from "@/types/deployment";
import type { ComparisonResult } from "@/types/comparison";
import type { IslSensitivityRequest, IslSensitivityResult } from "@/types/isl-sensitivity";
import type { OptimizationJob, OptimizationRequest, OptimizationResult } from "@/types/optimization";
import type { RedundancyResult } from "@/types/redundancy";
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
export type ResilienceMode =
  | "failure"
  | "criticality"
  | "threshold"
  | "monte-carlo"
  | "routing"
  | "redundancy";
export type OptimizerTab = "search" | "deployment" | "threshold" | "isl" | "economics";

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
  redundancy: RedundancyResult | null;
}

export interface ThresholdVerificationState {
  formValues: ThresholdVerificationRequest | null;
  job: ThresholdVerificationJob | null;
  result: ThresholdVerificationResult | null;
}

export interface IslSensitivityState {
  formValues: IslSensitivityRequest | null;
  result: IslSensitivityResult | null;
}

export type CostMode = "resource" | "cost";

export interface CostAssumptionsState {
  satellite_unit_cost_rub: number | null;
  launch_fixed_cost_rub: number | null;
  launch_capacity_satellites: number | null;
  integration_cost_rub: number;
  reserve_percent: number;
  source_label: string | null;
}

export interface CostState {
  mode: CostMode;
  assumptions: CostAssumptionsState;
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
  /** One-time explanation shown after a persisted run disappeared server-side. */
  staleRunNotice: string | null;
  /** Named derived variants saved from the scenario editor — kept in memory
   * (persisted to this browser) only, never sent anywhere until run. */
  savedVariants: Record<string, Scenario>;
  resilienceResults: ResilienceResults;
  optimizerTab: OptimizerTab;
  optimizer: OptimizerState;
  deploymentPlan: DeploymentPlanState;
  thresholdVerification: ThresholdVerificationState;
  islSensitivity: IslSensitivityState;
  cost: CostState;
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
  discardStaleRun: (runId: string) => void;
  clearStaleRunNotice: () => void;
  saveVariant: (name: string, scenario: Scenario) => void;
  deleteVariant: (name: string) => void;
  setResilienceResult: <K extends keyof ResilienceResults>(
    mode: K,
    result: ResilienceResults[K]
  ) => void;
  setOptimizerTab: (tab: OptimizerTab) => void;
  setOptimizerState: (patch: Partial<OptimizerState>) => void;
  setDeploymentPlanState: (patch: Partial<DeploymentPlanState>) => void;
  setThresholdVerificationState: (patch: Partial<ThresholdVerificationState>) => void;
  setIslSensitivityState: (patch: Partial<IslSensitivityState>) => void;
  setCostMode: (mode: CostMode) => void;
  setCostAssumptions: (patch: Partial<CostAssumptionsState>) => void;
  setCompareState: (patch: Partial<CompareState>) => void;
}

const STORE_VERSION = 3;

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
      staleRunNotice: null,
      savedVariants: {},
      resilienceResults: {
        failure: null,
        criticality: null,
        threshold: null,
        monteCarlo: null,
        routing: null,
        redundancy: null,
      },
      optimizerTab: "search",
      optimizer: { formValues: null, job: null, result: null },
      deploymentPlan: { formValues: null, job: null, result: null },
      thresholdVerification: { formValues: null, job: null, result: null },
      islSensitivity: { formValues: null, result: null },
      cost: {
        mode: "resource",
        assumptions: {
          satellite_unit_cost_rub: null,
          launch_fixed_cost_rub: null,
          launch_capacity_satellites: null,
          integration_cost_rub: 0,
          reserve_percent: 0,
          source_label: null,
        },
      },
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
      discardStaleRun: (runId) =>
        set((s) => {
          const selectedRunIds = s.compare.selectedRunIds.filter((id) => id !== runId);
          const baselineRunId =
            s.compare.baselineRunId === runId
              ? (selectedRunIds[0] ?? null)
              : s.compare.baselineRunId;
          return {
            selectedRunId: s.selectedRunId === runId ? null : s.selectedRunId,
            selectedClientId: s.selectedRunId === runId ? null : s.selectedClientId,
            runHistory: s.runHistory.filter((entry) => entry.run_id !== runId),
            comparisonQueue: s.comparisonQueue.filter((id) => id !== runId),
            compare: {
              selectedRunIds,
              baselineRunId,
              result: null,
            },
            staleRunNotice:
              "Сохранённый расчёт больше не найден на сервере. Мы удалили протухший run_id из истории — запустите расчёт повторно.",
          };
        }),
      clearStaleRunNotice: () => set({ staleRunNotice: null }),
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
      setThresholdVerificationState: (patch) =>
        set((s) => ({ thresholdVerification: { ...s.thresholdVerification, ...patch } })),
      setIslSensitivityState: (patch) =>
        set((s) => ({ islSensitivity: { ...s.islSensitivity, ...patch } })),
      setCostMode: (mode) => set((s) => ({ cost: { ...s.cost, mode } })),
      setCostAssumptions: (patch) =>
        set((s) => ({ cost: { ...s.cost, assumptions: { ...s.cost.assumptions, ...patch } } })),
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
            ([key]) =>
              ![
                "focusNorthernSitesToken",
                "calculationInspectorOpen",
                "summaryOpen",
                "staleRunNotice",
              ].includes(key)
          )
        ) as AppState,
    }
  )
);
