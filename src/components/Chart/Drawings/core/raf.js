export function createRAFLoop(onFrame) {
  let rafId = 0;
  let running = false;

  const loop = () => {
    if (!running) return;
    onFrame?.();
    rafId = requestAnimationFrame(loop);
  };

  return {
    start() {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    },
  };
}
