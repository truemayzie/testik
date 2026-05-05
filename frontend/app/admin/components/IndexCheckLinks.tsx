import styles from "../admin.module.css";

export function siteSearchUrls(fullUrl: string) {
  const q = encodeURIComponent(`site:${fullUrl}`);
  return {
    google: `https://www.google.com/search?q=${q}`,
    yandex: `https://yandex.ru/search/?text=${q}`,
  };
}

/** Кнопки открывают поиск с оператором site: — ручная проверка «в индексе или нет». */
export function IndexCheckLinks({ fullUrl }: { fullUrl: string }) {
  const { google, yandex } = siteSearchUrls(fullUrl);
  return (
    <div className={styles.indexCheckBtns}>
      <a
        className={styles.indexCheckBtn}
        href={google}
        target="_blank"
        rel="noopener noreferrer"
        title="Google: выдача по site:URL"
      >
        Г
      </a>
      <a
        className={styles.indexCheckBtn}
        href={yandex}
        target="_blank"
        rel="noopener noreferrer"
        title="Яндекс: выдача по site:URL"
      >
        Я
      </a>
    </div>
  );
}
