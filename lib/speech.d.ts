export {};

declare global {
  interface SpeechRecognitionResultLike {
    isFinal: boolean;
    0: { transcript: string };
    length: number;
  }
  interface SpeechRecognitionEventLike extends Event {
    resultIndex: number;
    results: ArrayLike<SpeechRecognitionResultLike>;
  }
  interface SpeechRecognitionLike extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onend: (() => void) | null;
    onerror: ((event: Event) => void) | null;
    start(): void;
    stop(): void;
  }
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}
