import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, X, Send, User, Bot, Loader2, Trash2, UserCheck, Mic, MicOff } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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

export function AiChatDrawer({ patientContext }: AiChatDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [usePatient, setUsePatient] = useState(true);
  const [hasOfferedPatient, setHasOfferedPatient] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevPatientIdRef = useRef<number | null>(null);
  const requestPatientIdRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  // Tracks the text that was in the box before the current voice session started,
  // so interim results can be appended cleanly without duplicating it.
  const baseInputRef = useRef<string>("");

  // PATIENT-SAFETY: Clear conversation history whenever the patient context changes.
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

  // Clean up recognition when the drawer closes.
  useEffect(() => {
    if (!isOpen) stopListening();
  }, [isOpen]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => stopListening();
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && patientContext && !hasOfferedPatient && messages.length === 0) {
      setHasOfferedPatient(true);
    }
  }, [isOpen, patientContext, hasOfferedPatient, messages.length]);

  // ── Voice recognition ──────────────────────────────────────────────────────
  function stopListening() {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }

  function startListening() {
    if (!SpeechRecognitionAPI) {
      setMicError("Voice input isn't supported in this browser. Try Chrome.");
      setTimeout(() => setMicError(null), 4000);
      return;
    }

    setMicError(null);
    baseInputRef.current = input; // snapshot current text before voice starts

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      // Show interim results immediately; finalise on isFinal
      const combined = baseInputRef.current
        ? `${baseInputRef.current.trimEnd()} ${final || interim}`.trim()
        : (final || interim).trim();
      setInput(combined);

      // When we get a final result, update the base so a follow-up session appends correctly
      if (final) {
        baseInputRef.current = combined;
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed") {
        setMicError("Microphone access denied. Check your browser permissions.");
        setTimeout(() => setMicError(null), 5000);
      }
      stopListening();
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      // Re-focus textarea so the provider can immediately edit or send
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    try {
      recognition.start();
    } catch (err) {
      setMicError("Could not start microphone. Please try again.");
      setTimeout(() => setMicError(null), 4000);
      stopListening();
    }
  }

  function toggleListening() {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  // ── Chat mutation ──────────────────────────────────────────────────────────
  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const newMessages = [...messages, { role: "user" as const, content: userMessage }];
      setMessages(newMessages);
      setInput("");
      baseInputRef.current = "";

      const issuedForPatientId = usePatient && patientContext ? patientContext.id : null;
      requestPatientIdRef.current = issuedForPatientId;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const res = await apiRequest("POST", "/api/ai-chat", {
        messages: newMessages,
        patientId: issuedForPatientId ?? undefined,
      }, { signal: controller.signal });
      const data = await res.json();
      return { data, issuedForPatientId };
    },
    onSuccess: ({ data, issuedForPatientId }: { data: any; issuedForPatientId: number | null }) => {
      const currentPatientId = patientContext?.id ?? null;
      if (issuedForPatientId !== currentPatientId) return;
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setHasOfferedPatient(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-3 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
          style={{ backgroundColor: "#2e3a20" }}
          data-testid="button-open-ai-chat"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm font-medium hidden sm:inline">Ask ClinIQ</span>
        </button>
      )}

      {isOpen && (
        <div
          className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 flex flex-col w-full sm:w-[420px] h-[100dvh] sm:h-[600px] sm:max-h-[80vh] bg-background border border-border sm:rounded-lg shadow-2xl overflow-hidden"
          data-testid="panel-ai-chat"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b" style={{ backgroundColor: "#2e3a20" }}>
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="w-5 h-5 text-white flex-shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white truncate">Ask ClinIQ</h3>
                <p className="text-xs text-white/70 truncate">Your Clinical Co-Pilot</p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
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
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-emerald-50/60 dark:bg-emerald-950/20">
              <div className="flex items-center gap-2 min-w-0">
                <UserCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 flex-shrink-0" />
                <span className="text-xs text-emerald-800 dark:text-emerald-300 truncate">
                  {usePatient ? `Discussing: ${patientContext.name}` : "Patient context off"}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUsePatient(!usePatient)}
                className="text-xs h-6 px-2 flex-shrink-0"
                data-testid="button-toggle-patient-context"
              >
                {usePatient ? "Disconnect" : "Connect"}
              </Button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4 space-y-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: "#f4f8f0" }}>
                  <Bot className="w-7 h-7" style={{ color: "#2e3a20" }} />
                </div>
                <div className="space-y-2">
                  {patientContext && usePatient ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Built on real-world protocols, optimized lab ranges, and clinical pattern recognition.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        I have <span className="font-medium text-foreground">{patientContext.name}</span>'s chart and labs loaded — ask me anything about their case, or we can discuss something else entirely.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Built on real-world protocols, optimized lab ranges, and clinical pattern recognition.
                      </p>
                      <div className="text-left text-xs text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground text-xs">Use me to:</p>
                        <ul className="space-y-0.5 ml-1">
                          <li className="flex gap-1.5 items-start"><span className="text-muted-foreground/80">&#8226;</span> Interpret labs with context (not just "normal ranges")</li>
                          <li className="flex gap-1.5 items-start"><span className="text-muted-foreground/80">&#8226;</span> Identify hormone & metabolic patterns</li>
                          <li className="flex gap-1.5 items-start"><span className="text-muted-foreground/80">&#8226;</span> Pressure-test treatment plans</li>
                          <li className="flex gap-1.5 items-start"><span className="text-muted-foreground/80">&#8226;</span> Think through complex patients</li>
                        </ul>
                      </div>
                      <p className="text-xs text-muted-foreground italic">
                        Ask anything — from quick confirmations to full case breakdowns.
                      </p>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {patientContext && usePatient ? (
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
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "#f4f8f0" }}>
                    <Bot className="w-4 h-4" style={{ color: "#2e3a20" }} />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                  msg.role === "user" ? "text-white text-sm" : "bg-muted"
                }`} style={msg.role === "user" ? { backgroundColor: "#2e3a20" } : undefined}>
                  {msg.role === "user" ? (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none [&_li]:list-disc [&_strong]:font-semibold"
                      dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                    />
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
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f4f8f0" }}>
                  <Bot className="w-4 h-4" style={{ color: "#2e3a20" }} />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t px-3 py-2 bg-background">
            <p className="text-[10px] text-muted-foreground text-center mb-2">
              AI assistant — clinical decisions are yours. Always verify recommendations.
            </p>

            {/* Listening indicator */}
            {isListening && (
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                <span className="text-xs text-red-600 dark:text-red-400 font-medium">Listening… speak now</span>
              </div>
            )}

            {/* Mic permission / support error */}
            {micError && (
              <p className="text-xs text-destructive mb-2 px-1">{micError}</p>
            )}

            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? "Listening…" : "Ask a clinical question, or speak using the mic"}
                rows={1}
                className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 max-h-24 min-h-[36px]"
                style={{ lineHeight: "1.5" }}
                data-testid="input-ai-chat"
              />

              {/* Mic button — hidden when browser doesn't support it */}
              {SpeechRecognitionAPI && (
                <Button
                  size="icon"
                  variant="outline"
                  onClick={toggleListening}
                  disabled={chatMutation.isPending}
                  data-testid="button-mic-ai-chat"
                  className={isListening ? "border-red-400 text-red-500 bg-red-50 dark:bg-red-950/30 no-default-hover-elevate" : ""}
                  title={isListening ? "Stop listening" : "Speak to ClinIQ"}
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
      )}
    </>
  );
}
