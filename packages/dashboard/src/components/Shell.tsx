import { NavLink, Outlet } from "react-router-dom";

/**
 * The objective sits in the header on every screen, deliberately.
 *
 * The product's premise is that the agent holds a goal and a guardrail rather
 * than taking instructions one at a time. If the objective were tucked away on a
 * settings page, nothing on screen would say what the agent is actually trying
 * to do — and the whole thing would read as a variant generator with extra steps.
 */
const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/heatmaps", label: "Heatmaps" },
  { to: "/opportunities", label: "Opportunities" },
  { to: "/experiments", label: "Experiments" },
  { to: "/diff", label: "Variant diff" },
  { to: "/approvals", label: "Approvals" },
  { to: "/learnings", label: "Learnings" },
  { to: "/reports", label: "Reports" },
  { to: "/runs", label: "Run log" },
];

export function Shell() {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="0.75" y="0.75" width="18.5" height="18.5" rx="4" stroke="var(--accent)" strokeWidth="1.5" />
            <path d="M5.5 13.5 9 8l2.5 3.2L14.5 6" stroke="var(--ink)" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-display text-[0.95rem] font-semibold tracking-tight">GrowthX</span>
        </div>

        <nav className="flex flex-col gap-0.5 px-2.5 py-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                "rounded px-2.5 py-1.5 text-[0.8125rem] transition-colors " +
                (isActive
                  ? "bg-[var(--accent-soft)] font-medium text-accent"
                  : "text-muted hover:bg-base hover:text-ink")
              }
              style={{ transitionDuration: "140ms" }}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-border px-5 py-4">
          <p className="label">Site</p>
          <p className="mt-1 font-mono text-xs text-ink">corrick.example</p>
          <p className="mt-0.5 font-mono text-[0.6875rem] text-muted">site_corrick</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-surface px-8 py-4">
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <div>
              <p className="label">Objective</p>
              <p className="mt-1 text-sm">
                Increase signup conversion{" "}
                <span className="num font-medium">3%</span>
                <span className="text-muted"> → </span>
                <span className="num font-medium">4%</span>
              </p>
            </div>
            <div>
              <p className="label">Guardrail</p>
              <p className="mt-1 text-sm">
                Lead quality must not fall below{" "}
                <span className="num font-medium">95%</span> of baseline
              </p>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-8 py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
