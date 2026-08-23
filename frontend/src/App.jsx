import React, { useEffect, useState } from 'react'
import { api } from './lib/api.js'
import { useTheme } from './lib/useTokens.js'
import { Empty, Spinner } from './components/ui.jsx'
import OverviewTab from './components/OverviewTab.jsx'
import EdaTab from './components/EdaTab.jsx'
import ModelsTab from './components/ModelsTab.jsx'
import PredictTab from './components/PredictTab.jsx'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'eda', label: 'Exploratory analysis' },
  { key: 'models', label: 'Models' },
  { key: 'predict', label: 'Predict & advise' },
]

export default function App() {
  const { theme, toggle } = useTheme()
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([api.health(), api.overview(), api.eda(), api.models()])
      .then(([health, overview, eda, board]) => {
        if (!cancelled) setData({ health, overview, eda, board })
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <Empty>
        <strong>Could not reach the API.</strong>
        <span>{error}</span>
        <span className="muted">
          Start the backend with <code>cd backend &amp;&amp; python train.py</code> then{' '}
          <code>uvicorn app.main:app --reload</code>, and reload this page.
        </span>
      </Empty>
    )
  }

  if (!data) {
    return (
      <Empty>
        <Spinner label="Loading dataset, EDA and model artifacts…" />
      </Empty>
    )
  }

  const { health, overview, eda, board } = data

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__row">
          <div className="brand">
            <span className="brand__mark">Adani Enterprises · Stock Intelligence</span>
            <span className="brand__sub">
              EDA · KNN / Random Forest / XGBoost · Groq recommendations
            </span>
          </div>
          <span className="badge">
            {health.groq_configured ? `Groq: ${health.groq_model}` : 'Groq: not configured'}
          </span>
          <button
            className="icon-btn"
            type="button"
            onClick={toggle}
            aria-label="Toggle colour theme"
          >
            {theme === 'dark' ? 'Light' : 'Dark'} mode
          </button>
        </div>

        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              className="tab"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {tab === 'overview' && (
          <OverviewTab
            overview={overview.overview}
            latest={overview.latest}
            priceSeries={eda.price_series}
            board={board}
          />
        )}
        {tab === 'eda' && <EdaTab eda={eda} />}
        {tab === 'models' && <ModelsTab board={board} />}
        {tab === 'predict' && <PredictTab latest={overview.latest} />}
      </main>

      <footer className="muted" style={{ marginTop: 32, textAlign: 'center' }}>
        Dataset 2016-01-01 → 2023-01-30, from{' '}
        <a
          href="https://github.com/info-gallary/ML_Models_HackNUthon/tree/main/Adani_Ent_Stock_Prediction"
          target="_blank"
          rel="noreferrer"
          style={{ color: 'inherit' }}
        >
          info-gallary/ML_Models_HackNUthon
        </a>
        . Educational project — not investment advice. Models retrained at{' '}
        {board.generated_at}.
      </footer>
    </div>
  )
}
