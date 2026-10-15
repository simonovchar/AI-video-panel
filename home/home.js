(() => {
  "use strict";

  const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  // ---------- Приветствие ----------
  const now = new Date();
  const h = now.getHours();
  $("#greeting").textContent = h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
  $("#today").textContent = `${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;

  // ---------- Плитки ----------
  const icon = (p) => `<div class="panel-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${p.icon}</svg></div>`;

  $("#tiles").innerHTML = window.PANELS.map((p) => `
    <a class="card tile" href="/${p.id}/" style="--c:${p.color}" data-panel="${p.id}">
      <div class="tile-head">
        ${icon(p)}
        <span class="tile-arrow" aria-hidden="true">→</span>
      </div>
      <div class="tile-title">${esc(p.title)}</div>
      <div class="tile-sub">${esc(p.subtitle)}</div>
      <div class="tile-body" data-summary>
        <p class="tile-desc">${esc(p.description)}</p>
      </div>
    </a>`).join("");

  // ---------- Сводки панелей на плитках ----------
  const summaries = {
    async roadmap() {
      const [progress] = await Promise.all([
        fetch("/api/store/progress", { cache: "no-store" }).then((r) => r.json()),
        loadScript("/roadmap/roadmap.js"),
      ]);
      const checked = progress.items || {};
      const stages = window.ROADMAP.stages.filter((s) => !s.extra);
      const items = stages.flatMap((s) => s.sections.flatMap((sec) => sec.items));
      const done = items.filter((it) => checked[it.id]).length;
      const pct = Math.round((done / items.length) * 100);
      const stageDone = (s) => s.sections.every((sec) => sec.items.every((it) => checked[it.id]));
      const current = stages.find((s) => !stageDone(s));
      const today = Object.values(checked).filter((ts) => sameDay(new Date(ts), now)).length;
      return `
        <div class="tile-stat"><b>${pct}%</b><span>программы пройдено</span></div>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <div class="tile-meta">
          <span>${current ? `Сейчас: этап ${current.num}. ${esc(current.title)}` : "Все этапы пройдены"}</span>
          <span>Сегодня отмечено: <b>${today}</b></span>
        </div>`;
    },
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
  }

  for (const [id, fn] of Object.entries(summaries)) {
    const el = document.querySelector(`[data-panel="${id}"] [data-summary]`);
    fn().then((html) => { el.innerHTML = html; }).catch(() => { /* оставляем описание */ });
  }

  $("#theme-btn").addEventListener("click", () => window.PanelTheme.toggle());
})();
