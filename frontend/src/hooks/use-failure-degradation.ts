import { useCallback, useEffect, useRef, useState } from "react";

import {
  getFailureDegradationResult,
  getFailureDegradationStatus,
  startFailureDegradation,
} from "@/lib/api/failure-degradation";
import type { FailureDegradationRequest } from "@/types/failure-degradation";

/** Polls a failure-degradation job to completion, writing the result via
 * `onResult` (the caller decides which store slot — primary or
 * Recommended Robust comparison — it lands in). Mirrors the job-polling
 * pattern already used by deployment-plan/threshold-verification panels. */
export function useFailureDegradationRun(
  onResult: (result: Awaited<ReturnType<typeof getFailureDegradationResult>>) => void
) {
  const [job, setJob] = useState<Awaited<ReturnType<typeof startFailureDegradation>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const status = await getFailureDegradationStatus(job.run_id);
        setJob(status);
        if (status.status === "completed") {
          onResultRef.current(await getFailureDegradationResult(status.run_id));
        }
        if (status.status === "failed") setError(status.error ?? "Расчёт завершился с ошибкой");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Ошибка API");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [job]);

  const start = useCallback(async (request: FailureDegradationRequest) => {
    setError(null);
    try {
      const created = await startFailureDegradation(request);
      setJob(created);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось запустить расчёт");
    }
  }, []);

  const running = Boolean(job && ["queued", "running"].includes(job.status));
  return { start, job, error, running };
}
