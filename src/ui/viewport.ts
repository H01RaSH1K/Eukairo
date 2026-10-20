// Для проверки на телефоне («Ещё», внизу): на сколько окно короче экрана.
// В iOS 26 у приложения с «Домой» бывает недостача на высоту строки состояния —
// лечится в CSS (theme.css, display-mode: standalone), здесь только замер.
export function viewportGap(): number {
  const portrait = window.innerHeight > window.innerWidth;
  return portrait ? Math.max(0, screen.height - window.innerHeight) : 0;
}
