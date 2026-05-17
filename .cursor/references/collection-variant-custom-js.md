# Collection product cards: manual variant UI + custom.js

- **Collection grid** does not depend on Horizon `blocks/swatches.liquid`. Merchants add **manual** controls in Liquid/markup.
- **`assets/custom.js`** should **mirror** theme card behavior from `assets/product-card.js` (and related `variant-picker` flows): same conventions for slide / `slide-id`, `variant:update`, and section-rendering updates where the theme already does so.
- **Liquid** still resolves **initial** variant (e.g. `collection.metafields.custom.variants_to_render` with title-contains + list-order tie-break). JS handles interaction after first paint.
- **`blocks/_product-card.liquid`** pre-assigns **`card_initial_variant`** and **`card_title_suffix`** for the gallery and `{% render 'product-card' %}` (`initial_variant`, `title_suffix` → optional `data-card-*` on `<product-card>`). Shopify **`{% content_for 'blocks' %}` does not accept custom keys** (only `closest.*` / `context.*`), so **`blocks/product-title.liquid`** and **`blocks/price.liquid`** **repeat the same resolve** (including **`active_variant`** when present for nested blocks).
- **Implementation note:** keep that resolve in sync with `_product_card`, [snippets/product-card.liquid](snippets/product-card.liquid) (when `initial_variant` is blank), and [snippets/card-gallery.liquid](snippets/card-gallery.liquid) via `pinned_variant`.
