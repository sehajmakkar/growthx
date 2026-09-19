"""Model selection, with spillover across the Flash chain.

Quota and capacity are both per-model on the free tier, so a 429 or a 503 is
answered by moving to the next model rather than by waiting. Measured: a 19KB
prompt that 503s on gemini-3.6-flash is served without complaint by
gemini-3.5-flash.
"""
from __future__ import annotations

from strands.models.gemini import GeminiModel

from .config import GEMINI_API_KEY, MODEL_CHAIN


def build_model(index: int = 0) -> tuple[GeminiModel, str]:
    name = MODEL_CHAIN[min(index, len(MODEL_CHAIN) - 1)]
    model = GeminiModel(
        client_args={"api_key": GEMINI_API_KEY},
        model_id=name,
        params={"temperature": 0.6, "max_output_tokens": 4096},
    )
    return model, name
