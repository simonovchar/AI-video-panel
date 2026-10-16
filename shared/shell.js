// Каркас панели в стиле Roadmap Control: название, значок и цвет из shared/panels.js
// (по <body data-panel="...">), мобильное меню, переключатель темы и статус сохранения.
(() => {
  const id = document.body.dataset.panel;
  const p = window.PANELS.find((x) => x.id === id);
  const $ = (sel) => document.querySelector(sel);

  document.title = `${p.title} — Личная панель`;
  document.documentElement.style.setProperty("--c", p.color);
  $("#brand").innerHTML = `
    <div class="brand-mark"><svg viewBox="0 0 24 24" aria-hidden="true">${p.icon}</svg></div>
    <div>
      <div class="brand-title">${p.title}</div>
      <div class="brand-sub">${p.subtitle}</div>
    </div>`;

  const sidebar = $("#sidebar");
  $("#menu-btn").addEventListener("click", () => sidebar.classList.toggle("open"));
  sidebar.addEventListener("click", (e) => { if (e.target.closest("a")) sidebar.classList.remove("open"); });
  $("#theme-btn").addEventListener("click", () => window.PanelTheme.toggle());

  window.Shell = {
    panel: p,
    // Колбэк для PanelStore.open: показывает «Сохранено» / ошибку в верхней полосе
    status(text, error) {
      const el = $("#save-status");
      el.textContent = text;
      el.classList.toggle("error", error);
    },
  };
})();
