# Adani Enterprises · Stock Intelligence

EDA, a three-model price-prediction comparison and a Groq-written recommendation over
the ADANIENT daily OHLC dataset (2016-01-01 → 2023-01-30, 1,750 trading days), served
through a FastAPI backend and a React dashboard.


| | |
|---|---|
| **Models** | KNN *(ported from the original project)*, Random Forest, XGBoost |
| **Backend** | FastAPI · scikit-learn · XGBoost · Groq |
| **Frontend** | React 18 · Vite · Recharts |
| **Analysis** | [`notebooks/01_EDA_and_Models.ipynb`](notebooks/01_EDA_and_Models.ipynb) |

---

## Quick start

```bash
# 1. backend — install, train, serve
cd backend
pip install -r requirements.txt
python train.py                 # ~10s: fits 6 models, writes artifacts/
uvicorn app.main:app --reload   # http://127.0.0.1:8000

# 2. frontend — in a second terminal
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

`npm run dev` proxies `/api` to port 8000, so both work with same-origin URLs.

**Single-port alternative** — build the frontend once and FastAPI serves it too:

```bash
cd frontend && npm run build
cd ../backend && uvicorn app.main:app     # dashboard + API on :8000
```

### Groq (optional)

```bash
cp backend/.env.example backend/.env      # then add your key
```

```ini
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
```

Without a key the recommendation endpoint falls back to a deterministic rule-based
engine that returns the same response shape, so **the dashboard works end to end with
no key at all** — the Advisor panel just labels itself `rule-based fallback`.

> If you see `TypeError: Client.__init__() got an unexpected keyword argument 'proxies'`,
> your `groq` SDK predates httpx 0.28. The code works around it, but `pip install -U groq`
> is the real fix.

---

## What the dashboard shows

**Overview** — hero close price, CAGR, volatility, max drawdown, and the price history
on a log scale with 20/50-day moving averages.

**Exploratory analysis** — descriptive statistics, drawdown and rolling-volatility
curves, calendar-year returns, the daily-return distribution, a month × year return
heatmap, the correlation matrix, the ten largest single-day moves, and the `modi`
regime-flag comparison.

**Models** — hold-out leaderboard against a naive baseline, prediction error, directional
accuracy, predicted-vs-actual over the test period, permutation importance, and the
second (Open → Close/High/Low) task.

**Predict & advise** — enter an opening price and get today's predicted range from all
three models; the next-day close forecast; and the Groq-written stance.

---

## How the modelling works

### Two tasks, both scored on the same chronological split

**Track A — next-day close.** Predicts tomorrow's close from 17 engineered features
(multi-horizon returns, moving-average ratios, rolling volatility, intraday range,
close-position-in-range, opening gap, RSI-14, regime flag).

**Track B — today's Close/High/Low from today's Open.** The original notebook's framing,
run through all three algorithms. This is what the dashboard's prediction panel uses.

### Three decisions that make the comparison honest

**1. The split is chronological, never random.**
The original notebook used `train_test_split(..., shuffle=True)`. On a price series that
leaks badly: consecutive days are ~99.9% correlated, so shuffled test days land *between*
training days the model has already seen, and the reported error collapses toward zero.
Here the last 20% of the timeline is held out intact.

**2. Targets are returns and ratios, not price levels.**
Prices run from ₹32 to ₹4,175 — a ~130× range. With a chronological split, *every* test
price sits above *every* training price, and tree ensembles cannot predict outside the
range they were trained on. Random Forest and XGBoost would look broken for a reason that
has nothing to do with the algorithms. So Track A predicts the next-day **return** and
Track B predicts **ratios to the open**; rupee prices are reconstructed afterwards, and
all metrics are reported on the reconstructed prices.

**3. Every model is scored against a naive baseline.**
"Tomorrow closes where today closed." Without it, R² ≈ 0.99 looks like success.

### Results

Hold-out: 346 trading days from 2021-09-08 (trained on the prior 1,383).

| Model | RMSE | MAE | MAPE | R² | Directional accuracy | Beats naive? |
|---|---|---|---|---|---|---|
| KNN | ₹79.49 | ₹52.60 | 2.14% | 0.992 | 47.1% | no |
| **Random Forest** | **₹69.68** | **₹42.88** | **1.79%** | 0.993 | **55.5%** | no |
| XGBoost | ₹74.37 | ₹48.03 | 1.95% | 0.993 | **55.5%** | no |
| *naive baseline* | *₹68.43* | — | — | — | — | — |

Second task (Open → Close/High/Low): Random Forest ₹53.79 RMSE / 1.43% MAPE, XGBoost
₹57.14 / 1.48%, KNN ₹57.61 / 1.49%.

**Read the table this way.** Every model posts R² ≈ 0.99, and that number means almost
nothing — it is high because yesterday's price explains today's, not because the models
are skilful. Judged against the naive baseline, **none of the three beats simply carrying
today's close forward**. On the *level* of the price this series behaves close to a random
walk, and that is the honest finding.

Where the tree ensembles do separate is **direction**: Random Forest and XGBoost call
up-vs-down correctly 55.5% of the time against KNN's 47.1% — the one metric where the
additions clearly improve on the ported baseline.

Permutation importance puts `gap_pct` (42.6%), `vol_5` (32.8%) and `close_pos` (18.7%)
on top. Only 4 of the 17 inputs earned any weight at all.

---

## Two things the data will mislead you about

**The `modi` flag is not a regime indicator.** The CSV tags every row `l` or `w`, and the
groups differ enormously (mean close ₹133 vs ₹1,671). But the labels *overlap in time* —
`l` runs 2016-01-01 → 2021-01-29 while `w` runs 2016-05-02 → 2023-01-30. A real regime
change switches once and stays switched. Because `w` rows are drawn disproportionately
from later, higher-priced years, that 12.5× gap is a sampling artefact. The models agree:
the flag scores **0.0%** importance. It is kept as an input for continuity with the
original project and earns nothing.

**Predicting High from Open is not a real result.** OHLC columns correlate at ~1.00 with
each other, so a model mapping Open → High scores beautifully while learning almost
nothing. The informative columns are the derived ones.

---

## Project layout

```
├── data/Adani_Stock.csv              # dataset from the upstream repo
├── notebooks/01_EDA_and_Models.ipynb # full EDA + model comparison, with plots
├── reference/                        # the original notebooks, unmodified
├── backend/
│   ├── train.py                      # fits all 6 models, writes artifacts/
│   ├── tests/test_api.py             # end-to-end API smoke test
│   └── app/
│       ├── main.py                   # FastAPI routes
│       ├── data_prep.py              # loading, features, chronological split
│       ├── eda.py                    # EDA → JSON for the dashboard
│       ├── models.py                 # the three estimators + metrics
│       ├── predictor.py              # artifact cache + inference
│       └── groq_advisor.py           # Groq recommendation + rule-based fallback
└── frontend/src/                     # React dashboard (Vite + Recharts)
```

## API

| Method | Endpoint | Returns |
|---|---|---|
| `GET` | `/api/health` | artifact + Groq configuration status |
| `GET` | `/api/overview` | headline statistics and latest market state |
| `GET` | `/api/eda` | full EDA payload (`?section=` for one slice) |
| `GET` | `/api/prices` | OHLC series (`?limit=`, `?every=`) |
| `GET` | `/api/models` | leaderboard, test curves, feature importances |
| `POST` | `/api/predict` | `{open_price, regime}` → Close/High/Low from all three models |
| `POST` | `/api/forecast` | `{regime}` → next-day close from all three models |
| `POST` | `/api/recommend` | `{question, regime}` → Groq stance + rationale + risks |

Interactive docs at `/docs`. Inference features are clipped to the training range rather
than extrapolated, and any clipping is reported back in `clamped_features`.

```bash
cd backend && python tests/test_api.py    # 30 checks, needs train.py to have run
```

---

## Limitations

- **No volume, fundamentals, index level or news** — only OHLC and the regime flag.
- **The data ends 2023-01-30**, days into a major drawdown, so the final row (which
  anchors the next-day forecast) is an unusually volatile starting point.
- **Single split, no walk-forward validation or hyperparameter search.** Numbers would
  move under a rolling-origin evaluation.
- **No transaction costs, slippage or position sizing** are modelled, so directional
  accuracy above 50% does not imply a profitable strategy.

This is an educational project. **Not investment advice.**
