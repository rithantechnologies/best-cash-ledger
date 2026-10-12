# India bank & IFSC lookup snapshot

Source: Razorpay's public Indian bank IFSC directory, release `v2.0.62` (published 2026-09-01).
Original source: https://github.com/razorpay/ifsc/releases/tag/v2.0.62

The compressed JSON snapshot contains 1,348 named banks and 182,179 IFSC/branch rows.
Rows lacking a bank name in the source were excluded; staff may enter missing banks
and IFSCs manually. IFSC assignments and branch names can change, so the directory
should be refreshed periodically. The lookup is informational, not beneficiary
account ownership validation.

To regenerate the snapshot after downloading the release's `IFSC.csv`:

```bash
python3 scripts/build-ifsc-directory.py IFSC.csv apps/api/data/ifsc-branches.v2.0.62.json.gz
```

When changing the dataset version, adjust the filename in
`src/customers/bank-directory.service.ts` and include the file in the
API build artifact. The GitHub Actions release workflow packages `apps/api/data`
alongside `apps/api/dist` for client VPS deployment.
