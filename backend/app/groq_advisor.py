"""Groq-powered recommendation layer.

The models produce numbers; this turns them into a readable, caveated view.

The LLM never sees raw price history and is never asked to forecast - it is given
a compact, pre-computed brief (EDA statistics + the three models' predictions +
their hold-out scores) and asked to weigh those signals into a stance. That keeps
the quantitative work in the models where it belongs and uses the LLM only for
the part it is actually good at: synthesis and explanation.

If `GROQ_API_KEY` is unset or the call fails, a deterministic rule-based engine
produces the same response shape, so the dashboard is never dead.
"""

from __future__ import annotations

import json

from .config import GROQ_API_KEY, GROQ_MODEL

DISCLAIMER = (
    "Educational output from a student ML project on a 2016-2023 dataset. "
    "Not investment advice."
)

STANCES = ("ACCUMULATE", "HOLD", "REDUCE", "AVOID")

SYSTEM_PROMPT = """You are a careful equity research assistant summarising a \
student machine-learning project on Adani Enterprises (NSE: ADANIENT).

You are given a JSON brief: exploratory statistics from the 2016-2023 price \
history, the next-day predictions of three models (KNN, Random Forest, XGBoost), \
and each model's hold-out accuracy. Weigh those signals into a single stance.

Rules:
- Use ONLY the numbers in the brief. Never invent prices, dates, news or fundamentals.
- Quote figures with their units (Rs. for prices, % for returns).
- Be honest about weakness. If the models barely beat the naive baseline, or if
  directional accuracy is near 50%, say so plainly - that is the finding.
- The dataset ends in January 2023 and carries no volume, fundamentals or news.
  Treat every conclusion as historical and model-bound.
- Be concise. No preamble, no repetition of the question.

Return ONLY valid JSON with exactly these keys:
{
  "stance": one of "ACCUMULATE" | "HOLD" | "REDUCE" | "AVOID",
  "confidence": "low" | "medium" | "high",
  "headline": one sentence, max 140 characters,
  "rationale": array of 3-4 strings, each one sentence citing a specific number,
  "risks": array of 2-3 strings naming a concrete risk or data limitation,
  "model_view": one sentence on whether the three models agree and which is most trustworthy
}"""


def _client():
    """Build a Groq client that works across SDK/httpx version combinations.

    groq <= 0.11 passes `proxies=` straight through to `httpx.Client`, which
    httpx removed in 0.28 — so the default constructor raises
    `TypeError: Client.__init__() got an unexpected keyword argument 'proxies'`
    on an otherwise valid install. Supplying an explicit `http_client` skips
    that code path entirely, and newer SDKs accept the same argument, so this
    works either way. Upgrading (`pip install -U groq`) is still the better fix
    and is what requirements.txt pins.
    """
    from groq import Groq

    try:
        import httpx

        return Groq(api_key=GROQ_API_KEY, http_client=httpx.Client(timeout=30.0))
    except TypeError:
        return Groq(api_key=GROQ_API_KEY)


def _r(value, digits: int = 2):
    """Round before the LLM sees it. Handed 49.716739 a model will quote
    '49.716739%' back verbatim; handed 49.72 it quotes something readable."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return round(float(value), digits)
    return value


def build_brief(eda: dict, forecast: dict, leaderboard: dict, question: str | None) -> dict:
    """Compact, number-dense context for the model. Kept small on purpose."""
    overview = eda["overview"]
    fc_models = {m["key"]: m for m in leaderboard["forecast"]["models"]}
    recent_year = {k: _r(v) for k, v in eda["yearly"][-1].items()}

    return {
        "instrument": "Adani Enterprises (ADANIENT)",
        "history": {
            "period": f"{overview['start_date']} to {overview['end_date']}",
            "trading_days": overview["rows"],
            "first_close_rs": _r(overview["first_close"]),
            "last_close_rs": _r(overview["last_close"]),
            "total_return_pct": _r(overview["total_return_pct"], 0),
            "cagr_pct": _r(overview["cagr_pct"], 1),
            "annualised_volatility_pct": _r(overview["annualised_volatility_pct"], 1),
            "max_drawdown_pct": _r(overview["max_drawdown_pct"], 1),
            "max_drawdown_date": overview["max_drawdown_date"],
            "all_time_high_rs": _r(overview["all_time_high"]),
            "all_time_high_date": overview["all_time_high_date"],
            "positive_days_pct": _r(overview["positive_days_pct"], 1),
            "worst_day": {
                "date": overview["worst_day"]["date"],
                "return_pct": _r(overview["worst_day"]["return_pct"], 1),
            },
        },
        "recent_year": recent_year,
        "next_day_forecast": {
            "anchor_date": forecast["anchor"]["date"],
            "anchor_close_rs": _r(forecast["anchor"]["close"]),
            "consensus_close_rs": _r(forecast["consensus"]["close"]),
            "consensus_return_pct": _r(forecast["consensus"]["return_pct"]),
            "agreement": forecast["consensus"]["agreement"],
            "by_model": [
                {
                    "model": p["label"],
                    "predicted_close_rs": _r(p["predicted_close"]),
                    "predicted_return_pct": _r(p["predicted_return_pct"]),
                }
                for p in forecast["predictions"]
            ],
        },
        "model_scores_on_holdout": {
            "split_date": leaderboard["forecast"]["split_date"],
            "test_days": leaderboard["forecast"]["test_rows"],
            "naive_baseline_rmse_rs": _r(leaderboard["forecast"]["naive_rmse"]),
            "models": [
                {
                    "model": fc_models[k]["label"],
                    "rmse_rs": round(fc_models[k]["rmse"], 2),
                    "mae_rs": round(fc_models[k]["mae"], 2),
                    "mape_pct": round(fc_models[k]["mape"], 2),
                    "directional_accuracy_pct": round(fc_models[k]["directional_accuracy"], 1),
                    "beats_naive_baseline": fc_models[k]["beats_naive"],
                }
                for k in fc_models
            ],
        },
        "top_features": [
            f["feature"] for f in fc_models["random_forest"]["importances"][:5]
        ],
        "known_limitations": [
            "No trading volume, fundamentals, news or index context in the dataset.",
            "Data ends 2023-01-30, immediately after a major drawdown.",
            "The 'modi' regime flag in the source CSV is interleaved, not a clean "
            "chronological split, so it is a weak feature.",
        ],
        "user_question": question or "Give an overall stance on this stock.",
    }


def _rule_based(brief: dict) -> dict:
    """Deterministic fallback. Same shape as the LLM response."""
    fc = brief["next_day_forecast"]
    scores = brief["model_scores_on_holdout"]
    hist = brief["history"]
    recent = brief["recent_year"]

    ret = fc["consensus_return_pct"]
    best = min(scores["models"], key=lambda m: m["rmse_rs"])
    any_beats_naive = any(m["beats_naive_baseline"] for m in scores["models"])
    directional = best["directional_accuracy_pct"]

    if ret > 1.0 and directional > 52:
        stance = "ACCUMULATE"
    elif ret < -1.0:
        stance = "REDUCE"
    elif recent["return_pct"] < -20 and hist["annualised_volatility_pct"] > 45:
        stance = "AVOID"
    else:
        stance = "HOLD"

    confidence = "low" if (not any_beats_naive or directional < 53) else "medium"

    return {
        "stance": stance,
        "confidence": confidence,
        "headline": (
            f"Models point to a {ret:+.2f}% next-day move from Rs.{fc['anchor_close_rs']:,.2f}, "
            f"with {fc['agreement']} agreement."
        ),
        "rationale": [
            f"Consensus next-day close is Rs.{fc['consensus_close_rs']:,.2f} versus the "
            f"{fc['anchor_date']} close of Rs.{fc['anchor_close_rs']:,.2f} ({ret:+.2f}%).",
            f"{best['model']} is the strongest model on the hold-out set: RMSE "
            f"Rs.{best['rmse_rs']:,.2f}, MAPE {best['mape_pct']:.2f}%, directional accuracy "
            f"{best['directional_accuracy_pct']:.1f}%.",
            f"Over {hist['period']} the stock compounded at {hist['cagr_pct']:.1f}% a year "
            f"but with {hist['annualised_volatility_pct']:.1f}% annualised volatility.",
            f"The most recent year in the data returned {recent['return_pct']:+.1f}% at "
            f"{recent['volatility_pct']:.1f}% volatility.",
        ],
        "risks": [
            f"Maximum drawdown in the sample was {hist['max_drawdown_pct']:.1f}% "
            f"(trough {hist['max_drawdown_date']}) - position sizing matters more than the point estimate.",
            (
                "No model beat the naive 'tomorrow equals today' baseline on RMSE, so the "
                "price level itself is close to a random walk."
                if not any_beats_naive
                else "Hold-out gains over the naive baseline are small and may not persist."
            ),
            "The dataset has no volume, fundamentals or news, and stops at 2023-01-30.",
        ],
        "model_view": (
            f"{fc['agreement']} of the three models agree on direction; {best['model']} has the "
            f"lowest hold-out error and is the one to weight most."
        ),
        "engine": "rule-based",
        "disclaimer": DISCLAIMER,
    }


def _coerce(payload: dict) -> dict:
    """Normalise whatever the LLM returned into the response contract."""
    stance = str(payload.get("stance", "HOLD")).strip().upper()
    if stance not in STANCES:
        stance = "HOLD"

    confidence = str(payload.get("confidence", "low")).strip().lower()
    if confidence not in ("low", "medium", "high"):
        confidence = "low"

    def as_list(value, limit):
        if isinstance(value, str):
            value = [value]
        if not isinstance(value, list):
            return []
        return [str(v).strip() for v in value if str(v).strip()][:limit]

    return {
        "stance": stance,
        "confidence": confidence,
        "headline": str(payload.get("headline", "")).strip()[:200],
        "rationale": as_list(payload.get("rationale"), 4),
        "risks": as_list(payload.get("risks"), 3),
        "model_view": str(payload.get("model_view", "")).strip(),
    }


def recommend(eda: dict, forecast: dict, leaderboard: dict, question: str | None = None) -> dict:
    """Produce a recommendation, via Groq when configured and rules otherwise."""
    brief = build_brief(eda, forecast, leaderboard, question)

    if not GROQ_API_KEY:
        result = _rule_based(brief)
        result["note"] = (
            "GROQ_API_KEY is not set, so the deterministic rule-based engine was used. "
            "Add a key to backend/.env for LLM-written commentary."
        )
        return result

    try:
        completion = _client().chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(brief, default=str)},
            ],
            temperature=0.2,
            max_tokens=1200,
            response_format={"type": "json_object"},
        )
        payload = json.loads(completion.choices[0].message.content)
        result = _coerce(payload)
        result["engine"] = f"groq:{GROQ_MODEL}"
        result["disclaimer"] = DISCLAIMER
        return result

    except Exception as exc:  # noqa: BLE001 - the dashboard must never go dark
        result = _rule_based(brief)
        result["note"] = f"Groq call failed ({type(exc).__name__}), fell back to rules."
        return result
