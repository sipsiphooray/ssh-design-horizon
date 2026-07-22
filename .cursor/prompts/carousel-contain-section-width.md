# Task: Add or fix “Contain carousel in section width (desktop)”

Read the full spec first: [`.cursor/references/carousel-contain-section-width.md`](../references/carousel-contain-section-width.md)

## Quick rules

- Setting id: `carousel_contain_width` (checkbox, default `false`, `visible_if` layout is carousel).
- **Mobile must not change** when contain is enabled — same Liquid markup as uncontained; overrides only `@media (min-width: 750px)` in `snippets/resource-list-carousel.liquid`.
- Classes: `resource-list--carousel-contained`, `resource-list__carousel-wrap--contained`, `resource-list__carousel--contained` + always `force-full-width` on carousel lists.
- Prefer `{% render 'resource-list' %}` / `{% render 'resource-list-carousel' %}` instead of duplicating CSS.

## When asked to port to another section

1. Schema + locale only if the section does not already use `resource-list`.
2. For custom carousels, mirror wrapper classes from `snippets/resource-list.liquid` and render `resource-list-carousel`.
3. Never set `slideshow_gutters = null` or `--peek-next-slide-size: 0` in Liquid based on contain alone.
