"use client";

import { Loader2, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useExamples } from "@/hooks/use-examples";
import { scenarioDisplayTitle } from "@/lib/scenario-catalog";
import type { MonteCarloRequest } from "@/types/resilience";
import type { RoutingStrategy } from "@/types/simulation";

const STRATEGY_LABELS: Record<RoutingStrategy, string> = {
  minimum_hops: "Минимум переходов",
  minimum_distance: "Минимальная длина",
  maximum_margin: "Максимальный запас",
};

const ALL_STRATEGIES: RoutingStrategy[] = ["minimum_hops", "minimum_distance", "maximum_margin"];
const K_PRESETS = [1, 3, 5, 10] as const;

export function MonteCarloForm({
  onSubmit,
  isPending,
  defaultScenarioId,
}: {
  onSubmit: (request: MonteCarloRequest) => void;
  isPending: boolean;
  defaultScenarioId: string;
}) {
  const { data: examples } = useExamples();
  const [scenarioId, setScenarioId] = useState(defaultScenarioId);
  const [failedCount, setFailedCount] = useState(5);
  const [iterations, setIterations] = useState(100);
  const [seed, setSeed] = useState(42);
  const [strategies, setStrategies] = useState<RoutingStrategy[]>(ALL_STRATEGIES);

  const toggleStrategy = (strategy: RoutingStrategy) => {
    setStrategies((current) =>
      current.includes(strategy)
        ? current.filter((s) => s !== strategy)
        : [...current, strategy]
    );
  };

  const canSubmit = scenarioId && strategies.length > 0 && !isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      scenario_id: scenarioId,
      failed_satellites_count: failedCount,
      iterations,
      seed,
      strategies,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Параметры стресс-теста</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Сценарий</Label>
          <Select value={scenarioId} onValueChange={setScenarioId}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {examples?.find((e) => e.id === scenarioId)
                  ? scenarioDisplayTitle(scenarioId, examples.find((e) => e.id === scenarioId)!.title)
                  : "Сценарий"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {examples?.map((example) => (
                <SelectItem key={example.id} value={example.id}>
                  {scenarioDisplayTitle(example.id, example.title)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mc-k">Число отказавших аппаратов (K)</Label>
          <Input
            id="mc-k"
            type="number"
            min={0}
            value={failedCount}
            onChange={(e) => setFailedCount(Math.max(0, Number(e.target.value) || 0))}
          />
          <div className="flex gap-1.5 pt-0.5">
            {K_PRESETS.map((k) => (
              <Button
                key={k}
                type="button"
                variant={failedCount === k ? "secondary" : "outline"}
                size="xs"
                onClick={() => setFailedCount(k)}
              >
                K = {k}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mc-iterations">Итераций</Label>
            <Input
              id="mc-iterations"
              type="number"
              min={1}
              max={1000}
              value={iterations}
              onChange={(e) =>
                setIterations(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mc-seed">Seed</Label>
            <Input
              id="mc-seed"
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Стратегии маршрутизации</Label>
          {ALL_STRATEGIES.map((strategy) => (
            <label key={strategy} className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={strategies.includes(strategy)}
                onCheckedChange={() => toggleStrategy(strategy)}
              />
              {STRATEGY_LABELS[strategy]}
            </label>
          ))}
        </div>

        <Button onClick={handleSubmit} disabled={!canSubmit} className="mt-1">
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {isPending ? "Расчёт..." : "Запустить стресс-тест"}
        </Button>
      </CardContent>
    </Card>
  );
}
