import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { AskAnswer, ChatRole, Citation, ManualRef } from "./types";

export const MODEL = (process.env.ANTHROPIC_MODEL || "claude-haiku-4-5").trim();

/**
 * $ per million tokens. Source: Anthropic's published pricing at the time this
 * prototype was built (see README "Cost model"). Cache write is the 5-minute-TTL
 * rate (1.25x base input); cache read is 0.1x base input.
 */
const PRICING: Record<
  string,
  { input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0, cacheWrite: 1.25, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2.0, output: 10.0, cacheWrite: 2.5, cacheRead: 0.2 },
};

function pricingFor(model: string) {
  return PRICING[model] ?? PRICING["claude-haiku-4-5"];
}

export function estimateCostUsd(
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  },
  model: string,
): number {
  const p = pricingFor(model);
  const perTok = (n: number, rate: number) => (n / 1_000_000) * rate;
  return (
    perTok(usage.input_tokens, p.input) +
    perTok(usage.output_tokens, p.output) +
    perTok(usage.cache_creation_input_tokens ?? 0, p.cacheWrite) +
    perTok(usage.cache_read_input_tokens ?? 0, p.cacheRead)
  );
}

const AnswerSchema = z.object({
  found: z
    .boolean()
    .describe(
      "True only if the provided manual text contains enough information to answer the question.",
    ),
  spoken_answer: z
    .string()
    .describe(
      "1-3 short sentences, plain natural language, safe to read aloud by text-to-speech. " +
        "No markdown, no quotation marks, no page numbers, no manual titles inside this string. " +
        "If found=false, this must clearly say the manual(s) do not cover the question - never guess.",
    ),
  citations: z
    .array(
      z.object({
        manual: z
          .string()
          .describe('Exact manual title, copied exactly as given in a "MANUAL:" heading below.'),
        page: z.number().int().describe("Page number the quote appears on."),
        quote: z
          .string()
          .describe(
            "A verbatim excerpt (under 240 characters), copied character-for-character from " +
              "that exact page. Never paraphrase or combine text from different pages here.",
          ),
      }),
    )
    .describe(
      "Empty array if found=false. Exactly one entry for a direct/exception question. " +
        "One entry per manual (two total) for a comparison question.",
    ),
});

function buildDocumentContext(manuals: ManualRef[]): string {
  return manuals
    .map(
      (m) =>
        `\n\n===== MANUAL: "${m.title}" =====\n` +
        m.pages.map((p) => `--- Page ${p.page} ---\n${p.text}`).join("\n\n"),
    )
    .join("\n");
}

const INSTRUCTIONS = `You are a voice assistant that answers spoken questions about uploaded equipment manuals.

Rules:
- Answer ONLY using the manual text provided below. Never use outside knowledge about these or similar products, even if it seems plausible.
- If the manuals do not contain enough information to answer, set found=false and citations=[]. spoken_answer must explicitly say the manual doesn't cover it. Do not invent a plausible-sounding answer - an unsupported guess is worse than admitting the gap.
- If found=true, every citations[].quote must be copied verbatim (character-for-character) from the exact page you cite. Do not paraphrase inside quote, and do not merge text from two different pages into one quote.
- For a question comparing the two manuals, set citations to one entry per manual.
- Use the conversation history to resolve references such as "the other model", "it", or "that one" to a specific manual by name.
- Keep spoken_answer short and TTS-friendly: no markdown, no page numbers, no quotation marks, no manual titles inside it - all of that belongs in citations instead.

Manual text follows below.`;

function toAnthropicMessages(
  history: { role: ChatRole; text: string }[],
  question: string,
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = history.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));
  messages.push({ role: "user", content: question });
  return messages;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Checks each citation's quote against the actually-ingested page text. */
function verifyCitations(
  citations: { manual: string; page: number; quote: string }[],
  manuals: ManualRef[],
): Citation[] {
  return citations.map((c) => {
    const manual = manuals.find((m) => normalize(m.title) === normalize(c.manual)) ?? manuals[0];
    const page = manual?.pages.find((p) => p.page === c.page);
    const verified = Boolean(page && normalize(page.text).includes(normalize(c.quote)));
    return { manual: c.manual, page: c.page, quote: c.quote, verified };
  });
}

export interface AskParams {
  manuals: ManualRef[];
  history: { role: ChatRole; text: string }[];
  question: string;
}

export async function answerQuestion({ manuals, history, question }: AskParams): Promise<AskAnswer> {
  const client = new Anthropic();
  const started = performance.now();

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: INSTRUCTIONS + buildDocumentContext(manuals),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: toAnthropicMessages(history, question),
    output_config: {
      format: zodOutputFormat(AnswerSchema),
    },
  });

  const latencyMs = Math.round(performance.now() - started);
  const parsed = response.parsed_output;

  if (!parsed) {
    throw new Error("Model response could not be parsed into the expected answer shape.");
  }

  const usage = response.usage;
  const costUsd = estimateCostUsd(usage, response.model);

  return {
    found: parsed.found,
    spokenAnswer: parsed.spoken_answer,
    citations: verifyCitations(parsed.citations, manuals),
    usage: {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    },
    costUsd,
    model: response.model,
    latencyMs,
  };
}
