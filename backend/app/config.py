"""Central paths and tunables for the Adani Enterprises stock ML service."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

load_dotenv(BACKEND_DIR / ".env")

DATA_CSV = Path(os.getenv("ADANI_CSV", PROJECT_ROOT / "data" / "Adani_Stock.csv"))
ARTIFACTS_DIR = BACKEND_DIR / "artifacts"
MODELS_DIR = ARTIFACTS_DIR / "models"
METRICS_JSON = ARTIFACTS_DIR / "metrics.json"
EDA_JSON = ARTIFACTS_DIR / "eda.json"

# Chronological hold-out fraction. Time series must never be shuffled: a random
# split leaks future prices into training and inflates every metric.
TEST_SIZE = 0.20
RANDOM_STATE = 42

# The three algorithms the dashboard compares. KNN is the algorithm carried over
# from the original notebook; Random Forest and XGBoost are the additions.
MODEL_KEYS = ("knn", "random_forest", "xgboost")
MODEL_LABELS = {
    "knn": "KNN",
    "random_forest": "Random Forest",
    "xgboost": "XGBoost",
}

# Groq recommendation engine
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if o.strip()
]
