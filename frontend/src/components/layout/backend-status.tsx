"use client";

import { useHealth } from "@/hooks/use-health";

export function BackendStatus() {
  const { data, isError, isPending } = useHealth();
  const connected = !isPending && !isError && data?.status === "ok";

  const label = isPending
    ? "Проверка соединения..."
    : connected
      ? "Сервис доступен"
      : "Нет соединения с расчётным сервисом";
  const dotColor = isPending ? "bg-status-muted" : connected ? "bg-status-ok" : "bg-status-bad";

  return (
    <span className="inline-flex items-center gap-1.5 pl-1 text-[11px] text-text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden />
      {label}
    </span>
  );
}
