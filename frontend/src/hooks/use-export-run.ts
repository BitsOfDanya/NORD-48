import { useMutation } from "@tanstack/react-query";

import { env } from "@/config/env";
import { getExportUrl } from "@/lib/api/simulations";

async function downloadExport(runId: string): Promise<void> {
  const response = await fetch(`${env.apiUrl}${getExportUrl(runId)}`);
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  const blob = await response.blob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `nord48-export-${runId}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function useExportRun() {
  return useMutation({
    mutationFn: (runId: string) => downloadExport(runId),
  });
}
