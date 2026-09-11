"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { ApiError } from "@/lib/api/client";

function friendlySummary(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return "Нет соединения с расчётным сервисом";
    if (error.status === 404) return "Объект не найден";
    if (error.status === 422) return "Не удалось загрузить сценарий";
    return "Расчётный сервис вернул ошибку";
  }
  if (error instanceof Error) return "Произошла ошибка";
  return "Неизвестная ошибка";
}

function rawDetail(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  return null;
}

export function ErrorBanner({ error }: { error: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const summary = friendlySummary(error);
  const detail = rawDetail(error);
  const showToggle = detail && detail !== summary;

  return (
    <div className="rounded-md border border-status-bad/30 bg-status-bad/10 px-3 py-2 text-sm text-status-bad">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">{summary}</p>
          {showToggle && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs underline decoration-dotted underline-offset-2 opacity-80 hover:opacity-100"
            >
              {expanded ? "Скрыть подробности" : "Показать подробности"}
            </button>
          )}
          {expanded && detail && (
            <p className="mt-1 whitespace-pre-wrap font-mono text-xs opacity-80">{detail}</p>
          )}
        </div>
      </div>
    </div>
  );
}
