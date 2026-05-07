import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  X, Send, User, Loader2, Trash2, UserCheck,
  Mic, MicOff, FileText, CheckCheck, ChevronDown, ChevronUp, PenLine,
  Volume2, VolumeX, Square,
} from "lucide-react";
import { useSoapNoteContext } from "@/contexts/soap-note-context";
import { useToast } from "@/hooks/use-toast";
const juneWaving = "/assets/june/june-waving.png";
const juneListening = "/assets/june/june-listening.png";
const juneIdle = "/assets/june/june-idle.png";
const juneSoap = "/assets/june/june-soap.png";
const juneAnalyzing = "/assets/june/june-analyzing.png";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  proposedEdit?: string;   // full edited note text proposed by the AI
  editApplied?: boolean;   // true once the provider clicks "Apply"
}

interface PatientContext {
  id: number;
  name: string;
}

interface AiChatDrawerProps {
  patientContext?: PatientContext | null;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatMarkdown(text: string): string {
  let html = escapeHtml(text);
  html = html
    .replace(/\*\*\[([^\]]+)\]\*\*/g, '<strong class="text-emerald-700 dark:text-emerald-400">[$1]</strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold text-sm mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-semibold text-base mt-3 mb-1">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="font-bold text-base mt-3 mb-1">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-sm">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 text-sm">$1. $2</li>')
    .replace(/\n{2,}/g, '</p><p class="text-sm leading-relaxed mt-2">')
    .replace(/\n/g, '<br/>');
  return `<p class="text-sm leading-relaxed">${html}</p>`;
}

// Detect Speech Recognition support
const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

// iOS Safari has webkitSpeechRecognition but does NOT support continuous:true —
// the session ends immediately, so the wake-word listener never stays alive.
// Detect iOS to gracefully degrade to mic-button-only mode.
const isIOS =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

// Strip markdown formatting so TTS reads clean text
function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")   // bold
    .replace(/\*([^*]+)\*/g, "$1")        // italic
    .replace(/^#{1,3} /gm, "")            // headings
    .replace(/^- /gm, "")                 // bullets
    .replace(/^\d+\. /gm, "")            // numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/`[^`]+`/g, "")             // inline code
    .trim();
}

const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

export function AiChatDrawer({ patientContext }: AiChatDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [usePatient, setUsePatient] = useState(true);
  const [hasOfferedPatient, setHasOfferedPatient] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [showNotePreview, setShowNotePreview] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speakingMsgIdxRef = useRef<number | null>(null);

  const { toast } = useToast();
  const { activeSoapNote, onApplySoapEdit } = useSoapNoteContext();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevPatientIdRef = useRef<number | null>(null);
  const requestPatientIdRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  const baseInputRef = useRef<string>("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [silenceCountdown, setSilenceCountdown] = useState(false);
  const shouldBeListeningRef = useRef(false);
  // Wake-word listener
  const wakeRecognitionRef = useRef<any>(null);
  const shouldWakeRef = useRef(false);
  const isOpenRef = useRef(false);
  const [isWakeActive, setIsWakeActive] = useState(false);
  // When the wake phrase fires we store the seed here so onend can hand off
  // to the main listener only after the wake session is fully closed.
  const wakeTransitionRef = useRef<string | null>(null);
  // ── Text-to-speech (OpenAI Nova via /api/tts, browser fallback) ──────────
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopSpeaking = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = "";
      currentAudioRef.current = null;
    }
    if (ttsSupported) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    speakingMsgIdxRef.current = null;
  }, []);

  const speakText = useCallback(async (text: string, msgIdx?: number) => {
    stopSpeaking();
    const clean = stripMarkdownForSpeech(text);
    if (!clean) return;

    setIsSpeaking(true);
    if (msgIdx !== undefined) speakingMsgIdxRef.current = msgIdx;

    try {
      // Use OpenAI Nova voice via server
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("TTS request failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setIsSpeaking(false);
        speakingMsgIdxRef.current = null;
        currentAudioRef.current = null;
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setIsSpeaking(false);
        speakingMsgIdxRef.current = null;
        currentAudioRef.current = null;
      };
      await audio.play();
    } catch {
      // Fallback to browser TTS if OpenAI TTS fails
      if (!ttsSupported) { setIsSpeaking(false); speakingMsgIdxRef.current = null; return; }
      const utter = new SpeechSynthesisUtterance(clean);
      utter.rate = 0.95;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => /samantha|karen|Google US English/i.test(v.name))
        ?? voices.find(v => v.lang.startsWith("en"));
      if (preferred) utter.voice = preferred;
      utter.onend = () => { setIsSpeaking(false); speakingMsgIdxRef.current = null; };
      utter.onerror = () => { setIsSpeaking(false); speakingMsgIdxRef.current = null; };
      window.speechSynthesis.speak(utter);
    }
  }, [stopSpeaking]);

  // Stop TTS when drawer closes or component unmounts
  useEffect(() => { if (!isOpen) stopSpeaking(); }, [isOpen, stopSpeaking]);
  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  function vlog(_msg: string) { /* diagnostic logging removed */ }

  // PATIENT-SAFETY: Clear conversation + stop recording when patient changes.
  useEffect(() => {
    const nextId = patientContext?.id ?? null;
    if (nextId !== prevPatientIdRef.current) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      stopListening();
      setMessages([]);
      setInput("");
      setUsePatient(true);
      setHasOfferedPatient(false);
      prevPatientIdRef.current = nextId;
    }
  }, [patientContext?.id]);

  // Keep isOpenRef in sync so wake-listener callbacks can read it without stale closure
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      stopListening();
      stopWakeListener();
    } else if (SpeechRecognitionAPI) {
      startWakeListener();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => () => { stopListening(); stopWakeListener(); }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => { if (isOpen && inputRef.current) inputRef.current.focus(); }, [isOpen]);
  useEffect(() => {
    if (isOpen && patientContext && !hasOfferedPatient && messages.length === 0) {
      setHasOfferedPatient(true);
    }
  }, [isOpen, patientContext, hasOfferedPatient, messages.length]);

  // ── Wake-word listener ────────────────────────────────────────────────────
  // Listens silently in the background for "Hey June" / "OK June" / "Okay June".
  // Mutually exclusive with the main mic session — browser allows only one at a time.
  //
  // Accepts:  "hey june"  "okay june"  "ok june"  "hey, june"  etc.
  const WAKE_PATTERN = /\b(?:hey|ok(?:ay)?)[,.\s]+june\b/i;
  // Strip clause used when extracting words spoken after the wake phrase.
  const WAKE_STRIP   = /.*\b(?:hey|ok(?:ay)?)[,.\s]+june[,.\s]*/i;

  function stopWakeListener() {
    shouldWakeRef.current = false;
    if (wakeRecognitionRef.current) {
      try { wakeRecognitionRef.current.stop(); } catch (_) {}
      wakeRecognitionRef.current = null;
    }
    setIsWakeActive(false);
  }

  function spawnWakeListener() {
    if (!SpeechRecognitionAPI || !shouldWakeRef.current) return;
    if (wakeRecognitionRef.current) {
      try { wakeRecognitionRef.current.stop(); } catch (_) {}
      wakeRecognitionRef.current = null;
    }
    const wr = new SpeechRecognitionAPI();
    wr.continuous = true;
    wr.interimResults = true;
    wr.lang = "en-US";
    wakeRecognitionRef.current = wr;

    wr.onstart = () => setIsWakeActive(true);

    wr.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (WAKE_PATTERN.test(t)) {
          // Store the seed so onend can hand off AFTER this session fully closes.
          // Never launch startListening here via setTimeout — Chrome only allows
          // one SpeechRecognition at a time and the overlap causes a silent drop.
          const afterWake = t.replace(WAKE_STRIP, "").trim();
          wakeTransitionRef.current = afterWake; // "" is a valid seed (no words after wake)
          if (afterWake) setInput(afterWake);
          // stopWakeListener triggers wr.stop() → onend fires → we hand off there
          stopWakeListener();
          return;
        }
      }
    };

    wr.onerror = (event: any) => {
      if (event.error === "not-allowed") {
        // Hard stop — permission denied, don't retry
        shouldWakeRef.current = false;
        wakeTransitionRef.current = null;
        setIsWakeActive(false);
        setMicError("Microphone access denied. Enable it in your browser settings to use 'Hey June'.");
        setTimeout(() => setMicError(null), 6000);
      }
      // Non-fatal errors (network, audio-capture, no-speech): let onend restart
    };

    wr.onend = () => {
      wakeRecognitionRef.current = null;
      setIsWakeActive(false);

      // Wake phrase was detected — hand off to main listener now that this
      // session is fully torn down (no overlap, no silent drop).
      if (wakeTransitionRef.current !== null) {
        const seed = wakeTransitionRef.current;
        wakeTransitionRef.current = null;
        // Small delay so Chrome fully releases the audio device before re-acquiring
        setTimeout(() => startListening(seed || undefined), 150);
        return;
      }

      if (shouldWakeRef.current) {
        // Normal restart after Chrome's ~60 s inactivity timeout
        setTimeout(() => spawnWakeListener(), 300);
      }
    };

    try { wr.start(); } catch {
      // wr.start() threw synchronously — usually means already started; retry later
      wakeRecognitionRef.current = null;
      if (shouldWakeRef.current) setTimeout(() => spawnWakeListener(), 800);
    }
  }

  function startWakeListener() {
    // iOS does not support continuous SpeechRecognition — skip entirely.
    if (!SpeechRecognitionAPI || isIOS || shouldBeListeningRef.current) return;

    const doSpawn = () => {
      stopWakeListener();
      shouldWakeRef.current = true;
      spawnWakeListener();
    };

    // Pre-check mic permission so the background listener doesn't silently die.
    // If permission is already 'granted' we skip getUserMedia to avoid the
    // pop-up appearing again. If it's 'prompt' we warm it up first.
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then(result => {
          if (result.state === "denied") return; // can't do anything
          if (result.state === "granted") { doSpawn(); return; }
          // state === "prompt" — trigger the native dialog via getUserMedia,
          // then immediately release the track and start the wake listener.
          navigator.mediaDevices
            ?.getUserMedia({ audio: true })
            .then(stream => { stream.getTracks().forEach(t => t.stop()); doSpawn(); })
            .catch(() => {
              setMicError("Microphone access denied. Enable it to use 'Hey June'.");
              setTimeout(() => setMicError(null), 6000);
            });
        })
        .catch(() => doSpawn()); // Permissions API unavailable — just try
    } else {
      doSpawn();
    }
  }

  // ── Main voice recognition ─────────────────────────────────────────────────
  const SILENCE_MS = 2500; // ms of silence after last final chunk → auto-send

  function clearSilenceTimer() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setSilenceCountdown(false);
  }

  function stopListening() {
    vlog("⏹ stopListening() called");
    shouldBeListeningRef.current = false;
    clearSilenceTimer();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }

  function startSilenceTimer() {
    clearSilenceTimer();
    setSilenceCountdown(true);
    silenceTimerRef.current = setTimeout(() => {
      vlog("⏱ silence timer fired → auto-send");
      setSilenceCountdown(false);
      const text = baseInputRef.current.trim();
      stopListening();
      if (text && !chatMutation.isPending) {
        chatMutation.mutate(text);
      }
    }, SILENCE_MS);
  }

  function spawnRecognition() {
    vlog("🎙 spawnRecognition()");
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onstart = () => { vlog("✅ onstart"); setIsListening(true); };

    recognition.onspeechstart = () => { vlog("🗣 onspeechstart"); clearSilenceTimer(); };
    recognition.onspeechend  = () => { vlog("🔇 onspeechend → starting silence timer"); startSilenceTimer(); };

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      const combined = baseInputRef.current
        ? `${baseInputRef.current.trimEnd()} ${final || interim}`.trim()
        : (final || interim).trim();
      setInput(combined);
      if (final) {
        vlog(`📝 final: "${final.slice(0, 40)}${final.length > 40 ? "…" : ""}"`);
        baseInputRef.current = combined;
        // onspeechend drives the silence timer; onresult only clears it
        // on interim results so a final chunk mid-sentence doesn't trigger it
      } else {
        clearSilenceTimer();
      }
    };

    recognition.onerror = (event: any) => {
      vlog(`❌ onerror: ${event.error}`);
      if (event.error === "not-allowed") {
        setMicError("Microphone access denied. Check your browser permissions.");
        setTimeout(() => setMicError(null), 5000);
        shouldBeListeningRef.current = false;
        clearSilenceTimer();
        setIsListening(false);
        recognitionRef.current = null;
      }
      // non-fatal errors: let onend fire and auto-restart
    };

    recognition.onend = () => {
      vlog(`🔚 onend (shouldBe=${shouldBeListeningRef.current})`);
      recognitionRef.current = null;
      if (shouldBeListeningRef.current) {
        setTimeout(() => {
          if (shouldBeListeningRef.current) {
            vlog("♻️ auto-restarting…");
            spawnRecognition();
          }
        }, 300);
      } else {
        clearSilenceTimer();
        setIsListening(false);
        setTimeout(() => inputRef.current?.focus(), 50);
        // Resume wake-word listener once main session fully ends
        if (isOpenRef.current && SpeechRecognitionAPI) {
          setTimeout(() => startWakeListener(), 400);
        }
      }
    };

    try {
      recognition.start();
    } catch {
      vlog("💥 recognition.start() threw");
      setMicError("Could not start microphone. Please try again.");
      setTimeout(() => setMicError(null), 4000);
      shouldBeListeningRef.current = false;
      setIsListening(false);
    }
  }

  function startListening(preSeed?: string) {
    if (!SpeechRecognitionAPI) {
      setMicError("Voice input isn't supported in this browser. Try Chrome.");
      setTimeout(() => setMicError(null), 4000);
      return;
    }
    stopWakeListener(); // wake and main are mutually exclusive
    setMicError(null);
    // When triggered by the wake-word path a preSeed is supplied so we never
    // overwrite it with the stale React `input` state (which hasn't committed yet).
    baseInputRef.current = preSeed !== undefined ? preSeed : input;
    shouldBeListeningRef.current = true;
    spawnRecognition();
  }

  function toggleListening() { isListening ? stopListening() : startListening(); }

  // ── Chat mutation ─────────────────────────────────────────────────────────
  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const newMessages: ChatMessage[] = [...messages, { role: "user", content: userMessage }];
      setMessages(newMessages);
      setInput("");
      baseInputRef.current = "";

      const issuedForPatientId = usePatient && patientContext ? patientContext.id : null;
      requestPatientIdRef.current = issuedForPatientId;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const res = await apiRequest("POST", "/api/ai-chat", {
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        patientId: issuedForPatientId ?? undefined,
        // Send the active SOAP note when one is open so the AI can read + edit it
        soapNote: activeSoapNote ?? undefined,
      }, { signal: controller.signal });

      const data = await res.json();
      return { data, issuedForPatientId };
    },
    onSuccess: ({ data, issuedForPatientId }: { data: any; issuedForPatientId: number | null }) => {
      const currentPatientId = patientContext?.id ?? null;
      if (issuedForPatientId !== currentPatientId) return;

      const reply: string = data.reply ?? "I wasn't able to generate a response.";
      const editedNote: string | null = data.editedNote ?? null;

      setMessages(prev => {
        const next = [...prev, {
          role: "assistant" as const,
          content: reply,
          proposedEdit: editedNote ?? undefined,
          editApplied: false,
        }];
        // Auto-speak when TTS is enabled (read after state settles)
        if (ttsEnabled) {
          setTimeout(() => speakText(reply, next.length - 1), 80);
        }
        return next;
      });
    },
    onError: (err: Error) => {
      const issuedForPatientId = requestPatientIdRef.current;
      const currentPatientId = patientContext?.id ?? null;
      if (issuedForPatientId !== currentPatientId) return;
      const cleanMsg = err.message?.includes("{") ? "Something went wrong reaching the AI service." : err.message;
      setMessages(prev => [...prev, { role: "assistant", content: `I apologize — ${cleanMsg || "something went wrong"}. Please try again.` }]);
    },
  });

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;
    stopListening();
    chatMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleClearChat = () => { setMessages([]); setHasOfferedPatient(false); };

  const handleApplyEdit = (msgIdx: number, newNote: string) => {
    if (!onApplySoapEdit) {
      toast({ title: "No note open", description: "Open a SOAP note in the encounter editor first.", variant: "destructive" });
      return;
    }
    onApplySoapEdit(newNote);
    setMessages(prev => prev.map((m, i) => i === msgIdx ? { ...m, editApplied: true } : m));
    toast({ title: "Note updated", description: "June's changes were applied. Review and save when ready." });
  };

  const soapNoteActive = !!activeSoapNote && !!onApplySoapEdit;

  // ── June avatar state ─────────────────────────────────────────────────────
  const juneState = chatMutation.isPending
    ? (soapNoteActive ? "soap" : "analyzing")
    : isListening || isWakeActive
    ? "listening"
    : isSpeaking
    ? "waving"
    : "idle";

  const juneImage = {
    idle:      juneIdle,
    listening: juneListening,
    analyzing: juneAnalyzing,
    soap:      juneSoap,
    waving:    juneWaving,
  }[juneState];

  const juneStateLabel = isWakeActive && !isListening
    ? 'Say "Hey June"'
    : isListening
    ? "Listening…"
    : chatMutation.isPending
    ? (soapNoteActive ? "Updating note…" : "Thinking…")
    : isSpeaking
    ? "Speaking…"
    : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-1 rounded-full pl-1 pr-4 py-1 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
          style={{ backgroundColor: "#2e3a20" }}
          data-testid="button-open-ai-chat"
        >
          <img src={juneWaving} alt="June" className="h-9 w-auto object-contain drop-shadow-sm" />
          <span className="text-sm font-medium">Ask June</span>
        </button>
      )}

      {isOpen && (
        <div
          className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 flex flex-col w-full sm:w-[430px] h-[100dvh] sm:h-[640px] sm:max-h-[85vh] bg-background border border-border sm:rounded-lg shadow-2xl overflow-hidden"
          data-testid="panel-ai-chat"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-3 py-1 border-b flex-shrink-0" style={{ backgroundColor: "#2e3a20" }}>
            <div className="flex items-center gap-2 min-w-0">
              <img src={juneWaving} alt="June" className="h-10 w-auto object-contain flex-shrink-0 drop-shadow-sm" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white truncate">June</h3>
                <p className="text-xs text-white/70 truncate">AI Clinical Colleague · ClinIQ</p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Stop speaking button — visible only while TTS is active */}
              {isSpeaking && (
                <Button size="icon" variant="ghost" onClick={stopSpeaking} className="text-amber-300 no-default-hover-elevate hover:bg-white/10" title="Stop speaking" data-testid="button-tts-stop">
                  <Square className="w-4 h-4 fill-amber-300" />
                </Button>
              )}
              {/* TTS toggle */}
              {ttsSupported && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => { setTtsEnabled(v => !v); if (isSpeaking) stopSpeaking(); }}
                  className={`no-default-hover-elevate hover:bg-white/10 ${ttsEnabled ? "text-emerald-300" : "text-white/60"}`}
                  title={ttsEnabled ? "Voice replies on — click to mute" : "Voice replies off — click to enable"}
                  data-testid="button-tts-toggle"
                >
                  {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </Button>
              )}
              {messages.length > 0 && (
                <Button size="icon" variant="ghost" onClick={handleClearChat} className="text-white/80 hover:text-white no-default-hover-elevate hover:bg-white/10" data-testid="button-clear-chat">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white no-default-hover-elevate hover:bg-white/10" data-testid="button-close-ai-chat">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Patient context bar */}
          {patientContext && (
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-emerald-50/60 dark:bg-emerald-950/20 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <UserCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 flex-shrink-0" />
                <span className="text-xs text-emerald-800 dark:text-emerald-300 truncate">
                  {usePatient ? `Discussing: ${patientContext.name}` : "Patient context off"}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setUsePatient(!usePatient)} className="text-xs h-6 px-2 flex-shrink-0" data-testid="button-toggle-patient-context">
                {usePatient ? "Disconnect" : "Connect"}
              </Button>
            </div>
          )}

          {/* SOAP note active bar */}
          {soapNoteActive && (
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-blue-50/60 dark:bg-blue-950/20 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <PenLine className="w-4 h-4 text-blue-700 dark:text-blue-400 flex-shrink-0" />
                <span className="text-xs text-blue-800 dark:text-blue-300 truncate">
                  SOAP note loaded — I can read and edit it
                </span>
              </div>
              <button
                onClick={() => setShowNotePreview(v => !v)}
                className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 flex-shrink-0"
                data-testid="button-toggle-note-preview"
              >
                Preview
                {showNotePreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          )}

          {/* SOAP note preview (collapsed by default) */}
          {soapNoteActive && showNotePreview && (
            <div className="border-b bg-blue-50/30 dark:bg-blue-950/10 px-4 py-2 flex-shrink-0 max-h-36 overflow-y-auto">
              <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                {activeSoapNote!.slice(0, 800)}{activeSoapNote!.length > 800 ? "\n…(truncated)" : ""}
              </pre>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4 space-y-3">
                <img src={juneWaving} alt="June" className="h-28 w-auto object-contain drop-shadow-sm" />
                <div className="space-y-2">
                  {soapNoteActive ? (
                    <>
                      <p className="text-sm font-medium">Hey, June here. Note is loaded.</p>
                      <p className="text-xs text-muted-foreground">
                        Ask me to add, edit, or refine any section — or a clinical question. I'll walk you through exactly what I changed before applying anything.
                      </p>
                    </>
                  ) : patientContext && usePatient ? (
                    <>
                      <p className="text-sm font-medium">Hey, I'm June.</p>
                      <p className="text-xs text-muted-foreground">
                        I have <span className="font-medium text-foreground">{patientContext.name}</span>'s chart and labs loaded. Ask me anything about their case, or let's discuss something else entirely.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium">Hey, I'm June.</p>
                      <p className="text-xs text-muted-foreground">
                        Your AI clinical colleague — built on real-world protocols, optimized lab ranges, and clinical pattern recognition.
                      </p>
                      <div className="text-left text-xs text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground text-xs">Ask me to:</p>
                        <ul className="space-y-0.5 ml-1">
                          <li className="flex gap-1.5 items-start"><span>&#8226;</span> Interpret labs with context</li>
                          <li className="flex gap-1.5 items-start"><span>&#8226;</span> Identify hormone & metabolic patterns</li>
                          <li className="flex gap-1.5 items-start"><span>&#8226;</span> Edit and refine open SOAP notes</li>
                          <li className="flex gap-1.5 items-start"><span>&#8226;</span> Pressure-test treatment plans</li>
                        </ul>
                      </div>
                    </>
                  )}
                </div>

                {/* Quick-prompt chips */}
                <div className="flex flex-wrap justify-center gap-2">
                  {soapNoteActive ? (
                    <>
                      <Badge variant="outline" className="cursor-pointer text-xs" onClick={() => { setInput("Add a GLP-1 differential statement to the assessment."); inputRef.current?.focus(); }}>Add GLP-1 differential</Badge>
                      <Badge variant="outline" className="cursor-pointer text-xs" onClick={() => { setInput("Make the assessment section more detailed."); inputRef.current?.focus(); }}>Expand assessment</Badge>
                      <Badge variant="outline" className="cursor-pointer text-xs" onClick={() => { setInput("Add a follow-up plan to the plan section."); inputRef.current?.focus(); }}>Add follow-up plan</Badge>
                    </>
                  ) : patientContext && usePatient ? (
                    <>
                      <Badge variant="outline" className="cursor-pointer text-xs" onClick={() => { setInput("What patterns do you see in this patient's latest labs?"); inputRef.current?.focus(); }} data-testid="badge-quick-labs">Lab patterns</Badge>
                      <Badge variant="outline" className="cursor-pointer text-xs" onClick={() => { setInput("Any red flags or concerns I should address?"); inputRef.current?.focus(); }} data-testid="badge-quick-flags">Red flags</Badge>
                      <Badge variant="outline" className="cursor-pointer text-xs" onClick={() => { setInput("What supplements would you recommend for this patient?"); inputRef.current?.focus(); }} data-testid="badge-quick-supps">Supplements</Badge>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className="cursor-pointer text-xs" onClick={() => { setInput("When should I consider an AI anastrozole in TRT patients?"); inputRef.current?.focus(); }} data-testid="badge-quick-ai">TRT protocols</Badge>
                      <Badge variant="outline" className="cursor-pointer text-xs" onClick={() => { setInput("Walk me through insulin resistance phenotypes"); inputRef.current?.focus(); }} data-testid="badge-quick-ir">Insulin resistance</Badge>
                      <Badge variant="outline" className="cursor-pointer text-xs" onClick={() => { setInput("What's the latest on ApoB vs LDL for risk assessment?"); inputRef.current?.focus(); }} data-testid="badge-quick-lipids">Lipid markers</Badge>
                    </>
                  )}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`chat-message-${i}`}>
                {msg.role === "assistant" && (
                  <img src={juneIdle} alt="June" className="w-8 h-8 object-contain flex-shrink-0 mt-0.5" />
                )}
                <div className="max-w-[82%] space-y-1.5">
                  <div className={`rounded-lg px-3 py-2 ${msg.role === "user" ? "text-white text-sm" : "bg-muted"}`}
                    style={msg.role === "user" ? { backgroundColor: "#2e3a20" } : undefined}>
                    {msg.role === "user" ? (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none [&_li]:list-disc [&_strong]:font-semibold"
                        dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                      />
                    )}
                  </div>

                  {/* Action row for assistant messages */}
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Replay TTS for this message */}
                      {ttsSupported && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-6 w-6 ${speakingMsgIdxRef.current === i && isSpeaking ? "text-amber-500" : "text-muted-foreground"}`}
                          onClick={() => speakingMsgIdxRef.current === i && isSpeaking ? stopSpeaking() : speakText(msg.content, i)}
                          title={speakingMsgIdxRef.current === i && isSpeaking ? "Stop" : "Read aloud"}
                          data-testid={`button-speak-msg-${i}`}
                        >
                          {speakingMsgIdxRef.current === i && isSpeaking
                            ? <Square className="w-3 h-3 fill-current" />
                            : <Volume2 className="w-3 h-3" />}
                        </Button>
                      )}
                      {/* Apply-to-note button — shown when AI proposed an edit */}
                      {msg.proposedEdit && (
                        msg.editApplied ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 px-1">
                            <CheckCheck className="w-3.5 h-3.5" />
                            Applied to note
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1.5"
                            style={{ backgroundColor: "#2e3a20", color: "#fff" }}
                            onClick={() => handleApplyEdit(i, msg.proposedEdit!)}
                            data-testid={`button-apply-soap-edit-${i}`}
                          >
                            <FileText className="w-3 h-3" />
                            Apply to note
                          </Button>
                        )
                      )}
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {chatMutation.isPending && (
              <div className="flex gap-2 items-start" data-testid="chat-loading">
                <img src={juneAnalyzing} alt="June" className="w-8 h-8 object-contain flex-shrink-0" />
                <div className="bg-muted rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{soapNoteActive ? "Reading note and thinking…" : "Thinking…"}</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t px-3 pt-1 pb-2 bg-background flex-shrink-0">
            <p className="text-[10px] text-muted-foreground text-center mb-1">
              AI assistant — clinical decisions are yours. Always verify recommendations.
            </p>

            {/* Mic error */}
            {micError && <p className="text-xs text-destructive mb-1 px-1">{micError}</p>}

            <div className="flex items-end gap-2">
              {/* June state avatar — swaps image based on what she's doing */}
              <div className="flex-shrink-0 flex flex-col items-center justify-end" style={{ width: 44 }}>
                <img
                  key={juneState}
                  src={juneImage}
                  alt="June"
                  className="w-full object-contain"
                  style={{ height: 60 }}
                />
                {juneStateLabel && (
                  <span
                    className={`text-[9px] leading-tight text-center mt-0.5 font-medium ${
                      isListening && !silenceCountdown
                        ? "text-red-500 animate-pulse"
                        : isListening && silenceCountdown
                        ? "text-amber-500"
                        : isWakeActive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {silenceCountdown ? "Pause…" : juneStateLabel}
                  </span>
                )}
              </div>

              <div className="flex-1 flex flex-col gap-1 min-w-0">
                {/* Silence countdown bar */}
                {isListening && silenceCountdown && (
                  <div className="h-0.5 w-full rounded-full bg-amber-100 dark:bg-amber-900/30 overflow-hidden">
                    <div className="h-full bg-amber-400 dark:bg-amber-500 animate-[shrink_2.5s_linear_forwards] rounded-full" />
                  </div>
                )}
                {/* iOS tap-to-speak hint (no wake-word support) */}
                {isIOS && SpeechRecognitionAPI && !isListening && (
                  <p className="text-[10px] text-muted-foreground px-1">Tap the mic to speak</p>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      isListening ? "Listening…"
                        : soapNoteActive ? "Hey June, edit the note… or ask a clinical question"
                        : "Hey June… or ask a clinical question"
                    }
                    rows={1}
                    className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 max-h-24 min-h-[36px]"
                    style={{ lineHeight: "1.5" }}
                    data-testid="input-ai-chat"
                  />
                  {SpeechRecognitionAPI && (
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={toggleListening}
                      disabled={chatMutation.isPending}
                      data-testid="button-mic-ai-chat"
                      className={isListening ? "border-red-400 text-red-500 bg-red-50 dark:bg-red-950/30 no-default-hover-elevate" : ""}
                      title={isListening ? "Stop listening" : "Speak to June"}
                    >
                      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </Button>
                  )}
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!input.trim() || chatMutation.isPending}
                    style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}
                    data-testid="button-send-ai-chat"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
