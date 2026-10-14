# Synthetic 16-digit card demo

Only for the current development/demo server. Never use real cardholder data.

On a customer page, add a saved card and select one of four fixed published synthetic test numbers. Cards always display last four digits, with an authenticated **Copy 16 digits** action. Existing cards may link a test number when the last four digits match. The copy action is audited.

Backend access is disabled by default. For this demo only, configure `DEMO_CARD_COPY_ENABLED=true` and a random 32-byte key as 64 hexadecimal characters in `DEMO_CARD_ENCRYPTION_KEY`, outside Git. Values are encrypted in their own database table using AES-256-GCM. Normal customer/card APIs never return the full value; only the designated authenticated copy action can return the synthetic test value. Responses are no-store.

The backend accepts ONLY these known published non-real values: `4242424242424242`, `5555555555554444`, `4000000000000002`, `4111111111111111`. Any other number is rejected.

In the later client VPS, omit both demo environment variables; do not enable this feature for actual payment card data. Do not collect CVV, PIN, expiry, or other sensitive authentication data.
