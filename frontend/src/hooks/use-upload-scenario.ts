import { useMutation } from "@tanstack/react-query";

import { uploadScenario } from "@/lib/api/scenarios";

export function useUploadScenario() {
  return useMutation({
    mutationFn: (file: File) => uploadScenario(file),
  });
}
