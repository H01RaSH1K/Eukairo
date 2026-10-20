// iOS тянет всю страницу пальцем («резинка»), даже если прокручивать нечего, —
// и тогда лист не смахнуть вниз. Глушим такой жест: палец может прокручивать
// только то, что реально прокручивается, и только пока оно не упёрлось в край.
let lastX = 0;
let lastY = 0;

function scrollerFor(el: Element | null, vertical: boolean): HTMLElement | null {
  for (; el && el !== document.documentElement; el = el.parentElement) {
    const s = getComputedStyle(el);
    const ov = vertical ? s.overflowY : s.overflowX;
    if (ov !== 'auto' && ov !== 'scroll') continue;
    const h = el as HTMLElement;
    if (vertical ? h.scrollHeight > h.clientHeight + 1 : h.scrollWidth > h.clientWidth + 1) return h;
  }
  return null;
}

export function installNoBounce() {
  document.addEventListener('touchstart', (e) => {
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
  }, { passive: true });

  // passive: false — иначе preventDefault игнорируется.
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1 || e.defaultPrevented) return;
    const t = e.touches[0];
    const dx = t.clientX - lastX;
    const dy = t.clientY - lastY;
    lastX = t.clientX;
    lastY = t.clientY;
    const target = e.target as Element;
    if (target.closest('input[type=range]')) return;

    const vertical = Math.abs(dy) >= Math.abs(dx);
    const el = scrollerFor(target, vertical);
    if (!el) { e.preventDefault(); return; }
    // Упёрлись в край — дальше потянулась бы страница.
    const atStart = vertical ? el.scrollTop <= 0 : el.scrollLeft <= 0;
    const atEnd = vertical
      ? el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      : el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    const d = vertical ? dy : dx;
    if ((d > 0 && atStart) || (d < 0 && atEnd)) e.preventDefault();
  }, { passive: false });
}
