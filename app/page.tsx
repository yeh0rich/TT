"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnswerCard } from "@/components/AnswerCard";
import { MetricsPanel } from "@/components/MetricsPanel";
import { MAX_PAGES_TOTAL } from "@/lib/pdfExtract";
import type { AskAnswer, ChatTurn, ManualPage } from "@/lib/types";

type SlotId = "A" | "B";
const SLOTS: SlotId[] = ["A", "B"];

interface ManualSlot {
  title: string;
  fileName: string;
  pages: ManualPage[];
  ingestMs: number;
}

export default function Home() {
  const [manuals, setManuals] = useState<Record<SlotId, ManualSlot | null>>({ A: null, B: null });
  const [manualNames, setManualNames] = useState<Record<SlotId, string>>({ A: "", B: "" });
  const [ingestingSlot, setIngestingSlot] = useState<SlotId | null>(null);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [typed, setTyped] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAudibleMs, setLastAudibleMs] = useState<number | null>(null);
  const [lastServerLatencyMs, setLastServerLatencyMs] = useState<number | null>(null);
  const [totalCostUsd, setTotalCostUsd] = useState(0);
  // Starts false on both server and first client render to avoid a hydration
  // mismatch, then updates immediately after mount once `window` is available.
  const [speechSupported, setSpeechSupported] = useState(false);
  useEffect(() => {
    setSpeechSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  const recognitionRef = useRef<InstanceType<NonNullable<Window["SpeechRecognition"]>> | null>(null);
  const historyRef = useRef<ChatTurn[]>([]);
  historyRef.current = history;

  const totalPages = useMemo(
    () => SLOTS.reduce((sum, s) => sum + (manuals[s]?.pages.length ?? 0), 0),
    [manuals],
  );
  const questionCount = useMemo(() => history.filter((t) => t.role === "assistant").length, [history]);

  const speak = useCallback((text: string, onStart: () => void) => {
    if (!("speechSynthesis" in window)) {
      onStart();
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.onstart = onStart;
    window.speechSynthesis.speak(utter);
  }, []);

  const handleAsk = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q) return;
      const loaded = SLOTS.map((s) => manuals[s]).filter((m): m is ManualSlot => m !== null);
      if (loaded.length === 0) {
        setError("Upload at least one manual before asking a question.");
        return;
      }
      setError(null);
      setTyped("");
      setLiveTranscript("");
      setIsAsking(true);

      const priorHistory = historyRef.current.map((t) => ({ role: t.role, text: t.text }));
      setHistory((h) => [...h, { role: "user", text: q }]);

      const t0 = performance.now();
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manuals: SLOTS.filter((s) => manuals[s]).map((s) => ({
              slotId: s,
              title: manuals[s]!.title,
              pages: manuals[s]!.pages,
            })),
            history: priorHistory,
            question: q,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed");
        const answer = data as AskAnswer;

        setLastServerLatencyMs(answer.latencyMs);
        setTotalCostUsd((c) => c + answer.costUsd);
        setHistory((h) => [...h, { role: "assistant", text: answer.spokenAnswer, answer }]);
        speak(answer.spokenAnswer, () => {
          setLastAudibleMs(Math.round(performance.now() - t0));
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setIsAsking(false);
      }
    },
    [manuals, speak],
  );

  const toggleRecording = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setError("This browser doesn't support voice input (Web Speech API). Try Chrome or Edge, or type your question below.");
      return;
    }
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let finalTranscript = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalTranscript += result[0].transcript;
        else interim += result[0].transcript;
      }
      setLiveTranscript(finalTranscript + interim);
    };
    recognition.onerror = () => {
      setIsRecording(false);
      setError("Voice recognition failed - check microphone permission and try again.");
    };
    recognition.onend = () => {
      setIsRecording(false);
      if (finalTranscript.trim()) {
        void handleAsk(finalTranscript);
      }
    };

    recognitionRef.current = recognition;
    setIsRecording(true);
    setError(null);
    recognition.start();
  }, [isRecording, handleAsk]);

  const handleUpload = useCallback(async (slot: SlotId, file: File) => {
    const existing = manuals[slot];
    if (existing) {
      const ok = window.confirm(
        `Replace previously uploaded manual "${existing.title}" with "${file.name}"?\n` +
          "The next question will be answered from the new document instead.",
      );
      if (!ok) return;
    }
    setError(null);
    setIngestingSlot(slot);
    try {
      const form = new FormData();
      form.append("file", file);
      if (manualNames[slot].trim()) form.append("title", manualNames[slot].trim());
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setManuals((m) => ({
        ...m,
        [slot]: { title: data.title, fileName: data.fileName, pages: data.pages, ingestMs: data.ingestMs },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setIngestingSlot(null);
    }
  }, [manuals, manualNames]);

  const ingestMsBySlot = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of SLOTS) if (manuals[s]) out[s] = manuals[s]!.ingestMs;
    return out;
  }, [manuals]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Ask Your Documents by Voice</h1>
        <p className="mt-1 text-sm text-gray-600">
          Upload up to two equipment manuals (text-based PDF, 10 pages total), then ask questions by
          voice. Answers are spoken aloud and grounded in a visible quote + page reference from the
          document you uploaded.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SLOTS.map((slot) => (
          <div key={slot} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium uppercase text-gray-500">Manual {slot}</div>
            {manuals[slot] ? (
              <div className="text-sm">
                <div className="font-medium">{manuals[slot]!.title}</div>
                <div className="text-xs text-gray-500">
                  {manuals[slot]!.pages.length} page(s) · ingested in {manuals[slot]!.ingestMs} ms
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400">No manual uploaded</div>
            )}
            {!manuals[slot] && (
              <input
                type="text"
                placeholder="Name it, e.g. TerraDry D200 (optional)"
                className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                value={manualNames[slot]}
                onChange={(e) => setManualNames((n) => ({ ...n, [slot]: e.target.value }))}
              />
            )}
            <label className="mt-2 inline-block cursor-pointer rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">
              {ingestingSlot === slot ? "Uploading…" : manuals[slot] ? "Replace file" : "Upload PDF"}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={ingestingSlot === slot}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleUpload(slot, file);
                }}
              />
            </label>
          </div>
        ))}
      </section>

      {totalPages > MAX_PAGES_TOTAL && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          Total pages across both manuals ({totalPages}) exceeds this prototype&apos;s {MAX_PAGES_TOTAL}-page
          limit. Replace one with a shorter document before asking.
        </div>
      )}
      {error && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}

      <section className="flex flex-col gap-3">
        {history.map((turn, i) => (
          <div key={i} className={turn.role === "user" ? "self-end text-right" : "self-start"}>
            {turn.role === "user" ? (
              <div className="inline-block rounded-lg bg-gray-900 px-3 py-2 text-sm text-white">{turn.text}</div>
            ) : turn.answer ? (
              <AnswerCard answer={turn.answer} />
            ) : (
              <div className="text-sm text-gray-500">{turn.text}</div>
            )}
          </div>
        ))}
        {isAsking && <div className="text-sm text-gray-400">Thinking…</div>}
      </section>

      <section className="sticky bottom-4 flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleRecording}
            disabled={isAsking}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white ${
              isRecording ? "bg-red-600 animate-pulse" : "bg-gray-900"
            } disabled:opacity-50`}
            aria-label={isRecording ? "Stop recording" : "Ask by voice"}
          >
            🎤
          </button>
          <div className="min-h-[1.5rem] flex-1 text-sm text-gray-500">
            {isRecording ? liveTranscript || "Listening…" : speechSupported ? "Tap the mic and ask a question" : "Voice input unavailable in this browser - type your question below"}
          </div>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAsk(typed);
          }}
        >
          <input
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Or type a question…"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={isAsking}
          />
          <button
            type="submit"
            disabled={isAsking || !typed.trim()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Ask
          </button>
        </form>
      </section>

      <MetricsPanel
        ingestMs={ingestMsBySlot}
        lastAudibleMs={lastAudibleMs}
        lastServerLatencyMs={lastServerLatencyMs}
        totalCostUsd={totalCostUsd}
        questionCount={questionCount}
      />
    </main>
  );
}
