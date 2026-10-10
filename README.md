# Caviar Beauty Backend

Express API and Prisma/PostgreSQL application. This folder is self-contained and can be deployed as its own Vercel project.

## Local development

1. Install Node.js 22 or newer and PostgreSQL.
2. Copy `.env.example` to `.env` and set the local PostgreSQL connection values and two different JWT secrets.
3. Run `npm install`.
4. Run `npm run prisma:deploy` to apply migrations, then optionally `npm run prisma:seed` to load starter data.
5. Run `npm run dev`; the API listens on `http://localhost:4000`.

Useful commands: `npm run build`, `npm start`, `npm test`, and `npm run prisma:generate`.

## Vercel

Create a Vercel project with this folder as its Root Directory and select the Express framework preset (the project also declares `framework: "express"` in `vercel.json`). Vercel deploys the exported app in `src/app.js` as a single Express function; there is no static output directory. The included `vercel.json` also configures the daily order cleanup cron at `/api/cron/auto-cancel`. Set these Vercel environment variables:

- Required: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL`.
- Optional by feature: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `CRON_SECRET`.

Use a pooled Postgres URL for `DATABASE_URL` and the provider's direct URL for `DIRECT_URL`. Apply schema changes with `npx prisma migrate deploy` from this folder. For durable image uploads, configure the Supabase Storage variables; function disk storage is temporary.

Set `FRONTEND_URL` to the exact deployed frontend origin. Production auth cookies use `SameSite=None; Secure` for separate domains, and CSRF protection remains enabled via the exposed `X-CSRF-Token` response header.
