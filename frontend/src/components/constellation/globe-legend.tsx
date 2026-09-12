const ITEMS: { color: string; label: string; kind: "dot" | "line" }[] = [
  { color: "var(--status-bright-blue)", label: "Активный аппарат", kind: "dot" },
  { color: "var(--status-muted)", label: "Недоступный аппарат", kind: "dot" },
  { color: "var(--status-ground)", label: "Наземный пункт", kind: "dot" },
  { color: "var(--status-gateway)", label: "Шлюз", kind: "dot" },
  { color: "rgba(67,169,223,0.55)", label: "Межспутниковая связь", kind: "line" },
  { color: "var(--status-route)", label: "Текущий маршрут", kind: "line" },
];

export function GlobeLegend({
  showCriticality = false,
  showBackupRoute = false,
}: {
  showCriticality?: boolean;
  showBackupRoute?: boolean;
}) {
  let items = ITEMS;
  if (showBackupRoute) {
    items = [
      ...items,
      { color: "rgba(197, 148, 74, 0.85)", label: "Резервный маршрут", kind: "line" as const },
    ];
  }
  if (showCriticality) {
    items = [
      ...items,
      { color: "#62c6f2", label: "Низкое влияние", kind: "dot" as const },
      { color: "#f2c14e", label: "Среднее влияние", kind: "dot" as const },
      { color: "#f27d6d", label: "Высокое влияние", kind: "dot" as const },
    ];
  }
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 rounded-lg border border-border bg-card/85 px-3 py-2 text-xs backdrop-blur-sm">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-muted-foreground">
          {item.kind === "dot" ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
          ) : (
            <span className="h-0.5 w-3 shrink-0" style={{ backgroundColor: item.color }} />
          )}
          {item.label}
        </div>
      ))}
    </div>
  );
}
