"use client";

import { ExternalLink, FlaskConical } from "lucide-react";

import { ErrorBanner } from "@/components/layout/error-banner";
import { TopBar } from "@/components/layout/top-bar";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMlReport } from "@/hooks/use-ml-report";

const REPO_BLOB = "https://github.com/BitsOfDanya/NORD-48/blob/main";
const ML_BRANCH_URL = "https://github.com/BitsOfDanya/NORD-48/tree/ml";
const ARTIFACT_ID = "catboost-20260912T190729172811Z";
const ARTIFACT_PATH = `ml/artifacts/${ARTIFACT_ID}`;

function ExplainerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-foreground">{children}</p>
    </div>
  );
}

function formatPp(fraction: number): string {
  return `${(fraction * 100).toFixed(2)} п.п.`;
}

function RepoLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
    >
      {children} <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

/** No calculation happens on this page: model quality metrics (MAE/RMSE/
 * baseline/seed/samples) come live from GET /api/v1/research/ml, which
 * only parses the committed ml/artifacts/*\/report.json — the same file
 * scripts/train_catboost.py wrote. Nothing here retrains or re-infers. The
 * speed benchmark and the predicted-vs-exact example below are prose facts
 * from docs/catboost.md (not stored in report.json), unchanged from that
 * one recorded run. */
export default function ResearchPage() {
  const { data: report, isPending, error } = useMlReport();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar subtitle="ML Surrogate Research" />
      <WorkspaceNav />

      <div className="flex-1 overflow-y-auto bg-workspace lg:ml-60">
        <div className="mx-auto max-w-4xl p-4 sm:p-6">
          <div className="flex flex-col gap-3 border-b border-border pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5 text-[11px]">
                <FlaskConical className="h-3 w-3" />
                Research · Experimental
              </Badge>
              <Badge variant="secondary" className="text-[11px]">
                Source: CatBoost pretrained artifact in repository
              </Badge>
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-foreground">ML Surrogate Research</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                ML используется для ускоренного просмотра большого пространства RAAN/phase-конфигураций.
                Exact simulation остаётся финальным источником истины для любой рекомендации.
              </p>
            </div>
          </div>

          <Card className="mt-4">
            <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
              <ExplainerRow label="Что показывает">
                ML-assisted candidate search: результаты исследовательской surrogate-модели
                (CatBoost), которая ранжирует RAAN/phase-кандидаты до того, как их точно считает
                симулятор.
              </ExplainerRow>
              <ExplainerRow label="Зачем">
                Уменьшить число дорогих exact evaluations — точная оценка одной конфигурации это
                полная симуляция на 720 шагов, суррогат заранее оценивает намного больше кандидатов
                тем же бюджетом.
              </ExplainerRow>
              <ExplainerRow label="Как читать">
                ML только ранжирует кандидатов, не как источник финальной инженерной метрики —
                предсказанное число никогда не заменяет точный расчёт.
              </ExplainerRow>
              <ExplainerRow label="Финальная проверка">
                Exact simulation — всегда последний шаг перед тем, как конфигурация может
                рассматриваться как рекомендация.
              </ExplainerRow>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">1. Задача</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              Точная оценка одной RAAN/phase-конфигурации требует полного пересчёта сети на 720
              временных шагов (сутки). Просмотр большого пространства углов точным перебором
              становится дорогим. CatBoost-суррогат учится предсказывать целевую метрику
              (1 − худшая доступность) по углам конфигурации и предварительно ранжирует
              значительно больше кандидатов, чем можно точно посчитать за тот же бюджет.
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">2. Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <pre className="overflow-x-auto rounded-lg bg-secondary/50 p-3 font-mono text-xs leading-relaxed text-foreground">
{`Сценарий (штатный режим, полная группировка)
        ↓
RAAN/phase candidate encoding (sin/cos углов)
        ↓
CatBoost: прогноз для 8192 случайных RAAN/phase-вариантов
        ↓
Top-15 + baseline — точная симуляция (до 16 точных расчётов)
        ↓
Top-5 — повторная точная проверка
        ↓
Exact verified result`}
              </pre>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Второй режим («CatBoost · обучение в ходе поиска») обучается прямо во время
                поиска: модель переобучается каждые 8 новых точных расчётов и предлагает следующие
                кандидаты — тоже только для ранжирования, не для финальной метрики. Доступны оба
                режима в «Оптимизатор» → «Настройки поиска» (с пометкой Research).
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Как и для любого другого алгоритма оптимизатора, кандидат-финалист отдельно
                проверяется на N-1/N-2 перед тем, как рассматриваться как рекомендация —
                суррогат этот шаг не меняет и не заменяет.
              </p>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">3. Метрики</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              {error && <ErrorBanner error={error} />}
              {isPending && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              )}
              {report && (
                <>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-text-muted">MAE (holdout)</p>
                      <p className="font-mono font-semibold">{formatPp(report.mae)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-text-muted">RMSE (holdout)</p>
                      <p className="font-mono font-semibold">{formatPp(report.rmse)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-text-muted">Baseline (const. mean)</p>
                      <p className="font-mono font-semibold">{formatPp(report.mean_baseline_mae)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-text-muted">Train / holdout</p>
                      <p className="font-mono font-semibold">
                        {report.training_samples} / {report.holdout_samples}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Seed {report.seed}, сценарий <code className="font-mono">{report.scenario_id}</code>,
                    маршрутизация <code className="font-mono">{report.routing_strategy}</code>, признаки
                    — sin/cos углов {report.features.join(", ")}, независимая holdout-выборка не
                    участвует в обучении. Артефакт: <code className="font-mono">{report.artifact_id}</code>.
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Суррогат заметно лучше константного baseline для candidate screening, но ошибка
                    (~{formatPp(report.mae)}) слишком велика, чтобы использовать прогноз как финальную
                    инженерную метрику — отсюда обязательная exact-проверка top-кандидатов.
                  </p>
                </>
              )}

              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium">Predicted vs Exact — типичный holdout-случай</p>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="rounded-lg border border-border/60 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-text-muted">Predicted</p>
                    <p className="font-mono text-lg font-semibold text-foreground">≈59,00%</p>
                  </div>
                  <div className="rounded-lg border border-border/60 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-text-muted">Exact</p>
                    <p className="font-mono text-lg font-semibold text-foreground">51,11%</p>
                  </div>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Медианная по ошибке holdout-точка (не лучший случай) — показывает реальную
                    погрешность модели, а не выгодный пример. Predicted ≠ Verified: только Exact
                    может стать рекомендацией.
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium">Скорость (один прогон, не гарантия для других seed/условий)</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-text-muted">
                        <th className="pb-1 pr-4">Алгоритм</th>
                        <th className="pb-1 pr-4">Точных расчётов</th>
                        <th className="pb-1 pr-4">Время</th>
                        <th className="pb-1">Лучшая worst availability</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      <tr>
                        <td className="py-1.5 pr-4 font-medium">CatBoost · сохранённая модель</td>
                        <td className="py-1.5 pr-4 font-mono">16 + 5</td>
                        <td className="py-1.5 pr-4 font-mono">8,48 с</td>
                        <td className="py-1.5 font-mono">97,92%</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pr-4 font-medium">Random benchmark</td>
                        <td className="py-1.5 pr-4 font-mono">100 + 5</td>
                        <td className="py-1.5 pr-4 font-mono">41,82 с</td>
                        <td className="py-1.5 font-mono">99,17%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Ускорение ≈4,93× ценой 1,25 п.п. качества найденной конфигурации — единичный
                  прогон, не универсальная гарантия.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">4. Артефакты и репозиторий</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-border/60 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-text-muted">Model</p>
                  <p className="font-mono text-xs">model.cbm</p>
                  <p className="mt-0.5 text-[11px] text-status-ok">committed · reproducible</p>
                </div>
                <div className="rounded-lg border border-border/60 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-text-muted">Dataset</p>
                  <p className="font-mono text-xs">dataset.jsonl</p>
                  <p className="mt-0.5 text-[11px] text-status-ok">committed · reproducible</p>
                </div>
                <div className="rounded-lg border border-border/60 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-text-muted">Report</p>
                  <p className="font-mono text-xs">report.json</p>
                  <p className="mt-0.5 text-[11px] text-status-ok">committed · reproducible</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Путь в репозитории: <code className="font-mono">{ARTIFACT_PATH}/</code>. Обучающий
                скрипт (не запускается автоматически — только вручную):{" "}
                <code className="font-mono">scripts/train_catboost.py</code>.
              </p>
              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                <RepoLink href={`${REPO_BLOB}/docs/catboost.md`}>docs/catboost.md (полная методика)</RepoLink>
                <RepoLink href={`${REPO_BLOB}/${ARTIFACT_PATH}/report.json`}>report.json</RepoLink>
                <RepoLink href={`${REPO_BLOB}/scripts/train_catboost.py`}>scripts/train_catboost.py</RepoLink>
                <RepoLink href={ML_BRANCH_URL}>Historical development branch: origin/ml</RepoLink>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4 mb-6">
            <CardHeader>
              <CardTitle className="text-base">Ограничения</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
                <li>MAE ≈8,14 п.п. — заметная погрешность, prediction не авторитетна.</li>
                <li>Speed benchmark — единичный прогон, не универсальная гарантия.</li>
                <li>Сохранённая модель требует точного совпадения сценария, стратегии, режима и порядка параметров.</li>
                <li>Exact validation обязательна для любого кандидата перед рекомендацией.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
