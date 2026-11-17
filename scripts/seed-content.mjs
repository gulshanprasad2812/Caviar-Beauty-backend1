/**
 * Seeds the editable storefront pages and site settings.
 *
 * Idempotent by design: existing rows are left untouched so admin edits are
 * never overwritten. Pass --force to reset pages back to the shipped copy.
 *
 *   npm run seed:content
 *   npm run seed:content -- --force
 */
import 'dotenv/config';
import { prisma } from '../src/db.js';
import { defaultPages, defaultSiteSettings } from '../src/contentDefaults.js';

const force = process.argv.includes('--force');

const settings = await prisma.siteSetting.upsert({
  where: { id: 'default' },
  update: {},
  create: { id: 'default', ...defaultSiteSettings },
});

let created = 0;
let updated = 0;
for (const page of defaultPages) {
  const existing = await prisma.contentPage.findUnique({ where: { slug: page.slug } });
  if (!existing) {
    await prisma.contentPage.create({ data: page });
    created += 1;
  } else if (force) {
    await prisma.contentPage.update({ where: { slug: page.slug }, data: page });
    updated += 1;
  }
}

console.log(
  `Settings: ${settings.brandName} · pages created ${created}, ${force ? `reset ${updated}` : 'existing left untouched'}`,
);
await prisma.$disconnect();
