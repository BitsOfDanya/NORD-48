import { useQuery } from "@tanstack/react-query";

import { getHealth } from "@/lib/api/health";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    retry: 1,
    refetchInterval: 15_000,
  });
}
