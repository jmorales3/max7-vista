let _forceLogout: (() => void) | null = null;

export function registerForceLogout(fn: () => void) {
  _forceLogout = fn;
}

export function triggerForceLogout() {
  _forceLogout?.();
}

let _suspended: (() => void) | null = null;

export function registerSuspended(fn: () => void) {
  _suspended = fn;
}

export function triggerSuspended() {
  _suspended?.();
}
