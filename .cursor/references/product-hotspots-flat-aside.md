# Product hotspots flat — aside column

## Pinned variant URLs

Match **main-collection** / **product-card**: resolve pin to a variant object with `product.variants | where: 'id', numeric_id | first`, then use **`variant_to_link.url`** (same as `snippets/product-card.liquid`).

Callers run `hotspots-flat-pinned-variant-id` **once** when `hotspot_variant_name` is non-blank, then pass `active_variant` and **`pin_lookup_completed: true`** into `hotspots-flat-product-actions` so price/quick-add does not run the pin snippet again.

## Add / Choose button on aside cards

Aside cards must render `snippets/hotspots-flat-product-actions.liquid` from `snippets/hotspots-flat-aside-product-card.liquid` (price + quick-add row). If the card only uses `{% render 'price' %}`, the right column will show price but **no** Add/Choose — look for `hotspots-flat-price-row` in the HTML.

If the live page only shows a price block with class `hotspots-aside-card__price` and **no** `hotspots-flat-price-row`, the published theme is likely missing an updated `hotspots-flat-aside-product-card.liquid` (or the dev preview is pointing at a different theme).

Quick-add on aside cards is shown when the product is **available**; it is not gated on the theme “Quick add” setting so aside/dialog stay consistent with cart upsell behavior.

## Why aside buttons were invisible while dialog worked

`snippets/quick-add.liquid` sets desktop `.quick-add__button` to `opacity: 0` and only `product-card:is(:hover, :focus-within)` sets `opacity: 1`. Aside cards are `resource-card`, not `product-card`, so that rule never runs. Hotspot **dialogs** use `sections/product-hotspots-flat.liquid` rules under `.hotspot-dialog[open] .quick-add__button { opacity: 1 }`. The section also sets `.section-product-hotspots-flat__aside` overrides so aside rows match dialog behavior.

## Product link hit target

The product link is scoped to `resource-card__media` so price and quick-add stay clickable (no full-card overlay link).

**Note:** `snippets/quick-add.liquid` and `assets/quick-add.js` are kept on theme defaults (no aside-specific form id suffix or JS fallbacks). If the same hotspot block renders quick-add in both aside and dialog, duplicate `id` attributes on product forms are possible; pinned variant URLs on `a.resource-card__link` still supply `?variant=` for the modal fetch.
