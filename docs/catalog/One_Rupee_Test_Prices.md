# ₹1 test-price checklist

Snapshot: 15 October 2026 at 3:21:29 pm IST. These prices were deliberately set for testing and have not been changed. Recheck both systems before going live.

| Product | Pack | Meta retailer ID | Meta price | Website price | Intended live price | Meta restored | Website restored |
|---|---|---|---:|---:|---|---|---|
| Coconut Oil | 200 ml | 7bcdpj5v7b | ₹1 | ₹1 | To set | ☐ | ☐ |
| Groundnut oil | 500 ml | dtditk1gc0 | ₹1 | ₹1 | To set | ☐ | ☐ |
| Safflower Oil | 500 ml | adk09bs27q | ₹1 | ₹1 | To set | ☐ | ☐ |
| Sunflower Oil | 500 ml | akdrt9pwv9 | ₹1 | ₹1 | To set | ☐ | ☐ |

There are 4 ₹1 Meta items and 4 ₹1 website variants. Mustard 200 ml is now ₹90 in both systems and is no longer in this checklist.

## Before going live

- Set the intended price for each row above; no live prices have been guessed.
- Update Meta and Supabase ProductVariant prices deliberately. Importing the CSV into Meta does not change website prices.
- Refresh the CSV after changing prices; this snapshot still contains the ₹1 values.
- Verify one item of each pack and a mixed-pack cart in both channels. WhatsApp uses the incoming Meta order price; website checkout uses the selected Supabase variant price. Confirm order totals and payment amounts in paise.
- Confirm payment mode and the outstanding live-payment checks in website/PAYMENTS.md before collecting real money. This checklist does not change payment mode.

## Resolved price differences

Jaggery 1 kg (mt-jaggery-1000g) is now ₹85 in both systems. Mustard 200 ml is ₹90 in both. All 94 current prices agree. The refreshed CSV includes these owner corrections and excludes the removed extra Panchagavya item. The owner completed successful ₹1 purchases in both channels; the additional live test with a pack whose retailer ID differs from its parent is deferred at the owner’s request. See ../plans/LIVE_PAYMENT_AUDIT_2026-10-14.md.
