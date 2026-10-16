# Synthetic 16-digit card demo

For the configured development/demo server only. Not suitable for deployment with live payment data without issuer/acquirer approval and compliance controls.

On a customer page, add a saved card and type a 16-digit demo number. Cards always display last four digits, with an authenticated **Copy** action. **Edit** loads an existing saved full number masked by default, with Show/Hide. Existing last-four-only cards require entering a new 16-digit value first. Copy and Edit-number reads are audited.

Backend access is disabled by default. For this demo only, configure `DEMO_CARD_COPY_ENABLED=true` and a random 32-byte key as 64 hexadecimal characters in `DEMO_CARD_ENCRYPTION_KEY`, outside Git. Values are encrypted in their own database table using AES-256-GCM. Normal customer/card APIs never return the full value; only the designated authenticated copy action can return the synthetic test value. Responses are no-store.

The backend accepts any exactly 16-digit sequence when the demo flag and encryption key are set. Checksum filtering is disabled in this environment. This can include real PANs; using the feature with live merchant data requires separately verified legal and contractual authorization.

In the later client VPS, omit both demo environment variables; do not enable this feature for actual payment card data. Do not collect CVV, PIN, expiry, or other sensitive authentication data.

## Upgrade an existing last-four-only card

Open Customers → existing customer → Saved Cards → **Edit**. If this card already has a saved full number, the masked field is populated automatically and Show/Hide is available. Otherwise enter a new 16-digit number. Entering a replacement automatically updates the last four. Saving updates the same saved card and retains its transaction links. Leaving an existing value unchanged preserves it without rewriting its encrypted record. For a card with only four digits on file, the other twelve digits cannot be recovered automatically.

## Keep the demo feature enabled across releases

**Deployment regression discovered 2026-10-16:** A new web/API release preserved all card-edit and Copy source code, but its API was launched with `node --env-file=.env dist/main` using a Cash Ledger `.env` that did not include `DEMO_CARD_COPY_ENABLED` or `DEMO_CARD_ENCRYPTION_KEY`. As a result, the authenticated demo-status endpoint returned `enabled: false`, hiding the 16-digit fields and Copy controls even though GitHub `main` still contained the feature.

For **this development instance only**:

1. Keep `DEMO_CARD_COPY_ENABLED=true` and the existing 64-hex-character `DEMO_CARD_ENCRYPTION_KEY` in the **Cash Ledger API's protected, untracked `.env`**. Use file permissions `0600`; never commit this key or print it in logs.
2. **Reuse the same encryption key** on each API release; rotating it without re-encrypting old records makes existing values unreadable.
3. Before a demo API rollout, from the repository root verify the environment that the new API will actually load:

   ```bash
   EXPECT_DEMO_CARD_COPY=1 node --env-file=/path/to/cashledger-api/.env scripts/check-demo-card-runtime.mjs
   ```

4. Start only the Cash Ledger API with that `.env`, then verify its health endpoint and authenticated customer demo-card status on the demo site. Do not assume a successful web build proves that the API feature is enabled.
5. The client VPS configuration must **omit** these variables unless separately authorized and compliant. This preflight is opt-in and is not a production setup requirement.

Never modify other VPS applications or put financial/customer data, database files, keys, or `.env` files in Git. Save all source/runbook changes to `main`.
