# Delivery notes

## Sample inputs and expected/actual results

Sample inputs are the two fictional manuals in `fixtures/` (TerraDry D200 + D400,
plus a revised D200) and the six graded questions in `eval/questions.json`, with
expected answers and source pages recorded before any test run - see the table in
`README.md` ("The test manual and test set").

**Actual results are not included in this delivery.** I did not call the Anthropic
API in this build session - see "What I didn't do, and why" below. `npm run eval`
will populate `eval/results.json` (raw) and `eval/report.md` (a scored table: found/
not-found, factual accuracy, citation accuracy, latency, and real per-question $
cost from Anthropic's own usage figures) the first time it's run against a real
key. I'd expect the model to get 1-6 (direct fact) and 5 (absent fact) right easily;
3 (follow-up) and 6 (post-replacement, where the model's *own* earlier answer in
the same conversation says "10 liters" right before it needs to say "13 liters")
are the two I'd actually watch for failures on, and 2 and 4 are a reasonable middle
difficulty (comparison across two documents; an exception clause that only applies
to one of the two models).

## What failed

Two real bugs were found and fixed during this build, both caught before any
review, not left in the delivered code:

1. **SDK/API-shape errors caught by the type checker.** My first draft of
   `lib/anthropic.ts` used `@anthropic-ai/sdk/helpers/beta/zod` and
   `import { z } from "zod"` (v3 API). `npx tsc --noEmit` failed both:
   the currently-installed SDK's Zod structured-output helper lives at
   `@anthropic-ai/sdk/helpers/zod` (non-beta) and expects a `zod/v4`-shaped
   schema, not v3. Fixed by inspecting the installed package's own `.d.ts` files
   rather than guessing from memory, then re-running `tsc` to confirm - see "how I
   checked their output" below.
2. **A React hydration mismatch** in the voice-support check (`typeof window !==
   "undefined"` inside a `useState` initializer renders differently on the server
   vs. the client's first paint). Found with a Playwright smoke test that loaded
   the page and asserted zero console errors; fixed by moving the check into a
   `useEffect` so both the server and the client's first render agree (`false`),
   then updating once mounted.

Neither of these would have been visible from just reading the code; both needed
an actual compile/run to surface. I did not find or fix any correctness bug in the
grounding/citation/follow-up logic itself, because that logic has not been
exercised against a real model response in this session (no API key was used) -
that's the biggest open risk in this delivery, not a solved one.

**What's genuinely unfinished:**

- Live accuracy/latency/cost numbers (see above) - the harness is ready, the
  numbers aren't in yet.
- Video walkthrough - not produced; I can't record narrated video as an AI agent,
  and the applicant declined the alternative of an automated silent
  Playwright screen-capture for this delivery. A script would need to be written
  and recorded separately before submission.
- No deployment - local `npm run dev` only.

## Time spent

This prototype was built primarily by an AI agent (Claude Code, running Claude
Sonnet 5) inside a single continuous session, directed by the applicant (Yehor)
who made the product decisions: input/output stack (browser-native voice, no
paid speech APIs), model choice (Haiku 4.5 default), and - notably - the decision
not to spend money calling the Anthropic API to generate live test numbers for a
test task with no guaranteed outcome. Wall-clock agent execution time for the
build itself (scaffolding through working UI, fixtures, eval harness, and docs)
was under 30 minutes; that is not comparable to the brief's "8 focused hours" for
a human working solo without an agent, and is disclosed here rather than implied
as a like-for-like number. Remaining human time for Yehor before submission:
reviewing this code, running `npm run eval` with his own key if he wants real
numbers, and recording the video walkthrough.

## Exact AI tools and models

- **Claude Code, running Claude Sonnet 5** (`claude-sonnet-5`) - the coding agent
  that wrote every file in this repository, chose the architecture, and ran the
  verification steps described above.
- **Claude's `claude-api` skill** (bundled reference docs + a cached current
  pricing table) - consulted before writing any Anthropic API code, specifically
  to get current model pricing and the correct current SDK usage pattern for
  structured outputs (`client.messages.parse` + `zodOutputFormat`) instead of
  relying on possibly-outdated training knowledge.
- **Claude Haiku 4.5** (`claude-haiku-4-5`) - the model the *deployed app* calls
  at runtime to answer questions (default; switchable to `claude-sonnet-5`).
- **Browser-native Web Speech API** (`SpeechRecognition` for STT,
  `speechSynthesis` for TTS) - not an Anthropic model; Chrome/Edge's built-in
  speech engines, chosen specifically to keep voice I/O at $0 marginal cost (see
  README "Model choice and cost model").

**One example of how I checked the model's (Claude Code's) output**, beyond the
two bugs above: after writing the PDF-ingestion route, I didn't assume it worked -
I started the real dev server and `curl`'d all three fixture PDFs through
`/api/ingest`, printing the actual extracted per-page text back to the terminal
and reading it, confirming the D200 v1 vs. v2-revised text differed exactly where
intended (10 liters vs. 13 liters, on the same page 3) before wiring anything else
to depend on it.

## Speed and cost measurement approach

See `README.md` → "What wasn't measured, and why" for the full explanation.
Short version: ingestion cost is genuinely $0 (no LLM call in that path, verified
by reading the code path, not assumed); per-question cost is an arithmetic
estimate from real extracted-text size (4,425 characters across both manuals) and
Anthropic's published Haiku 4.5 pricing, landing around $0.001-0.003/question -
explicitly labeled as an estimate, not a measurement, because no live API call was
made. Latency is not estimated at all here, because I have no grounded basis for a
number - `npm run eval` measures it directly, in seconds, the first time someone
runs it with a real key.

## Hosting cost (separate from per-operation cost)

Not deployed in this delivery. For reference: this is a stateless Next.js app (no
database) that would fit comfortably on a free-tier host (e.g. Vercel's free tier)
for demo-level traffic, i.e. $0 fixed hosting cost at this scale; a small
always-on VM would run roughly $5-6/month if self-hosting were preferred instead.
Free-tier hosting is not zero *operating* cost in the sense the brief means -
Anthropic API usage is billed per the per-question estimate above regardless of
where the app is hosted.
