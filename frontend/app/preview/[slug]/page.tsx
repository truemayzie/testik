import { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PreviewClient from "./PreviewClient";

type Props = { params: { slug: string } };

async function fetchPreview(slug: string) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/preview/${slug}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await fetchPreview(params.slug);
  if (!data) return { title: "Работа не найдена | Refai" };
  return {
    title: `${data.workType} — ${data.topic} | Refai`,
    description: `Готовый ${data.workType.toLowerCase()} на тему «${data.topic}». ${data.pages} страниц, оформление по ГОСТ, уникальность 80%+`,
    openGraph: {
      title: `${data.workType}: ${data.topic}`,
      description: `${data.pages} стр. · ГОСТ · Антиплагиат 80%+`,
    },
  };
}

export default async function PreviewPage({ params }: Props) {
  const [data, session] = await Promise.all([
    fetchPreview(params.slug),
    getServerSession(authOptions),
  ]);

  // Проверяем — владелец ли текущий пользователь этой генерации
  let fullContent: Record<string, string> | null = null;
  let fullSources: string[] | null = null;

  if (session?.user && data) {
    const userId = (session.user as typeof session.user & { id: string }).id;
    const generation = await prisma.generation.findUnique({
      where: { slug: params.slug },
      select: { userId: true, result: true },
    });

    if (generation?.userId === userId) {
      const result = JSON.parse(generation.result);
      fullContent = result.content;
      fullSources = result.sources;
    }
  }

  return (
    <PreviewClient
      data={data}
      slug={params.slug}
      fullContent={fullContent}
      fullSources={fullSources}
    />
  );
}
