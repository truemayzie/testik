const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const prisma = new PrismaClient();

async function main() {
  const filePath = path.join(__dirname, '..', '..', 'data', 'topics_ready.jsonl');
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`Starting bulk import from: ${filePath}`);
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let batch = [];
  let totalImported = 0;
  let lineNumber = 0;
  const BATCH_SIZE = 500;

  for await (const line of rl) {
    lineNumber++;
    if (!line.trim()) continue;

    try {
      const item = JSON.parse(line);
      if (!item.slug || !item.title) continue;

      batch.push({
        slug: item.slug,
        workType: item.workType,
        subject: item.subject,
        title: item.title,
        metaTitle: item.metaTitle,
        metaDescription: item.metaDescription,
        previewText: item.previewText,
        bodyText: item.bodyText || '',
      });

      if (batch.length >= BATCH_SIZE) {
        const res = await prisma.seoPage.createMany({
          data: batch,
          skipDuplicates: true,
        });
        totalImported += res.count;
        console.log(`Imported batch: total ${totalImported} records (line ${lineNumber})...`);
        batch = [];
      }
    } catch (err) {
      console.error(`Error parsing line ${lineNumber}:`, err);
    }
  }

  if (batch.length > 0) {
    const res = await prisma.seoPage.createMany({
      data: batch,
      skipDuplicates: true,
    });
    totalImported += res.count;
  }

  const finalCount = await prisma.seoPage.count();
  console.log(`\nImport complete! Newly inserted: ${totalImported}. Total SeoPages in DB: ${finalCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
