/* Thin API client. In dev, Vite proxies /api to FastAPI on :8000; in production
   FastAPI serves this bundle, so the same relative URLs work in both. */

const BASE = import.meta.env.VITE_API_BASE ?? ''

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const body = await response.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : detail
    } catch {
      /* non-JSON error body — keep the status line */
    }
    throw new Error(detail)
  }
  return response.json()
}

export const api = {
  health: () => request('/api/health'),
  overview: () => request('/api/overview'),
  eda: () => request('/api/eda'),
  models: () => request('/api/models'),
  forecast: (regime) =>
    request('/api/forecast', { method: 'POST', body: JSON.stringify({ regime }) }),
  predict: (openPrice, regime) =>
    request('/api/predict', {
      method: 'POST',
      body: JSON.stringify({ open_price: openPrice, regime }),
    }),
  recommend: (question, regime) =>
    request('/api/recommend', {
      method: 'POST',
      body: JSON.stringify({ question, regime }),
    }),
}
