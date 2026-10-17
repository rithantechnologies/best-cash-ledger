# Cash Ledger — Custom bank account images

Available to **Owner only** in Accounts → Bank → open an account → Edit → Bank profile image.

- Existing bank logos and text initials are still the default.
- Owner can upload a JPEG, PNG or WebP under 2 MB; staff can see the chosen bank picture but cannot change it.
- Owner can click **Use default logo** to restore the old icon.
- Each upload/removal writes a FINANCIAL_ACCOUNT audit event. No balances or transactions are touched.
- Images are served through the authenticated Cash Ledger API. No image endpoint is publicly readable without a login.
- No database schema migration required.
- Production image files live in a stable folder `/var/www/cashledger/releases/.client-bank-images`, **outside all numbered app release directories**; the production account `cashledger` must be able to write there.
- Override storage path using `CASHLEDGER_BANK_IMAGES_DIR` on other/client VPS installs; create the directory in shared persistent storage with access limited to the Cash Ledger API service account.
- Back up this image directory separately from the PostgreSQL database when migrating VPSs. These small asset files are **not** inside the DB backup.
- Never delete the image directory in code-release retention/cleanup. It is deliberately not itself a release folder.
