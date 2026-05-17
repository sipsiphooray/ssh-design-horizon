import { Component } from '@theme/component';
import { trapFocus, removeTrapFocus } from '@theme/focus';
import { onAnimationEnd, removeWillChangeOnAnimationEnd } from '@theme/utilities';

/**
 * A custom element that manages the main menu drawer.
 *
 * @typedef {object} Refs
 * @property {HTMLDetailsElement} details - The details element.
 * @property {HTMLDivElement} menuDrawer - The slideable drawer panel containing the menu.
 *
 * @extends {Component<Refs>}
 */
class HeaderDrawer extends Component {
  requiredRefs = ['details', 'menuDrawer'];

  /** Submenu row: ignore summary "close" taps while slide-in transition/animation is still running. */
  #submenuSlideAnimating = new WeakSet();

  /** @type {WeakMap<HTMLDetailsElement, ReturnType<typeof setTimeout>>} */
  #submenuSlideSafetyTimeouts = new WeakMap();

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener('keyup', this.#onKeyUp);
    this.#setupAnimatedElementListeners();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('keyup', this.#onKeyUp);
  }

  /**
   * Close the main menu drawer when the Escape key is pressed
   * @param {KeyboardEvent} event
   */
  #onKeyUp = (event) => {
    if (event.key !== 'Escape') return;

    this.#close(this.#getDetailsElement(event));
  };

  /**
   * @returns {boolean} Whether the main menu drawer is open
   */
  get isOpen() {
    return this.refs.details.hasAttribute('open');
  }

  /**
   * Get the closest details element to the event target
   * @param {Event | undefined} event
   * @returns {HTMLDetailsElement}
   */
  #getDetailsElement(event) {
    if (!(event?.target instanceof Element)) return this.refs.details;

    return event.target.closest('details') ?? this.refs.details;
  }

  /**
   * Toggle the main menu drawer
   */
  toggle() {
    return this.isOpen ? this.close() : this.open();
  }

  /**
   * Open the closest drawer or the main menu drawer
   * @param {string} [target]
   * @param {Event} [event]
   */
  open(target, event) {
    const details = this.#getDetailsElement(event);
    const summary = details.querySelector('summary');

    if (!summary) return;

    // Submenu rows: prevent native <details> toggle so we don't race rAF + menu-open against the
    // browser default (a second tap while transitioning could close immediately). Programmatic open;
    // tap again while open runs #close instead of toggle.
    if (target && event && typeof event.preventDefault === 'function') {
      event.preventDefault();
      if (details.hasAttribute('open')) {
        if (this.#submenuSlideAnimating.has(details)) return;
        this.#close(details);
        return;
      }
      details.setAttribute('open', '');
      this.#submenuSlideAnimating.add(details);
      const prevSafety = this.#submenuSlideSafetyTimeouts.get(details);
      if (prevSafety != null) clearTimeout(prevSafety);
      const safetyId = setTimeout(() => {
        this.#submenuSlideAnimating.delete(details);
        this.#submenuSlideSafetyTimeouts.delete(details);
      }, 500);
      this.#submenuSlideSafetyTimeouts.set(details, safetyId);
    }

    summary.setAttribute('aria-expanded', 'true');

    this.preventInitialAccordionAnimations(details);
    requestAnimationFrame(() => {
      details.classList.add('menu-open');

      if (target) {
        this.refs.menuDrawer.classList.add('menu-drawer--has-submenu-opened');
      }

      // Wait for the drawer animation to complete before trapping focus
      const drawer = details.querySelector('.menu-drawer, .menu-drawer__submenu');
      onAnimationEnd(drawer || details, () => {
        if (target) {
          const safety = this.#submenuSlideSafetyTimeouts.get(details);
          if (safety != null) {
            clearTimeout(safety);
            this.#submenuSlideSafetyTimeouts.delete(details);
          }
          this.#submenuSlideAnimating.delete(details);
        }
        if (!details.hasAttribute('open')) return;
        const trapContainer = this.#focusTrapTargetForCompletedOpen(details);
        if (!trapContainer.hasAttribute('open')) return;
        trapFocus(trapContainer);
      }, { subtree: false });
    });
  }

  /**
   * After any open animation ends: if the main drawer finished but a nested submenu is already
   * open, trap there so a late callback does not replace focus behavior incorrectly.
   * @param {HTMLDetailsElement} details
   * @returns {HTMLDetailsElement}
   */
  #focusTrapTargetForCompletedOpen(details) {
    if (details !== this.refs.details) return details;
    const nested = this.querySelector('details.menu-drawer__menu-container.menu-open[open]');
    return nested instanceof HTMLDetailsElement ? nested : details;
  }

  /**
   * Go back or close the main menu drawer
   * @param {Event} [event]
   */
  back(event) {
    this.#close(this.#getDetailsElement(event));
  }

  /**
   * Close the main menu drawer
   */
  close() {
    this.#close(this.refs.details);
  }

  /**
   * Close the closest menu or submenu that is open
   *
   * @param {HTMLDetailsElement} details
   */
  #close(details) {
    const summary = details.querySelector('summary');

    if (!summary) return;

    const safety = this.#submenuSlideSafetyTimeouts.get(details);
    if (safety != null) {
      clearTimeout(safety);
      this.#submenuSlideSafetyTimeouts.delete(details);
    }
    this.#submenuSlideAnimating.delete(details);

    summary.setAttribute('aria-expanded', 'false');
    details.classList.remove('menu-open');
    this.refs.menuDrawer.classList.remove('menu-drawer--has-submenu-opened');

    // Wait for the .menu-drawer element's transition, not the entire details subtree
    // This avoids waiting for child accordion/resource-card animations which can cause issues on Firefox
    const drawer = details.querySelector('.menu-drawer, .menu-drawer__submenu');

    onAnimationEnd(
      drawer || details,
      () => {
        reset(details);
        if (details === this.refs.details) {
          removeTrapFocus();
          const openDetails = this.querySelectorAll('details[open]:not(accordion-custom > details)');
          openDetails.forEach(reset);
        } else {
          trapFocus(this.refs.details);
        }
      },
      { subtree: false }
    );
  }

  /**
   * Attach animationend event listeners to all animated elements to remove will-change after animation
   * to remove the stacking context and allow submenus to be positioned correctly
   */
  #setupAnimatedElementListeners() {
    const allAnimated = this.querySelectorAll('.menu-drawer__animated-element');
    allAnimated.forEach((element) => {
      element.addEventListener('animationend', removeWillChangeOnAnimationEnd);
    });
  }

  /**
   * Temporarily disables accordion animations to prevent unwanted transitions when the drawer opens.
   * Adds a no-animation class to accordion content elements, then removes it after 100ms to
   * re-enable animations for user interactions.
   * @param {HTMLDetailsElement} details - The details element containing the accordions
   */
  preventInitialAccordionAnimations(details) {
    const content = details.querySelectorAll('accordion-custom .details-content');

    content.forEach((element) => {
      if (element instanceof HTMLElement) {
        element.classList.add('details-content--no-animation');
      }
    });
    setTimeout(() => {
      content.forEach((element) => {
        if (element instanceof HTMLElement) {
          element.classList.remove('details-content--no-animation');
        }
      });
    }, 100);
  }
}

if (!customElements.get('header-drawer')) {
  customElements.define('header-drawer', HeaderDrawer);
}

/**
 * Reset an open details element to its original state
 *
 * @param {HTMLDetailsElement} element
 */
function reset(element) {
  element.classList.remove('menu-open');
  element.removeAttribute('open');
  element.querySelector('summary')?.setAttribute('aria-expanded', 'false');
}
