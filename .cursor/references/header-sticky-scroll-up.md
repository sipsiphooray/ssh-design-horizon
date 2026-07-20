# Header sticky `scroll-up` and `idle`

## Pitfall: header stays invisible (`opacity: 0`) after scrolling back up

**Symptom:** With sticky mode **on scroll-up**, after scrolling down (header hides via `data-sticky-state="idle"` in `sections/header.liquid`), scrolling up sometimes never restores the header.

**Cause:** In `assets/header.js`, `IntersectionObserver` sets `#offscreen = false` when the header intersects the viewport again while state is still `idle`. The scroll handler used to start with:

`if (!this.#offscreen && stickyMode !== 'always') return;`

So `#updateScrollState` never ran and `data-sticky-state` never left `idle`.

**Fix:** Do not early-return when `stickyMode === 'scroll-up'` and `dataset.stickyState === 'idle'` (see `#updateScrollState` in `header.js`). If you change that guard, keep this exception or the bug returns.

**Not caused by:** `custom.js` only reads `data-sticky-state="active"` for hash scroll offset; it does not set sticky state.
