"use client";

import React from "react";
import styles from "../dashboard.module.css";

interface ExtrasOrderSectionProps {
  mode: "desktop" | "mobile";
  modalTab?: "work" | "presentation";
  dashExtrasBusy: boolean;
  dashExtrasProgress: number;
  dashCanOrderPres: boolean;
  dashCanOrderSpeech: boolean;
  dashPresSel: boolean;
  setDashPresSel: (val: boolean) => void;
  dashSpeechSel: boolean;
  setDashSpeechSel: (val: boolean) => void;
  dashExtrasTotal: number;
  dashExtrasErr: string | null;
  onPay: () => Promise<void>;
}

export const ExtrasOrderSection: React.FC<ExtrasOrderSectionProps> = ({
  mode,
  modalTab = "work",
  dashExtrasBusy,
  dashExtrasProgress,
  dashCanOrderPres,
  dashCanOrderSpeech,
  dashPresSel,
  setDashPresSel,
  dashSpeechSel,
  setDashSpeechSel,
  dashExtrasTotal,
  dashExtrasErr,
  onPay,
}) => {
  if (mode === "desktop") {
    return (
      <>
        <hr className={styles.docDivider} />
        <p className={styles.docExtrasHeading}>Добавить материалы</p>
        {dashExtrasBusy ? (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: 8 }}>
              Генерируем… {dashExtrasProgress}%
            </div>
            <div
              style={{
                width: "100%",
                height: 7,
                background: "#E2E8F0",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${dashExtrasProgress}%`,
                  background: "linear-gradient(90deg, #1A4FE0, #1D5CFF)",
                  borderRadius: 4,
                  transition: "width 0.35s ease",
                }}
              />
            </div>
          </div>
        ) : (
          <div className={styles.dashExtrasToggles}>
            {dashCanOrderPres && (
              <label className={styles.dashExtrasToggleRow}>
                <input
                  type="checkbox"
                  className={styles.dashExtrasToggleInput}
                  checked={dashPresSel}
                  onChange={(e) => setDashPresSel(e.target.checked)}
                />
                <span className={styles.dashExtrasToggleSlider} />
                <span className={styles.dashExtrasToggleLabel}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/pptx-icon.svg" alt="" className={styles.dashExtrasToggleIcon} />
                  Презентация
                </span>
                <span className={styles.dashExtrasTogglePrice}>+199 ₽</span>
              </label>
            )}
            {dashCanOrderSpeech && (
              <label className={styles.dashExtrasToggleRow}>
                <input
                  type="checkbox"
                  className={styles.dashExtrasToggleInput}
                  checked={dashSpeechSel}
                  onChange={(e) => setDashSpeechSel(e.target.checked)}
                />
                <span className={styles.dashExtrasToggleSlider} />
                <span className={styles.dashExtrasToggleLabel}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/txt-icon.svg" alt="" className={styles.dashExtrasToggleIcon} />
                  Текст выступления
                </span>
                <span className={styles.dashExtrasTogglePrice}>+149 ₽</span>
              </label>
            )}
            {dashExtrasTotal > 0 && (
              <button
                type="button"
                className={styles.dashExtrasPayBtn}
                onClick={onPay}
              >
                Оплатить {dashExtrasTotal} ₽
              </button>
            )}
          </div>
        )}
        {dashExtrasErr && <p className={styles.dashExtrasError}>{dashExtrasErr}</p>}
      </>
    );
  }

  // Mobile mode
  return (
    <>
      {dashExtrasBusy ? (
        <div className={styles.dashMobileExtrasProgress}>
          <span>Создаём материалы… {dashExtrasProgress}%</span>
          <div className={styles.dashMobileExtrasBarOuter}>
            <div
              className={styles.dashMobileExtrasBarInner}
              style={{ width: `${dashExtrasProgress}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          {modalTab === "work" && (
            <div className={styles.dashExtrasMobileGrid}>
              {dashCanOrderPres && (
                <label
                  className={`${styles.dashExtrasMobileChip} ${
                    dashPresSel ? styles.dashExtrasMobileChipOn : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className={styles.dashExtrasToggleInput}
                    checked={dashPresSel}
                    onChange={(e) => setDashPresSel(e.target.checked)}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/pptx-icon.svg" alt="" className={styles.dashExtrasMobileChipIcon} />
                  <span>Презентация</span>
                  <span className={styles.dashExtrasMobileChipPrice}>+199</span>
                </label>
              )}
              {dashCanOrderSpeech && (
                <label
                  className={`${styles.dashExtrasMobileChip} ${
                    dashSpeechSel ? styles.dashExtrasMobileChipOn : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className={styles.dashExtrasToggleInput}
                    checked={dashSpeechSel}
                    onChange={(e) => setDashSpeechSel(e.target.checked)}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/txt-icon.svg" alt="" className={styles.dashExtrasMobileChipIcon} />
                  <span>Выступление</span>
                  <span className={styles.dashExtrasMobileChipPrice}>+149</span>
                </label>
              )}
            </div>
          )}
          {modalTab === "work" && dashExtrasTotal > 0 && (
            <button
              type="button"
              className={`${styles.dashExtrasPayBtnWide} ${styles.dashExtrasPayBtnWideBlue}`}
              onClick={onPay}
            >
              Оплатить {dashExtrasTotal} ₽
            </button>
          )}
        </>
      )}
      {dashExtrasErr && <p className={styles.dashExtrasErrorMobile}>{dashExtrasErr}</p>}
    </>
  );
};
