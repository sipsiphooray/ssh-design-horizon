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
      }
    } else {
      // Select first available option by default
      const firstAvailable = Array.from(this.select.options).find(opt => !opt.disabled);
      if (firstAvailable) {
        this.select.value = firstAvailable.value;
        this.onOptionSelect(firstAvailable, this.optionEls[0]);
      }
    }
  }

  getDisplayText(option) {
    if (option.text.includes('content.unavailable')) {
      return option.text.split(' - ')[0];
    }
    return option.text;
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
  console.log(event);
  
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