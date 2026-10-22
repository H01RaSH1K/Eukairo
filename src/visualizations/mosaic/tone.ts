// Оттенок отдельного стекла: как в настоящем витраже, стёкла одного цвета
// из разных листов чуть отличаются — светлее/темнее, теплее/холоднее, ярче/глуше.
// Сдвиги делаем в OKLCH (яркость, насыщенность, тон в «как видит глаз»): тогда
// светлее не значит «разбавить белым», а темнее — не «грязнее».
// Чистые функции, без React.

type Rgb = [number, number, number]; // 0…1

/** Сдвиг стекла по номеру: постоянный для номера, −1…1 по каждой оси. */
export function jitter(cell: number): [number, number, number] {
  const h = (k: number) => ((((cell + 1) * 2654435761) ^ (k * 40503)) >>> 0) % 1000 / 1000 * 2 - 1;
  return [h(1), h(2), h(3)];
}

/**
 * Цвет стекла номер `cell`: яркость ±`amount`·0.06, тон ±`amount`·8°, насыщенность ±`amount`·12%.
 * Понимает `#rgb`, `#rrggbb` и `hsl(h s% l%)`; другой формат возвращает как есть.
 */
export function tone(color: string, cell: number, amount = 1): string {
  const rgb = parse(color);
  if (!rgb) return color;
  const [dl, dh, dc] = jitter(cell);
  const [l, c, h] = toOklch(rgb);
  return toHex(fromOklch([
    Math.min(0.97, Math.max(0.05, l + dl * 0.06 * amount)),
    Math.max(0, c * (1 + dc * 0.12 * amount)),
    h + dh * 8 * amount,
  ]));
}

function parse(s: string): Rgb | null {
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const x = m[1].length === 3 ? m[1].split('').map((d) => d + d).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255) as Rgb;
  }
  m = s.match(/^hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)$/i);
  if (m) {
    const h = Number(m[1]), sat = Number(m[2]) / 100, l = Number(m[3]) / 100;
    const a = sat * Math.min(l, 1 - l);
    const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0), f(8), f(4)];
  }
  return null;
}

// sRGB ↔ линейный свет (гамма).
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function toOklch([r, g, b]: Rgb): [number, number, number] {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, Bb), (Math.atan2(Bb, A) * 180) / Math.PI];
}

function fromOklch([L, C, H]: [number, number, number]): Rgb {
  const A = C * Math.cos((H * Math.PI) / 180), B = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, gam(v)))) as Rgb;
}

const toHex = (rgb: Rgb) => '#' + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
