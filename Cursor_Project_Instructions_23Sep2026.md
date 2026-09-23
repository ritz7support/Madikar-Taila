# WhatsApp Flow App — Cursor Instructions

## Runtime source of truth
Treat the live Supabase project and deployed Edge Functions as the runtime source of truth.

Current functions:
- whatsapp-webhook v78
- whatsapp-flow v40
- razorpay-webhook v21
- sync-meta-catalog v3
- meta-catalog-webhook v3

## Before making changes
1. Inspect the current deployed Edge Function source.
2. Inspect the relevant live Supabase schema/data when applicable.
3. For WhatsApp Flow or WhatsApp Cloud API changes, consult the latest Meta documentation first.
4. Make one focused change at a time.
5. Deploy the complete function, then verify the active version.
6. Test the real runtime path.

## Protected paths
Do not modify the working Address Flow JSON unless a specific Flow-layer problem is demonstrated.
Protect:
- registration
- registration → main menu
- cart → address Flow → address attachment
- Razorpay Payment Link → review_and_pay
- Razorpay payment_link.paid → order/payment status
- Settings → Update Personal Information

## Current catalog architecture
Meta Catalog
→ meta-catalog-webhook
→ sync-meta-catalog
→ public.Product

The catalog is subscribed to the Meta app.

Catalog webhook:
- GET verification uses WHATSAPP_CATALOG_VERIFY_TOKEN.
- POST signature verification uses WHATSAPP_APP_SECRET.
- Handles product_feed and items_batch.
- Triggers sync-meta-catalog asynchronously.

sync-meta-catalog:
- Uses Meta fields retailer_id, name, description, url.
- Maps url → Product.product_link.
- Upserts by (catalog_id, retailer_id).
- Removes stale products after a successful full sync.
- verify_jwt=true.

## Current Product schema
Product contains:
- id
- created_at
- name
- retailer_id
- description
- product_link
- catalog_id
- updated_at

Product does not contain transaction price. Checkout uses the incoming WhatsApp order-item price.

## Current main menu
Only:
- Place a new order
- Settings

Do not reintroduce Order history unless explicitly requested.

## Current Supabase advisories
- public.payments: RLS disabled — critical; do not blindly enable without policies.
- Product/Profile: RLS enabled, no policies.
- Two functions have mutable search_path warnings.
- Leaked-password protection is disabled.

## Test-only functions
These are not production dependencies:
- whatsapp-flow-key-register-test
- test-order-status

## Documents
Use these project sources together:
- WhatsApp_Flow_Project_Handoff_September_2026_v6.docx
- WhatsApp_Outbound_Message_JSON_Reference_23Sep2026_v6.docx
- WhatsApp_Flow_Error_Prevention_Guide_Updated_23Sep2026_v6.docx
- Latest Address Flow JSON_7.3.md

Do not assume the documents are newer than the live deployment. If they conflict, inspect the live deployment and treat it as authoritative.
