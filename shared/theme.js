// Общая тема (светлая / тёмная / как в системе) для главного экрана и всех панелей.
// Подключается в <head>, чтобы тема применилась до отрисовки страницы.
(() => {
  const KEY = "panel-theme";
  let theme = "";
  try {
    theme = localStorage.getItem(KEY) || "";
    // Перенос настройки из первой версии Roadmap Control
    if (!theme) theme = JSON.parse(localStorage.getItem("roadmap-ui") || "{}").theme || "";
  } catch { /* приватный режим */ }

  const apply = () => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  };
  apply();

  window.PanelTheme = {
    toggle() {
      const dark = theme ? theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      theme = dark ? "light" : "dark";
      try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
      apply();
    },
  };
})();
