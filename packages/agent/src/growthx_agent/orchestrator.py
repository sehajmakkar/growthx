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
    get_rejection_feedback,
    get_experiment_results,
    write_learning,
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

Before you propose anything, call `get_experiment_history` and
`get_rejection_feedback`. Previous experiments
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


EVALUATOR_PROMPT = """You are reading the result of a finished A/B test and
writing down what it proved.

The figures have already been computed. You are not being asked to calculate
anything — not a lift, not a percentage, not a difference between two arms. If
you find yourself doing arithmetic, stop and quote the number that was given to
you instead.

Read the decision line first and let it govern everything you write.

  NOT YET DECISIVE means neither arm won. It does not mean "probably the
  challenger". A gap that looks large is exactly what an underpowered
  experiment produces, and saying otherwise is the single most damaging thing
  this product could do. Do not use the words win, won, beat, better or
  improvement about a result that is not decisive.

  A row marked UNDERPOWERED is not evidence. You may say what it suggests and
  what it would take to find out. You may not draw a conclusion from it.

Then call `get_session_digest` and, where it helps, `get_heatmap`, to say *why*
the arms behaved the way they did. The numbers say what happened; the digests
describe how people moved through the page. Ground your explanation in them.

Look hard at the per-device rows before you write anything. The interesting
result is usually not the overall number — it is two segments moving in
*opposite* directions, which an overall average hides completely. If one device
went up while the other went down, that is the finding, and it is worth saying
even when neither row is powered enough to prove it.

Finally call `write_learning`. The outcome, effect size and confidence are taken
from the computed result, not from your sentence — what you supply is the
generalisation.

The generalisation is a sentence about **the site and its audience**, not about
the experiment. Do not restate the decision: the decision is already stored
beside your sentence, and repeating it there wastes the one field that is meant
to carry knowledge forward. Never begin with "The experiment...".

  bad:  "The CTA was moved up and conversion rose 2%."
        (a changelog entry — tells the next run nothing)
  bad:  "The experiment was inconclusive due to insufficient sample size."
        (restates the decision, which is already recorded)
  good: "On mobile, this audience does not scroll past 280px of supporting copy
         to reach a call to action."
  good: "Moving the CTA above the supporting copy appears to help phones and
         hurt desktop, so this change should be targeted by device rather than
         applied to the whole page."

A useful inconclusive learning names what was observed and what it would take to
settle it — not merely that it was not settled.

Then finish with:

WHAT HAPPENED: one sentence, with the figures.
WHY: one or two sentences grounded in the digests, in plain language.
WHAT IT MEANS: what someone should do differently now.
"""


def _drive(tools, system_prompt: str, task: str, trigger: str) -> int:
    """The model-chain loop, shared by both modes.

    Quota and capacity on the free tier are per model, so a failure on one is
    answered by moving to the next; two passes over the chain, because if every
    model is limited at once the right move is to wait out the per-minute
    window rather than give up.
    """
    reset_budget()
    run_id = run_log.start_run(trigger)
    print(f"▸ run {run_id}")
    started = time.time()

    def _retry_after(message: str) -> float:
        """Gemini says how long to wait. The free-tier limit is per minute, not
        per day, so waiting is usually the right answer — giving up on a 36
        second pause wastes a run that would have succeeded."""
        match = re.search(r"retry in ([\d.]+)s", message)
        return min(75.0, float(match.group(1)) + 3) if match else 0.0

    last_error: Exception | None = None
    for attempt in range(len(MODEL_CHAIN) * 2):
        model, name = build_model(attempt % len(MODEL_CHAIN))
        print(f"  model {name}")
        try:
            agent = Agent(model=model, tools=tools, system_prompt=system_prompt)
            result = agent(task)
            elapsed = time.time() - started
            text = str(result)
            run_log.record_model(name, len(system_prompt), len(text), int(elapsed * 1000))
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
            # Match on the human-readable text as well as the status codes: the
            # SDK surfaces the prose, not the code, and matching only on "429"
            # meant spillover never fired at all.
            if not _is_transient(message):
                break
            wait = _retry_after(message)
            if attempt >= len(MODEL_CHAIN) - 1 and wait:
                print(f"  every model rate-limited; waiting {wait:.0f}s")
                time.sleep(wait)
            else:
                time.sleep(2)

    run_log.finish_run("failed", str(last_error) if last_error else "unknown")
    print(f"✗ run failed: {last_error}")
    return 1


def run(trigger: str = "manual") -> int:
    """Diagnose, then propose."""
    return _drive(
        [get_heatmap, get_funnel, get_session_digest, get_page_dom,
         get_experiment_history, get_rejection_feedback,
         record_opportunity, propose_experiment],
        SYSTEM_PROMPT,
        "Diagnose where this page is losing signups. Compare mobile "
        "against desktop, and converted visitors against bounced ones. "
        "Record the strongest opportunity you find, citing exact "
        "figures from the tools. Then check what previous experiments "
        "already proved, and propose an experiment to fix it.",
        trigger,
    )


def evaluate(experiment_id: str) -> int:
    """Read a finished experiment and write down what it proved."""
    return _drive(
        [get_experiment_results, get_session_digest, get_heatmap, write_learning],
        EVALUATOR_PROMPT,
        f"Read the result of experiment {experiment_id}. Call "
        f"get_experiment_results first and let the decision line govern what you "
        f"may claim. Explain why the arms behaved as they did, grounded in the "
        f"session digests. Then write the learning.",
        "evaluate",
    )


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "evaluate":
        if len(args) < 2:
            print("usage: python -m growthx_agent.orchestrator evaluate <experimentId>")
            sys.exit(2)
        sys.exit(evaluate(args[1]))
    sys.exit(run(args[0] if args else "manual"))
