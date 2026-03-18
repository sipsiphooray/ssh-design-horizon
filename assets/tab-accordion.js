import { mediaQueryLarge, isMobileBreakpoint } from '@theme/utilities';

class TabAccordion extends HTMLElement {
  /** @type {HTMLElement} */
  get container() {
    return this;
  }

  /** @type {NodeListOf<HTMLElement>} */
  get tabRows() {
    return this.querySelectorAll('tab-row-custom');
  }

  /** @type {HTMLElement|null} */
  get tabsHeader() {
    return this.querySelector('.tabs-header');
  }

  /** @type {NodeListOf<HTMLElement>} */
  get tabButtons() {
    return this.querySelectorAll('.tab-button');
  }

  /** @type {NodeListOf<HTMLElement>} */
  get tabContents() {
    return this.querySelectorAll('.tab-content');
  }

  /** @type {NodeListOf<HTMLDetailsElement>} */
  get accordionDetails() {
    return this.querySelectorAll('details');
  }

  /** @type {ResizeObserver|null} */
  #resizeObserver = null;
  
  #controller = new AbortController();
  
  #isMobile = isMobileBreakpoint();
  
  /** @type {boolean} */
  #isSwipeable = false;
  
  /** @type {number} */
  #touchStartX = 0;
  
  /** @type {number} */
  #touchEndX = 0;
  
  /** @type {HTMLElement|null} */
  #scrollContainer = null;
  
  /** @type {HTMLElement|null} */
  #arrowsContainer = null;
  
  /** @type {number} */
  #scrollPosition = 0;
  
  /** @type {number} */
  #maxScroll = 0;

  connectedCallback() {
    const { signal } = this.#controller;

    this.#initializeComponent();
    this.#setupEventListeners(signal);
    this.#setupResizeObserver();
    
    // Initial setup based on current viewport
    this.#handleViewportChange();
  }

  disconnectedCallback() {
    this.#controller.abort();
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
    }
  }

  #initializeComponent() {
    // Create tabs header container if not exists
    if (!this.tabsHeader) {
      const tabsHeader = document.createElement('div');
      tabsHeader.className = 'tabs-header';
      
      // Create scroll container for swipeable tabs
      this.#scrollContainer = document.createElement('div');
      this.#scrollContainer.className = 'tabs-scroll-container';
      
      // Create tab buttons from each row
      this.tabRows.forEach((row, index) => {
        const tabButton = document.createElement('button');
        tabButton.className = `tab-button ${index === 0 ? 'active' : ''}`;
        tabButton.type = 'button';
        tabButton.setAttribute('role', 'tab');
        tabButton.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
        tabButton.setAttribute('data-index', index.toString());
        
        // Get heading from the row
        const heading = row.querySelector('.details__header')?.textContent?.trim() || `Tab ${index + 1}`;
        tabButton.textContent = heading;
        
        this.#scrollContainer.appendChild(tabButton);
      });
      
      tabsHeader.appendChild(this.#scrollContainer);
      this.container.insertBefore(tabsHeader, this.container.firstChild);
      
      // Check if we need arrows container (initially)
      this.#checkAndCreateArrowsContainer();
    }

    // Initialize tab contents
    this.tabRows.forEach((row, index) => {
      const details = row.querySelector('details');
      const content = row.querySelector('.details-content');
      
      if (details && content) {
        // Create tab content wrapper
        const tabContent = document.createElement('div');
        tabContent.className = `tab-content ${index === 0 ? 'active' : ''}`;
        tabContent.setAttribute('role', 'tabpanel');
        tabContent.setAttribute('data-index', index.toString());
        
        // Move content to tab wrapper
        content.childNodes.forEach(node => {
          tabContent.appendChild(node.cloneNode(true));
        });
        
        // Add tab content to container
        this.container.appendChild(tabContent);
        
        // Hide original content in desktop mode
        if (!this.#isMobile) {
          details.style.display = 'none';
        }
      }
    });
  }

  #checkAndCreateArrowsContainer() {
    if (!this.tabsHeader || !this.#scrollContainer) return;
    
    const containerWidth = this.#scrollContainer.clientWidth;
    const scrollWidth = this.#scrollContainer.scrollWidth;
    const needsArrows = scrollWidth > containerWidth;
    
    if (needsArrows && !this.#arrowsContainer) {
      // Create arrows container only when needed
      this.#arrowsContainer = document.createElement('div');
      this.#arrowsContainer.className = 'tabs-arrows-container';
      this.#addNavigationArrows();
      this.tabsHeader.appendChild(this.#arrowsContainer);
    } else if (!needsArrows && this.#arrowsContainer) {
      // Remove arrows container when not needed
      this.#arrowsContainer.remove();
      this.#arrowsContainer = null;
    }
  }

  #addNavigationArrows() {
    if (!this.#arrowsContainer) return;
    
    const leftArrow = document.createElement('button');
    leftArrow.className = 'tab-nav-arrow tab-nav-arrow-left';
    leftArrow.setAttribute('aria-label', 'Scroll tabs left');
    leftArrow.disabled = true;
    
    // Create SVG for left arrow
    const leftArrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    leftArrowSvg.setAttribute('width', '14');
    leftArrowSvg.setAttribute('height', '14');
    leftArrowSvg.setAttribute('viewBox', '0 0 14 14');
    leftArrowSvg.setAttribute('fill', 'none');
    leftArrowSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    
    const leftArrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leftArrowPath.setAttribute('d', 'M11 5.5L7 9.5L3 5.5');
    leftArrowPath.setAttribute('stroke', 'currentColor');
    leftArrowPath.setAttribute('stroke-width', 'var(--icon-stroke-width, 1.5)');
    leftArrowPath.setAttribute('stroke-linecap', 'round');
    leftArrowPath.setAttribute('stroke-linejoin', 'round');
    
    leftArrowSvg.appendChild(leftArrowPath);
    leftArrow.appendChild(leftArrowSvg);
    
    const rightArrow = document.createElement('button');
    rightArrow.className = 'tab-nav-arrow tab-nav-arrow-right';
    rightArrow.setAttribute('aria-label', 'Scroll tabs right');
    rightArrow.disabled = true;
    
    // Create SVG for right arrow
    const rightArrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    rightArrowSvg.setAttribute('width', '14');
    rightArrowSvg.setAttribute('height', '14');
    rightArrowSvg.setAttribute('viewBox', '0 0 14 14');
    rightArrowSvg.setAttribute('fill', 'none');
    rightArrowSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    
    const rightArrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    rightArrowPath.setAttribute('d', 'M11 5.5L7 9.5L3 5.5');
    rightArrowPath.setAttribute('stroke', 'currentColor');
    rightArrowPath.setAttribute('stroke-width', 'var(--icon-stroke-width, 1.5)');
    rightArrowPath.setAttribute('stroke-linecap', 'round');
    rightArrowPath.setAttribute('stroke-linejoin', 'round');
    
    rightArrowSvg.appendChild(rightArrowPath);
    rightArrow.appendChild(rightArrowSvg);
    
    this.#arrowsContainer.appendChild(leftArrow);
    this.#arrowsContainer.appendChild(rightArrow);
  }

  #setupEventListeners(signal) {
    const { signal: abortSignal } = this.#controller;
    
    // Tab button clicks
    this.addEventListener('click', (event) => {
      const tabButton = event.target.closest('.tab-button');
      const arrowLeft = event.target.closest('.tab-nav-arrow-left');
      const arrowRight = event.target.closest('.tab-nav-arrow-right');
      
      if (tabButton && !this.#isMobile) {
        this.#activateTab(parseInt(tabButton.dataset.index));
        this.#scrollToActiveTab();
      } else if (arrowLeft && !this.#isMobile && this.#isSwipeable && !arrowLeft.disabled) {
        this.#scrollTabs(-1);
      } else if (arrowRight && !this.#isMobile && this.#isSwipeable && !arrowRight.disabled) {
        this.#scrollTabs(1);
      }
    }, { signal: abortSignal });

    // Touch events for swipe on desktop
    if (this.#scrollContainer) {
      this.#scrollContainer.addEventListener('touchstart', (e) => {
        if (!this.#isMobile && this.#isSwipeable) {
          this.#touchStartX = e.changedTouches[0].screenX;
        }
      }, { passive: true, signal: abortSignal });

      this.#scrollContainer.addEventListener('touchend', (e) => {
        if (!this.#isMobile && this.#isSwipeable) {
          this.#touchEndX = e.changedTouches[0].screenX;
          this.#handleSwipe();
        }
      }, { passive: true, signal: abortSignal });

      this.#scrollContainer.addEventListener('touchmove', (e) => {
        if (!this.#isMobile && this.#isSwipeable) {
          e.preventDefault(); // Prevent scrolling while swiping tabs
        }
      }, { signal: abortSignal });

      // Mouse wheel for horizontal scroll
      this.#scrollContainer.addEventListener('wheel', (e) => {
        if (!this.#isMobile && this.#isSwipeable) {
          e.preventDefault();
          this.#scrollContainer.scrollLeft += e.deltaY;
          this.#updateArrowVisibility();
        }
      }, { signal: abortSignal });
    }

    // Accordion summary clicks
    this.addEventListener('click', (event) => {
      const summary = event.target.closest('summary');
      if (summary && this.#isMobile) {
        // Prevent default if needed (based on your existing logic)
        const isDesktop = !this.#isMobile;
        const row = event.target.closest('tab-row-custom');
        
        if (row?.dataset.disableOnMobile === 'true' && this.#isMobile) {
          event.preventDefault();
          return;
        }
        if (row?.dataset.disableOnDesktop === 'true' && isDesktop) {
          event.preventDefault();
          return;
        }
      }
    }, { signal: abortSignal });

    // Media query changes
    mediaQueryLarge.addEventListener('change', () => {
      this.#isMobile = isMobileBreakpoint();
      this.#handleViewportChange();
    }, { signal: abortSignal });

    // Keyboard navigation for tabs
    this.addEventListener('keydown', (event) => {
      if (this.#isMobile) return;
      
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          this.#navigateTabs(1);
          this.#scrollToActiveTab();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          this.#navigateTabs(-1);
          this.#scrollToActiveTab();
          break;
        case 'Home':
          event.preventDefault();
          this.#activateTab(0);
          this.#scrollToActiveTab();
          break;
        case 'End':
          event.preventDefault();
          this.#activateTab(this.tabButtons.length - 1);
          this.#scrollToActiveTab();
          break;
        case 'Escape':
          if (this.dataset.closeWithEscape === 'true') {
            event.preventDefault();
            this.#closeAllAccordions();
          }
          break;
      }
    }, { signal: abortSignal });

    // Update scroll calculations on resize
    window.addEventListener('resize', () => {
      this.#updateSwipeableState();
      this.#updateArrowVisibility();
    }, { signal: abortSignal });
  }

  #setupResizeObserver() {
    this.#resizeObserver = new ResizeObserver(() => {
      const newIsMobile = isMobileBreakpoint();
      if (newIsMobile !== this.#isMobile) {
        this.#isMobile = newIsMobile;
        this.#handleViewportChange();
      }
      this.#updateSwipeableState();
      this.#updateArrowVisibility();
    });
    
    this.#resizeObserver.observe(this.container);
    if (this.#scrollContainer) {
      this.#resizeObserver.observe(this.#scrollContainer);
    }
  }

  #updateSwipeableState() {
    if (!this.#isMobile && this.#scrollContainer) {
      const containerWidth = this.#scrollContainer.clientWidth;
      const scrollWidth = this.#scrollContainer.scrollWidth;
      
      // Check if content overflows the container
      this.#isSwipeable = scrollWidth > containerWidth;
      this.#maxScroll = scrollWidth - containerWidth;
      
      if (this.#isSwipeable) {
        this.#scrollContainer.style.overflowX = 'auto';
        this.#scrollContainer.style.scrollBehavior = 'smooth';
        
        // Add swipeable class to tabs header
        if (this.tabsHeader) {
          this.tabsHeader.classList.add('swipeable');
        }
        
        // Create arrows container if needed
        this.#checkAndCreateArrowsContainer();
        
        // Enable navigation arrows when swipeable
        this.#updateArrowVisibility();
      } else {
        this.#scrollContainer.style.overflowX = 'visible';
        this.#scrollContainer.style.cursor = 'default';
        
        // Remove swipeable class
        if (this.tabsHeader) {
          this.tabsHeader.classList.remove('swipeable');
        }
        
        // Remove arrows container if it exists
        if (this.#arrowsContainer) {
          this.#arrowsContainer.remove();
          this.#arrowsContainer = null;
        }
      }
    } else {
      this.#isSwipeable = false;
      if (this.#scrollContainer) {
        this.#scrollContainer.style.overflowX = 'visible';
        this.#scrollContainer.style.cursor = 'default';
      }
      
      // Remove swipeable class
      if (this.tabsHeader) {
        this.tabsHeader.classList.remove('swipeable');
      }
      
      // Remove arrows container if it exists
      if (this.#arrowsContainer) {
        this.#arrowsContainer.remove();
        this.#arrowsContainer = null;
      }
    }
  }

  #disableAllArrows() {
    if (!this.#arrowsContainer) return;
    
    const leftArrow = this.#arrowsContainer.querySelector('.tab-nav-arrow-left');
    const rightArrow = this.#arrowsContainer.querySelector('.tab-nav-arrow-right');
    
    if (leftArrow) leftArrow.disabled = true;
    if (rightArrow) rightArrow.disabled = true;
  }

  #handleSwipe() {
    if (!this.#scrollContainer || !this.#isSwipeable) return;
    
    const swipeThreshold = 50;
    const swipeDistance = this.#touchStartX - this.#touchEndX;
    
    if (Math.abs(swipeDistance) > swipeThreshold) {
      if (swipeDistance > 0) {
        // Swipe left - scroll right
        this.#scrollTabs(1);
      } else {
        // Swipe right - scroll left
        this.#scrollTabs(-1);
      }
    }
  }

  #scrollTabs(direction) {
    if (!this.#scrollContainer) return;
    
    const scrollAmount = 200; // pixels to scroll per click
    const newScrollPosition = this.#scrollContainer.scrollLeft + (scrollAmount * direction);
    
    // Clamp scroll position
    this.#scrollPosition = Math.max(0, Math.min(newScrollPosition, this.#maxScroll));
    this.#scrollContainer.scrollLeft = this.#scrollPosition;
    
    // Update arrow visibility after a short delay
    setTimeout(() => this.#updateArrowVisibility(), 300);
  }

  #scrollToActiveTab() {
    if (!this.#scrollContainer || !this.#isSwipeable) return;
    
    const activeButton = this.querySelector('.tab-button.active');
    if (!activeButton) return;
    
    const containerRect = this.#scrollContainer.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    
    // Check if button is partially or fully outside viewport
    if (buttonRect.left < containerRect.left || buttonRect.right > containerRect.right) {
      // Calculate scroll position to center the active tab
      const scrollLeft = activeButton.offsetLeft - (containerRect.width / 2) + (buttonRect.width / 2);
      this.#scrollContainer.scrollLeft = scrollLeft;
      this.#scrollPosition = scrollLeft;
      
      this.#updateArrowVisibility();
    }
  }

  #updateArrowVisibility() {
    if (!this.#scrollContainer || !this.#isSwipeable || !this.#arrowsContainer) return;
    
    const leftArrow = this.#arrowsContainer.querySelector('.tab-nav-arrow-left');
    const rightArrow = this.#arrowsContainer.querySelector('.tab-nav-arrow-right');
    
    if (!leftArrow || !rightArrow) return;
    
    const currentScroll = this.#scrollContainer.scrollLeft;
    
    // Update left arrow disabled state
    leftArrow.disabled = currentScroll <= 10;
    
    // Update right arrow disabled state
    rightArrow.disabled = currentScroll >= this.#maxScroll - 10;
  }

  #handleViewportChange() {
    if (this.#isMobile) {
      // Switch to accordion mode
      this.#activateMobileMode();
    } else {
      // Switch to tab mode
      this.#activateDesktopMode();
    }
    this.#updateSwipeableState();
    this.#updateArrowVisibility();
  }

  #activateMobileMode() {
    // Show all accordion details
    this.accordionDetails.forEach(details => {
      details.style.display = '';
    });
    
    // Hide tabs header and content
    if (this.tabsHeader) this.tabsHeader.style.display = 'none';
    this.tabContents.forEach(content => {
      content.style.display = 'none';
    });
    
    // Set accordion default open states
    this.#setDefaultOpenStates();
  }

  #activateDesktopMode() {
    // Hide all accordion details
    this.accordionDetails.forEach(details => {
      details.style.display = 'none';
    });
    
    // Show tabs header
    if (this.tabsHeader) this.tabsHeader.style.display = 'flex';
    
    // Show only active tab content
    this.tabContents.forEach((content, index) => {
      content.style.display = content.classList.contains('active') ? 'block' : 'none';
    });
    
    // Close all accordions
    this.#closeAllAccordions();
  }

  #setDefaultOpenStates() {
    this.accordionDetails.forEach((details, index) => {
      const row = this.tabRows[index];
      if (row) {
        details.open = row.hasAttribute('open-by-default-on-mobile') || 
                      row.hasAttribute('open-by-default-on-desktop');
      }
    });
  }

  #closeAllAccordions() {
    this.accordionDetails.forEach(details => {
      details.open = false;
    });
  }

  #activateTab(index) {
    // Validate index
    if (index < 0 || index >= this.tabButtons.length) return;
    
    // Update tab buttons
    this.tabButtons.forEach((button, i) => {
      const isActive = i === index;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive.toString());
    });
    
    // Update tab contents
    this.tabContents.forEach((content, i) => {
      const isActive = i === index;
      content.classList.toggle('active', isActive);
      content.style.display = isActive ? 'block' : 'none';
    });
  }

  #navigateTabs(direction) {
    const activeIndex = Array.from(this.tabButtons).findIndex(button => 
      button.classList.contains('active')
    );
    
    if (activeIndex === -1) return;
    
    let newIndex = activeIndex + direction;
    
    // Wrap around
    if (newIndex < 0) newIndex = this.tabButtons.length - 1;
    if (newIndex >= this.tabButtons.length) newIndex = 0;
    
    this.#activateTab(newIndex);
    this.tabButtons[newIndex].focus();
  }
}

if (!customElements.get('tab-accordion')) {
  customElements.define('tab-accordion', TabAccordion);
}