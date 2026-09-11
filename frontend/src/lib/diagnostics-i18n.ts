import type { DiagnosticReason } from "@/types/simulation";

export const DIAGNOSTIC_REASON_LABELS: Record<DiagnosticReason, string> = {
  NO_VISIBLE_SATELLITE: "Нет видимого спутника",
  NO_GATEWAY_CONTACT: "Нет контакта со шлюзом",
  GATEWAY_OUTAGE: "Шлюз недоступен",
  ISL_NETWORK_SPLIT: "Разрыв межспутниковой сети",
};

export function diagnosticReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return DIAGNOSTIC_REASON_LABELS[reason as DiagnosticReason] ?? reason;
}

export type CheckState = "ok" | "bad" | "warn" | "na";

export interface DiagnosticCheckRow {
  label: string;
  state: CheckState;
  value: string;
}

/**
 * The backend's `diagnostic_checks` always carries three booleans, but once
 * one condition explains the failure, the checks after it in the decision
 * tree were never actually evaluated (routing/diagnostics short-circuit —
 * see backend/app/calculation/diagnostics/diagnostics.py). Showing them as
 * a flat "false" would misrepresent them as confirmed failures. This maps
 * the reason to which checks are meaningful right now.
 */
export function diagnosticCheckRows(reason: string | null | undefined): DiagnosticCheckRow[] {
  const na: DiagnosticCheckRow = { label: "", state: "na", value: "—" };

  const visible = (state: CheckState): DiagnosticCheckRow => ({
    label: "Видимый аппарат",
    state,
    value: state === "ok" ? "есть" : "нет",
  });
  const gateway = (state: CheckState, value?: string): DiagnosticCheckRow => ({
    label: "Контакт со шлюзом",
    state,
    value: value ?? (state === "ok" ? "есть" : "нет"),
  });
  const isl = (state: CheckState): DiagnosticCheckRow => ({
    label: "Связность ISL",
    state,
    value: state === "ok" ? "есть" : "нет",
  });

  switch (reason as DiagnosticReason) {
    case "NO_VISIBLE_SATELLITE":
      return [visible("bad"), { ...na, label: "Контакт со шлюзом" }, { ...na, label: "Связность ISL" }];
    case "NO_GATEWAY_CONTACT":
      return [visible("ok"), gateway("bad"), { ...na, label: "Связность ISL" }];
    case "GATEWAY_OUTAGE":
      return [visible("ok"), gateway("warn", "шлюз недоступен"), { ...na, label: "Связность ISL" }];
    case "ISL_NETWORK_SPLIT":
      return [visible("ok"), gateway("ok"), isl("bad")];
    default:
      return [];
  }
}
