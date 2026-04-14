# Cart donation estimate

- Snippet: `snippets/cart-donation-estimate.liquid` -> `snippets/cart-summary.liquid` (cart + drawer).
- **Variant** `custom.donation_profit` (money): money per unit (set in admin to mirror profit/COGS); storefront Liquid **cannot** read `variant.cost`.
- (Optional fallback) **Variant** `custom.donation_profit_cents` (integer): cents per unit.
- **Shop** `custom.donation_rate_percent` (integer), default `10`.
- **Formula:** `sum(profit_cents * qty per line) * rate_percent / 100`
