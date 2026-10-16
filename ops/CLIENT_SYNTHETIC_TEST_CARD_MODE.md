# Client VPS synthetic test-card mode

An explicit client request on 2026-10-16 authorized temporary internal testing of the 16-digit card input on the new Cash Ledger client VPS, in addition to the existing old demo. This exception is for synthetic numbers only, not real payment card data.

The deployed application already supports typing any exactly 16-digit test string and saving, editing, viewing and copying it from a customer's Saved Cards screen. The controls are exposed when `DEMO_CARD_COPY_ENABLED=true` and `DEMO_CARD_ENCRYPTION_KEY` contains a fixed 32-byte hexadecimal encryption key in the protected API environment. Browser and API authentication, AES-256-GCM encryption at rest and view/copy audit logs must remain intact.

As root on the approved new client VPS, run:

```bash
bash /home/cashdeploy/cashledger-source/ops/enable-client-synthetic-test-cards.sh
```

The guarded script verifies the correct client server and API, checks for previously encrypted demo card records before creating an encryption key, backs up the root-owned environment, sets the two values without printing the encryption key, restarts only the Cash Ledger client API, and validates that the new process actually loaded the values. It does not write transactions, change opening balances or modify the old demo VPS. This script is client-instance-specific and must be adapted and reviewed before use for future client VPS installations.

**Never enter a real card PAN, CVV, PIN or expiry.** The input can also accept real-looking 16-digit numbers, which cannot be automatically distinguished from test numbers. This feature is not a payment-card vault or a substitute for PCI compliance. Keep the encryption key outside Git and stable across releases. The default for other production installations remains disabled.
