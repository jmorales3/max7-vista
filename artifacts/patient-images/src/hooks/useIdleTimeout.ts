import { useEffect, useRef, useState, useCallback } from "react";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "scroll", "touchstart"] as const;

export function useIdleTimeout(idleMs: number, warningMs: number) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(warningMs / 1000));
  const lastActivityRef = useRef(Date.now());
  const warningStartRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    lastActivityRef.current = Date.now();
    warningStartRef.current = null;
    setShowWarning(false);
    setSecondsLeft(Math.ceil(warningMs / 1000));
  }, [warningMs]);

  useEffect(() => {
    const handleActivity = () => {
      // Once warning is active, ignore ambient events — only the explicit
      // "Stay signed in" button (reset()) is allowed to cancel the countdown.
      if (warningStartRef.current !== null) return;
      lastActivityRef.current = Date.now();
    };

    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, handleActivity, { passive: true })
    );

    const interval = setInterval(() => {
      const now = Date.now();
      const idle = now - lastActivityRef.current;

      if (idle >= idleMs) {
        if (warningStartRef.current === null) {
          warningStartRef.current = now;
          setShowWarning(true);
          setSecondsLeft(Math.ceil(warningMs / 1000));
        } else {
          const elapsed = now - warningStartRef.current;
          const remaining = Math.ceil((warningMs - elapsed) / 1000);
          setSecondsLeft(Math.max(0, remaining));
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, handleActivity));
    };
  }, [idleMs, warningMs]);

  return { showWarning, secondsLeft, reset };
}
