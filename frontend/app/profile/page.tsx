"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./profile.module.css";

type Profile = {
  name:        string | null;
  email:       string | null;
  image:       string | null;
  university:  string | null;
  faculty:     string | null;
  department:  string | null;
  speciality:  string | null;
  discipline:  string | null;
  course:      string | null;
  groupNumber: string | null;
  fullName:    string | null;
  teacherName: string | null;
  city:        string | null;
};

const EMPTY: Omit<Profile, "name" | "email" | "image"> = {
  university: "", faculty: "", department: "", speciality: "", discipline: "",
  course: "", groupNumber: "", fullName: "", teacherName: "", city: "",
};

function isProfileFilled(p: Profile) {
  return !!(p.university || p.fullName || p.groupNumber);
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/profile")
      .then(r => r.json())
      .then((data: Profile) => {
        setProfile(data);
        setForm({
          university:  data.university  ?? "",
          faculty:     data.faculty     ?? "",
          department:  data.department  ?? "",
          speciality:  data.speciality  ?? "",
          discipline:  data.discipline  ?? "",
          course:      data.course      ?? "",
          groupNumber: data.groupNumber ?? "",
          fullName:    data.fullName    ?? "",
          teacherName: data.teacherName ?? "",
          city:        data.city        ?? "",
        });
      });
  }, [status]);

  function set(field: keyof typeof EMPTY, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 4000);
      }
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading" || !profile) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className={styles.spinner} style={{ borderColor: "#E2E8F0", borderTopColor: "#6366F1" }} />
      </div>
    );
  }

  const initials = (profile.name ?? profile.email ?? "?")[0].toUpperCase();

  return (
    <div className={styles.page}>

      {/* Шапка */}
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          {profile.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.image} alt="avatar" className={styles.avatar} />
          ) : (
            <div className={styles.avatarPlaceholder}>{initials}</div>
          )}
          <div className={styles.heroInfo}>
            <h1 className={styles.heroName}>{profile.name ?? "Профиль"}</h1>
            <p className={styles.heroEmail}>{profile.email}</p>
          </div>
        </div>
      </div>

      {/* Баннер если профиль не заполнен */}
      {!isProfileFilled(profile) && (
        <div className={styles.banner}>
          <div className={styles.bannerInner}>
            <div className={styles.bannerIcon}>📋</div>
            <div className={styles.bannerBody}>
              <p className={styles.bannerTitle}>Заполните данные для титульного листа</p>
              <p className={styles.bannerText}>
                Укажите ВУЗ, факультет и ФИО — они будут автоматически вставлены в работу. Больше не нужно вводить каждый раз вручную.
              </p>
            </div>
            <button
              className={styles.bannerLink}
              onClick={() => document.getElementById("uni")?.focus()}
            >
              Заполнить сейчас →
            </button>
          </div>
        </div>
      )}

      {/* Форма */}
      <div className={styles.content}>

        {saved && (
          <div className={styles.bannerSuccess}>
            <div className={styles.bannerSuccessInner}>
              <div className={styles.bannerSuccessIcon}>✓</div>
              <div className={styles.bannerSuccessBody}>
                <p className={styles.bannerSuccessTitle}>Данные сохранены!</p>
                <p className={styles.bannerSuccessText}>
                  Теперь титульный лист будет заполняться автоматически. Попробуйте сгенерировать работу прямо сейчас.
                </p>
              </div>
              <Link href="/" className={styles.bannerSuccessBtn}>
                ✨ Сгенерировать реферат
              </Link>
            </div>
          </div>
        )}

        <form onSubmit={handleSave}>

          {/* Блок 1: ВУЗ */}
          <div className={styles.block}>
            <h2 className={styles.blockTitle}>
              <span className={styles.blockIcon}>🏛</span>
              Об учебном заведении
            </h2>
            <div className={styles.grid}>
              <div className={`${styles.field} ${styles.gridFull}`}>
                <label className={styles.label}>ВУЗ (полное название)</label>
                <input
                  id="uni"
                  className={styles.input}
                  placeholder="Московский государственный университет..."
                  value={form.university ?? ""}
                  onChange={e => set("university", e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Факультет / Институт</label>
                <input
                  className={styles.input}
                  placeholder="экономики"
                  value={form.faculty ?? ""}
                  onChange={e => set("faculty", e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Кафедра</label>
                <input
                  className={styles.input}
                  placeholder="менеджмента"
                  value={form.department ?? ""}
                  onChange={e => set("department", e.target.value)}
                />
              </div>
              <div className={`${styles.field} ${styles.gridFull}`}>
                <label className={styles.label}>Направление подготовки</label>
                <input
                  className={styles.input}
                  placeholder="38.03.01 Экономика"
                  value={form.speciality ?? ""}
                  onChange={e => set("speciality", e.target.value)}
                />
              </div>
              <div className={`${styles.field} ${styles.gridFull}`}>
                <label className={styles.label}>Дисциплина</label>
                <input
                  className={styles.input}
                  placeholder="Например: Общая психология"
                  value={form.discipline ?? ""}
                  onChange={e => set("discipline", e.target.value)}
                />
                <p className={styles.fieldHint}>По какой дисциплине выполняется работа</p>
              </div>
            </div>
          </div>

          {/* Блок 2: Студент */}
          <div className={styles.block}>
            <h2 className={styles.blockTitle}>
              <span className={styles.blockIcon}>🎓</span>
              О студенте
            </h2>
            <div className={styles.grid}>
              <div className={`${styles.field} ${styles.gridFull}`}>
                <label className={styles.label}>ФИО полностью</label>
                <input
                  className={styles.input}
                  placeholder="Иванов Иван Иванович"
                  value={form.fullName ?? ""}
                  onChange={e => set("fullName", e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Курс</label>
                <select
                  className={styles.select}
                  value={form.course ?? ""}
                  onChange={e => set("course", e.target.value)}
                >
                  <option value="">— не указан —</option>
                  {[1,2,3,4,5,6].map(n => (
                    <option key={n} value={String(n)}>{n} курс</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Номер группы</label>
                <input
                  className={styles.input}
                  placeholder="ЭК-201"
                  value={form.groupNumber ?? ""}
                  onChange={e => set("groupNumber", e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Город</label>
                <input
                  className={styles.input}
                  placeholder="Москва"
                  value={form.city ?? ""}
                  onChange={e => set("city", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Блок 3: Преподаватель */}
          <div className={styles.block}>
            <h2 className={styles.blockTitle}>
              <span className={styles.blockIcon}>👨‍🏫</span>
              Преподаватель
            </h2>
            <div className={styles.field}>
              <label className={styles.label}>ФИО преподавателя</label>
              <input
                className={styles.input}
                placeholder="Петров Пётр Петрович"
                value={form.teacherName ?? ""}
                onChange={e => set("teacherName", e.target.value)}
              />
              <p className={styles.fieldHint}>
                Необязательно. Заполните если знаете заранее — можно изменить перед скачиванием.
              </p>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? <><span className={styles.spinner} />Сохраняем...</> : "Сохранить"}
            </button>
            <Link href="/" className={styles.backLink}>← На главную</Link>
          </div>

        </form>
      </div>
    </div>
  );
}
