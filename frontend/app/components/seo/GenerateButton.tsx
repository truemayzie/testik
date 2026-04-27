'use client'
import { useSession } from 'next-auth/react'
import styles from '@/app/[workType]/[slug]/seo-page.module.css'

export function GenerateButton(_props: { workType?: string; title?: string }) {
  const { data: session } = useSession()
  const href = session ? '/' : '/auth/signin'

  return (
    <a href={href} className={styles.ctaButton}>
      Сгенерировать работу →
    </a>
  )
}
