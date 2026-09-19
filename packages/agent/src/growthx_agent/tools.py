"""The orchestrator's tools.

Every one is a thin HTTP call into the API. Nothing here computes anything: the
agent decides *what* to look at and *why*, and the tools return numbers that were
calculated in SQL (PLAN §2.2). If a statistic were ever computed inside a tool
call the model could influence it, and the evidence trail would stop meaning
anything.

Each call is recorded on the run log, so a human can check the agent's reasoning
against exactly what it was shown rather than taking its word.

Note on signatures: none of these take default values. Strands emits a `default`
key in the JSON schema for any defaulted parameter, and Gemini's function-calling
schema is a strict OpenAPI subset that rejects it — every tool with a default was
refused with an argument-parsing error, while the one without defaults worked
fine. Arguments are therefore required and the docstrings say what to pass.
"""
from __future__ import annotations

import json
import time
from typing import Any

import httpx
from strands import tool

from .config import API_BASE, SITE_ID
from .run_log import record_step

_client = httpx.Client(timeout=30.0)

class ToolBudgetExceeded(BaseException):
    """Stops a runaway loop.

    Deliberately a BaseException rather than an Exception: agent frameworks
    catch Exception around tool calls and hand the error back to the model,
    which then simply tries again. The first two runs made 27 and then 118 tool
    calls before giving up, burning most of a day's free-tier quota. This
    propagates out of the agent loop instead.
    """


_MAX_CALLS = 24
_calls = {"n": 0}


def reset_budget() -> None:
    _calls["n"] = 0


def _get(endpoint: str, **params: Any) -> Any:
    """`endpoint` is named so deliberately: it used to be `path`, which collided
    with the tools' own `path` argument and raised "got multiple values for
    argument 'path'" on every parameterised call. The agent saw only a tool
    error and retried, which looked like a model problem and was not."""
    _calls["n"] += 1
    if _calls["n"] > _MAX_CALLS:
        raise ToolBudgetExceeded(f"{_MAX_CALLS} tool calls without reaching a conclusion")
    params.setdefault("site", SITE_ID)
    started = time.time()
    url = f"{API_BASE}{endpoint}"
    try:
        response = _client.get(url, params=params)
        response.raise_for_status()
        payload = response.json()
        error = None
    except Exception as exc:  # noqa: BLE001 — a failed tool must not kill the run
        payload = {"error": str(exc)}
        error = str(exc)
    record_step(
        tool=endpoint.rsplit("/", 1)[-1],
        params=params,
        result=payload,
        ms=int((time.time() - started) * 1000),
        error=error,
    )
    return payload


def _fmt_heatmap(d: Any) -> str:
    if not isinstance(d, dict) or "elements" in d and not d.get("elements"):
        return f"No data for that segment. {d.get('error', '')}".strip()
    if "error" in d:
        return f"error: {d['error']}"

    lines = [f"segment={d.get('segment')} sessions={d.get('sessions')}"]
    funnel = " → ".join(f"{s['step']}={s['sessions']}" for s in d.get("funnel", []))
    if funnel:
        lines.append(f"funnel: {funnel}")
    bands = "  ".join(f"{b['depth_pct']}%:{b['reach_pct']}%" for b in d.get("scroll_bands", []))
    if bands:
        lines.append(f"scroll reach: {bands}")

    els = d.get("elements", [])
    # Interesting means seen a lot and acted on little, or generating friction —
    # ranking by raw views would hand back the page header every time.
    def score(e: dict[str, Any]) -> float:
        views = e.get("views") or 0
        inaction = 1 - min(1.0, (e.get("click_rate_pct") or 0) / 30)
        friction = (e.get("rage_clicks") or 0) * 3 + (e.get("dead_clicks") or 0)
        return (views ** 0.5) * inaction + friction * 2

    lines.append("elements (selector | saw% | clicked% | seconds-to-first-view | friction):")
    for e in sorted(els, key=score, reverse=True)[:12]:
        fr = ""
        if e.get("rage_clicks") or e.get("dead_clicks"):
            fr = f" rage={e.get('rage_clicks', 0)} dead={e.get('dead_clicks', 0)}"
        lines.append(
            f"  {e['selector']} | {e.get('viewed_pct')}% | {e.get('click_rate_pct')}%"
            f" | {e.get('median_time_to_first_view_s')}s{fr}"
        )
    for f in d.get("friction", [])[:4]:
        lines.append(f"friction: {f['type']} x{f['count']} on {f['selector']}")
    return "\n".join(lines)


@tool
def get_heatmap(segment: str, path: str) -> str:
    """Per-element behaviour for a page and audience segment.

    Returns, for every element: what share of that segment saw it, what share of
    those who saw it clicked it, how long before they first saw it, plus scroll
    depth, friction signals and the funnel.

    Args:
        segment: required. One of "all", "device=mobile", "device=desktop",
            "visitor=new", "visitor=returning", "outcome=converted",
            "outcome=bounced", "device=mobile|outcome=bounced",
            "device=mobile|visitor=new".
        path: required. The page path. Always "/" on this site.
    """
    return _fmt_heatmap(_get("/api/heatmap", segment=segment, path=path))


@tool
def get_funnel(segment: str, path: str) -> str:
    """How many of a segment arrived, saw the call to action, clicked it, converted.

    Args:
        segment: required. An audience segment, as listed in get_heatmap.
        path: required. Always "/" on this site.
    """
    d = _get("/api/funnel", segment=segment, path=path)
    steps = d.get("steps", []) if isinstance(d, dict) else []
    if not steps:
        return f"No funnel data for {segment}."
    return f"{segment}: " + " → ".join(f"{s['step']}={s['sessions']}" for s in steps)


@tool
def get_session_digest(path: str) -> str:
    """Short behavioural narratives for each cluster of sessions.

    Clusters are computed deterministically; the prose describes them. Useful for
    understanding *how* a group behaved rather than only what the totals were.

    Args:
        path: required. Always "/" on this site.
    """
    d = _get("/api/digests", path=path)
    clusters = d.get("clusters", []) if isinstance(d, dict) else []
    if not clusters:
        return "No session digests yet."
    return "\n".join(
        f"[{c['session_count']} sessions] {c['signature']}\n  {c['narrative']}"
        for c in clusters[:8]
    )


@tool
def get_page_dom(path: str) -> str:
    """The page's structure: every element, its selector, text, size and whether
    it sits above the fold on mobile and on desktop.

    Selectors returned here are the only ones that may be targeted by a variant.

    Args:
        path: required. Always "/" on this site.
    """
    d = _get("/api/snapshot", path=path)
    els = d.get("elements", []) if isinstance(d, dict) else []
    if not els:
        return "No page outline captured."
    lines = [f"{len(els)} elements. selector | kind | text | mobile-fold | desktop-fold"]
    for e in els[:60]:
        kind = "interactive" if e.get("isInteractive") else ("container" if e.get("childCount") else "text")
        text = (e.get("textSample") or "")[:60]
        lines.append(
            f"  {e['path']} | {kind} | \"{text}\" | "
            f"{'above' if e.get('aboveFoldAt390') else 'BELOW'} | "
            f"{'above' if e.get('aboveFoldAt1440') else 'BELOW'}"
        )
    return "\n".join(lines)


@tool
def get_experiment_history() -> str:
    """Everything previous experiments proved, as one-sentence generalisations.

    Call this before proposing any hypothesis. It is how the agent avoids
    re-testing questions that are already settled.
    """
    d = _get("/api/learnings")
    items = d.get("learnings", []) if isinstance(d, dict) else []
    if not items:
        return "No previous experiments. Nothing has been proved on this site yet."
    return "\n".join(
        f"- {l['generalisation']} (segment: {l.get('segment')}, outcome: {l.get('outcome')})"
        for l in items
    )


@tool
def get_rejection_feedback() -> str:
    """Why a human turned down your previous proposals.

    Call this before propose_experiment, together with get_experiment_history.
    A rejection is not a dead end: it names something about the proposal a
    person was not willing to put in front of visitors. Read the reasons and do
    not repeat the same shape of change.
    """
    d = _get("/api/feedback")
    items = d.get("rejections", []) if isinstance(d, dict) else []
    if not items:
        return "No proposals have been rejected. Nothing to avoid yet."
    return "\n".join(
        f"- REJECTED by {r.get('decided_by')}: {r.get('rejection_reason')}\n"
        f"    (the proposal was: {str(r.get('hypothesis'))[:140]})"
        for r in items
    )


def _post(endpoint: str, body: dict[str, Any]) -> Any:
    _calls["n"] += 1
    if _calls["n"] > _MAX_CALLS:
        raise ToolBudgetExceeded(f"{_MAX_CALLS} tool calls without reaching a conclusion")
    started = time.time()
    try:
        response = _client.post(f"{API_BASE}{endpoint}", json={**body, "site": SITE_ID})
        payload = response.json()
        error = None if response.status_code < 400 else str(payload)[:200]
    except Exception as exc:  # noqa: BLE001
        payload = {"error": str(exc)}
        error = str(exc)
    record_step(
        tool=endpoint.rsplit("/", 1)[-1],
        params={k: v for k, v in body.items() if k != "evidence"},
        result=payload, ms=int((time.time() - started) * 1000), error=error,
    )
    return payload


@tool
def record_opportunity(
    title: str, body: str, confidence: str, segment: str, evidence_json: str
) -> str:
    """Record a conversion problem you have found, with the evidence for it.

    Every figure you cite is checked against the stored data before this is
    accepted. If a number does not match, the opportunity is rejected and you
    are told which citation failed — fix it and call this again.

    Args:
        title: required. One sentence naming the problem, with its key figure.
        body: required. Two or three sentences a marketer would accept, saying
            what is happening and why it matters.
        confidence: required. "high", "medium" or "low".
        segment: required. The audience segment this is about, e.g. "device=mobile".
        evidence_json: required. A JSON array of at least 3 objects, each with
            "kind", "label", "value" and "sourceRef". sourceRef must be one of:
              heatmap:<segment>:<selector>:<field>   e.g. heatmap:device=mobile:a.cta-primary.btn-solid:click_rate_pct
              funnel:<segment>:<step>                e.g. funnel:device=mobile:converted
              scroll:<segment>:<depth>               e.g. scroll:device=mobile:75
              digest:<signature>                     e.g. digest:mobile | stopped-before-pricing | brief | bounced
            The "value" must be the figure exactly as the tool returned it.
    """
    try:
        evidence = json.loads(evidence_json)
    except json.JSONDecodeError as exc:
        return f"evidence_json is not valid JSON: {exc}. Return a JSON array."

    result = _post("/api/opportunities", {
        "title": title, "body": body, "confidence": confidence,
        "segmentKey": segment, "evidence": evidence, "path": "/",
    })

    if result.get("stored"):
        return f"Recorded. {len(evidence)} evidence items, all verified against stored data."
    errors = result.get("errors") or [str(result)[:200]]
    return ("REJECTED — the evidence does not match the data:\n"
            + "\n".join(f"  - {e}" for e in errors[:6])
            + "\nQuote the figures exactly as the tools returned them, then call this again.")


@tool
def propose_experiment(
    hypothesis: str, cited_learnings: str, variants_json: str
) -> str:
    """Propose an experiment: a falsifiable hypothesis and one or two variants.

    Every selector is checked against the live page outline before anything is
    stored. If a selector does not resolve you are told which one and given the
    closest real alternatives — fix it and call this again.

    You must cite prior learnings. Call get_experiment_history first. If none
    apply, pass "none" and say why in the hypothesis.

    Args:
        hypothesis: required. A falsifiable statement naming the segment, the
            change, the metric and the expected direction. State what would
            disprove it.
        cited_learnings: required. Comma-separated learning ids from
            get_experiment_history, or "none".
        variants_json: required. A JSON array of 1-2 objects, each with "label",
            "rationale" and "mutations". Mutations use only these operations:
              {"op":"replace_text","selector":"...","value":"...","note":"..."}
              {"op":"set_style","selector":"...","props":{...},"note":"..."}
              {"op":"set_media_style","selector":"...","media":"mobile","props":{...},"note":"..."}
              {"op":"hide","selector":"...","note":"..."}
              {"op":"move_before","selector":"...","target":"...","note":"..."}
              {"op":"move_after","selector":"...","target":"...","note":"..."}
            Selectors must be copied exactly from get_page_dom. Never target a
            container — its text belongs to its children. Never touch pricing.
    """
    try:
        variants = json.loads(variants_json)
    except json.JSONDecodeError as exc:
        return f"variants_json is not valid JSON: {exc}"

    cited = [c.strip() for c in cited_learnings.split(",") if c.strip()]
    result = _post("/api/experiments", {
        "hypothesis": hypothesis,
        "citedLearnings": cited,
        "variants": variants,
        "path": "/",
    })

    if result.get("stored"):
        summary = ", ".join(
            f"{v['label']} ({v['mutations']} mutations, {v['selectorsMatched']} selectors verified)"
            for v in result.get("variants", [])
        )
        return f"Experiment {result['experimentId']} created as a draft. {summary}"
    errors = result.get("errors") or [str(result)[:200]]
    return ("REJECTED:\n" + "\n".join(f"  - {e}" for e in errors[:6])
            + "\nCorrect these and call propose_experiment again.")


@tool
def get_experiment_results(experiment_id: str) -> str:
    """What an experiment actually showed: per-arm conversion rates with
    confidence intervals, the difference and its interval, a per-device
    breakdown, and whether the guardrail held.

    Every figure is already computed. Do not calculate anything from these
    numbers — not a lift, not a percentage, not a difference between two arms.
    Quote them exactly as written here. If you need a figure that is not
    present, say that it is not available rather than working it out.

    Read the decision line first. If it says NOT YET DECISIVE, you may not
    describe either arm as winning, however large the gap looks.

    Args:
        experiment_id: required. The experiment id, e.g. exp_hero_cta_placement.
    """
    d = _get("/api/results", experimentId=experiment_id)
    if isinstance(d, dict) and d.get("error"):
        return f"error: {d['error']}"
    return d.get("text") or json.dumps(d)[:4000]


@tool
def write_learning(
    experiment_id: str, generalisation: str, change_summary: str, segment: str, tags: str
) -> str:
    """Record what this experiment proved, for the next one to retrieve.

    The outcome, the effect size, the interval and the confidence are taken
    from the computed result — not from what you write here. You supply the one
    sentence that generalises: what someone should believe about this site now
    that they did not before.

    Write it so it is still useful on a different page. "The CTA moved up and
    conversion rose 2%" is a changelog entry. "On mobile, this audience does
    not scroll past 280px of supporting copy to reach a call to action" is a
    learning.

    If the result was not decisive, say so in the sentence. An honest
    inconclusive learning stops the next run re-testing the same question at
    the same size.

    Args:
        experiment_id: required.
        generalisation: required. One sentence, at least 30 characters.
        change_summary: required. What was actually changed, in a few words.
        segment: required. Which audience it applies to, e.g. "device=mobile"
            or "all".
        tags: required. Comma-separated, e.g. "cta,above-fold,mobile".
    """
    result = _post("/api/learnings", {
        "experimentId": experiment_id,
        "generalisation": generalisation,
        "changeSummary": change_summary,
        "segment": segment,
        "tags": [t.strip() for t in tags.split(",") if t.strip()],
    })
    if result.get("stored"):
        return (f"Recorded as {result['learningId']} — outcome {result['outcome']}, "
                f"confidence {result['confidence']} (taken from the computed result, not your text).")
    errors = result.get("errors") or [str(result)[:200]]
    return "REJECTED:\n" + "\n".join(f"  - {e}" for e in errors[:4])
