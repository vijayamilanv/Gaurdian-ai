/**
 * Typed HTTP client for the Python AI service.
 * All calls go through here so timeout, base URL, and error handling are centralised.
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8000";
const TIMEOUT_MS = 15_000;

async function aiPost<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${AI_SERVICE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI service error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

async function aiGet<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${AI_SERVICE_URL}${path}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`AI service error ${res.status}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export interface PipelineResult {
  user_profile: Record<string, unknown>;
  activities: unknown[];
  current_status: Record<string, unknown> | null;
  predictions: Record<string, unknown> | null;
  skill_gap: Record<string, unknown> | null;
  weaknesses: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
}

export const aiService = {
  health: () => aiGet<{ status: string }>("/health"),

  runPipeline: (payload: {
    user_profile: Record<string, unknown>;
    activities: unknown[];
    // Sub-Phase D: optional application tracking signals
    active_apps?: number | null;
    rounds_completed?: number | null;
    round_pass_rate?: number | null;
    days_since_last_app?: number | null;
  }) => aiPost<PipelineResult>("/agents/run", payload),

  predictPlacement: (payload: {
    cgpa: number; dsaSolved: number; projects: number;
    skills: string[]; attendance: number;
  }) => aiPost<{ probability: number; topRisks: string[] }>("/predict/placement", payload),
};
