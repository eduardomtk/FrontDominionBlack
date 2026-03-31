let zoomActiveUntil = 0;
let idleTimer = 0;
const listeners = new Set();

function emit(active) {
  for (const cb of listeners) {
    try { cb(active); } catch {}
  }
}

export function isZoomInteractionActive() {
  return Date.now() < zoomActiveUntil;
}

export function markZoomInteractionActive(idleMs = 180) {
  const ms = Number.isFinite(Number(idleMs)) ? Math.max(60, Number(idleMs)) : 180;
  const wasActive = isZoomInteractionActive();
  zoomActiveUntil = Date.now() + ms;

  if (!wasActive) emit(true);

  if (idleTimer) {
    try { clearTimeout(idleTimer); } catch {}
    idleTimer = 0;
  }

  idleTimer = setTimeout(() => {
    idleTimer = 0;
    zoomActiveUntil = 0;
    emit(false);
  }, ms + 10);
}

export function subscribeZoomInteraction(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
