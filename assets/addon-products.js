import { ThemeEvents, PriceChangeEvent } from '@theme/events';

// Handle variant selector changes
document.addEventListener('change', (e) => {
  const variantSelector = e.target.closest('.addon-variant-selector');
  if (!variantSelector) return;
  
  const card = variantSelector.closest('addon-card');
  if (!card) return;
  
  const selectedOption = variantSelector.options[variantSelector.selectedIndex];
  const variantId = selectedOption.value;
  const isAvailable = selectedOption.dataset.available === 'true';
  const price = selectedOption.dataset.price;
  const imageUrl = selectedOption.dataset.imageUrl;
  
  // Update checkbox
  const checkbox = card.querySelector('input[type="checkbox"]');
  if (checkbox) {
    checkbox.value = variantId;
    checkbox.disabled = !isAvailable;
    checkbox.setAttribute('data-price', price);
    checkbox.setAttribute('data-variant-id', variantId);
    
    // Uncheck if variant is unavailable and was checked
    if (!isAvailable && checkbox.checked) {
      checkbox.checked = false;
      document.dispatchEvent(new PriceChangeEvent());
    }
  }
  
  // Update image - only if imageUrl exists and is valid
  const imageElement = card.querySelector('.addon-image-wrapper img');
  if (imageElement && imageUrl && imageUrl !== '') {
    imageElement.src = imageUrl;
    imageElement.setAttribute('srcset', imageUrl);
  }
  
  // Update price display if there's a price element with the "+" prefix
  const priceElement = card.querySelector('product-price .price');
  if (priceElement && price) {
    const formattedPrice = formatMoney(price.toString(), window.Shopify.currency?.active || 'USD');
    const currentText = priceElement.textContent;
    const hasPrefix = currentText.startsWith('+');
    priceElement.textContent = (hasPrefix ? '+' : '') + formattedPrice;
  }
  
  // Update sold out badge
  const soldOutBadge = card.querySelector('.sold-out-addon');
  if (soldOutBadge) {
    if (isAvailable) {
      soldOutBadge.setAttribute('hidden', '');
    } else {
      soldOutBadge.removeAttribute('hidden');
    }
  }
  
  // Dispatch price change event if checkbox is checked
  if (checkbox && checkbox.checked) {
    document.dispatchEvent(new PriceChangeEvent());
  }
  
  // Update card data attributes
  card.setAttribute('data-variant-id', variantId);
  if (selectedOption.dataset.comparePrice) {
    card.setAttribute('data-variant-compare-price', selectedOption.dataset.comparePrice);
  }
  card.setAttribute('data-variant-price', price);
});

// Handle click on addon-card
document.addEventListener('click', (e) => {
  const card = e.target.closest('addon-card');
  if (!card) return;
  
  // Ignore clicks on interactive elements
  if (e.target.closest('input, label, button, a, select')) return;
  
  const checkbox = card.querySelector('input[type="checkbox"]');
  if (!checkbox) return;
  
  // Check if disabled, abort if true
  if (checkbox.disabled) return;
  
  checkbox.checked = !checkbox.checked;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  
  // Fire price calculation when card is clicked
  document.dispatchEvent(new PriceChangeEvent());
});

// Handle price change events globally
document.addEventListener('price:change', e => {
  const priceEl = document.querySelector('.button--price[data-price]');
  if (!priceEl) return;
  
  const symbol = priceEl.dataset.symbol;
  const currency = priceEl.dataset.currency;

  if (priceEl) {
    priceEl.textContent = symbol + ' ' + formatMoney(e.detail.total.toString(), currency) + ' ' + currency;
  }
});

/**
 * Formats money, replicating Shopify's `money` liquid filter behavior.
 * @param {number} moneyValue - Money value in cents (e.g., 12345 = $123.45)
 * @param {string} currency - Currency code (e.g., "USD", "EUR")
 * @param {string} template - Money format template (default: "{{amount}}")
 * @returns {string} The formatted money value
 */
function formatMoney(moneyValue, currency, template = '{{amount}}') {
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

    return formatCents(moneyValue, thousandsSeparator, decimalSeparator, precision);
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
function formatCents(moneyValue, thousandsSeparator, decimalSeparator, precision) {
  const roundedNumber = (moneyValue / 100).toFixed(precision);

  let [a, b] = roundedNumber.split('.');
  if (!a) a = '0';
  if (!b) b = '';

  // Add thousands separator
  a = a.replace(/\d(?=(\d\d\d)+(?!\d))/g, digit => digit + thousandsSeparator);

  return precision <= 0 ? a : a + decimalSeparator + b.padEnd(precision, '0');
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