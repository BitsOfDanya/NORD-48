export interface ResourceSummary {
  satellite_count: number;
  total_satellites: number;
  launch_batches_used: number;
  estimated_launches: number | null;
}

export interface CostEstimate {
  satellite_count: number;
  estimated_satellite_cost_rub: number;
  estimated_launches: number | null;
  estimated_launch_cost_rub: number;
  integration_cost_rub: number;
  reserve_percent: number;
  estimated_total_rub: number;
  source_label: string | null;
}

export interface EstimateResult {
  mode: "resource_only" | "cost";
  resources: ResourceSummary;
  cost: CostEstimate | null;
  cost_per_availability_point_rub: number | null;
}

export interface EstimateRequest {
  satellite_count: number;
  total_satellites: number;
  launch_batches_used: number;
  worst_availability_percent?: number | null;
  satellite_unit_cost_rub?: number | null;
  launch_fixed_cost_rub?: number | null;
  launch_capacity_satellites?: number | null;
  integration_cost_rub?: number;
  reserve_percent?: number;
  source_label?: string | null;
}

/** Historical, dated, sourced reference — never applied automatically.
 * See docs/cost-sources.md. */
export const HISTORICAL_COST_PRESET = {
  label: "Sitronics / АФК «Система», дек. 2021 (историческая оценка)",
  satellite_unit_cost_rub: 10_000_000,
  launch_fixed_cost_rub: 10_000_000,
  launch_capacity_satellites: 1,
  note:
    "Алексей Катков (АФК «Система»): ~10 млн ₽ производство + ~10 млн ₽ выведение на орбиту малого КА. " +
    "Оценка ориентировочная, не является коммерческим предложением, не пересчитана в цены 2026 года.",
} as const;
