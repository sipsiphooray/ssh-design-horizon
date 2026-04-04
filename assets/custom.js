import { Component } from '@theme/component';
import { ThemeEvents, PriceChangeEvent } from '@theme/events';
import { onDocumentLoaded, onDocumentReady } from '@theme/utilities';

/**
 * @param {string} url
 * @returns {string}
 */
function cssUrlValue(url) {
  return `url(${JSON.stringify(url)})`;
}

/**
 * @param {Element} menu
 * @returns {string}
 */
function getFirstCardImageUrl(menu) {
  const el = menu.querySelector('[data-card-image]');
  if (!el) return '';
  const url = el.getAttribute('data-card-image');
  return url && url.trim() ? url.trim() : '';
}

/**
 * @param {HTMLElement | null | undefined} canvas
 * @param {string} url
 */
function setThumbnailCanvas(canvas, url) {
  if (!canvas || !url) return;
  canvas.style.setProperty('background-image', cssUrlValue(url));
}

function initMegaMenuThumbnails() {
  document.querySelectorAll('.mega-menu').forEach((menu) => {
    const canvas = /** @type {HTMLElement | null} */ (menu.querySelector('.thumbnail-hover-canvas'));
    const url = getFirstCardImageUrl(menu);
    setThumbnailCanvas(canvas, url);
  });
}

initMegaMenuThumbnails();
onDocumentReady(() => initMegaMenuThumbnails());
onDocumentLoaded(() => initMegaMenuThumbnails());
document.addEventListener(ThemeEvents.megaMenuHover, () => {
  requestAnimationFrame(() => initMegaMenuThumbnails());
});

/**
 * Horizon `dialog.js` only toggles `html[scroll-lock]` for `<details scroll-lock>`, not for
 * `<dialog scroll-lock>` (quick-add, cart drawer, search). Safari/iOS then relies on `body` fixed
 * alone, which often still scrolls. Sync `html[scroll-lock]` whenever any dialog or details lock
 * is open; microtask after `toggle` fixes details closing while a dialog stays open.
 */
const SCROLL_LOCK_DIALOG_SELECTOR = 'dialog[scroll-lock]';
/**
 * Scroll Y parsed from `body.style.top` after `showModal` (Horizon sets `-${scrollY}px` before calling it).
 * MutationObserver on `open` was unreliable; patching `HTMLDialogElement` guarantees capture + restore.
 * @type {WeakMap<HTMLDialogElement, number>}
 */
const dialogLockedScrollY = new WeakMap();

function isAnyScrollLockUiOpen() {
  for (const el of document.querySelectorAll(SCROLL_LOCK_DIALOG_SELECTOR)) {
    if (el instanceof HTMLDialogElement && el.open) return true;
  }
  for (const el of document.querySelectorAll('details[scroll-lock]')) {
    if (el instanceof HTMLDetailsElement && el.open) return true;
  }
  return false;
}

function syncDocumentScrollLock() {
  if (isAnyScrollLockUiOpen()) {
    document.documentElement.setAttribute('scroll-lock', '');
  } else {
    document.documentElement.removeAttribute('scroll-lock');
  }
}

/**
 * @param {number} y
 */
function restoreWindowScrollAfterDialogClose(y) {
  const apply = () => {
    const x = window.scrollX;
    window.scrollTo({ top: y, left: x, behavior: 'auto' });
    const se = document.scrollingElement;
    if (se instanceof HTMLElement) {
      se.scrollTop = y;
    }
  };
  apply();
  queueMicrotask(apply);
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(() => {
      apply();
      setTimeout(apply, 0);
      setTimeout(apply, 50);
      setTimeout(apply, 120);
    });
  });
}

let htmlDialogScrollLockPatchApplied = false;

function patchHtmlDialogForScrollLock() {
  if (htmlDialogScrollLockPatchApplied) return;
  if (typeof HTMLDialogElement === 'undefined') return;
  htmlDialogScrollLockPatchApplied = true;

  const proto = HTMLDialogElement.prototype;
  const origShowModal = proto.showModal;
  const origClose = proto.close;

  proto.showModal = function showModalWithScrollCapture(...args) {
    origShowModal.apply(this, args);
    if (this.hasAttribute('scroll-lock')) {
      const top = document.body.style.top;
      const m = top?.match(/^-(\d+(?:\.\d+)?)px$/);
      const numStr = m?.[1];
      if (numStr) {
        const y = Math.round(parseFloat(numStr));
        if (Number.isFinite(y) && y >= 0) {
          dialogLockedScrollY.set(this, y);
        }
      }
    }
    // Defer html[scroll-lock]: same-frame overflow/height on html fights body fixed+top and causes a jump to top.
    requestAnimationFrame(() => {
      syncDocumentScrollLock();
    });
  };

  proto.close = function closeWithScrollRestore(...args) {
    const hasLock = this.hasAttribute('scroll-lock');
    const y = hasLock ? dialogLockedScrollY.get(this) : undefined;
    origClose.apply(this, args);
    if (hasLock) {
      dialogLockedScrollY.delete(this);
    }
    syncDocumentScrollLock();
    if (hasLock && y != null && y >= 0) {
      restoreWindowScrollAfterDialogClose(y);
    }
  };
}

patchHtmlDialogForScrollLock();

onDocumentReady(() => {
  document.addEventListener('toggle', () => queueMicrotask(syncDocumentScrollLock), true);
  syncDocumentScrollLock();
});

function scrollToHash() {
  const hash = window.location.hash; // "#faq"
  if (hash) {
    const id = hash.slice(1); // remove #
    const target = document.querySelector(`[data-section-id="${id}"]`);
    if (target) {
      let offset = 0;
      const stickyHeader = document.querySelector('.header[data-sticky-state="active"]');
      if (stickyHeader) {
        offset = stickyHeader.clientHeight;
      }

      const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;

      window.scrollTo({
        top: targetPosition,
        behavior: "smooth"
      });
    }
  }
}

// Run on page load
scrollToHash();


// Run on hash change
window.addEventListener("hashchange", scrollToHash);

/**
 * Menu drawer alignment: set `--menu-drawer-top` / `--menu-drawer-height` on html, body, and
 * `#Details-menu-drawer-container` so `custom.css` can position `.menu-drawer` with `top`/`height`:
 * `var(--menu-drawer-top)` and `var(--menu-drawer-height)` (no inline layout on the panel—Horizon-style).
 */
const MENU_DRAWER_TOP_VAR = '--menu-drawer-top';
const MENU_DRAWER_HEIGHT_VAR = '--menu-drawer-height';

let menuDrawerLayoutListenersActive = false;
/** @type {ResizeObserver | null} */
let menuDrawerHeaderResizeObserver = null;
/** @type {MutationObserver | null} */
let menuDrawerMenuOpenObserver = null;

function menuDrawerViewportHeight() {
  return window.visualViewport?.height ?? window.innerHeight;
}

/** Open root menu `<details>` (hamburger drawer). */
function getMenuDrawerDetails() {
  return (
    document.querySelector('#Details-menu-drawer-container[open]') ??
    document.querySelector('details.menu-drawer-container[open]')
  );
}

/**
 * Bottom edge of header chrome in viewport coordinates. After scroll, `header-component`’s box can
 * still include layout slack; prefer visible `.header__row` rects. Skip sections/rows outside the viewport band.
 */
function measureMenuDrawerHeaderBottom() {
  const vv = window.visualViewport;
  const vMax = vv?.height ?? window.innerHeight;
  const headerGroup = document.querySelector('#header-group');
  let maxBottom = 0;

  if (headerGroup) {
    for (const child of headerGroup.children) {
      if (!(child instanceof HTMLElement)) continue;
      const inner = child.querySelector('header-component');

      if (inner instanceof HTMLElement) {
        let innerBottom = 0;
        const rows = inner.querySelectorAll('.header__row');
        if (rows.length) {
          rows.forEach((row) => {
            if (!(row instanceof HTMLElement)) return;
            const cs = getComputedStyle(row);
            if (cs.display === 'none' || cs.visibility === 'hidden') return;
            const r = row.getBoundingClientRect();
            if (r.height < 1) return;
            if (r.bottom <= 0 || r.top >= vMax) return;
            innerBottom = Math.max(innerBottom, r.bottom);
          });
        }
        if (innerBottom === 0) {
          const r = inner.getBoundingClientRect();
          if (r.bottom > 0 && r.top < vMax) innerBottom = r.bottom;
        }
        maxBottom = Math.max(maxBottom, innerBottom);
      } else {
        const r = child.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= vMax) continue;
        maxBottom = Math.max(maxBottom, r.bottom);
      }
    }
  }

  if (maxBottom <= 0) {
    const hc = document.querySelector('#header-component');
    if (hc instanceof HTMLElement) {
      maxBottom = Math.max(0, hc.getBoundingClientRect().bottom);
    }
  }

  return maxBottom;
}

function applyMenuDrawerVarsToRoots(topPx, heightPx) {
  document.documentElement.style.setProperty(MENU_DRAWER_TOP_VAR, topPx);
  document.documentElement.style.setProperty(MENU_DRAWER_HEIGHT_VAR, heightPx);
  if (document.body) {
    document.body.style.setProperty(MENU_DRAWER_TOP_VAR, topPx);
    document.body.style.setProperty(MENU_DRAWER_HEIGHT_VAR, heightPx);
  }
  const details =
    document.querySelector('#Details-menu-drawer-container') ??
    document.querySelector('details.menu-drawer-container');
  if (details instanceof HTMLElement) {
    details.style.setProperty(MENU_DRAWER_TOP_VAR, topPx);
    details.style.setProperty(MENU_DRAWER_HEIGHT_VAR, heightPx);
  }
}

function clearMenuDrawerVarsFromRoots() {
  document.documentElement.style.removeProperty(MENU_DRAWER_TOP_VAR);
  document.documentElement.style.removeProperty(MENU_DRAWER_HEIGHT_VAR);
  document.body?.style.removeProperty(MENU_DRAWER_TOP_VAR);
  document.body?.style.removeProperty(MENU_DRAWER_HEIGHT_VAR);
  const details =
    document.querySelector('#Details-menu-drawer-container') ??
    document.querySelector('details.menu-drawer-container');
  details?.style.removeProperty(MENU_DRAWER_TOP_VAR);
  details?.style.removeProperty(MENU_DRAWER_HEIGHT_VAR);
}

function syncMenuDrawerLayoutVars() {
  const detailsOpen = getMenuDrawerDetails();
  if (!detailsOpen) return;

  const bottomRaw = measureMenuDrawerHeaderBottom();
  // Floor removes subpixel over-counting so the drawer tucks under the sticky bar after scroll.
  const bottom = Math.max(0, Math.floor(bottomRaw));
  const vh = menuDrawerViewportHeight();
  const height = Math.max(0, Math.round(vh - bottom));
  const topPx = `${bottom}px`;
  const heightPx = `${height}px`;

  applyMenuDrawerVarsToRoots(topPx, heightPx);
}

function clearMenuDrawerLayoutVars() {
  clearMenuDrawerVarsFromRoots();
}

function onMenuDrawerOpenLayoutSync() {
  syncMenuDrawerLayoutVars();

  if (menuDrawerLayoutListenersActive) return;
  menuDrawerLayoutListenersActive = true;

  window.addEventListener('resize', syncMenuDrawerLayoutVars, { passive: true });
  window.addEventListener('scroll', syncMenuDrawerLayoutVars, { passive: true, capture: true });
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', syncMenuDrawerLayoutVars, { passive: true });
    vv.addEventListener('scroll', syncMenuDrawerLayoutVars, { passive: true });
  }

  const headerGroup = document.querySelector('#header-group');
  if (headerGroup && typeof ResizeObserver !== 'undefined') {
    menuDrawerHeaderResizeObserver = new ResizeObserver(() => syncMenuDrawerLayoutVars());
    menuDrawerHeaderResizeObserver.observe(headerGroup);
  }

  const details = document.querySelector('#Details-menu-drawer-container');
  if (details && typeof MutationObserver !== 'undefined' && !menuDrawerMenuOpenObserver) {
    menuDrawerMenuOpenObserver = new MutationObserver(() => {
      if (details.classList.contains('menu-open')) {
        syncMenuDrawerLayoutVars();
      }
    });
    menuDrawerMenuOpenObserver.observe(details, { attributes: true, attributeFilter: ['class'] });
  }
}

function onMenuDrawerCloseLayoutSync() {
  menuDrawerHeaderResizeObserver?.disconnect();
  menuDrawerHeaderResizeObserver = null;
  if (menuDrawerMenuOpenObserver) {
    menuDrawerMenuOpenObserver.disconnect();
    menuDrawerMenuOpenObserver = null;
  }

  if (menuDrawerLayoutListenersActive) {
    menuDrawerLayoutListenersActive = false;
    window.removeEventListener('resize', syncMenuDrawerLayoutVars);
    window.removeEventListener('scroll', syncMenuDrawerLayoutVars, { capture: true });
    const vv = window.visualViewport;
    if (vv) {
      vv.removeEventListener('resize', syncMenuDrawerLayoutVars);
      vv.removeEventListener('scroll', syncMenuDrawerLayoutVars);
    }
  }
  clearMenuDrawerLayoutVars();
}

function scheduleMenuDrawerLayoutSync() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        onMenuDrawerOpenLayoutSync();
        queueMicrotask(syncMenuDrawerLayoutVars);
        setTimeout(syncMenuDrawerLayoutVars, 0);
      });
    });
  });
}

function handleMenuDrawerToggle(event) {
  const target = event.target;
  if (!(target instanceof HTMLDetailsElement)) return;
  if (!target.classList.contains('menu-drawer-container')) return;

  if (target.open) {
    scheduleMenuDrawerLayoutSync();
  } else {
    onMenuDrawerCloseLayoutSync();
  }
}

// Capture: runs with theme/dialog listeners; bubble can be missed if propagation stops.
document.addEventListener('toggle', handleMenuDrawerToggle, true);

// Handle hover updates
document.addEventListener('mouseover', e => {
  const target = e.target;
  if (!target) return;
  const card = target.closest('[data-card-image]');
  if (!card) return;
  
  const menu = card.closest('.mega-menu');
  const canvas = menu?.querySelector('.thumbnail-hover-canvas');
  const url = card.getAttribute('data-card-image');
  if (canvas && url && url.trim()) {
    setThumbnailCanvas(canvas, url.trim());
  }
});

// Reset to first image when leaving mega menu
document.addEventListener('mouseout', e => {
  const target = e.target;
  if (!target) return;
  const menu = target.closest('.mega-menu');
  if (!menu || (e.relatedTarget && menu.contains(e.relatedTarget))) return;
  
  const canvas = menu.querySelector('.thumbnail-hover-canvas');
  const url = getFirstCardImageUrl(menu);
  setThumbnailCanvas(canvas, url);
});

class VariantSelect extends Component {
  connectedCallback() {
    this.select = this.querySelector("select");
    if (!this.select) return;
    
    this.wrapper = this.querySelector(".custom-select");
    this.display = this.querySelector(".cs-display");
    this.displayText = this.querySelector(".cs-display-text"); // Added reference to the text span
    this.menu = this.querySelector(".cs-menu");
    this.optionEls = Array.from(this.querySelectorAll(".cs-option"));
    
    // Track if user has interacted yet
    this.userHasInteracted = false;
    
    this.bindEvents();
    this.initializeSelectedOption();
  }

  bindEvents() {
    this.wrapper.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });
    
    document.addEventListener("click", () => this.closeMenu());
    
    // Keyboard navigation
    this.wrapper.addEventListener("keydown", (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggleMenu();
      }
    });
    
    this.optionEls.forEach((optionEl, index) => {
      const option = this.select.options[index];
      
      optionEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.userHasInteracted = true; // Mark interaction
        this.onOptionSelect(option, optionEl);
      });
      
      optionEl.addEventListener("keydown", (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.userHasInteracted = true; // Mark interaction
          this.onOptionSelect(option, optionEl);
        }
      });
    });
  }

  initializeSelectedOption() {
    const selectedOption = Array.from(this.select.options).find(opt => opt.selected);
    
    if (selectedOption) {
      // Check if we should show custom label on initial load
      const hasCustomLabel = this.display.hasAttribute('data-custom-label');
      
      if (hasCustomLabel && !this.userHasInteracted) {
      } else {
        this.classList.add("has-value");
      }
      
      // Still mark the option as selected in the menu
      const optionIndex = Array.from(this.select.options).indexOf(selectedOption);
      if (this.optionEls[optionIndex]) {
        this.optionEls[optionIndex].classList.add("selected");
        this.syncDisplaySwatch(this.optionEls[optionIndex]);
      }
    } else {
      // Select first available option by default
      const firstAvailable = Array.from(this.select.options).find(opt => !opt.disabled);
      if (firstAvailable) {
        this.select.value = firstAvailable.value;
        const idx = Array.from(this.select.options).indexOf(firstAvailable);
        const el = this.optionEls[idx];
        if (el) this.onOptionSelect(firstAvailable, el);
      }
    }
  }

  getDisplayText(option) {
    if (option.text.includes('content.unavailable')) {
      return option.text.split(' - ')[0];
    }
    return option.text;
  }

  /**
   * Mirror the selected row’s swatch into `.cs-display` so the closed control shows the right image
   * (quick-add / variant morph only updates the native select + text otherwise).
   * @param {Element} optionEl
   */
  syncDisplaySwatch(optionEl) {
    if (!this.display || !this.displayText || !(optionEl instanceof HTMLElement)) return;

    const source = optionEl.querySelector('.swatch-image');
    const sourceImg = source?.querySelector('img');
    let displaySwatch = this.display.querySelector('.swatch-image');

    if (sourceImg && source) {
      if (!displaySwatch) {
        displaySwatch = document.createElement('span');
        displaySwatch.className = 'swatch-image';
        this.display.insertBefore(displaySwatch, this.displayText);
      }
      displaySwatch.replaceChildren();
      displaySwatch.appendChild(/** @type {HTMLImageElement} */ (sourceImg.cloneNode(true)));
    } else if (displaySwatch) {
      displaySwatch.remove();
    }
  }

  toggleMenu() {
    const isOpening = !this.menu.classList.contains("open");
    
    if (isOpening) {
      // Close all other variant-select menus on the page
      document.querySelectorAll('variant-select .cs-menu.open').forEach(otherMenu => {
        if (otherMenu !== this.menu) {
          otherMenu.classList.remove('open');
          otherMenu.closest('variant-select').wrapper.setAttribute('aria-expanded', 'false');
        }
      });
    }
    
    this.menu.classList.toggle("open");
    this.wrapper.setAttribute('aria-expanded', this.menu.classList.contains("open"));
  }

  closeMenu() {
    this.menu.classList.remove("open");
    this.wrapper.setAttribute('aria-expanded', 'false');
  }

  onOptionSelect(option, optionEl) {
    // Instantly update the display text before Shopify's network request finishes
    if (this.displayText) {
      this.displayText.textContent = this.getDisplayText(option).trim();
    }
    this.syncDisplaySwatch(optionEl);

    // Update native select
    this.select.value = option.value;
    
    // Trigger variant change
    this.select.dispatchEvent(new Event("change", { 
      bubbles: true, 
      composed: true 
    }));
    
    // Update selected styling
    this.optionEls.forEach(el => el.classList.remove("selected"));
    optionEl.classList.add("selected");
    
    // Update has-value class
    this.classList.add("has-value");
    
    this.closeMenu();
  }
}

customElements.define("variant-select", VariantSelect);


// Function to update both Titles and Prices on product cards
function updateProductCardData() {
  const productCards = document.querySelectorAll('product-card[data-variant-id]');

  productCards.forEach(card => {
    const variantId = card.getAttribute('data-variant-id');

    // ------------------------------------------
    // 1. TITLE UPDATE LOGIC
    // ------------------------------------------
    const renderTitle = card.getAttribute('data-render-text');
    const titleTextElement = card.querySelector('.product-title-block > *');

    if (titleTextElement && renderTitle) {
      const suffix = ` - ${renderTitle}`;
      if (!titleTextElement.textContent.endsWith(suffix)) {
        titleTextElement.textContent += suffix;
      }
    }

    // ------------------------------------------
    // 2. PRICE UPDATE LOGIC
    // ------------------------------------------
    const priceContainer = card.querySelector('product-price [ref="priceContainer"]') || card.querySelector('[ref="priceContainer"]');
    const variantPrice = card.getAttribute('data-variant-price');
    const variantComparePrice = card.getAttribute('data-variant-compare-price');

    if (priceContainer && variantPrice) {
      // Prevent infinite MutationObserver loops by checking if we already rendered this exact variant's price
      if (priceContainer.getAttribute('data-rendered-variant') === variantId) {
        return; // Skip, we already processed this price
      }

      // Helper function to format Shopify's raw cents (e.g., "500") into dollars ("$5.00")
      // Note: If your Liquid outputs "$5.00" already, this function safely ignores it.
      const formatMoney = (val) => {
        if (!val || val === 'null') return '';
        if (String(val).includes('$')) return val; // Already formatted
        return '$' + (parseInt(val, 10) / 100).toFixed(2);
      };

      const formattedPrice = formatMoney(variantPrice);

      // Check if compare price exists and is higher than 0
      if (variantComparePrice && variantComparePrice !== 'null' && variantComparePrice !== '0' && variantComparePrice !== '') {
        const formattedComparePrice = formatMoney(variantComparePrice);
        
        // Inject Sale Layout
        priceContainer.innerHTML = `
          <span role="group">
            <span class="visually-hidden">Sale price&nbsp;</span>
            <span class="price">${formattedPrice}</span>
          </span>
          <span role="group">
            <span class="visually-hidden">Regular price&nbsp;</span>
            <span class="compare-at-price">${formattedComparePrice}</span>
          </span>
        `;
      } else {
        // Inject Standard Layout (Replaces the "From $10.99" text)
        priceContainer.innerHTML = `
          <span class="price">${formattedPrice}</span>
        `;
      }

      // CRITICAL: Mark this container with the current variant ID so the observer doesn't loop
      priceContainer.setAttribute('data-rendered-variant', variantId);
    }
  });
}

// 1. Run immediately on load.
updateProductCardData();

// 2. Set up the observer with a Debounce.
let debounceTimer;
const cardObserver = new MutationObserver((mutations) => {
  let shouldRun = false;
  
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0 || mutation.type === 'characterData') {
      shouldRun = true;
      break; 
    }
  }
  
  if (shouldRun) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateProductCardData();
    }, 150); 
  }
});

// Start observing the body for dynamically injected elements AND text mutations
cardObserver.observe(document.body, { 
  childList: true, 
  subtree: true,
  characterData: true 
});

// Listen for the variant update event and call the handler
document.addEventListener(ThemeEvents.variantUpdate, (event) => {
  
  // The target is the variant-picker element
  const variantPicker = event.target;
  
  // Check if the target is a variant-picker
  if (variantPicker && variantPicker.matches('variant-picker, swatches-variant-picker-component')) {
    // Find the parent container (shopify-section, dialog, or product-card)
    const parent = variantPicker.closest('.shopify-section, dialog, product-card');
    
    if (parent) {
      // Find all checked addon checkboxes WITHIN the same parent container
      const checkedAddons = parent.querySelectorAll('addon-card input[type="checkbox"]:checked');

      if (checkedAddons.length > 0) {
        // Dispatch price change event if there are checked addons
        document.dispatchEvent(new PriceChangeEvent(variantPicker));
      }
    }
  }

  document.querySelectorAll(`[xb-product-id="${event.detail.data.productId}"][xb-product-variant]`).forEach(item => {
    if (item.getAttribute('xb-product-variant')) {
      item.setAttribute('xb-product-variant', event.detail.resource.id)
    }
  })
});

export class ProtectionButtons extends Component {
  constructor() {
    super();
    this.#abortController = new AbortController();
    this.#isProcessing = false;
  }

  #abortController;
  #isProcessing;

  connectedCallback() {
    super.connectedCallback?.();
    
    const { signal } = this.#abortController;

    // Listen for cart updates to sync button states
    document.addEventListener(ThemeEvents.cartUpdate, this.#onCartUpdate, { signal });
    
    // Setup button listeners
    this.setupEventListeners();
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this.#abortController.abort();
  }

  /**
   * Handle cart update events from other components
   * @param {CartUpdateEvent} event
   */
  #onCartUpdate = (event) => {
    // Update button states when cart changes
    const cart = event.detail?.resource;
    
    if (cart?.items) {
      // Check if protection is still in cart
      const protectionButton = this.querySelector('.protection__checkout-button');
      const variantId = protectionButton?.getAttribute('data-protection-id');

      if (variantId) {
        const protectionItem = cart.items.find(item => 
          item.variant_id.toString() === variantId.toString()
        );

        const isInCart = !!protectionItem;
        this.#updateUIState(isInCart);
      }
    }
  };

  /**
   * Update UI state based on whether protection is in cart
   * @param {boolean} isInCart
   */
  #updateUIState(isInCart) {
    const protectionButton = this.querySelector('.protection__checkout-button');
    const normalButton = this.querySelector('.normal__checkout-button');
    
    if (isInCart) {
      protectionButton?.setAttribute('data-in-cart', 'true');
      normalButton?.setAttribute('data-in-cart', 'true');
    } else {
      protectionButton?.removeAttribute('data-in-cart');
      normalButton?.removeAttribute('data-in-cart');
    }
  }

  setupEventListeners() {
    // Protection checkout button
    const protectionButton = this.querySelector('.protection__checkout-button');
    if (protectionButton) {
      protectionButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleProtectionButtonClick(protectionButton);
      });
    }

    // Normal checkout button  
    const normalButton = this.querySelector('.normal__checkout-button');
    if (normalButton) {
      normalButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleNormalButtonClick(normalButton);
      });
    }
  }

  async handleProtectionButtonClick(button) {
    // Prevent multiple clicks
    if (this.#isProcessing || button.disabled) return;
    this.#isProcessing = true;
    
    // Show loading state
    button.classList.add('is-loading');
    button.disabled = true;
    
    try {
      const variantId = button.getAttribute('data-protection-id');
      const hasInCart = button.hasAttribute('data-in-cart');
      
      if (!hasInCart) {
        // No data-in-cart attr: add to cart then redirect
        await this.addToCart(variantId);
      }
      
      // Redirect to checkout
      window.location.href = '/checkout';
      
    } catch (error) {
      // Hide loading state on error
      button.classList.remove('is-loading');
      button.disabled = false;
      this.#isProcessing = false;
    }
  }

  async handleNormalButtonClick(button) {
    // Prevent multiple clicks
    if (this.#isProcessing || button.disabled) return;
    this.#isProcessing = true;
    
    // Show loading state
    button.classList.add('is-loading');
    button.disabled = true;
    
    try {
      const hasInCart = button.hasAttribute('data-in-cart');
      
      if (hasInCart) {
        // Has data-in-cart: remove protection then redirect
        const protectionButton = this.querySelector('.protection__checkout-button');
        const lineKey = protectionButton?.getAttribute('data-in-cart');
        
        if (lineKey) {
          await this.removeFromCart(lineKey);
        }
      }
      
      // Redirect to checkout
      window.location.href = '/checkout';
      
    } catch (error) {
      // Hide loading state on error
      button.classList.remove('is-loading');
      button.disabled = false;
      this.#isProcessing = false;
    }
  }

  async addToCart(variantId) {
    // Add protection to cart
    await fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ id: parseInt(variantId), quantity: 1 }]
      })
    });
  }

  async removeFromCart(lineKey) {
    // Remove protection from cart using line key
    await fetch('/cart/update.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updates: { [lineKey]: 0 }
      })
    });
  }
}

customElements.define('protection-buttons', ProtectionButtons);