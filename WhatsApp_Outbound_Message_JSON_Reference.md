# WhatsApp Outbound Message JSON Reference

Last updated: 24 September 2026 (evening), reconstructed directly from the deployed source of `whatsapp-webhook` v83 and `razorpay-webhook` v24. Supersedes `WhatsApp_Outbound_Message_JSON_Reference_23Sep2026_v6.docx` (deleted — it was stale and partially out of date, e.g. it still implied "View oil" was reachable from the menu). The "View oil" dead code (`viewOil()`/`OIL_PRODUCT_IDS`, §7 below) has since been deleted from `whatsapp-webhook` entirely (v83) — kept in this doc's history for context, removed from the current inventory (§11).

The deployed function source is the runtime source of truth. Placeholder values below (`<...>`) are illustrative.

Common destination: `POST /{WHATSAPP_PHONE_NUMBER_ID}/messages` (phone number ID defaults to `1327606333760280`, overridable via the `WHATSAPP_PHONE_NUMBER_ID` secret).

## 1. Registration template

Sent by `whatsapp-webhook` on the first message from an unrecognized WhatsApp ID, or any text message from a recognized profile that still has no name.

```json
{
  "messaging_product": "whatsapp",
  "to": "<WA_PHONE_NUMBER>",
  "type": "template",
  "template": {
    "name": "registration",
    "language": { "code": "en" },
    "components": [{
      "type": "button",
      "sub_type": "flow",
      "index": "0",
      "parameters": [{ "type": "action", "action": { "flow_token": "<RANDOM_UUID>" } }]
    }]
  }
}
```

Note: the registration flow_token is a bare random UUID — it carries no identity. `whatsapp-flow` never sees this Flow's INIT/data_exchange calls; the submitted name/email come back to `whatsapp-webhook` as an `nfm_reply` message instead (see §12).

## 2. Update Personal Information template ("Settings")

Sent when the customer taps the "Settings" button/reply. Uses the **same underlying Flow** as registration.

```json
{
  "messaging_product": "whatsapp",
  "to": "<WA_PHONE_NUMBER>",
  "type": "template",
  "template": {
    "name": "update_personal_info",
    "language": { "code": "en" },
    "components": [{
      "type": "button",
      "sub_type": "flow",
      "index": "0",
      "parameters": [{ "type": "action", "action": { "flow_token": "update-profile:<WA_PHONE_NUMBER>:<NONCE>:<EXPIRY_UNIX>:<HMAC_SHA256_HEX>" } }]
    }]
  }
}
```

The `update-profile:<wa_id>:...` token IS read by `whatsapp-flow` on `INIT` (to pre-fill current name/email), but the actual save still happens via `nfm_reply` on `whatsapp-webhook`. **Updated 24 Sep evening**: this token is now HMAC-signed and verified the same way as the checkout-address token below (see §8).

## 3. Main menu (interactive button message)

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "<WA_PHONE_NUMBER>",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "header": { "type": "text", "text": "Main menu" },
    "body": { "text": "Hi *<NAME>*!\nWhat would you like to do today?\n\nNote: You can always type \"Hi\" for the main menu" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "place_new_order", "title": "Place a new order" } },
        { "type": "reply", "reply": { "id": "settings", "title": "Settings" } }
      ]
    }
  }
}
```

Only two buttons — "Order history" is intentionally not present (deferred; do not reintroduce unless explicitly requested). The body text uses a real `\n` line break (fixed 24 Sep — a prior deploy had an escaped `\\n` that rendered literally).

## 4. Place a new order template

Sent when "Place a new order" is tapped.

```json
{
  "messaging_product": "whatsapp",
  "to": "<WA_PHONE_NUMBER>",
  "type": "template",
  "template": { "name": "place_new_order", "language": { "code": "en" } }
}
```

This template's own buttons (in WhatsApp Business Manager) lead to "View catalogue" and "View popular oil products" — both handled by the button/button_reply cases below.

## 5. Full catalogue template

```json
{
  "messaging_product": "whatsapp",
  "to": "<WA_PHONE_NUMBER>",
  "type": "template",
  "template": {
    "name": "full_catalogue",
    "language": { "code": "en" },
    "components": [{
      "type": "button",
      "sub_type": "CATALOG",
      "index": "0",
      "parameters": [{ "type": "action", "action": { "thumbnail_product_retailer_id": "sdedto6u1x" } }]
    }]
  }
}
```

`sdedto6u1x` (Almond Oil) is hard-coded as the catalogue thumbnail — confirm this is the intended product.

## 6. Popular products (product_list)

Triggered by "View popular oil products". Retailer IDs are fetched live from a Meta product set (`1027827043551409`, hard-coded, not overridable via env var) on every tap — up to 30 items.

```json
{
  "messaging_product": "whatsapp",
  "to": "<WA_PHONE_NUMBER>",
  "type": "interactive",
  "interactive": {
    "type": "product_list",
    "header": { "type": "text", "text": "Popular products" },
    "body": { "text": "Choose from our most popular products." },
    "action": {
      "catalog_id": "1515875913870520",
      "sections": [{
        "title": "Popular products",
        "product_items": [
          { "product_retailer_id": "<RETAILER_ID_1>" },
          { "product_retailer_id": "<RETAILER_ID_2>" }
        ]
      }]
    }
  }
}
```

## 7. "View oil" (product_list) — **removed (24 Sep evening, v83)**

Previously existed in `whatsapp-webhook` (`viewOil()`, hard-coded to the two IDs `sdedto6u1x`, `5wovdlm67j`) but nothing in the current menu, button, or button_reply handling called it — superseded by "View catalogue" + "Popular products". Confirmed unreachable and deleted along with `OIL_PRODUCT_IDS` and its two dead call sites in the `button`/`button_reply` handlers.

## 8. Delivery Address Flow template

Sent right after a WhatsApp cart order is created.

```json
{
  "messaging_product": "whatsapp",
  "to": "<WA_PHONE_NUMBER>",
  "type": "template",
  "template": {
    "name": "address",
    "language": { "code": "en" },
    "components": [{
      "type": "button",
      "sub_type": "flow",
      "index": "0",
      "parameters": [{ "type": "action", "action": { "flow_token": "checkout-address:<ORDER_ID>:<WA_ID>:<NONCE>:<EXPIRY_UNIX>:<HMAC_SHA256_HEX>" } }]
    }]
  }
}
```

**Updated 24 Sep evening**: the token is now `checkout-address:<ORDER_ID>:<WA_ID>:<NONCE>:<EXPIRY_UNIX>:<HMAC_SHA256_HEX>` — HMAC-signed by `whatsapp-webhook` (`FLOW_TOKEN_SECRET`) and verified by `whatsapp-flow` before the embedded order id is trusted for address-book lookups. The final address-attach `PATCH` in `whatsapp-webhook` is additionally, and independently, constrained by `whatsapp_user_id` + `status = pending_payment` + `address_id IS NULL`. See handoff doc §9/§14.

## 9. Review and Pay (order_details / review_and_pay)

Sent once the address is attached and a Razorpay Payment Link exists.

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "<WA_PHONE_NUMBER>",
  "type": "interactive",
  "interactive": {
    "type": "order_details",
    "body": { "text": "Here's your order summary. Tap below to review and pay." },
    "action": {
      "name": "review_and_pay",
      "parameters": {
        "reference_id": "<ORDER_REFERENCE_ID>",
        "type": "physical-goods",
        "payment_type": "upi",
        "currency": "INR",
        "total_amount": { "value": "<TOTAL_IN_PAISE>", "offset": 100 },
        "order": {
          "status": "pending",
          "catalog_id": "1515875913870520",
          "items": [{
            "retailer_id": "<PRODUCT_RETAILER_ID>",
            "name": "<PRODUCT_NAME_OR_RETAILER_ID>",
            "amount": { "value": "<UNIT_PRICE_IN_PAISE>", "offset": 100 },
            "quantity": "<QUANTITY>"
          }],
          "subtotal": { "value": "<SUBTOTAL_IN_PAISE>", "offset": 100 },
          "shipping": { "value": "<SHIPPING_IN_PAISE>", "offset": 100 },
          "discount": { "value": "<DISCOUNT_IN_PAISE>", "offset": 100 }
        },
        "payment_settings": [{ "type": "payment_link", "payment_link": { "uri": "<RAZORPAY_PAYMENT_LINK_URL>" } }]
      }
    }
  }
}
```

**Not yet present but planned**: an `order.expiration` object (`{timestamp, description}`, minimum 300 seconds) matching the Razorpay Payment Link's `expire_by`. Currently the link lasts 24h and the card has no expiration at all — both should be tightened to ~15 minutes together (see handoff doc §7/§14).

Dynamic field mapping: `reference_id`←`orders.reference_id`, `catalog_id`←`orders.catalog_id`, `total_amount`←`orders.total` (×100), `items[].retailer_id`←`order_items.product_retailer_id`, `items[].name`←`order_items.product_name` (falls back to `retailer_id`), `items[].amount`←`order_items.unit_price` (×100), `items[].quantity`←`order_items.quantity`, `subtotal/shipping/discount`←same-named `orders` columns, `payment_settings[].payment_link.uri`←`payments.provider_payment_link_url`.

## 10. Payment received (order_status), sent by `razorpay-webhook`

Sent (with up to 3 retries) after the verified `payment_link.paid` webhook moves the order to `processing`.

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "<WA_PHONE_NUMBER>",
  "type": "interactive",
  "interactive": {
    "type": "order_status",
    "body": { "text": "*Payment received ✓*\n\nThank you for your order! We've received your payment and are now processing your order. We'll keep you updated on its progress." },
    "action": {
      "name": "review_order",
      "parameters": {
        "reference_id": "<ORDER_REFERENCE_ID>",
        "order": { "status": "processing" },
        "payment": { "status": "captured", "timestamp": "<UNIX_SECONDS>" }
      }
    }
  }
}
```

## 11. Current outbound inventory

- `registration` — template with Flow button
- `update_personal_info` — template with Flow button (shares the registration Flow)
- `place_new_order` — template
- `full_catalogue` — template with CATALOG button
- `product_list` — interactive: Popular products (live)
- `address` — template with Flow button and `checkout-address` token
- Main menu — interactive button message: Place a new order, Settings
- `order_details`/`review_and_pay` — interactive checkout/payment message
- `order_status` — interactive payment-confirmation message (sent by `razorpay-webhook`, not `whatsapp-webhook`)

## 12. Runtime notes

- `whatsapp-webhook` v86 is current as of 24 Sep 2026 (evening); `whatsapp-flow` v47; `razorpay-webhook` v24.
- WhatsApp API version `v25.0`; catalog ID `1515875913870520`; phone number ID `1327606333760280` (all overridable via env vars of the same name, except the popular-product-set ID and the oil-product IDs, which are hard-coded).
- Razorpay Standard Payment Link URL is dynamic, from `payments.provider_payment_link_url`. Payment success is finalized only by the verified `payment_link.paid` webhook.
- Template names, language, button types and approved components must match the configured WhatsApp Business Account templates exactly.
- The Address Flow JSON is maintained separately in `Latest Address Flow JSON_7.3.md`.
