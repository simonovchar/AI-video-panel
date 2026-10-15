// Шапка панели: иконка, цвет и название берутся из shared/panels.js по <body data-panel="...">.
(() => {
  const id = document.body.dataset.panel;
  const p = window.PANELS.find((x) => x.id === id);
  document.title = `${p.title} — Личная панель`;
  document.documentElement.style.setProperty("--c", p.color);
  document.querySelector("#panel-head").insertAdjacentHTML("afterbegin", `
    <div class="panel-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${p.icon}</svg></div>
    <div class="panel-title">
      <div class="eyebrow">${p.subtitle}</div>
      <h1>${p.title}</h1>
    </div>`);
  document.querySelector("#theme-btn").addEventListener("click", () => window.PanelTheme.toggle());
})();
