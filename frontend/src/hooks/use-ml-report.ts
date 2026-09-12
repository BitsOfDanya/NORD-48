import { useQuery } from "@tanstack/react-query";

import { getCatBoostReport } from "@/lib/api/research";

export function useMlReport() {
  return useQuery({
    queryKey: ["ml-catboost-report"],
    queryFn: getCatBoostReport,
    staleTime: Infinity,
    retry: false,
  });
}
