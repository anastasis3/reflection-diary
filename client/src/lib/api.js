/**
 * The only place the front-end talks to the server.
 *
 * Every screen calls a named function from here, never `fetch` directly. That
 * gives one place to attach the token, one place to turn an error response
 * into a thrown `ApiError`, and one list of the endpoints the interface uses —
 * which is also how a reader checks that it agrees with docs/openapi.yaml.
 */

const BASE = '/api';
const TOKEN_KEY = 'reflection-diary.token';

/** The error every failed call throws. `fields` drives the inline messages. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details ?? [];
  }

  /** Validation messages keyed by field name, for marking inputs. */
  get fields() {
    return Object.fromEntries(this.details.map((d) => [d.field, d.message]));
  }
}

/** The bearer token, kept in this browser between visits. */
export const token = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (value) => { try { localStorage.setItem(TOKEN_KEY, value); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

async function request(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const stored = token.get();
  if (stored) headers.authorization = `Bearer ${stored}`;

  let response;
  try {
    response = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Never reached the server: offline, or the server is down.
    throw new ApiError(0, 'OFFLINE', 'No connection to the server. Your text is kept on this device.');
  }

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error ?? {};
    if (response.status === 401) token.clear();
    throw new ApiError(response.status, error.code ?? 'UNKNOWN', error.message ?? 'Something went wrong.', error.details);
  }
  return payload;
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body);
const patch = (path, body) => request('PATCH', path, body);
const del = (path) => request('DELETE', path);

export const api = {
  // --- account --------------------------------------------------------------
  register: (payload) => post('/auth/register', payload),
  login: (payload) => post('/auth/login', payload),
  me: () => get('/auth/me'),
  forgotPassword: (email) => post('/auth/forgot', { email }),
  resetPassword: (resetToken, password) => post('/auth/reset', { token: resetToken, password }),
  setName: (name) => patch('/account/name', { name }),

  // --- the quiz -------------------------------------------------------------
  onboarding: () => get('/onboarding'),
  answerStatement: (zoneId, value) => post('/onboarding/answers', { zoneId, value }),
  completeOnboarding: () => post('/onboarding/complete'),

  // --- three questions a day ------------------------------------------------
  today: () => get('/prompts/today'),
  choose: (promptShownId) => post(`/prompts/${promptShownId}/choose`),
  explanation: (promptShownId) => get(`/prompts/${promptShownId}/explanation`),
  rate: (promptShownId, relevant) => post(`/prompts/${promptShownId}/rating`, { relevant }),

  // --- entries --------------------------------------------------------------
  saveEntry: (text, promptShownId) => post('/entries', { text, promptShownId }),
  entries: (filters = {}) => {
    const query = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    );
    return get(`/entries${query.size ? `?${query}` : ''}`);
  },

  // --- the topic profile ----------------------------------------------------
  profile: () => get('/profile'),
  insight: () => get('/profile/insight'),
  snapshots: (days = 7) => get(`/profile/history?days=${days}`),
  updateWeights: (zones) => patch('/profile/weights', { zones }),
  trend: (zone, days = 30) => get(`/profile/trend?zone=${zone}&days=${days}`),
  changes: () => get('/profile/changes'),

  // --- history --------------------------------------------------------------
  historySummary: () => get('/history/summary'),
  calendar: (month) => get(`/history/calendar?month=${month}`),
  day: (day) => get(`/history/day/${day}`),

  // --- settings -------------------------------------------------------------
  consents: () => get('/account/consents'),
  withdrawAiConsent: () => del('/account/consents/ai-processing'),
  grantAiConsent: () => post('/account/consents/ai-processing'),
  exportData: () => get('/account/export'),
  deleteAccount: () => del('/account'),
};

export default api;
