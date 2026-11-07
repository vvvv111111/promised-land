"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { ViewBounds } from "@/room/rendering/objectFocus";

/** Report layout explicitly; no selectors or content-based room event coupling. */
export function useDialogBounds(ref: RefObject<HTMLDialogElement | null>, open: boolean, onBounds?: (bounds: ViewBounds | null) => void) {
  const callback = useRef(onBounds); callback.current = onBounds;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open || !callback.current) return;
    const report = () => {
      if (!dialog.open) return;
      const { x, y, width, height } = dialog.getBoundingClientRect();
      callback.current?.({ x, y, width, height });
    };
    const observer = new ResizeObserver(report); observer.observe(dialog);
    window.addEventListener("resize", report); window.addEventListener("scroll", report, true);
    report();
    return () => {
      observer.disconnect(); window.removeEventListener("resize", report); window.removeEventListener("scroll", report, true);
      callback.current?.(null);
    };
  }, [ref, open]);
}
