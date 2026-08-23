import React from 'react'

export function Card({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card__head">
          {title && <h2 className="card__title">{title}</h2>}
          {actions}
        </div>
      )}
      {subtitle && <p className="card__sub">{subtitle}</p>}
      {children}
    </section>
  )
}

export function StatTile({ label, value, delta, deltaTone }) {
  return (
    <div className="card">
      <div className="tile__label">{label}</div>
      <div className="tile__value">{value}</div>
      {delta && <div className={`tile__delta ${deltaTone ?? ''}`}>{delta}</div>}
    </div>
  )
}

/* A legend is always present for two or more series — identity is never
   carried by colour alone. */
export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((item) => (
        <span className="legend__item" key={item.label}>
          <span
            className={`legend__swatch ${item.line ? 'legend__swatch--line' : ''}`}
            style={{ background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}

export function Badge({ children, tone }) {
  return <span className={`badge ${tone ? `badge--${tone}` : ''}`}>{children}</span>
}

/** Recharts tooltip content with the project's card styling. */
export function ChartTooltip({ active, payload, label, title, rows, formatter }) {
  if (!active || !payload?.length) return null

  const lines =
    rows?.(payload, label) ??
    payload
      .filter((entry) => entry.value != null)
      .map((entry) => ({
        key: entry.name,
        color: entry.color ?? entry.stroke ?? entry.fill,
        value: formatter ? formatter(entry.value, entry) : entry.value,
      }))

  return (
    <div className="tooltip">
      <div className="tooltip__title">{title?.(label, payload) ?? label}</div>
      {lines.map((line, index) => (
        <div className="tooltip__row" key={`${line.key}-${index}`}>
          <span className="tooltip__key">
            {line.color && <span className="dot" style={{ background: line.color }} />}
            {line.key}
          </span>
          <span className="tooltip__val">{line.value}</span>
        </div>
      ))}
    </div>
  )
}

export function Empty({ children }) {
  return <div className="center-state">{children}</div>
}

export function Spinner({ label }) {
  return (
    <span className="sec">
      <span className="spinner" /> {label}
    </span>
  )
}
