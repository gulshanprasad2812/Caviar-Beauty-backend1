# Caviar Beauty Backend

Express API and Prisma/PostgreSQL application. This folder is self-contained and can be deployed as its own Vercel project.

## Local development

1. Install Node.js 22 or newer and PostgreSQL.
2. Copy `.env.example` to `.env` and set the local PostgreSQL connection values and two different JWT secrets.
3. Run `npm install`.
4. Run `npm run prisma:deploy` to apply migrations, then optionally `npm run prisma:seed` to load starter data.
5. Run `npm run dev`; the API listens on `http://localhost:4000`.

Useful commands: `npm run build`, `npm start`, `npm test`, and `npm run prisma:generate`.

## Testing

| Command | What it does |
| --- | --- |
| `npm test` | Unit + integration suites. Suites that need a database expect the local `caviar_beauty_test` Postgres from `tests/setup-env.js`; set `SKIP_DB_PUSH=1` to run only the DB-free suites. |
| `npm run test:products:e2e` | Creates, updates and soft-deletes a product against `DATABASE_URL`, asserting that a deactivated product is 404 for anonymous readers but still readable by an admin. Cleans up after itself. |
| `npm run test:payments:e2e` | Order → Paytm Transaction Status (signed stub) → CONFIRMED order, against `DATABASE_URL`. Never contacts Paytm. |
| `npm run test:content:e2e` | Exercises the editable pages and site settings: public reads, admin writes, publishing, validation and protected built-in pages. |
| `npm run seed:content` | Writes the shipped About, FAQ, size guide, care, tracking and policy pages plus site settings. Existing rows are left untouched; `-- --force` resets them. |
| `npm run check:db` | Live database + HTTP smoke test: connectivity, row counts, a rolled-back Prisma transaction, then create/read/update/search/delete for products and coupons through the API. Prints `PASS`/`FAIL` per check. |
| `npm run verify:payments` | Reports which Paytm environment variables are missing or malformed. |

Both end-to-end suites and `check:db` write to the database configured in `.env` and delete what they created.

## Editable storefront content

Storefront copy lives in the database, not in the bundle, so an admin can change it without a deploy.

- `ContentPage` — one row per page (`slug`, `title`, `subtitle`, SEO fields, `sections` JSON, `layout`, `isPublished`). The nine built-in pages (`about`, `faq`, `size-guide`, `care-instructions`, `track-order`, `privacy-policy`, `terms-of-service`, `cookie-policy`, `gdpr-compliance`) cannot be deleted, only unpublished. Custom pages render at `/p/:slug`.
- `SiteSetting` — single `default` row with brand name, tagline, contact details, social URLs, footer copy, announcement bar and home hero slides.

API:

| Method | Route | Access |
| --- | --- | --- |
| `GET` | `/api/content/pages` | Public — published pages only |
| `GET` | `/api/content/pages/:slug` | Public; admins also get unpublished rows |
| `GET` | `/api/content/admin/pages` | Admin — every page |
| `POST`/`PUT`/`DELETE` | `/api/content/pages[/:id]` | Admin |
| `GET` | `/api/site` | Public |
| `PUT` | `/api/site` | Admin |

Admin UI: `/admin/content` lists pages, `/admin/content/:id/edit` edits one (with a section and table builder, plus About-specific story and values fields), and `/admin/settings` edits the site-wide details and hero slides.

## Vercel

Create a Vercel project with this folder as its Root Directory and select the Express framework preset (the project also declares `framework: "express"` in `vercel.json`). Vercel deploys the exported app in `src/app.js` as a single Express function; there is no static output directory. The included `vercel.json` also configures the daily order cleanup cron at `/api/cron/auto-cancel`. Set these Vercel environment variables:

- Required: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL`.
- Optional by feature: `PAYTM_MID`, `PAYTM_MERCHANT_KEY`, `PAYTM_ENV`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `CRON_SECRET`.

Use a pooled Postgres URL for `DATABASE_URL` and the provider's direct URL for `DIRECT_URL`. Apply schema changes with `npx prisma migrate deploy` from this folder. For durable image uploads, configure the Supabase Storage variables; function disk storage is temporary but is served back from `/uploads/<file>` when Supabase Storage is not configured.

Set `FRONTEND_URL` to the exact deployed frontend origin. Production auth cookies use `SameSite=None; Secure` for separate domains, and CSRF protection remains enabled via the exposed `X-CSRF-Token` response header.
