import React, { useState, useRef, useEffect } from "react";
import type { TimelineSelection, TimelineSelectionItem } from "./Timeline.tsx";

interface Message {
  role: "user" | "assistant";
  text: string;
  edits?: string[];
}

interface ChatPanelProps {
  currentFrame: number;
  captureScreenshot: () => Promise<string | null>;
  onEditApplied?: () => void;
  selection: TimelineSelection;
  onClearSelection: () => void;
  lastUpload?: { path: string; filename: string; type: string } | null;
}

const FPS = 30;

export const ChatPanel: React.FC<ChatPanelProps> = ({
  currentFrame,
  captureScreenshot,
  onEditApplied,
  selection,
  onClearSelection,
  lastUpload,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Select an element on the timeline, then describe what you want to change. Or just type a general edit.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setLoading(true);

    try {
      let screenshot: string | null = null;
      if (includeScreenshot) {
        screenshot = await captureScreenshot();
      }

      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMessage,
          currentFrame,
          screenshot,
          selection: selection.length > 0
            ? selection.map((s) => ({
                type: s.type,
                index: s.index,
                label: s.label,
                startFrame: s.startFrame,
                endFrame: s.endFrame,
              }))
            : null,
          uploadedFile: lastUpload || null,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: `Error: ${data.error}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: data.message,
            edits: data.edits,
          },
        ]);
        if (data.edits?.length > 0) {
          onEditApplied?.();
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Network error: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  function colorForType(type: string) {
    if (type === "scene") return "#6aaacc";
    if (type === "text") return "#ccaa5a";
    if (type === "cta") return "#bb7aaa";
    if (type === "clip") return "#6aaacc";
    if (type === "voiceover") return "#7ccc7c";
    if (type === "backing") return "#9a8acc";
    if (type === "captions") return "#ccaa5a";
    return "#888";
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #333",
          fontSize: 14,
          fontWeight: 600,
          color: "#fff",
        }}
      >
        Prompt Editor
        <span style={{ fontSize: 11, color: "#666", marginLeft: 8 }}>
          frame {currentFrame} ({(currentFrame / FPS).toFixed(1)}s)
        </span>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.5,
              background: msg.role === "user" ? "#2a4a6a" : "#2a2a2a",
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "90%",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {msg.text}
            {msg.edits && msg.edits.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "#6c6",
                  fontFamily: "monospace",
                }}
              >
                Edited: {msg.edits.join(", ")}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              background: "#2a2a2a",
              color: "#888",
              alignSelf: "flex-start",
            }}
          >
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: 12,
          borderTop: "1px solid #333",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* Selection pills */}
        {selection.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "6px 10px",
              background: "#252525",
              borderRadius: 6,
              border: "1px solid #444",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {selection.length} selected
              </span>
              <button
                onClick={onClearSelection}
                style={{
                  background: "none",
                  border: "none",
                  color: "#888",
                  cursor: "pointer",
                  fontSize: 14,
                  padding: "0 4px",
                  lineHeight: 1,
                }}
                title="Clear all"
              >
                x
              </button>
            </div>
            {selection.map((sel, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 2,
                    background: colorForType(sel.type),
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 11, color: colorForType(sel.type), fontWeight: 600 }}>
                  {sel.type}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#ccc",
                    flex: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {sel.label}
                </span>
                <span style={{ fontSize: 10, color: "#888", fontFamily: "monospace", flexShrink: 0 }}>
                  {(sel.startFrame / FPS).toFixed(1)}s
                </span>
              </div>
            ))}
          </div>
        )}

        <label
          style={{
            fontSize: 11,
            color: "#888",
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={includeScreenshot}
            onChange={(e) => setIncludeScreenshot(e.target.checked)}
          />
          Include screenshot of current frame
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder={
              selection.length === 1
                ? `Edit this ${selection[0].type}...`
                : selection.length > 1
                  ? `Edit ${selection.length} selected elements...`
                  : "Describe your edit..."
            }
            disabled={loading}
            style={{
              flex: 1,
              padding: "10px 14px",
              background: "#252525",
              border: `1px solid ${selection.length > 0 ? colorForType(selection[0].type) + "66" : "#444"}`,
              borderRadius: 6,
              color: "#e0e0e0",
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              padding: "10px 18px",
              background: loading ? "#333" : "#4a7aaa",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: loading ? "default" : "pointer",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
