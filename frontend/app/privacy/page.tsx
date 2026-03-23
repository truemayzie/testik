import Link from "next/link";
import type { Metadata } from "next";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — Refai",
  description: "Политика обработки персональных данных пользователей сервиса ref-ai.ru.",
};

export default function PrivacyPage() {
  return (
    <>
      <div className={styles.hero}>
        <div className={styles.heroLabel}>Юридический документ</div>
        <h1 className={styles.heroTitle}>Политика конфиденциальности</h1>
        <p className={styles.heroMeta}>Редакция от 23 марта 2026 г.</p>
      </div>

      <div className={styles.body}>
        <Link href="/" className={styles.backLink}>← На главную</Link>

        <div className={styles.infoBlock}>
          <p>
            Настоящая Политика конфиденциальности (далее — «Политика») описывает, как Ротов Иван Константинович,
            самозанятый, ИНН&nbsp;860233222535 (далее — «Оператор»), осуществляет сбор, хранение и обработку
            персональных данных пользователей сервиса <strong>ref-ai.ru</strong> (далее — «Пользователи»).
          </p>
          <p>
            Политика разработана в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ
            «О персональных данных».
          </p>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionNum}>1</span>
          <h2 className={styles.sectionTitle}>Какие данные мы собираем</h2>
          <p className={styles.text}>
            При использовании сервиса ref-ai.ru Оператор может получать следующие категории персональных данных:
          </p>
          <ul className={styles.list}>
            <li><strong>Идентификационные данные:</strong> имя и фамилия, адрес электронной почты, аватар профиля — передаются автоматически при авторизации через Яндекс OAuth.</li>
            <li><strong>Данные об использовании:</strong> история генераций (темы, типы работ, даты), статусы оплат.</li>
            <li><strong>Технические данные:</strong> IP-адрес, тип браузера, операционная система, идентификаторы сессий — собираются автоматически при посещении сайта.</li>
          </ul>
          <p className={styles.text}>
            Оператор <strong>не собирает</strong> реквизиты банковских карт и иные платёжные данные.
            Обработка платежей полностью осуществляется сторонним платёжным сервисом ЮКасса (ООО «ЮМани»).
          </p>
        </div>

        <hr className={styles.divider} />

        <div className={styles.section}>
          <span className={styles.sectionNum}>2</span>
          <h2 className={styles.sectionTitle}>Цели обработки персональных данных</h2>
          <p className={styles.text}>Персональные данные обрабатываются в следующих целях:</p>
          <ul className={styles.list}>
            <li>Идентификация Пользователя и обеспечение работы личного кабинета.</li>
            <li>Хранение истории генераций и предоставление доступа к результатам услуг.</li>
            <li>Обработка платежей и выставление чеков.</li>
            <li>Обратная связь и поддержка пользователей.</li>
            <li>Обеспечение безопасности и предотвращение мошенничества.</li>
            <li>Исполнение требований законодательства Российской Федерации.</li>
          </ul>
        </div>

        <hr className={styles.divider} />

        <div className={styles.section}>
          <span className={styles.sectionNum}>3</span>
          <h2 className={styles.sectionTitle}>Правовые основания обработки</h2>
          <p className={styles.text}>
            3.1. Обработка персональных данных осуществляется на основании:
          </p>
          <ul className={styles.list}>
            <li>Согласия Пользователя, выражаемого при регистрации через Яндекс OAuth (п. 1 ч. 1 ст. 6 Закона № 152-ФЗ).</li>
            <li>Необходимости исполнения договора, стороной которого является Пользователь (п. 5 ч. 1 ст. 6 Закона № 152-ФЗ).</li>
            <li>Соблюдения обязательных требований законодательства РФ (п. 2 ч. 1 ст. 6 Закона № 152-ФЗ).</li>
          </ul>
        </div>

        <hr className={styles.divider} />

        <div className={styles.section}>
          <span className={styles.sectionNum}>4</span>
          <h2 className={styles.sectionTitle}>Хранение данных</h2>
          <p className={styles.text}>
            4.1. Персональные данные хранятся на серверах, расположенных на территории Российской Федерации,
            в соответствии с требованиями ч. 5 ст. 18 Федерального закона № 152-ФЗ.
          </p>
          <p className={styles.text}>
            4.2. Данные хранятся в течение всего срока действия аккаунта Пользователя, а после удаления
            аккаунта — не более 30 (тридцати) дней, после чего уничтожаются, если иное не предусмотрено
            требованиями законодательства.
          </p>
          <p className={styles.text}>
            4.3. Оператор принимает технические и организационные меры для защиты персональных данных от
            несанкционированного доступа, изменения, раскрытия или уничтожения.
          </p>
        </div>

        <hr className={styles.divider} />

        <div className={styles.section}>
          <span className={styles.sectionNum}>5</span>
          <h2 className={styles.sectionTitle}>Передача данных третьим лицам</h2>
          <p className={styles.text}>
            5.1. Оператор <strong>не передаёт</strong> персональные данные Пользователей третьим лицам
            в коммерческих целях, для рекламы или маркетинга.
          </p>
          <p className={styles.text}>
            5.2. Передача данных возможна только в следующих случаях:
          </p>
          <ul className={styles.list}>
            <li><strong>ООО «ЮМани» (ЮКасса)</strong> — для обработки платежей и подтверждения транзакций. Передаётся минимально необходимый объём данных (email) в соответствии с условиями использования ЮКасса.</li>
            <li><strong>Яндекс (авторизация)</strong> — при входе через Яндекс OAuth обмен данными регулируется политикой конфиденциальности Яндекса.</li>
            <li>По требованию уполномоченных государственных органов в случаях, предусмотренных законодательством РФ.</li>
          </ul>
          <p className={styles.text}>
            5.3. Оператор не осуществляет трансграничную передачу персональных данных.
          </p>
        </div>

        <hr className={styles.divider} />

        <div className={styles.section}>
          <span className={styles.sectionNum}>6</span>
          <h2 className={styles.sectionTitle}>Права пользователей</h2>
          <p className={styles.text}>В соответствии с законодательством РФ Пользователь вправе:</p>
          <ul className={styles.list}>
            <li>Получить информацию об обрабатываемых персональных данных.</li>
            <li>Потребовать уточнения, блокирования или уничтожения своих персональных данных.</li>
            <li>Отозвать согласие на обработку персональных данных.</li>
            <li>Обратиться с жалобой в Роскомнадзор (rkn.gov.ru).</li>
          </ul>
          <p className={styles.text}>
            Для реализации своих прав Пользователь может направить запрос на адрес: <strong>support@ref-ai.ru</strong>.
            Запрос рассматривается в течение 30 дней.
          </p>
        </div>

        <hr className={styles.divider} />

        <div className={styles.section}>
          <span className={styles.sectionNum}>7</span>
          <h2 className={styles.sectionTitle}>Файлы cookie</h2>
          <p className={styles.text}>
            7.1. Сервис использует файлы cookie для обеспечения работы сессий авторизации и корректного
            отображения сайта. Cookie не содержат персональных данных и не используются для отслеживания
            поведения пользователей в рекламных целях.
          </p>
          <p className={styles.text}>
            7.2. Пользователь может отключить использование cookie в настройках браузера, однако это
            может повлечь некорректную работу сервиса, в частности невозможность авторизации.
          </p>
        </div>

        <hr className={styles.divider} />

        <div className={styles.section}>
          <span className={styles.sectionNum}>8</span>
          <h2 className={styles.sectionTitle}>Изменение политики</h2>
          <p className={styles.text}>
            Оператор вправе вносить изменения в настоящую Политику. Актуальная версия всегда доступна
            по адресу ref-ai.ru/privacy. Продолжение использования сервиса после публикации изменений
            означает согласие Пользователя с новой редакцией Политики.
          </p>
        </div>

        <hr className={styles.divider} />

        <div className={styles.signatureBlock}>
          <div className={styles.signatureTitle}>Оператор персональных данных</div>
          <div className={styles.signatureRow}>
            <span>Оператор:</span> Ротов Иван Константинович<br />
            <span>Статус:</span> Самозанятый<br />
            <span>ИНН:</span> 860233222535<br />
            <span>Адрес:</span> 628400, ХМАО, г. Сургут, ул. Университетская, д. 21, кв. 565<br />
            <span>Email:</span> support@ref-ai.ru
          </div>
        </div>
      </div>
    </>
  );
}
