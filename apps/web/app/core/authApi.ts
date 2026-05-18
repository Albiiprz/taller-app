const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export const ACCESS_TOKEN_KEY = "taller_access_token_v1";
export const REFRESH_TOKEN_KEY = "taller_refresh_token_v1";

export type AuthLoginResult = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    role: string;
    roles?: string[];
    login: string;
  };
};

type AuthRefreshResult = {
  accessToken: string;
  refreshToken: string;
};

export type LoginUserOption = {
  id: string;
  name: string;
  role: string;
  roles?: string[];
  login: string;
  pinRequired: boolean;
};

function humanizeAuthMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("pin incorrect")) return "PIN incorrecto.";
  if (lower.includes("no se pudo conectar")) {
    return "No se pudo hablar con el sistema. Revisa internet o que el servidor esté encendido.";
  }
  if (lower.startsWith("error login")) {
    return "No se pudo entrar ahora mismo.";
  }
  if (lower.includes("usuarios")) {
    return "No se pudo cargar la lista de usuarios.";
  }
  return message;
}

export async function loginApi(input: {
  login: string;
  pin: string;
}): Promise<AuthLoginResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        login: input.login,
        pin: input.pin,
      }),
    });
  } catch {
    throw new Error("No se pudo hablar con el sistema. Revisa internet o que el servidor esté encendido.");
  }

  if (!res.ok) {
    let message = `Error login ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body?.message)) message = body.message.join(", ");
      else if (typeof body?.message === "string") message = body.message;
    } catch {
      // ignore
    }
    throw new Error(humanizeAuthMessage(message));
  }

  return (await res.json()) as AuthLoginResult;
}

export async function listLoginUsersApi(): Promise<LoginUserOption[]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/users/login-options`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw new Error("No se pudo hablar con el sistema. Revisa internet o que el servidor esté encendido.");
  }
  if (!res.ok) {
    throw new Error("No se pudo cargar la lista de usuarios.");
  }
  const payload = (await res.json()) as { statusCode?: number; data?: LoginUserOption[] } | LoginUserOption[];
  if (Array.isArray(payload)) return payload;
  return payload.data ?? [];
}

export function setAccessToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function setRefreshToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function setAuthTokens(input: { accessToken: string; refreshToken: string }) {
  setAccessToken(input.accessToken);
  setRefreshToken(input.refreshToken);
}

export function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? "";
}

export function getRefreshToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(REFRESH_TOKEN_KEY) ?? "";
}

export function clearAccessToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function clearAuthTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

let refreshPromise: Promise<boolean> | null = null;

export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearAuthTokens();
      return false;
    }

    const data = (await res.json()) as AuthRefreshResult;
    setAuthTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    return true;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function logoutApi(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // ignore
  } finally {
    clearAuthTokens();
  }
}
