let _forceLogout: (() => void) | null = null;

export function registerForceLogout(fn: () => void) {
  _forceLogout = fn;
}

export function triggerForceLogout() {
  _forceLogout?.();
}
