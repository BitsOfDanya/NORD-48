import { useMutation } from "@tanstack/react-query";

import { runConnectivityMargin, runDailyConnectivity } from "@/lib/api/resilience";
import { useAppStore } from "@/store/app-store";

export function useConnectivityMargin() {
  const setConnectivityMarginState = useAppStore((state) => state.setConnectivityMarginState);
  return useMutation({
    mutationFn: runConnectivityMargin,
    onSuccess: (result) => setConnectivityMarginState({ result }),
  });
}

export function useDailyConnectivity() {
  const setConnectivityMarginState = useAppStore((state) => state.setConnectivityMarginState);
  return useMutation({
    mutationFn: runDailyConnectivity,
    onSuccess: (dailyResult) => setConnectivityMarginState({ dailyResult }),
  });
}
