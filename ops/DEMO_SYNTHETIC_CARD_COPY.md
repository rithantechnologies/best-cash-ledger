# Synthetic 16-digit card demo

For the configured development/demo server only. Not suitable for deployment with live payment data without issuer/acquirer approval and compliance controls.

On a customer page, add a saved card and type a 16-digit demo number. Cards always display last four digits, with an authenticated **Copy 16 digits** action. Existing cards may link a test number when the last four digits match. The copy action is audited.

Backend access is disabled by default. For this demo only, configure `DEMO_CARD_COPY_ENABLED=true` and a random 32-byte key as 64 hexadecimal characters in `DEMO_CARD_ENCRYPTION_KEY`, outside Git. Values are encrypted in their own database table using AES-256-GCM. Normal customer/card APIs never return the full value; only the designated authenticated copy action can return the synthetic test value. Responses are no-store.

The backend accepts any exactly 16-digit sequence when the demo flag and encryption key are set. Checksum filtering is disabled in this environment. This can include real PANs; using the feature with live merchant data requires separately verified legal and contractual authorization.

In the later client VPS, omit both demo environment variables; do not enable this feature for actual payment card data. Do not collect CVV, PIN, expiry, or other sensitive authentication data.

## Upgrade an existing last-four-only card

Open Customers → the existing profile → Saved Cards → **Edit**. In development demo mode, the edit form has an optional **Add or replace 16-digit demo number** input. Enter a 16-digit value: when 16 digits are entered, the last four update automatically. Saving updates the *same* customer card record and encrypted demo value in one transaction; card-linked histories are unchanged. Leaving the field blank preserves any already linked demo number. If a demo value is already attached, ordinary editing cannot change its last four without a replacement 16-digit entered number, preventing inconsistent masked identifiers.
