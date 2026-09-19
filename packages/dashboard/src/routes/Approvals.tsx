import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Approval } from "../api.js";
import { useApi } from "../useApi.js";
import { PageHeader, Empty, Thinking, ErrorNote } from "../components/ui.js";

/**
 * The human gate.
 *
 * This queue is not a workflow sitting beside the policy — it is what the
 * policy produces. Each card exists because Cedar refused a launch with
 * `forbid-launch-without-approval`, and the refusal it carries is shown at the
 * top of the card rather than summarised away.
 *
 * Approving does not write `status = running` directly. It records the
 * approval and then asks the API to launch, which re-evaluates the whole
 * policy. That matters: between the request and the approval, something else
 * may have started running on that page, and the gate should still catch it.
 * A queue that bypassed the gate on the way out would be a gate with a hole
 * shaped exactly like the button a human clicks.
 */

function MutationLine({ m }: { m: { op: string; selector: string; value?: string; note?: string } }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
      <span className="chip font-mono text-[0.65rem]">{m.op}</span>
      <code className="text-[0.7rem] text-muted">{m.selector}</code>
      {m.value && <span className="text-[0.75rem]">→ “{m.value}”</span>}
      {m.note && <span className="w-full text-[0.7rem] text-muted">{m.note}</span>}
    </li>
  );
}

function Card({ a, onDone }: { a: Approval; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const pending = a.status === "pending";
  const challengers = a.variants.filter((v) => !v.is_control);

  async function decide(decision: "approve" | "reject") {
    if (decision === "reject" && !reason.trim()) { setRejecting(true); return; }
    setBusy(true); setResult(null);
    try {
      const d = await api.decide({
        approvalId: a.id, decision,
        decidedBy: "sehaj@growthx",
        reason: decision === "reject" ? reason.trim() : undefined,
      });
      if (!d.ok) { setResult(d.errors?.[0] ?? "could not record that"); return; }

      if (decision === "approve") {
        // Re-runs the full policy evaluation. An approval is permission to ask
        // again, not permission to skip the question.
        const launched = await api.launch(a.experiment_id);
        setResult(launched.launched
          ? "Launched — live on the site within 30s (the manifest edge cache)."
          : `Approved, but the policy still refuses: ${launched.explain ?? launched.errors?.[0]}`);
      } else {
        setResult("Rejected. The agent reads your reason before it proposes again.");
      }
      onDone();
    } catch (err) {
      setResult(String(err));
    } finally {
      setBusy(false);
    }
  }

  const tone = a.status === "approved" ? "positive"
    : a.status === "rejected" ? "negative" : "caution";

  return (
    <article className="card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="chip" style={{
            color: `var(--${tone})`,
            background: `color-mix(in srgb, var(--${tone}) 12%, transparent)`,
          }}>{a.status}</span>
          <span className="ml-2 font-mono text-xs text-muted">{a.experiment_id}</span>
        </div>
        <Link to={`/experiments/${a.experiment_id}/diff`} className="text-xs underline">
          Compare side by side →
        </Link>
      </div>

      {/* The refusal that created this request, quoted rather than paraphrased. */}
      {a.cedar_decision && (
        <div className="mt-3 rounded px-3 py-2 text-xs"
             style={{ background: "color-mix(in srgb, var(--caution) 8%, transparent)" }}>
          <span className="chip font-mono text-[0.65rem]">{a.cedar_decision.policyId}</span>
          <p className="mt-1.5 text-muted">{a.cedar_decision.explain}</p>
        </div>
      )}

      <p className="mt-3 max-w-measure text-sm leading-relaxed">{a.hypothesis}</p>

      {challengers.map((v) => (
        <div key={v.id} className="mt-3">
          <p className="text-xs font-medium">{v.label}</p>
          <p className="mt-0.5 text-xs text-muted">{v.rationale}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {v.mutations.map((m, i) => <MutationLine key={i} m={m} />)}
          </ul>
        </div>
      ))}

      {pending && (
        <div className="mt-4 flex flex-col gap-2">
          {rejecting && (
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you turning this down? The agent reads this."
              className="w-full rounded border border-hairline bg-transparent px-3 py-2 text-xs"
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className="chip" disabled={busy}
                    style={{ color: "var(--positive)", background: "color-mix(in srgb, var(--positive) 12%, transparent)" }}
                    onClick={() => decide("approve")}>
              {busy ? "Working…" : "Approve and launch"}
            </button>
            <button className="chip" disabled={busy}
                    style={{ color: "var(--negative)", background: "color-mix(in srgb, var(--negative) 12%, transparent)" }}
                    onClick={() => decide("reject")}>
              {rejecting ? "Confirm rejection" : "Reject"}
            </button>
            {rejecting && (
              <button className="chip" onClick={() => { setRejecting(false); setReason(""); }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {!pending && a.decided_by && (
        <p className="mt-3 text-xs text-muted">
          {a.status} by {a.decided_by}
          {a.rejection_reason && <> — “{a.rejection_reason}”</>}
        </p>
      )}

      {result && <p className="mt-2.5 text-xs" style={{ color: "var(--ink)" }}>{result}</p>}
    </article>
  );
}

export function Approvals() {
  const [nonce, setNonce] = useState(0);
  const approvals = useApi(() => api.approvals(), [nonce]);

  if (approvals.error) return <><PageHeader title="Approvals" /><ErrorNote error={approvals.error} /></>;
  if (approvals.loading) return <><PageHeader title="Approvals" /><Thinking label="Loading queue" /></>;

  const items = approvals.data?.approvals ?? [];
  const pending = items.filter((a) => a.status === "pending");

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="The agent may generate freely. It may not launch."
      />

      {items.length === 0 ? (
        <Empty
          title="Nothing waiting"
          body="When the agent tries to launch an experiment, Cedar refuses it for want of an approval — and that refusal arrives here as a request. Nothing reaches a visitor until someone approves it by name."
        />
      ) : (
        <>
          <p className="mb-4 text-xs text-muted">
            <strong className="text-ink">{pending.length}</strong> waiting on you
            {items.length > pending.length && <> · {items.length - pending.length} already decided</>}
          </p>
          <div className="flex flex-col gap-3">
            {items.map((a) => (
              <Card key={a.id} a={a} onDone={() => setNonce((n) => n + 1)} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
