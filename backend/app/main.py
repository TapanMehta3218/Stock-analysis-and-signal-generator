"""FastAPI service backing the Adani Enterprises dashboard."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import groq_advisor
from .config import CORS_ORIGINS, GROQ_API_KEY, GROQ_MODEL, PROJECT_ROOT
from .predictor import ArtifactsMissing, registry

app = FastAPI(
    title="Adani Enterprises Stock Intelligence API",
    description=(
        "EDA, three-model price prediction (KNN / Random Forest / XGBoost) and a "
        "Groq-written recommendation over the 2016-2023 ADANIENT dataset."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _guard(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ArtifactsMissing as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #
class PredictRequest(BaseModel):
    open_price: float = Field(..., gt=0, le=1_000_000, description="Today's opening price in Rs.")
    regime: int = Field(1, ge=0, le=1, description="1 = 'w' regime flag, 0 = 'l'")


class ForecastRequest(BaseModel):
    regime: int | None = Field(None, ge=0, le=1)


class RecommendRequest(BaseModel):
    question: str | None = Field(None, max_length=500)
    regime: int | None = Field(None, ge=0, le=1)


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.get("/api/health", tags=["meta"])
def health():
    return {
        "status": "ok" if registry.ready() else "artifacts_missing",
        "artifacts_ready": registry.ready(),
        "groq_configured": bool(GROQ_API_KEY),
        "groq_model": GROQ_MODEL if GROQ_API_KEY else None,
    }


@app.get("/api/overview", tags=["eda"])
def overview():
    eda = _guard(lambda: registry.eda)
    board = _guard(registry.leaderboard)
    return {
        "overview": eda["overview"],
        "latest": registry.metrics["latest"],
        "best_model": board["best_model"],
        "trained_at": board["generated_at"],
    }


@app.get("/api/eda", tags=["eda"])
def eda(section: str | None = Query(None, description="Return a single section only")):
    payload = _guard(lambda: registry.eda)
    if section:
        if section not in payload:
            raise HTTPException(404, f"unknown section '{section}'. "
                                     f"Available: {', '.join(payload)}")
        return {section: payload[section]}
    return payload


@app.get("/api/prices", tags=["eda"])
def prices(
    limit: int = Query(0, ge=0, le=5000, description="Most recent N rows; 0 = all"),
    every: int = Query(1, ge=1, le=30, description="Keep every Nth row (downsampling)"),
):
    series = _guard(lambda: registry.eda)["price_series"]
    if limit:
        series = series[-limit:]
    if every > 1:
        # Always keep the final row so the chart ends on the latest close.
        series = series[::every] + ([series[-1]] if (len(series) - 1) % every else [])
    return {"count": len(series), "series": series}


@app.get("/api/models", tags=["models"])
def models():
    return _guard(registry.leaderboard)


@app.post("/api/predict", tags=["models"])
def predict(request: PredictRequest):
    """Today's Close / High / Low from today's Open, by all three models."""
    return _guard(registry.predict_intraday, request.open_price, request.regime)


@app.post("/api/forecast", tags=["models"])
def forecast(request: ForecastRequest | None = None):
    """Next trading day's close, anchored on the last row of the dataset."""
    return _guard(registry.predict_next_day, request.regime if request else None)


@app.post("/api/recommend", tags=["advisor"])
def recommend(request: RecommendRequest | None = None):
    """Groq-written stance over the EDA + model outputs (rule-based fallback)."""
    question = request.question if request else None
    regime = request.regime if request else None

    eda_payload = _guard(lambda: registry.eda)
    forecast_payload = _guard(registry.predict_next_day, regime)
    board = _guard(registry.leaderboard)

    result = groq_advisor.recommend(eda_payload, forecast_payload, board, question)
    result["forecast"] = forecast_payload
    return result


# --------------------------------------------------------------------------- #
# Optionally serve the built React app so the whole thing runs on one port
# --------------------------------------------------------------------------- #
DIST = PROJECT_ROOT / "frontend" / "dist"
if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str = ""):
        candidate = DIST / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
