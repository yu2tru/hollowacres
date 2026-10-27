export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const distSq2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const angleTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);
export function moveTowardsAngle(cur, target, maxStep) {
  const d = wrapAngle(target - cur);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}
export function pointInRect(x, z, r) {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}
export function fmtMoney(v) {
  const s = Math.round(v).toLocaleString('en-US');
  return (v < 0 ? '-$' + s.slice(1) : '$' + s);
}
export function fmtTime(minutes) {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}
