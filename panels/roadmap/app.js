(() => {
  "use strict";

  const R = window.ROADMAP;
  const LS_PROGRESS = "roadmap-progress";
  const LS_UI = "roadmap-ui";
  const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ---------- Индексы ----------
  const itemIndex = new Map();
  for (const stage of R.stages) {
    for (const section of stage.sections) {
      for (const item of section.items) itemIndex.set(item.id, { item, section, stage });
    }
  }
  const stageById = new Map(R.stages.map((s) => [s.id, s]));
  const stageItems = (stage) => stage.sections.flatMap((s) => s.items);
  // Доп. блок (локальная генерация) идёт по желанию и не входит в общий прогресс программы
  const mainStages = R.stages.filter((s) => !s.extra);
  const mainItems = mainStages.flatMap(stageItems);
  const stagesOf = (b) => R.stages.filter((s) => Boolean(s.extra) === Boolean(b.extra) && s.num >= b.from && s.num <= b.to);
  const blockOf = (stage) => R.blocks.find((b) => stagesOf(b).includes(stage));
  const blockLabel = (b) => (b.extra ? "Доп. блок" : `Блок ${b.num}`);
  const stageLabel = (s) => (s.extra ? `Доп. этап ${s.num}` : `Этап ${s.num}`);
  const stageShort = (s) => (s.extra ? `Д${s.num}` : String(s.num));
  const allTaskItems = mainStages.flatMap((st) => st.sections.filter((s) => s.key === "tasks").flatMap((s) => s.items));

  // ---------- Даты ----------
  const pad = (n) => String(n).padStart(2, "0");
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const humanDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { year: t.getUTCFullYear(), week: Math.ceil(((t - yearStart) / 864e5 + 1) / 7) };
  }
  function periodKey(kind, d = new Date()) {
    if (kind === "daily") return `daily:${dateKey(d)}`;
    if (kind === "weekly") { const w = isoWeek(d); return `weekly:${w.year}-W${pad(w.week)}`; }
    return `monthly:${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  function periodLabel(kind, d = new Date()) {
    if (kind === "daily") return humanDate(d);
    if (kind === "weekly") {
      const monday = addDays(d, -(((d.getDay() + 6) % 7)));
      return `${humanDate(monday)} – ${humanDate(addDays(monday, 6))}`;
    }
    return `${MONTHS_NOM[d.getMonth()]} ${d.getFullYear()}`;
  }

  // ---------- Состояние ----------
  let state = { version: 1, items: {}, periodic: {}, notes: {} };
  let mode = "server";
  let ui = { hideChecked: false, collapsed: {} };
  let searchQuery = "";

  try { Object.assign(ui, JSON.parse(localStorage.getItem(LS_UI) || "{}")); } catch { /* приватный режим */ }
  const saveUi = () => { try { localStorage.setItem(LS_UI, JSON.stringify(ui)); } catch { /* ignore */ } };

  const normalize = (d) => ({
    version: 1,
    items: (d && d.items) || {},
    periodic: (d && d.periodic) || {},
    notes: (d && d.notes) || {},
  });

  async function load() {
    try {
      const r = await fetch("/api/store/progress", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      state = normalize(await r.json());
      setStatus("Сохранено в data/progress.json");
    } catch {
      mode = "local";
      try { state = normalize(JSON.parse(localStorage.getItem(LS_PROGRESS) || "{}")); } catch { /* ignore */ }
      const banner = $("#banner");
      banner.hidden = false;
      banner.innerHTML = "Сайт открыт как файл, без сервера — прогресс хранится только в этом браузере. " +
        "Чтобы сохранять его в файл <b>data/progress.json</b>, запустите сайт через <b>npm start</b> или F5 в VS Code.";
      setStatus("Локально в браузере");
    }
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    setStatus("Сохранение…");
    saveTimer = setTimeout(flush, 350);
  }
  async function flush() {
    saveTimer = null;
    try { localStorage.setItem(LS_PROGRESS, JSON.stringify(state)); } catch { /* ignore */ }
    if (mode === "local") return setStatus("Сохранено в браузере");
    try {
      const r = await fetch("/api/store/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
        keepalive: true,
      });
      if (!r.ok) throw new Error(r.status);
      setStatus("Сохранено в data/progress.json");
    } catch {
      setStatus("Ошибка сохранения — сервер запущен?", true);
    }
  }
  window.addEventListener("beforeunload", () => { if (saveTimer) flush(); });

  function setStatus(text, error = false) {
    const el = $("#save-status");
    el.textContent = text;
    el.classList.toggle("error", error);
  }

  // ---------- Прогресс ----------
  const isChecked = (id) => Boolean(state.items[id]);
  function setChecked(ids, value) {
    const now = new Date().toISOString();
    for (const id of ids) {
      if (value) { if (!state.items[id]) state.items[id] = now; }
      else delete state.items[id];
    }
    save();
    render();
  }
  function countDone(items) { let n = 0; for (const it of items) if (state.items[it.id]) n++; return n; }
  function stageStats(stage) {
    const items = stageItems(stage);
    const done = countDone(items);
    return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0, complete: items.length > 0 && done === items.length };
  }
  const stageClass = (st) => (st.complete ? "done" : st.done > 0 ? "partial" : "");
  const checkedOn = (key) => [...itemIndex.keys()].filter((id) => state.items[id] && dateKey(new Date(state.items[id])) === key);

  // ---------- Рендер: общие куски ----------
  function itemHtml(item, opts = {}) {
    const checked = isChecked(item.id);
    let text = esc(item.text);
    const i = item.text.indexOf(" — ");
    if (i > 0 && i < 90) text = `<b>${esc(item.text.slice(0, i))}</b> — ${esc(item.text.slice(i + 3))}`;
    const where = opts.where ? `<span class="where">${esc(opts.where)}</span>` : "";
    let when = "";
    if (checked && opts.showWhen) {
      const d = new Date(state.items[item.id]);
      when = `<span class="when">${d.getDate()}.${pad(d.getMonth() + 1)}</span>`;
    }
    const attr = opts.periodic ? `data-periodic="${opts.periodic}"` : "";
    const isOn = opts.periodic ? Boolean((state.periodic[opts.periodic] || {})[item.id]) : checked;
    return `<li class="item ${isOn ? "checked" : ""}" data-id="${item.id}" ${attr}>
      <input type="checkbox" class="check" ${isOn ? "checked" : ""} tabindex="-1">
      <span class="text">${text}${where}</span>${when}
    </li>`;
  }

  function bar(pct, done) {
    return `<div class="bar ${done ? "done" : ""}"><span style="width:${pct}%"></span></div>`;
  }

  function renderOverall() {
    const done = countDone(mainItems);
    const pct = Math.round((done / mainItems.length) * 100);
    const stagesDone = mainStages.filter((s) => stageStats(s).complete).length;
    $("#overall").innerHTML = `${bar(pct, pct === 100)}
      <span class="overall-text"><b>${pct}%</b> · этапов <b>${stagesDone}/${mainStages.length}</b></span>`;
  }

  function renderSidebar() {
    const route = currentRoute();
    const today = checkedOn(dateKey(new Date())).length;
    $("#nav").innerHTML = [
      ["#/", "Обзор", ""],
      ["#/today", "Сегодня", today ? String(today) : ""],
      ["#/routine", "Постоянные задания", ""],
      ["#/goal", "Цель и навыки", ""],
    ].map(([href, label, count]) =>
      `<a href="${href}" class="${route.name === href.slice(2) || (href === "#/" && route.name === "") ? "active" : ""}">${label}<span class="count">${count}</span></a>`
    ).join("");

    $("#stage-nav").innerHTML = R.blocks.map((b) => {
      const stages = stagesOf(b);
      const doneStages = stages.filter((s) => stageStats(s).complete).length;
      return `<div class="block-group ${b.extra ? "extra" : ""}">
        <div class="block-title"><span>${blockLabel(b)}. ${esc(b.title)}</span><span>${doneStages}/${stages.length}</span></div>
        ${stages.map((s) => {
          const st = stageStats(s);
          return `<a href="#/${s.id}" class="stage-link ${route.name === s.id ? "active" : ""}" title="${esc(s.title)}">
            <span class="num ${stageClass(st)}">${st.complete ? "✓" : stageShort(s)}</span>
            <span class="label">${esc(s.title)}</span>
            <span class="pct">${st.done ? st.pct + "%" : ""}</span>
          </a>`;
        }).join("")}
      </div>`;
    }).join("");
  }

  // ---------- Страницы ----------
  function pageOverview() {
    const total = mainItems.length;
    const done = countDone(mainItems);
    const stagesDone = mainStages.filter((s) => stageStats(s).complete).length;
    const tasksDone = countDone(allTaskItems);
    const today = checkedOn(dateKey(new Date())).length;
    const current = mainStages.find((s) => !stageStats(s).complete);

    let currentHtml = "";
    if (current) {
      const st = stageStats(current);
      currentHtml = `<div class="card current">
        <div class="info">
          <div class="eyebrow">Текущий этап · ${esc(current.term)}</div>
          <h2>${stageLabel(current)}. ${esc(current.title)}</h2>
          ${bar(st.pct)}
          <div class="muted" style="font-size:13px;margin-top:6px">${st.done} из ${st.total} пунктов</div>
        </div>
        <a class="btn primary" href="#/${current.id}">${st.done ? "Продолжить" : "Начать"} →</a>
      </div>`;
    } else {
      currentHtml = `<div class="card current"><div class="info"><h2>Все этапы пройдены 🎉</h2></div></div>`;
    }

    // Активность за 14 дней
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(addDays(new Date(), -i));
    const counts = new Map();
    for (const ts of Object.values(state.items)) {
      const k = dateKey(new Date(ts));
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const max = Math.max(1, ...days.map((d) => counts.get(dateKey(d)) || 0));
    const todayKey = dateKey(new Date());
    const bars = days.map((d) => {
      const k = dateKey(d);
      const n = counts.get(k) || 0;
      return `<a class="col ${k === todayKey ? "today" : ""}" href="#/today/${k}" title="${humanDate(d)}: ${n}">
        <span class="n">${n || ""}</span>
        <span class="b ${n ? "" : "zero"}" style="height:${n ? Math.max(6, (n / max) * 80) : 2}px"></span>
        <span class="d">${WEEKDAYS[d.getDay()]}<br>${d.getDate()}</span>
      </a>`;
    }).join("");

    return `
      <div class="eyebrow">${esc(R.subtitle)}</div>
      <h1>${esc(R.title.replace(/^ROADMAP:\s*/, ""))}</h1>
      <div class="stats">
        <div class="card stat"><div class="value">${stagesDone}<small> / ${mainStages.length}</small></div><div class="label">этапов пройдено</div></div>
        <div class="card stat"><div class="value">${tasksDone}<small> / ${allTaskItems.length}</small></div><div class="label">заданий выполнено</div></div>
        <div class="card stat"><div class="value">${done}<small> / ${total}</small></div><div class="label">всего пунктов отмечено</div></div>
        <div class="card stat"><div class="value">${today}</div><div class="label">отмечено сегодня</div></div>
      </div>
      ${currentHtml}
      <div class="card activity">
        <div class="eyebrow">Активность за 2 недели</div>
        <div class="activity-bars">${bars}</div>
      </div>
      <div class="section-title"><h2>Блоки программы</h2></div>
      <div class="blocks">
        ${R.blocks.map((b) => {
          const stages = stagesOf(b);
          const items = stages.flatMap(stageItems);
          const d = countDone(items);
          const pct = Math.round((d / items.length) * 100);
          return `<div class="card block ${b.extra ? "extra" : ""}">
            <div class="block-head">
              <div><div class="eyebrow">${blockLabel(b)} · ${esc(b.weeks)}</div><h3>${esc(b.title)}</h3></div>
              <div class="pct-big">${pct}%</div>
            </div>
            ${bar(pct, pct === 100)}
            <div class="chips">${stages.map((s) => {
              const st = stageStats(s);
              return `<a class="chip ${stageClass(st)}" href="#/${s.id}" title="${stageLabel(s)}. ${esc(s.title)} — ${st.pct}%">${stageShort(s)}</a>`;
            }).join("")}</div>
          </div>`;
        }).join("")}
      </div>`;
  }

  function pageStage(stage) {
    const st = stageStats(stage);
    const block = blockOf(stage);
    const idx = R.stages.indexOf(stage);
    const prev = R.stages[idx - 1];
    const next = R.stages[idx + 1];

    const sections = stage.sections.map((sec) => {
      const d = countDone(sec.items);
      const all = d === sec.items.length;
      const collapsed = ui.collapsed[sec.id];
      const visible = ui.hideChecked ? sec.items.filter((it) => !isChecked(it.id)) : sec.items;
      const body = visible.length
        ? `<ul class="items">${visible.map((it) => itemHtml(it, { showWhen: true })).join("")}</ul>`
        : `<div class="empty">Всё отмечено ✓</div>`;
      return `<section class="card sec ${collapsed ? "collapsed" : ""}">
        <div class="sec-head">
          <input type="checkbox" class="check" data-section="${sec.id}" ${all ? "checked" : ""} ${d && !all ? "data-indeterminate" : ""} title="Отметить весь раздел">
          <h2>${esc(sec.title)}</h2>
          <div class="bar mini ${all ? "done" : ""}"><span style="width:${(d / sec.items.length) * 100}%"></span></div>
          <span class="count">${d}/${sec.items.length}</span>
          <button class="collapse-btn" data-collapse="${sec.id}">${collapsed ? "Показать" : "Свернуть"}</button>
        </div>
        <div class="sec-body">${body}</div>
      </section>`;
    }).join("");

    return `
      <div class="stage-head">
        <div class="tags">
          <span class="tag">${blockLabel(block)}. ${esc(block.title)}</span>
          ${stage.extra ? `<span class="tag extra">По желанию · не входит в общий прогресс</span>` : ""}
          <span class="tag">${esc(stage.term)}</span>
          ${stage.isTool ? `<span class="tag tool">Инструменты</span>` : ""}
          ${st.complete ? `<span class="tag done">Этап пройден</span>` : ""}
        </div>
        <h1>${stageLabel(stage)}. ${esc(stage.title)}</h1>
        <div class="stage-progress">
          ${bar(st.pct, st.complete)}
          <span class="txt">${st.done} из ${st.total} · ${st.pct}%</span>
          <button class="btn ${st.complete ? "done" : "primary"}" data-stage-toggle="${stage.id}">
            ${st.complete ? "✓ Этап пройден" : "Отметить этап пройденным"}
          </button>
        </div>
      </div>
      ${stage.notes.map((n) => `<div class="note">${esc(n)}</div>`).join("")}
      <div class="toolbar">
        <label class="toggle"><input type="checkbox" class="check" id="hide-checked" ${ui.hideChecked ? "checked" : ""}> Скрыть отмеченные</label>
      </div>
      <div class="sections">${sections}</div>
      <div class="card notes-box">
        <div class="eyebrow">Мои заметки по этапу</div>
        <textarea id="stage-notes" data-stage="${stage.id}" placeholder="Ссылки на работы, выводы, что получилось и что нет…">${esc(state.notes[stage.id] || "")}</textarea>
      </div>
      <div class="pager">
        ${prev ? `<a href="#/${prev.id}"><span class="btn">← ${stageShort(prev)}. ${esc(prev.title)}</span></a>` : "<span></span>"}
        ${next ? `<a href="#/${next.id}"><span class="btn">${stageShort(next)}. ${esc(next.title)} →</span></a>` : "<span></span>"}
      </div>`;
  }

  function pageToday(key) {
    const d = parseKey(key);
    const isToday = key === dateKey(new Date());
    const ids = checkedOn(key);
    const byStage = new Map();
    for (const id of ids) {
      const { stage } = itemIndex.get(id);
      if (!byStage.has(stage.id)) byStage.set(stage.id, []);
      byStage.get(stage.id).push(itemIndex.get(id));
    }

    const list = ids.length
      ? [...byStage.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sid, entries]) => {
          const stage = stageById.get(sid);
          return `<div class="group-title"><a href="#/${sid}">${stageLabel(stage)}. ${esc(stage.title)}</a></div>
            <ul class="items">${entries.map((e) => itemHtml(e.item, { where: e.section.title })).join("")}</ul>`;
        }).join("")
      : `<div class="empty">${isToday ? "Сегодня пока ничего не отмечено. Откройте текущий этап и отметьте, что сделали." : "В этот день ничего не отмечено."}</div>`;

    const daily = R.periodic.find((p) => p.key === "daily");
    const dailyKey = periodKey("daily", d);

    return `
      <div class="eyebrow">${isToday ? "Сегодня" : WEEKDAYS[d.getDay()]}</div>
      <h1>${humanDate(d)} ${d.getFullYear()}</h1>
      <div class="day-nav">
        <a class="btn" href="#/today/${dateKey(addDays(d, -1))}">← Предыдущий день</a>
        ${isToday ? "" : `<a class="btn" href="#/today/${dateKey(addDays(d, 1))}">Следующий день →</a><a class="btn ghost" href="#/today">К сегодняшнему дню</a>`}
        <span class="muted">Отмечено пунктов: <b>${ids.length}</b></span>
      </div>
      <div class="sections">
        <section class="card sec"><div class="sec-head"><h2>Пройдено за день</h2><span class="count">${ids.length}</span></div><div class="sec-body">${list}</div></section>
        ${daily ? `<section class="card sec"><div class="sec-head"><h2>Ежедневная практика</h2><span class="count">${countPeriodic(daily, dailyKey)}/${daily.items.length}</span></div>
          <div class="sec-body"><ul class="items">${daily.items.map((it) => itemHtml(it, { periodic: dailyKey })).join("")}</ul></div></section>` : ""}
      </div>`;
  }

  const countPeriodic = (sec, key) => sec.items.filter((it) => (state.periodic[key] || {})[it.id]).length;

  function dailyStreak() {
    const daily = R.periodic.find((p) => p.key === "daily");
    if (!daily) return 0;
    const full = (d) => countPeriodic(daily, periodKey("daily", d)) === daily.items.length;
    let d = new Date();
    if (!full(d)) d = addDays(d, -1);
    let n = 0;
    while (full(d)) { n++; d = addDays(d, -1); }
    return n;
  }

  function pageRoutine() {
    const streak = dailyStreak();
    return `
      <div class="eyebrow">Отметки сбрасываются автоматически в начале нового дня, недели и месяца</div>
      <h1>Постоянные задания</h1>
      <p class="muted">${streak ? `<span class="streak">Серия: ${streak} ${plural(streak, "день", "дня", "дней")} подряд со всей ежедневной практикой</span>` : "Выполните все ежедневные пункты, чтобы начать серию."}</p>
      <div class="routine-grid">
        ${R.periodic.map((p) => {
          const key = periodKey(p.key);
          const d = countPeriodic(p, key);
          return `<section class="card sec">
            <div class="sec-head"><div style="flex:1"><h2>${esc(p.title)}</h2><div class="muted" style="font-size:12px">${periodLabel(p.key)}</div></div><span class="count">${d}/${p.items.length}</span></div>
            <div class="sec-body"><ul class="items">${p.items.map((it) => itemHtml(it, { periodic: key })).join("")}</ul></div>
          </section>`;
        }).join("")}
      </div>`;
  }

  function pageGoal() {
    return `
      <h1>Цель и навыки</h1>
      <p class="muted">${R.intro.map(esc).join("<br>")}</p>
      <div class="card goal"><div class="eyebrow">Финальная цель</div>${R.goal.map((g) => `<p>${esc(g)}</p>`).join("")}</div>
      <div class="card goal"><div class="eyebrow">Итоговые навыки</div><ol class="list-plain">${R.skills.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>
      <div class="card goal"><div class="eyebrow">Рекомендуемый режим обучения</div><ul class="list-plain">${R.regimen.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>`;
  }

  function pageSearch(q) {
    const needle = q.toLowerCase();
    const hits = [...itemIndex.values()].filter((e) => e.item.text.toLowerCase().includes(needle)).slice(0, 300);
    return `
      <div class="eyebrow">Поиск</div>
      <h1>«${esc(q)}»</h1>
      <p class="muted">Найдено: ${hits.length}${hits.length === 300 ? "+" : ""}</p>
      <section class="card sec"><div class="sec-body">${hits.length
        ? `<ul class="items">${hits.map((e) => itemHtml(e.item, { where: `${stageLabel(e.stage)}. ${e.stage.title} · ${e.section.title}` })).join("")}</ul>`
        : `<div class="empty">Ничего не найдено</div>`}</div></section>`;
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // ---------- Роутинг ----------
  function currentRoute() {
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    return { name: parts[0] || "", arg: parts[1] || "" };
  }

  let lastRouteKey = "";
  function render() {
    const route = currentRoute();
    const main = $("#main");
    let html;
    if (searchQuery) html = pageSearch(searchQuery);
    else if (route.name === "today") html = pageToday(route.arg || dateKey(new Date()));
    else if (route.name === "routine") html = pageRoutine();
    else if (route.name === "goal") html = pageGoal();
    else if (stageById.has(route.name)) html = pageStage(stageById.get(route.name));
    else html = pageOverview();

    // Не перерисовываем textarea, пока в неё печатают
    const focusedNotes = document.activeElement && document.activeElement.id === "stage-notes";
    const scroll = window.scrollY;
    main.innerHTML = html;
    main.querySelectorAll("[data-indeterminate]").forEach((el) => (el.indeterminate = true));
    if (focusedNotes) { const t = $("#stage-notes"); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }

    const routeKey = searchQuery ? "search" : location.hash;
    if (routeKey !== lastRouteKey) window.scrollTo(0, 0);
    else window.scrollTo(0, scroll);
    lastRouteKey = routeKey;

    renderSidebar();
    renderOverall();
  }

  // ---------- События ----------
  document.addEventListener("click", (e) => {
    const sectionBox = e.target.closest("[data-section]");
    if (sectionBox) {
      const sec = R.stages.flatMap((s) => s.sections).find((s) => s.id === sectionBox.dataset.section);
      const all = countDone(sec.items) === sec.items.length;
      setChecked(sec.items.map((it) => it.id), !all);
      return;
    }

    const collapse = e.target.closest("[data-collapse]");
    if (collapse) {
      const id = collapse.dataset.collapse;
      ui.collapsed[id] = !ui.collapsed[id];
      saveUi();
      render();
      return;
    }

    const stageToggle = e.target.closest("[data-stage-toggle]");
    if (stageToggle) {
      const stage = stageById.get(stageToggle.dataset.stageToggle);
      const st = stageStats(stage);
      if (st.complete) {
        if (!confirm(`Снять все отметки: ${stageLabel(stage)}?`)) return;
        setChecked(stageItems(stage).map((it) => it.id), false);
      } else {
        setChecked(stageItems(stage).map((it) => it.id), true);
      }
      return;
    }

    const item = e.target.closest(".item");
    if (item) {
      e.preventDefault();
      const id = item.dataset.id;
      const pk = item.dataset.periodic;
      if (pk) {
        const bucket = state.periodic[pk] || (state.periodic[pk] = {});
        if (bucket[id]) delete bucket[id]; else bucket[id] = new Date().toISOString();
        if (!Object.keys(bucket).length) delete state.periodic[pk];
        save();
        render();
      } else {
        setChecked([id], !isChecked(id));
      }
      return;
    }

    if (e.target.closest(".stage-link, .nav a")) {
      $("#sidebar").classList.remove("open");
      if (searchQuery) { searchQuery = ""; $("#search").value = ""; }
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "hide-checked") {
      ui.hideChecked = e.target.checked;
      saveUi();
      render();
    }
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "stage-notes") {
      const v = e.target.value;
      if (v) state.notes[e.target.dataset.stage] = v; else delete state.notes[e.target.dataset.stage];
      save();
    }
    if (e.target.id === "search") {
      searchQuery = e.target.value.trim();
      render();
    }
  });

  window.addEventListener("hashchange", () => {
    if (searchQuery) { searchQuery = ""; $("#search").value = ""; }
    render();
  });

  $("#menu-btn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

  // Тема общая для всех панелей — shared/theme.js
  $("#theme-btn").addEventListener("click", () => window.PanelTheme.toggle());

  // Экспорт / импорт
  $("#export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `roadmap-progress-${dateKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#import-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = normalize(JSON.parse(await file.text()));
      if (!confirm(`Заменить текущий прогресс данными из файла (${Object.keys(data.items).length} отмеченных пунктов)?`)) return;
      state = data;
      save();
      render();
    } catch {
      alert("Не удалось прочитать файл — это должен быть JSON, сохранённый кнопкой «Экспорт».");
    } finally {
      e.target.value = "";
    }
  });

  load().then(render);
})();
