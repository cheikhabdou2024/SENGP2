# 🚀 Go-Live Checklist — Payments (Wave + Orange Money)

This checklist takes the real payment integration from code-complete to live in
production. Work top to bottom; do not skip the smoke test.

> ⚠️ **Production-only credentials, no sandbox.** Every test moves real money.
> Use the smallest amount the providers allow (~100 FCFA) and refund/withdraw it
> back afterwards.

---

## 0. Prerequisites

- [ ] **Backend deployed and publicly reachable over HTTPS** (Render / Railway /
      Fly / etc.). Note its base URL, e.g. `https://api.sengp.com`. Webhooks will
      NOT work on `localhost`.
- [ ] **PostgreSQL provisioned** and reachable from the backend. Schema is
      auto-created on boot (`initDatabase`), but verify the `payments`,
      `withdrawals`, and `wallet_balances` tables exist after first start.
- [ ] **Frontend built and deployed.** `cd frontend && npm run build` (now copies
      `config.js` into `www/`). In production the backend serves `www/` from the
      same origin, so `window.API_BASE_URL` resolves to the relative `/api/v1`.
- [ ] **At least one ADMIN user exists** (`users.user_type = 'admin'`) — required
      to approve/reject withdrawals and resolve claims.
- [ ] **Provider production credentials in hand:** Wave API key + webhook secret;
      Orange client id/secret + merchant key.
- [ ] **Confirm the Orange endpoints** for your account. Senegal uses the Sonatel
      portal — verify the token + webpayment URLs and the production currency
      (`XOF`, not the test `OUV`) against your real credentials.

---

## 1. Environment variables (backend)

Set these in the production environment (values from your provider dashboards).
See `backend/.env.example` for the full list.

**Core**
- [ ] `NODE_ENV=production`
- [ ] `DB_*` (host/port/name/user/password), `DB_SSL=true` for managed Postgres
- [ ] `JWT_SECRET` (strong, unique)
- [ ] `FRONTEND_URL` = deployed frontend origin(s), comma-separated (CORS)
- [ ] `API_VERSION=v1`

**Payments — shared**
- [ ] `PAYMENT_CURRENCY=XOF`
- [ ] `PAYMENT_SUCCESS_URL=https://<frontend>/paiement.html`
- [ ] `PAYMENT_ERROR_URL=https://<frontend>/creenvoi.html`
- [ ] `PLATFORM_COMMISSION_PERCENTAGE=10` (deducted from the GP payout)
- [ ] `MIN_WITHDRAWAL_AMOUNT=5000`

**Wave**
- [ ] `WAVE_API_KEY` (Bearer key)
- [ ] `WAVE_API_SECRET` (webhook signing secret — HMAC-SHA256)
- [ ] `WAVE_API_BASE=https://api.wave.com`
- [ ] `WAVE_CALLBACK_URL=https://<backend>/api/v1/payments/webhook/wave`

**Orange Money**
- [ ] `ORANGE_MONEY_CLIENT_ID`, `ORANGE_MONEY_CLIENT_SECRET`, `ORANGE_MONEY_MERCHANT_KEY`
- [ ] `ORANGE_TOKEN_URL` (confirm from your creds)
- [ ] `ORANGE_WEBPAY_URL` (confirm from your creds)
- [ ] `ORANGE_MONEY_CALLBACK_URL=https://<backend>/api/v1/payments/webhook/orange`

> The providers fail loud if keys are missing (checkout throws a clear error), so
> a misconfigured env surfaces immediately rather than silently.

---

## 2. Register the webhooks in the provider dashboards

The payment is only confirmed when the provider calls back. Register the **exact**
deployed URLs:

- [ ] **Wave dashboard** → webhook endpoint = `https://<backend>/api/v1/payments/webhook/wave`
      → subscribe to `checkout.session.completed` (and failure/expiry events).
- [ ] **Orange dashboard** → `notif_url` / notification endpoint =
      `https://<backend>/api/v1/payments/webhook/orange`.
- [ ] Confirm both endpoints return HTTP 200 to a provider test ping (they are
      public; authenticity is enforced by Wave HMAC signature and Orange
      `notif_token`).

> Note: webhooks live under `/api/` and pass through the general rate limiter
> (100 req / 15 min) — fine for normal volume. If a provider does aggressive
> retries, consider exempting the webhook paths.

---

## 3. Pre-flight verification (no money yet)

- [ ] Backend boots clean: logs show DB connected + schema initialized.
- [ ] `GET https://<backend>/health` → 200.
- [ ] Log in as an expéditeur, `GET /api/v1/wallet/me` → returns zeros (creates a
      wallet row).
- [ ] `cd backend && npx tsc --noEmit` is green on the deployed commit.

---

## 4. Smoke test — real money, tiny amount (~100 FCFA)

Run the **full happy path** once per provider (Wave, then Orange):

1. [ ] As a **GP**, create a trip (creetrajet) on a route, e.g. Dakar → Paris.
2. [ ] As an **expéditeur**, open creenvoi: fill package + weight + addresses +
       date, set **offered price = 100**, pick **Wave**, confirm.
3. [ ] Confirm you are **redirected to the Wave payment page** and a `pending`
       row exists in `payments`.
4. [ ] Complete the payment in the Wave app.
5. [ ] Verify the **webhook fired**: the `payments` row flips to `completed`,
       `external_transaction_id` is set, and the expéditeur's
       `expediteur_profiles.total_spent` increased. The payer gets a
       "Paiement confirmé" notification.
6. [ ] **Idempotency:** if the provider re-sends the webhook, the row stays
       `completed` and nothing is double-counted.
7. [ ] As the **GP**, accept the open mission, then move it to `delivered`.
8. [ ] Verify the **GP wallet** is credited the net amount (gross − commission)
       in `available_balance` + `total_earned`; GP gets a "Gains crédités"
       notification; `gains.html` shows the balance + transaction.
9. [ ] As the GP, request a withdrawal from `gains.html` (≥ `MIN_WITHDRAWAL_AMOUNT`)
       → `available_balance` is debited (held), a `pending` withdrawal appears.
10. [ ] As an **admin**, `GET /api/v1/withdrawals`, then
        `PUT /api/v1/withdrawals/:id/approve` → `total_withdrawn` increases; GP
        notified. (Or `…/reject` → funds refunded to available.)
11. [ ] **Repeat steps 2–6 with Orange Money.**

---

## 5. Post-launch monitoring

- [ ] Watch logs for `Rejected … webhook: signature/verification failed`
      (misconfigured secret) and `no matching payment` (correlation issues).
- [ ] Spot-check that `payments.status` doesn't get stuck in `pending` (failed
      redirects / missed webhooks). Consider a periodic reconciliation job later.
- [ ] Reconcile `wallet_balances` against `payments`/`withdrawals` after the first
      few live transactions.

---

## Rollback

- [ ] Payments are additive (new routes/services); to disable quickly, remove the
      provider env keys — `POST /payments` will then fail fast with a clear error,
      and the rest of the app keeps working.
- [ ] No destructive migrations were introduced; the tables already existed.

---

## Known follow-ups (not blocking launch)

- Programmatic payouts (you have the APIs) — withdrawals are currently
  **admin-approved manual**.
- `paiement.html` is still a static success screen; it could fetch the real
  payment/mission status via the success redirect.
- Reconciliation job for stuck `pending` payments.
- The "Carte bancaire" option was removed (Wave/Orange are mobile money only); add
  a card processor separately if needed.
