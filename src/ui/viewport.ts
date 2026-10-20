// iOS, приложение с экрана «Домой»: окно (window.innerHeight, а с ним height: 100%
// и position: fixed; bottom: 0) иногда короче физического экрана, и снизу остаётся
// пустая полоса. Меряем недостачу и отдаём в CSS как --vp-gap: корень на столько
// выше, а прибитое к низу (таб-бар, листы, фокус) — на столько ниже.

export function viewportGap(): number {
  // navigator.standalone есть только в Safari, поэтому в типах его нет — отсюда any
  const standalone = (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches;
  const portrait = window.innerHeight > window.innerWidth;
  if (!standalone || !portrait) return 0;
  const gap = screen.height - window.innerHeight;
  return gap > 0 && gap < 150 ? gap : 0; // больше — это не наш баг, а что-то другое
}

function apply() {
  document.documentElement.style.setProperty('--vp-gap', `${viewportGap()}px`);
}

apply();
window.addEventListener('resize', apply);
window.addEventListener('orientationchange', apply);
