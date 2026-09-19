"""The Growth Orchestrator.

One agent holds the objective and the guardrail. It is the only component with a
goal; everything else is a tool it may call. That is the product's whole premise:
the user does not ask for a variant, they state an outcome and a constraint, and
the agent decides what to look at.

Deterministic work stays out of the model (PLAN §2.2). Every figure the agent
cites was computed in SQL and handed to it by a tool — it may quote, never
calculate.
"""
from __future__ import annotations

import logging
import re
import sys
import time
import warnings

# The Gemini client closes its async transport after the loop has gone, which
# produces a wall of "Event loop is closed" tracebacks that bury the actual
# result. Nothing is leaked; it is noise at exit.
logging.getLogger("asyncio").setLevel(logging.CRITICAL)
warnings.filterwarnings("ignore", category=RuntimeWarning)

from strands import Agent

from . import run_log
from .config import MAX_ITERATIONS, MODEL_CHAIN, WALL_CLOCK_S
from .model import build_model
from .tools import (
    ToolBudgetExceeded,
    propose_experiment,
    record_opportunity,
    reset_budget,
    get_experiment_history,
    get_funnel,
    get_heatmap,
    get_page_dom,
    get_session_digest,
)

SYSTEM_PROMPT = """You are the growth engineer for a website. You hold one objective and one guardrail.

OBJECTIVE: increase signup conversion from 3% to 4%.
GUARDRAIL: lead quality must not fall below 95% of baseline. You may never trade
this away for conversions.

You are looking at a single-page site. Your job right now is to work out **where
the objective is leaking and why**, using the tools available.

How to work:

You have a limited number of tool calls, so be economical. Four segments is
enough to find the problem: device=mobile, device=desktop, outcome=bounced and
outcome=converted. Do not enumerate every combination before deciding anything —
gather what you need, then record what you found.

1. Start broad, then narrow. Compare segments against each other — a number is
   only interesting relative to another number.
2. Every claim you make must come from a tool result. Quote the figure and say
   which segment it came from. If you cannot source a number, do not state it.
3. Distinguish "they never saw it" from "they saw it and did nothing". These have
   completely different remedies and the data can tell them apart. Check the
   funnel before claiming either: if cta_viewed equals arrived, then everyone
   saw it and the problem is not visibility, however far down the page it sits.
   Being below the fold and being unseen are not the same thing.
4. Check the session digests: they describe how groups behaved, not just totals.
5. Do not propose a fix yet. Diagnose first.

When you have found something, call `record_opportunity`. Every figure you cite
is checked against the stored data before it is accepted — if a number does not
match, you will be told which citation failed and you should correct it and try
again rather than softening the claim.

Record **two or three** distinct opportunities, strongest first. Do this as soon
as you have enough to support one — do not keep gathering. A good one names
a specific element or segment and quantifies the gap. A weak one restates a
general principle.

Once you have recorded an opportunity, propose an experiment to address the
strongest one.

Before you propose anything, call `get_experiment_history`. Previous experiments
have already settled some questions, and re-testing them wastes traffic. If a
prior learning supports your idea, cite it. If a prior learning says a change did
nothing, do not propose that change again.

Call `get_page_dom` and copy selectors from it exactly. Then call
`propose_experiment` with a falsifiable hypothesis and one or two variants.
Keep each variant to two to four mutations: fewer, well-chosen changes are easier
to interpret than many at once.

Then finish with:

FINDING: one sentence naming the single biggest problem.
HYPOTHESIS: what you are testing and what would disprove it.
LIKELY CAUSE: one or two sentences in plain language, as you would say it to a
marketer who has not seen the data.
"""


_TRANSIENT = (
    "429", "503", "resource_exhausted", "unavailable",
    "quota", "exceeded", "rate limit", "high demand", "try again",
)


def _is_transient(message: str) -> bool:
    lowered = message.lower()
    return any(marker in lowered for marker in _TRANSIENT)


def run(trigger: str = "manual") -> int:
    reset_budget()
    run_id = run_log.start_run(trigger)
    print(f"▸ run {run_id}")
    started = time.time()

    tools = [get_heatmap, get_funnel, get_session_digest, get_page_dom,
             get_experiment_history, record_opportunity, propose_experiment]

    def _retry_after(message: str) -> float:
        """Gemini says how long to wait. The free-tier limit is per minute, not
        per day, so waiting is usually the right answer — giving up on a 36
        second pause wastes a run that would have succeeded."""
        match = re.search(r"retry in ([\d.]+)s", message)
        return min(75.0, float(match.group(1)) + 3) if match else 0.0

    last_error: Exception | None = None
    # Two passes over the chain: the first spills across models, the second
    # waits out a per-minute window if every model is rate-limited at once.
    for attempt in range(len(MODEL_CHAIN) * 2):
        model, name = build_model(attempt % len(MODEL_CHAIN))
        print(f"  model {name}")
        try:
            agent = Agent(model=model, tools=tools, system_prompt=SYSTEM_PROMPT)
            result = agent(
                "Diagnose where this page is losing signups. Compare mobile "
                "against desktop, and converted visitors against bounced ones. "
                "Record the strongest opportunity you find, citing exact "
                "figures from the tools. Then check what previous experiments "
                "already proved, and propose an experiment to fix it."
            )
            elapsed = time.time() - started
            text = str(result)
            run_log.record_model(name, len(SYSTEM_PROMPT), len(text), int(elapsed * 1000))
            run_log.finish_run("succeeded")

            print(f"\n{text}\n")
            print(f"▸ {len(run_log.steps())} steps in {elapsed:.1f}s")
            for step in run_log.steps():
                mark = "✗" if step.get("error") else "✓"
                print(f"  {mark} {step['tool']:<18} {step.get('summary', '')[:78]}")
            return 0
        except ToolBudgetExceeded as exc:
            # A budget stop is a real answer: the agent went round in circles.
            run_log.finish_run("failed", str(exc))
            print(f"✗ stopped after {len(run_log.steps())} tool calls: {exc}")
            return 1
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            message = str(exc)
            print(f"  {name} failed: {message[:140]}")
            if time.time() - started > WALL_CLOCK_S:
                break
            # Quota and capacity are per model, so both are answered by moving
            # down the chain. Match on the human-readable text as well as the
            # status codes: the SDK surfaces the prose, not the code, and
            # matching only on "429" meant spillover never fired at all.
            if not _is_transient(message):
                break
            wait = _retry_after(message)
            if attempt >= len(MODEL_CHAIN) - 1 and wait:
                print(f"  every model rate-limited; waiting {wait:.0f}s")
                time.sleep(wait)
            else:
                # A per-minute quota clears quickly; pause briefly before the
                # next model so the chain is not spent in three seconds.
                time.sleep(2)

    run_log.finish_run("failed", str(last_error) if last_error else "unknown")
    print(f"✗ run failed: {last_error}")
    return 1


if __name__ == "__main__":
    sys.exit(run(sys.argv[1] if len(sys.argv) > 1 else "manual"))
