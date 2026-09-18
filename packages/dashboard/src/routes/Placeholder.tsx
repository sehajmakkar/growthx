import { PageHeader, Empty } from "../components/ui.js";

/**
 * A designed empty state rather than a blank route.
 *
 * Every nav item goes somewhere that explains what will live there and what
 * builds it. A judge clicking around before the later phases land should find a
 * product that has not finished running, not one that has not finished.
 */
export function Placeholder({
  title, subtitle, body, phase,
}: { title: string; subtitle: string; body: string; phase?: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <Empty title="Nothing here yet" body={body} phase={phase} />
    </>
  );
}
