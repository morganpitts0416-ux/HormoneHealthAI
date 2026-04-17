import { useRef, useEffect, useCallback } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Link as LinkIcon, RemoveFormatting } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  testId?: string;
}

export function RichTextEditor({ value, onChange, placeholder, rows = 5, className, testId }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef<string>(value);

  useEffect(() => {
    if (editorRef.current && value !== lastValueRef.current && document.activeElement !== editorRef.current) {
      editorRef.current.innerHTML = value || "";
      lastValueRef.current = value;
    }
  }, [value]);

  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value || "";
      lastValueRef.current = value;
    }
  }, []);

  const exec = useCallback((command: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      lastValueRef.current = html;
      onChange(html);
    }
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      lastValueRef.current = html;
      onChange(html);
    }
  }, [onChange]);

  const handleLink = useCallback(() => {
    const url = window.prompt("Enter URL (include https://)");
    if (url) exec("createLink", url);
  }, [exec]);

  const minHeight = rows * 22;

  return (
    <div className={`rounded-md border bg-background ${className ?? ""}`} data-testid={testId}>
      <div className="flex items-center gap-0.5 border-b px-1.5 py-1 bg-muted/30">
        <ToolbarBtn onClick={() => exec("bold")} label="Bold" testId="rte-bold"><Bold className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("italic")} label="Italic" testId="rte-italic"><Italic className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("underline")} label="Underline" testId="rte-underline"><Underline className="w-3.5 h-3.5" /></ToolbarBtn>
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarBtn onClick={() => exec("insertUnorderedList")} label="Bulleted list" testId="rte-ul"><List className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("insertOrderedList")} label="Numbered list" testId="rte-ol"><ListOrdered className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={handleLink} label="Add link" testId="rte-link"><LinkIcon className="w-3.5 h-3.5" /></ToolbarBtn>
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarBtn onClick={() => exec("removeFormat")} label="Clear formatting" testId="rte-clear"><RemoveFormatting className="w-3.5 h-3.5" /></ToolbarBtn>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        data-placeholder={placeholder ?? ""}
        className="rte-content text-sm px-3 py-2 outline-none focus:ring-1 focus:ring-ring rounded-b-md prose-sm max-w-none"
        style={{ minHeight }}
      />
      <style>{`
        .rte-content:empty::before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
        }
        .rte-content ul { list-style: disc; padding-left: 1.25rem; margin: 0.25rem 0; }
        .rte-content ol { list-style: decimal; padding-left: 1.25rem; margin: 0.25rem 0; }
        .rte-content a { color: hsl(var(--primary)); text-decoration: underline; }
        .rte-content p { margin: 0.25rem 0; }
      `}</style>
    </div>
  );
}

function ToolbarBtn({ children, onClick, label, testId }: { children: React.ReactNode; onClick: () => void; label: string; testId?: string }) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className="h-6 w-6"
      title={label}
      data-testid={testId}
    >
      {children}
    </Button>
  );
}

const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "br", "p", "div", "span",
  "ul", "ol", "li", "a", "h1", "h2", "h3", "h4",
]);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
};

export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return "";
  if (typeof window === "undefined" || typeof document === "undefined") return "";
  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  const walk = (node: Element) => {
    const children = Array.from(node.children);
    for (const child of children) {
      const tag = child.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        const text = document.createTextNode(child.textContent ?? "");
        child.replaceWith(text);
        continue;
      }
      const allowed = ALLOWED_ATTRS[tag];
      for (const attr of Array.from(child.attributes)) {
        if (!allowed || !allowed.has(attr.name.toLowerCase()) || attr.name.toLowerCase().startsWith("on")) {
          child.removeAttribute(attr.name);
        } else if (attr.name.toLowerCase() === "href") {
          const v = attr.value.trim();
          if (!/^(https?:|mailto:)/i.test(v)) {
            child.removeAttribute("href");
          } else if (tag === "a") {
            child.setAttribute("target", "_blank");
            child.setAttribute("rel", "noopener noreferrer");
          }
        }
      }
      walk(child);
    }
  };
  walk(tpl.content as unknown as Element);
  return tpl.innerHTML;
}

export function RichTextView({ html, className }: { html: string | null | undefined; className?: string }) {
  const safe = sanitizeRichText(html);
  return (
    <div
      className={`rte-content ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
