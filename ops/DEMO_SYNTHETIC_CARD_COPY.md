# Synthetic 16-digit card demo

Only for the current development/demo server. Never use real cardholder data.

On a customer page, add a saved card and type a 16-digit dummy test number. Cards always display last four digits, with an authenticated **Copy 16 digits** action. Existing cards may link a test number when the last four digits match. The copy action is audited.

Backend access is disabled by default. For this demo only, configure `DEMO_CARD_COPY_ENABLED=true` and a random 32-byte key as 64 hexadecimal characters in `DEMO_CARD_ENCRYPTION_KEY`, outside Git. Values are encrypted in their own database table using AES-256-GCM. Normal customer/card APIs never return the full value; only the designated authenticated copy action can return the synthetic test value. Responses are no-store.

The backend accepts arbitrary typed 16-digit dummy strings only when they fail the Luhn payment-card checksum, plus the published synthetic test values `4242424242424242`, `5555555555554444`, `4000000000000002`, `4111111111111111`. It rejects real-looking Luhn-valid numbers; this guard is not a substitute for a compliant card-vault integration.

In the later client VPS, omit both demo environment variables; do not enable this feature for actual payment card data. Do not collect CVV, PIN, expiry, or other sensitive authentication data.

## Upgrade an existing last-four-only card

Open Customers → the existing profile → Saved Cards → **Edit**. In development demo mode, the edit form has an optional **Add or replace 16-digit demo number** input. Enter a dummy value: when 16 digits are entered, the last four update automatically. Saving updates the *same* customer card record and encrypted demo value in one transaction; card-linked histories are unchanged. Leaving the field blank preserves any already linked demo number. If a demo value is already attached, ordinary editing cannot change its last four without a replacement 16-digit dummy value, preventing inconsistent masked identifiers.
