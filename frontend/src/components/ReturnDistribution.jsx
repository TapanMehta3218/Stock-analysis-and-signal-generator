import React from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, ChartTooltip, Legend } from './ui.jsx'
import { useTokens } from '../lib/useTokens.js'
import { num, pct } from '../lib/format.js'

export default function ReturnDistribution({ distribution, summary }) {
  const tokens = useTokens()
  const stats = summary['Daily return %']

  return (
    <Card
      title="Distribution of daily returns"
      subtitle={`Mean ${num(stats.mean, 2)}%, standard deviation ${num(stats.std, 2)}%, kurtosis ${num(stats.kurtosis, 1)}. Kurtosis far above 3 means fat tails: extreme days happen far more often than a normal distribution would allow.`}
    >
      <Legend
        items={[
          { label: 'Up days', color: tokens.pos },
          { label: 'Down days', color: tokens.neg },
        ]}
      />
      <div className="chart" style={{ height: 244 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={distribution} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={tokens.grid} vertical={false} />
            <XAxis
              dataKey="mid"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              tick={{ fill: tokens['text-muted'], fontSize: 11 }}
              axisLine={{ stroke: tokens.axis }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: tokens['text-muted'], fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
              label={{
                value: 'Days',
                angle: -90,
                position: 'insideLeft',
                fill: tokens['text-muted'],
                fontSize: 11,
              }}
            />
            <ReferenceLine x={0} stroke={tokens.axis} strokeWidth={1} />
            <Tooltip
              cursor={{ fill: tokens['surface-2'], opacity: 0.55 }}
              content={
                <ChartTooltip
                  title={() => 'Return bucket'}
                  rows={(payload) => {
                    const d = payload[0].payload
                    return [
                      {
                        key: 'Range',
                        value: `${d.bin_start.toFixed(1)}% to ${d.bin_end.toFixed(1)}%`,
                      },
                      {
                        key: 'Days',
                        color: d.mid >= 0 ? tokens.pos : tokens.neg,
                        value: d.count,
                      },
                    ]
                  }}
                />
              }
            />
            <Bar dataKey="count" maxBarSize={24} radius={[3, 3, 0, 0]}>
              {distribution.map((bin, i) => (
                <Cell key={i} fill={bin.mid >= 0 ? tokens.pos : tokens.neg} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="muted" style={{ margin: '4px 0 0' }}>
        Range {pct(stats.min, 1)} to {pct(stats.max, 1)} · median {pct(stats.median, 2)}
      </p>
    </Card>
  )
}
