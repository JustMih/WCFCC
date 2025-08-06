import { useEffect, useRef, useCallback } from 'react';

export const useResizeObserver = (callback, options = {}) => {
  const observerRef = useRef(null);
  const elementRef = useRef(null);

  const disconnect = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!elementRef.current) return;

    // Disconnect any existing observer
    disconnect();

    // Create new observer with error handling
    try {
      observerRef.current = new ResizeObserver((entries) => {
        // Use requestAnimationFrame to prevent rapid firing
        requestAnimationFrame(() => {
          if (callback) {
            callback(entries);
          }
        });
      });

      observerRef.current.observe(elementRef.current, options);
    } catch (error) {
      console.warn('ResizeObserver not supported or error occurred:', error);
    }

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [callback, disconnect, options]);

  return elementRef;
}; 