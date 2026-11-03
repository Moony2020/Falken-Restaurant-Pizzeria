"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function ScrollObserver() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Respect users who prefer reduced motion
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      document.querySelectorAll("[data-reveal]").forEach((el) => {
        el.classList.add("is-revealed");
      });
      return;
    }

    let observer: IntersectionObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const observeElements = () => {
      const elements = document.querySelectorAll<HTMLElement>(
        "[data-reveal]:not(.is-revealed)",
      );
      if (!elements.length) return;

      if (!("IntersectionObserver" in window)) {
        elements.forEach((el) => el.classList.add("is-revealed"));
        return;
      }

      if (!observer) {
        observer = new IntersectionObserver(
          (entries, obs) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                const target = entry.target as HTMLElement;
                target.classList.add("is-revealed");
                obs.unobserve(target);
              }
            });
          },
          {
            root: null,
            rootMargin: "0px 0px -40px 0px",
            threshold: 0.08,
          },
        );
      }

      elements.forEach((el) => {
        observer?.observe(el);
      });
    };

    // Defer enabling reveal transitions until after React initial hydration is completely settled
    const timer = setTimeout(() => {
      document.documentElement.classList.add("js-reveal");
      observeElements();

      mutationObserver = new MutationObserver(() => {
        observeElements();
      });

      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }, 250);

    return () => {
      clearTimeout(timer);
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
      if (observer) {
        observer.disconnect();
      }
    };
  }, [pathname]);

  return null;
}
