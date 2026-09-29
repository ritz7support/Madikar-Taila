# Madikar Taila checkout setup

The storefront collects a delivery address before online payment. The secure Worker creates a Razorpay order from server-side catalog prices and stores the address and item summary in that order's `notes`. On return from Checkout it verifies the Razorpay signature and confirms the payment is captured via Razorpay's API. The customer-facing payment button remains disabled until all values below are set in **Sites runtime environment variables** and the Site is redeployed.

| Variable | Type | Purpose |
| --- | --- | --- |
| `RAZORPAY_KEY_ID` | Plain value | Public Checkout key ID from the Razorpay account |
| `RAZORPAY_KEY_SECRET` | Secret | Server-only API credential; never put it in source or browser code |
| `SHIPPING_FLAT_PAISE` | Plain value | Flat Indian shipping charge in paise; use `0` only if shipping is free |

Before accepting real payments, confirm product prices and available delivery areas, enable automatic capture in Razorpay, set these values with live keys, redeploy, then place a real end-to-end test order. Test mode keys can be used first. Checkout currently assumes delivery in India and a single flat shipping charge. The Razorpay dashboard order notes are the merchant's fulfillment record; this storefront does not include automatic dispatch or a separate order-management database.

Until activation, customers can enter their address and choose **Send order and address on WhatsApp**. That option opens a message for the customer to send and does not claim to have taken payment.
