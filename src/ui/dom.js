// Tiny DOM helpers.
export function h(tag, attrs = {}, ...kids) {
  const [t, ...cls] = tag.split('.');
  const el = document.createElement(t || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export function keyName(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', ' L').replace('Right', ' R').replace('Control', 'Ctrl').replace('Space', 'Space').replace('Arrow', '');
}

// Line icons (stroke-only SVG) for the hotbar.
const P = {
  shovel: '<path d="M6 26l6-6M10 22l-4-4 3-3 4 4M13 19L26 6M24 4l4 4"/>',
  revolver: '<path d="M4 12h20v5H12l-2 9H5l2-9H4zM24 13h4M14 17v3"/>',
  shotgun: '<path d="M3 15h26M3 18h18l-3 6H6l-3-6zM20 15v3"/>',
  can: '<path d="M8 12h12v14H8zM20 15l8-6M10 12c0-5 8-5 8 0"/>',
  seeds: '<path d="M10 8c-4 4-4 16 6 18 10-2 10-14 6-18zM12 8h8M14 6h4"/>',
  hammer: '<path d="M8 6h10l2 4H8zM14 10v18"/>',
  flare: '<path d="M14 10h4v18h-4zM14 10l2-5 2 5M16 3v1"/>',
  medkit: '<path d="M5 9h22v16H5zM12 9V6h8v3M16 13v8M12 17h8"/>',
  fertilizer: '<path d="M8 6h16v20H8zM8 12h16M13 17l3 3 3-3"/>',
};
export function icon(id) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 32 32');
  s.innerHTML = P[id] || '';
  return s;
}
