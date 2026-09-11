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
