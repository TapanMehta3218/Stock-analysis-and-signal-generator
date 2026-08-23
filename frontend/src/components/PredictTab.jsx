import React, { useEffect, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, ChartTooltip, Legend, Spinner } from './ui.jsx'
import { modelColor, useTokens } from '../lib/useTokens.js'
import { pct, rupees, rupeesCompact, shortDate, signedPct } from '../lib/format.js'
import { api } from '../lib/api.js'

const ORDER = ['knn', 'random_forest', 'xgboost']

function RegimeToggle({ value, onChange }) {
  return (
    <div className="segmented">
      <button type="button" aria-pressed={value === 0} onClick={() => onChange(0)}>
        Flag “l”
      </button>
      <button type="button" aria-pressed={value === 1} onClick={() => onChange(1)}>
        Flag “w”
      </button>
    </div>
  )
}

function RangeChart({ result }) {
  const tokens = useTokens()
  const data = result.predictions.map((p) => ({
    key: p.model,
    label: p.label,
    range: [p.prediction.low, p.prediction.high],
    close: p.prediction.close,
  }))

  return (
    <>
      <Legend
        items={[
          ...ORDER.map((key) => ({
            label: result.predictions.find((p) => p.model === key).label,
            color: modelColor(tokens, key),
          })),
          { label: 'Predicted close', color: tokens['text-primary'] },
        ]}
      />
      <div className="chart" style={{ height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={tokens.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: tokens['text-muted'], fontSize: 11 }}
              axisLine={{ stroke: tokens.axis }}
              tickLine={false}
            />
            <YAxis
              domain={['dataMin - 60', 'dataMax + 60']}
              tickFormatter={rupeesCompact}
              tick={{ fill: tokens['text-muted'], fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <ReferenceLine
              y={result.input.open}
              stroke={tokens['text-muted']}
              strokeWidth={1}
              label={{
                value: `open ${rupees(result.input.open, 0)}`,
                position: 'insideTopLeft',
                fill: tokens['text-muted'],
                fontSize: 10.5,
              }}
            />
            <Tooltip
              cursor={{ fill: tokens['surface-2'], opacity: 0.5 }}
              content={
                <ChartTooltip
                  rows={(payload) => {
                    const d = payload[0].payload
                    return [
                      { key: 'High', color: modelColor(tokens, d.key), value: rupees(d.range[1]) },
                      { key: 'Close', color: tokens['text-primary'], value: rupees(d.close) },
                      { key: 'Low', color: modelColor(tokens, d.key), value: rupees(d.range[0]) },
                    ]
                  }}
                />
              }
            />
            <Bar dataKey="range" name="Low–High range" maxBarSize={44} radius={[4, 4, 4, 4]}>
              {data.map((row) => (
                <Cell key={row.key} fill={modelColor(tokens, row.key)} fillOpacity={0.35} />
              ))}
            </Bar>
            <Scatter dataKey="close" name="Predicted close" fill={tokens['text-primary']} shape="diamond" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

function PredictPanel({ latest, regime, setRegime }) {
  const tokens = useTokens()
  const [openPrice, setOpenPrice] = useState(() => String(Math.round(latest.open)))
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const run = async (event) => {
    event?.preventDefault()
    const value = Number(openPrice)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an opening price greater than zero.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      setResult(await api.predict(value, regime))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    run()
    // Re-run whenever the regime flag flips so the panel never shows stale output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regime])

  return (
    <Card
      title="Predict today's range from the open"
      subtitle="The original project's question, answered by all three models at once. Targets are ratios to the opening price, so the prediction scales correctly at any price level."
    >
      <form onSubmit={run} className="grid grid--3" style={{ alignItems: 'end', gap: 14 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field__label">Opening price (₹)</span>
          <input
            className="input"
            type="number"
            min="1"
            step="0.05"
            value={openPrice}
            onChange={(e) => setOpenPrice(e.target.value)}
          />
        </label>
        <div className="field" style={{ marginBottom: 0 }}>
          <span className="field__label">Regime flag</span>
          <RegimeToggle value={regime} onChange={setRegime} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Predicting…' : 'Predict'}
          </button>
        </div>
      </form>

      {error && (
        <div className="note" style={{ marginTop: 14, borderLeftColor: 'var(--critical)' }}>
          {error}
        </div>
      )}

      {result && !error && (
        <div style={{ marginTop: 18 }}>
          <RangeChart result={result} />

          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Low</th>
                  <th>Close</th>
                  <th>High</th>
                  <th>vs open</th>
                  <th>Test MAE</th>
                </tr>
              </thead>
              <tbody>
                {result.predictions.map((p) => (
                  <tr key={p.model}>
                    <td>
                      <span className="cell-key">
                        <span className="dot" style={{ background: modelColor(tokens, p.model) }} />
                        {p.label}
                      </span>
                    </td>
                    <td>{rupees(p.prediction.low)}</td>
                    <td>{rupees(p.prediction.close)}</td>
                    <td>{rupees(p.prediction.high)}</td>
                    <td className={p.change_pct >= 0 ? 'up' : 'down'}>
                      {signedPct(p.change_pct)}
                    </td>
                    <td>{rupees(p.test_mae)}</td>
                  </tr>
                ))}
                <tr className="is-best">
                  <td>
                    <strong>Consensus (mean)</strong>
                  </td>
                  <td>{rupees(result.consensus.low)}</td>
                  <td>
                    <strong>{rupees(result.consensus.close)}</strong>
                  </td>
                  <td>{rupees(result.consensus.high)}</td>
                  <td colSpan={2} className="muted" style={{ textAlign: 'left' }}>
                    average of the three models
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="muted" style={{ marginTop: 12 }}>
            Opening {signedPct(result.input.gap_vs_last_close_pct)} against the last close in
            the dataset ({rupees(result.reference.last_close)} on{' '}
            {shortDate(result.reference.last_date)}).{' '}
            {result.clamped_features.includes('gap_pct') && (
              <>
                That gap is wider than anything in the training range, so it was clipped to
                the fitted range rather than extrapolated — treat this prediction as a rough
                extension, not a fitted result.{' '}
              </>
            )}
            {result.clamped_features.some((f) => f !== 'gap_pct') && (
              <>
                The final row of the dataset sits mid-drawdown, so{' '}
                {result.clamped_features.filter((f) => f !== 'gap_pct').length} of its
                trailing momentum readings are outside the range the models were fitted on
                and were clipped too.
              </>
            )}
          </p>
        </div>
      )}
    </Card>
  )
}

const STANCE_TONE = {
  ACCUMULATE: 'good',
  HOLD: 'warning',
  REDUCE: 'serious',
  AVOID: 'critical',
}

function AdvisorPanel({ regime }) {
  const tokens = useTokens()
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const run = async (event) => {
    event?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setResult(await api.recommend(question.trim() || null, regime))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regime])

  const tone = result ? STANCE_TONE[result.stance] : null
  const stanceColor = tone ? tokens[tone] : tokens['text-primary']

  return (
    <Card
      title="AI recommendation"
      subtitle="A Groq-hosted LLM reads a compact brief — the EDA statistics, the three models' next-day predictions, and their hold-out scores — and weighs them into a stance. It never sees raw prices and is never asked to forecast; the numbers come from the models."
      actions={
        result && (
          <span className="badge">
            {result.engine.startsWith('groq') ? result.engine : 'rule-based fallback'}
          </span>
        )
      }
    >
      <form onSubmit={run}>
        <label className="field">
          <span className="field__label">Ask something specific (optional)</span>
          <textarea
            className="input"
            placeholder="e.g. Is the recent drawdown a reason to wait, or does the model see a bounce?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
          />
        </label>
        <button className="btn" type="submit" disabled={busy} style={{ width: 'auto' }}>
          {busy ? 'Thinking…' : 'Get recommendation'}
        </button>
      </form>

      {busy && !result && (
        <p style={{ marginTop: 16 }}>
          <Spinner label="Building the brief and calling the model…" />
        </p>
      )}

      {error && (
        <div className="note" style={{ marginTop: 16, borderLeftColor: 'var(--critical)' }}>
          {error}
        </div>
      )}

      {result && !error && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span
              className="stance"
              style={{
                color: stanceColor,
                background: `color-mix(in srgb, ${stanceColor} 12%, transparent)`,
              }}
            >
              {result.stance}
            </span>
            <span className="badge">{result.confidence} confidence</span>
            {result.forecast && (
              <span className="sec" style={{ fontSize: 13 }}>
                {result.forecast.consensus.agreement} models agree on direction
              </span>
            )}
          </div>

          {result.headline && (
            <p style={{ fontSize: 15.5, margin: '16px 0 4px', fontWeight: 550 }}>
              {result.headline}
            </p>
          )}

          <div className="grid grid--2" style={{ marginTop: 14 }}>
            <div>
              <div className="tile__label">Why</div>
              <ul className="list">
                {result.rationale.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="tile__label">Risks &amp; limitations</div>
              <ul className="list">
                {result.risks.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          </div>

          {result.model_view && (
            <div className="note" style={{ marginTop: 8 }}>
              <strong>Model view.</strong> {result.model_view}
            </div>
          )}

          {result.note && (
            <p className="muted" style={{ marginTop: 12 }}>
              {result.note}
            </p>
          )}

          <p className="muted" style={{ marginTop: 12 }}>
            {result.disclaimer}
          </p>
        </div>
      )}
    </Card>
  )
}

function NextDayCard({ regime }) {
  const tokens = useTokens()
  const [data, setData] = useState(null)

  useEffect(() => {
    api.forecast(regime).then(setData).catch(() => setData(null))
  }, [regime])

  if (!data) return null

  return (
    <Card
      title="Next-day close forecast"
      subtitle={`Anchored on the last row in the dataset — ${shortDate(data.anchor.date)}, close ${rupees(data.anchor.close)}. Each model predicts tomorrow's return, which is converted back to a price.`}
    >
      <div className="grid grid--4">
        {data.predictions.map((p) => (
          <div key={p.model}>
            <div className="tile__label">
              <span className="cell-key">
                <span className="dot" style={{ background: modelColor(tokens, p.model) }} />
                {p.label}
              </span>
            </div>
            <div className="tile__value">{rupees(p.predicted_close)}</div>
            <div className={`tile__delta ${p.predicted_return_pct >= 0 ? 'up' : 'down'}`}>
              {signedPct(p.predicted_return_pct)} · {pct(p.directional_accuracy, 1)} hit rate
            </div>
          </div>
        ))}
        <div>
          <div className="tile__label">Consensus</div>
          <div className="tile__value">{rupees(data.consensus.close)}</div>
          <div className={`tile__delta ${data.consensus.return_pct >= 0 ? 'up' : 'down'}`}>
            {signedPct(data.consensus.return_pct)} · {data.consensus.agreement} agree
          </div>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 14 }}>
        A single-day point forecast on a stock whose daily returns have a standard
        deviation of about 3% should be read as a direction with a wide band around it,
        not as a price target.
      </p>
    </Card>
  )
}

export default function PredictTab({ latest }) {
  const [regime, setRegime] = useState(latest.regime ?? 1)

  return (
    <div className="stack">
      <PredictPanel latest={latest} regime={regime} setRegime={setRegime} />
      <NextDayCard regime={regime} />
      <AdvisorPanel regime={regime} />
    </div>
  )
}
