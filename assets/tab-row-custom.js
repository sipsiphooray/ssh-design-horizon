class TabRowCustom extends HTMLElement {
  /** @type {HTMLDetailsElement} */
  get details() {
    const details = this.querySelector('details');
    if (!(details instanceof HTMLDetailsElement)) {
      throw new Error('Details element not found');
    }
    return details;
  }

  /** @type {HTMLElement} */
  get summary() {
    const summary = this.details.querySelector('summary');
    if (!(summary instanceof HTMLElement)) {
      throw new Error('Summary element not found');
    }
    return summary;
  }

  connectedCallback() {
    // Add necessary attributes for tab mode
    this.setAttribute('role', 'tab');
    this.setAttribute('aria-expanded', 'false');
  }
}

if (!customElements.get('tab-row-custom')) {
  customElements.define('tab-row-custom', TabRowCustom);
}