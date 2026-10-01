# Policy and help pages — 30 September 2026

Five standalone pages have been added to `dist/client/`, with shared `policies.css` and links in the main storefront footer:

- `/privacy-policy`
- `/terms-and-conditions`
- `/shipping-policy`
- `/cancellation-refund-policy`
- `/faq`

The HTML files work without JavaScript or a catalog request. The FAQ uses native `details`/`summary` controls. The existing Sites assets handler serves extensionless HTML routes, as it does for the admin page. No new backend, database, dependency or payment configuration is required. These pages were integrated into the source of the existing Site after version 15.

Current checkpoint (1 October): these pages are published on Site version 24. Their cross-page option bar and breadcrumbs were removed. Checkout is now enabled with zero shipping; the historical conditional payment/shipping wording below should be reviewed against current business policy. See PAYMENTS.md; no policy commitment was changed during consolidation.

## Sources and adaptation

Read the corresponding five pages at `https://madikartaila.netlify.app/` on 30 September 2026. The source pages' effective date is 1 September 2026. The old site's buttons were not responding; direct routes exposed the policies and its public bundle supplied the eight FAQ answers.

Preserved the policy substance: processing in 1–2 business days; local same/next-day estimates; South India 2–4 business days; other India 3–6 business days; 48-hour damage/error reporting; 12–24-hour claim review; 5–7-business-day refunds to the original payment method; no COD; original legal jurisdiction and liability terms.

Adaptations to current functionality and unsupported source claims:

- Describe actual localStorage shopping-bag persistence; omit unverified analytics cookies, mandatory staff MFA and continuous security monitoring claims.
- Payment wording is conditional because the current website checkout is not enabled. No payment feature was enabled.
- Replace the old site's website tracking button with customer-care tracking assistance; no tracking page exists here.
- Remove absolute “100% safe”, “no nutrients destroyed” and sediment-as-proof-of-purity claims. Retain source-backed process and storage information without guarantees.
- Use the consistent Hubballi–Dharwad area description for the mill. The old policy pages say Hubballi 580001, while the current storefront and handoff say Dharwad; verify the exact postal address.
- The old cancellation summary says “before dispatch or within 12 hours”, while its detailed rule is “Prior to Dispatch (Within 12 Hours)” and prohibits cancellation in transit. The page uses the detailed rule consistently: within 12 hours and before dispatch. Confirm this intended cutoff.
- The dedicated old Shipping Policy lists free local delivery from ₹499 and a ₹0 fee below ₹499. Those values are retained, but appear redundant. Its site-wide banner also advertises free India delivery, while the dedicated policy says national rates vary by weight and destination. Confirm the intended fee schedule; no new shipping fee or free-national-shipping promise was invented.

## Integration and validation

The policy pages were built locally first. The current publishing pass opened version 15 (`6b7b3d2fbed74935e8a8e15580ecbc5d7df4fef4`) as its source and retained its product-page/category work and catalog recovery.

All ten existing catalog-loading/product-route and checkout-worker checks passed. Local page/link and responsive checks are recorded in `outputs/policy-pages-20260930/REPORT.md` at the repository root. No bot or Supabase files were modified.
