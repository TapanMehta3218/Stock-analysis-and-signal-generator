import React, { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, ChartTooltip, Legend } from './ui.jsx'
import { useTokens } from '../lib/useTokens.js'
import { monthYear, rupees, rupeesCompact, shortDate } from '../lib/format.js'

const RANGES = [
  { key: '1y', label: '1Y', days: 250 },
  { key: '3y', label: '3Y', days: 750 },
  { key: 'all', label: 'All', days: Infinity },
]

/** Keep every Nth point so a 1,750-day series stays smooth to draw, always
    retaining the last point so the chart ends on the latest close. */
function downsample(rows, target = 420) {
  if (rows.length <= target) return rows
  const step = Math.ceil(rows.length / target)
  const out = rows.filter((_, i) => i % step === 0)
  if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1])
  return out
}

export default function PriceChart({ series }) {
  const tokens = useTokens()
  const [range, setRange] = useState('all')
  const [logScale, setLogScale] = useState(true)

  const data = useMemo(() => {
    const days = RANGES.find((r) => r.key === range).days
    const sliced = Number.isFinite(days) ? series.slice(-days) : series
    return downsample(sliced)
  }, [series, range])

  const legend = [
    { label: 'Close', color: tokens['series-1'], line: true },
    { label: '20-day MA', color: tokens['series-2'], line: true },
    { label: '50-day MA', color: tokens['series-3'], line: true },
  ]

  return (
    <Card
      title="Close price history"
      subtitle={
        logScale
          ? 'Log scale — the stock rose roughly 59× over the period, so equal vertical distance means equal percentage move.'
          : 'Linear scale — the early years are compressed to near-zero because of the ~59× rise.'
      }
      actions={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="segmented" style={{ width: 168 }}>
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={range === r.key}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="segmented" style={{ width: 128 }}>
            <button type="button" aria-pressed={logScale} onClick={() => setLogScale(true)}>
              Log
            </button>
            <button type="button" aria-pressed={!logScale} onClick={() => setLogScale(false)}>
              Linear
            </button>
          </div>
        </div>
      }
    >
      <Legend items={legend} />
      <div className="chart" style={{ height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="closeWash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tokens['series-1']} stopOpacity={0.16} />
                <stop offset="100%" stopColor={tokens['series-1']} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={tokens.grid} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={monthYear}
              tick={{ fill: tokens['text-muted'], fontSize: 11 }}
              axisLine={{ stroke: tokens.axis }}
              tickLine={false}
              minTickGap={48}
            />
            <YAxis
              scale={logScale ? 'log' : 'linear'}
              domain={logScale ? ['dataMin', 'dataMax'] : [0, 'dataMax']}
              tickFormatter={rupeesCompact}
              tick={{ fill: tokens['text-muted'], fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip
              cursor={{ stroke: tokens.axis, strokeWidth: 1 }}
              content={
                <ChartTooltip
                  title={shortDate}
                  formatter={(value) => rupees(value)}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="close"
              name="Close"
              stroke="none"
              fill="url(#closeWash)"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="close"
              name="Close"
              stroke={tokens['series-1']}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ma20"
              name="20-day MA"
              stroke={tokens['series-2']}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ma50"
              name="50-day MA"
              stroke={tokens['series-3']}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
