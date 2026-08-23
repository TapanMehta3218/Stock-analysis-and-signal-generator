"""End-to-end smoke test for the API. Run after `python train.py`:

    python tests/test_api.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)
failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f"  {detail}" if detail else ""))
    if not condition:
        failures.append(name)


def main() -> None:
    print("GET /api/health")
    health = client.get("/api/health").json()
    check("artifacts present", health["artifacts_ready"], json.dumps(health))

    print("GET /api/overview")
    ov = client.get("/api/overview")
    check("status 200", ov.status_code == 200)
    body = ov.json()
    check("rows == 1750", body["overview"]["rows"] == 1750)
    check("has best model", "label" in body["best_model"], body["best_model"]["label"])

    print("GET /api/eda")
    eda = client.get("/api/eda").json()
    for section in ("overview", "summary", "correlation", "price_series", "yearly",
                    "monthly_returns", "return_distribution", "regime_comparison",
                    "extreme_moves"):
        check(f"section {section}", section in eda and bool(eda[section]))
    check("correlation is square",
          len(eda["correlation"]["matrix"]) == len(eda["correlation"]["labels"]))

    print("GET /api/prices?limit=200&every=2")
    pr = client.get("/api/prices", params={"limit": 200, "every": 2}).json()
    check("downsampled", 90 <= pr["count"] <= 105, f"count={pr['count']}")

    print("GET /api/models")
    board = client.get("/api/models").json()
    check("3 forecast models", len(board["forecast"]["models"]) == 3)
    check("3 intraday models", len(board["intraday"]["models"]) == 3)
    check("curves aligned",
          len(board["forecast"]["curves"]["actual"]) == len(board["forecast"]["curves"]["knn"]))
    for m in board["forecast"]["models"]:
        check(f"{m['label']} scored", m["rmse"] > 0 and 0 <= m["mape"] < 100,
              f"RMSE {m['rmse']:.2f} / dir {m['directional_accuracy']:.1f}%")

    print("POST /api/forecast")
    fc = client.post("/api/forecast", json={"regime": 1}).json()
    check("3 predictions", len(fc["predictions"]) == 3)
    check("consensus sane", 0 < fc["consensus"]["close"] < 20000,
          f"Rs.{fc['consensus']['close']}")

    print("POST /api/predict")
    pred = client.post("/api/predict", json={"open_price": 2900, "regime": 1}).json()
    check("3 predictions", len(pred["predictions"]) == 3)
    for p in pred["predictions"]:
        v = p["prediction"]
        check(f"{p['label']} low<=close<=high",
              v["low"] <= v["close"] <= v["high"] or abs(v["high"] - v["low"]) < 1e-6,
              f"L {v['low']} C {v['close']} H {v['high']}")

    print("POST /api/predict with an extreme open (clipping guard)")
    wild = client.post("/api/predict", json={"open_price": 9999, "regime": 0}).json()
    check("clipped features reported", isinstance(wild["clamped_features"], list),
          str(wild["clamped_features"]))
    check("scales with the input", wild["predictions"][0]["prediction"]["close"] > 8000,
          f"Rs.{wild['predictions'][0]['prediction']['close']}")

    print("POST /api/predict rejects bad input")
    check("negative open rejected",
          client.post("/api/predict", json={"open_price": -5}).status_code == 422)

    print("POST /api/recommend")
    rec = client.post("/api/recommend", json={"question": "Is this a good entry?"}).json()
    check("stance valid", rec["stance"] in ("ACCUMULATE", "HOLD", "REDUCE", "AVOID"),
          f"{rec['stance']} ({rec['confidence']}) via {rec['engine']}")
    check("rationale present", len(rec["rationale"]) >= 3)
    check("risks present", len(rec["risks"]) >= 2)
    check("disclaimer present", bool(rec["disclaimer"]))
    print(f"\n  headline: {rec['headline']}")

    print(f"\n{'ALL CHECKS PASSED' if not failures else 'FAILURES: ' + ', '.join(failures)}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
