# Section width: Narrow (78rem content)

> **All Horizon projects:** Personal Cursor skill at `~/.cursor/skills/shopify-horizon-section-width-narrow/` (global). This file is the project copy; keep in sync when the pattern changes.

Horizon theme pattern: per-section **Section width → Narrow** (`section_width: narrow`) constrains content to a **78rem** column (okayes-horizon), with carousels and progress controls aligned via `--page-content-width` / `--util-page-margin-offset`.

## Not the same as theme “Page width”

| Setting | Where | Effect |
|---------|--------|--------|
| **Theme** `page_width` (narrow / normal / wide) | Theme settings → `body.page-width-*` | Store-wide page grid (`--narrow-page-width: 90rem` in `theme-styles-variables.liquid`) |
| **Section** `section_width: narrow` | Each section → `.section--narrow` | **This feature** — section-scoped column (78rem in `assets/custom.css`) |

A section can be `section--narrow` while the global theme page width is normal or wide.

## Behavior

- Merchant picks **Width → Narrow** in section layout (schema `section_width`).
- `snippets/section.liquid` outputs `section--{{ section.settings.section_width }}` → `section--narrow`.
- CSS sets `--page-content-width` and `--page-width` on that section so:
  - Section grid / `--util-page-margin-offset` match the narrow column.
  - Full-bleed carousels align first slide and progress bar with the column edge.
- Inner content wrappers cap at 78rem with horizontal padding.

## Design principle

Set **`--page-content-width`** on `.section--narrow`, not only `--page-width`.

Horizon’s `.section` computes:

```css
--util-page-margin-offset: max(
  var(--page-margin),
  calc((100% - min(var(--page-content-width), 100% - var(--page-margin) * 2)) / 2)
);
```

Carousels use `var(--util-page-margin-offset)` for gutters. Without `--page-content-width` on the section, narrow sections and carousel alignment break.

## Files in this repo

| Role | Path |
|------|------|
| Narrow column width + content cap | `assets/custom.css` → `.section--narrow` |
| Section class from setting | `snippets/section.liquid` (`section--{{ section.settings.section_width }}`) |
| Carousel gutters (narrow = page-width) | `snippets/resource-list-carousel.liquid` |
| Block carousel gutters | `blocks/_carousel-content.liquid` |
| Schema option (most sections) | `section_width` select with `"value": "narrow"` (e.g. `sections/section.liquid`, `sections/product-list.liquid`) |
| Locale label | `locales/en.default.schema.json` → `options.narrow` |

## CSS (okayes-horizon — adjust rem per brand)

```css
/* Section Width - Narrow (78rem content) — page-content-width drives grid + carousel gutter offset */
.section--narrow {
  --page-content-width: 78rem;
  --page-width: calc(var(--page-content-width) + (var(--page-margin) * 2));
}

.section--narrow .section-content-wrapper,
.section--narrow > .section-content {
  max-width: 78rem;
  margin-inline: auto;
  padding-inline: var(--page-margin);
}
```

**Width token:** Change `78rem` in one place to rebrand (e.g. `72rem`, `var(--some-token)`). Keep `--page-content-width` and `max-width` in sync.

Prefer `assets/custom.css` (or a dedicated merchant CSS asset) so Horizon core updates do not drop the override.

## Liquid: carousel gutters

Treat `narrow` like `page-width` anywhere gutters use `--util-page-margin-offset`:

```liquid
case settings.section_width
  when 'page-width', 'narrow'
    assign slideshow_gutters = 'start end'
    assign gutter_style = '--gutter-slide-width: var(--util-page-margin-offset);'
  else
    assign slideshow_gutters = null
    assign gutter_style = '--gutter-slide-width: 0px;'
endcase
```

Files to update when porting (grep `when 'page-width'`):

- `snippets/resource-list-carousel.liquid`
- `blocks/_carousel-content.liquid`
- Any custom carousel that branches on `section_width` only for `page-width`

Pass **`section.settings`** (not block-only settings without `section_width`) into `resource-list-carousel`.

## Schema

Horizon sections often already include narrow. If missing, add to `section_width` options:

```json
{
  "value": "narrow",
  "label": "t:options.narrow"
}
```

Order in UI is often: Narrow → Page → Full.

Sections that use `{% render 'section' %}` inherit layout from `snippets/section.liquid` automatically.

## Interaction with “Contain carousel (desktop)”

- Contain carousel uses the same `--page-content-width` / `--util-page-margin-offset` on narrow sections.
- Narrow + full-bleed carousel: gutters apply on mobile; desktop contain zeros gutters via `resource-list__carousel--contained` (see [carousel-contain-section-width.md](./carousel-contain-section-width.md)).

## Porting to a new Horizon theme

1. Add `.section--narrow` CSS (both custom properties + content wrapper cap).
2. Grep `when 'page-width'` in snippets/blocks; add `, 'narrow'` to the `when` branch.
3. Confirm target sections expose `section_width` with `narrow` in schema.
4. Hard-refresh theme dev; test a **product list / collection list** carousel at narrow + page-width + full-width.

## Pitfalls

1. **Only `--page-width: 78rem`** — Carousel gutters and grid offset stay wrong; always set `--page-content-width`.
2. **Only wrapper `max-width`** — Without section-level `--page-content-width`, `--util-page-margin-offset` does not shrink for carousels.
3. **Gutters only on `page-width`** — Narrow carousels flush to viewport edge; include `narrow` in Liquid `case`.
4. **Confusing with theme page width** — Document for merchants: section Narrow ≠ theme Page width Narrow.
5. **`settings.section_width` missing** — Block carousels must receive section settings (or duplicate `section_width` on block schema).

## Test checklist

- [ ] Section set to **Narrow**: content column visually ~78rem centered on desktop.
- [ ] **Carousel** (contain off): first slide aligns with section header/text; progress track inset matches column.
- [ ] Compare **Page** vs **Narrow**: narrow column is visibly smaller.
- [ ] **Full-width** section unchanged when not narrow.
- [ ] Mobile: narrow section + `full_width_on_mobile` (if used) still behaves per Horizon rules.

## Full-width section + `.contained-right` (okayes)

Use class `contained-right` on a group block inside `section--full-width` so the right column aligns with the page column edge. Desktop CSS in `assets/custom.css` sets `margin-inline-end` from the same formula as `--util-page-margin-offset`, with `--contained-content-width`: `normal-page-width` / `wide-page-width` on body, **78rem** when `body.page-width-narrow`. Reset to `0` on `section--page-width` and `section--narrow` (already constrained).

## Related

- [carousel-contain-section-width.md](./carousel-contain-section-width.md) — desktop-only carousel contain
- `assets/base.css` — `.section` grid, `--util-page-margin-offset`
- `snippets/theme-styles-variables.liquid` — global `--narrow-page-width` (90rem) for body class

## Changelog

- **2026-05** — okayes-horizon: 78rem `.section--narrow`, carousel `page-width` + `narrow` gutter parity
