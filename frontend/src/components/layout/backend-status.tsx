"use client";

import { useHealth } from "@/hooks/use-health";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden />
          <span className="hidden xl:inline">{label}</span>
          <span className="xl:hidden">API</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{connected ? "Расчётное ядро отвечает и готово принимать задачи." : label}</TooltipContent>
    </Tooltip>
  );
}
