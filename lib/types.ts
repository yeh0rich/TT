export interface ManualPage {
  page: number;
  text: string;
}

export interface Manual {
  /** Client-generated id, stable across a session so a re-upload can replace it. */
  slotId: string;
  title: string;
  fileName: string;
  pages: ManualPage[];
  ingestMs: number;
}

export interface ManualRef {
  slotId: string;
  title: string;
  pages: ManualPage[];
}

export type ChatRole = "user" | "assistant";

export interface ChatTurn {
  role: ChatRole;
  /** For user turns: the question text. For assistant turns: the spoken answer text. */
  text: string;
  /** Present on assistant turns. */
  answer?: AskAnswer;
}

export interface Citation {
  manual: string;
  page: number;
  quote: string;
  /** Whether `quote` was verified to actually appear on `page` of `manual`'s extracted text. */
  verified: boolean;
}

export interface AskAnswer {
  found: boolean;
  spokenAnswer: string;
  citations: Citation[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
  costUsd: number;
  model: string;
  latencyMs: number;
}

export interface AskRequestBody {
  manuals: ManualRef[];
  history: { role: ChatRole; text: string }[];
  question: string;
}
