# ssh-design-horizon

Shopify Horizon theme fork for the ssh-design (sipsiphooray) store.
Upstream: `chrisdavery/horizon-base` (shared Horizon fork, remote `upstream`).

## Upstream merge rules

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
