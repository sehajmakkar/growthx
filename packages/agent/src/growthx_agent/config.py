"""Environment and model selection.

The agent runs locally against the deployed database and API (PLAN §6 P12), so
it reads the same .env and .env.local every script in this repo reads.
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]


def _load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for name in (".env", ".env.local"):
        path = ROOT / name
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            if "=" not in line or line.lstrip().startswith("#"):
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


ENV = _load_env()

API_BASE = ENV.get("GX_API_BASE", "")
SITE_ID = ENV.get("GX_SITE_ID", "site_corrick")
GEMINI_API_KEY = ENV.get("GEMINI_API_KEY", "")

# Quota is per model, so the chain roughly triples the daily allowance and also
# routes around a single model being at capacity — 3.6-flash returns 503 for
# large prompts often enough that this is not theoretical (PLAN §3.1).
MODEL_CHAIN = [
    ENV.get("GX_GEMINI_MODEL", "gemini-3.6-flash"),
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
]

# Rate-limit waiting is not the agent being stuck, so the wall clock is generous.
MAX_ITERATIONS = 12
WALL_CLOCK_S = 300
