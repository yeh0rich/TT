# Ask Your Documents by Voice

A prototype built for Codebridge's "AI-First Product Builder" test task: upload an
equipment manual (PDF), ask a question by voice, get a short spoken answer plus a
visible verbatim quote and page number. Follow-up questions and "the manual doesn't
say" are both handled explicitly.

**This is a local prototype, not a hosted deployment.** No API key ships with it and
none was used to test it in this build session (see "What wasn't measured" below) -
you run it with your own Anthropic key.

## Quick start

```bash
npm install
cp .env.example .env.local     # add your ANTHROPIC_API_KEY
npm run dev                    # http://localhost:3000
```

Open the URL in **Chrome or Edge** (voice input needs the Web Speech API, which
Firefox and Safari don't implement - see Limitations). Upload one or two PDFs into
the two "Manual" slots, then tap the mic and ask a question, or type one.

Test fixtures (a fictional two-model manual, see below) are already generated under
`fixtures/`. To regenerate them: `npm run fixtures`.

To run the reproducible test set against your own key:

```bash
npm run dev      # in one terminal
npm run eval      # in another - writes eval/results.json and eval/report.md
```

## How it works

```
Browser                          Server (Next.js API routes)         Anthropic
--------                         ----------------------------        ---------
PDF file  ---multipart--->  /api/ingest
                             pdfjs-dist extracts per-page text
                             (no LLM call - $0, purely local)
          <---pages+timing---

mic (Web Speech API STT)
  -> transcript
question text ---JSON--->   /api/ask
  (+ manuals' page text,          builds system prompt = instructions
   + prior turns)                  + all page text with page markers
                                  client.messages.parse() with a Zod
                                  schema (found / spoken_answer /
                                  citations[]), prompt-cached          ---> Claude
                                  Server verifies each citation's            (Haiku 4.5
                                  quote is an actual substring of             by default)
                                  the claimed page's extracted text     <---
          <---answer JSON---
spoken_answer -> SpeechSynthesis (browser TTS, speaks it aloud)
citations -> rendered as visible quote + page + manual name
```

Design choices worth calling out:

- **No vector DB / chunking.** At up to 10 pages, the whole document fits in the
  context window with room to spare. Stuffing the full text (with explicit page
  markers) into the prompt is simpler and, for citation accuracy, more reliable
  than retrieval over small chunks - there's nothing to mis-retrieve.
- **Structured output, not free text.** `client.messages.parse()` with a Zod schema
  forces the model to return `{found, spoken_answer, citations[]}` as real JSON
  every time, instead of me regex-parsing prose. This makes both the UI and the
  eval harness deterministic to build against.
- **Citations are verified, not trusted.** After the model answers, the server
  checks whether each returned quote is actually a substring of the extracted text
  on the page the model claims. If not, the UI flags it in red ("quote NOT found
  verbatim on that page") instead of presenting it as evidence. This is the
  concrete answer to "a plausible answer without support is a failure": an
  unsupported citation is caught and surfaced, not hidden.
- **Prompt caching.** The system prompt (instructions + full document text) is
  cached with `cache_control: ephemeral`. The first question in a conversation
  pays the ~1.25x cache-write rate; every follow-up in the same 5-minute window
  reads that prefix at ~0.1x the base input price - this is what makes follow-up
  questions cheap.
- **Ingestion is separate from, and free relative to, answering.** PDF text
  extraction (`pdfjs-dist`) runs entirely server-side with no LLM call, so
  ingestion cost is $0 by construction; only `/api/ask` calls Claude.

## Model choice and cost model

Default model: **`claude-haiku-4-5`** (env: `ANTHROPIC_MODEL`). Published Anthropic
pricing at the time this was built:

| Model | Input $/MTok | Output $/MTok | Cache write (5m) | Cache read |
|---|---|---|---|---|
| claude-haiku-4-5 (default) | $1.00 | $5.00 | $1.25 | $0.10 |
| claude-sonnet-5 (set `ANTHROPIC_MODEL=claude-sonnet-5`) | $2.00 | $10.00 | $2.50 | $0.20 |

Haiku 4.5 is the cheaper/faster current-generation model and this is a small,
closed-book extraction task (find a fact in ≤10 pages, quote it, cite the page) -
not open-ended reasoning, so it's a reasonable default. Sonnet 5 is a one-line env
var away if you want higher-accuracy reasoning (e.g. for trickier comparison or
exception questions) at roughly 2-2.5x the cost per question.

`lib/anthropic.ts` computes `costUsd` for every answer from the actual token usage
Anthropic returns (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
`cache_read_input_tokens`) times the table above - that number in the UI and in
`eval/results.json` is a real per-call cost, not a guess.

### What wasn't measured, and why

I did not call the Anthropic API during this build - I was asked not to spend the
applicant's own money on API credits for a test task with no guaranteed outcome,
which I think is a completely reasonable line to draw. That means:

- **No live latency numbers.** `npm run eval` measures wall-clock time from request
  to full answer automatically once you add a key; I haven't run it, so I'm not
  going to state a latency target here - the brief specifically asks for measurements,
  not promises.
- **No live cost numbers either**, but I can give a grounded *estimate*: the two
  fixture manuals' extracted text is 4,425 characters (~1,100 tokens at a rough
  4 chars/token) plus a ~230-token instruction block. On Haiku 4.5, a first
  question in a conversation (cache write on ~1,330 prompt tokens + a short
  question + a ~150-250 token structured answer) comes out to roughly
  **$0.002-0.003**; a cached follow-up roughly **$0.001-0.0015**. This is arithmetic
  on published prices, not a measurement - `npm run eval` will give you the real
  number in under a minute once you add a key.
- **Ingestion cost is $0**, not an estimate - ingestion never calls a paid API.

If you add a key and run `npm run eval`, it overwrites `eval/results.json` and
`eval/report.md` with real numbers (accuracy, latency, and actual `$` cost from
Anthropic's own usage figures) that you're welcome to use in place of this section.

## The test manual and test set

`scripts/generate-fixtures.mjs` generates a fictional two-model manual (TerraDry
D200 and D400 industrial dehumidifiers, 4 pages each) with:

- **Different setup steps** (D200: single-phase 220-240V, internal tank; D400:
  three-phase 380-415V, electrician install, no tank/continuous pump drain).
- **Different limits** (D200: 45 m² coverage, 10L tank, min 5°C; D400: 90 m²
  coverage, no tank, min 5°C).
- **One explicit exception**: the D200 can run down to -5°C *only* if the optional
  LTK-1 defrost kit is installed; the D400 has no such exception under any
  configuration.
- A **revised** D200 manual (`terradry-d200-v2-revised.pdf`) where tank capacity
  changes from 10L to 13L, used to test that replacing the document changes the
  answer.

`eval/questions.json` records the six graded questions and their expected
answers/pages **before** any test run (per the brief):

| # | Type | Question | Expected |
|---|---|---|---|
| 1 | Direct fact | Max coverage area of the D200? | 45 m², D200 p.3 |
| 2 | Comparison | D200 vs D400 coverage area? | 45 m² vs 90 m², D200 p.3 + D400 p.3 |
| 3 | Follow-up | ("...setup steps for the D200?" then) "And what about the other model?" | D400 setup steps, D400 p.2 |
| 4 | Exception | Can the D200 run at 0°C? | Only with LTK-1 kit, D200 p.4 |
| 5 | Absent fact | D400 warranty period? | Not in the manual - `found: false` |
| 6 | Post-replacement | Tank capacity of the D200? (asked again after swapping in the v2 PDF, in the same conversation) | 10L before / 13L after replacement, D200 p.3 |

Two extra, ungraded turns build context for #3 and #6 (you have to ask about the
D200's setup steps before "the other model" means anything, and you need a
baseline answer before replacing the document to show it changed). `run-eval.mjs`
scores **factual accuracy** and **citation accuracy** as two separate numbers, and
also reports whether every citation's quote was independently verified against the
extracted source text (see "Citations are verified, not trusted" above) - a
correct-looking citation that fails verification is not counted as a pass.

## Limitations / what I'd improve next

- **Chrome/Edge only for voice input.** The Web Speech API (`SpeechRecognition`)
  isn't implemented in Firefox or Safari. A typed-question fallback is always
  available, but "ask by voice" genuinely doesn't work end-to-end there. A cloud
  STT (e.g. Whisper) would fix this at a small per-question cost.
- **Browser TTS is robotic**, not a natural voice. Fine for a working prototype;
  a cloud TTS API would sound much better for a small added cost/latency.
- **No persistence.** Uploaded manuals and conversation history live in React
  state and are lost on refresh. Fine for a demo, not for a real product.
- **One language, ≤10 pages, text-based PDFs only** - all per the brief's stated
  scope. No OCR; a scanned PDF is rejected with a clear error rather than silently
  producing empty/garbage context.
- **Two fixed manual slots.** Matches "up to two PDFs" from the brief; a real
  product would want an arbitrary document list.
- **Claude's native PDF citation feature** (`citations: {enabled: true}` on a
  `document` content block) could replace the hand-rolled page-marker text
  stuffing + substring verification here with page-level citations generated
  directly from the source PDF bytes. I chose the structured-output approach
  instead because it's incompatible with that citation feature
  (`output_config.format` and `citations` can't be used together), and I wanted
  a deterministic JSON shape for both the UI and the eval harness under a
  time-boxed build. Worth revisiting if this became a real product.
- **Known dependency advisory, not applicable here:** `npm audit` flags a Next.js
  image-optimization RCE (GHSA-2xp9-vwfh-vxw4) fixed only in Next 16. This app
  never uses `next/image` or the Image Optimization API, so the vulnerable code
  path isn't reachable; I didn't do the Next 14 -> 16 major-version migration
  (React 19, App Router changes) to fix an advisory in code this app doesn't call,
  given the time budget - flagging it here rather than leaving it silent.
- **No deployment.** Runs locally via `npm run dev`. If hosted (e.g. Vercel's free
  tier for a demo, or a ~$5-6/mo small VM), that's a fixed hosting cost separate
  from the per-question variable cost above - Vercel's free tier would cover a demo
  at this traffic level with $0 fixed cost.
- **Video walkthrough**: not produced in this session (I can't record narrated
  video myself as an AI agent) - see `DELIVERY_NOTES.md`.

## Reused vs. custom

- **Reused, unmodified**: Next.js (app scaffold/routing), `@anthropic-ai/sdk`
  (Claude API client + Zod structured-output helper), `pdfjs-dist` (PDF text
  extraction), `pdf-lib` (used only to *generate* the fixture PDFs, not at
  runtime), the browser's native Web Speech API (`SpeechRecognition` /
  `speechSynthesis`) and Tailwind CSS.
- **Custom, written for this brief**: the grounding/citation prompt and Zod
  schema, the citation-verification layer, the ingestion route and page-limit
  enforcement, the whole UI (upload slots, voice flow, transcript, metrics
  panel), the fictional TerraDry manual content and fixture generator, and the
  eval harness + expected-answer set.
