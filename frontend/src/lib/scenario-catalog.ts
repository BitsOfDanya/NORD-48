// Curated Russian display names/descriptions for the 4 bundled scenarios.
// Purely presentational — the backend `scenario_id` used in API calls is
// never touched.

export interface ScenarioCatalogEntry {
  title: string;
  description: string;
}

export const SCENARIO_CATALOG: Record<string, ScenarioCatalogEntry> = {
  "01_full_constellation": {
    title: "Полная группировка",
    description: "48 аппаратов • 3 плоскости • ISL 3000 км",
  },
  "02_first_launch": {
    title: "Первая очередь",
    description: "16 активных аппаратов",
  },
  "03_satellite_outages": {
    title: "Отказ 10 аппаратов",
    description: "10 аппаратов недоступны после 06:00",
  },
  "04_link_range": {
    title: "Ограниченная дальность ISL",
    description: "Дальность межспутниковой связи 2000 км",
  },
};

export function scenarioDisplayTitle(scenarioId: string, fallback: string): string {
  return SCENARIO_CATALOG[scenarioId]?.title ?? fallback;
}

export function scenarioDescription(scenarioId: string): string | undefined {
  return SCENARIO_CATALOG[scenarioId]?.description;
}
