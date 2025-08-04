// Global error handler for ResizeObserver errors
export const setupResizeObserverErrorHandler = () => {
  const originalError = console.error;
  
  console.error = (...args) => {
    // Check if the error is a ResizeObserver error
    const isResizeObserverError = args.some(arg => 
      typeof arg === 'string' && 
      arg.includes('ResizeObserver loop completed with undelivered notifications')
    );
    
    if (isResizeObserverError) {
      // Convert to warning instead of error
      console.warn('ResizeObserver warning (handled):', ...args);
    } else {
      // Log other errors normally
      originalError.apply(console, args);
    }
  };

  // Also handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && event.reason.message && 
        event.reason.message.includes('ResizeObserver')) {
      event.preventDefault();
      console.warn('ResizeObserver promise rejection handled:', event.reason);
    }
  });

  // Handle global errors
  window.addEventListener('error', (event) => {
    if (event.error && event.error.message && 
        event.error.message.includes('ResizeObserver')) {
      event.preventDefault();
      console.warn('ResizeObserver global error handled:', event.error);
    }
  });
};

// Utility function to debounce ResizeObserver callbacks
export const debounceResizeObserver = (callback, delay = 16) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), delay);
  };
};

// Utility function to throttle ResizeObserver callbacks
export const throttleResizeObserver = (callback, delay = 16) => {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      callback(...args);
    }
  };
}; 