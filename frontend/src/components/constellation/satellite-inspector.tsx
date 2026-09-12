"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/format";
import { useAppStore } from "@/store/app-store";
import type { SatelliteMeta } from "@/hooks/use-satellite-meta";
import type { EdgeView, SatelliteView } from "@/types/simulation";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium text-foreground">{value}</span>
    </div>
  );
}

export function SatelliteInspector({
  satellite,
  meta,
  edges,
  tS,
  inRoute,
  onClose,
}: {
  satellite: SatelliteView;
  meta: SatelliteMeta | undefined;
  edges: EdgeView[];
  tS: number;
  inRoute: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const criticality = useAppStore((state) => state.criticalityBySatellite[satellite.id]);
  const criticalityTotal = useAppStore((state) => Object.keys(state.criticalityBySatellite).length);
  const setFailureIds = useAppStore((state) => state.setFailureLabSatelliteIds);
  const setResilienceMode = useAppStore((state) => state.setResilienceMode);
  const islContacts = edges.filter(
    (e) => e.kind === "isl" && (e.a === satellite.id || e.b === satellite.id)
  ).length;
  const groundContacts = edges.filter(
    (e) => e.kind === "ground_contact" && (e.a === satellite.id || e.b === satellite.id)
  ).length;

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 w-64 rounded-lg border border-border bg-card/95 p-3 shadow-xl backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-base font-semibold text-foreground">{satellite.id}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <Row label="Статус" value={satellite.active ? "Активен" : "Недоступен"} />
        {meta && <Row label="Плоскость" value={meta.planeId} />}
        {meta && <Row label="Очередь" value={String(meta.launchBatch)} />}
        <Row label="Текущий момент" value={formatClock(tS)} />
        <Row label="Связи ISL" value={String(islContacts)} />
        <Row label="Наземные контакты" value={String(groundContacts)} />
        <Row label="В текущем маршруте" value={inRoute ? "Да" : "Нет"} />
        {criticality && <>
          <div className="my-1 border-t border-border" />
          <Row label="Ранг" value={`${criticality.rank} / ${criticalityTotal}`} />
          <Row label="Макс. влияние" value={`−${criticality.worst_client_availability_drop_pp.toFixed(2).replace(".", ",")} п.п.`} />
          <Row label="Нарушений цели" value={String(criticality.target_violations_count)} />
          <Row label="Affected" value={criticality.affected_clients.join(", ") || "—"} />
        </>}
      </div>
      <Button
        className="mt-3 w-full"
        size="sm"
        variant="outline"
        onClick={() => {
          setFailureIds([satellite.id]);
          setResilienceMode("failure");
          router.push("/resilience");
        }}
      >
        {criticality ? "Открыть анализ отказа" : "Анализировать отказ"}
      </Button>
    </div>
  );
}
