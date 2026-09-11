// Russian-locale display formatting. API numbers are never mutated —
// these helpers only affect what's rendered.

const RU_PERCENT = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const RU_INT = new Intl.NumberFormat("ru-RU");

export function formatPercent(value: number): string {
  return `${RU_PERCENT.format(value)} %`;
}

export function formatNumber(value: number): string {
  return RU_INT.format(value);
}

export function formatDistanceKm(km: number): string {
  return `${RU_INT.format(Math.round(km))} км`;
}

export function formatClock(tS: number): string {
  const h = Math.floor(tS / 3600);
  const m = Math.floor((tS % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0 мин";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}
