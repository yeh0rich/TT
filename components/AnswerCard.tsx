import type { AskAnswer } from "@/lib/types";

export function AnswerCard({ answer }: { answer: AskAnswer }) {
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        answer.found ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      {!answer.found && (
        <div className="mb-1 font-medium text-amber-800">Not found in the uploaded manual(s)</div>
      )}
      <p className="text-gray-900">{answer.spokenAnswer}</p>

      {answer.citations.length > 0 && (
        <div className="mt-2 space-y-2">
          {answer.citations.map((c, i) => (
            <blockquote
              key={i}
              className={`border-l-2 pl-2 text-xs ${
                c.verified ? "border-emerald-400 text-gray-700" : "border-red-400 text-red-700"
              }`}
            >
              &ldquo;{c.quote}&rdquo;
              <div className="mt-0.5 font-medium">
                {c.manual}, p.{c.page}
                {c.verified ? " · quote verified against source text" : " · quote NOT found verbatim on that page"}
              </div>
            </blockquote>
          ))}
        </div>
      )}

      <div className="mt-2 text-[11px] text-gray-500">
        {answer.model} · {answer.latencyMs} ms reasoning · ${answer.costUsd.toFixed(5)}
      </div>
    </div>
  );
}
