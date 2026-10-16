(async () => {
  "use strict";

  const { esc, uid, dateKey, addDays, daysFromToday, shortDate, plural, formDialog } = window.U;
  const { endOf, hhmm, byStart, isPast, isLive, prepBadge, card, byDate } = window.Events;
  const $ = (sel) => document.querySelector(sel);
  const TICKETS = 40;

  // tickets: { "1": дата отметки, … } — отмеченные билеты; lessons — уроки практики
  const store = await PanelStore.open("rights", { version: 1, tickets: {}, lessons: [] }, Shell.status);
  const D = store.data;

  let ticketFilter = "all";

  // ---------- Данные ----------
  const lessonById = (id) => D.lessons.find((l) => l.id === id);
  const passed = () => Object.keys(D.tickets).filter((n) => Number(n) >= 1 && Number(n) <= TICKETS).length;
  const upcoming = () => D.lessons.filter((l) => !l.done && !isPast(l)).sort(byStart);
  const awaiting = () => D.lessons.filter((l) => !l.done && isPast(l)).sort(byStart);

  const route = () => (location.hash.startsWith("#/practice") ? "practice" : "theory");

  // ---------- Теория ----------
  function pageTheory() {
    const n = passed();
    const pct = Math.round((n / TICKETS) * 100);
    const nums = Array.from({ length: TICKETS }, (_, i) => i + 1)
      .filter((i) => ticketFilter === "all" || (ticketFilter === "done" ? D.tickets[i] : !D.tickets[i]));
    return `<div class="eyebrow">Права</div><h1>Теория — ${TICKETS} билетов</h1>
      <div class="stats">
        <div class="card stat"><div class="value">${n}</div><div class="label">${plural(n, "билет пройден", "билета пройдено", "билетов пройдено")}</div></div>
        <div class="card stat"><div class="value">${TICKETS - n}</div><div class="label">осталось</div></div>
        <div class="card stat"><div class="value">${pct}%</div><div class="label">теории пройдено</div></div>
        <div class="card stat"><div class="value">${lastPassedText()}</div><div class="label">последний пройденный</div></div>
      </div>
      <div class="theory-progress"><div class="bar"><span style="width:${pct}%"></span></div><span class="txt">${n} из ${TICKETS}</span></div>
      <div class="toolbar">
        ${[["all", "Все"], ["todo", "Не пройдены"], ["done", "Пройдены"]].map(([v, l]) =>
          `<button class="chip-btn ${ticketFilter === v ? "active" : ""}" data-filter="${v}">${l}</button>`).join("")}
      </div>
      ${nums.length ? `<div class="tickets">${nums.map((i) => {
        const at = D.tickets[i];
        return `<label class="card ticket ${at ? "checked" : ""}">
          <input type="checkbox" class="check" data-ticket="${i}" ${at ? "checked" : ""}>
          <div><div class="t-title">Билет ${i}</div><div class="t-sub">${at ? `пройден ${shortDate(dateKey(new Date(at)))}` : "не пройден"}</div></div>
        </label>`;
      }).join("")}</div>` : `<div class="card empty">${ticketFilter === "done" ? "Пройденных билетов пока нет." : "Все билеты пройдены 🎉"}</div>`}`;
  }

  function lastPassedText() {
    const last = Object.entries(D.tickets).sort((a, b) => b[1].localeCompare(a[1]))[0];
    return last ? `№${last[0]}` : "—";
  }

  // ---------- Практика ----------
  function lessonCard(l) {
    const badge = l.done ? { cls: "is-done", label: "Урок пройден" }
      : isPast(l) ? { cls: "is-late", label: "Прошёл — отметьте" }
      : prepBadge(l.tasks, "Готов к уроку");
    return card({
      id: l.id,
      time: l.time,
      endTime: hhmm(endOf(l)),
      live: !l.done && isLive(l),
      done: l.done,
      title: l.topic || "Урок вождения",
      subHtml: l.place ? esc(l.place) : "",
      notes: l.notes,
      badges: [badge],
      checklist: { title: "Задания перед уроком", items: l.tasks, placeholder: l.done ? "" : "+ Добавить задание перед уроком и нажать Enter" },
      actions: [
        l.done ? { act: "undone", label: "Вернуть в предстоящие" } : { act: "done", label: "✓ Урок пройден", cls: "ok" },
        { act: "edit-lesson", label: "Изменить", cls: "ghost" },
      ],
    });
  }

  function pagePractice() {
    const up = upcoming();
    const late = awaiting();
    const done = D.lessons.filter((l) => l.done).sort((a, b) => byStart(b, a));
    const week = up.filter((l) => daysFromToday(l.date) <= 7);
    const openTasks = up.reduce((n, l) => n + l.tasks.filter((t) => !t.done).length, 0);
    return `<div class="eyebrow">Права</div><h1>Практика</h1>
      <div class="stats">
        <div class="card stat"><div class="value">${up.length}</div><div class="label">${plural(up.length, "урок", "урока", "уроков")} впереди</div></div>
        <div class="card stat"><div class="value">${week.length}</div><div class="label">в ближайшие 7 дней</div></div>
        <div class="card stat ${openTasks ? "alert" : ""}"><div class="value">${openTasks}</div><div class="label">${plural(openTasks, "задание", "задания", "заданий")} к урокам</div></div>
        <div class="card stat"><div class="value">${done.length}</div><div class="label">${plural(done.length, "урок пройден", "урока пройдено", "уроков пройдено")}</div></div>
      </div>
      ${late.length ? `<section class="group late">
        <div class="group-head">Прошли — отметьте, состоялись ли <span class="n">${late.length}</span></div>
        <div class="events">${late.map(lessonCard).join("")}</div>
      </section>` : ""}
      ${up.length ? byDate(up, lessonCard) : `<div class="card empty" style="margin-bottom:22px">Уроков не запланировано — нажмите «+ Урок».</div>`}
      ${done.length ? `<section class="group">
        <div class="group-head">Пройденные уроки <span class="n">${done.length}</span></div>
        <div class="card list-card">${done.map((l) => `
          <div class="entity" data-event="${l.id}" data-act="edit-lesson" style="cursor:pointer">
            <div class="entity-main">
              <div class="entity-title">${esc(l.topic || "Урок вождения")}</div>
              <div class="entity-sub">${[l.place, l.notes].filter(Boolean).map(esc).join(" · ")}</div>
            </div>
            <div class="when">${shortDate(l.date)}<small>${esc(l.time)}</small></div>
          </div>`).join("")}</div>
      </section>` : ""}`;
  }

  // ---------- Каркас ----------
  function renderSidebar() {
    const r = route();
    const late = awaiting().length;
    $("#nav").innerHTML = `
      <a href="#/" class="${r === "theory" ? "active" : ""}">Теория<span class="count">${passed()}/${TICKETS}</span></a>
      <a href="#/practice" class="${r === "practice" ? "active" : ""}">Практика<span class="count ${late ? "alert" : ""}">${late ? `${late} не отмеч.` : upcoming().length || ""}</span></a>`;
    const next = upcoming().slice(0, 3);
    $("#side-list").innerHTML = next.length ? `
      <div class="block-title"><span>Ближайшие уроки</span></div>
      ${next.map((l) => `<a href="#/practice" class="stage-link" style="--subj:var(--accent)">
        <span class="num">${Number(l.date.slice(8))}</span>
        <span class="label">${esc(shortDate(l.date))}, ${esc(l.time)}${l.topic ? ` · ${esc(l.topic)}` : ""}</span>
      </a>`).join("")}` : "";
  }

  function renderOverall() {
    const n = passed();
    const next = upcoming()[0];
    $("#overall").innerHTML = `<div class="bar"><span style="width:${(n / TICKETS) * 100}%"></span></div>
      <span class="overall-text">Билеты <b>${n}/${TICKETS}</b><span class="hide-sm"> · ${next
        ? `следующий урок <b>${shortDate(next.date)}, ${next.time}</b>` : "уроков не запланировано"}</span></span>`;
  }

  let lastView = "";
  function render() {
    const scroll = window.scrollY;
    $("#main").innerHTML = route() === "practice" ? pagePractice() : pageTheory();
    window.scrollTo(0, location.hash === lastView ? scroll : 0);
    lastView = location.hash;
    renderSidebar();
    renderOverall();
  }

  // ---------- Формы ----------
  async function editLesson(lesson) {
    const last = D.lessons.slice().sort(byStart).at(-1);
    const fields = [
      { name: "date", label: "Дата", type: "date", value: lesson?.date || dateKey(), required: true, half: true },
      { name: "time", label: "Начало", type: "time", value: lesson?.time || last?.time || "10:00", required: true, half: true },
      { name: "duration", label: "Длительность, мин", type: "number", value: lesson?.duration || last?.duration || 90, min: 15, max: 600, step: 15, half: true },
      { name: "topic", label: "Что отрабатываем", value: lesson?.topic || "", placeholder: "Например, Параллельная парковка",
        suggestions: ["Площадка", "Город", "Параллельная парковка", "Парковка задним ходом", "Эстакада", "Разворот в ограниченном пространстве", "Перекрёстки", "Экзаменационный маршрут"] },
      { name: "place", label: "Инструктор / место встречи", value: lesson?.place || last?.place || "", placeholder: "Необязательно" },
    ];
    if (!lesson) {
      fields.push(
        { name: "tasks", label: "Задания перед уроком", type: "textarea", rows: 4, value: "", placeholder: "Каждое задание с новой строки:\nПовторить билеты 1–5\nПосмотреть видео про парковку" },
        { name: "repeat", label: "Повторять каждую неделю", type: "number", value: 1, min: 1, max: 52, half: true, hint: "1 — только этот урок" },
      );
    }
    fields.push({ name: "notes", label: lesson ? "Заметки и итоги" : "Заметки", type: "textarea", rows: 2, value: lesson?.notes || "", placeholder: "Что получилось, над чем поработать" });
    const r = await formDialog({ title: lesson ? "Урок" : "Новый урок", fields, submit: lesson ? "Сохранить" : "Добавить", deleteLabel: lesson ? "Удалить урок" : "" });
    if (!r) return;
    if (r.action === "delete") D.lessons = D.lessons.filter((l) => l !== lesson);
    else {
      const v = r.values;
      const base = { time: v.time, duration: Math.max(15, Number(v.duration) || 90), topic: v.topic, place: v.place, notes: v.notes };
      if (lesson) Object.assign(lesson, base, { date: v.date });
      else {
        const titles = (v.tasks || "").split("\n").map((s) => s.trim()).filter(Boolean);
        const repeat = Math.min(52, Math.max(1, Number(v.repeat) || 1));
        for (let i = 0; i < repeat; i++) {
          D.lessons.push({ id: uid(), ...base, date: addDays(v.date, 7 * i), tasks: titles.map((title) => ({ id: uid(), title, done: false })), done: false, doneAt: "" });
        }
      }
      if (route() !== "practice") location.hash = "#/practice";
    }
    store.save();
    render();
  }

  // ---------- События ----------
  window.Events.bindChecklists({
    toggle(id, itemId) { const t = lessonById(id).tasks.find((x) => x.id === itemId); t.done = !t.done; store.save(); render(); },
    remove(id, itemId) { const l = lessonById(id); l.tasks = l.tasks.filter((x) => x.id !== itemId); store.save(); render(); },
    add(id, title) { lessonById(id).tasks.push({ id: uid(), title, done: false }); store.save(); render(); },
  });

  document.addEventListener("change", (e) => {
    const t = e.target.closest("[data-ticket]");
    if (!t) return;
    if (t.checked) D.tickets[t.dataset.ticket] = new Date().toISOString();
    else delete D.tickets[t.dataset.ticket];
    store.save();
    render();
  });

  document.addEventListener("click", (e) => {
    const f = e.target.closest("[data-filter]");
    if (f) { ticketFilter = f.dataset.filter; return render(); }
    const act = e.target.closest("[data-act]")?.dataset.act;
    const lesson = lessonById(e.target.closest("[data-event]")?.dataset.event);
    if (act === "edit-lesson") return editLesson(lesson);
    if (act === "done" || act === "undone") {
      lesson.done = act === "done";
      lesson.doneAt = lesson.done ? new Date().toISOString() : "";
      store.save();
      render();
    }
  });

  $("#primary-btn").addEventListener("click", () => editLesson(null));
  window.addEventListener("hashchange", render);
  setInterval(() => {
    const busy = document.querySelector("dialog[open]") || document.activeElement?.matches("input, textarea");
    if (!busy) render();
  }, 60_000);

  render();
})();
