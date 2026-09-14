import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { answerQuestion } from "@/lib/anthropic";
import type { AskRequestBody } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: AskRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.question?.trim()) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }
  if (!Array.isArray(body.manuals) || body.manuals.length === 0) {
    return NextResponse.json({ error: "Upload at least one manual first" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not set on the server. Copy .env.example to .env.local, add your key, and restart `npm run dev`.",
      },
      { status: 500 },
    );
  }

  try {
    const answer = await answerQuestion({
      manuals: body.manuals,
      history: body.history ?? [],
      question: body.question,
    });
    return NextResponse.json(answer);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "Missing or invalid ANTHROPIC_API_KEY on the server. See README.md setup." },
        { status: 500 },
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited by Anthropic - try again shortly." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Anthropic API error: ${err.message}` }, { status: 502 });
    }
    console.error(err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
