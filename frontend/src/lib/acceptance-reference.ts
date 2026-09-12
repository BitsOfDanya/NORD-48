/**
 * Reference rows for the Acceptance Matrix, taken verbatim from the exact
 * (re-verified, not just trusted) experiments in docs/design-decision.md
 * (RAAN/phase candidates, fixed 48-satellite composition) and
 * docs/design-threshold-verification.md (deployment-size candidates,
 * N=44/N=46) — re-running N-1/exact N-2/all three stress profiles for
 * every candidate on every page load would cost minutes per row, so
 * known-good candidates are recorded here once. The current optimizer run
 * (if any) is merged in live alongside these — see AcceptanceMatrix.
 */

export type AcceptanceStatus = "pass" | "fail" | "info";

export interface AcceptanceRow {
  name: string;
  source: string;
  normalWorstPercent: number;
  outagesWorstPercent: number;
  isl2000WorstPercent: number;
  n1Status: AcceptanceStatus;
  n2Status: AcceptanceStatus;
  worstMaxOutageS: number;
  targetNormal: AcceptanceStatus;
  targetDegraded: AcceptanceStatus;
  note?: string;
  /** Acceptance Matrix 2.0 — все опциональны: заполняются только когда для
   * кандидата реально посчитан соответствующий анализ (ISL sensitivity,
   * redundancy, cost estimate), никогда не оцениваются "на глаз". */
  targetMarginPp?: number;
  outageP95S?: number;
  backupPathAvailabilityPercent?: number;
  islRequiredKm?: number;
  satelliteCount?: number;
  launchStages?: number;
  estimatedCostRub?: number | null;
}

export const REFERENCE_ACCEPTANCE_ROWS: AcceptanceRow[] = [
  {
    name: "Baseline",
    source: "01_full_constellation, RAAN/phase как в кейсе",
    normalWorstPercent: 96.67,
    outagesWorstPercent: 79.31,
    isl2000WorstPercent: 62.22,
    n1Status: "pass",
    n2Status: "pass",
    worstMaxOutageS: 480,
    targetNormal: "pass",
    targetDegraded: "fail",
    note: "N-2 худшая пара S19+S29 → C65 91,53%",
    targetMarginPp: 6.67,
    backupPathAvailabilityPercent: 28.1,
    islRequiredKm: 2750,
    satelliteCount: 48,
    launchStages: 1,
    estimatedCostRub: null,
  },
  {
    name: "Current Normal Optimum",
    source: "поиск по P2/P3, budget=100, seed=42",
    normalWorstPercent: 99.17,
    outagesWorstPercent: 80.28,
    isl2000WorstPercent: 52.5,
    n1Status: "pass",
    n2Status: "pass",
    worstMaxOutageS: 120,
    targetNormal: "pass",
    targetDegraded: "fail",
    note: "Ухудшает ISL2000 относительно baseline — переоптимизация под штатный режим",
  },
  {
    name: "Denis Optimum",
    source: "ревалидированный кандидат из NORD48-denis",
    normalWorstPercent: 99.86,
    outagesWorstPercent: 81.53,
    isl2000WorstPercent: 64.17,
    n1Status: "pass",
    n2Status: "pass",
    worstMaxOutageS: 120,
    targetNormal: "pass",
    targetDegraded: "fail",
  },
  {
    name: "Constrained Robust Optimum",
    source: "mode=constrained_robust, budget=150, seed=42",
    normalWorstPercent: 98.19,
    outagesWorstPercent: 77.64,
    isl2000WorstPercent: 64.17,
    n1Status: "pass",
    n2Status: "pass",
    worstMaxOutageS: 120,
    targetNormal: "pass",
    targetDegraded: "fail",
    note: "Единственный режим, где target штатного режима — встроенное ограничение поиска, а не проверка постфактум",
  },
  {
    name: "Минимальный кандидат для штатного режима (N=44)",
    source: "greedy + swap-refinement, docs/design-threshold-verification.md",
    normalWorstPercent: 90.14,
    outagesWorstPercent: 71.67,
    isl2000WorstPercent: 56.39,
    n1Status: "fail",
    n2Status: "fail",
    worstMaxOutageS: 720,
    targetNormal: "pass",
    targetDegraded: "fail",
    note: "Первый найденный размер, достигающий target ≥90% в штатном режиме — нулевой запас на N-1 (после худшего одиночного отказа ≈86,8%)",
    targetMarginPp: 0.14,
    backupPathAvailabilityPercent: 20.0,
    islRequiredKm: 2750,
    satelliteCount: 44,
    estimatedCostRub: null,
  },
  {
    name: "Устойчивый к N-1 кандидат (N=46)",
    source: "greedy sequence, docs/design-threshold-verification.md",
    normalWorstPercent: 93.33,
    outagesWorstPercent: 75.0,
    isl2000WorstPercent: 59.58,
    n1Status: "pass",
    n2Status: "fail",
    worstMaxOutageS: 480,
    targetNormal: "pass",
    targetDegraded: "fail",
    note: "Первый найденный размер, сохраняющий target ≥90% даже после худшего одиночного отказа (ровно 90,00%) — N-2 не проходит (1034/1035 пар нарушают target)",
    targetMarginPp: 3.33,
    backupPathAvailabilityPercent: 23.24,
    islRequiredKm: 2750,
    satelliteCount: 46,
    estimatedCostRub: null,
  },
];
