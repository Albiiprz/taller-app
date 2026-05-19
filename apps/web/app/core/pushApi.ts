import { getAccessToken, refreshAccessToken } from "./authApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Wrapped<T> = { statusCode: number; data: T; error?: string | null };

function unwrap<T>(payload: T | Wrapped<T>): T {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "statusCode" in (payload as Record<string, unknown>) &&
    "data" in (payload as Record<string, unknown>)
  ) {
    return (payload as Wrapped<T>).data;
  }
  return payload as T;
}

async function apiFetch<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 401 && !retried) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return apiFetch<T>(path, init, true);
    }
    throw new Error(`Error API ${res.status}`);
  }
  const payload = (await res.json()) as T | Wrapped<T>;
  return unwrap(payload);
}

export async function getPushPublicKey(): Promise<string> {
  const data = await apiFetch<{ publicKey: string }>("/notifications/push/public-key");
  return data.publicKey;
}

export async function subscribePushApi(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await apiFetch("/notifications/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      },
    }),
  });
}

export async function unsubscribePushApi(endpoint: string): Promise<void> {
  await apiFetch("/notifications/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}

export async function sendPushTestApi(): Promise<void> {
  await apiFetch("/notifications/push/test", { method: "POST", body: "{}" });
}

