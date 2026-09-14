// Reproducible test harness for the "Ask Your Documents by Voice" brief.
//
// Runs the six graded questions (plus two context-setup turns: a follow-up
// antecedent and a pre-replacement baseline) against a running dev server,
// scores factual accuracy and citation accuracy SEPARATELY, and measures
// ingestion time, question latency and per-question cost. Expected answers
// live in questions.json and were written before this script ever ran.
//
// Usage:
//   npm run dev            # in one terminal, with ANTHROPIC_API_KEY set
//   npm run eval           # in another terminal
import { readFile, writeFile } from "fs/promises";
import { performance } from "perf_hooks";

const BASE_URL = process.env.EVAL_BASE_URL || "http://localhost:3000";
const ROOT = new URL("../", import.meta.url);

async function checkServerUp() {
  try {
    const res = await fetch(BASE_URL);
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

async function ingest(filePath, title) {
  const bytes = await readFile(new URL(filePath, ROOT));
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), filePath.split("/").pop());
  form.append("title", title);
  const t0 = performance.now();
  const res = await fetch(`${BASE_URL}/api/ingest`, { method: "POST", body: form });
  const wallMs = Math.round(performance.now() - t0);
  const data = await res.json();
  if (!res.ok) throw new Error(`Ingest failed for ${filePath}: ${data.error}`);
  return { title: data.title, pages: data.pages, serverIngestMs: data.ingestMs, wallMs, file: filePath };
}

async function ask(manuals, history, question) {
  const t0 = performance.now();
  const res = await fetch(`${BASE_URL}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manuals, history, question }),
  });
  const wallMs = Math.round(performance.now() - t0);
  const data = await res.json();
  if (!res.ok) throw new Error(`Ask failed for "${question}": ${data.error}`);
  return { answer: data, wallMs };
}

function normalize(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function grade(turn, answer) {
  const exp = turn.expected;
  const haystack = normalize(
    [answer.spokenAnswer, ...answer.citations.map((c) => c.quote)].join(" "),
  );

  const foundMatches = answer.found === exp.found;
  const mentionsAllRequired = (exp.mustMention ?? []).every((m) => haystack.includes(normalize(m)));
  const avoidsForbidden = (exp.mustNotMention ?? []).every((m) => !haystack.includes(normalize(m)));
  const factualCorrect = foundMatches && mentionsAllRequired && avoidsForbidden;

  const citationCorrect = (exp.citations ?? []).every((ec) =>
    answer.citations.some(
      (ac) => normalize(ac.manual) === normalize(ec.manual) && ac.page === ec.page,
    ),
  );
  const allCitationsVerified = answer.citations.length === 0 || answer.citations.every((c) => c.verified);

  return { factualCorrect, citationCorrect, allCitationsVerified };
}

async function main() {
  if (!(await checkServerUp())) {
    console.error(
      `Could not reach ${BASE_URL}. Start the app first in another terminal:\n` +
        "  cp .env.example .env.local   # then add your ANTHROPIC_API_KEY\n" +
        "  npm run dev\n",
    );
    process.exit(1);
  }

  const spec = JSON.parse(await readFile(new URL("questions.json", import.meta.url), "utf8"));

  console.log("Ingesting fixture manuals...");
  const ingested = {};
  for (const [key, m] of Object.entries(spec.manuals)) {
    ingested[key] = await ingest(m.file, m.title);
    console.log(
      `  ${key}: "${ingested[key].title}" - ${ingested[key].pages.length} pages, ` +
        `server ingest ${ingested[key].serverIngestMs} ms (wall ${ingested[key].wallMs} ms)`,
    );
  }

  const conversations = {}; // conversation id -> { history, manualRefs }
  const results = [];

  for (const turn of spec.turns) {
    const convId = turn.conversation;
    if (!conversations[convId]) {
      conversations[convId] = { history: [], manualRefs: [] };
    }
    const conv = conversations[convId];

    if (turn.manuals) {
      conv.manualRefs = turn.manuals.map((key) => ({
        slotId: key,
        title: ingested[key].title,
        pages: ingested[key].pages,
      }));
    }
    if (turn.replaceManualsWith) {
      conv.manualRefs = turn.replaceManualsWith.map((key) => ({
        slotId: key,
        title: ingested[key].title,
        pages: ingested[key].pages,
      }));
    }
    if (convId === "fresh") {
      conv.history = [];
    }

    console.log(`\n[${turn.id}] Q: ${turn.question}`);
    const { answer, wallMs } = await ask(conv.manualRefs, conv.history, turn.question);
    console.log(`  A: ${answer.spokenAnswer}`);
    console.log(`  found=${answer.found} citations=${JSON.stringify(answer.citations)}`);
    console.log(`  latency: server ${answer.latencyMs} ms / wall ${wallMs} ms, cost $${answer.costUsd.toFixed(5)}`);

    conv.history.push({ role: "user", text: turn.question });
    conv.history.push({ role: "assistant", text: answer.spokenAnswer });

    const graded = turn.graded ? grade(turn, answer) : null;
    if (graded) {
      console.log(
        `  GRADE: factual=${graded.factualCorrect ? "PASS" : "FAIL"} ` +
          `citation=${graded.citationCorrect ? "PASS" : "FAIL"} ` +
          `(quotes verified against source: ${graded.allCitationsVerified ? "yes" : "NO"})`,
      );
    }

    results.push({
      id: turn.id,
      graded: turn.graded,
      question: turn.question,
      answer,
      wallMs,
      grade: graded,
    });
  }

  const gradedResults = results.filter((r) => r.graded);
  const factualAccuracy = gradedResults.filter((r) => r.grade.factualCorrect).length / gradedResults.length;
  const citationAccuracy = gradedResults.filter((r) => r.grade.citationCorrect).length / gradedResults.length;
  const totalCostUsd = results.reduce((sum, r) => sum + r.answer.costUsd, 0);
  const gradedCostUsd = gradedResults.reduce((sum, r) => sum + r.answer.costUsd, 0);
  const latencies = results.map((r) => r.wallMs).sort((a, b) => a - b);
  const medianLatencyMs = latencies[Math.floor(latencies.length / 2)];

  const summary = {
    model: results[0]?.answer.model,
    questionsGraded: gradedResults.length,
    questionsTotal: results.length,
    factualAccuracy,
    citationAccuracy,
    ingestion: Object.fromEntries(
      Object.entries(ingested).map(([k, v]) => [k, { pages: v.pages.length, serverIngestMs: v.serverIngestMs, wallMs: v.wallMs }]),
    ),
    medianQuestionLatencyMs: medianLatencyMs,
    minQuestionLatencyMs: latencies[0],
    maxQuestionLatencyMs: latencies[latencies.length - 1],
    totalCostUsd,
    gradedCostUsd,
    avgCostPerQuestionUsd: gradedCostUsd / gradedResults.length,
  };

  console.log("\n===== SUMMARY =====");
  console.log(JSON.stringify(summary, null, 2));

  await writeFile(new URL("results.json", import.meta.url), JSON.stringify({ summary, results }, null, 2));
  await writeFile(new URL("report.md", import.meta.url), renderMarkdown(summary, results));
  console.log("\nWrote eval/results.json and eval/report.md");
}

function renderMarkdown(summary, results) {
  const rows = results
    .map((r) => {
      const g = r.grade;
      const gradeCol = g ? `${g.factualCorrect ? "✅" : "❌"} / ${g.citationCorrect ? "✅" : "❌"}` : "(context only)";
      return `| ${r.id} | ${r.graded ? "yes" : "no"} | ${r.question} | ${r.answer.found} | ${gradeCol} | ${r.wallMs} ms | $${r.answer.costUsd.toFixed(5)} |`;
    })
    .join("\n");

  return `# Eval report

Model: \`${summary.model}\`. Factual accuracy and citation accuracy graded separately per the brief.

- **Factual accuracy**: ${(summary.factualAccuracy * 100).toFixed(0)}% (${summary.questionsGraded} graded questions)
- **Citation accuracy**: ${(summary.citationAccuracy * 100).toFixed(0)}% (${summary.questionsGraded} graded questions)
- **Median question→answer latency**: ${summary.medianQuestionLatencyMs} ms (min ${summary.minQuestionLatencyMs} / max ${summary.maxQuestionLatencyMs} ms), measured wall-clock from request sent to full answer received
- **Average cost per question**: $${summary.avgCostPerQuestionUsd.toFixed(5)} (graded questions only)
- **Total session cost** (6 graded + 2 context-setup questions): $${summary.totalCostUsd.toFixed(5)}
- **Ingestion**: ${Object.entries(summary.ingestion)
    .map(([k, v]) => `${k}: ${v.pages} pages in ${v.serverIngestMs} ms server-side (no LLM call - $0 ingestion cost)`)
    .join("; ")}

| Question | Graded | Text | found | factual / citation | latency | cost |
|---|---|---|---|---|---|---|
${rows}

Full transcripts, citations and token usage: see \`results.json\`.
`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
