(async () => {
  "use strict";

  const { esc, uid, dateKey, toDate, addDays, daysFromToday, shortDate, relative, plural, formDialog } = window.U;
  const { endOf, hhmm, byStart, isPast, isLive, card, byDate } = window.Events;
  const $ = (sel) => document.querySelector(sel);
  const ME = "Я";

  const store = await PanelStore.open("navigator", { version: 1, calls: [], tasks: [] }, Shell.status);
  const D = store.data;

  // ---------- Данные ----------
  const callById = (id) => D.calls.find((c) => c.id === id);
  const taskById = (id) => D.tasks.find((t) => t.id === id);
  const upcomingCalls = () => D.calls.filter((c) => !c.held && !isPast(c)).sort(byStart);
  const awaitingCalls = () => D.calls.filter((c) => !c.held && isPast(c)).sort(byStart);
  const isMine = (t) => !t.assignee || t.assignee === ME;
  const people = () => [...new Set(D.tasks.map((t) => t.assignee).filter((a) => a && a !== ME))].sort((a, b) => a.localeCompare(b, "ru"));
  const dueAt = (t) => (t.checkDate ? toDate(t.checkDate, t.checkTime || "23:59") : null);
  const isOverdue = (t) => !t.done && t.checkDate && dueAt(t) < new Date();

  function bucketOf(t) {
    if (t.done) return "done";
    if (!t.checkDate) return "none";
    if (isOverdue(t)) return "overdue";
    const diff = daysFromToday(t.checkDate);
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    if (diff <= 7) return "week";
    return "later";
  }
  const BUCKETS = [
    ["overdue", "Срок прошёл"], ["today", "Сегодня"], ["tomorrow", "Завтра"],
    ["week", "Ближайшие 7 дней"], ["later", "Позже"], ["none", "Без срока"], ["done", "Выполнено и проверено"],
  ];

  let filter = { who: "all", showDone: false };

  // ---------- Маршрут ----------
  function route() {
    const [, name = "", arg = ""] = location.hash.match(/^#\/([^/]*)\/?(.*)$/) || [];
    if (name === "tasks") return { name, person: arg ? decodeURIComponent(arg) : "" };
    if (name === "held") return { name };
    return { name: "" };
  }
  const onTasks = () => route().name === "tasks";

  // ---------- Созвоны ----------
  function callCard(c) {
    const sub = [
      c.participants ? `Участники: ${esc(c.participants)}` : "",
      c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">Ссылка на созвон</a>` : "",
    ].filter(Boolean).join(" · ");
    const discussed = c.agenda.filter((a) => a.done).length;
    return card({
      id: c.id,
      time: c.time,
      endTime: hhmm(endOf(c)),
      live: !c.held && isLive(c),
      done: c.held,
      title: c.title,
      subHtml: sub,
      notes: c.notes,
      badges: [
        c.held ? { cls: "is-done", label: "Проведён" }
          : isPast(c) ? { cls: "is-late", label: "Прошёл — отметьте" }
          : c.agenda.length ? { cls: discussed === c.agenda.length ? "is-ready" : "", label: `Повестка: ${c.agenda.length} ${plural(c.agenda.length, "пункт", "пункта", "пунктов")}` } : null,
      ],
      checklist: { title: "Повестка", items: c.agenda, placeholder: c.held ? "" : "+ Добавить пункт повестки и нажать Enter" },
      actions: [
        c.held ? { act: "unhold", label: "Вернуть в предстоящие" } : { act: "hold", label: "✓ Созвон проведён", cls: "ok" },
        { act: "edit-call", label: "Изменить", cls: "ghost" },
      ],
    });
  }

  function pageCalls() {
    const up = upcomingCalls();
    const late = awaitingCalls();
    const today = up.filter((c) => c.date === dateKey());
    const week = up.filter((c) => daysFromToday(c.date) <= 7);
    const noAgenda = week.filter((c) => !c.agenda.length).length;
    return `<div class="eyebrow">Навигатор</div><h1>Созвоны</h1>
      <div class="stats">
        <div class="card stat"><div class="value">${today.length}</div><div class="label">${plural(today.length, "созвон", "созвона", "созвонов")} сегодня</div></div>
        <div class="card stat"><div class="value">${week.length}</div><div class="label">в ближайшие 7 дней</div></div>
        <div class="card stat ${noAgenda ? "alert" : ""}"><div class="value">${noAgenda}</div><div class="label">без повестки</div></div>
        <div class="card stat"><div class="value">${D.calls.filter((c) => c.held).length}</div><div class="label">проведено всего</div></div>
      </div>
      ${late.length ? `<section class="group late">
        <div class="group-head">Прошли — отметьте, состоялись ли <span class="n">${late.length}</span></div>
        <div class="events">${late.map(callCard).join("")}</div>
      </section>` : ""}
      ${up.length ? byDate(up, callCard) : `<div class="card empty">Предстоящих созвонов нет — нажмите «+ Созвон».</div>`}`;
  }

  function pageHeld() {
    const held = D.calls.filter((c) => c.held).sort((a, b) => byStart(b, a));
    return `<div class="eyebrow">Навигатор</div><h1>Проведённые созвоны</h1>
      <div style="margin-top:22px">${held.length ? `<div class="card list-card">${held.map((c) => `
        <div class="entity" data-event="${c.id}" data-act="edit-call" style="cursor:pointer">
          <div class="entity-main">
            <div class="entity-title">${esc(c.title)}</div>
            <div class="entity-sub">${[c.participants, c.agenda.length ? `повестка: ${c.agenda.filter((a) => a.done).length}/${c.agenda.length}` : "", c.notes].filter(Boolean).map(esc).join(" · ")}</div>
          </div>
          <div class="when">${shortDate(c.date)}<small>${esc(c.time)}</small></div>
        </div>`).join("")}</div>` : `<div class="card empty">Проведённых созвонов пока нет.</div>`}</div>`;
  }

  // ---------- Задачи ----------
  function taskItem(t) {
    let when = "";
    if (t.checkDate) {
      const overdue = isOverdue(t);
      const diff = daysFromToday(t.checkDate);
      const cls = overdue ? "overdue" : !t.done && diff <= 1 ? "soon" : "";
      const rel = t.done ? "" : overdue ? (diff === 0 ? "срок прошёл сегодня" : `срок прошёл ${U.days(-diff)} назад`) : relative(t.checkDate);
      when = `<div class="when ${cls}">${shortDate(t.checkDate)}${t.checkTime ? `, ${t.checkTime}` : ""}<small>${rel}</small></div>`;
    }
    const mine = isMine(t);
    return `<li class="item ${t.done ? "checked" : ""}" data-task="${t.id}">
      <input type="checkbox" class="check" data-toggle ${t.done ? "checked" : ""} aria-label="${mine ? "Выполнено" : "Проверено"}">
      <div class="text">
        <div class="title">${esc(t.title)}</div>
        <div class="meta">
          <span class="subj" style="--subj:${mine ? "var(--accent)" : "var(--p-low)"}">${mine ? "Делаю я" : esc(t.assignee)}</span>
          <span>${t.checkDate ? (mine ? "дедлайн" : "проверить до") : "без срока"}</span>
          ${t.done ? "" : U.planHtml(t.planDate, t.checkDate)}
        </div>
        ${t.notes ? `<div class="notes">${esc(t.notes)}</div>` : ""}
      </div>
      ${when}
    </li>`;
  }

  function pageTasks(person) {
    const scope = D.tasks.filter((t) => (person ? (person === ME ? isMine(t) : t.assignee === person) : true));
    const open = scope.filter((t) => !t.done);
    const overdue = open.filter(isOverdue).length;
    const visible = scope
      .filter((t) => person || filter.who === "all" || (filter.who === "me" ? isMine(t) : !isMine(t)))
      .filter((t) => filter.showDone || !t.done);
    const groups = BUCKETS.map(([key, title]) => [key, title, visible.filter((t) => bucketOf(t) === key)]).filter(([, , l]) => l.length);
    for (const [key, , list] of groups) {
      if (key === "done") list.sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
      else list.sort((a, b) => (dueAt(a) || Infinity) - (dueAt(b) || Infinity));
    }
    const head = person
      ? `<div class="eyebrow">Задачи</div><h1>${person === ME ? "Мои задачи" : esc(person)}</h1>`
      : `<div class="eyebrow">Навигатор</div><h1>Задачи</h1>`;
    return `${head}
      <div class="stats">
        <div class="card stat"><div class="value">${open.length}</div><div class="label">${plural(open.length, "открытая задача", "открытые задачи", "открытых задач")}</div></div>
        <div class="card stat ${overdue ? "alert" : ""}"><div class="value">${overdue}</div><div class="label">срок прошёл</div></div>
        <div class="card stat"><div class="value">${open.filter(isMine).length}</div><div class="label">делаю я</div></div>
        <div class="card stat"><div class="value">${open.filter((t) => !isMine(t)).length}</div><div class="label">распределено другим</div></div>
      </div>
      <div class="toolbar">
        ${person ? "" : [["all", "Все"], ["me", "Мои"], ["others", "Распределённые"]].map(([v, l]) =>
          `<button class="chip-btn ${filter.who === v ? "active" : ""}" data-who="${v}">${l}</button>`).join("")}
        <label class="toggle"><input type="checkbox" class="check" id="show-done" ${filter.showDone ? "checked" : ""}> Показать выполненные</label>
      </div>
      ${groups.length ? `<div class="sections">${groups.map(([key, title, list]) => `
        <section class="card sec ${key}">
          <div class="sec-head"><h2>${title}</h2><span class="count">${list.length}</span></div>
          <ul class="items">${list.map(taskItem).join("")}</ul>
        </section>`).join("")}</div>` : `<div class="card empty">${scope.length ? "Нет задач по выбранному фильтру." : "Задач пока нет — нажмите «+ Задача»."}</div>`}`;
  }

  // ---------- Каркас ----------
  function renderSidebar() {
    const r = route();
    const late = awaitingCalls().length;
    const openTasks = D.tasks.filter((t) => !t.done);
    const overdue = openTasks.filter(isOverdue).length;
    $("#nav").innerHTML = `
      <a href="#/" class="${r.name === "" ? "active" : ""}">Созвоны<span class="count ${late ? "alert" : ""}">${late ? `${late} не отмеч.` : upcomingCalls().length || ""}</span></a>
      <a href="#/tasks" class="${r.name === "tasks" && !r.person ? "active" : ""}">Задачи<span class="count ${overdue ? "alert" : ""}">${overdue ? `${overdue} просроч.` : openTasks.length || ""}</span></a>
      <a href="#/held" class="${r.name === "held" ? "active" : ""}">Проведённые созвоны<span class="count">${D.calls.filter((c) => c.held).length || ""}</span></a>`;
    const personLink = (name, label) => {
      const open = D.tasks.filter((t) => !t.done && (name === ME ? isMine(t) : t.assignee === name));
      const late2 = open.filter(isOverdue).length;
      return `<a href="#/tasks/${encodeURIComponent(name)}" class="stage-link ${r.person === name ? "active" : ""}" style="--subj:${name === ME ? "var(--accent)" : "var(--p-low)"}">
        <span class="num">${esc(label[0].toUpperCase())}</span>
        <span class="label">${esc(label)}</span>
        <span class="pct ${late2 ? "alert" : ""}">${late2 ? `${late2} просроч.` : open.length || ""}</span>
      </a>`;
    };
    $("#side-list").innerHTML = `
      <div class="block-title"><span>Кому распределено</span></div>
      ${personLink(ME, "Я")}
      ${people().map((p) => personLink(p, p)).join("")}
      <button class="stage-link add" data-act="add-task"><span class="num">+</span><span class="label">Новая задача</span></button>`;
  }

  function renderOverall() {
    const next = upcomingCalls()[0];
    const openTasks = D.tasks.filter((t) => !t.done);
    const overdue = openTasks.filter(isOverdue).length;
    $("#overall").innerHTML = `<span class="overall-text">${next
      ? `Ближайший созвон: <b>${shortDate(next.date)}, ${next.time}</b> · ${esc(next.title)}`
      : "Созвонов не запланировано"}<span class="hide-sm"> · задач открыто <b>${openTasks.length}</b></span>${overdue ? ` · срок прошёл <b class="alert">${overdue}</b>` : ""}</span>`;
    $("#primary-btn").textContent = onTasks() ? "+ Задача" : "+ Созвон";
  }

  let lastView = "";
  function render() {
    const r = route();
    const scroll = window.scrollY;
    $("#main").innerHTML = r.name === "tasks" ? pageTasks(r.person) : r.name === "held" ? pageHeld() : pageCalls();
    window.scrollTo(0, location.hash === lastView ? scroll : 0);
    lastView = location.hash;
    renderSidebar();
    renderOverall();
  }

  // ---------- Формы ----------
  async function editCall(call) {
    const last = D.calls.slice().sort(byStart).at(-1);
    const fields = [
      { name: "title", label: "Тема созвона", value: call?.title || "", required: true, placeholder: "О чём созвон" },
      { name: "date", label: "Дата", type: "date", value: call?.date || dateKey(), required: true, half: true },
      { name: "time", label: "Начало", type: "time", value: call?.time || last?.time || "12:00", required: true, half: true },
      { name: "duration", label: "Длительность, мин", type: "number", value: call?.duration || 30, min: 5, max: 600, step: 5, half: true },
      { name: "participants", label: "Участники", value: call?.participants || "", placeholder: "Кто будет на созвоне", suggestions: people() },
      { name: "link", label: "Ссылка", type: "url", value: call?.link || "", placeholder: "https://…" },
    ];
    if (!call) {
      fields.push(
        { name: "agenda", label: "Повестка", type: "textarea", rows: 4, value: "", placeholder: "Каждый пункт с новой строки:\nСтатус задач\nПланы на неделю" },
        { name: "repeat", label: "Повторять каждую неделю", type: "number", value: 1, min: 1, max: 52, half: true, hint: "1 — только этот созвон; 4 — созвон на 4 недели вперёд" },
      );
    }
    fields.push({ name: "notes", label: call ? "Итоги и заметки" : "Заметки", type: "textarea", rows: 3, value: call?.notes || "", placeholder: "Договорённости, решения" });
    const r = await formDialog({ title: call ? "Созвон" : "Новый созвон", fields, submit: call ? "Сохранить" : "Добавить", deleteLabel: call ? "Удалить созвон" : "" });
    if (!r) return;
    if (r.action === "delete") D.calls = D.calls.filter((c) => c !== call);
    else {
      const v = r.values;
      const base = { title: v.title, time: v.time, duration: Math.max(5, Number(v.duration) || 30), participants: v.participants, link: v.link, notes: v.notes };
      if (call) Object.assign(call, base, { date: v.date });
      else {
        const points = (v.agenda || "").split("\n").map((s) => s.trim()).filter(Boolean);
        const repeat = Math.min(52, Math.max(1, Number(v.repeat) || 1));
        for (let i = 0; i < repeat; i++) {
          D.calls.push({ id: uid(), ...base, date: addDays(v.date, 7 * i), agenda: points.map((title) => ({ id: uid(), title, done: false })), held: false, heldAt: "" });
        }
      }
    }
    store.save();
    render();
  }

  async function editTask(task) {
    const r = await formDialog({
      title: task ? "Задача" : "Новая задача",
      fields: [
        { name: "title", label: "Задача", value: task?.title || "", required: true, placeholder: "Что нужно сделать" },
        { name: "assignee", label: "Кому", value: task?.assignee || (route().person || ME), required: true,
          suggestions: [ME, ...people()], hint: "«Я» — делаю сам; иначе имя человека, которому распределил задачу" },
        { name: "planDate", label: "День выполнения", type: "date", value: task?.planDate || "", hint: "Когда задачу планируется сделать — она появится в этот день в расписании" },
        { name: "checkDate", label: "Дедлайн проверки", type: "date", value: task?.checkDate || "", half: true },
        { name: "checkTime", label: "Время (необязательно)", type: "time", value: task?.checkTime || "", half: true },
        { name: "notes", label: "Заметки", type: "textarea", value: task?.notes || "", placeholder: "Критерии готовности, ссылки" },
      ],
      submit: task ? "Сохранить" : "Добавить",
      deleteLabel: task ? "Удалить" : "",
    });
    if (!r) return;
    if (r.action === "delete") D.tasks = D.tasks.filter((t) => t !== task);
    else {
      const v = r.values;
      const assignee = v.assignee.toLowerCase() === "я" ? ME : v.assignee;
      const fields = { title: v.title, assignee, planDate: v.planDate, checkDate: v.checkDate, checkTime: v.checkDate ? v.checkTime : "", notes: v.notes };
      if (task) Object.assign(task, fields);
      else D.tasks.push({ id: uid(), ...fields, done: false, doneAt: "", createdAt: new Date().toISOString() });
    }
    store.save();
    render();
  }

  // ---------- События ----------
  window.Events.bindChecklists({
    toggle(id, itemId) { const a = callById(id).agenda.find((x) => x.id === itemId); a.done = !a.done; store.save(); render(); },
    remove(id, itemId) { const c = callById(id); c.agenda = c.agenda.filter((x) => x.id !== itemId); store.save(); render(); },
    add(id, title) { callById(id).agenda.push({ id: uid(), title, done: false }); store.save(); render(); },
  });

  document.addEventListener("click", (e) => {
    const who = e.target.closest("[data-who]");
    if (who) { filter.who = who.dataset.who; return render(); }

    const row = e.target.closest("[data-task]");
    if (row) {
      const task = taskById(row.dataset.task);
      if (e.target.matches("[data-toggle]")) {
        task.done = !task.done;
        task.doneAt = task.done ? new Date().toISOString() : "";
        store.save();
        return render();
      }
      return editTask(task);
    }

    const act = e.target.closest("[data-act]")?.dataset.act;
    const call = callById(e.target.closest("[data-event]")?.dataset.event);
    if (act === "add-task") return editTask(null);
    if (act === "edit-call") return editCall(call);
    if (act === "hold" || act === "unhold") {
      call.held = act === "hold";
      call.heldAt = call.held ? new Date().toISOString() : "";
      store.save();
      render();
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "show-done") { filter.showDone = e.target.checked; render(); }
  });

  $("#primary-btn").addEventListener("click", () => (onTasks() ? editTask(null) : editCall(null)));
  window.addEventListener("hashchange", render);
  setInterval(() => {
    const busy = document.querySelector("dialog[open]") || document.activeElement?.matches("input, textarea");
    if (!busy) render();
  }, 60_000);

  render();
})();
