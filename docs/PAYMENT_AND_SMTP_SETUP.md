# Payment Gateway (Razorpay) & SMTP Setup Guide

Step-by-step setup procedures for going live with Razorpay payments and transactional
emails (SMTP) in the Caviar Beauty store.

Applies to: backend (Express/Prisma on port 4000), frontend (Vite/React).

---

## 1. Razorpay (Payments)

### How it works in the code
| Piece | Location |
|---|---|
| Razorpay client + config gates | `src/utils/razorpay.js` |
| Order creation / verify / refund / webhooks | `src/controllers/payments.js` |
| Routes | `src/routes/payments.js` |

Checkout flow:
1. Frontend creates the order, then calls `POST /api/payments/create-order`.
2. Backend creates a Razorpay order; **if keys are placeholders it returns `503 "Payment gateway is not configured"`** (`payments.js:13`).
3. Frontend opens the Razorpay checkout modal (key = `keyId` returned by the API, `order_id` = Razorpay order id).
4. On success the frontend posts `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` to `POST /api/payments/verify`.
5. Backend HMAC-verifies the signature (`razorpay.js:11`) → marks payment `COMPLETED`, order `CONFIRMED`, fulfils stock.
6. Refunds go through `createRefund` (`razorpay.js:24`) and are updated by webhook events.

### Step-by-step procedure

1. **Create a Razorpay account**
   Dashboard: `dashboard.razorpay.com` → sign up (use the real business email/name).

2. **Get the API keys**
   Dashboard → *Settings → API Keys* → **Generate Key**. Copy:
   - `Key ID` (e.g. `rzp_test_XXXXX`)
   - `Key Secret`
   These appear once. Razorpay test keys start with `rzp_test_`.

3. **Set the backend env** — `.env` in `Caviar-Beauty-Backend/`:
   ```
   RAZORPAY_KEY_ID="rzp_test_XXXXX"
   RAZORPAY_KEY_SECRET="<your key secret>"
   RAZORPAY_WEBHOOK_SECRET="<any random string>"   # stored, see note below
   ```
   Note: per `razorpay.js:16` the webhook signature is validated against
   `RAZORPAY_KEY_SECRET`. When creating the webhook in step 5, set the webhook
   secret to the **same value** as your `RAZORPAY_KEY_SECRET`, so validation passes.

4. **Frontend env** — `.env` in `Caviar-Beauty-Frontend/`:
   ```
   VITE_RAZORPAY_KEY_ID="rzp_test_XXXXX"
   ```
   This is cosmetic — at runtime the checkout uses the `keyId` returned by the
   backend, so it doesn't need to match. Restart the Vite dev server after editing.

5. **Configure the webhook (Razorpay Dashboard)**
   Dashboard → *Settings → Webhooks* → **Add Webhook**:
   - **URL**: `https://<your-backend-domain>/api/payments/webhook/razorpay`
   - **Secret**: same as `RAZORPAY_KEY_SECRET` (see note in step 3)
   - **Events** to enable:
     - `payment.captured`
     - `payment.failed`
     - `refund.created`
     - `refund.processed`
   - Save. Razorpay sends a test event — check the backend log for
     `{ received: true }` (a 400 with `Invalid signature` means the secret mismatches).

6. **Restart the backend** so the new env loads.

7. **Test — dev mode**
   - Place a real order via checkout; the Razorpay modal opens in test mode.
   - Use Razorpay test cards (numbers available on the Razorpay "Test Cards" page).
   - Verify: order becomes `CONFIRMED`, `paymentStatus: COMPLETED`.
   - Test refund: cancel/return order in admin → `initiateRefund`.

8. **Go live**
   - Switch account from test to live → new keys (`rzp_live_`).
   - Update all three backend env values + the frontend's `VITE_RAZORPAY_KEY_ID`, then redeploy both Vercel projects.
   - Production auth cookies use `Secure` and `SameSite=None` for separate domains; CSRF protection remains enabled.

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
- [ ] `isRazorpayConfigured()` is `true` → checkout shows real gateway (no 503)
- [ ] Razorpay webhook test event returns `{ received: true }`
- [ ] Razorpay test payment completes → order `CONFIRMED` / `COMPLETED`
- [ ] `[EMAIL MOCK]` no longer appears in backend log
- [ ] OTP email received in inbox via `/api/auth/resend-otp`
- [ ] Password reset email received
- [ ] Order confirmed / shipped / delivered / refund emails received
```
