import styles from "../admin.module.css";

/** Ссылки на выдачу с оператором site: — быстрая ручная проверка, не замена кабинета вебмастера. */
export function IndexCheckLinks({ fullUrl }: { fullUrl: string }) {
  const q = encodeURIComponent(`site:${fullUrl}`);
  const google = `https://www.google.com/search?q=${q}`;
  const yandex = `https://yandex.ru/search/?text=${q}`;
  return (
    <div className={styles.indexCheckBtns}>
      <a
        className={styles.indexCheckBtn}
        href={google}
        target="_blank"
        rel="noopener noreferrer"
        title="Google: есть ли URL в выдаче (site:)"
      >
        G
      </a>
      <a
        className={styles.indexCheckBtn}
        href={yandex}
        target="_blank"
        rel="noopener noreferrer"
        title="Яндекс: есть ли URL в выдаче (site:)"
      >
        Я
      </a>
    </div>
  );
}
