interface Props {
  ingestMs: Record<string, number>;
  lastAudibleMs: number | null;
  lastServerLatencyMs: number | null;
  totalCostUsd: number;
  questionCount: number;
}

export function MetricsPanel({
  ingestMs,
  lastAudibleMs,
  lastServerLatencyMs,
  totalCostUsd,
  questionCount,
}: Props) {
  const ingestEntries = Object.entries(ingestMs);
  const parts: string[] = [];
  for (const [slot, ms] of ingestEntries) parts.push(`ingestion (${slot}) ${ms} ms`);
  parts.push(`answer ${lastAudibleMs !== null ? `${lastAudibleMs} ms` : "n/a"}`);
  parts.push(`reasoning ${lastServerLatencyMs !== null ? `${lastServerLatencyMs} ms` : "n/a"}`);
  parts.push(`$${totalCostUsd.toFixed(5)} / ${questionCount} question${questionCount === 1 ? "" : "s"}`);

  return (
    <div className="mono px-1 text-center text-[11px]" style={{ color: "var(--ink-dim)" }}>
      {parts.join("  ·  ")}
    </div>
  );
}
