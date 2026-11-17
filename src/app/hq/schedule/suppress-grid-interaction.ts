/** Briefly block pointer/click delivery after a modal closes so the same gesture cannot hit the timeline underneath. */
const DEFAULT_MS = 350;
let until = 0;
let teardown: (() => void) | null = null;

function stop(event: Event) {
  if (Date.now() >= until) return;
  event.preventDefault();
  event.stopPropagation();
  if (typeof (event as {stopImmediatePropagation?: () => void}).stopImmediatePropagation === 'function') {
    (event as {stopImmediatePropagation: () => void}).stopImmediatePropagation();
  }
}

export function suppressGridInteraction(ms = DEFAULT_MS): void {
  if (typeof document === 'undefined') return;
  until = Date.now() + ms;
  if (!teardown) {
    const opts: AddEventListenerOptions = {capture: true, passive: false};
    const types = ['pointerdown', 'pointerup', 'click', 'mousedown', 'mouseup', 'touchstart', 'touchend'] as const;
    for (const type of types) document.addEventListener(type, stop, opts);
    teardown = () => {
      for (const type of types) document.removeEventListener(type, stop, opts);
      teardown = null;
    };
  }
  window.setTimeout(() => {
    if (Date.now() >= until && teardown) teardown();
  }, ms + 50);
}
