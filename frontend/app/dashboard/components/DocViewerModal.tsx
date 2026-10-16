"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import styles from "../dashboard.module.css";
import IonPresentationPreview from "../../components/IonPresentationPreview";
import type { IonSlide } from "@/lib/presentationSlides";
import type { ViewingGen, TitleForm } from "../types";
import { TITLE_PAGE_TYPES } from "../types";
import { TitlePageForm } from "./TitlePageForm";
import { ExtrasOrderSection } from "./ExtrasOrderSection";

interface DocViewerModalProps {
  viewingGen: ViewingGen;
  viewingClosing: boolean;
  onClose: () => void;
  viewerModalRef: React.RefObject<HTMLDivElement>;
  viewerCloseRef: React.RefObject<HTMLButtonElement>;
  previewContainerRef: React.RefObject<HTMLDivElement>;
  modalTab: "work" | "presentation";
  setModalTab: (tab: "work" | "presentation") => void;
  presSlides: IonSlide[] | null;
  previewLoading: boolean;
  previewZoom: number;
  baseScale: number;
  applyZoom: (delta: number) => void;
  downloading: string | null;
  downloadingPptx: boolean;
  onDownloadDocx: () => Promise<void>;
  onDownloadExtra: (type: "presentation" | "speech") => Promise<void>;
  dashExtrasBusy: boolean;
  dashExtrasProgress: number;
  dashCanOrderPres: boolean;
  dashCanOrderSpeech: boolean;
  dashShowExtrasOrder: boolean;
  dashPresSel: boolean;
  setDashPresSel: (val: boolean) => void;
  dashSpeechSel: boolean;
  setDashSpeechSel: (val: boolean) => void;
  dashExtrasTotal: number;
  dashExtrasErr: string | null;
  onExtrasPayment: () => Promise<void>;
  titleForm: TitleForm;
  setTitleForm: React.Dispatch<React.SetStateAction<TitleForm>>;
  skipFaculty: boolean;
  setSkipFaculty: (val: boolean) => void;
  skipSpeciality: boolean;
  setSkipSpeciality: (val: boolean) => void;
  skipDiscipline: boolean;
  setSkipDiscipline: (val: boolean) => void;
  saveProfile: boolean;
  setSaveProfile: (val: boolean) => void;
  titleUpdating: boolean;
  onTitleUpdate: () => Promise<void>;
}

export const DocViewerModal: React.FC<DocViewerModalProps> = ({
  viewingGen,
  viewingClosing,
  onClose,
  viewerModalRef,
  viewerCloseRef,
  previewContainerRef,
  modalTab,
  setModalTab,
  presSlides,
  previewLoading,
  previewZoom,
  baseScale,
  applyZoom,
  downloading,
  downloadingPptx,
  onDownloadDocx,
  onDownloadExtra,
  dashExtrasBusy,
  dashExtrasProgress,
  dashCanOrderPres,
  dashCanOrderSpeech,
  dashShowExtrasOrder,
  dashPresSel,
  setDashPresSel,
  dashSpeechSel,
  setDashSpeechSel,
  dashExtrasTotal,
  dashExtrasErr,
  onExtrasPayment,
  titleForm,
  setTitleForm,
  skipFaculty,
  setSkipFaculty,
  skipSpeciality,
  setSkipSpeciality,
  skipDiscipline,
  setSkipDiscipline,
  saveProfile,
  setSaveProfile,
  titleUpdating,
  onTitleUpdate,
}) => {
  const [showMobileTitleForm, setShowMobileTitleForm] = useState(false);

  if (typeof document === "undefined") return null;

  const dashHasPresentationTab = !!viewingGen.extras?.presentation;
  const hasPresSlides = !!(presSlides && presSlides.length > 0);

  return createPortal(
    <div
      className={`${styles.docModalOverlay} ${viewingClosing ? styles.docModalOverlayClosing : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={viewerModalRef}
        className={`${styles.docModalBox} ${viewingClosing ? styles.docModalBoxClosing : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-doc-modal-title"
      >
        {/* Крестик — только на десктопе */}
        <button ref={viewerCloseRef} className={styles.docModalClose} onClick={onClose}>
          ✕
        </button>

        {/* Мобильная шапка */}
        <div className={styles.docMobileHeader}>
          <div>
            <h2 id="dashboard-doc-modal-title" className={styles.docModalTitle}>
              {viewingGen.result.title}
            </h2>
            <div className={styles.docModalBadges}>
              <span className={styles.docBadge}>{viewingGen.workType}</span>
              <span className={styles.docBadge}>{viewingGen.pages} стр.</span>
            </div>
          </div>
          <button className={styles.docMobileCloseBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Табы */}
        <div className={styles.docTabs}>
          <button
            type="button"
            className={`${styles.docTab} ${modalTab === "work" ? styles.docTabActive : ""}`}
            onClick={() => setModalTab("work")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/docx-icon.png" alt="" className={styles.docTabIcon} />
            Работа
          </button>
          {dashHasPresentationTab && (
            <button
              type="button"
              className={`${styles.docTab} ${modalTab === "presentation" ? styles.docTabActive : ""}`}
              onClick={() => setModalTab("presentation")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/pptx-icon.svg" alt="" className={styles.docTabIcon} />
              Презентация
            </button>
          )}
        </div>

        <div className={styles.docModalBody}>
          {/* Левый столбец */}
          <div
            className={styles.docModalLeft}
            style={modalTab === "presentation" ? { background: "#F1F5F9" } : undefined}
          >
            {/* DOCX preview — всегда в DOM, скрыт через CSS при табе Презентация */}
            <div style={{ display: modalTab === "work" ? "block" : "none" }}>
              {previewLoading && (
                <div className={styles.docPreviewSpinner}>
                  <span className={styles.docSpinner} /> Загружаем предпросмотр...
                </div>
              )}
              <div ref={previewContainerRef} className={styles.docPreviewContainer} />
            </div>

            {/* Ion-превью — скрыто при табе Работа */}
            {dashHasPresentationTab && (
              <div
                style={{
                  display: modalTab === "presentation" ? "flex" : "none",
                  flex: 1,
                  minHeight: 0,
                  width: "100%",
                  flexDirection: "column",
                  position: "relative",
                }}
              >
                {hasPresSlides ? (
                  <IonPresentationPreview slides={presSlides ?? []} />
                ) : (
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "column",
                      gap: 12,
                      color: "#5B6472",
                      textAlign: "center",
                      padding: 24,
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: 14,
                        fontFamily: '"Golos Text", -apple-system, sans-serif',
                        maxWidth: 420,
                        lineHeight: 1.5,
                      }}
                    >
                      Предпросмотр слайдов недоступен. Скачайте готовый PPTX — файл собран по шаблону Ion.
                    </p>
                    <button
                      type="button"
                      className={styles.dashPresentationHeroPayBtn}
                      onClick={() => onDownloadExtra("presentation")}
                    >
                      Скачать PPTX
                    </button>
                  </div>
                )}
                {dashExtrasBusy && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(237, 241, 247, 0.96)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 14,
                      zIndex: 6,
                      padding: 24,
                      textAlign: "center",
                    }}
                  >
                    <span style={{ color: "#0F172A", fontSize: 14, marginBottom: 6 }}>
                      Создаём материалы…
                    </span>
                    <div
                      style={{
                        width: "82%",
                        maxWidth: 340,
                        height: 8,
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
                )}
              </div>
            )}
          </div>

          {/* Правый столбец — десктоп */}
          <div className={styles.docModalRight}>
            <h2 className={styles.docModalTitle}>{viewingGen.result.title}</h2>
            <div className={styles.docModalBadges}>
              <span className={styles.docBadge}>{viewingGen.workType}</span>
              <span className={styles.docBadge}>{viewingGen.pages} стр.</span>
            </div>
            <hr className={styles.docDivider} />

            {/* Скачать DOCX / PPTX в зависимости от таба */}
            {modalTab === "presentation" && dashHasPresentationTab ? (
              <button
                className={styles.docDownloadBtn}
                onClick={() => onDownloadExtra("presentation")}
                disabled={downloadingPptx}
                style={{ background: downloadingPptx ? "#1A4FE0" : "#1D5CFF", color: "#fff" }}
              >
                {downloadingPptx ? (
                  <>
                    <span className={styles.docBtnSpinner} />
                    Генерируем файл...
                  </>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/pptx-icon.svg" alt="" className={styles.docDownloadIcon} />
                    Скачать PPTX
                  </>
                )}
              </button>
            ) : (
              <button
                className={styles.docDownloadBtn}
                onClick={() => onDownloadDocx()}
                disabled={downloading === "viewer"}
              >
                {downloading === "viewer" ? (
                  <>
                    <span className={styles.docBtnSpinner} />
                    Создаём...
                  </>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/docx-icon.png" alt="" className={styles.docDownloadIcon} />
                    Скачать DOCX
                  </>
                )}
              </button>
            )}

            {/* Заказ доп. материалов к уже сохранённой работе */}
            {dashShowExtrasOrder && (
              <ExtrasOrderSection
                mode="desktop"
                dashExtrasBusy={dashExtrasBusy}
                dashExtrasProgress={dashExtrasProgress}
                dashCanOrderPres={dashCanOrderPres}
                dashCanOrderSpeech={dashCanOrderSpeech}
                dashPresSel={dashPresSel}
                setDashPresSel={setDashPresSel}
                dashSpeechSel={dashSpeechSel}
                setDashSpeechSel={setDashSpeechSel}
                dashExtrasTotal={dashExtrasTotal}
                dashExtrasErr={dashExtrasErr}
                onPay={onExtrasPayment}
              />
            )}

            {/* Дополнительные материалы — выступление */}
            {viewingGen.extras?.speech && (
              <>
                <hr className={styles.docDivider} />
                <p className={styles.docExtrasHeading}>Дополнительные материалы</p>
                <div className={styles.docExtrasDownloads}>
                  <button
                    className={styles.docExtrasDownloadBtn}
                    onClick={() => onDownloadExtra("speech")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/txt-icon.svg" alt="" className={styles.docDownloadIcon} />
                    Выступление .txt
                  </button>
                </div>
              </>
            )}

            {viewingGen.slug && viewingGen.isPublic && (
              <>
                <hr className={styles.docDivider} />
                <button
                  className={styles.docShareBtn}
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/preview/${viewingGen.slug}`);
                  }}
                >
                  🔗 Скопировать ссылку
                </button>
              </>
            )}

            {TITLE_PAGE_TYPES.includes(viewingGen.workType) && (
              <>
                <hr className={styles.docDivider} />
                <TitlePageForm
                  titleForm={titleForm}
                  setTitleForm={setTitleForm}
                  skipFaculty={skipFaculty}
                  setSkipFaculty={setSkipFaculty}
                  skipSpeciality={skipSpeciality}
                  setSkipSpeciality={setSkipSpeciality}
                  skipDiscipline={skipDiscipline}
                  setSkipDiscipline={setSkipDiscipline}
                  saveProfile={saveProfile}
                  setSaveProfile={setSaveProfile}
                  titleUpdating={titleUpdating}
                  onSubmit={onTitleUpdate}
                />
              </>
            )}
          </div>
        </div>

        {/* Мобильная нижняя панель */}
        <div className={styles.docMobileBottom}>
          {!previewLoading && modalTab === "work" && (
            <div className={styles.docMobileZoomRow}>
              <button className={styles.docMobileZoomBtn} onClick={() => applyZoom(0.1)}>
                ＋
              </button>
              <span className={styles.docMobileZoomLabel}>
                {Math.round(baseScale * previewZoom * 100)}%
              </span>
              <button className={styles.docMobileZoomBtn} onClick={() => applyZoom(-0.1)}>
                －
              </button>
            </div>
          )}
          {modalTab === "presentation" && dashHasPresentationTab ? (
            <button
              className={styles.docDownloadBtn}
              onClick={() => onDownloadExtra("presentation")}
              disabled={downloadingPptx}
              style={{ background: downloadingPptx ? "#1A4FE0" : "#1D5CFF", color: "#fff" }}
            >
              {downloadingPptx ? (
                <>
                  <span className={styles.docBtnSpinner} />
                  Генерируем файл...
                </>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/pptx-icon.svg" alt="" className={styles.docDownloadIcon} />
                  Скачать PPTX
                </>
              )}
            </button>
          ) : (
            <button
              className={styles.docDownloadBtn}
              onClick={() => onDownloadDocx()}
              disabled={downloading === "viewer"}
            >
              {downloading === "viewer" ? (
                <>
                  <span className={styles.docBtnSpinner} />
                  Создаём...
                </>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/docx-icon.png" alt="" className={styles.docDownloadIcon} />
                  Скачать DOCX
                </>
              )}
            </button>
          )}
          {viewingGen.extras?.speech && (
            <div className={styles.docExtrasDownloadsMobile}>
              <button
                className={styles.docExtrasDownloadBtnSmall}
                onClick={() => onDownloadExtra("speech")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/txt-icon.svg" alt="" className={styles.docDownloadIcon} />
                Выступление .txt
              </button>
            </div>
          )}
          {dashShowExtrasOrder && (
            <ExtrasOrderSection
              mode="mobile"
              modalTab={modalTab}
              dashExtrasBusy={dashExtrasBusy}
              dashExtrasProgress={dashExtrasProgress}
              dashCanOrderPres={dashCanOrderPres}
              dashCanOrderSpeech={dashCanOrderSpeech}
              dashPresSel={dashPresSel}
              setDashPresSel={setDashPresSel}
              dashSpeechSel={dashSpeechSel}
              setDashSpeechSel={setDashSpeechSel}
              dashExtrasTotal={dashExtrasTotal}
              dashExtrasErr={dashExtrasErr}
              onPay={onExtrasPayment}
            />
          )}
          {TITLE_PAGE_TYPES.includes(viewingGen.workType) && (
            <button
              className={styles.docMobileTitleBtn}
              onClick={() => setShowMobileTitleForm(true)}
            >
              Данные для документов
            </button>
          )}
        </div>

        {/* Мобильная форма титульника — оверлей поверх модала */}
        {showMobileTitleForm && TITLE_PAGE_TYPES.includes(viewingGen.workType) && (
          <div className={styles.docMobileTitleOverlay}>
            <div className={styles.docMobileTitleSheetHeader}>
              <div>
                <p className={styles.docTitleHeading}>Данные для документов</p>
                <p className={styles.docTitleSub}>Подставляются в работу и презентацию</p>
              </div>
              <button
                className={styles.docMobileTitleSheetClose}
                onClick={() => setShowMobileTitleForm(false)}
              >
                ✕
              </button>
            </div>
            <div className={styles.docMobileTitleSheetBody}>
              <TitlePageForm
                titleForm={titleForm}
                setTitleForm={setTitleForm}
                skipFaculty={skipFaculty}
                setSkipFaculty={setSkipFaculty}
                skipSpeciality={skipSpeciality}
                setSkipSpeciality={setSkipSpeciality}
                skipDiscipline={skipDiscipline}
                setSkipDiscipline={setSkipDiscipline}
                saveProfile={saveProfile}
                setSaveProfile={setSaveProfile}
                titleUpdating={titleUpdating}
                onSubmit={async () => {
                  await onTitleUpdate();
                  setShowMobileTitleForm(false);
                }}
                showHeading={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
