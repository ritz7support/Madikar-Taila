# ₹1 test-price checklist

Verified: 14 October 2026 at 11:43:29 pm IST. The owner corrected Mustard/Jaggery prices and completed successful live ₹1 purchases through WhatsApp and the website. The four test prices below remain deliberately ₹1 in both systems. Recheck both systems before going live.

| Product | Pack | Meta retailer ID | Meta price | Website price | Intended live price | Meta restored | Website restored |
|---|---|---|---:|---:|---|---|---|
| Coconut Oil | 200 ml | 7bcdpj5v7b | ₹1 | ₹1 | To set | ☐ | ☐ |
| Groundnut oil | 500 ml | dtditk1gc0 | ₹1 | ₹1 | To set | ☐ | ☐ |
| Safflower Oil | 500 ml | adk09bs27q | ₹1 | ₹1 | To set | ☐ | ☐ |
| Sunflower Oil | 500 ml | akdrt9pwv9 | ₹1 | ₹1 | To set | ☐ | ☐ |

There are 4 ₹1 Meta items and 4 ₹1 website variants. Mustard 200 ml (rihd1eocew) is now ₹90 in both systems and has been removed from this test-price list.

## Before going live

- Set the intended price for each row above; no live prices have been guessed.
- Update Meta and Supabase ProductVariant prices deliberately. Importing the CSV into Meta does not change website prices.
- Refresh the CSV after changing prices; this snapshot still contains the ₹1 values.
- Verify one item of each pack and a mixed-pack cart in both channels. WhatsApp uses the incoming Meta order price; website checkout uses the selected Supabase variant price. Confirm order totals and payment amounts in paise.
- Confirm payment mode and the outstanding live-payment checks in website/PAYMENTS.md before collecting real money. This checklist does not change payment mode.

## Resolved price differences

Jaggery 1 kg (mt-jaggery-1000g) is now ₹85 in both systems. Mustard 200 ml is ₹90 in both. All 94 current Meta/website variant prices agree. The 22:39 CSV predates these corrections and the extra Panchagavya removal; do not upload that historical export unchanged. See ../plans/LIVE_PAYMENT_AUDIT_2026-10-14.md.
