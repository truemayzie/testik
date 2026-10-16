"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";

export const FEEDBACK_ISSUES = ["Структура", "Объём", "Оформление", "Содержание", "Другое"] as const;

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  generationId: string | null;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  generationId,
}) => {
  const [feedbackIssues, setFeedbackIssues]   = useState<string[]>([]);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackDone, setFeedbackDone]       = useState(false);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={() => !feedbackDone && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15,23,42,0.55)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #E6E8EC",
          padding: "36px 40px",
          maxWidth: 480,
          width: "100%",
          position: "relative",
        }}
      >
        {!feedbackDone ? (
          <>
            <button
              onClick={onClose}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#64748B",
                fontSize: 20,
                lineHeight: 1,
                padding: 4,
              }}
              aria-label="Закрыть"
            >
              ✕
            </button>

            <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
              Что пошло не так?
            </h2>
            <p style={{ color: "#64748B", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
              Расскажите — мы используем это для улучшения качества генерации.
            </p>

            {/* Чекбоксы */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {FEEDBACK_ISSUES.map((issue) => (
                <label
                  key={issue}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    color: "#334155",
                    fontSize: 15,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={feedbackIssues.includes(issue)}
                    onChange={(e) =>
                      setFeedbackIssues((prev) =>
                        e.target.checked ? [...prev, issue] : prev.filter((i) => i !== issue)
                      )
                    }
                    style={{ width: 16, height: 16, accentColor: "#1D5CFF", cursor: "pointer" }}
                  />
                  {issue}
                </label>
              ))}
            </div>

            {/* Комментарий */}
            <textarea
              placeholder="Дополнительный комментарий (необязательно)"
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#F8FAFC",
                border: "1px solid #E2E8F0",
                borderRadius: 10,
                color: "#334155",
                fontSize: 14,
                padding: "12px 14px",
                resize: "vertical",
                outline: "none",
                fontFamily: "inherit",
                marginBottom: 20,
              }}
            />

            <button
              disabled={feedbackSending}
              onClick={async () => {
                setFeedbackSending(true);
                try {
                  await fetch("/api/feedback/comment", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      generationId,
                      issues: feedbackIssues,
                      comment: feedbackComment,
                    }),
                  });
                } finally {
                  setFeedbackSending(false);
                  setFeedbackDone(true);
                }
              }}
              style={{
                width: "100%",
                padding: "14px 0",
                background: "#1D5CFF",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                opacity: feedbackSending ? 0.7 : 1,
              }}
            >
              {feedbackSending ? "Отправляем..." : "Отправить отзыв"}
            </button>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🙏</div>
            <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
              Спасибо за отзыв!
            </h2>
            <p style={{ color: "#64748B", fontSize: 14, margin: "0 0 24px" }}>
              Мы учтём это при следующей генерации.
            </p>
            <button
              onClick={onClose}
              style={{
                padding: "12px 32px",
                background: "#F8FAFC",
                border: "1px solid #E2E8F0",
                color: "#475569",
                borderRadius: 10,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
