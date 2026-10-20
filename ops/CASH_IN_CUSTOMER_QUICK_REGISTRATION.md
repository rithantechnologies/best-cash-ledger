# Cash In — inline customer registration

Client Tamil voice request: the Cash In "Find saved customer" field searches
mobile, name, and saved card details, but staff need to register a customer
right there instead of leaving the Cash In form. Mobile is important where
available but some customers have no mobile number. Client will send the
Excel entry format separately; this release does not assume its fields.

## Behavior

- Cash Counter > Cash In > Transfer > Find saved customer now offers
  **+ Register here**.
- Inline mini-form asks **Customer name** (required) and **Mobile** (optional).
  A supplied mobile must be an Indian 10-digit number starting 6–9.
- Name/mobile may be prefilled from the current search or the unsaved walk-in
  fields, without fabricating phone numbers.
- **Save customer & select** uses authenticated POST /api/customers with a
  valid configured active customer type. It uses existing server-side duplicate
  mobile checks and customer audit logging.
- The new profile is immediately selected and its ID is used when staff save
  the separate Cash In transaction. Amount, commission and transfer destination
  are preserved during registration.
- Existing saved-customer search remains available. If registration fails,
  the draft remains open and the error is shown inline. There is no automatic
  financial posting or bank/card association from registering alone.
- Staff can use a walk-in name/mobile without registering if they prefer.
- A registration in progress blocks Cash In form closing/posting to avoid
  an accidental transaction before the customer has been selected.
- For saved card search, cards are registered using the existing Customers or
  Card Swipe card flows. Cash In registration does not invent card details.

## Deployment and safety

No schema changes, migrations, balance edits, or changes to unrelated services.
Client VPS only. Commit to Git main before staged release deployment.
