"use client";

import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

export default function HomePage() {
  const [sessionId] = useState(() => uuidv4());
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const [showSources, setShowSources] = useState({});

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // ── File Upload Handler ──────────────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return;
    const allowed = ["application/pdf", "text/plain"];
    const allowedExt = [".pdf", ".txt", ".md"];
    const isAllowed =
      allowed.includes(file.type) ||
      allowedExt.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!isAllowed) {
      setError("Please upload a PDF or plain text (.txt / .md) file.");
      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadProgress(10);
    setMessages([]);
    setUploadedFile(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("sessionId", sessionId);

    try {
      // Fake progress animation while waiting
      const progressInterval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 8, 85));
      }, 600);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setUploadedFile({ name: file.name, chunks: data.totalChunks });
      setTotalChunks(data.totalChunks);
      setMessages([
        {
          role: "assistant",
          content: `📄 I've read **${file.name}** and indexed it into **${data.totalChunks} chunks**. Ask me anything about this document!`,
          sources: [],
          id: uuidv4(),
        },
      ]);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 800);
    }
  }

  function onFileInputChange(e) {
    handleFile(e.target.files[0]);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }

  // ── Chat Handler ─────────────────────────────────────────────────────────
  async function sendMessage(e) {
    e.preventDefault();
    const query = inputValue.trim();
    if (!query || isThinking || !uploadedFile) return;

    const userMsg = { role: "user", content: query, id: uuidv4() };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsThinking(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");

      const assistantMsg = {
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
        id: uuidv4(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsThinking(false);
    }
  }

  function toggleSources(id) {
    setShowSources((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      sendMessage(e);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="url(#logoGrad)" />
              <path d="M10 8h8a6 6 0 010 12H10V8z" fill="white" opacity="0.9" />
              <circle cx="22" cy="22" r="5" fill="white" opacity="0.7" />
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="32" y2="32">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
            <span className="logo-text">NotebookLM</span>
          </div>
          <div className="header-badge">RAG-Powered</div>
        </div>
      </header>

      <main className="main">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-title">Your Document</div>

          {/* Upload Zone */}
          <div
            className={`upload-zone ${dragOver ? "drag-over" : ""} ${uploadedFile ? "has-file" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload document"
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md"
              onChange={onFileInputChange}
              className="file-input-hidden"
              aria-hidden="true"
            />

            {isUploading ? (
              <div className="upload-loading">
                <div className="spinner" />
                <p className="upload-status-text">Processing document…</p>
                <div className="progress-bar-wrapper">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="progress-pct">{uploadProgress}%</p>
              </div>
            ) : uploadedFile ? (
              <div className="file-info">
                <div className="file-icon">📄</div>
                <div className="file-meta">
                  <p className="file-name">{uploadedFile.name}</p>
                  <p className="file-chunks">{uploadedFile.chunks} chunks indexed</p>
                </div>
                <button
                  className="change-file-btn"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="upload-prompt">
                <div className="upload-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <p className="upload-label">Drop your document here</p>
                <p className="upload-sublabel">PDF, TXT or Markdown</p>
                <button className="upload-btn" type="button">Choose File</button>
              </div>
            )}
          </div>

          {/* Stats */}
          {uploadedFile && (
            <div className="stats-panel">
              <div className="stat-item">
                <span className="stat-label">Chunks</span>
                <span className="stat-value">{totalChunks}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Model</span>
                <span className="stat-value">gpt-4.1-mini</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Embedding</span>
                <span className="stat-value">3-large</span>
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="how-it-works">
            <p className="how-title">How it works</p>
            <ol className="how-list">
              <li><span className="how-step">1</span> Upload a document</li>
              <li><span className="how-step">2</span> It's chunked & embedded</li>
              <li><span className="how-step">3</span> Ask any question</li>
              <li><span className="how-step">4</span> AI answers from the doc</li>
            </ol>
          </div>
        </aside>

        {/* ── Chat Panel ── */}
        <section className="chat-panel" aria-label="Chat conversation">
          {/* Messages */}
          <div className="messages-container">
            {messages.length === 0 && !isUploading && (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <h1 className="empty-title">Chat with your documents</h1>
                <p className="empty-subtitle">
                  Upload a PDF or text file to get started. Ask questions and get answers grounded in your document — not hallucinated.
                </p>
                <div className="suggestion-chips">
                  {["What is the main topic?", "Summarize the key points", "What are the conclusions?"].map((s) => (
                    <button
                      key={s}
                      className="chip"
                      onClick={() => uploadedFile && setInputValue(s)}
                      disabled={!uploadedFile}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`message-row ${msg.role}`}>
                <div className={`avatar ${msg.role}`}>
                  {msg.role === "user" ? "U" : (
                    <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                      <path d="M10 8h8a6 6 0 010 12H10V8z" fill="white" opacity="0.9" />
                      <circle cx="22" cy="22" r="5" fill="white" opacity="0.7" />
                    </svg>
                  )}
                </div>
                <div className="message-bubble-wrapper">
                  <div className={`message-bubble ${msg.role}`}>
                    <MessageContent content={msg.content} />
                  </div>
                  {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                    <div className="sources-section">
                      <button
                        className="sources-toggle"
                        onClick={() => toggleSources(msg.id)}
                        aria-expanded={showSources[msg.id]}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        {msg.sources.length} source chunk{msg.sources.length > 1 ? "s" : ""}
                        <svg
                          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{ transform: showSources[msg.id] ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {showSources[msg.id] && (
                        <div className="sources-list">
                          {msg.sources.map((src, i) => (
                            <div key={i} className="source-card">
                              <div className="source-header">
                                <span className="source-chunk">Chunk {src.chunkIndex + 1}</span>
                                <span className="source-score">{src.score}% match</span>
                              </div>
                              <p className="source-preview">{src.preview}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="message-row assistant">
                <div className="avatar assistant">
                  <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                    <path d="M10 8h8a6 6 0 010 12H10V8z" fill="white" opacity="0.9" />
                    <circle cx="22" cy="22" r="5" fill="white" opacity="0.7" />
                  </svg>
                </div>
                <div className="thinking-bubble">
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error */}
          {error && (
            <div className="error-banner" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
              <button className="error-close" onClick={() => setError(null)} aria-label="Dismiss error">×</button>
            </div>
          )}

          {/* Input */}
          <form className="input-form" onSubmit={sendMessage}>
            <div className={`input-wrapper ${!uploadedFile ? "disabled" : ""}`}>
              <textarea
                ref={inputRef}
                className="chat-input"
                placeholder={uploadedFile ? "Ask anything about your document…" : "Upload a document first to start chatting"}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!uploadedFile || isThinking}
                rows={1}
                id="chat-input"
                aria-label="Chat input"
              />
              <button
                type="submit"
                className="send-btn"
                disabled={!uploadedFile || isThinking || !inputValue.trim()}
                aria-label="Send message"
                id="send-message-btn"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <p className="input-hint">
              Answers are grounded in your document — not generated from training data.
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}

// Simple markdown-like renderer for bold, code, and line breaks
function MessageContent({ content }) {
  if (!content) return null;
  // Split by code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <div className="message-content">
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const code = part.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
          return <pre key={i} className="code-block"><code>{code}</code></pre>;
        }
        // Process inline formatting
        return (
          <span key={i}>
            {part.split("\n").map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {renderInline(line)}
              </span>
            ))}
          </span>
        );
      })}
    </div>
  );
}

function renderInline(text) {
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  return boldParts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    const codeParts = p.split(/(`[^`]+`)/g);
    return codeParts.map((cp, j) => {
      if (cp.startsWith("`") && cp.endsWith("`")) {
        return <code key={j} className="inline-code">{cp.slice(1, -1)}</code>;
      }
      return cp;
    });
  });
}
