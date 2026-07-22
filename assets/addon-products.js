import { convertMoneyToMinorUnits, formatMoney } from '@theme/money-formatting';
import { ThemeEvents, PriceChangeEvent, CartAddEvent, CartErrorEvent, CartUpdateEvent, VariantUpdateEvent } from '@theme/events';
import { CartLinesUpdateEvent } from '@shopify/events';

/**
 * @param {HTMLElement} bundle
 */
function syncFrequentStrip(bundle) {
  const strip = bundle.querySelector('[data-frequent-strip]');
  if (!strip) return;
  strip.querySelectorAll('[data-frequent-strip-mirror]').forEach((mirror) => {
    const id = mirror.dataset.productId;
    if (!id) return;
    const card = bundle.querySelector(`addon-card[data-product-id="${id}"]`);
    const real = card?.querySelector('input.checkbox__input:not([data-frequent-strip-mirror])');
    if (real && !mirror.disabled) {
      mirror.checked = Boolean(real.checked);
    }
  });
}

/**
 * AddonCard Component - A lightweight component for addon products
 * Supports variant selection via dropdown when product has variants
 */
export class AddonCard extends HTMLElement {
  static get observedAttributes() {
    return ['data-variant-id', 'data-product-id'];
  }

  constructor() {
    super();
    this.handleVariantChange = this.handleVariantChange.bind(this);
    this.handleCheckboxChange = this.handleCheckboxChange.bind(this);
    this.handleCardClick = this.handleCardClick.bind(this);
    this.handlePriceChange = this.handlePriceChange.bind(this);
  }

  connectedCallback() {
    // Get elements
    this.checkbox = this.querySelector('input[type="checkbox"]');
    this.variantSelector = this.querySelector('.addon-variant-selector');
    this.imageElement = this.querySelector('.addon-image-wrapper img');
    this.priceElement = this.querySelector('product-price .price');
    this.soldOutBadge = this.querySelector('.sold-out-addon');
    
    // Initialize from data attributes
    this.productId = this.getAttribute('data-product-id');
    this.currentVariantId = this.getAttribute('data-variant-id');
    
    // Setup event listeners
    if (this.variantSelector) {
      this.variantSelector.addEventListener('change', this.handleVariantChange);
    }
    
    if (this.checkbox) {
      this.checkbox.addEventListener('change', this.handleCheckboxChange);
    }
    
    // Add click listener to the card itself
    this.addEventListener('click', this.handleCardClick);
    
    // Listen for global price change events
    document.addEventListener('price:change', this.handlePriceChange);
    
    // Initialize variant state
    this.updateVariantState();

    // Update frequently bought section display
    this.updateFrequentlyBoughtDisplay();

    const bundle = this.closest('[data-frequent-bundle]');
    if (bundle) syncFrequentStrip(bundle);
  }

  disconnectedCallback() {
    if (this.variantSelector) {
      this.variantSelector.removeEventListener('change', this.handleVariantChange);
    }
    if (this.checkbox) {
      this.checkbox.removeEventListener('change', this.handleCheckboxChange);
    }
    this.removeEventListener('click', this.handleCardClick);
    document.removeEventListener('price:change', this.handlePriceChange);
  }

  /**
   * Handle card click to toggle checkbox
   * @param {Event} event
   */
  handleCardClick(event) {
    // Ignore clicks on interactive elements
    if (event.target.closest('input, label, button, select')) return;

    if (!this.checkbox) return;
    
    // Check if disabled, abort if true
    if (this.checkbox.disabled) return;
    
    this.checkbox.checked = !this.checkbox.checked;
    this.checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Fire price calculation when card is clicked
    document.dispatchEvent(new PriceChangeEvent(this.checkbox));
    
    // Update frequently bought section display
    this.updateFrequentlyBoughtDisplay();
  }

  /**
   * Handle price change events globally
   * @param {Event} event
   */
  handlePriceChange(event) {
    // Prefer root that contains the main buy-button price (see PriceChangeEvent in events.js)
    const root = event.detail?.priceDisplayParent ?? event.detail?.parent;

    if (!root) return;

    const priceWrap = root.querySelector('.total-price-display[data-price]');
    if (!priceWrap) return;

    const total = event.detail.total;
    const totalCompareAt = event.detail.totalCompareAt ?? total;
    const currency = priceWrap.dataset.currency || window.Shopify?.currency?.active || 'USD';
    const moneyFormat = window.theme?.moneyFormat || '${{amount}}';

    const compareEl = priceWrap.querySelector('.total-price-display__at');
    const saleEl = priceWrap.querySelector('.total-price-display__sale');
    if (compareEl && saleEl) {
      saleEl.textContent = formatMoney(total, moneyFormat, currency);
      if (totalCompareAt > total) {
        compareEl.textContent = formatMoney(totalCompareAt, moneyFormat, currency);
        compareEl.hidden = false;
      } else {
        compareEl.textContent = '';
        compareEl.hidden = true;
      }
      return;
    }

    priceWrap.textContent = formatMoney(total, moneyFormat, currency);
  }

  /**
   * Update frequently bought section display based on checked addons
   */
  updateFrequentlyBoughtDisplay() {
    const bundle = this.closest('[data-frequent-bundle]');
    const section =
      bundle?.closest('addon-products') ||
      bundle?.closest('.frequently-bought-section') ||
      this.closest('.frequently-bought-section, addon-products');
    if (!section) return;
    
    // Find the total price element and no-chosen message
    const totalPriceEl = section.querySelector('.total-frequent-price');
    const noChosenEl = section.querySelector('.frequent-no-chosen');
    
    // Count checked addons within this section
    const checkedAddons = section.querySelectorAll('.addon-card input[type="checkbox"]:checked');
    
    if (checkedAddons.length > 0) {
      // Show total price, hide no-chosen message
      if (totalPriceEl) {
        totalPriceEl.removeAttribute('hidden');
      }
      if (noChosenEl) {
        noChosenEl.setAttribute('hidden', '');
      }
    } else {
      // Hide total price, show no-chosen message
      if (totalPriceEl) {
        totalPriceEl.setAttribute('hidden', '');
      }
      if (noChosenEl) {
        noChosenEl.removeAttribute('hidden');
      }
    }

    if (bundle) syncFrequentStrip(bundle);
  }

  /**
   * Handle variant selection from dropdown
   * @param {Event} event
   */
  handleVariantChange(event) {
    event.stopPropagation();
    
    const selectedOption = this.variantSelector.options[this.variantSelector.selectedIndex];
    const variantId = selectedOption.value;
    const isAvailable = selectedOption.dataset.available === 'true';
    const price = selectedOption.dataset.price;
    const imageUrl = selectedOption.dataset.imageUrl;
    
    // Update checkbox
    if (this.checkbox) {
      this.checkbox.value = variantId;
      this.checkbox.disabled = !isAvailable;
      this.checkbox.setAttribute('data-price', price);
      this.checkbox.setAttribute('data-variant-id', variantId);
      if (selectedOption.dataset.comparePrice) {
        this.checkbox.setAttribute('data-compare-at', selectedOption.dataset.comparePrice);
      } else {
        this.checkbox.removeAttribute('data-compare-at');
      }
      
      // Uncheck if variant is unavailable and was checked
      if (!isAvailable && this.checkbox.checked) {
        this.checkbox.checked = false;
        document.dispatchEvent(new PriceChangeEvent(this.checkbox));
        this.updateFrequentlyBoughtDisplay();
      }
    }
    
    // Update image - only if imageUrl exists and is valid
    if (this.imageElement && imageUrl && imageUrl !== '') {
      this.imageElement.src = imageUrl;
      this.imageElement.setAttribute('srcset', imageUrl);
    }
    
    // Update price display
    if (this.priceElement && price) {
      const formattedPrice = this.formatPrice(price);
      const currentText = this.priceElement.textContent;
      const hasPrefix = currentText.startsWith('+');
      this.priceElement.textContent = (hasPrefix ? '+' : '') + formattedPrice;
    }
    
    // Update sold out badge
    if (this.soldOutBadge) {
      if (isAvailable) {
        this.soldOutBadge.setAttribute('hidden', '');
      } else {
        this.soldOutBadge.removeAttribute('hidden');
      }
    }
    
    // Dispatch price change event if checkbox is checked
    if (this.checkbox && this.checkbox.checked) {
      document.dispatchEvent(new PriceChangeEvent(this.checkbox));
    }
    
    // Update card data attributes
    this.setAttribute('data-variant-id', variantId);
    if (selectedOption.dataset.comparePrice) {
      this.setAttribute('data-variant-compare-price', selectedOption.dataset.comparePrice);
    }
    this.setAttribute('data-variant-price', price);
    
    // Update current variant ID
    this.currentVariantId = variantId;
  }

  /**
   * Handle checkbox change
   * @param {Event} event
   */
  handleCheckboxChange(event) {
    event.stopPropagation();
    
    // If the variant is sold out, prevent checking
    if (this.checkbox.disabled) {
      event.preventDefault();
      this.checkbox.checked = false;
      return;
    }
    
    // Dispatch price change event when checkbox is toggled
    document.dispatchEvent(new PriceChangeEvent(this.checkbox));

    // Update frequently bought section display
    this.updateFrequentlyBoughtDisplay();
  }

  /**
   * Update variant state based on current selection
   */
  updateVariantState() {
    if (!this.currentVariantId || !this.variantSelector) return;
    
    const selectedOption = Array.from(this.variantSelector.options).find(
      option => option.value === this.currentVariantId
    );
    
    if (selectedOption) {
      const isAvailable = selectedOption.dataset.available === 'true';
      const price = selectedOption.dataset.price;
      const imageUrl = selectedOption.dataset.imageUrl;
      
      // Update image
      if (this.imageElement && imageUrl && imageUrl !== '') {
        this.imageElement.src = imageUrl;
        this.imageElement.setAttribute('srcset', imageUrl);
      }
      
      // Update price
      if (this.priceElement && price) {
        const formattedPrice = this.formatPrice(price);
        const currentText = this.priceElement.textContent;
        const hasPrefix = currentText.startsWith('+');
        this.priceElement.textContent = (hasPrefix ? '+' : '') + formattedPrice;
      }
      
      // Update sold out badge
      if (this.soldOutBadge) {
        if (isAvailable) {
          this.soldOutBadge.setAttribute('hidden', '');
        } else {
          this.soldOutBadge.removeAttribute('hidden');
        }
      }
      
      // Update checkbox
      if (this.checkbox) {
        this.checkbox.disabled = !isAvailable;
        this.checkbox.value = this.currentVariantId;
        if (selectedOption.dataset.comparePrice) {
          this.checkbox.setAttribute('data-compare-at', selectedOption.dataset.comparePrice);
        } else {
          this.checkbox.removeAttribute('data-compare-at');
        }
      }
    }
  }

  /**
   * Format price for display using the imported formatMoney utility
   * @param {string|number} price
   * @returns {string}
   */
  formatPrice(price) {
    const numericPrice = typeof price === 'string' ? parseInt(price, 10) : price;
    if (isNaN(numericPrice)) return '';
    
    const moneyFormat = window.theme?.moneyFormat || '${{amount}}';
    const currency = window.Shopify?.currency?.active || 'USD';
    
    return formatMoney(numericPrice, moneyFormat, currency);
  }
}

// Register the custom element
if (!customElements.get('addon-card')) {
  customElements.define('addon-card', AddonCard);
}

document.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;

  if (target.matches('[data-frequent-strip-mirror]')) {
    const bundle = target.closest('[data-frequent-bundle]');
    const productId = target.dataset.productId;
    if (!bundle || !productId) return;
    const card = bundle.querySelector(`addon-card[data-product-id="${productId}"]`);
    const real = card?.querySelector('input.checkbox__input:not([data-frequent-strip-mirror])');
    if (!real || real.disabled) {
      target.checked = Boolean(real?.checked);
      return;
    }
    if (real.checked !== target.checked) {
      real.checked = target.checked;
      real.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return;
  }

  const card = target.closest('addon-card');
  const bundle = card?.closest('[data-frequent-bundle]');
  if (bundle?.querySelector('[data-frequent-strip]')) {
    syncFrequentStrip(bundle);
  }
});

document.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-frequent-details-toggle]');
  if (toggle) {
    const bundle = toggle.closest('[data-frequent-bundle]');
    if (bundle) {
      const open = bundle.classList.toggle('frequent-bundle--details-open');
      const details = bundle.querySelector('.frequent-bundle__details');
      if (details) {
        if (open) {
          details.removeAttribute('hidden');
        } else {
          details.setAttribute('hidden', '');
        }
      }
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    return;
  }

  const button = event.target.closest('.frequent-add-to-cart');
  if (!button) return;

  const frequentRow = button.closest('.frequent-row, addon-products');
  if (!frequentRow) return;

  const checkedAddons = frequentRow.querySelectorAll('addon-card .checkbox__input:checked');
  if (checkedAddons.length === 0) return;

  /** @type {Array<{ id: number, quantity: number }>} */
  const items = [];
  checkedAddons.forEach(addon => {
    items.push({
      id: parseInt(addon.value),
      quantity: 1
    });
  });

  // Get cart sections to update (matching product-form.js pattern)
  const cartItemsComponents = document.querySelectorAll('cart-items-component');
  const sections = [];
  cartItemsComponents.forEach(item => {
    if (item instanceof HTMLElement && item.dataset.sectionId) {
      sections.push(item.dataset.sectionId);
    }
  });

  const payload = {
    items,
    sections: sections.join(',')
  };

  // Trigger animations on the frequent button itself
  if (button.dataset.added !== 'true') {
    button.dataset.added = 'true';
    setTimeout(() => {
      button.removeAttribute('data-added');
    }, 800);
  }

  // Adapt to Horizon's cart flow: the cart-items morph AND the drawer auto-open are both driven by
  // the @shopify/events CartLinesUpdateEvent. createPromise() makes the deferred; we then DISPATCH
  // the event (with action 'add' — that's what cart-drawer's auto-open checks) carrying the promise.
  // Horizon's listeners (cart-items-component, cart-drawer) await that promise and act when we
  // resolve it with the fresh cart + rendered sections. Our raw fetch only mutates the cart
  // server-side, so we drive the event ourselves — mirroring product-form.js — not cart-drawer.js.
  const cartLinesUpdate = CartLinesUpdateEvent.createPromise();
  document.dispatchEvent(
    new CartLinesUpdateEvent({
      action: 'add',
      context: 'product',
      lines: items.map((item) => ({ merchandiseId: item.id, quantity: item.quantity })),
      promise: cartLinesUpdate.promise
    })
  );

  fetch(Theme.routes.cart_add_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  })
    .then(response => response.json())
    .then(async data => {
      if (data.status) {
        // Error case
        console.error('Error adding to cart:', data);
        cartLinesUpdate.reject(new Error(data.message || 'Add to cart failed'));
        return;
      }

      // Trigger animations on existing add-to-cart components
      const allAddToCartContainers = document.querySelectorAll('add-to-cart-component');
      allAddToCartContainers.forEach(container => {
        if (container.animateAddToCart) {
          container.animateAddToCart();
        }
      });

      // Legacy cart:update event for pre-v4 listeners (cart-upsell.js, custom.js, addon states).
      document.dispatchEvent(
        new CartAddEvent({}, 'frequently-bought', {
          source: 'frequently-bought',
          itemCount: items.length,
          sections: data.sections
        })
      );

      // Fetch the fresh cart so the CartLinesUpdateEvent can diff it (drives action 'add' -> auto-open).
      const ajaxCart = await fetch(`${Theme.routes.cart_url}.json`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      })
        .then(response => (response.ok ? response.json() : null))
        .catch(() => null);

      // Resolving dispatches the section morph (cart-items-component) + drawer auto-open through
      // Horizon's own listeners — the drawer opens with the new items already rendered.
      cartLinesUpdate.resolve({
        cart: ajaxCart ? CartLinesUpdateEvent.createCartFromAjaxResponse(ajaxCart) : null,
        detail: {
          items,
          itemCount: items.length,
          source: 'frequently-bought',
          sourceId: 'frequently-bought',
          sections: data.sections,
          didError: false
        }
      });
    })
    .catch(error => {
      console.error('Failed to add to cart:', error);
      cartLinesUpdate.reject(error);
    });
});