# Madikar Taila

Canonical monorepo for the public [storefront](https://madikartaila.com), admin dashboard and Supabase WhatsApp ordering/payment backend. Completed phase-one work is consolidated on `main`; create new work branches from current main after checking Git status/history.

Start with [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) and [Project_Instructions.md](Project_Instructions.md). The latest checkpoint is [the 18 October review-fix report](docs/plans/PHASE_ONE_REVIEW_FIXES_2026-10-18.md), following [the phase-one closure report](docs/plans/PHASE_ONE_CLOSE_2026-10-17.md). Earlier dated sections are historical where superseded.

- `website/`: editable frontend and Sites Worker source. Sites is a separate publishing mirror of this directory, using the same existing public Site.
- `supabase/functions/`: deployed Edge Functions. Website/admin logic lives in `madikar-store`; preserve the [bot boundaries](BOT_BACKEND_DO_NOT_TOUCH.md).
- `supabase/migrations/` and `supabase/tests/`: versioned database changes and rollback-only database fixtures.
- `docs/catalog/`: current delivered Meta CSV, guide and intentional ₹1-price checklist. Never invoke the old full catalog sync as routine maintenance.

From `website/`, run `npm test` for offline regression tests and `npm run build` for the Worker. Real payments, customer messages, database migrations, stock sync and deployments are separate production actions; the offline tests mock external services.

[Claude review prompt](docs/plans/CLAUDE_PHASE_ONE_REVIEW_PROMPT.md) · [Website handoff](WEBSITE_HANDOFF.md) · [Payment behavior](website/PAYMENTS.md) · [Catalog schema](PRODUCT_CATALOG_SCHEMA.md)
