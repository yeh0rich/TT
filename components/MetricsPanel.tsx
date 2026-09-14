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
  return (
    <div className="panel mono p-3 text-xs" style={{ color: "var(--ink-dim)" }}>
      <div className="eyebrow mb-1.5">Measured performance</div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {ingestEntries.length === 0 && <span>Ingestion: none yet</span>}
        {ingestEntries.map(([slot, ms]) => (
          <span key={slot}>
            Ingestion ({slot}): <b style={{ color: "var(--ink)" }}>{ms} ms</b>
          </span>
        ))}
        <span>
          Question → first audible answer:{" "}
          <b style={{ color: "var(--ink)" }}>{lastAudibleMs !== null ? `${lastAudibleMs} ms` : "n/a"}</b>
        </span>
        <span>
          Reasoning call:{" "}
          <b style={{ color: "var(--ink)" }}>{lastServerLatencyMs !== null ? `${lastServerLatencyMs} ms` : "n/a"}</b>
        </span>
        <span>
          Session cost: <b style={{ color: "var(--ink)" }}>${totalCostUsd.toFixed(5)}</b> across {questionCount}{" "}
          question{questionCount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
