'use client'

import styles from './TelegramSupport.module.css'

export default function TelegramSupport() {
  return (
    <a
      href="https://t.me/refaisupport_bot"
      target="_blank"
      rel="noopener noreferrer"
      className={styles.btn}
      aria-label="Поддержка в Telegram"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg"
        width="32"
        height="32"
        alt="Telegram"
      />
      <span className={styles.tooltip}>Поддержка</span>
    </a>
  )
}
