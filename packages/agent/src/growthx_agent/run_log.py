"""The run log.

Every tool call the agent makes is appended here and persisted, so the dashboard
can show what the agent actually did rather than only what it concluded. This is
the difference between checking an agent's reasoning and trusting it.
"""
from __future__ import annotations

import json
import time
from typing import Any

import httpx

from .config import API_BASE, SITE_ID

_client = httpx.Client(timeout=20.0)

_run: dict[str, Any] = {"id": None, "steps": []}


def start_run(trigger: str = "manual") -> str:
    _run["id"] = f"run_{int(time.time() * 1000):x}"
    _run["steps"] = []
    _run["started"] = time.time()
    _post({"id": _run["id"], "siteId": SITE_ID, "trigger": trigger,
           "status": "running", "steps": []})
    return _run["id"]


def record_step(tool: str, params: dict[str, Any], result: Any, ms: int,
                error: str | None = None, agent: str = "analyst") -> None:
    # The full result is kept out of the log deliberately: a heatmap payload is
    # tens of kilobytes and the point of the log is the *sequence*, not a second
    # copy of data the dashboard can already show.
    summary = _summarise(result)
    _run["steps"].append({
        "agent": agent, "tool": tool, "params": params,
        "summary": summary, "ms": ms, "error": error,
        "at": time.strftime("%H:%M:%S"),
    })
    _flush("running")


def record_model(model: str, prompt_chars: int, output_chars: int, ms: int) -> None:
    _run["steps"].append({
        "agent": "orchestrator", "tool": "model", "model": model,
        "summary": f"{prompt_chars} chars in, {output_chars} out",
        "ms": ms, "at": time.strftime("%H:%M:%S"),
    })
    _flush("running")


def finish_run(status: str, error: str | None = None) -> None:
    _run["status"] = status
    _flush(status, error)


def _summarise(result: Any) -> str:
    if isinstance(result, dict):
        if "error" in result:
            return f"error: {str(result['error'])[:120]}"
        if "elements" in result:
            return (f"{result.get('sessions', '?')} sessions, "
                    f"{len(result.get('elements', []))} elements, "
                    f"{len(result.get('friction', []))} friction signals")
        if "clusters" in result:
            return f"{len(result['clusters'])} behavioural clusters"
        if "steps" in result:
            return " → ".join(f"{s['step']}={s['sessions']}" for s in result["steps"])
        if "learnings" in result:
            return f"{len(result['learnings'])} previous learnings"
        if "elements" not in result and "path" in result:
            return f"page outline, {len(result.get('elements', []))} elements"
    if isinstance(result, list):
        return f"{len(result)} rows"
    return str(result)[:120]


def _flush(status: str, error: str | None = None) -> None:
    if not _run.get("id"):
        return
    _post({
        "id": _run["id"], "siteId": SITE_ID, "status": status,
        "steps": _run["steps"], "error": error,
        "finishedAt": None if status == "running" else time.time(),
    })


def _post(body: dict[str, Any]) -> None:
    if not API_BASE:
        return
    try:
        _client.post(f"{API_BASE}/api/runs", json=body)
    except Exception:  # noqa: BLE001 — logging must never break the agent
        pass


def steps() -> list[dict[str, Any]]:
    return list(_run["steps"])
