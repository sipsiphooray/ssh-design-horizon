# Task: Add or fix Horizon section width “Narrow”

Read the full spec: [`.cursor/references/section-width-narrow.md`](../references/section-width-narrow.md)

## Quick rules

- Section class: `section--narrow` from `section_width: narrow` (via `snippets/section.liquid`).
- CSS: set **`--page-content-width`** and **`--page-width`** on `.section--narrow`; cap `.section-content-wrapper` / `.section-content`.
- Carousels: `when 'page-width', 'narrow'` for gutters — not `page-width` alone.
- Do not confuse with theme **Page width** setting on the body.

## Default okayes width

`78rem` content — change in `assets/custom.css` only unless tokenizing.
