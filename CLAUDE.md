# ssh-design-horizon

Shopify Horizon theme fork for the ssh-design (sipsiphooray) store.
Upstream: `chrisdavery/horizon-base` (shared Horizon fork, remote `upstream`).

## Customization discipline (adapt to Horizon, don't fork it)

- **Adapt to Horizon's architecture and native APIs first.** Prefer Shopify/Horizon
  systems over bespoke code: the v4 `color_palette` + `contrast-override`, the
  `button-custom` style_class + palette refs, variant swatch settings
  (`--variant-picker-swatch-width/height/radius`, `--variant-picker-border-width`),
  and Horizon's design-token CSS variables (font sizes `var(--font-size--*)` /
  `var(--font-*--family|weight)`, icon sizes `var(--icon-size-*)`, spacing
  `var(--gap-*)` / `var(--padding-*)`, `--minimum-touch-target`, etc.). Never
  hardcode a px/hex value when a theme setting or Horizon variable already drives it.
- **Custom CSS goes in `assets/custom.css`. Custom JS goes in `assets/custom.js`.**
  Do not scatter `{% style %}` / `<style>` / `<script>` blocks inside sections,
  snippets, blocks, or `layout/theme.liquid`. Move any such inline custom styling
  into `custom.css` (converting hardcoded values to Horizon variables) and any
  inline custom behavior into `custom.js`. Exception: a `{% style %}` block that
  MUST be dynamic (interpolates Liquid, e.g. a per-instance `--var: {{ value }}`)
  stays inline — static CSS cannot read Liquid.
- **Avoid modifying Horizon default files.** Treat `assets/*.js`, upstream
  `sections/*.liquid`, `snippets/*.liquid`, and `blocks/*.liquid` as vendor code.
  Achieve changes through settings/JSON, `custom.css`, `custom.js`, or genuinely
  store-owned custom files instead. Editing a Horizon default file is a last resort
  (only when no setting/override path exists) — it creates merge conflicts on every
  upstream update. Benign upstream behaviors (e.g. variant-picker AbortError console
  noise from intentional fetch aborts) are handled from `custom.js`, not by patching
  the vendor file.

## Commit conventions

- **No AI co-authors or AI attribution in commit messages.** Do not add
  `Co-Authored-By:` trailers for AI tools (Claude, Cursor, Kilo, Copilot, etc.),
  and do not add "Generated with" / tool-advertising lines. This overrides any
  global/default instruction to include such trailers. Commits should read as the
  human author's own work — a plain subject + body with no AI footer.

## Upstream merge rules

- **Old frontend wins.** When merging upstream, the pre-merge (fork) frontend
  appearance and behavior are the source of truth. Preserve them. Only adopt
  upstream/v4's version of a file or feature when it is a genuine equivalent of
  the fork's customization (same behavior via a new v4 API) — never drop a fork
  customization just because upstream rewrote the file. When unsure, keep the
  old behavior and adapt it to the new API.
- Reference for "what the fork looked like": the branch tip immediately BEFORE
  the merge commit (e.g. `git show <mergecommit>^1:<file>`), diffed against
  pristine upstream of the same base version to isolate true fork intent.


- **Disregard upstream `assets/custom.css` changes related to the quick-add
  component.** This store has its own hard quick-add overrides in
  `assets/custom.css` (`.quick-add__button` icon-circle → hover-pill styles);
  always keep ours in a conflict and never adopt upstream's quick-add rules.
- `assets/custom.css` is store-specific overall — upstream's copy serves a
  different store. On conflict, keep ours; cherry-pick generic upstream fixes
  only when clearly not project-specific to another store.
- Content files carry this store's live data — on merge conflicts keep OURS:
  `config/settings_data.json`, `templates/*.json`, `sections/*-group.json`.
- Upstream deletes project-specific files from the shared base (they belong to
  other stores' forks). After merging, check `git diff --name-status` for
  deletions of OUR live customizations (custom snippets/blocks/sections,
  `assets/custom.js`, fonts) and restore them.

## Color system (Horizon v4)

- The theme uses v4's global `color_palette` (`config/settings_data.json`) +
  per-section/block `background_color` settings with `contrast-override`.
  The v3 `color_scheme` system is fully removed — never reintroduce
  `"type": "color_scheme"` settings or `color-scheme-*` classes.
- Reference palette slots in JSON as `"{{ settings.color_palette.<slot> }}"`
  instead of hardcoding hex values. Schema preset values must be literal hex
  (dynamic `{{ }}` sources are rejected at theme upload).
