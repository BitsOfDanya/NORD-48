"use client";

import { ChevronDown, ChevronRight, HelpCircle, Loader2 } from "lucide-react";
import { useState } from "react";

import { useOutageExplanation } from "@/hooks/use-outage-explanation";
import { diagnosticReasonLabel } from "@/lib/diagnostics-i18n";
import { formatClock, formatDuration } from "@/lib/format";
import { findOutageInterval } from "@/lib/outage-intervals";
import { cn } from "@/lib/utils";
import type { DiagnosticReason, TimelineStep } from "@/types/simulation";

function shortAnswer(reason: DiagnosticReason | null, e: {
  visible_satellite_count: number;
  gateway_contact: boolean;
  gateway_in_outage: boolean;
  network_component_count: number;
  same_component_as_gateway: boolean | null;
}): string {
  switch (reason) {
    case "NO_VISIBLE_SATELLITE":
      return "Ни один спутник не виден выше порога угла места.";
    case "GATEWAY_OUTAGE":
      return "Шлюз в этот момент недоступен (отказ шлюза).";
    case "NO_GATEWAY_CONTACT":
      return `Клиент видит ${e.visible_satellite_count} спутник(ов), но ни один из них не имеет контакта со шлюзом.`;
    case "ISL_NETWORK_SPLIT":
      return e.same_component_as_gateway === false
        ? `Сеть межспутниковых линий разделена на ${e.network_component_count} компоненты — клиент и шлюз оказались в разных.`
        : "Сеть межспутниковых линий разделена, мост между клиентом и шлюзом отсутствует.";
    default:
      return "Причина не определена.";
  }
}

export function OutageExplainer({
  runId,
  clientId,
  steps,
  selectedTimeS,
  stepS,
  reason,
}: {
  runId: string | null;
  clientId: string;
  steps: TimelineStep[] | undefined;
  selectedTimeS: number;
  stepS: number;
  reason: DiagnosticReason | null;
}) {
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const interval = steps ? findOutageInterval(steps, clientId, selectedTimeS, stepS) : null;
  const { data, isLoading, error } = useOutageExplanation(runId, interval, open);
  const explanation = data?.explanation;

  if (!interval) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Почему нет связи?
      </button>

      {open && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary/30 p-2.5 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">{clientId}</span>
            <span>
              {formatClock(interval.start_s)}–{formatClock(interval.end_s)} · Перерыв: {formatDuration(interval.duration_s)}
            </span>
          </div>

          {isLoading && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Определяем причину...
            </p>
          )}
          {error && <p className="text-status-bad">Не удалось получить объяснение.</p>}

          {explanation && (
            <>
              <p>
                <span className="text-muted-foreground">Причина: </span>
                <strong>{diagnosticReasonLabel(reason)}</strong>
              </p>
              <p className="text-muted-foreground">{shortAnswer(reason, explanation)}</p>

              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                className="flex items-center gap-1 self-start text-xs text-primary hover:underline"
              >
                {detailsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Подробности графа
              </button>

              {detailsOpen && (
                <div className="flex flex-col gap-1 border-t border-border pt-2 text-xs">
                  <Row label="Видимых спутников" value={String(explanation.visible_satellite_count)} />
                  {reason === "NO_VISIBLE_SATELLITE" && (
                    <Row label="Порог угла места" value={`${explanation.min_elevation_deg.toFixed(1)}°`} />
                  )}
                  {reason === "NO_VISIBLE_SATELLITE" && explanation.nearest_below_threshold_satellite_id && (
                    <Row
                      label="Ближайший к порогу"
                      value={`${explanation.nearest_below_threshold_satellite_id} (${explanation.nearest_below_threshold_elevation_deg?.toFixed(1)}°)`}
                    />
                  )}
                  {reason !== "NO_VISIBLE_SATELLITE" && (
                    <Row label="Контакт со шлюзом" value={explanation.gateway_contact ? "есть" : "нет"} />
                  )}
                  {reason === "GATEWAY_OUTAGE" && <Row label="Шлюз" value="в отказе" tone="bad" />}
                  {reason === "ISL_NETWORK_SPLIT" && (
                    <>
                      <Row label="Сеть разделена" value={`${explanation.network_component_count} компоненты`} />
                      <Row
                        label="Клиент и шлюз"
                        value={explanation.same_component_as_gateway === false ? "в разных компонентах" : "в одной компоненте"}
                        tone={explanation.same_component_as_gateway === false ? "bad" : "ok"}
                      />
                      {explanation.client_component_size != null && (
                        <Row label="Размер компоненты клиента" value={String(explanation.client_component_size)} />
                      )}
                      {explanation.gateway_component_size != null && (
                        <Row label="Размер компоненты шлюза" value={String(explanation.gateway_component_size)} />
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono font-medium",
          tone === "ok" && "text-status-ok",
          tone === "bad" && "text-status-bad"
        )}
      >
        {value}
      </span>
    </div>
  );
}
