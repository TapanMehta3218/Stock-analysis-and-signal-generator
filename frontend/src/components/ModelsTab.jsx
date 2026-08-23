import React, { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, ChartTooltip, Legend } from './ui.jsx'
import { modelColor, useTokens } from '../lib/useTokens.js'
import {
  featureLabel,
  monthYear,
  num,
  pct,
  rupees,
  rupeesCompact,
  shortDate,
} from '../lib/format.js'

const ORDER = ['knn', 'random_forest', 'xgboost']

function thin(rows, target = 340) {
  if (rows.length <= target) return rows
  const step = Math.ceil(rows.length / target)
  const out = rows.filter((_, i) => i % step === 0)
  if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1])
  return out
}

export default function ModelsTab({ board }) {
  const tokens = useTokens()
  const [focus, setFocus] = useState('random_forest')

  const forecast = board.forecast
  const byKey = Object.fromEntries(forecast.models.map((m) => [m.key, m]))
  const bestKey = board.best_model.key

  const legend = ORDER.map((key) => ({
    label: byKey[key].label,
    color: modelColor(tokens, key),
    line: true,
  }))

  const curveData = useMemo(() => {
    const { dates, actual, ...preds } = forecast.curves
    return thin(
      dates.map((date, i) => ({
        date,
        actual: actual[i],
        knn: preds.knn[i],
        random_forest: preds.random_forest[i],
        xgboost: preds.xgboost[i],
      })),
    )
  }, [forecast.curves])

  const errorData = ORDER.map((key) => ({
    key,
    label: byKey[key].label,
    rmse: byKey[key].rmse,
    mae: byKey[key].mae,
  }))

  const dirData = ORDER.map((key) => ({
    key,
    label: byKey[key].label,
    accuracy: byKey[key].directional_accuracy,
    delta: byKey[key].directional_accuracy - 50,
  }))

  // Only features that actually earned weight. Most of the 17 inputs score zero,
  // and a column of 0.0% bars is noise — the count is stated in the subtitle
  // instead, and the regime flag gets called out by name below the chart.
  const allImportances = byKey[focus].importances ?? []
  const importances = allImportances
    .filter((row) => row.share > 0.05)
    .slice(0, 8)
    .map((row) => ({ ...row, label: featureLabel(row.feature) }))
    .reverse()
  const regimeShare = allImportances.find((row) => row.feature === 'regime')?.share ?? 0

  const axis = {
    tick: { fill: tokens['text-muted'], fontSize: 11 },
    axisLine: false,
    tickLine: false,
  }

  return (
    <div className="stack">
      <Card
        title="Hold-out leaderboard — next-day close"
        subtitle={`Trained on ${forecast.train_rows.toLocaleString('en-IN')} days, tested on the ${forecast.test_rows} days from ${shortDate(forecast.split_date)} onward. The split is chronological, so no future price ever leaks into training.`}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>RMSE</th>
                <th>MAE</th>
                <th>MAPE</th>
                <th>R²</th>
                <th>Directional acc.</th>
                <th>Beats naive?</th>
                <th>Fit time</th>
              </tr>
            </thead>
            <tbody>
              {ORDER.map((key) => {
                const m = byKey[key]
                return (
                  <tr key={key} className={key === bestKey ? 'is-best' : ''}>
                    <td>
                      <span className="cell-key">
                        <span className="dot" style={{ background: modelColor(tokens, key) }} />
                        {m.label}
                        {key === bestKey && (
                          <span className="badge" style={{ marginLeft: 4 }}>
                            best
                          </span>
                        )}
                      </span>
                    </td>
                    <td>{rupees(m.rmse)}</td>
                    <td>{rupees(m.mae)}</td>
                    <td>{pct(m.mape)}</td>
                    <td>{num(m.r2, 3)}</td>
                    <td className={m.directional_accuracy > 50 ? 'up' : 'down'}>
                      {pct(m.directional_accuracy, 1)}
                    </td>
                    <td>{m.beats_naive ? 'yes' : 'no'}</td>
                    <td>{num(m.train_seconds, 2)}s</td>
                  </tr>
                )
              })}
              <tr>
                <td className="sec">
                  <span className="cell-key">
                    <span className="dot" style={{ background: tokens['text-muted'] }} />
                    Naive “tomorrow = today”
                  </span>
                </td>
                <td>{rupees(forecast.naive_rmse)}</td>
                <td colSpan={6} className="muted" style={{ textAlign: 'left' }}>
                  baseline — no model, just carry today's close forward
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="note" style={{ marginTop: 14 }}>
          <strong>The honest headline.</strong> Every model posts R² ≈ 0.99, and that
          number means almost nothing here — it is high because yesterday's price explains
          today's, not because the models are skilful. Judged against the naive baseline
          (RMSE {rupees(forecast.naive_rmse)}), none of the three beats simply carrying
          today's close forward. On the <em>level</em> of the price this series behaves
          close to a random walk. Where the tree ensembles do separate is direction:
          Random Forest and XGBoost call up-vs-down correctly{' '}
          {pct(byKey.random_forest.directional_accuracy, 1)} of the time against KNN's{' '}
          {pct(byKey.knn.directional_accuracy, 1)}.
        </div>
      </Card>

      <div className="grid grid--2">
        <Card
          title="Prediction error"
          subtitle="Lower is better. The dashed reference is the naive baseline — anything above it is worse than doing nothing."
        >
          <Legend
            items={[
              { label: 'RMSE', color: tokens['series-1'] },
              { label: 'MAE', color: tokens['series-2'] },
            ]}
          />
          <div className="chart" style={{ height: 232 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={errorData} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={tokens.grid} vertical={false} />
                <XAxis dataKey="label" {...axis} axisLine={{ stroke: tokens.axis }} />
                <YAxis tickFormatter={rupeesCompact} width={52} {...axis} />
                <ReferenceLine
                  y={forecast.naive_rmse}
                  stroke={tokens['text-muted']}
                  strokeWidth={1}
                  label={{
                    value: `naive ${rupees(forecast.naive_rmse, 0)}`,
                    position: 'insideTopRight',
                    fill: tokens['text-muted'],
                    fontSize: 10.5,
                  }}
                />
                <Tooltip
                  cursor={{ fill: tokens['surface-2'], opacity: 0.55 }}
                  content={<ChartTooltip formatter={(v) => rupees(v)} />}
                />
                <Bar dataKey="rmse" name="RMSE" fill={tokens['series-1']} maxBarSize={24} radius={[4, 4, 0, 0]} />
                <Bar dataKey="mae" name="MAE" fill={tokens['series-2']} maxBarSize={24} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Plotted as advantage over a coin flip, so the bars grow from a real,
            meaningful zero. Charting the raw 47-56% range would have forced a
            truncated axis, and a truncated axis under bars misstates the
            differences — length is only honest when it starts from zero. */}
        <Card
          title="Directional accuracy vs a coin flip"
          subtitle="Percentage points above or below 50% on the hold-out set. This is the metric that actually separates the three — and the only one where the tree ensembles clearly beat the ported KNN."
        >
          <div className="chart" style={{ height: 232 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dirData}
                layout="vertical"
                margin={{ top: 20, right: 60, bottom: 4, left: 0 }}
              >
                <CartesianGrid stroke={tokens.grid} horizontal={false} />
                <XAxis
                  type="number"
                  domain={[-8, 8]}
                  ticks={[-8, -4, 0, 4, 8]}
                  tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}pp`}
                  {...axis}
                  axisLine={{ stroke: tokens.axis }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={110}
                  {...axis}
                  tick={{ fill: tokens['text-secondary'], fontSize: 11.5 }}
                />
                <ReferenceLine
                  x={0}
                  stroke={tokens.critical}
                  strokeWidth={1.5}
                  label={{
                    value: 'coin flip',
                    position: 'top',
                    fill: tokens.critical,
                    fontSize: 10.5,
                  }}
                />
                <Tooltip
                  cursor={{ fill: tokens['surface-2'], opacity: 0.55 }}
                  content={
                    <ChartTooltip
                      title={(label) => label}
                      rows={(payload) => [
                        {
                          key: 'Directional accuracy',
                          color: modelColor(tokens, payload[0].payload.key),
                          value: pct(payload[0].payload.accuracy, 1),
                        },
                        {
                          key: 'vs coin flip',
                          value: `${payload[0].payload.delta > 0 ? '+' : ''}${payload[0].payload.delta.toFixed(1)}pp`,
                        },
                      ]}
                    />
                  }
                />
                <Bar dataKey="delta" name="vs coin flip" maxBarSize={22} radius={[4, 4, 4, 4]}>
                  {dirData.map((row) => (
                    <Cell key={row.key} fill={modelColor(tokens, row.key)} />
                  ))}
                  <LabelList
                    dataKey="accuracy"
                    position="right"
                    formatter={(v) => `${v.toFixed(1)}%`}
                    fill={tokens['text-secondary']}
                    fontSize={11}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card
        title="Predicted vs actual close — hold-out period"
        subtitle="All four lines sit almost on top of each other, which is the point: a next-day price prediction is mostly a restatement of today's price. The gaps open up in the volatile stretches."
      >
        <Legend items={[{ label: 'Actual', color: tokens['text-secondary'], line: true }, ...legend]} />
        <div className="chart" style={{ height: 330 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={curveData} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={tokens.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={monthYear} minTickGap={44} {...axis} />
              {/* Data-driven domain. A zero-based axis would squash a 1.5K-4.2K
                  series into the middle third of the plot and hide the divergences
                  this chart exists to show. Safe here because these are lines
                  (position), not bars (length from a baseline). */}
              <YAxis
                domain={['dataMin - 150', 'dataMax + 150']}
                tickFormatter={rupeesCompact}
                width={56}
                {...axis}
              />
              <Tooltip
                cursor={{ stroke: tokens.axis, strokeWidth: 1 }}
                content={<ChartTooltip title={shortDate} formatter={(v) => rupees(v)} />}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke={tokens['text-secondary']}
                strokeWidth={2.4}
                dot={false}
                isAnimationActive={false}
              />
              {ORDER.map((key) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={byKey[key].label}
                  stroke={modelColor(tokens, key)}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid--2">
        <Card
          title="What drives the prediction"
          subtitle={`Permutation importance on the hold-out set — the one measure defined identically for all three algorithms, so they can share an axis. Only ${importances.length} of the ${forecast.feature_count} inputs earned any weight; the rest scored zero and are left off.`}
          actions={
            <div className="segmented" style={{ width: 250 }}>
              {ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={focus === key}
                  onClick={() => setFocus(key)}
                >
                  {byKey[key].label}
                </button>
              ))}
            </div>
          }
        >
          <div className="chart" style={{ height: 268 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={importances}
                layout="vertical"
                margin={{ top: 4, right: 46, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke={tokens.grid} horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${v.toFixed(0)}%`} {...axis} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={150}
                  {...axis}
                  tick={{ fill: tokens['text-secondary'], fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: tokens['surface-2'], opacity: 0.55 }}
                  content={<ChartTooltip formatter={(v) => `${v.toFixed(1)}% of total`} />}
                />
                <Bar
                  dataKey="share"
                  name="Share of importance"
                  fill={modelColor(tokens, focus)}
                  maxBarSize={18}
                  radius={[0, 4, 4, 0]}
                >
                  <LabelList
                    dataKey="share"
                    position="right"
                    formatter={(v) => `${v.toFixed(1)}%`}
                    fill={tokens['text-secondary']}
                    fontSize={11}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            The <code>modi</code> regime flag scores {pct(regimeShare, 1)} — it is one of
            the inputs that earned nothing, which is what the Exploratory analysis tab
            predicts from the flag's overlapping date ranges.
          </p>
        </Card>

        <Card
          title="Second task — Close / High / Low from the Open"
          subtitle={`The original notebook's framing, run through all three algorithms. Targets are ratios to the open, so the models work at any price level. Tested on the ${board.intraday.test_rows} days from ${shortDate(board.intraday.split_date)}.`}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>RMSE</th>
                  <th>MAE</th>
                  <th>MAPE</th>
                  <th>Close MAPE</th>
                  <th>High MAPE</th>
                  <th>Low MAPE</th>
                </tr>
              </thead>
              <tbody>
                {ORDER.map((key) => {
                  const m = board.intraday.models.find((x) => x.key === key)
                  return (
                    <tr key={key}>
                      <td>
                        <span className="cell-key">
                          <span className="dot" style={{ background: modelColor(tokens, key) }} />
                          {m.label}
                        </span>
                      </td>
                      <td>{rupees(m.rmse)}</td>
                      <td>{rupees(m.mae)}</td>
                      <td>{pct(m.mape)}</td>
                      <td>{pct(m.per_target.Close.mape)}</td>
                      <td>{pct(m.per_target.High.mape)}</td>
                      <td>{pct(m.per_target.Low.mape)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            High is the easiest of the three targets for every model, and Close the
            hardest — the day's extremes are more tightly pinned to the open than where it
            eventually settles.
          </p>
        </Card>
      </div>
    </div>
  )
}
