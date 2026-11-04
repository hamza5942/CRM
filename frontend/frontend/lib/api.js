const DEFAULT_PROD_API = "https://crm-backend-sepia-mu.vercel.app";

function resolveApiBaseUrl() {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/api\/?$/, "").replace(/\/+$/, "");
  }
  // When running in browser on a production domain or Vercel preview (not localhost)
  if (
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    return DEFAULT_PROD_API;
  }
  return process.env.NODE_ENV === "development" ? "http://localhost:5000" : DEFAULT_PROD_API;
}

export const API_BASE_URL = resolveApiBaseUrl();

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest(path, { token, ...options } = {}) {
  let response;
  const cleanPath = String(path).replace(/^\/+/, "");
  const targetUrl = `${API_BASE_URL}/api/${cleanPath}`;

  try {
    response = await fetch(targetUrl, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (err) {
    console.error(`Failed to reach API at ${targetUrl}:`, err);
    throw new Error(
      `Could not reach the backend at ${API_BASE_URL}. Please check your internet connection or backend status.`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The backend returned an unreadable response. Check the API server logs.");
  }

  if (!response.ok) {
    throw new ApiError(data.error || `The request failed with status ${response.status}.`, response.status);
  }

  return data;
}
