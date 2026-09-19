// GrowthX — what the growth agent is permitted to do.
//
// This file is the authority, not documentation of it. It is evaluated by Cedar
// (the same engine behind AWS Verified Permissions) inside the API on every
// state-changing request, before anything is written. The agent cannot reach
// around it: the gate lives on the server, not in the agent's own process, so
// calling the API directly is subject to exactly these rules.
//
// Cedar is default-deny. An action with no matching `permit` is refused even if
// nothing explicitly forbids it, and any matching `forbid` beats every `permit`.
//
// Every policy is named with @id. That name is what gets stored on the decision
// and shown in the dashboard, so a refusal on screen points at the line here
// that caused it.

// ── Reading is unrestricted ─────────────────────────────────────────────────
// Analysis is not a side effect. The agent may look at anything it likes; the
// controls are on what it may change.

@id("allow-read-analytics")
permit (
  principal == Agent::"growth-orchestrator",
  action in [Action::"read_analytics", Action::"read_heatmap", Action::"read_snapshot"],
  resource
);

// ── Proposing is allowed. Launching is not ──────────────────────────────────
// Drafting an experiment changes nothing a visitor can see, so the agent does
// it unsupervised. Putting one in front of real people is a different act and
// needs a human name attached to it.

@id("allow-propose-experiment")
permit (
  principal == Agent::"growth-orchestrator",
  action in [Action::"create_experiment", Action::"generate_variants"],
  resource
);

@id("allow-launch-when-approved")
permit (
  principal == Agent::"growth-orchestrator",
  action in [Action::"launch_experiment", Action::"deploy_winner"],
  resource
);

@id("forbid-launch-without-approval")
forbid (
  principal,
  action in [Action::"launch_experiment", Action::"deploy_winner"],
  resource
)
unless { context has approvedBy && context.approvedBy != "" };

// ── Commercially sensitive regions are off limits, always ───────────────────
// Not "unless approved" — never. A growth agent that can edit its own prices
// can discount its way to a conversion win, and the experiment would be
// measuring the discount rather than the design. The page declares these
// regions itself with data-gx-deny; the snapshot records them; this decides.

@id("forbid-touching-protected-regions")
forbid (
  principal,
  action,
  resource
)
when { resource has touchesProtected && resource.touchesProtected == true };

@id("forbid-pricing-and-checkout")
forbid (
  principal,
  action,
  resource
)
when { resource has regions && (resource.regions.contains("pricing") || resource.regions.contains("checkout")) };

// ── One experiment per page at a time ───────────────────────────────────────
// Two live experiments on the same page confound each other: neither result
// can be attributed to its own change. It is also a silent failure rather than
// a loud one — the snippet applies the first experiment it finds for a path,
// so the second would sit in the dashboard marked "running", collect no
// exposures, and prove nothing.

@id("forbid-concurrent-experiment-on-path")
forbid (
  principal,
  action == Action::"launch_experiment",
  resource
)
when { resource has pathHasRunning && resource.pathHasRunning == true };

// ── Structural limits ───────────────────────────────────────────────────────
// There is no permit for these anywhere in this file, so default-deny refuses
// them. They are written out regardless: a reader should not have to prove a
// negative to find out whether the agent can delete a page.

@id("forbid-publishing-and-deleting")
forbid (
  principal,
  action in [Action::"publish_page", Action::"delete_page", Action::"edit_source"],
  resource
);
