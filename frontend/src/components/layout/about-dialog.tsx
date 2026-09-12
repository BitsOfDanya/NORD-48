"use client";

import { BookOpen, Info, Route, ShieldCheck, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const TERMS = [
  ["Доступность", "Доля расчётного времени, когда наземный пункт имеет маршрут до шлюза."],
  ["Worst availability", "Минимальная доступность среди всех наземных пунктов — ключевой критерий проекта."],
  ["ISL", "Межспутниковая линия связи (Inter-Satellite Link). Дальность ISL ограничивает рёбра сети."],
  ["RAAN / фаза", "Ориентация орбитальной плоскости и взаимное положение аппаратов внутри неё."],
  ["N-1 / N-2", "Проверка потери одного или двух аппаратов соответственно на полном горизонте."],
  ["Baseline", "Базовый расчёт, относительно которого показываются изменения альтернативного варианта."],
  ["Monte Carlo", "Серия случайных отказов для оценки распределения риска, а не одного худшего случая."],
] as const;

export function AboutDialog({ compact = false }: { compact?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {compact ? (
          <Button variant="ghost" className="w-full justify-start gap-3 text-sidebar-foreground">
            <BookOpen /> Справка эксперта
          </Button>
        ) : (
          <Badge
            variant="outline"
            className="h-9 cursor-pointer gap-1.5 px-3 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Info className="h-3 w-3" />
            Термины и методика
          </Badge>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Как читать результаты NORD-48</DialogTitle>
          <DialogDescription>
            Краткая методика и словарь показателей для инженерной интерпретации расчёта.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-accent p-3">
            <Target className="mb-2 size-4 text-primary" />
            <p className="text-xs font-semibold">1. Проверьте цель</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Сначала убедитесь, что худший наземный пункт достигает требуемой доступности.</p>
          </div>
          <div className="rounded-xl bg-accent p-3">
            <ShieldCheck className="mb-2 size-4 text-primary" />
            <p className="text-xs font-semibold">2. Оцените отказы</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Затем сравните N-1, N-2 и вероятностный стресс-тест Monte Carlo.</p>
          </div>
          <div className="rounded-xl bg-accent p-3">
            <Route className="mb-2 size-4 text-primary" />
            <p className="text-xs font-semibold">3. Найдите причину</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Маршрут, узкое место и временная шкала объясняют, где именно теряется связь.</p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Словарь показателей</p>
          <dl className="divide-y divide-border rounded-xl border border-border">
            {TERMS.map(([term, description]) => (
              <div key={term} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[130px_1fr]">
                <dt className="text-xs font-semibold text-foreground">{term}</dt>
                <dd className="text-xs leading-relaxed text-muted-foreground">{description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-xs text-muted-foreground">
          NORD-48 · «Проектирование устойчивой спутниковой группировки» · КосмоХакатон 2026 · команда 5bit
        </p>
      </DialogContent>
    </Dialog>
  );
}
