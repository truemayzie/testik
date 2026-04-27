'use client'
import { useSession } from 'next-auth/react'
import styles from '@/app/[workType]/[slug]/seo-page.module.css'

const WORK_TYPE_RU: Record<string, string> = {
  referat:    'Реферат',
  kursovaya:  'Курсовая',
  esse:       'Эссе',
  doklad:     'Доклад',
  vkr:        'ВКР',
  sochinenie: 'Сочинение',
}

type Props = {
  workType: string
  title: string
}

export function GenerateButton({ workType, title }: Props) {
  const { data: session } = useSession()
  const ruType = WORK_TYPE_RU[workType] ?? workType
  const generateUrl = `/?workType=${encodeURIComponent(ruType)}&topic=${encodeURIComponent(title)}`
  const href = session ? generateUrl : `/auth/signin?callbackUrl=${encodeURIComponent(generateUrl)}`

  return (
    <a href={href} className={styles.ctaButton}>
      Сгенерировать работу →
    </a>
  )
}
