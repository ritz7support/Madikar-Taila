# Website handoff — 28 September 2026

## Where to start

The owner has paused WhatsApp bot work and is moving to the website built with ChatGPT Sites. The website source is managed in Sites; this repository contains the bot backend, Supabase migrations, and bot documentation. Do not assume this repo contains the current Sites website source. Keep website source in a separate sibling project or checkout. If the website needs Supabase work, add its own named functions, new migrations/tables, and access paths, with a clear boundary from the bot.

Read `BOT_BACKEND_DO_NOT_TOUCH.md` before any website or shared Supabase change. The same Supabase project (`faoomjgkofqrdajaftjd`, region `ap-south-1`) hosts the bot, so do not edit or redeploy bot functions, shared bot code, existing applied migrations, bot configuration, or bot table privileges as a side effect of website work. Inspect live schema and permissions before adding website objects. Do not grant the website's `anon`/`authenticated` roles direct access to customer order, address, or payment tables merely to make website features work.

The separate `madikar-store` Edge Function is active in that project at v2 as of this handoff. It is not part of this repo's bot function source. Inspect its deployed source and the Sites project before designing or changing the website integration; do not infer its behavior from its name or version.

## Bot state to preserve

The bot source of truth is the `cursor/production-hardening` branch of this repo and the live Supabase project. Do not assume `main` includes the latest bot changes. The latest bot commits on this branch before this documentation update are `6f9677d` (main menu reminder) and `2d58475` (address change). Deployed bot function versions checked on 28 Sep: `whatsapp-webhook` v92, `whatsapp-flow` v48, `razorpay-webhook` v30, `sync-meta-catalog` v9, `retry-order-handoffs` v4. Platform version numbers can advance without source changes, so compare actual source when parity matters.

- The main menu message includes: `Note: You can always type "Hi" for the main menu`.
- After an address is selected, the bot sends the `review_and_pay` order message, then the approved `change_address` template in English (`en`). Its Flow button opens the same Address Flow. A replacement is accepted only while the order is `pending_payment`, and only for an active address belonging to that order's profile. The bot sends the same pair again after a replacement.
- Live order 135 tested the complete replacement and payment path on 28 Sep. Both outbound messages returned HTTP 200 in the intended send order. The order's address became the replacement. A ₹3 live-mode payment produced a successful `payment_link.paid` webhook, marked payment 29 `paid`, advanced order 135 to `processing`, sent the payment-confirmation WhatsApp message once (HTTP 200), and completed the n8n handoff on the first attempt. The Google Sheet row was not independently checked.
- The approximately 16-minute payment-link expiry and `payment_link.expired`/`cancelled` handling are implemented. A real expired/cancelled link has not yet been tested. Supabase account MFA remains an owner-side item. Those are outstanding bot follow-ups, not prerequisites for starting separate website work.

See `Project_Instructions.md` for the repo workflow, `WhatsApp_Flow_Project_Handoff.md` for architecture and bot history, and `WhatsApp_Outbound_Message_JSON_Reference.md` for current message contracts.
