import { useQuery } from "@tanstack/react-query";

import { listExamples } from "@/lib/api/scenarios";

export function useExamples() {
  return useQuery({
    queryKey: ["scenario-examples"],
    queryFn: listExamples,
    staleTime: Infinity,
  });
}
