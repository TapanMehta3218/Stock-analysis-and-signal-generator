import { useCallback, useEffect, useState } from 'react'

/* Recharts needs literal colour strings, but the palette lives in CSS custom
   properties so light and dark stay in one place. This reads the resolved
   values and re-reads them whenever the theme changes. */

const TOKENS = [
  'surface-1',
  'surface-2',
  'text-primary',
  'text-secondary',
  'text-muted',
  'grid',
  'axis',
  'series-1',
  'series-2',
  'series-3',
  'series-4',
  'series-5',
  'pos',
  'neg',
  'good',
  'warning',
  'serious',
  'critical',
]

function read() {
  const style = getComputedStyle(document.documentElement)
  return Object.fromEntries(
    TOKENS.map((name) => [name, style.getPropertyValue(`--${name}`).trim()]),
  )
}

export function useTokens() {
  const [tokens, setTokens] = useState(read)

  useEffect(() => {
    const observer = new MutationObserver(() => setTokens(read()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  return tokens
}

const STORAGE_KEY = 'adani-theme'

export function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem(STORAGE_KEY) || 'dark',
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggle = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    [],
  )

  return { theme, toggle }
}

/** Fixed model → colour mapping. Colour follows the entity, never its rank, so
    a model keeps its hue no matter how the leaderboard sorts. */
export const MODEL_SLOT = { knn: 'series-1', random_forest: 'series-2', xgboost: 'series-3' }

export const modelColor = (tokens, key) => tokens[MODEL_SLOT[key]] ?? tokens['series-1']
