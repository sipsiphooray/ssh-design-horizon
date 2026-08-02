# Collection product cards: variant display

- **Collection grids now rely on Shopify's native "variants as collection items"** — a
  variant assigned to a collection surfaces through the product drop
  (`selected_or_first_available_variant`) with no theme-side resolution. The old
  `collection.metafields.custom.variants_to_render` resolve (title-contains + list-order
  tie-break, duplicated across `blocks/_product-card.liquid`, `blocks/product-title.liquid`,
  `blocks/price.liquid`, `snippets/product-card.liquid`, `snippets/card-gallery.liquid`)
  has been removed; cards use upstream Horizon behavior.
- **Curated variant list** (`sections/curated-variant-list.liquid`) still pins an explicit
  variant via static `content_for 'block'` params: `active_variant` →
  `blocks/_product-card.liquid` → `pinned_variant` on the gallery and `active_variant` on
  `snippets/product-card.liquid` (link + view-transition image), and `active_variant` on
  `snippets/quick-add.liquid` (renders Add-only, adding the pinned variant straight to
  cart instead of opening the choose-options modal). Shopify's
  `{% content_for 'blocks' %}` does not accept custom keys — only `closest.*` resources,
  and there is no `closest.variant` — so nested dynamic blocks (`product-title`, `price`)
  never receive `active_variant`. They re-resolve the pin themselves via
  `snippets/curated-pinned-variant-id.liquid`, which reads the section's `curated_list`
  metaobject setting (readable from any block in the section, same trick as
  `blocks/swatches.liquid`). That snippet needs `section` passed in explicitly —
  `{% render %}` scopes it out. Caveat: it matches on product id, so a list pinning two
  variants of the SAME product resolves both cards to the first pinned entry.
- **`assets/custom.js`** card behavior mirrors `assets/product-card.js` conventions
  (`variant:update`, section rendering) for interaction after first paint.
