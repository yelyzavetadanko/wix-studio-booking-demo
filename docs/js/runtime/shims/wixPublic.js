const handlers = new WeakMap();

function wrapElement(el) {
  if (!el || el.nodeType !== 1) return null;

  return {
    get style() {
      return el.style;
    },
    set height(v) {
      el.style.minHeight = `${Math.max(0, Number(v) || 0)}px`;
    },
    on(eventName, handler) {
      if (typeof handler !== 'function') return;
      const wrapped = (evt) => handler({ detail: evt.detail });
      if (!handlers.has(el)) handlers.set(el, new Map());
      handlers.get(el).set(eventName, wrapped);
      el.addEventListener(eventName, wrapped);
    },
    off(eventName) {
      const map = handlers.get(el);
      const wrapped = map?.get(eventName);
      if (wrapped) el.removeEventListener(eventName, wrapped);
    },
    setAttribute(k, v) {
      el.setAttribute(k, v);
    },
    getAttribute(k) {
      return el.getAttribute(k);
    },
  };
}

export function $w(selector) {
  const sel = String(selector || '').trim();
  const el = document.querySelector(sel.startsWith('#') ? sel : `#${sel.replace(/^#/, '')}`);
  return wrapElement(el);
}

$w.onReady = (fn) => {
  if (typeof fn !== 'function') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
};

export { $w as default };
