"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getExample } from "@/lib/api/scenarios";
import { useAppStore } from "@/store/app-store";
import type { Scenario } from "@/types/scenario";

/**
 * Derives a new VARIANT from a source scenario (RAAN/phase per plane,
 * launch stage, satellite failure periods) — never mutates the source
 * JSON, only ever edits an in-memory deep copy. "Сохранить вариант"
 * stores the copy under a name in the session's variant list;
 * "Использовать в моделировании" arms it as the scenario the next
 * simulation run will use (same slot the file-upload flow already uses).
 */
export function VariantEditor({
  exampleId,
  source,
}: {
  /** Fetched by id when `source` isn't already available client-side. */
  exampleId: string;
  /** An already-loaded scenario (e.g. the active uploaded/derived one) —
   * used directly instead of re-fetching, since a derived scenario's id
   * isn't a registered example the backend can look up. */
  source: Scenario | null;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Scenario | null>(null);
  const [variantName, setVariantName] = useState("");
  const [failureSatelliteId, setFailureSatelliteId] = useState("");
  const [failureStartS, setFailureStartS] = useState(0);
  const [failureEndS, setFailureEndS] = useState(0);

  const setUploadedScenario = useAppStore((s) => s.setUploadedScenario);
  const saveVariant = useAppStore((s) => s.saveVariant);

  const openEditor = async () => {
    const base = source ?? (await getExample(exampleId));
    const copy = structuredClone(base);
    setDraft(copy);
    setVariantName(`${copy.meta.id}_variant`);
    setFailureSatelliteId(copy.design.satellites[0]?.id ?? "");
    setFailureStartS(0);
    setFailureEndS(copy.environment.horizon_s);
    setOpen(true);
  };

  const update = (change: (next: Scenario) => void) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      change(next);
      return next;
    });
  };

  const addFailurePeriod = () => {
    if (failureStartS >= failureEndS) return;
    update((next) => {
      next.failures.push({
        satellite_id: failureSatelliteId,
        start_s: failureStartS,
        end_s: failureEndS,
      });
    });
  };

  const removeFailurePeriod = (index: number) => {
    update((next) => {
      next.failures.splice(index, 1);
    });
  };

  const handleSave = () => {
    if (!draft || !variantName.trim()) return;
    const named: Scenario = structuredClone(draft);
    named.meta = { ...named.meta, id: variantName.trim() };
    saveVariant(variantName.trim(), named);
  };

  const handleUseInSimulation = () => {
    if (!draft) return;
    handleSave();
    setUploadedScenario(draft);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="w-full" onClick={openEditor}>
          Редактировать
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Редактор варианта</SheetTitle>
          <SheetDescription>
            Изменения создают новый производный вариант — исходный сценарий не меняется.
          </SheetDescription>
        </SheetHeader>

        {draft && (
          <div className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="variant-name">Название варианта</Label>
              <Input
                id="variant-name"
                value={variantName}
                onChange={(e) => setVariantName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Этап развёртывания</Label>
              <Select
                value={String(draft.design.launch_stage)}
                onValueChange={(value) =>
                  update((next) => {
                    next.design.launch_stage = Number(value);
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3].map((stage) => (
                    <SelectItem key={stage} value={String(stage)}>
                      {stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Орбитальные плоскости</Label>
              {draft.design.planes.map((plane, index) => (
                <div key={plane.id} className="rounded-lg bg-secondary/45 p-2.5">
                  <p className="mb-2 font-mono text-xs text-primary">{plane.id}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-[10px] text-muted-foreground">
                      RAAN, °
                      <Input
                        type="number"
                        min={0}
                        max={359.999}
                        step={0.5}
                        value={plane.raan_deg}
                        onChange={(e) =>
                          update((next) => {
                            next.design.planes[index].raan_deg = Number(e.target.value);
                          })
                        }
                      />
                    </label>
                    <label className="space-y-1 text-[10px] text-muted-foreground">
                      Phase, °
                      <Input
                        type="number"
                        min={0}
                        max={359.999}
                        step={0.5}
                        value={plane.phase_deg}
                        onChange={(e) =>
                          update((next) => {
                            next.design.planes[index].phase_deg = Number(e.target.value);
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
              <Label>Отказы аппаратов</Label>
              <Select value={failureSatelliteId} onValueChange={setFailureSatelliteId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {draft.design.satellites.map((satellite) => (
                    <SelectItem key={satellite.id} value={satellite.id}>
                      {satellite.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-[10px] text-muted-foreground">
                  Начало, с
                  <Input
                    type="number"
                    min={0}
                    max={draft.environment.horizon_s - 1}
                    value={failureStartS}
                    onChange={(e) => setFailureStartS(Number(e.target.value))}
                  />
                </label>
                <label className="space-y-1 text-[10px] text-muted-foreground">
                  Конец, с
                  <Input
                    type="number"
                    min={1}
                    max={draft.environment.horizon_s}
                    value={failureEndS}
                    onChange={(e) => setFailureEndS(Number(e.target.value))}
                  />
                </label>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={failureStartS >= failureEndS}
                onClick={addFailurePeriod}
              >
                Добавить период
              </Button>
              {draft.failures.length > 0 && (
                <div className="flex flex-col gap-1">
                  {draft.failures.map((failure, index) => (
                    <div
                      key={`${failure.satellite_id}-${failure.start_s}-${index}`}
                      className="flex items-center justify-between text-[11px] text-muted-foreground"
                    >
                      <span className="font-mono">
                        {failure.satellite_id}: {failure.start_s}–{failure.end_s} с
                      </span>
                      <button
                        type="button"
                        className="text-status-bad hover:underline"
                        onClick={() => removeFailurePeriod(index)}
                      >
                        удалить
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <SheetFooter>
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={!draft || !variantName.trim()}
          >
            Сохранить вариант
          </Button>
          <Button onClick={handleUseInSimulation} disabled={!draft}>
            Использовать в моделировании
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
