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

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}
function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

const SUGGESTIONS = [
  "What are the setup steps?",
  "What are the operating limits?",
  "Is there an exception to any of the limits?",
];

export default function Home() {
  const [manuals, setManuals] = useState<Record<SlotId, ManualSlot | null>>({ A: null, B: null });
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
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    setSpeechSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    const applied = document.documentElement.getAttribute("data-theme");
    setIsDark(applied ? applied === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore - theme just won't persist across reloads
    }
    setIsDark(next === "dark");
  }, [isDark]);

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

  const handleUpload = useCallback(
    async (slot: SlotId, file: File) => {
      const existing = manuals[slot];
      if (existing) {
        const ok = window.confirm(
          `Replace previously uploaded manual "${existing.title}" with "${file.name}"?\n` +
            "The next question will be answered from the new document instead.",
        );
        if (!ok) return;
      }
      const defaultName = file.name.replace(/\.pdf$/i, "");
      const typed = window.prompt("Name this manual (optional):", defaultName);
      const name = typed && typed.trim() ? typed.trim() : defaultName;

      setError(null);
      setIngestingSlot(slot);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("title", name);
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
    },
    [manuals],
  );

  const ingestMsBySlot = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of SLOTS) if (manuals[s]) out[s] = manuals[s]!.ingestMs;
    return out;
  }, [manuals]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="app-mark size-header">
            <MicGlyph />
          </span>
          <h1 className="text-lg font-semibold">Ask Your Documents by Voice</h1>
        </div>
        <button
          className="theme-switch"
          data-theme-on={isDark}
          onClick={toggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          <SunIcon />
          <MoonIcon />
          <span className="theme-switch-thumb">{isDark ? <MoonIcon /> : <SunIcon />}</span>
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {SLOTS.map((slot) =>
          manuals[slot] ? (
            <label key={slot} className="manual-chip filled" title="Click to replace this manual">
              <span className="dot" />
              <span className="font-medium">{manuals[slot]!.title}</span>
              <span className="mono" style={{ color: "var(--ink-dim)" }}>
                {manuals[slot]!.pages.length}p
              </span>
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
          ) : (
            <label key={slot} className="manual-chip empty">
              <span>{ingestingSlot === slot ? "Uploading…" : `+ Add manual ${slot}`}</span>
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
          ),
        )}
        <span className="mono text-xs" style={{ color: "var(--ink-dim)" }}>
          up to 2 PDFs, {MAX_PAGES_TOTAL} pages total
        </span>
      </div>

      {totalPages > MAX_PAGES_TOTAL && (
        <div className="banner p-2.5 text-sm">
          Total pages across both manuals ({totalPages}) exceeds this prototype&apos;s {MAX_PAGES_TOTAL}-page
          limit. Replace one with a shorter document before asking.
        </div>
      )}
      {error && <div className="banner p-2.5 text-sm">{error}</div>}

      <section className="flex flex-col gap-4">
        {history.length === 0 && (
          <div className="msg-enter flex flex-col gap-2 py-6">
            <div className="flex items-center gap-2.5">
              <span className="app-mark size-avatar">
                <MicGlyph />
              </span>
              <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
                Upload a manual, then ask something like:
              </p>
            </div>
            <div className="ml-[34px] flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="suggestion-chip" onClick={() => void handleAsk(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {history.map((turn, i) => (
          <div key={i} className={`msg-enter ${turn.role === "user" ? "self-end text-right" : "flex w-full gap-2.5"}`}>
            {turn.role === "user" ? (
              <div className="bubble-user inline-block px-3.5 py-2.5 text-sm">{turn.text}</div>
            ) : (
              <>
                <span className="app-mark size-avatar">
                  <MicGlyph />
                </span>
                <div className="min-w-0 flex-1">
                  {turn.answer ? (
                    <AnswerCard answer={turn.answer} />
                  ) : (
                    <div className="text-sm" style={{ color: "var(--ink-dim)" }}>
                      {turn.text}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </section>

      <div
        className={`glow-wrap ${isAsking ? "active" : ""}`}
        style={{ position: "sticky", bottom: 14, borderRadius: 26 }}
      >
        <div className="glow-ring" />
        <section className="composer glow-surface flex flex-col gap-2 p-3">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleRecording}
              disabled={isAsking}
              className={`mic-btn ${isRecording ? "recording" : ""}`}
              aria-label={isRecording ? "Stop recording" : "Ask by voice"}
            >
              <MicGlyph />
            </button>
            <div className="flex min-h-[1.5rem] flex-1 items-center gap-2 text-sm" style={{ color: "var(--ink-dim)" }}>
              {isAsking ? (
                <>
                  <span className="thinking-dot" style={{ animationDelay: "0ms" }} />
                  <span className="thinking-dot" style={{ animationDelay: "150ms" }} />
                  <span className="thinking-dot" style={{ animationDelay: "300ms" }} />
                  <span>Claude is reading the manual…</span>
                </>
              ) : isRecording ? (
                liveTranscript || "Listening…"
              ) : speechSupported ? (
                "Tap the mic and ask a question"
              ) : (
                "Voice input unavailable in this browser - type your question below"
              )}
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
              className="field flex-1 px-3 py-2 text-sm"
              placeholder="Or type a question…"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={isAsking}
            />
            <button
              type="submit"
              disabled={isAsking || !typed.trim()}
              className="btn btn-primary rounded-full px-4 py-2 text-sm"
            >
              Ask
            </button>
          </form>
        </section>
      </div>

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
