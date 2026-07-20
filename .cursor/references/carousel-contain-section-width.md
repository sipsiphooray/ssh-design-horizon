# Contain carousel in section width (desktop only)

> **All Horizon projects:** Personal Cursor skill at `~/.cursor/skills/shopify-horizon-carousel-contain/` (global). This file is the project copy; keep in sync when the pattern changes.

Horizon theme pattern: optional merchant setting that keeps a **resource-list carousel** inside the section content column on **desktop (≥750px)** while **mobile** stays identical to the default full-bleed carousel.

## Behavior

| Viewport | Contain **off** (default) | Contain **on** |
|----------|---------------------------|----------------|
| **Mobile** (`<750px`) | Full bleed (`force-full-width`), peek slide, page-width gutters | **Same as off** — no visual change |
| **Desktop** (`≥750px`) | Full bleed across section grid | Slider in center column (`grid-column: 2`), no peek, no slide gutters, progress/arrows aligned to contained width |

**Default:** checkbox off (preserves stock Horizon carousel bleed).

## Design principle (important for ports)

Liquid cannot branch on viewport. **Do not** change gutter/peek markup in Liquid when contain is enabled.

1. Render the **same** carousel HTML as uncontained (gutters, `--gutter-slide-width`, `slideshow_gutters`, etc.).
2. Add modifier classes when the setting is on.
3. Apply contain overrides **only** in `@media screen and (min-width: 750px)`.

If Liquid sets `slideshow_gutters = null` or `--peek-next-slide-size: 0` globally, mobile will break even with CSS patches.

## Files in this repo

| Role | Path |
|------|------|
| List wrapper + `force-full-width` + contain class | `snippets/resource-list.liquid` |
| Carousel + desktop-only contain CSS | `snippets/resource-list-carousel.liquid` |
| Schema label | `locales/en.default.schema.json` → `settings.carousel_contain_width` |
| Sections using `{% render 'resource-list' %}` | `sections/product-list.liquid`, `collection-list.liquid`, `main-collection-list.liquid`, `featured-blog-posts.liquid` |
| Custom markup (mirror classes) | `sections/product-recommendations.liquid`, `blocks/product-recommendations.liquid` |

## CSS classes

| Class | Element | Purpose |
|-------|---------|---------|
| `resource-list--carousel-contained` | `.resource-list` wrapper | Desktop: `--peek-next-slide-size: 0`, `grid-column: 2 !important` |
| `resource-list__carousel-wrap--contained` | Carousel wrap `div` | Desktop: `--gutter-slide-width: 0 !important` |
| `resource-list__carousel--contained` | `slideshow-component` | Desktop: zero gutter padding on `slideshow-slides`, full-width progress/arrows |

Always keep `force-full-width` on the `.resource-list` when `layout_type == 'carousel'` (contain on or off). Desktop contain uses `grid-column: 2 !important` to override `force-full-width`’s `1 / -1`.

## Schema setting

Add to any section/block that supports `layout_type: carousel`:

```json
{
  "type": "checkbox",
  "id": "carousel_contain_width",
  "label": "t:settings.carousel_contain_width",
  "default": false,
  "visible_if": "{{ section.settings.layout_type == 'carousel' }}"
}
```

For **blocks**, use `block.settings` in `visible_if`.

Locale (`locales/en.default.schema.json`):

```json
"carousel_contain_width": "Contain carousel in section width (desktop)"
```

Pass `settings` (section or block) into `{% render 'resource-list', settings: section.settings %}` — the snippet reads `settings.carousel_contain_width`.

## Porting to a new section (uses `resource-list`)

1. Add schema checkbox (above) after `carousel_on_mobile` or near layout settings.
2. Add locale string.
3. Confirm section renders `{% render 'resource-list', settings: section.settings, ... %}` with `layout_type` carousel — **no extra Liquid** if already using the snippet.
4. Verify `section.settings.section_width` is passed through `settings` into `resource-list-carousel` (same `settings` object).

## Porting a custom carousel (no `resource-list`)

Example: `sections/product-recommendations.liquid`.

Mirror `resource-list.liquid` classes on the list wrapper:

```liquid
{% if section.settings.layout_type == 'carousel' %}
  force-full-width
  {% if section.settings.carousel_contain_width %}
    resource-list--carousel-contained
  {% endif %}
{% endif %}
```

Render carousel via `{% render 'resource-list-carousel', settings: section.settings, ... %}` so contain CSS and gutter logic stay centralized.

Do **not** duplicate contain CSS elsewhere unless the carousel does not use `resource-list-carousel` at all.

## Desktop contain CSS (reference)

Lives in `snippets/resource-list-carousel.liquid` `{% stylesheet %}`:

```css
@media screen and (min-width: 750px) {
  .resource-list--carousel-contained {
    --peek-next-slide-size: 0px;
    grid-column: 2 !important;
  }

  .resource-list__carousel-wrap--contained {
    --gutter-slide-width: 0px !important;
  }

  .resource-list__carousel--contained slideshow-slides[gutters*='start'] {
    padding-inline-start: 0;
    scroll-padding-inline-start: 0;
  }

  .resource-list__carousel--contained slideshow-slides[gutters*='end'] {
    padding-inline-end: 0;
  }

  .resource-list__carousel--contained slideshow-controls.carousel-controls--progress {
    width: 100%;
    max-width: 100%;
    margin-inline: 0;
  }

  .resource-list__carousel--contained slideshow-arrows {
    padding-inline: 0;
  }
}
```

Slide width on desktop uses `--peek-next-slide-size` in a container query; setting it to `0` on the contained wrapper makes columns fill the content column without a peeking next slide.

## Liquid in `resource-list-carousel` (reference)

Gutters: always from `section_width` (unchanged by contain):

```liquid
case settings.section_width
  when 'page-width', 'narrow'
    assign slideshow_gutters = 'start end'
    assign gutter_style = '--gutter-slide-width: var(--util-page-margin-offset);'
  else
    assign slideshow_gutters = null
    assign gutter_style = '--gutter-slide-width: 0px;'
endcase

if carousel_contain_width
  assign carousel_class = carousel_class | append: ' resource-list__carousel--contained'
endif
```

Wrap class when contain:

```liquid
class="resource-list__carousel-wrap{% if carousel_contain_width %} resource-list__carousel-wrap--contained{% endif %}"
```

## Pitfalls (learned)

1. **Mobile affected** — Caused by setting contained gutters/peek in Liquid for all breakpoints. Fix: identical markup; desktop-only CSS.
2. **Desktop broken on page-width** — Using `force-full-width` without `grid-column: 2 !important` on desktop when contain is on. Both classes are required; override must be `!important` to beat `.section > .force-full-width`.
3. **Gutters not zeroing on desktop** — Inline `style="--gutter-slide-width: …"` on the wrap wins over non-`!important` CSS. Use `!important` on desktop for `.resource-list__carousel-wrap--contained` and reset `slideshow-slides` padding.
4. **Separate mobile CSS “gutter restore”** — Fragile vs uncontained. Prefer shared Liquid + desktop-only overrides.
5. **`visible_if`** — Only show the checkbox when `layout_type == 'carousel'` so merchants do not expect it for grid layouts.

## Test checklist

- [ ] **Mobile** with contain on vs off: same bleed, peek, and gutters (page-width, narrow, full-width sections).
- [ ] **Desktop** contain off: full-bleed carousel (stock behavior).
- [ ] **Desktop** contain on + **full-width** section: carousel aligned to content column, no partial peek, progress bar spans contained width.
- [ ] **Desktop** contain on + **page-width / narrow**: carousel inside column, not edge-to-edge viewport.
- [ ] Progress controls and arrows (if enabled) align with contained track.
- [ ] Slideshow JS: next/prev and progress still correct with `--peek-next-slide-size: 0` on desktop.

## Related Horizon concepts

- Section grid: `.section > *` → column 2; `.section--full-width > *` → `1 / -1`; `.section > .force-full-width` → `1 / -1` (`assets/base.css`).
- `--util-page-margin-offset`, `--page-content-width`: gutter alignment for page-width carousels.
- **Section width Narrow:** [section-width-narrow.md](./section-width-narrow.md) — sets `--page-content-width` on `.section--narrow`; carousels must treat `narrow` like `page-width` in gutter Liquid.
- `--peek-next-slide-size`: theme default `3rem` in `snippets/theme-styles-variables.liquid`; slide width calc in `resource-list-carousel` container query.

## Changelog

- **2026-05** — Initial implementation (okayes-horizon): desktop-only contain; mobile unchanged via shared markup + `@media (min-width: 750px)` overrides.
