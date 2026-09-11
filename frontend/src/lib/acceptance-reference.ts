/**
 * Reference rows for the Acceptance Matrix, taken verbatim from the exact
 * (re-verified, not just trusted) experiments in docs/design-decision.md —
 * re-running N-1/exact N-2/all three stress profiles for every candidate
 * on every page load would cost minutes per row, so known-good candidates
 * are recorded here once. The current optimizer run (if any) is merged in
 * live alongside these — see AcceptanceMatrix.
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
];
