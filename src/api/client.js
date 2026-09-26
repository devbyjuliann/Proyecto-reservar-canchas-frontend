const API_URL = (import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL ?? 'http://localhost:3000')).replace(/\/$/, '');

export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message || 'No se pudo completar la solicitud');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body, headers, signal } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    signal,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = response.status !== 204 && response.status !== 205 && contentType.includes('application/json')
    ? await response.json()
    : null;
  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: payload?.error?.code,
      message: payload?.error?.message,
      details: payload?.error?.details,
    });
  }
  return payload;
}

export function withQuery(path, values) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export async function apiItems(path, values = {}, options = {}) {
  const items = [];
  let cursor;
  do {
    const result = await api(withQuery(path, { ...values, cursor }), options);
    items.push(...result.items);
    cursor = result.page?.nextCursor;
  } while (cursor);
  return items;
}
