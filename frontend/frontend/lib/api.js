export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest(path, { token, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Could not reach the backend. Make sure the API is running and its URL is configured.");
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
