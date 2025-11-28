class Accessibility {
  constructor() {
    this.announcer = document.getElementById('sr-announcer');
    this.announcementQueue = [];
    this.isAnnouncing = false;
    this.setupAccessibilityFeatures();
  }

  setupAccessibilityFeatures() {
    this.detectScreenReader();
    this.setupFocusManagement();
    this.setupARIALiveRegions();
    this.setupSkipLinks();
  }

  detectScreenReader() {
    const isScreenReaderActive =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      window.navigator.userAgent.includes('NVDA') ||
      window.navigator.userAgent.includes('JAWS');

    document.body.setAttribute(
      'data-screen-reader',
      isScreenReaderActive ? 'true' : 'false'
    );
  }

  announce(message, priority = 'polite') {
    this.announcementQueue.push({ message, priority });

    if (!this.isAnnouncing) {
      this.processAnnouncementQueue();
    }
  }

  processAnnouncementQueue() {
    if (this.announcementQueue.length === 0) {
      this.isAnnouncing = false;
      return;
    }

    this.isAnnouncing = true;
    const { message, priority } = this.announcementQueue.shift();

    this.announcer.setAttribute('aria-live', priority);
    this.announcer.textContent = '';

    setTimeout(() => {
      this.announcer.textContent = message;

      setTimeout(() => {
        this.processAnnouncementQueue();
      }, 1000);
    }, 100);
  }

  setupFocusManagement() {
    let focusOutline = true;

    document.addEventListener('mousedown', () => {
      focusOutline = false;
      document.body.classList.add('no-focus-outline');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        focusOutline = true;
        document.body.classList.remove('no-focus-outline');
      }
    });

    const focusableElements = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ];

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.activeElement) {
          document.activeElement.blur();
          this.announce('Focus cleared');
        }
      }
    });
  }

  setupARIALiveRegions() {
    const statusBar = document.getElementById('status-bar');
    if (statusBar) {
      statusBar.setAttribute('role', 'status');
      statusBar.setAttribute('aria-live', 'polite');
      statusBar.setAttribute('aria-atomic', 'true');
    }
  }

  setupSkipLinks() {
    const skipLink = document.createElement('a');
    skipLink.href = '#notebook';
    skipLink.textContent = 'Skip to notebook';
    skipLink.className = 'sr-only';
    skipLink.style.position = 'absolute';
    skipLink.style.top = '0';
    skipLink.style.left = '0';

    skipLink.addEventListener('focus', () => {
      skipLink.style.position = 'static';
    });

    skipLink.addEventListener('blur', () => {
      skipLink.style.position = 'absolute';
    });

    document.body.insertBefore(skipLink, document.body.firstChild);
  }

  updateStatus(message) {
    const statusText = document.getElementById('status-text');
    if (statusText) {
      statusText.textContent = message;
      this.announce(message);
    }
  }

  describeCellStructure(cellIndex, totalCells) {
    const cell = window.notebook.cells[cellIndex];
    const hasContent = cell.content.length > 0;
    const hasOutput = cell.output.length > 0;

    let description = `${cell.type} cell ${cellIndex + 1} of ${totalCells}`;

    if (hasContent) {
      const contentLength = cell.content.length;
      const lines = cell.content.split('\n').length;
      description += `. Contains ${lines} line${
        lines !== 1 ? 's' : ''
      } of code, ${contentLength} characters`;
    } else {
      description += '. Empty';
    }

    if (hasOutput) {
      description += '. Has output';
    }

    if (cell.metadata.executionCount) {
      description += `. Executed ${cell.metadata.executionCount} time${
        cell.metadata.executionCount !== 1 ? 's' : ''
      }`;
    }

    return description;
  }

  announceKeyboardShortcut(shortcut, action) {
    this.announce(`Keyboard shortcut: ${shortcut} for ${action}`);
  }

  setupLandmarkNavigation() {
    const landmarks = [
      { selector: '#toolbar', name: 'toolbar' },
      { selector: '#notebook', name: 'notebook' },
      { selector: '#status-bar', name: 'status' }
    ];

    landmarks.forEach((landmark) => {
      const element = document.querySelector(landmark.selector);
      if (element) {
        element.setAttribute('role', 'region');
        element.setAttribute('aria-label', landmark.name);
      }
    });
  }

  enhanceCellNavigation() {
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === 'h') {
        e.preventDefault();
        const cellIndex = window.notebook.currentCellIndex;
        const description = this.describeCellStructure(
          cellIndex,
          window.notebook.cells.length
        );
        this.announce(description);
      }
    });
  }

  setupAccessibilityPreferences() {
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    );
    const prefersHighContrast = window.matchMedia('(prefers-contrast: high)');

    if (prefersReducedMotion.matches) {
      document.body.classList.add('reduce-motion');
      this.announce('Reduced motion enabled');
    }

    if (prefersHighContrast.matches) {
      document.body.classList.add('high-contrast');
      this.announce('High contrast mode enabled');
    }

    prefersReducedMotion.addEventListener('change', (e) => {
      if (e.matches) {
        document.body.classList.add('reduce-motion');
        this.announce('Reduced motion enabled');
      } else {
        document.body.classList.remove('reduce-motion');
        this.announce('Reduced motion disabled');
      }
    });

    prefersHighContrast.addEventListener('change', (e) => {
      if (e.matches) {
        document.body.classList.add('high-contrast');
        this.announce('High contrast mode enabled');
      } else {
        document.body.classList.remove('high-contrast');
        this.announce('High contrast mode disabled');
      }
    });
  }
}

window.accessibility = new Accessibility();
window.accessibility.setupAccessibilityPreferences();
window.accessibility.setupLandmarkNavigation();
window.accessibility.enhanceCellNavigation();
