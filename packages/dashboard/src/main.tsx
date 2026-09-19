import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell.js";
import { Overview } from "./routes/Overview.js";
import { Heatmaps } from "./routes/Heatmaps.js";
import { Placeholder } from "./routes/Placeholder.js";
import { Runs } from "./routes/Runs.js";
import { Opportunities } from "./routes/Opportunities.js";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Overview />} />
          <Route path="heatmaps" element={<Heatmaps />} />
          <Route path="opportunities" element={<Opportunities />} />
          <Route path="experiments" element={
            <Placeholder title="Experiments"
              subtitle="Running and concluded tests, with honest statistics."
              body="Traffic split, exposure and conversion per arm, the guardrail metric tracked alongside the primary one, and auto-stop rules. Significance is computed in plain code and never by the model."
              phase="P18" />} />
          <Route path="approvals" element={
            <Placeholder title="Approvals"
              subtitle="The agent may generate freely. It may not launch."
              body="Cedar policy is evaluated before every state-changing action. Launching an experiment is forbidden unless an approval record exists, so the queue is the policy working rather than a workflow bolted on top. Denials are shown here too."
              phase="P17–P19" />} />
          <Route path="learnings" element={
            <Placeholder title="Learnings"
              subtitle="What previous experiments proved, and which hypotheses cited them."
              body="Every concluded experiment writes a one-sentence generalisation. Hypothesis generation retrieves these before proposing anything, so the agent stops re-testing settled questions — and each record shows which later hypotheses used it."
              phase="P14, P20" />} />
          <Route path="reports" element={
            <Placeholder title="Reports"
              subtitle="What was observed, the diagnosed cause in plain language, and the evidence."
              body="A report you could act on without ever launching our test: what the agent saw, why it thinks the page underperforms, the figures behind that, and what it proposes to do."
              phase="P20" />} />
          <Route path="runs" element={<Runs />} />
          <Route path="*" element={
            <Placeholder title="Not found" subtitle="" body="That page does not exist." />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
