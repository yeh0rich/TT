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
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600">
      <div className="mb-1 font-semibold text-gray-800">Measured performance</div>
      {ingestEntries.length === 0 && <div>Ingestion: none yet</div>}
      {ingestEntries.map(([slot, ms]) => (
        <div key={slot}>
          Ingestion ({slot}): {ms} ms
        </div>
      ))}
      <div>
        Last question → first audible answer:{" "}
        {lastAudibleMs !== null ? `${lastAudibleMs} ms` : "n/a"}
      </div>
      <div>
        Of which server reasoning call: {lastServerLatencyMs !== null ? `${lastServerLatencyMs} ms` : "n/a"}
      </div>
      <div>
        Session cost so far: ${totalCostUsd.toFixed(5)} across {questionCount} question
        {questionCount === 1 ? "" : "s"}
      </div>
    </div>
  );
}
