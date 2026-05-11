import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  X, Send, User, Loader2, Trash2, UserCheck,
  Mic, MicOff, FileText, CheckCheck, ChevronDown, ChevronUp, PenLine,
  Volume2, VolumeX, Square, Settings2, RotateCcw,
} from "lucide-react";
import { useLocation } from "wouter";
import { useSoapNoteContext } from "@/contexts/soap-note-context";
import { useToast } from "@/hooks/use-toast";
import { useRecording } from "@/contexts/recording-context";
import juneWaving from "../assets/june/june-waving.webp";
import juneListening from "../assets/june/june-listening.webp";
import juneIdle from "../assets/june/june-idle.webp";
import juneSoap from "../assets/june/june-soap.webp";
import juneAnalyzing from "../assets/june/june-analyzing.webp";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  spoken?: string;         // short spoken summary — used for TTS replay
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
    .replace(/^&gt; (.+)$/gm, '<div class="border-l-2 border-primary/40 pl-3 py-0.5 my-0.5 text-sm text-muted-foreground italic">$1</div>')
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
    // Remove third-person self-references that slip through (**June's X:** or June's X:)
    .replace(/\*{1,2}June'?s?\s+[^:*\n]+:\*{1,2}\s*/gi, "")
    .replace(/^June'?s?\s+[^:\n]+:\s*/gim, "")
    // Remove any bold/italic section headers (e.g. **Observations:**)
    .replace(/\*{1,2}[A-Z][^:*\n]{1,40}:\*{1,2}\s*/g, "")
    // Strip remaining markdown
    .replace(/\*\*([^*]+)\*\*/g, "$1")       // bold → plain
    .replace(/\*([^*]+)\*/g, "$1")           // italic → plain
    .replace(/^#{1,3} .+$/gm, "")           // headings
    .replace(/^[•\-\*] /gm, "")             // bullets
    .replace(/^\d+\.\s+/gm, "")            // numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → text
    .replace(/`[^`]+`/g, "")               // inline code
    .replace(/\n{2,}/g, " ")               // paragraph breaks → space
    .replace(/\n/g, " ")                   // line breaks → space
    .replace(/\s{2,}/g, " ")              // collapse whitespace
    .trim();
}

// When the server doesn't send a [SPOKEN] block, build a natural 2-sentence
// spoken intro from the reply rather than reading the whole thing verbatim.
function makeFallbackSpoken(reply: string): string {
  const clean = stripMarkdownForSpeech(reply);
  if (!clean) return "";
  // Split on sentence boundaries and take up to 2 sentences / ~55 words
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [];
  const result: string[] = [];
  let wordCount = 0;
  for (const s of sentences) {
    const words = s.trim().split(/\s+/).length;
    if (result.length > 0 && wordCount + words > 55) break;
    result.push(s.trim());
    wordCount += words;
    if (result.length >= 2) break;
  }
  return result.join(" ") || clean.slice(0, 240);
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
  const [hasJuneEdits, setHasJuneEdits] = useState(false);
  const speakingMsgIdxRef = useRef<number | null>(null);
  // Frozen snapshot of the note BEFORE any June edits — used by Revert
  const originalNoteRef = useRef<string | null>(null);

  const { toast } = useToast();
  const { activeSoapNote, onApplySoapEdit } = useSoapNoteContext();
  const { state: recordingState } = useRecording();
  // True while the encounter transcription recorder is actively capturing audio.
  // June's wake-word listener and mic button are suppressed during this window
  // so she cannot accidentally capture and forward patient encounter audio.
  const encounterRecordingActive = recordingState === "recording";

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
  const isOpenRef = useRef(false);
  // ── Voice Session Mode ────────────────────────────────────────────────────
  // When true the immersive voice panel overlays the chat content area.
  const [voiceSessionMode, setVoiceSessionMode] = useState(false);
  const voiceSessionRef = useRef(false);   // readable inside mutation callbacks
  const [speechDetected, setSpeechDetected] = useState(false);
  // ── Text-to-speech (OpenAI Nova via /api/tts, browser fallback) ──────────
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  // Each speakText() call gets a unique session number. The catch block checks
  // this before running the browser-speech fallback — if the session no longer
  // matches, stopSpeaking() superseded this call and we must NOT fire the fallback
  // (otherwise clearing audio.src triggers onerror → catch → double voice).
  const ttsSessionRef = useRef(0);
  // iOS Safari blocks audio.play() unless the audio context was first unlocked
  // by a synchronous user gesture. We unlock it on the first send/mic tap.
  const audioUnlockedRef = useRef(false);
  // When iOS blocks auto-play we store the text here so the user can tap to hear
  const [pendingTts, setPendingTts] = useState<{ text: string; msgIdx: number } | null>(null);

  const unlockAudioContext = useCallback(() => {
    if (audioUnlockedRef.current) return;
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      src.onended = () => { audioUnlockedRef.current = true; try { ctx.close(); } catch (_) {} };
    } catch (_) {}
  }, []);

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
    // Bump session BEFORE stopSpeaking so the old call's onerror/catch can
    // detect it was superseded and skip the browser-speech fallback.
    ttsSessionRef.current += 1;
    const thisSession = ttsSessionRef.current;

    stopSpeaking();
    setPendingTts(null);
    const clean = stripMarkdownForSpeech(text);
    if (!clean) return;

    setIsSpeaking(true);
    if (msgIdx !== undefined) speakingMsgIdxRef.current = msgIdx;

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("TTS request failed");

      // Streaming playback — start audio on first chunk instead of waiting for the full file.
      // MediaSource is supported on Chrome/Edge/Firefox. iOS Safari falls back to full-blob.
      const supportsStreaming =
        typeof MediaSource !== "undefined" &&
        MediaSource.isTypeSupported("audio/mpeg") &&
        !!res.body;

      if (supportsStreaming) {
        await new Promise<void>((resolve, reject) => {
          const ms = new MediaSource();
          const audioUrl = URL.createObjectURL(ms);
          const audio = new Audio(audioUrl);
          currentAudioRef.current = audio;

          const cleanup = (err?: any) => {
            URL.revokeObjectURL(audioUrl);
            setIsSpeaking(false);
            speakingMsgIdxRef.current = null;
            currentAudioRef.current = null;
            if (err) reject(err); else resolve();
          };
          audio.onended = () => cleanup();
          audio.onerror = () => cleanup(new Error("audio error"));

          ms.addEventListener("sourceopen", async () => {
            try {
              const sb = ms.addSourceBuffer("audio/mpeg");
              const reader = res.body!.getReader();
              let started = false;

              const pump = async (): Promise<void> => {
                const { done, value } = await reader.read();
                if (done) {
                  await new Promise<void>(r => {
                    if (sb.updating) sb.addEventListener("updateend", () => { try { ms.endOfStream(); } catch {} r(); }, { once: true });
                    else { try { ms.endOfStream(); } catch {} r(); }
                  });
                  return;
                }
                if (!value?.byteLength) { await pump(); return; }
                if (sb.updating) {
                  await new Promise(r => sb.addEventListener("updateend", r, { once: true }));
                }
                sb.appendBuffer(value);
                await new Promise(r => sb.addEventListener("updateend", r, { once: true }));
                if (!started) { started = true; audio.play().catch(reject); }
                await pump();
              };

              await pump();
            } catch (e) {
              cleanup(e);
            }
          });
        });
      } else {
        // iOS Safari / fallback: full blob
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
      }
    } catch (err: any) {
      // If stopSpeaking() cleared audio.src it triggers onerror → reject → here.
      // Guard: if another speakText() call has already taken over, exit silently —
      // running the browser-speech fallback here would cause two voices at once.
      if (thisSession !== ttsSessionRef.current) {
        return;
      }
      // On iOS, if play() was blocked by autoplay policy, surface a tap-to-play button
      if (isIOS && err?.name === "NotAllowedError" && msgIdx !== undefined) {
        setIsSpeaking(false);
        speakingMsgIdxRef.current = null;
        setPendingTts({ text, msgIdx });
        return;
      }
      // Fallback to browser TTS only when the /api/tts request itself genuinely failed
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
  // Keep voiceSessionRef in sync so mutation callbacks can read it without stale closures
  useEffect(() => { voiceSessionRef.current = voiceSessionMode; }, [voiceSessionMode]);

  useEffect(() => {
    if (!isOpen) { stopListening(); setVoiceSessionMode(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Encounter recorder interlock ──────────────────────────────────────────
  // When the encounter transcription recorder goes active, stop June's mic
  // listener immediately so she never captures patient encounter audio.
  useEffect(() => {
    if (encounterRecordingActive) { stopListening(); setVoiceSessionMode(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterRecordingActive]);

  useEffect(() => () => { stopListening(); }, []);

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
    setSpeechDetected(false);
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
      // Keep voiceSessionMode open — it will switch to "thinking" state
      if (text && !chatMutation.isPending) {
        chatMutation.mutate(text);
      } else if (!text) {
        // Nothing to send, close voice session gracefully
        setVoiceSessionMode(false);
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

    recognition.onspeechstart = () => { vlog("🗣 onspeechstart"); setSpeechDetected(true); clearSilenceTimer(); };
    recognition.onspeechend  = () => { vlog("🔇 onspeechend → starting silence timer"); setSpeechDetected(false); startSilenceTimer(); };

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
              // nothing to restart — tap-to-speak only
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

  function startListening() {
    if (!SpeechRecognitionAPI) {
      setMicError("Voice input isn't supported in this browser. Try Chrome.");
      setTimeout(() => setMicError(null), 4000);
      return;
    }
    setMicError(null);
    baseInputRef.current = input;
    shouldBeListeningRef.current = true;
    spawnRecognition();
  }

  function openVoiceSession() {
    if (encounterRecordingActive) return;
    setVoiceSessionMode(true);
    startListening();
  }

  function handleVoiceDone() {
    const text = baseInputRef.current.trim() || input.trim();
    stopListening();
    if (text && !chatMutation.isPending) {
      // Keep voiceSessionMode true — panel switches to "thinking" view
      chatMutation.mutate(text);
    } else {
      setVoiceSessionMode(false);
    }
  }

  function handleVoiceCancel() {
    stopListening();
    setInput("");
    baseInputRef.current = "";
    setVoiceSessionMode(false);
  }

  function toggleListening() {
    if (isListening) {
      stopListening();
      setVoiceSessionMode(false);
    } else {
      openVoiceSession();
    }
  }

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
      const spoken: string | null = data.spoken ?? null;
      const editedNote: string | null = data.editedNote ?? null;

      // Close the voice session overlay so the reply appears in the chat
      if (voiceSessionRef.current) setVoiceSessionMode(false);

      setMessages(prev => {
        const spokenForMsg = spoken ? spoken : makeFallbackSpoken(reply);
        const next = [...prev, {
          role: "assistant" as const,
          content: reply,
          spoken: spokenForMsg,   // saved so replay button uses same short summary
          proposedEdit: editedNote ?? undefined,
          editApplied: false,
        }];
        // Speak the short spoken summary when available.
        // When absent, use a smart 2-sentence fallback instead of reading
        // the entire formatted reply verbatim (which sounds robotic and reads
        // things like "June's Observations:" out loud).
        if (ttsEnabled) {
          setTimeout(() => speakText(spokenForMsg, next.length - 1), 80);
        }
        return next;
      });
    },
    onError: (err: Error) => {
      const issuedForPatientId = requestPatientIdRef.current;
      const currentPatientId = patientContext?.id ?? null;
      if (issuedForPatientId !== currentPatientId) return;
      if (voiceSessionRef.current) setVoiceSessionMode(false);
      const msg = err.message ?? "";
      // "Failed to fetch" (Android/Chrome) and "Load failed" (iOS Safari) are
      // network-layer errors — the AI never failed, the connection did.
      const isNetworkError = /failed to fetch|load failed|networkerror|network error|the internet connection appears to be offline|could not connect/i.test(msg);
      // AbortError fires if the AbortController cancelled the request
      const isAbort = err.name === "AbortError" || /aborted|abort/i.test(msg);
      // 500 JSON body from the server gets forwarded as "500: {...}" — strip it
      const isServerJson = msg.includes("{");
      const displayMsg = isNetworkError || isAbort
        ? "It looks like there was a connection hiccup — this can happen on mobile when signal is spotty or the screen locked mid-request. Please try again."
        : isServerJson
          ? "Something went wrong reaching the AI service. Please try again in a moment."
          : (msg || "Something went wrong. Please try again.");
      setMessages(prev => [...prev, { role: "assistant", content: displayMsg }]);
    },
  });

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;
    unlockAudioContext();
    stopListening();
    chatMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleClearChat = () => { setMessages([]); setHasOfferedPatient(false); };

  // Capture a snapshot of the note the first time it becomes active so we can
  // offer a true one-click Revert that bypasses June entirely.
  useEffect(() => {
    if (activeSoapNote && !originalNoteRef.current) {
      originalNoteRef.current = activeSoapNote;
      setHasJuneEdits(false);
    }
    if (!activeSoapNote) {
      originalNoteRef.current = null;
      setHasJuneEdits(false);
    }
  }, [activeSoapNote]);

  const handleApplyEdit = (msgIdx: number, newNote: string) => {
    if (!onApplySoapEdit) {
      toast({ title: "No note open", description: "Open a SOAP note in the encounter editor first.", variant: "destructive" });
      return;
    }
    onApplySoapEdit(newNote);
    setHasJuneEdits(true);
    setMessages(prev => prev.map((m, i) => i === msgIdx ? { ...m, editApplied: true } : m));
    toast({ title: "Note updated", description: "June's changes were applied. Review and save when ready." });
  };

  const handleRevertNote = () => {
    if (!originalNoteRef.current || !onApplySoapEdit) return;
    onApplySoapEdit(originalNoteRef.current);
    setHasJuneEdits(false);
    // Mark all applied edits as un-applied so buttons appear again
    setMessages(prev => prev.map(m => ({ ...m, editApplied: false })));
    toast({ title: "Note reverted", description: "Restored to the original version before June's edits." });
  };

  const soapNoteActive = !!activeSoapNote && !!onApplySoapEdit;

  // ── June avatar state ─────────────────────────────────────────────────────
  const juneState = chatMutation.isPending
    ? (soapNoteActive ? "soap" : "analyzing")
    : isListening
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

  const juneStateLabel = isListening
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
          <img src={juneWaving} alt="June" className="h-9 w-auto object-contain" />
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
              <img src={juneWaving} alt="June" className="h-10 w-auto object-contain flex-shrink-0" />
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
              <Button
                size="icon"
                variant="ghost"
                onClick={() => { setIsOpen(false); setLocation("/account?section=juneSettings"); }}
                className="text-white/60 hover:text-white no-default-hover-elevate hover:bg-white/10"
                title="Teach June — manage your preferences"
                data-testid="button-june-settings"
              >
                <Settings2 className="w-4 h-4" />
              </Button>
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
              <div className="flex items-center gap-1 flex-shrink-0">
                {hasJuneEdits && originalNoteRef.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-amber-700 dark:text-amber-400 gap-1"
                    onClick={handleRevertNote}
                    data-testid="button-revert-soap-note"
                    title="Restore the note to exactly how it was before June made any changes"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Revert
                  </Button>
                )}
                <button
                  onClick={() => setShowNotePreview(v => !v)}
                  className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1"
                  data-testid="button-toggle-note-preview"
                >
                  Preview
                  {showNotePreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
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

          {/* ── Voice Session Overlay ────────────────────────────────────── */}
          {voiceSessionMode && (
            <div
              className="flex-1 flex flex-col items-center justify-between py-8 px-6 min-h-0 overflow-hidden"
              style={{ background: "linear-gradient(160deg, #1b2813 0%, #0e1609 100%)" }}
              data-testid="panel-voice-session"
            >
              {/* Centre: glow + avatar + status + waveform */}
              <div className="flex-1 flex flex-col items-center justify-center gap-5 w-full">

                {/* Layered breathing glow behind June */}
                <div className="relative flex items-center justify-center">
                  {/* Outer ring */}
                  <div
                    className="voice-breathe-ring absolute rounded-full pointer-events-none"
                    style={{
                      width: 220, height: 220,
                      background: "radial-gradient(circle, rgba(74,145,32,0.18) 0%, transparent 72%)",
                    }}
                  />
                  {/* Inner glow */}
                  <div
                    className="voice-breathe absolute rounded-full pointer-events-none"
                    style={{
                      width: 160, height: 160,
                      background: "radial-gradient(circle, rgba(90,175,40,0.32) 0%, transparent 70%)",
                    }}
                  />
                  {/* June avatar */}
                  <img
                    src={chatMutation.isPending ? juneAnalyzing : juneListening}
                    alt="June"
                    className="voice-avatar-float relative z-10 object-contain"
                    style={{ width: 128, height: 128 }}
                  />
                </div>

                {/* Status text */}
                <div className="text-center space-y-1.5 px-2">
                  {chatMutation.isPending ? (
                    <>
                      <p className="text-white font-semibold text-base">Got it — thinking through that…</p>
                      <p className="text-white/50 text-sm">I'll have something for you in a moment.</p>
                    </>
                  ) : silenceCountdown ? (
                    <>
                      <p className="text-amber-300 font-semibold text-base">Still listening…</p>
                      <p className="text-white/50 text-sm">I'll send when you're done — or keep going.</p>
                    </>
                  ) : speechDetected ? (
                    <>
                      <p className="text-emerald-300 font-semibold text-base">I'm listening…</p>
                      <p className="text-white/50 text-sm">Go ahead — I've got you.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-white font-semibold text-base">I'm listening…</p>
                      <p className="text-white/50 text-sm">Take your time — I'll wait for a pause.</p>
                    </>
                  )}
                </div>

                {/* Animated waveform — hidden during thinking */}
                {!chatMutation.isPending && (
                  <div className="flex items-end gap-1.5" style={{ height: 40 }}>
                    {[0.7, 1.0, 0.5, 1.0, 0.8, 1.0, 0.6].map((maxScale, i) => (
                      <div
                        key={i}
                        className={`rounded-full origin-bottom ${speechDetected ? "voice-bar-active" : "voice-bar-idle"}`}
                        style={{
                          width: 4,
                          height: 36,
                          backgroundColor: speechDetected
                            ? `rgba(134,239,172,${0.55 + maxScale * 0.35})`
                            : `rgba(255,255,255,${0.18 + maxScale * 0.12})`,
                          animationDelay: `${i * 0.12}s`,
                          animationDuration: speechDetected ? `${0.38 + (i % 3) * 0.08}s` : `${1.4 + (i % 3) * 0.25}s`,
                          transform: "scaleY(0.25)",
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Thinking spinner */}
                {chatMutation.isPending && (
                  <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                )}

                {/* Live transcript preview */}
                {input && !chatMutation.isPending && (
                  <div className="max-w-xs w-full px-4 py-2.5 rounded-lg"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                    <p className="text-white/75 text-sm text-center italic leading-relaxed line-clamp-3">
                      "{input}"
                    </p>
                  </div>
                )}

                {/* Silence countdown bar */}
                {silenceCountdown && !chatMutation.isPending && (
                  <div className="w-48 h-0.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ animation: `shrink ${SILENCE_MS}ms linear forwards` }}
                    />
                  </div>
                )}
              </div>

              {/* Bottom action area */}
              {!chatMutation.isPending && (
                <div className="flex flex-col items-center gap-3 w-full pt-4">
                  <Button
                    onClick={handleVoiceDone}
                    disabled={!input.trim()}
                    className="w-full font-medium"
                    style={{ backgroundColor: "#4a8c22", color: "#fff" }}
                    data-testid="button-voice-done"
                  >
                    Done speaking
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleVoiceCancel}
                    className="text-white/55 hover:text-white w-full no-default-hover-elevate hover:bg-white/8"
                    data-testid="button-voice-cancel"
                  >
                    Cancel
                  </Button>
                  {isIOS && (
                    <p className="text-[10px] text-white/30 text-center leading-relaxed px-2">
                      Tip: In Safari tap the "aA" icon in the address bar → Website Settings → Microphone → Allow to skip the permission prompt each time.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          <div className={`flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0 ${voiceSessionMode ? "hidden" : ""}`}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4 space-y-3">
                <img src={juneWaving} alt="June" className="h-28 w-auto object-contain" />
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
                      {/* iOS: tap-to-hear button when autoplay was blocked */}
                      {isIOS && pendingTts?.msgIdx === i && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs gap-1.5 border-amber-400 text-amber-700 dark:text-amber-400"
                          onClick={() => {
                            const { text, msgIdx } = pendingTts;
                            setPendingTts(null);
                            speakText(text, msgIdx);
                          }}
                          data-testid={`button-tap-to-hear-${i}`}
                        >
                          <Volume2 className="w-3 h-3" />
                          Tap to hear June
                        </Button>
                      )}
                      {/* Replay TTS for this message */}
                      {ttsSupported && !(isIOS && pendingTts?.msgIdx === i) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-6 w-6 ${speakingMsgIdxRef.current === i && isSpeaking ? "text-amber-500" : "text-muted-foreground"}`}
                          onClick={() => speakingMsgIdxRef.current === i && isSpeaking ? stopSpeaking() : speakText(msg.spoken ?? makeFallbackSpoken(msg.content), i)}
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

          {/* Input area — hidden during voice session */}
          <div className={`border-t px-3 pt-1 pb-2 bg-background flex-shrink-0 ${voiceSessionMode ? "hidden" : ""}`}>
            <p className="text-[10px] text-muted-foreground text-center mb-1">
              AI assistant — clinical decisions are yours. Always verify recommendations.
            </p>

            {/* Encounter recorder interlock notice */}
            {encounterRecordingActive && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-1 px-1">
                Voice input paused — encounter recording in progress.
              </p>
            )}

            {/* Mic error */}
            {!encounterRecordingActive && micError && (
              <p className="text-xs text-destructive mb-1 px-1">{micError}</p>
            )}

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
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      isListening ? "Listening…"
                        : soapNoteActive ? "Edit the note… or ask a clinical question"
                        : "Ask June a clinical question"
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
                      onClick={() => { unlockAudioContext(); toggleListening(); }}
                      disabled={chatMutation.isPending || encounterRecordingActive}
                      data-testid="button-mic-ai-chat"
                      className={isListening ? "border-red-400 text-red-500 bg-red-50 dark:bg-red-950/30 no-default-hover-elevate" : ""}
                      title={encounterRecordingActive ? "Voice input paused — encounter recording in progress" : isListening ? "Stop listening" : "Speak to June"}
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
