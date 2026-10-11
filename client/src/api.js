// Small fetch helper. Backend URL lives in one place.
// Optional: create client/.env with VITE_API_URL=http://localhost:5000/api to change it.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // 0 = server not reachable
  }
}

export async function apiRequest(
  path,
  { method = 'GET', token, body, signal, fallbackMessage } = {},
) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(
      'Cannot reach the server. Check that the backend is running on port 5000 and MongoDB is connected.',
      0,
    );
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null; // empty or non-JSON body
  }

  if (!response.ok) {
    throw new ApiError(
      data?.message || fallbackMessage || `Request failed (${response.status}).`,
      response.status,
    );
  }

  return data;
}
