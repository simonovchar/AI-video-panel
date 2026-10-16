(async () => {
  "use strict";

  const { esc, uid, toDate, daysFromToday, shortDate, relative, plural, formDialog, confirmDialog } = window.U;
  const $ = (sel) => document.querySelector(sel);

  const PRIORITIES = [
    { value: "high", label: "Высокий", color: "var(--p-high)" },
    { value: "medium", label: "Средний", color: "var(--p-medium)" },
    { value: "low", label: "Низкий", color: "var(--p-low)" },
  ];
  const PRIO_ORDER = { high: 0, medium: 1, low: 2 };
  const PRIO_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.label]));
  const COLORS = ["#4f46e5", "#0e9f6e", "#d97706", "#db2777", "#0891b2", "#7c3aed", "#65a30d", "#ea580c", "#2563eb", "#be123c"];

  const store = await PanelStore.open("university", { version: 1, subjects: [], tasks: [] }, Shell.status);
  const D = store.data;

  let filter = { priority: "all", showDone: false };

  // ---------- Данные ----------
  const subjectById = (id) => D.subjects.find((s) => s.id === id);
  const openTasks = (subjectId) => D.tasks.filter((t) => !t.done && (!subjectId || t.subjectId === subjectId));
  const deadlineAt = (t) => (t.deadline ? toDate(t.deadline, t.deadlineTime || "23:59") : null);
  const isOverdue = (t) => !t.done && t.deadline && deadlineAt(t) < new Date();

  function bucketOf(t) {
    if (t.done) return "done";
    if (!t.deadline) return "none";
    if (isOverdue(t)) return "overdue";
    const diff = daysFromToday(t.deadline);
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    if (diff <= 7) return "week";
    return "later";
  }
  const BUCKETS = [
    ["overdue", "Просрочено"],
    ["today", "Сегодня"],
    ["tomorrow", "Завтра"],
    ["week", "Ближайшие 7 дней"],
    ["later", "Позже"],
    ["none", "Без дедлайна"],
    ["done", "Выполнено"],
  ];

  function sortTasks(a, b) {
    const da = deadlineAt(a), db = deadlineAt(b);
    if (da && db && +da !== +db) return da - db;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority];
  }

  // ---------- Маршрут ----------
  const route = () => {
    const m = location.hash.match(/^#\/subject\/(.+)$/);
    return m && subjectById(m[1]) ? { subjectId: m[1] } : { subjectId: null };
  };

  // ---------- Рендер ----------
  let searchQuery = "";

  function renderSidebar() {
    const { subjectId } = route();
    const overdue = D.tasks.filter(isOverdue).length;
    $("#nav").innerHTML = `
      <a href="#/" class="${subjectId || searchQuery ? "" : "active"}">Все задания<span class="count">${openTasks().length || ""}</span></a>
      ${overdue ? `<a href="#/" data-act="show-overdue">Просрочено<span class="count alert">${overdue}</span></a>` : ""}`;

    $("#side-list").innerHTML = `
      <div class="block-title"><span>Предметы</span><span>${D.subjects.length || ""}</span></div>
      ${D.subjects.map((s) => {
        const open = openTasks(s.id);
        const late = open.filter(isOverdue).length;
        return `<a href="#/subject/${s.id}" class="stage-link ${subjectId === s.id && !searchQuery ? "active" : ""}" style="--subj:${s.color}" title="${esc(s.name)}">
          <span class="num">${esc(s.name.trim()[0] || "?").toUpperCase()}</span>
          <span class="label">${esc(s.name)}</span>
          <span class="pct ${late ? "alert" : ""}">${late ? `${late} просроч.` : open.length || ""}</span>
        </a>`;
      }).join("")}
      <button class="stage-link add" data-act="add-subject"><span class="num">+</span><span class="label">Добавить предмет</span></button>`;
  }

  function renderOverall() {
    const total = D.tasks.length;
    const done = D.tasks.filter((t) => t.done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const overdue = D.tasks.filter(isOverdue).length;
    $("#overall").innerHTML = `<div class="bar"><span style="width:${pct}%"></span></div>
      <span class="overall-text"><b>${total - done}</b> ${plural(total - done, "открытое", "открытых", "открытых")}
        <span class="hide-sm">· выполнено <b>${done}/${total}</b></span>${overdue ? ` · просрочено <b class="alert">${overdue}</b>` : ""}</span>`;
  }

  function taskItem(t, showSubject) {
    const s = subjectById(t.subjectId);
    let when = "";
    if (t.deadline) {
      const overdue = isOverdue(t);
      const diff = daysFromToday(t.deadline);
      const cls = overdue ? "overdue" : !t.done && diff <= 1 ? "soon" : "";
      const rel = t.done ? "" : overdue
        ? (diff === 0 ? "просрочено сегодня" : `просрочено на ${U.days(-diff)}`)
        : relative(t.deadline);
      when = `<div class="when ${cls}">${shortDate(t.deadline)}${t.deadlineTime ? `, ${t.deadlineTime}` : ""}<small>${rel}</small></div>`;
    }
    return `<li class="item prio-${t.priority} ${t.done ? "checked" : ""}" data-task="${t.id}">
      <input type="checkbox" class="check" data-toggle ${t.done ? "checked" : ""} aria-label="Выполнено">
      <div class="text">
        <div class="title">${esc(t.title)}</div>
        <div class="meta">
          ${showSubject && s ? `<span class="subj" style="--subj:${s.color}">${esc(s.name)}</span>` : ""}
          <span class="prio ${t.priority}">${PRIO_LABEL[t.priority]} приоритет</span>
          ${t.done ? "" : U.planHtml(t.planDate, t.deadline)}
          ${t.deadline ? "" : `<span>без дедлайна</span>`}
        </div>
        ${t.notes ? `<div class="notes">${esc(t.notes)}</div>` : ""}
      </div>
      ${when}
    </li>`;
  }

  function sectionsHtml(tasks, showSubject, emptyText) {
    const groups = BUCKETS.map(([key, title]) => [key, title, tasks.filter((t) => bucketOf(t) === key)])
      .filter(([, , list]) => list.length);
    for (const [key, , list] of groups) {
      if (key === "done") list.sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
      else list.sort(sortTasks);
    }
    if (!groups.length) return `<div class="card empty">${emptyText}</div>`;
    return `<div class="sections">${groups.map(([key, title, list]) => `
      <section class="card sec ${key}" id="sec-${key}">
        <div class="sec-head"><h2>${title}</h2><span class="count">${list.length}</span></div>
        <ul class="items">${list.map((t) => taskItem(t, showSubject)).join("")}</ul>
      </section>`).join("")}</div>`;
  }

  function pageSearch(q) {
    const needle = q.toLowerCase();
    const hits = D.tasks.filter((t) => `${t.title} ${t.notes}`.toLowerCase().includes(needle));
    return `
      <div class="eyebrow">Поиск</div>
      <h1>«${esc(q)}»</h1>
      <p class="muted">Найдено: ${hits.length}</p>
      ${sectionsHtml(hits, true, "Ничего не найдено")}`;
  }

  function pageTasks(subjectId) {
    const subject = subjectId && subjectById(subjectId);

    if (!D.subjects.length) {
      return `<div class="eyebrow">Университет</div>
        <h1>Предметы и задания</h1>
        <div class="card empty-state">
          <h2>Добавьте первый предмет</h2>
          <p>Предметы — это дисциплины, по которым вы получаете задания. У каждого задания будет приоритет и дедлайн.</p>
          <button class="btn primary" data-act="add-subject">+ Добавить предмет</button>
        </div>`;
    }

    const scope = D.tasks.filter((t) => !subjectId || t.subjectId === subjectId);
    const open = scope.filter((t) => !t.done);
    const overdue = open.filter(isOverdue).length;
    const week = open.filter((t) => t.deadline && !isOverdue(t) && daysFromToday(t.deadline) <= 7).length;
    const high = open.filter((t) => t.priority === "high").length;
    const visible = scope
      .filter((t) => filter.priority === "all" || t.priority === filter.priority)
      .filter((t) => filter.showDone || !t.done);

    const head = subject
      ? `<div class="page-head">
          <div><div class="eyebrow">Предмет</div><h1>${esc(subject.name)}</h1></div>
          <div class="actions">
            <button class="btn" data-act="add-task-here">+ Задание</button>
            <button class="btn ghost" data-act="edit-subject">Переименовать</button>
            <button class="btn ghost danger" data-act="delete-subject">Удалить предмет</button>
          </div>
        </div>`
      : `<div class="eyebrow">Университет</div><h1>Все задания</h1>`;

    return `${head}
      <div class="stats">
        <div class="card stat"><div class="value">${open.length}</div><div class="label">${plural(open.length, "открытое задание", "открытых задания", "открытых заданий")}</div></div>
        <div class="card stat ${overdue ? "alert" : ""}"><div class="value">${overdue}</div><div class="label">просрочено</div></div>
        <div class="card stat"><div class="value">${week}</div><div class="label">дедлайн в ближайшие 7 дней</div></div>
        <div class="card stat"><div class="value">${high}</div><div class="label">с высоким приоритетом</div></div>
      </div>
      <div class="toolbar">
        ${[["all", "Все приоритеты"], ...PRIORITIES.map((p) => [p.value, p.label])].map(([v, l]) =>
          `<button class="chip-btn ${filter.priority === v ? "active" : ""}" data-prio="${v}">${l}</button>`).join("")}
        <label class="toggle"><input type="checkbox" class="check" id="show-done" ${filter.showDone ? "checked" : ""}> Показать выполненные</label>
      </div>
      ${sectionsHtml(visible, !subjectId, scope.length ? "Нет заданий по выбранному фильтру." : "Заданий пока нет — нажмите «+ Задание».")}`;
  }

  let lastView = "";
  function render() {
    const { subjectId } = route();
    const view = searchQuery ? "search" : location.hash;
    const scroll = window.scrollY;
    $("#main").innerHTML = searchQuery ? pageSearch(searchQuery) : pageTasks(subjectId);
    window.scrollTo(0, view === lastView ? scroll : 0);
    lastView = view;
    renderSidebar();
    renderOverall();
  }

  // ---------- Формы ----------
  async function editSubject(subject) {
    const r = await formDialog({
      title: subject ? "Переименовать предмет" : "Новый предмет",
      fields: [{ name: "name", label: "Название", value: subject?.name || "", required: true, placeholder: "Например, Математический анализ" }],
      submit: subject ? "Сохранить" : "Добавить",
    });
    if (!r) return;
    if (subject) subject.name = r.values.name;
    else {
      const s = { id: uid(), name: r.values.name, color: COLORS[D.subjects.length % COLORS.length], createdAt: new Date().toISOString() };
      D.subjects.push(s);
      location.hash = `#/subject/${s.id}`;
    }
    store.save();
    render();
  }

  async function deleteSubject(subject) {
    const n = D.tasks.filter((t) => t.subjectId === subject.id).length;
    const ok = await confirmDialog(`Удалить «${subject.name}»?`,
      n ? `Вместе с предметом удалятся ${n} ${plural(n, "задание", "задания", "заданий")}.` : "У предмета нет заданий.");
    if (!ok) return;
    D.subjects = D.subjects.filter((s) => s !== subject);
    D.tasks = D.tasks.filter((t) => t.subjectId !== subject.id);
    store.save();
    location.hash = "#/";
    render();
  }

  async function editTask(task) {
    if (!D.subjects.length) return editSubject(null);
    const r = await formDialog({
      title: task ? "Задание" : "Новое задание",
      fields: [
        { name: "title", label: "Что нужно сделать", value: task?.title || "", required: true, placeholder: "Например, Курсовая: глава 2" },
        { name: "subjectId", label: "Предмет", type: "select", value: task?.subjectId || route().subjectId || D.subjects[0].id,
          options: D.subjects.map((s) => ({ value: s.id, label: s.name })) },
        { name: "priority", label: "Приоритет", type: "segmented", value: task?.priority || "medium", options: PRIORITIES },
        { name: "planDate", label: "День выполнения", type: "date", value: task?.planDate || "", hint: "Когда хотите сделать задание — оно появится в этот день в расписании" },
        { name: "deadline", label: "Дедлайн", type: "date", value: task?.deadline || "", half: true },
        { name: "deadlineTime", label: "Время (необязательно)", type: "time", value: task?.deadlineTime || "", half: true },
        { name: "notes", label: "Заметки", type: "textarea", value: task?.notes || "", placeholder: "Ссылки, требования, детали" },
      ],
      submit: task ? "Сохранить" : "Добавить",
      deleteLabel: task ? "Удалить" : "",
    });
    if (!r) return;
    if (r.action === "delete") {
      D.tasks = D.tasks.filter((t) => t !== task);
    } else {
      const v = r.values;
      const fields = { title: v.title, subjectId: v.subjectId, priority: v.priority || "medium", planDate: v.planDate, deadline: v.deadline, deadlineTime: v.deadline ? v.deadlineTime : "", notes: v.notes };
      if (task) Object.assign(task, fields);
      else D.tasks.push({ id: uid(), ...fields, done: false, doneAt: "", createdAt: new Date().toISOString() });
    }
    store.save();
    render();
  }

  // ---------- События ----------
  document.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    const subject = subjectById(route().subjectId);
    if (act === "add-subject") return editSubject(null);
    if (act === "edit-subject") return editSubject(subject);
    if (act === "delete-subject") return deleteSubject(subject);
    if (act === "add-task-here") return editTask(null);
    if (act === "show-overdue") {
      e.preventDefault();
      clearSearch();
      if (location.hash && location.hash !== "#/") location.hash = "#/";
      filter = { priority: "all", showDone: false };
      render();
      return document.querySelector("#sec-overdue")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const prio = e.target.closest("[data-prio]");
    if (prio) { filter.priority = prio.dataset.prio; return render(); }

    const row = e.target.closest("[data-task]");
    if (row) {
      const task = D.tasks.find((t) => t.id === row.dataset.task);
      if (e.target.matches("[data-toggle]")) {
        task.done = !task.done;
        task.doneAt = task.done ? new Date().toISOString() : "";
        store.save();
        return render();
      }
      return editTask(task);
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "show-done") { filter.showDone = e.target.checked; render(); }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "search") { searchQuery = e.target.value.trim(); render(); }
  });
  function clearSearch() { searchQuery = ""; $("#search").value = ""; }
  // Переход по меню закрывает поиск
  $("#sidebar").addEventListener("click", (e) => { if (e.target.closest("a")) clearSearch(); });
  $("#primary-btn").addEventListener("click", () => editTask(null));
  window.addEventListener("hashchange", () => { clearSearch(); render(); });
  // Раз в минуту обновляем «просрочено / сегодня»
  setInterval(() => { if (!document.querySelector("dialog[open]")) render(); }, 60_000);

  render();
})();
