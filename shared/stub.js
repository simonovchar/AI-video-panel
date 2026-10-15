// Оболочка ещё не наполненной панели: заголовок, иконка и цвет берутся из shared/panels.js.
(() => {
  const id = document.body.dataset.panel;
  const p = window.PANELS.find((x) => x.id === id);
  document.title = `${p.title} — Личная панель`;
  document.documentElement.style.setProperty("--c", p.color);
  document.querySelector("#panel-head").innerHTML = `
    <div class="panel-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${p.icon}</svg></div>
    <div>
      <div class="eyebrow">${p.subtitle}</div>
      <h1>${p.title}</h1>
    </div>`;
  document.querySelector("#theme-btn").addEventListener("click", () => window.PanelTheme.toggle());
})();
