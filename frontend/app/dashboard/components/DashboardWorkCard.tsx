"use client";

import React from "react";
import styles from "../dashboard.module.css";
import type { Generation, ExtrasData } from "../types";

interface DashboardWorkCardProps {
  gen: Generation;
  extrasData: ExtrasData | null;
  orderTaskId: string | null;
  isAdmin: boolean;
  loadingView: string | null;
  downloading: string | null;
  deleting: string | null;
  copiedId: string | null;
  onOpen: (genId: string) => void;
  onCardClick: (gen: Generation, extras: ExtrasData | null, isCompleted: boolean) => void;
  onOpenOrder: (orderTaskId: string) => void;
  onCheckStatus: (genId: string) => Promise<void>;
  onDownloadDocx: (gen: Generation) => Promise<void>;
  onShare: (gen: Generation) => void;
  onDelete: (genId: string) => Promise<void>;
  formatDate: (dateStr: string) => string;
}

export const DashboardWorkCard: React.FC<DashboardWorkCardProps> = ({
  gen,
  extrasData,
  orderTaskId,
  isAdmin,
  loadingView,
  downloading,
  deleting,
  copiedId,
  onOpen,
  onCardClick,
  onOpenOrder,
  onCheckStatus,
  onDownloadDocx,
  onShare,
  onDelete,
  formatDate,
}) => {
  const hasPresentation = !!extrasData?.presentation;
  const hasSpeech = !!extrasData?.speech;
  const isCompleted = gen.status === "completed";
  const isFailed = gen.status === "failed";
  const isRunning = !isCompleted && !isFailed;
  const cardClickable = Boolean(orderTaskId) || isCompleted;

  return (
    <div className={styles.card}>
      <div
        className={styles.cardLeft}
        onClick={() => onCardClick(gen, extrasData, isCompleted)}
        role={cardClickable ? "button" : undefined}
        tabIndex={cardClickable ? 0 : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter" && cardClickable) {
            onCardClick(gen, extrasData, isCompleted);
          }
        }}
        style={cardClickable ? { cursor: "pointer" } : undefined}
      >
        <div className={styles.cardBadges}>
          <span className={styles.workType}>{gen.workType}</span>
          {isRunning && (
            <span className={styles.extrasBadgeSpeech}>Генерация…</span>
          )}
          {isFailed && (
            <span className={styles.extrasBadgePres}>Не завершилась</span>
          )}
          {hasPresentation && (
            <span className={styles.extrasBadgePres}>Презентация</span>
          )}
          {hasSpeech && (
            <span className={styles.extrasBadgeSpeech}>Выступление</span>
          )}
        </div>
        <h3 className={styles.cardTitle}>{gen.topic}</h3>
        <div className={styles.cardMeta}>
          <span>~{gen.pages} страниц</span>
          <span className={styles.dot}>·</span>
          <span suppressHydrationWarning>{formatDate(gen.createdAt)}</span>
        </div>
      </div>
      <div className={styles.cardActions}>
        {isFailed ? (
          <button
            type="button"
            className={styles.openBtn}
            disabled
            title="Генерация прервана. Напишите в поддержку или создайте работу заново."
          >
            Не завершилась
          </button>
        ) : isRunning ? (
          <>
            {orderTaskId ? (
              <button
                type="button"
                className={styles.openBtn}
                onClick={() => onOpenOrder(orderTaskId)}
              >
                Открыть заказ
              </button>
            ) : null}
            <button
              className={styles.openBtnSecondary}
              onClick={async (e) => {
                e.stopPropagation();
                await onCheckStatus(gen.id);
              }}
              disabled={loadingView === gen.id}
            >
              {loadingView === gen.id ? (
                <span className={styles.btnSpinner} />
              ) : (
                "Проверить"
              )}
            </button>
          </>
        ) : (
          <button
            className={styles.openBtn}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(gen.id);
            }}
            disabled={loadingView === gen.id}
          >
            {loadingView === gen.id ? (
              <span className={styles.btnSpinner} />
            ) : (
              "Открыть"
            )}
          </button>
        )}
        <div className={styles.cardActionsSecondary}>
          <button
            className={styles.downloadBtn}
            onClick={async (e) => {
              e.stopPropagation();
              await onDownloadDocx(gen);
            }}
            disabled={!isCompleted || downloading === gen.id}
          >
            {downloading === gen.id ? (
              <span className={styles.btnSpinner} />
            ) : (
              "⬇ DOCX"
            )}
          </button>
          {gen.slug && gen.isPublic && (
            <div className={styles.shareWrap}>
              <button
                className={styles.shareBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onShare(gen);
                }}
                title="Поделиться"
              >
                🔗
              </button>
              {copiedId === gen.id && (
                <span className={styles.copiedTooltip}>Скопировано</span>
              )}
            </div>
          )}
          {isAdmin && (
            <button
              className={styles.deleteBtn}
              onClick={(e) => {
                e.stopPropagation();
                void onDelete(gen.id);
              }}
              disabled={deleting === gen.id}
            >
              {deleting === gen.id ? (
                <span className={styles.btnSpinner} />
              ) : (
                "✕"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
