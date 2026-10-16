"use client";

import React from "react";
import styles from "../dashboard.module.css";
import type { TitleForm } from "../types";

interface TitlePageFormProps {
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
  onSubmit: () => void | Promise<void>;
  showHeading?: boolean;
}

export const TitlePageForm: React.FC<TitlePageFormProps> = ({
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
  onSubmit,
  showHeading = true,
}) => {
  return (
    <div className={styles.docTitleSection}>
      {showHeading && (
        <>
          <p className={styles.docTitleHeading}>Данные для документов</p>
          <p className={styles.docTitleSub}>Подставляются в работу и презентацию</p>
        </>
      )}
      <input
        className={styles.docTitleInput}
        placeholder="ФИО студента"
        value={titleForm.fullName}
        onChange={(e) => setTitleForm((prev) => ({ ...prev, fullName: e.target.value }))}
      />
      <input
        className={styles.docTitleInput}
        placeholder="Университет"
        value={titleForm.university}
        onChange={(e) => setTitleForm((prev) => ({ ...prev, university: e.target.value }))}
      />
      <label className={styles.docSkipRow}>
        <input
          type="checkbox"
          checked={skipFaculty}
          onChange={(e) => setSkipFaculty(e.target.checked)}
        />
        <span>Не указывать факультет</span>
      </label>
      {!skipFaculty && (
        <input
          className={styles.docTitleInput}
          placeholder="Направление / факультет"
          value={titleForm.faculty}
          onChange={(e) => setTitleForm((prev) => ({ ...prev, faculty: e.target.value }))}
        />
      )}
      <label className={styles.docSkipRow}>
        <input
          type="checkbox"
          checked={skipSpeciality}
          onChange={(e) => setSkipSpeciality(e.target.checked)}
        />
        <span>Не указывать специализацию</span>
      </label>
      {!skipSpeciality && (
        <input
          className={styles.docTitleInput}
          placeholder="Специализация"
          value={titleForm.speciality}
          onChange={(e) => setTitleForm((prev) => ({ ...prev, speciality: e.target.value }))}
        />
      )}
      <label className={styles.docSkipRow}>
        <input
          type="checkbox"
          checked={skipDiscipline}
          onChange={(e) => setSkipDiscipline(e.target.checked)}
        />
        <span>Не указывать предмет</span>
      </label>
      {!skipDiscipline && (
        <input
          className={styles.docTitleInput}
          placeholder="Предмет / дисциплина"
          value={titleForm.discipline}
          onChange={(e) => setTitleForm((prev) => ({ ...prev, discipline: e.target.value }))}
        />
      )}
      <input
        className={styles.docTitleInput}
        placeholder="Кафедра"
        value={titleForm.department}
        onChange={(e) => setTitleForm((prev) => ({ ...prev, department: e.target.value }))}
      />
      <input
        className={styles.docTitleInput}
        placeholder="Группа"
        value={titleForm.groupNumber}
        onChange={(e) => setTitleForm((prev) => ({ ...prev, groupNumber: e.target.value }))}
      />
      <input
        className={styles.docTitleInput}
        placeholder="Научный руководитель"
        value={titleForm.teacherName}
        onChange={(e) => setTitleForm((prev) => ({ ...prev, teacherName: e.target.value }))}
      />
      <input
        className={styles.docTitleInput}
        placeholder="Город"
        value={titleForm.city}
        onChange={(e) => setTitleForm((prev) => ({ ...prev, city: e.target.value }))}
      />
      <button
        className={styles.docUpdateBtn}
        onClick={onSubmit}
        disabled={titleUpdating}
      >
        {titleUpdating ? "Обновляем..." : "↻ Обновить документ"}
      </button>
      <label className={styles.docSaveProfileRow}>
        <input
          type="checkbox"
          className={styles.docSaveProfileCheck}
          checked={saveProfile}
          onChange={(e) => setSaveProfile(e.target.checked)}
        />
        <span>Запомнить данные</span>
      </label>
    </div>
  );
};
