# Payment Gateway (Paytm) & SMTP Setup Guide

Step-by-step setup procedures for going live with Paytm payments and transactional
emails (SMTP) in the Caviar Beauty store.

Applies to: backend (Express/Prisma on port 4000), frontend (Vite/React).

---

## 1. Paytm (Payments)

### How it works in the code
| Piece | Location |
|---|---|
| Paytm client, checksums, Transaction Status/Refund APIs | `src/utils/paytm.js` |
| Create token / verify / refund / callback / webhook | `src/controllers/payments.js` |
| Routes | `src/routes/payments.js` |

Checkout flow:
1. Frontend creates the order, then calls `POST /api/payments/create-order`.
2. Backend calls Paytm **Initiate Transaction** with our `Order.orderNumber` as `orderId` and returns the one-time `txnToken`; **if the MID/key are missing or placeholders it returns `503 "Payment gateway is not configured"`**.
3. Frontend loads `{HOST}/merchantpgpui/checkoutjs/merchants/{MID}.js`, initialises Paytm JS Checkout with `{ orderId, token: txnToken, tokenType: 'TXN_TOKEN' }` and invokes it.
4. After the customer pays, the browser reports the result and the frontend calls `POST /api/payments/verify`.
5. Backend calls Paytm **Transaction Status API** server-side, checks `TXN_SUCCESS` and the amount, then marks the payment `COMPLETED`, the order `CONFIRMED` and fulfils stock. The browser response is never trusted.
6. Paytm also posts a browser **callback** (`POST /api/payments/callback`) and a server-to-server **webhook** (`POST /api/payments/webhook/paytm`). Both are checksum-verified and independently confirm the payment.
7. Refunds go through `POST /refund/apply`; final refund state arrives by webhook.

### Step-by-step procedure

1. **Create a Paytm merchant account**
   Dashboard: `dashboard.paytmpayments.com` → sign up / activate (use the real business email/name).

2. **Get the API credentials**
   Dashboard → *API Keys* → copy:
   - `MID` (staging MID is available immediately; production MID after activation)
   - `Merchant Key`
   These are server-side secrets. The staging environment also uses the `WEBSTAGING` website name.

3. **Set the backend env** — `.env` in `Caviar-Beauty-Backend/`:
   ```dotenv
   PAYTM_ENV="staging"
   PAYTM_MID="<your MID>"
   PAYTM_MERCHANT_KEY="<your merchant key>"
   PAYTM_WEBSITE_NAME=          # blank: WEBSTAGING (staging) / DEFAULT (production)
   PAYTM_CALLBACK_URL=          # blank: BACKEND_PUBLIC_URL/api/payments/callback
   PAYTM_HOST=                  # optional override only
   BACKEND_PUBLIC_URL="https://<your-backend-domain>"
   ```

4. **Frontend env** — `.env` in `Caviar-Beauty-Frontend/` (optional):
   ```dotenv
   VITE_PAYTM_MID=
   ```
   The checkout receives the MID, `txnToken` and script URL from the API at runtime; this is only a build-time fallback. Restart Vite after editing.

5. **Configure the webhook (Paytm Dashboard)**
   Dashboard → *Developer Settings → Webhook URL*:
   - **URL**: `https://<your-backend-domain>/api/payments/webhook/paytm`
   - Enable **Payment status** notifications (refund events use the same URL).
   - Paytm signs webhooks with your merchant key, so no separate webhook secret is needed.
   - The browser return URL is `https://<your-backend-domain>/api/payments/callback` (derived from `BACKEND_PUBLIC_URL`; must be publicly reachable and on port 443 in production).

6. **Restart the backend** so the new env loads. The log must say
   `[PAYMENTS] Paytm ready (STAGING mode, MID ...)`.

7. **Verify and test — staging**
   ```bash
   cd Caviar-Beauty-Backend
   npm run verify:payments
   npm run verify:payments -- --live
   npm run test:payments:e2e
   npm run dev
   ```
   Place an order and pay with the Paytm staging test instruments shown on the
   checkout. Verify: order `CONFIRMED`, `paymentStatus: COMPLETED`, stock moved from
   reserved to sold. Test refund: cancel/return the order in admin → `initiateRefund`.

8. **Go live**
   - Complete Paytm activation, then set `PAYTM_ENV="production"`, the production
     `PAYTM_MID` / `PAYTM_MERCHANT_KEY`, and `PAYTM_WEBSITE_NAME="DEFAULT"` (or leave blank).
   - Register the production webhook/callback URLs on the production account.
   - Redeploy both Vercel projects and set `NODE_ENV="production"` on the backend.
   - Production auth cookies use `Secure` and `SameSite=None` for separate domains; CSRF protection remains enabled (the Paytm callback and webhook paths are exempt because they are checksum-authenticated).

---

## 2. SMTP (Emails)

### How it works in the code
| Piece | Location |
|---|---|
| Nodemailer transporter + mock mode + retry queue | `src/services/email.js` |
| HTML templates | `src/templates/email.js` |

- A real transporter is only created when `SMTP_HOST/USER/PASS` are set **and not
  placeholders** (`email.js:5`) — otherwise it logs `[EMAIL MOCK] To: ...` to the
  backend console (`email.js:50`).
- From address is always `"Caviar Beauty" <SMTP_USER>` (`email.js:66`).
- Emails sent: verification OTP, forgot-password OTP, welcome, order confirmed /
  shipped / delivered, refund issued.
- Failed sends retry with exponential backoff (4 attempts, `email.js:24`).

### Step-by-step procedure (Gmail example)

1. **Pick the sending account** — a Gmail address, e.g. `caviarbeauty.shop@gmail.com`
   (can be your existing one).

2. **Enable 2-Step Verification**
   `myaccount.google.com` → Security → **2-Step Verification** → turn ON.
   (Google blocks plain passwords; 2FA is required for app passwords.)

3. **Create an App Password**
   Security → search **"App passwords"** → name it (e.g. `caviar-backend`) →
   **Generate** → copy the 16-character code (shown once), e.g. `abcd efgh ijkl mnop`.

4. **Set the backend env** — `.env` in `Caviar-Beauty-Backend/`:
   ```
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT="587"
   SMTP_USER="caviarbeauty.shop@gmail.com"
   SMTP_PASS="abcd efgh ijkl mnop"      # the 16-char app password
   ```

5. **Restart the backend.**

6. **Verify a real send**
   Trigger the OTP resend for an existing user:
   ```
   POST http://localhost:4000/api/auth/resend-otp
   { "email": "reviewer@test.com" }
   ```
   - Success = the OTP email appears in the Gmail inbox (not the `[EMAIL MOCK]` log).
   - Register a new account and complete `/verify-email` end-to-end to confirm the
     full flow.
   - Check the backend log: no `[EMAIL] Initial send failed` warnings = transport OK.

### Other providers / variants
- TLS (implicit SSL): `SMTP_PORT="465"`; the code flips `secure` automatically
  (`email.js:14`).
- STARTTLS on port 587 is the default for Gmail.
- Transactional providers (SendGrid, Postmark, Mailgun, Resend…) use the same four
  env variables — just swap host/port/user/pass.
- Local development without SMTP: leave the env as placeholders — emails stay in
  mock mode and print to the backend console, so nothing breaks.

Regarding the basic limits: free Gmail ≈ 500 sends/day; use a transactional provider
for volume.

---

## 3. Verification checklist

- [ ] Backend `/api/health` returns `{ "status": "ok", "db": "up" }`
- [ ] `isPaytmConfigured()` is `true` → checkout shows the real gateway (no 503)
- [ ] Paytm webhook test event returns `{ received: true }`
- [ ] Paytm staging test payment completes → order `CONFIRMED` / `COMPLETED`
- [ ] `[EMAIL MOCK]` no longer appears in backend log
- [ ] OTP email received in inbox via `/api/auth/resend-otp`
- [ ] Password reset email received
- [ ] Order confirmed / shipped / delivered / refund emails received
```
