import { ThemeEvents, PriceChangeEvent } from '@theme/events';

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
    // Get the parent from the event detail
    const parent = event.detail?.parent;
    
    // If no parent, don't update anything
    if (!parent) return;
    
    // Find price element within the parent
    const priceEl = parent.querySelector('.total-price-display[data-price]');
    if (!priceEl) return;

    const symbol = priceEl.dataset.symbol;
    const currency = priceEl.dataset.currency;
    const total = event.detail.total;

    let formattedPrice;
    
    // If currency is provided, use the formatMoney method
    if (currency) {
      formattedPrice = this.formatMoney(total.toString(), currency);
      // Add symbol with no space, add space before currency if currency exists
      priceEl.textContent = symbol ? `${symbol}${formattedPrice} ${currency}` : `${formattedPrice} ${currency}`;
    } else {
      // Fallback to simple number formatting if no currency
      formattedPrice = (total / 100).toFixed(2);
      priceEl.textContent = symbol ? `${symbol}${formattedPrice}` : formattedPrice;
    }
  }

  /**
   * Update frequently bought section display based on checked addons
   */
  updateFrequentlyBoughtDisplay() {
    // Find the frequently bought section
    const section = this.closest('.frequently-bought-section');
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
      }
    }
  }

  /**
   * Format price for display
   * @param {string|number} price
   * @returns {string}
   */
  formatPrice(price) {
    const numericPrice = typeof price === 'string' ? parseInt(price, 10) : price;
    if (isNaN(numericPrice)) return '';
    
    const formatter = new Intl.NumberFormat(window.Shopify.locale || 'en-US', {
      style: 'currency',
      currency: window.Shopify.currency?.active || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    return formatter.format(numericPrice / 100);
  }

  /**
   * Formats money, replicating Shopify's `money` liquid filter behavior.
   * @param {number} moneyValue - Money value in cents (e.g., 12345 = $123.45)
   * @param {string} currency - Currency code (e.g., "USD", "EUR")
   * @param {string} template - Money format template (default: "{{amount}}")
   * @returns {string} The formatted money value
   */
  formatMoney(moneyValue, currency, template = '{{amount}}') {
    const upperCurrency = currency.toUpperCase();
    const basePrecision = CURRENCY_DECIMALS[upperCurrency] ?? DEFAULT_CURRENCY_DECIMALS;

    return template.replace(/{{\s*(\w+)\s*}}/g, (_, placeholder) => {
      let thousandsSeparator = ',';
      let decimalSeparator = '.';
      let precision = basePrecision;

      switch (placeholder) {
        case 'currency':
          return currency;
        case 'amount_no_decimals':
          precision = 0;
          break;
        case 'amount_with_comma_separator':
          thousandsSeparator = '.';
          decimalSeparator = ',';
          break;
        case 'amount_no_decimals_with_comma_separator':
          thousandsSeparator = '.';
          precision = 0;
          break;
        case 'amount_no_decimals_with_space_separator':
          thousandsSeparator = ' ';
          precision = 0;
          break;
        case 'amount_with_space_separator':
          thousandsSeparator = ' ';
          decimalSeparator = ',';
          break;
        case 'amount_with_period_and_space_separator':
          thousandsSeparator = ' ';
          decimalSeparator = '.';
          break;
        case 'amount_with_apostrophe_separator':
          thousandsSeparator = "'";
          decimalSeparator = '.';
          break;
      }

      return this.formatCents(moneyValue, thousandsSeparator, decimalSeparator, precision);
    });
  }

  /**
   * Formats money in cents
   * @param {number} moneyValue - The money value in cents
   * @param {string} thousandsSeparator - The thousands separator
   * @param {string} decimalSeparator - The decimal separator
   * @param {number} precision - The precision
   * @returns {string} The formatted money value
   */
  formatCents(moneyValue, thousandsSeparator, decimalSeparator, precision) {
    const roundedNumber = (moneyValue / 100).toFixed(precision);

    let [a, b] = roundedNumber.split('.');
    if (!a) a = '0';
    if (!b) b = '';

    // Add thousands separator
    a = a.replace(/\d(?=(\d\d\d)+(?!\d))/g, digit => digit + thousandsSeparator);

    return precision <= 0 ? a : a + decimalSeparator + b.padEnd(precision, '0');
  }
}

// Register the custom element
if (!customElements.get('addon-card')) {
  customElements.define('addon-card', AddonCard);
}

/**
 * Default currency decimals used in most currenies
 * @constant {number}
 */
const DEFAULT_CURRENCY_DECIMALS = 2;

/**
 * Decimal precision for currencies that have a non-default precision
 * @type {Record<string, number>}
 */
const CURRENCY_DECIMALS = {
  BHD: 3,
  BIF: 0,
  BYR: 0,
  CLF: 4,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  IQD: 3,
  ISK: 0,
  JOD: 3,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  KWD: 3,
  LYD: 3,
  MRO: 5,
  OMR: 3,
  PYG: 0,
  RWF: 0,
  TND: 3,
  UGX: 0,
  UYI: 0,
  UYW: 4,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XAG: 0,
  XAU: 0,
  XBA: 0,
  XBB: 0,
  XBC: 0,
  XBD: 0,
  XDR: 0,
  XOF: 0,
  XPD: 0,
  XPF: 0,
  XPT: 0,
  XSU: 0,
  XTS: 0,
  XUA: 0,
};