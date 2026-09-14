import type { AskAnswer } from "@/lib/types";

export function AnswerCard({ answer }: { answer: AskAnswer }) {
  return (
    <div className={`card-answer p-3.5 text-sm ${answer.found ? "" : "notfound"}`}>
      <span className={`pill mb-1.5 inline-block px-2 py-0.5 ${answer.found ? "pill-found" : "pill-notfound"}`}>
        {answer.found ? "found in manual" : "not in manual"}
      </span>
      <p>{answer.spokenAnswer}</p>

      {answer.citations.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-2">
          {answer.citations.map((c, i) => (
            <blockquote key={i} className="citation pl-2.5 text-xs">
              <span className="quote">&ldquo;{c.quote}&rdquo;</span>
              <div className="mono mt-1 flex flex-wrap items-center gap-1.5">
                <span style={{ color: "var(--ink-dim)" }}>
                  {c.manual}, p.{c.page}
                </span>
                <span className={c.verified ? "verified" : "unverified"}>
                  {c.verified ? "✓ quote verified against source text" : "✗ quote NOT found verbatim on that page"}
                </span>
              </div>
            </blockquote>
          ))}
        </div>
      )}

      <div className="mono mt-2.5 text-[11px]" style={{ color: "var(--ink-dim)" }}>
        {answer.model} · {answer.latencyMs} ms reasoning · ${answer.costUsd.toFixed(5)}
      </div>
    </div>
  );
}
