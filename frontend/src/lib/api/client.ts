import { env } from "@/config/env";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** FastAPI returns strings for HTTP errors and arrays for validation errors. */
export function formatApiErrorDetail(detail: unknown): string | undefined {
  if (typeof detail === "string") return detail || undefined;
  if (Array.isArray(detail)) {
    const messages = detail.map(formatApiErrorDetail).filter(Boolean);
    return messages.length ? messages.join("; ") : undefined;
  }
  if (detail !== null && typeof detail === "object") {
    const entry = detail as Record<string, unknown>;
    if (typeof entry.msg === "string") {
      const location = Array.isArray(entry.loc)
        ? entry.loc.filter((part) => (typeof part === "string" && part !== "body") || typeof part === "number").join(".")
        : "";
      return location ? `${location}: ${entry.msg}` : entry.msg;
    }
    if (typeof entry.message === "string") return entry.message;
  }
  return undefined;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      ...init,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Backend unavailable. Is it running?", 0);
  }

  if (!response.ok) {
    let detail = `Request to ${path} failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: unknown } | null;
      detail = formatApiErrorDetail(body?.detail) ?? detail;
    } catch {
      // response body wasn't JSON — keep the generic message
    }
    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as T;
}
