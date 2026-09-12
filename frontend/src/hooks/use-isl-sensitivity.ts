import { useMutation } from "@tanstack/react-query";

import { runIslSensitivity } from "@/lib/api/isl-sensitivity";
import { useAppStore } from "@/store/app-store";

export function useIslSensitivity() {
  const setIslSensitivityState = useAppStore((state) => state.setIslSensitivityState);
  return useMutation({
    mutationFn: runIslSensitivity,
    onSuccess: (result) => setIslSensitivityState({ result }),
  });
}

/** Same sweep, written to `robustResult` — used for the Recommended Robust
 * comparison curve so it never overwrites the primary result. */
export function useIslSensitivityComparison() {
  const setIslSensitivityState = useAppStore((state) => state.setIslSensitivityState);
  return useMutation({
    mutationFn: runIslSensitivity,
    onSuccess: (robustResult) => setIslSensitivityState({ robustResult }),
  });
}
