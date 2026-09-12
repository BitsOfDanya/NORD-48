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
