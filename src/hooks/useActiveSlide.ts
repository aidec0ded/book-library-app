import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Tracks which slide is most visible using scrollTop of the snap container.
 * Polls via rAF because scroll events don't fire reliably on snap containers.
 */
export function useActiveSlide(slideCount: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (slideCount === 0) return;

    let rafId: number;

    function poll() {
      const el = containerRef.current;
      if (el && el.clientHeight > 0) {
        const idx = Math.round(el.scrollTop / el.clientHeight);
        setActiveIndex(Math.max(0, Math.min(idx, slideCount - 1)));
      }
      rafId = requestAnimationFrame(poll);
    }

    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [slideCount]);

  const scrollToSlide = useCallback((index: number) => {
    const el = containerRef.current;
    if (el && el.clientHeight > 0) {
      el.scrollTo({ top: index * el.clientHeight, behavior: "smooth" });
    }
  }, []);

  return { activeIndex, containerRef, scrollToSlide } as const;
}
