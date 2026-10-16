(async () => {
  "use strict";

  const S = window.SCHEDULE_DEFAULT;
  const CAT = S.CATEGORIES;
  const { esc, uid, pad, dateKey, toDate, addDays, formDialog, confirmDialog, MONTHS } = window.U;
  const $ = (sel) => document.querySelector(sel);
  const WD_SHORT = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const WD_FULL = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
  const HOUR = 48; // px на час
  const SNAP = 15; // шаг перетаскивания, мин

  // templates.main — основной режим (стоит на каждой неделе), templates.bad — плохой (для сравнения).
  // days[YYYY-MM-DD] — дни, которые вы поменяли вручную; остальные дни берутся из основного шаблона.
  const store = await PanelStore.open("schedule", { version: 1, templates: null, days: {} }, Shell.status);
  const D = store.data;
  if (!D.templates) { D.templates = structuredClone(S.templates); store.save(); }

  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
  let showPanels = ls("cal-panels") !== "0";
  let view = ls("cal-view") || (innerWidth <= 800 ? "day" : "week");
  let anchor = dateKey();
  let lastScrollKey = "";

  // ---------- Время ----------
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const fromMin = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  const startMin = (b) => toMin(b.start);
  const endMin = (b) => { const s = toMin(b.start); const e = toMin(b.end); return e <= s ? 1440 : e; };
  const dur = (b) => endMin(b) - startMin(b);
  const hm = (m) => `${Math.floor(m / 60)}:${pad(m % 60)}`;
  const isoWd = (key) => ((toDate(key).getDay() + 6) % 7) + 1;
  const weekStart = (key) => addDays(key, 1 - isoWd(key));
  const snap = (m) => Math.round(m / SNAP) * SNAP;
  const sortBlocks = (list) => list.sort((a, b) => startMin(a) - startMin(b));
  const catOf = (b) => CAT[b.category] || CAT.other;

  // ---------- Данные дней ----------
  const dayBlocks = (key) => D.days[key]?.blocks || D.templates.main[isoWd(key)];
  function materialize(key) {
    if (!D.days[key]) D.days[key] = { blocks: structuredClone(D.templates.main[isoWd(key)]) };
    return D.days[key].blocks;
  }
  // Минуты категории за день; пересекающиеся блоки (задача внутри «Работы») не считаются дважды
  function sumBy(blocks, cat) {
    const spans = blocks.filter((b) => b.category === cat).map((b) => [startMin(b), endMin(b)]).sort((x, y) => x[0] - y[0]);
    let total = 0, curS = -1, curE = -1;
    for (const [s, e] of spans) {
      if (s > curE) { total += curE - curS; curS = s; curE = e; } else curE = Math.max(curE, e);
    }
    return total + (curE - curS);
  }

  // ---------- Маршрут ----------
  function route() {
    const [, name = "", arg = ""] = location.hash.match(/^#\/([^/]*)\/?(.*)$/) || [];
    if (name === "template") return { name, variant: arg === "bad" ? "bad" : "main" };
    if (name === "compare" || name === "panels") return { name };
    return { name: "" };
  }

  // Колонки календаря: дни недели с датами или дни шаблона
  function columns() {
    const r = route();
    if (r.name === "template") {
      return [1, 2, 3, 4, 5, 6, 7].map((wd) => ({
        key: `t${wd}`, wd, label: WD_SHORT[wd], blocks: () => D.templates[r.variant][wd], mutable: () => D.templates[r.variant][wd],
      }));
    }
    const keys = view === "day" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i));
    return keys.map((key) => ({
      key, date: key, wd: isoWd(key), label: WD_SHORT[isoWd(key)],
      blocks: () => dayBlocks(key), mutable: () => materialize(key),
    }));
  }
  const colByKey = (key) => columns().find((c) => c.key === key);

  // ---------- События панелей (только чтение) ----------
  let ext = { timed: new Map(), allday: new Map() };
  async function loadExternal() {
    const get = (k) => fetch(`/api/store/${k}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    const [tut, hea, nav, rig, uni] = await Promise.all(["tutoring", "health", "navigator", "rights", "university"].map(get));
    const color = (id) => window.PANELS.find((p) => p.id === id).color;
    const timed = new Map(), allday = new Map();
    const push = (map, key, item) => { if (!map.has(key)) map.set(key, []); map.get(key).push(item); };
    const addTimed = (date, time, minutes, item) => {
      const s = toMin(time);
      push(timed, date, { ...item, s, e: Math.min(1440, s + (Number(minutes) || 60)) });
    };
    for (const l of tut.lessons || []) {
      const subj = (tut.subjects || []).find((s) => s.id === l.subjectId);
      const school = subj && (tut.schools || []).find((s) => s.id === subj.schoolId);
      if (!subj) continue;
      addTimed(l.date, l.time, l.duration, { title: subj.name, sub: school?.name, color: color("tutoring"), href: `/tutoring/#/subject/${subj.id}`, done: l.conducted });
    }
    for (const v of hea.visits || []) {
      const t = v.kind === "doctor" ? (hea.doctors || []).find((d) => d.id === v.refId) : (hea.tests || []).find((x) => x.id === v.refId);
      if (!t) continue;
      const title = v.kind === "doctor" ? t.specialty || t.name : `Анализ: ${t.name}`;
      addTimed(v.date, v.time, 30, { title, sub: "Здоровье", color: color("health"), href: `/health/#/clinic/${t.clinicId}/visits`, done: v.done });
    }
    for (const c of nav.calls || []) addTimed(c.date, c.time, c.duration, { title: c.title, sub: "Созвон", color: color("navigator"), href: "/navigator/#/", done: c.held });
    for (const l of rig.lessons || []) addTimed(l.date, l.time, l.duration, { title: l.topic || "Урок вождения", sub: "Права", color: color("rights"), href: "/rights/#/practice", done: l.done });
    // Сверху дня: «Сделать» — день выполнения, «Дедлайн» / «Проверить» — срок
    for (const t of uni.tasks || []) {
      if (t.done) continue;
      const subj = (uni.subjects || []).find((s) => s.id === t.subjectId);
      const base = { sub: subj?.name, color: color("university"), href: `/university/#/subject/${t.subjectId}` };
      if (t.planDate) push(allday, t.planDate, { ...base, plan: true, title: `Сделать: ${t.title}` });
      if (t.deadline) push(allday, t.deadline, { ...base, title: `Дедлайн${t.deadlineTime ? ` ${t.deadlineTime}` : ""}: ${t.title}` });
    }
    for (const t of nav.tasks || []) {
      if (t.done) continue;
      const base = { sub: t.assignee && t.assignee !== "Я" ? t.assignee : "", color: color("navigator"), href: "/navigator/#/tasks" };
      if (t.planDate) push(allday, t.planDate, { ...base, plan: true, title: `Сделать: ${t.title}` });
      if (t.checkDate) push(allday, t.checkDate, { ...base, title: `Проверить: ${t.title}` });
    }
    // Сначала то, что запланировано сделать, потом сроки
    for (const list of allday.values()) list.sort((a, b) => Number(Boolean(b.plan)) - Number(Boolean(a.plan)));
    ext = { timed, allday };
  }

  // ---------- Раскладка пересекающихся блоков (как в Google Календаре) ----------
  function layout(items) {
    items.sort((a, b) => a.s - b.s || b.e - a.e);
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      const cols = [];
      for (const it of cluster) {
        let c = cols.findIndex((end) => end <= it.s);
        if (c < 0) { c = cols.length; cols.push(0); }
        cols[c] = it.e;
        it.col = c;
      }
      for (const it of cluster) it.ncols = cols.length;
    };
    for (const it of items) {
      if (cluster.length && it.s >= clusterEnd) { flush(); cluster = []; clusterEnd = -1; }
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.e);
    }
    if (cluster.length) flush();
    return items;
  }

  // ---------- Календарь ----------
  function blockHtml(it, colKey) {
    const h = ((it.e - it.s) / 60) * HOUR;
    const size = h < 22 ? "short tiny" : h < 38 ? "short" : "";
    const pos = `top:${(it.s / 60) * HOUR}px;height:${Math.max(h, 12)}px;left:${(it.col / it.ncols) * 100}%;width:calc(${100 / it.ncols}% - 5px);right:auto`;
    if (it.ext) {
      return `<a class="blk ext ${size} ${it.done ? "done" : ""}" href="${esc(it.href)}" style="${pos};--cat:${it.color}" title="${esc(`${it.title}${it.sub ? ` · ${it.sub}` : ""}`)}">
        <div class="blk-title">${esc(it.title)}</div><div class="blk-time">${fromMin(it.s)}–${fromMin(it.e)}${it.sub ? ` · ${esc(it.sub)}` : ""}</div></a>`;
    }
    const b = it.b;
    const cat = catOf(b);
    return `<div class="blk cat-${b.category} ${size} ${b.done ? "done" : ""} ${b.roadmapId ? "rm" : ""}" data-col="${colKey}" data-block="${b.id}"
        style="${pos};--cat:${cat.color}" title="${esc(`${b.title} · ${b.start}–${b.end}${b.note ? `\n${b.note}` : ""}`)}">
      <div class="blk-title">${b.done ? "✓ " : ""}${esc(b.title)}</div>
      <div class="blk-time">${b.start}–${b.end}${b.roadmapId ? ` · <span class="rm-tag">Roadmap</span>` : ""}</div>
      ${b.note ? `<div class="blk-note">${esc(b.note)}</div>` : ""}
      <div class="blk-resize"></div>
    </div>`;
  }

  function calendarHtml(cols, opts) {
    const today = dateKey();
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const head = cols.map((c) => {
      const blocks = c.blocks();
      const work = sumBy(blocks, "work");
      const waste = sumBy(blocks, "waste");
      const edited = c.date && D.days[c.date];
      return `<div class="cal-day-head ${c.date === today ? "today" : ""}">
        <span class="wd">${c.label}</span>
        ${c.date ? `<a href="#/" data-goto-day="${c.date}" class="dn" title="Открыть день">${toDate(c.date).getDate()}</a>` : `<span class="dn" style="font-size:14px">${WD_FULL[c.wd].slice(0, 3)}</span>`}
        <span class="sum">Работа <b>${hm(work)}</b>${waste ? ` · хуйня ${hm(waste)}` : ""}</span>
        ${edited ? `<span class="edited">изменён · <button data-reset="${c.date}">вернуть шаблон</button></span>` : ""}
      </div>`;
    }).join("");

    const alldays = cols.map((c) => (c.date && showPanels ? ext.allday.get(c.date) || [] : []));
    const allday = alldays.some((l) => l.length) ? `<div class="cal-allday"><div class="gut">задачи</div>${alldays.map((list) =>
      `<div class="cell">${list.map((x) => `<a class="chip-ev ${x.plan ? "plan" : ""}" href="${esc(x.href)}" style="--cat:${x.color}" title="${esc(`${x.title}${x.sub ? ` · ${x.sub}` : ""}`)}">${esc(x.title)}</a>`).join("")}</div>`).join("")}</div>` : "";

    const hours = Array.from({ length: 23 }, (_, i) => `<span style="top:${(i + 1) * HOUR}px">${pad(i + 1)}:00</span>`).join("");
    const body = cols.map((c) => {
      const items = c.blocks().map((b) => ({ b, s: startMin(b), e: endMin(b) }));
      if (c.date && showPanels) for (const x of ext.timed.get(c.date) || []) items.push({ ...x, ext: true });
      layout(items);
      const nowLine = c.date === today ? `<div class="now-line" style="top:${(nowMin / 60) * HOUR}px"></div>` : "";
      return `<div class="cal-col ${c.date === today ? "today" : ""}" data-col="${c.key}">${items.map((it) => blockHtml(it, c.key)).join("")}${nowLine}</div>`;
    }).join("");

    return `<div class="card cal" style="--cols:${cols.length};--hour:${HOUR}px">
      <div class="cal-head"><div></div>${head}</div>
      ${allday}
      <div class="cal-scroll" id="cal-scroll"><div class="cal-grid"><div class="cal-gutter">${hours}</div>${body}</div></div>
    </div>`;
  }

  function periodTitle() {
    if (view === "day") {
      const d = toDate(anchor);
      return `${WD_FULL[isoWd(anchor)]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    }
    const a = toDate(weekStart(anchor));
    const b = toDate(addDays(weekStart(anchor), 6));
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`
      : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  }

  function pageSchedule() {
    return `<div class="cal-toolbar">
        <button class="btn" data-nav="today">Сегодня</button>
        <button class="icon-btn" data-nav="-1" aria-label="Назад">‹</button>
        <button class="icon-btn" data-nav="1" aria-label="Вперёд">›</button>
        <h1>${periodTitle()}</h1>
        <div class="seg">
          <button data-view="day" class="${view === "day" ? "active" : ""}">День</button>
          <button data-view="week" class="${view === "week" ? "active" : ""}">Неделя</button>
        </div>
      </div>
      ${calendarHtml(columns(), {})}`;
  }

  function pageTemplate(variant) {
    const bad = variant === "bad";
    return `<div class="cal-toolbar">
        <h1>Шаблон недели — ${bad ? "плохой режим" : "основной режим"}</h1>
        <div class="seg">
          <button data-variant="main" class="${bad ? "" : "active"}">Основной</button>
          <button data-variant="bad" class="${bad ? "active" : ""}">Плохой</button>
        </div>
      </div>
      <p class="muted" style="margin:-4px 0 14px">${bad
        ? `Плохой режим не ставится в календарь — он нужен, чтобы видеть, сколько времени теряется. <a href="#/compare" style="color:var(--accent)">Сравнить режимы →</a>`
        : "Основной режим стоит по умолчанию на каждой неделе. Правки шаблона применяются ко всем дням, которые вы не меняли вручную."}</p>
      ${calendarHtml(columns(), {})}`;
  }

  function pageCompare() {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((wd) => {
      const m = D.templates.main[wd], b = D.templates.bad[wd];
      return { wd, m, b, work: [sumBy(m, "work"), sumBy(b, "work")], waste: [sumBy(m, "waste"), sumBy(b, "waste")], sleep: [sumBy(m, "sleep"), sumBy(b, "sleep")], tut: [sumBy(m, "tutoring"), sumBy(b, "tutoring")] };
    });
    const total = (k, i) => rows.reduce((n, r) => n + r[k][i], 0);
    const diff = (a, b) => (b - a === 0 ? "0:00" : `${b - a > 0 ? "+" : "−"}${hm(Math.abs(b - a))}`);
    const cell = (pair, worseIfMore) => {
      const d = pair[1] - pair[0];
      const cls = d === 0 ? "" : (d > 0) === worseIfMore ? "bad" : "good";
      return `<td>${hm(pair[0])}</td><td>${hm(pair[1])}</td><td class="${cls}">${diff(pair[0], pair[1])}</td>`;
    };
    const workLoss = total("work", 0) - total("work", 1);
    const wasteGain = total("waste", 1) - total("waste", 0);
    const target = (v, wd) => { const [a, b] = S.TARGETS[v][wd]; return [a && `основа ${a}`, b && `доп. ${b}`].filter(Boolean).join(" · "); };

    return `<div class="eyebrow">Расписание</div><h1>Сравнение режимов</h1>
      <div class="card loss" style="margin-top:18px">
        <h2>В плохом режиме за неделю: −${hm(workLoss)} работы и +${hm(wasteGain)} на «хуйню»</h2>
        <p>Это ${hm(workLoss + wasteGain)} в неделю, которые уходят впустую, — примерно ${Math.round((workLoss + wasteGain) / 60 * 4.3)} ч в месяц.
          Сравниваются шаблоны: основной (вариант 2) и плохой (вариант 1).</p>
      </div>
      <div class="stats">
        <div class="card stat"><div class="value">${hm(total("work", 0))}</div><div class="label">работы в неделю — основной</div></div>
        <div class="card stat"><div class="value bad">${hm(total("work", 1))}</div><div class="label">работы в неделю — плохой</div></div>
        <div class="card stat"><div class="value">${hm(total("waste", 0))}</div><div class="label">«хуйни» в неделю — основной</div></div>
        <div class="card stat"><div class="value bad">${hm(total("waste", 1))}</div><div class="label">«хуйни» в неделю — плохой</div></div>
      </div>
      <div class="card cmp-wrap">
        <table class="cmp-table">
          <thead>
            <tr><th></th><th colspan="3">Работа</th><th colspan="3">Хуйня</th><th colspan="3">Сон</th></tr>
            <tr><th>День</th><th>основной</th><th>плохой</th><th>разница</th><th>основной</th><th>плохой</th><th>разница</th><th>основной</th><th>плохой</th><th>разница</th></tr>
          </thead>
          <tbody>${rows.map((r) => `<tr>
            <td>${WD_FULL[r.wd]}<span class="sub">план: ${target("main", r.wd) || "—"} / плохой: ${target("bad", r.wd) || "—"}</span></td>
            ${cell(r.work, false)}${cell(r.waste, true)}${cell(r.sleep, false)}
          </tr>`).join("")}</tbody>
          <tfoot><tr><td>За неделю</td>
            ${cell([total("work", 0), total("work", 1)], false)}${cell([total("waste", 0), total("waste", 1)], true)}${cell([total("sleep", 0), total("sleep", 1)], false)}
          </tr></tfoot>
        </table>
      </div>
      <p class="muted" style="margin-top:14px">Часы считаются по блокам расписания. Посмотреть режимы на сетке:
        <a href="#/template/main" style="color:var(--accent)">основной</a> · <a href="#/template/bad" style="color:var(--accent)">плохой</a>.</p>`;
  }

  function pagePanels() {
    return `<div class="eyebrow">Личная панель</div><h1>Все панели</h1><section class="tiles" id="tiles"></section>`;
  }

  // ---------- Боковая панель и верхняя полоса ----------
  function renderSidebar() {
    const r = route();
    $("#nav").innerHTML = `
      <a href="#/" class="${r.name === "" ? "active" : ""}">Расписание</a>
      <a href="#/template/main" class="${r.name === "template" ? "active" : ""}">Шаблон недели</a>
      <a href="#/compare" class="${r.name === "compare" ? "active" : ""}">Сравнение режимов</a>
      <a href="#/panels" class="${r.name === "panels" ? "active" : ""}">Все панели</a>`;

    let legend = "";
    if (r.name === "" || r.name === "template") {
      // Считаем по каждому дню отдельно: интервалы разных дней не объединяются
      const cols = columns();
      const totals = Object.keys(CAT).map((k) => [k, cols.reduce((n, c) => n + sumBy(c.blocks(), k), 0)]).filter(([, m]) => m).sort((a, b) => b[1] - a[1]);
      const title = r.name === "template" ? `Шаблон: ${r.variant === "bad" ? "плохой" : "основной"}` : view === "day" ? "Этот день" : "Эта неделя";
      legend = `<div class="block-title" style="margin-top:16px"><span>${title}</span><span>часы</span></div>
        <div class="legend">${totals.map(([k, m]) => `<div class="legend-row" style="--cat:${CAT[k].color}"><span class="sw"></span><span class="nm">${CAT[k].label}</span><span class="hr">${hm(m)}</span></div>`).join("")}</div>
        ${r.name === "" ? `<label class="side-toggle"><input type="checkbox" class="check" id="toggle-panels" ${showPanels ? "checked" : ""}> События панелей</label>` : ""}`;
    }

    $("#side-list").innerHTML = `
      <div class="block-title"><span>Панели</span></div>
      ${window.PANELS.map((p) => `<a href="/${p.id}/" class="stage-link" style="--subj:${p.color}">
        <span class="num">${esc(p.title[0])}</span><span class="label">${esc(p.title)}</span>
      </a>`).join("")}
      ${legend}`;
  }

  function renderOverall() {
    const today = dateKey();
    const blocks = sortBlocks([...dayBlocks(today)]);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const cur = blocks.find((b) => startMin(b) <= nowMin && nowMin < endMin(b));
    const next = blocks.find((b) => startMin(b) > nowMin);
    $("#overall").innerHTML = `<span class="overall-text">${cur
      ? `Сейчас: <b>${esc(cur.title)}</b> до ${cur.end === "00:00" ? "24:00" : cur.end}`
      : "Сейчас: свободное время"}${next ? `<span class="hide-sm"> · далее ${esc(next.title)} в ${next.start}</span>` : ""}
      <span class="hide-sm"> · работа сегодня <b>${hm(sumBy(blocks, "work"))}</b></span></span>`;
  }

  function render() {
    const r = route();
    const scroller = $("#cal-scroll");
    const keepScroll = scroller ? scroller.scrollTop : null;
    $("#main").innerHTML = r.name === "template" ? pageTemplate(r.variant)
      : r.name === "compare" ? pageCompare()
      : r.name === "panels" ? pagePanels()
      : pageSchedule();
    if (r.name === "panels") window.renderTiles($("#tiles"));

    // Прокрутка сетки: при смене вида — к текущему времени (или к 7:00), при перерисовке — на прежнее место
    const sc = $("#cal-scroll");
    if (sc) {
      const scrollKey = `${location.hash}|${view}|${anchor}`;
      if (scrollKey === lastScrollKey && keepScroll !== null) sc.scrollTop = keepScroll;
      else {
        const showsToday = columns().some((c) => c.date === dateKey());
        sc.scrollTop = Math.max(0, ((showsToday ? new Date().getHours() - 1.5 : 7) * HOUR));
      }
      lastScrollKey = scrollKey;
    }
    renderSidebar();
    renderOverall();
    $("#primary-btn").textContent = "+ Задача";
  }

  // ---------- Пункты Roadmap для задач расписания ----------
  let roadmap = { stages: [], checked: {} };
  async function loadRoadmap() {
    try {
      if (!window.ROADMAP) {
        await new Promise((resolve, reject) => {
          const el = document.createElement("script");
          el.src = "/roadmap/roadmap.js";
          el.onload = resolve;
          el.onerror = reject;
          document.head.append(el);
        });
      }
      const progress = await fetch("/api/store/progress", { cache: "no-store" }).then((r) => r.json());
      roadmap = { stages: window.ROADMAP.stages, checked: progress.items || {} };
    } catch { /* без Roadmap поле просто будет пустым */ }
  }
  const roadmapItem = (id) => {
    for (const st of roadmap.stages) for (const sec of st.sections) for (const it of sec.items) if (it.id === id) return { ...it, stage: st, section: sec };
    return null;
  };
  // Непройденные пункты текущего и следующего этапов (+ уже выбранный пункт)
  function roadmapOptions(currentId) {
    const main = roadmap.stages.filter((s) => !s.extra);
    const done = (st) => st.sections.every((sec) => sec.items.every((it) => roadmap.checked[it.id]));
    const i = main.findIndex((st) => !done(st));
    const stages = i < 0 ? [] : main.slice(i, i + 2);
    const opts = [{ value: "", label: "— не из Roadmap —" }];
    const cur = currentId && roadmapItem(currentId);
    if (cur && !stages.includes(cur.stage)) opts.push({ value: cur.id, label: cur.text, group: `Этап ${cur.stage.num}` });
    for (const st of stages) {
      for (const sec of st.sections) {
        for (const it of sec.items) {
          if (roadmap.checked[it.id] && it.id !== currentId) continue;
          opts.push({ value: it.id, label: it.text.length > 90 ? `${it.text.slice(0, 88)}…` : it.text, group: `Этап ${st.num}. ${st.title} · ${sec.title}` });
        }
      }
    }
    return opts;
  }

  // ---------- Формы ----------
  const categoryOptions = [{ value: "", label: "Определить по названию" }, ...Object.entries(CAT).map(([value, c]) => ({ value, label: c.label }))];
  const titleSuggestions = () => [...new Set(Object.values(D.templates.main).flat().map((b) => b.title))];

  async function editBlock(colKey, block, presetStart) {
    const col = colByKey(colKey);
    const isTemplate = !col.date;
    const s = block ? startMin(block) : presetStart;
    const e = block ? endMin(block) : Math.min(1440, s + 60);
    const fields = [
      ...(isTemplate ? [] : [{ name: "roadmapId", label: "Из Roadmap", type: "select", value: block?.roadmapId || "", options: roadmapOptions(block?.roadmapId),
        hint: "Пункт текущего этапа. Когда отметите задачу выполненной, он отметится и в Roadmap" }]),
      { name: "title", label: "Название", value: block?.title || "", required: isTemplate, placeholder: isTemplate ? "Например, Работа" : "Можно не заполнять, если выбран пункт Roadmap", suggestions: titleSuggestions() },
      { name: "category", label: "Категория", type: "select", value: block?.category || "", options: categoryOptions },
      isTemplate
        ? { name: "wd", label: "День недели", type: "select", value: col.wd, options: [1, 2, 3, 4, 5, 6, 7].map((wd) => ({ value: wd, label: WD_FULL[wd] })) }
        : { name: "date", label: "Дата", type: "date", value: col.date, required: true },
      { name: "start", label: "Начало", type: "time", value: fromMin(s), required: true, half: true },
      { name: "end", label: "Конец", type: "time", value: e >= 1440 ? "00:00" : fromMin(e), required: true, half: true, hint: "00:00 — до полуночи" },
      { name: "note", label: "Заметка", type: "textarea", rows: 3, value: block?.note || "", placeholder: "Что именно сделать, ссылки, детали" },
    ];
    if (!isTemplate) fields.push({ name: "done", label: "Выполнено", type: "checkbox", value: block?.done });
    const r = await formDialog({ title: block ? "Задача в расписании" : "Новая задача", fields, submit: block ? "Сохранить" : "Добавить", deleteLabel: block ? "Удалить" : "" });
    if (!r) return;

    const source = col.mutable();
    const idx = block ? source.findIndex((b) => b.id === block.id) : -1;
    if (r.action === "delete") {
      source.splice(idx, 1);
    } else {
      const v = r.values;
      const st = toMin(v.start);
      let en = v.end === "00:00" ? 1440 : toMin(v.end);
      if (en <= st) en = Math.min(1440, st + 30);
      const rmItem = v.roadmapId ? roadmapItem(v.roadmapId) : null;
      const title = v.title || rmItem?.text || "Задача";
      const updated = {
        id: block?.id || uid(), title, category: v.category || (rmItem ? "work" : S.categoryOf(title)),
        start: fromMin(st), end: en >= 1440 ? "00:00" : fromMin(en), note: v.note, done: Boolean(v.done),
      };
      if (v.roadmapId) updated.roadmapId = v.roadmapId;
      // «Выполнено» у задачи из Roadmap отмечает и сам пункт Roadmap
      if (v.roadmapId && updated.done !== Boolean(block?.done && block?.roadmapId === v.roadmapId)) {
        Sync.setRoadmapChecked(v.roadmapId, updated.done).then(loadRoadmap).catch(() => Shell.status("Не удалось отметить пункт в Roadmap", true));
      }
      if (idx >= 0) source.splice(idx, 1);
      const targetKey = isTemplate ? `t${v.wd}` : v.date;
      const target = isTemplate ? D.templates[route().variant][v.wd] : materialize(v.date);
      target.push(updated);
      sortBlocks(target);
      if (!isTemplate && targetKey !== col.key && !columns().some((c) => c.key === targetKey)) anchor = v.date;
    }
    sortBlocks(source);
    store.save();
    render();
  }

  // ---------- Перетаскивание и растягивание блоков ----------
  let drag = null;
  const main = $("#main");
  main.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".blk:not(.ext)");
    if (!el || e.button !== 0) return;
    const col = colByKey(el.dataset.col);
    const b = col.blocks().find((x) => x.id === el.dataset.block);
    drag = { el, col, b, mode: e.target.closest(".blk-resize") ? "resize" : "move", x0: e.clientX, y0: e.clientY, s: startMin(b), e: endMin(b), moved: false, target: col.key };
    el.setPointerCapture(e.pointerId);
  });
  main.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    drag.el.classList.add("dragging");
    const delta = snap((dy / HOUR) * 60);
    const len = drag.e - drag.s;
    if (drag.mode === "move") {
      drag.ns = Math.max(0, Math.min(1440 - len, drag.s + delta));
      drag.ne = drag.ns + len;
      drag.el.style.top = `${(drag.ns / 60) * HOUR}px`;
      // Перенос на другой день — по колонке под курсором
      const colEl = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains("cal-col"));
      if (colEl) {
        drag.target = colEl.dataset.col;
        const from = drag.el.parentElement.getBoundingClientRect();
        const to = colEl.getBoundingClientRect();
        drag.el.style.transform = `translateX(${to.left - from.left}px)`;
        drag.el.style.width = `${to.width - 6}px`;
        drag.el.style.left = "0";
      }
    } else {
      drag.ns = drag.s;
      drag.ne = Math.max(drag.s + SNAP, Math.min(1440, drag.e + delta));
      drag.el.style.height = `${((drag.ne - drag.ns) / 60) * HOUR}px`;
    }
    const t = drag.el.querySelector(".blk-time");
    if (t) t.textContent = `${fromMin(drag.ns)}–${drag.ne >= 1440 ? "00:00" : fromMin(drag.ne)}`;
  });
  const endDrag = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) return editBlock(d.col.key, d.b);
    if (e.type === "pointercancel") return render();
    const source = d.col.mutable();
    const idx = source.findIndex((x) => x.id === d.b.id);
    const moved = { ...source[idx], start: fromMin(d.ns), end: d.ne >= 1440 ? "00:00" : fromMin(d.ne) };
    source.splice(idx, 1);
    const target = d.target === d.col.key ? source : colByKey(d.target).mutable();
    target.push(moved);
    sortBlocks(source);
    sortBlocks(target);
    store.save();
    render();
  };
  main.addEventListener("pointerup", endDrag);
  main.addEventListener("pointercancel", endDrag);

  // Клик по пустому месту сетки — новая задача на это время
  main.addEventListener("click", (e) => {
    const colEl = e.target.classList?.contains("cal-col") ? e.target : null;
    if (colEl) {
      const rect = colEl.getBoundingClientRect();
      const minute = Math.max(0, Math.min(1440 - SNAP, Math.floor(((e.clientY - rect.top) / HOUR) * 60 / SNAP) * SNAP));
      return editBlock(colEl.dataset.col, null, minute);
    }
    const navBtn = e.target.closest("[data-nav]");
    if (navBtn) {
      const step = view === "day" ? 1 : 7;
      anchor = navBtn.dataset.nav === "today" ? dateKey() : addDays(anchor, step * Number(navBtn.dataset.nav));
      return render();
    }
    const v = e.target.closest("[data-view]");
    if (v) { view = v.dataset.view; ls("cal-view", view); return render(); }
    const variant = e.target.closest("[data-variant]");
    if (variant) { location.hash = `#/template/${variant.dataset.variant}`; return; }
    const dayLink = e.target.closest("[data-goto-day]");
    if (dayLink) { e.preventDefault(); anchor = dayLink.dataset.gotoDay; view = "day"; ls("cal-view", view); return render(); }
    const reset = e.target.closest("[data-reset]");
    if (reset) {
      confirmDialog("Вернуть день к шаблону?", "Все изменения этого дня будут удалены, вернётся основной режим.", "Вернуть шаблон").then((ok) => {
        if (!ok) return;
        delete D.days[reset.dataset.reset];
        store.save();
        render();
      });
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "toggle-panels") { showPanels = e.target.checked; ls("cal-panels", showPanels ? "1" : "0"); render(); }
  });

  $("#primary-btn").addEventListener("click", () => {
    const r = route();
    if (r.name === "template") return editBlock("t1", null, 9 * 60);
    if (r.name !== "") location.hash = "#/";
    const now = new Date();
    const minute = Math.min(1440 - 60, Math.ceil((now.getHours() * 60 + now.getMinutes()) / SNAP) * SNAP);
    const key = dateKey();
    if (!columns().some((c) => c.key === key)) anchor = key;
    editBlock(key, null, minute);
  });

  window.addEventListener("hashchange", render);
  // Свежие события панелей при возврате на вкладку
  // Вернулись на вкладку — перечитываем расписание (его могли поменять из Roadmap) и события панелей
  window.addEventListener("focus", async () => {
    if (drag || document.querySelector("dialog[open]")) return;
    await Promise.all([store.reload(), loadExternal(), loadRoadmap()]);
    render();
  });
  setInterval(() => { if (!drag && !document.querySelector("dialog[open]")) render(); }, 60_000);

  render();
  Promise.all([loadExternal(), loadRoadmap()]).then(render);
})();
