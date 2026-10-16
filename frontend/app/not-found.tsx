import Link from "next/link";
import Image from "next/image";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.illustrationWrap}>
          <Image
            src="/illustrations/confused-student.png"
            alt="Страница не найдена"
            width={320}
            height={240}
            priority
            className={styles.illustration}
          />
        </div>
        <span className={styles.badge}>Ошибка 404</span>
        <h1 className={styles.title}>Кажется, мы запутались в источниках...</h1>
        <p className={styles.desc}>
          Страница, которую вы ищете, перемещена или не существует.
          Зато мы можем прямо сейчас написать реферат, курсовую или эссе!
        </p>
        <div className={styles.actions}>
          <Link href="/" className={styles.primaryBtn}>
            ⚡ На главную к генератору
          </Link>
          <Link href="/dashboard" className={styles.secondaryBtn}>
            Мои работы
          </Link>
        </div>
      </div>
    </div>
  );
}
