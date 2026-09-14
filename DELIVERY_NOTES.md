# Delivery notes

## Sample inputs and expected/actual results

Sample inputs are the two fictional manuals in `fixtures/` (TerraDry D200 + D400,
plus a revised D200) and the six graded questions in `eval/questions.json`, with
expected answers and source pages recorded before any test run - see the table in
`README.md` ("The test manual and test set").

**Actual results, from a real run against `claude-haiku-4-5-20251001`** (full
transcripts in `eval/results.json`, scored table in `eval/report.md`):

| # | Question | Expected | Actual | Factual | Citation |
|---|---|---|---|---|---|
| 1 | Max coverage area of the D200? | 45 m², D200 p.3 | "45 square meters... 484 square feet... at 2.5 meters" | ✅ | ✅ |
| 2 | D200 vs D400 coverage area? | 45 vs 90 m² | "45... while the D400 covers twice as much at 90 square meters" | ✅ | ✅ |
| 3 | ("...D200 setup?" then) "And what about the other model?" | D400 setup steps, p.2 | Full D400 three-phase/electrician/pump setup steps | ✅ | ✅ |
| 4 | Can the D200 run at 0°C? | Only with LTK-1, p.4 | "No... under standard configuration. However, if the optional Low-Temperature Defrost Kit is installed... down to minus 5" | ✅ | ✅ |
| 5 | D400 warranty period? | Not in manual | "The manual does not cover the warranty period for the D400." | ✅ | ✅ (no citation, correctly) |
| 6 | D200 tank capacity, before/after replacing with v2 | 10L → 13L, both p.3 | 10 liters, then (after replace) "13 liters, increased from 10 liters in the 2027-B hardware revision" | ✅ | ✅ |

Even though during the walkthrough the dictation missed the mark on the last
question due to me wearing AirPods, the overall factual accuracy was 6 out of
6, 100%. Citation accuracy in previous tests using the built-in MacBook mic
came to 6 out of 6, 100%. Every citation's quote was independently verified as
an actual substring of the extracted document text, not just self-reported by
the model. See "What failed" below for one wrinkle in question 6 itself: the
model's answer was correct on the first run, but my own grading script
initially mis-scored it.

## What failed

Three real bugs were found and fixed during this build, all caught before
delivery, not left in the code:

1. **SDK/API-shape errors caught by the type checker.** My first draft of
   `lib/anthropic.ts` used `@anthropic-ai/sdk/helpers/beta/zod` and
   `import { z } from "zod"` (v3 API). `npx tsc --noEmit` failed both:
   the currently-installed SDK's Zod structured-output helper lives at
   `@anthropic-ai/sdk/helpers/zod` (non-beta) and expects a `zod/v4`-shaped
   schema, not v3. Fixed by inspecting the installed package's own `.d.ts` files
   rather than guessing from memory, then re-running `tsc` to confirm.
2. **A React hydration mismatch** in the voice-support check (`typeof window !==
   "undefined"` inside a `useState` initializer renders differently on the server
   vs. the client's first paint). Found with a Playwright smoke test that loaded
   the page and asserted zero console errors; fixed by moving the check into a
   `useEffect` so both the server and the client's first render agree (`false`),
   then updating once mounted.
3. **A false failure in my own eval grading logic**, found on the real run: the
   harness flagged question 6 (post-replacement) as a factual failure because the
   model's answer contained the substring "10 liters". Looking at the actual
   answer, the model was right - "13 liters, increased from 10 liters in the
   2027-B hardware revision" - it correctly gave the new value and accurately
   cited the old one as context, because the v2 manual's own page 3 text phrases
   it that way. The bug was my `mustNotMention` check treating any mention of the
   old number as disqualifying, including inside a verbatim, correctly-cited
   quote. Fixed by dropping that check for this question and documenting why in
   `eval/questions.json`, rather than quietly loosening the grading until it
   passed.

**A real citation-verification catch, not a bug**: manually running the same six
questions through the actual browser UI (voice + typed, with the applicant's own
key) reproduced the eval's 6/6 factual accuracy, but on question 3's follow-up
("And what about the other model?") the citation card was flagged **"quote NOT
found verbatim on that page."** The spoken answer was entirely correct; the model
quoted the D400's setup steps as flowing prose and dropped the source PDF's "1.",
"2.", "3." list markers, so the quote was no longer a byte-for-byte substring of
the extracted page text. The identical question, run moments earlier in the
scripted eval, had the model keep the numbering and pass verification cleanly -
same prompt, different token-level quoting choice. This is the citation-accuracy
metric doing exactly what it's for: catching a case where "the answer is right"
and "the quote is verified" briefly diverged, on live, unscripted use rather than
the curated eval run. Nothing to fix here - it's the intended failure mode the
verification layer exists to surface (see README "Citations are verified, not
trusted"), and it argues for treating citation accuracy as its own metric rather
than inferring it from factual correctness, exactly as the brief asks.

None of these three would have been visible from reading the code alone; all
three needed an actual compile, run, or live model call to surface - which is
the concrete case for not skipping that step even under time pressure.

**What's genuinely unfinished:**

- Public deployment was being set up separately (Vercel) and is not confirmed
  complete as of this note - see the submission form for whatever URL was
  ultimately included.
- Only one live eval run was performed (Haiku 4.5, one pass through the six
  questions). I have no data on run-to-run variance, and did not test
  `claude-sonnet-5` live.

## Time spent

This prototype was built primarily using an AI coding agent, Claude Code
running Claude Sonnet 5, in a continuous session. It took me (Yehor) about
4-ish hours total to direct the build, troubleshoot the environment (GitHub
account/branch setup, local server issues), test the app for real, iterate on
the UI, and get everything working properly with no failure points. That is
not directly comparable to the brief's "8 focused hours" for someone building
by hand without an agent, and is disclosed here rather than implied to be a
like-for-like number.

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

**Two examples of how I checked the model's (Claude Code's) output:**

1. After writing the PDF-ingestion route, I didn't assume it worked - I started
   the real dev server and `curl`'d all three fixture PDFs through `/api/ingest`,
   printing the actual extracted per-page text back to the terminal and reading
   it, confirming the D200 v1 vs. v2-revised text differed exactly where intended
   (10 vs. 13 liters, same page 3) before wiring anything else to depend on it.
2. After the live eval run came back "5/6 factual", I didn't take the failing
   grade at face value - I read the actual failing transcript in the terminal
   output, saw the model's answer was in fact correct, traced the discrepancy to
   my own grading regex, and fixed the test rather than the app. Trusting a
   red/green result without reading the underlying transcript would have produced
   a false claim in this document (either "the model has a bug" or, worse, a
   quietly loosened check to force a pass).

## Speed and cost measurement approach

Real numbers, from one live run against `claude-haiku-4-5-20251001` with the
applicant's own API key (see README.md → "Measured results" for the full table):
**factual accuracy 6/6, citation accuracy 6/6, median latency 3.6s (1.1-8.5s
range), average cost/question $0.00285, full 8-turn session $0.0227, ingestion
$0**. My pre-run estimate (arithmetic from extracted-text size × published
pricing, before any live call) was $0.002-0.003/question - close to, and slightly
under, what was actually measured. Latency was not estimated beforehand at all,
because I had no grounded basis for a number; it's reported here as measured,
not guessed.

## Hosting cost (separate from per-operation cost)

Not deployed in this delivery. For reference: this is a stateless Next.js app (no
database) that would fit comfortably on a free-tier host (e.g. Vercel's free tier)
for demo-level traffic, i.e. $0 fixed hosting cost at this scale; a small
always-on VM would run roughly $5-6/month if self-hosting were preferred instead.
Free-tier hosting is not zero *operating* cost in the sense the brief means -
Anthropic API usage is billed per the per-question estimate above regardless of
where the app is hosted.
