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
  `snippets/product-card.liquid` (link + view-transition image). Shopify's
  `{% content_for 'blocks' %}` does not accept custom keys, so nested dynamic blocks
  (`product-title`, `price`) only honor `active_variant` when rendered with it directly.
- **`assets/custom.js`** card behavior mirrors `assets/product-card.js` conventions
  (`variant:update`, section rendering) for interaction after first paint.
