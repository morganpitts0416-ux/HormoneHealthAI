import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, X, Send, User, Bot, Loader2, Trash2, UserCheck } from "lucide-react";

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

export function AiChatDrawer({ patientContext }: AiChatDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [usePatient, setUsePatient] = useState(true);
  const [hasOfferedPatient, setHasOfferedPatient] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevPatientIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (patientContext?.id && patientContext.id !== prevPatientIdRef.current) {
      setUsePatient(true);
      setHasOfferedPatient(false);
      prevPatientIdRef.current = patientContext.id;
    }
  }, [patientContext?.id]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && patientContext && !hasOfferedPatient && messages.length === 0) {
      setHasOfferedPatient(true);
    }
  }, [isOpen, patientContext, hasOfferedPatient, messages.length]);

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const newMessages = [...messages, { role: "user" as const, content: userMessage }];
      setMessages(newMessages);
      setInput("");

      const res = await apiRequest("POST", "/api/ai-chat", {
        messages: newMessages,
        patientId: usePatient && patientContext ? patientContext.id : undefined,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to get response");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    },
    onError: (err: Error) => {
      setMessages(prev => [...prev, { role: "assistant", content: `I apologize — I encountered an issue: ${err.message}. Please try again.` }]);
    },
  });

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;
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
        <div className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 flex flex-col w-full sm:w-[420px] h-[100dvh] sm:h-[600px] sm:max-h-[80vh] bg-background border border-border sm:rounded-lg shadow-2xl overflow-hidden" data-testid="panel-ai-chat">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b" style={{ backgroundColor: "#2e3a20" }}>
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="w-5 h-5 text-white flex-shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white truncate">Ask ClinIQ</h3>
                <p className="text-xs text-white/70 truncate">Clinical AI Colleague</p>
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

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4 space-y-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: "#f4f8f0" }}>
                  <Bot className="w-7 h-7" style={{ color: "#2e3a20" }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Hey, colleague.</p>
                  {patientContext && usePatient ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      I see you have <span className="font-medium text-foreground">{patientContext.name}</span> pulled up. I have their chart and labs loaded — ask me anything about their case, or we can discuss something else entirely.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      I have the clinic protocols, optimized ranges, and clinical algorithms at the ready. Ask me about lab interpretation, clinical decision-making, protocols, or anything clinical.
                    </p>
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
                  msg.role === "user"
                    ? "text-white text-sm"
                    : "bg-muted"
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

          <div className="border-t px-3 py-2 bg-background">
            <p className="text-[10px] text-muted-foreground text-center mb-2">AI assistant — clinical decisions are yours. Always verify recommendations.</p>
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a clinical question..."
                rows={1}
                className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 max-h-24 min-h-[36px]"
                style={{ lineHeight: "1.5" }}
                data-testid="input-ai-chat"
              />
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
