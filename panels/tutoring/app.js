(async () => {
  "use strict";

  const { esc, uid, dateKey, addDays, daysFromToday, shortDate, plural, formDialog, confirmDialog } = window.U;
  const { endOf, hhmm, byStart, isPast, isLive, prepBadge, card, byDate } = window.Events;
  const $ = (sel) => document.querySelector(sel);
  const COLORS = ["#d97706", "#4f46e5", "#0e9f6e", "#db2777", "#0891b2", "#7c3aed", "#65a30d", "#2563eb"];

  const store = await PanelStore.open("tutoring", { version: 1, schools: [], subjects: [], lessons: [] }, Shell.status);
  const D = store.data;

  // ---------- Данные ----------
  const schoolById = (id) => D.schools.find((s) => s.id === id);
  const subjectById = (id) => D.subjects.find((s) => s.id === id);
  const lessonById = (id) => D.lessons.find((l) => l.id === id);
  const subjectsOf = (schoolId) => D.subjects.filter((s) => s.schoolId === schoolId);
  const upcoming = () => D.lessons.filter((l) => !l.conducted && !isPast(l)).sort(byStart);
  const awaiting = () => D.lessons.filter((l) => !l.conducted && isPast(l)).sort(byStart);
  const inWeek = (l) => daysFromToday(l.date) <= 7;

  // Готовность и проведение — разные вещи: все задания выполнены → «Готов к проведению»,
  // «Проведено» отмечается отдельной кнопкой.
  function badgeOf(l) {
    if (l.conducted) return { cls: "is-done", label: "Проведено" };
    if (isPast(l)) return { cls: "is-late", label: "Ждёт отметки «Проведено»" };
    return prepBadge(l.tasks, "Готов к проведению") || { cls: "", label: "Заданий нет" };
  }

  // ---------- Маршрут ----------
  function route() {
    const [, name = "", arg = ""] = location.hash.match(/^#\/([^/]*)\/?(.*)$/) || [];
    if (name === "subject" && subjectById(arg)) return { name, subjectId: arg };
    if (name === "schools" || name === "history") return { name };
    return { name: "" };
  }

  // ---------- Рендер: общие куски ----------
  function lessonCard(l) {
    const subject = subjectById(l.subjectId);
    const school = schoolById(subject.schoolId);
    return card({
      id: l.id,
      color: school.color,
      time: l.time,
      endTime: hhmm(endOf(l)),
      live: !l.conducted && isLive(l),
      done: l.conducted,
      pre: school.name,
      title: subject.name,
      subHtml: l.topic ? esc(l.topic) : "",
      badges: [badgeOf(l)],
      checklist: {
        title: "Подготовка",
        items: l.tasks,
        placeholder: l.conducted ? "" : "+ Добавить задание к занятию и нажать Enter",
      },
      actions: [
        l.conducted
          ? { act: "unconduct", label: "Вернуть в непроведённые" }
          : { act: "conduct", label: "✓ Отметить проведённым", cls: "ok" },
        { act: "edit-lesson", label: "Изменить", cls: "ghost" },
      ],
    });
  }

  const emptySchools = () => `<div class="card empty-state">
      <h2>Добавьте первую IT-школу</h2>
      <p>Школа → предметы, которые вы в ней ведёте → занятия с датой, временем и заданиями для подготовки.</p>
      <button class="btn primary" data-act="add-school">+ Добавить школу</button>
    </div>`;

  // ---------- Страницы ----------
  function pageUpcoming() {
    const head = `<div class="eyebrow">Репетиторство</div><h1>Ближайшие занятия</h1>`;
    if (!D.schools.length) return head + emptySchools();
    const up = upcoming();
    const late = awaiting();
    const today = up.filter((l) => l.date === dateKey());
    const week = up.filter(inWeek);
    const notReady = week.filter((l) => badgeOf(l).cls === "is-prep");
    const openTasks = week.reduce((n, l) => n + l.tasks.filter((t) => !t.done).length, 0);
    return `${head}
      <div class="stats">
        <div class="card stat"><div class="value">${today.length}</div><div class="label">${plural(today.length, "занятие", "занятия", "занятий")} сегодня</div></div>
        <div class="card stat"><div class="value">${week.length}</div><div class="label">в ближайшие 7 дней</div></div>
        <div class="card stat ${notReady.length ? "alert" : ""}"><div class="value">${notReady.length}</div><div class="label">ещё не готовы</div></div>
        <div class="card stat"><div class="value">${openTasks}</div><div class="label">${plural(openTasks, "задание", "задания", "заданий")} к подготовке</div></div>
      </div>
      ${late.length ? `<section class="group late">
        <div class="group-head">Прошли — отметьте, проведены ли <span class="n">${late.length}</span></div>
        <div class="events">${late.map(lessonCard).join("")}</div>
      </section>` : ""}
      ${up.length ? byDate(up, lessonCard) : `<div class="card empty">Предстоящих занятий нет — нажмите «+ Занятие».</div>`}`;
  }

  function pageSchools() {
    const head = `<div class="page-head">
        <div><div class="eyebrow">Репетиторство</div><h1>Школы и предметы</h1></div>
        ${D.schools.length ? `<div class="actions"><button class="btn" data-act="add-school">+ Школа</button></div>` : ""}
      </div>`;
    if (!D.schools.length) return head + emptySchools();
    return `${head}
      <div class="sections" style="margin-top:22px">${D.schools.map((school) => {
        const subjects = subjectsOf(school.id);
        return `<section class="card sec" data-school="${school.id}" style="border-top:4px solid ${school.color}">
          <div class="sec-head">
            <h2>${esc(school.name)}</h2>
            <button class="btn small" data-act="add-subject">+ Предмет</button>
            <button class="btn small ghost" data-act="edit-school">Переименовать</button>
            <button class="btn small ghost danger" data-act="delete-school">Удалить</button>
          </div>
          ${subjects.length ? `<div class="list-card">${subjects.map((s) => {
            const next = upcoming().find((l) => l.subjectId === s.id);
            return `<div class="entity" data-subject="${s.id}">
              <a class="entity-main" href="#/subject/${s.id}">
                <div class="entity-title">${esc(s.name)}</div>
                <div class="entity-sub">${next ? `Ближайшее: ${shortDate(next.date)}, ${next.time} · ${badgeOf(next).label}` : "Нет запланированных занятий"}</div>
              </a>
              <div class="entity-actions"><button class="btn small" data-act="add-lesson-for">+ Занятие</button></div>
            </div>`;
          }).join("")}</div>` : `<div class="empty">Предметов пока нет — добавьте предмет, который ведёте в этой школе.</div>`}
        </section>`;
      }).join("")}</div>`;
  }

  function pageSubject(subjectId) {
    const subject = subjectById(subjectId);
    const school = schoolById(subject.schoolId);
    const all = D.lessons.filter((l) => l.subjectId === subjectId);
    const up = all.filter((l) => !l.conducted && !isPast(l)).sort(byStart);
    const past = all.filter((l) => l.conducted || isPast(l)).sort((a, b) => byStart(b, a));
    return `
      <div class="page-head">
        <div><div class="eyebrow">${esc(school.name)}</div><h1>${esc(subject.name)}</h1></div>
        <div class="actions">
          <button class="btn" data-act="add-lesson-for" data-subject="${subject.id}">+ Занятие</button>
          <button class="btn ghost" data-act="edit-subject" data-subject="${subject.id}">Изменить</button>
          <button class="btn ghost danger" data-act="delete-subject" data-subject="${subject.id}">Удалить</button>
        </div>
      </div>
      <div style="margin-top:22px">
        ${up.length ? byDate(up, lessonCard) : `<div class="card empty" style="margin-bottom:22px">Предстоящих занятий нет.</div>`}
        ${past.length ? `<section class="group">
          <div class="group-head">Прошедшие <span class="n">${past.length}</span></div>
          <div class="events">${past.map(lessonCard).join("")}</div>
        </section>` : ""}
      </div>`;
  }

  function pageHistory() {
    const done = D.lessons.filter((l) => l.conducted).sort((a, b) => byStart(b, a));
    return `<div class="eyebrow">Репетиторство</div><h1>Проведённые занятия</h1>
      <div style="margin-top:22px">${done.length ? `<div class="card list-card">${done.map((l) => {
        const subject = subjectById(l.subjectId);
        const school = schoolById(subject.schoolId);
        return `<div class="entity" data-event="${l.id}" data-act="edit-lesson" style="cursor:pointer">
          <span class="dot" style="width:10px;height:10px;border-radius:50%;background:${school.color}"></span>
          <div class="entity-main">
            <div class="entity-title">${esc(school.name)} · ${esc(subject.name)}</div>
            <div class="entity-sub">${[l.topic, l.tasks.length ? `заданий: ${l.tasks.filter((t) => t.done).length}/${l.tasks.length}` : ""].filter(Boolean).map(esc).join(" · ")}</div>
          </div>
          <div class="when">${shortDate(l.date)}<small>${esc(l.time)}–${hhmm(endOf(l))}</small></div>
        </div>`;
      }).join("")}</div>` : `<div class="card empty">Проведённых занятий пока нет.</div>`}</div>`;
  }

  function renderSidebar() {
    const r = route();
    const week = upcoming().filter(inWeek).length;
    const late = awaiting().length;
    $("#nav").innerHTML = `
      <a href="#/" class="${r.name === "" ? "active" : ""}">Ближайшие занятия<span class="count ${late ? "alert" : ""}">${late ? `${late} не отмеч.` : week || ""}</span></a>
      <a href="#/schools" class="${r.name === "schools" ? "active" : ""}">Школы и предметы</a>
      <a href="#/history" class="${r.name === "history" ? "active" : ""}">Проведённые<span class="count">${D.lessons.filter((l) => l.conducted).length || ""}</span></a>`;
    $("#side-list").innerHTML = `
      ${D.schools.map((school) => `
        <div class="block-title" style="margin-top:12px"><span>${esc(school.name)}</span><span>${subjectsOf(school.id).length || ""}</span></div>
        ${subjectsOf(school.id).map((s) => {
          const n = upcoming().filter((l) => l.subjectId === s.id).length;
          return `<a href="#/subject/${s.id}" class="stage-link ${r.subjectId === s.id ? "active" : ""}" style="--subj:${school.color}" title="${esc(s.name)}">
            <span class="num">${esc(s.name.trim()[0] || "?").toUpperCase()}</span>
            <span class="label">${esc(s.name)}</span>
            <span class="pct">${n || ""}</span>
          </a>`;
        }).join("")}`).join("")}
      <button class="stage-link add" data-act="add-school"><span class="num">+</span><span class="label">Добавить школу</span></button>`;
  }

  function renderOverall() {
    const week = upcoming().filter(inWeek);
    const ready = week.filter((l) => badgeOf(l).cls !== "is-prep").length;
    const late = awaiting().length;
    const pct = week.length ? Math.round((ready / week.length) * 100) : 0;
    $("#overall").innerHTML = `<div class="bar"><span style="width:${pct}%"></span></div>
      <span class="overall-text"><b>${week.length}</b> ${plural(week.length, "занятие", "занятия", "занятий")} за 7 дней
        <span class="hide-sm">· готово <b>${ready}/${week.length}</b></span>${late ? ` · не отмечено <b class="alert">${late}</b>` : ""}</span>`;
  }

  let lastView = "";
  function render() {
    const r = route();
    const scroll = window.scrollY;
    $("#main").innerHTML = r.name === "schools" ? pageSchools()
      : r.name === "subject" ? pageSubject(r.subjectId)
      : r.name === "history" ? pageHistory()
      : pageUpcoming();
    window.scrollTo(0, location.hash === lastView ? scroll : 0);
    lastView = location.hash;
    renderSidebar();
    renderOverall();
  }

  // ---------- Формы ----------
  async function editSchool(school) {
    const r = await formDialog({
      title: school ? "Переименовать школу" : "Новая IT-школа",
      fields: [{ name: "name", label: "Название школы", value: school?.name || "", required: true }],
      submit: school ? "Сохранить" : "Добавить",
    });
    if (!r) return;
    if (school) school.name = r.values.name;
    else {
      D.schools.push({ id: uid(), name: r.values.name, color: COLORS[D.schools.length % COLORS.length] });
      if (location.hash !== "#/schools") location.hash = "#/schools";
    }
    store.save();
    render();
  }

  async function deleteSchool(school) {
    const subjects = subjectsOf(school.id);
    const lessons = D.lessons.filter((l) => subjects.some((s) => s.id === l.subjectId));
    const ok = await confirmDialog(`Удалить школу «${school.name}»?`,
      `Удалятся предметы (${subjects.length}) и занятия (${lessons.length}) этой школы.`);
    if (!ok) return;
    D.schools = D.schools.filter((s) => s !== school);
    D.subjects = D.subjects.filter((s) => s.schoolId !== school.id);
    D.lessons = D.lessons.filter((l) => !lessons.includes(l));
    store.save();
    render();
  }

  async function editSubject(subject, schoolId) {
    if (!D.schools.length) return editSchool(null);
    const r = await formDialog({
      title: subject ? "Предмет" : "Новый предмет",
      fields: [
        { name: "name", label: "Предмет, который вы ведёте", value: subject?.name || "", required: true, placeholder: "Например, Python для начинающих" },
        { name: "schoolId", label: "Школа", type: "select", value: subject?.schoolId || schoolId || D.schools[0].id,
          options: D.schools.map((s) => ({ value: s.id, label: s.name })) },
      ],
      submit: subject ? "Сохранить" : "Добавить",
    });
    if (!r) return;
    if (subject) Object.assign(subject, r.values);
    else D.subjects.push({ id: uid(), ...r.values });
    store.save();
    render();
  }

  async function deleteSubject(subject) {
    const n = D.lessons.filter((l) => l.subjectId === subject.id).length;
    const ok = await confirmDialog(`Удалить предмет «${subject.name}»?`,
      n ? `Вместе с ним удалятся ${n} ${plural(n, "занятие", "занятия", "занятий")}.` : "Занятий у предмета нет.");
    if (!ok) return;
    D.subjects = D.subjects.filter((s) => s !== subject);
    D.lessons = D.lessons.filter((l) => l.subjectId !== subject.id);
    store.save();
    location.hash = "#/schools";
    render();
  }

  async function editLesson(lesson, subjectId) {
    if (!D.subjects.length) return D.schools.length ? editSubject(null) : editSchool(null);
    const subjectOptions = D.subjects.map((s) => ({ value: s.id, label: s.name, group: schoolById(s.schoolId).name }));
    // Время по умолчанию — как у последнего занятия этого предмета
    const defaultSubject = lesson?.subjectId || subjectId || route().subjectId || D.subjects[0].id;
    const last = D.lessons.filter((l) => l.subjectId === defaultSubject).sort(byStart).at(-1);
    const fields = [
      { name: "subjectId", label: "Школа и предмет", type: "select", value: defaultSubject, options: subjectOptions },
      { name: "date", label: "Дата", type: "date", value: lesson?.date || dateKey(), required: true, half: true },
      { name: "time", label: "Начало", type: "time", value: lesson?.time || last?.time || "18:00", required: true, half: true },
      { name: "duration", label: "Длительность, мин", type: "number", value: lesson?.duration || last?.duration || 60, min: 5, max: 600, step: 5, half: true },
      { name: "topic", label: "Тема занятия", value: lesson?.topic || "", placeholder: "Необязательно" },
    ];
    if (!lesson) {
      fields.push(
        { name: "tasks", label: "Что нужно сделать к занятию", type: "textarea", rows: 4, value: "", placeholder: "Каждое задание с новой строки:\nПодготовить презентацию\nПроверить домашние работы" },
        { name: "repeat", label: "Повторять каждую неделю", type: "number", value: 1, min: 1, max: 52, half: true, hint: "1 — только это занятие; 10 — занятие на 10 недель вперёд (задания скопируются в каждое)" },
      );
    }
    const r = await formDialog({
      title: lesson ? "Занятие" : "Новое занятие",
      fields,
      submit: lesson ? "Сохранить" : "Добавить",
      deleteLabel: lesson ? "Удалить занятие" : "",
    });
    if (!r) return;
    if (r.action === "delete") {
      D.lessons = D.lessons.filter((l) => l !== lesson);
    } else {
      const v = r.values;
      const base = { subjectId: v.subjectId, time: v.time, duration: Math.max(5, Number(v.duration) || 60), topic: v.topic };
      if (lesson) Object.assign(lesson, base, { date: v.date });
      else {
        const titles = (v.tasks || "").split("\n").map((s) => s.trim()).filter(Boolean);
        const repeat = Math.min(52, Math.max(1, Number(v.repeat) || 1));
        for (let i = 0; i < repeat; i++) {
          D.lessons.push({
            id: uid(), ...base, date: addDays(v.date, 7 * i),
            tasks: titles.map((title) => ({ id: uid(), title, done: false })),
            conducted: false, conductedAt: "",
          });
        }
      }
    }
    store.save();
    render();
  }

  // ---------- События ----------
  window.Events.bindChecklists({
    toggle(lessonId, taskId) { const t = lessonById(lessonId).tasks.find((x) => x.id === taskId); t.done = !t.done; store.save(); render(); },
    remove(lessonId, taskId) { const l = lessonById(lessonId); l.tasks = l.tasks.filter((x) => x.id !== taskId); store.save(); render(); },
    add(lessonId, title) { lessonById(lessonId).tasks.push({ id: uid(), title, done: false }); store.save(); render(); },
  });

  document.addEventListener("click", (e) => {
    const actEl = e.target.closest("[data-act]");
    if (!actEl) return;
    const act = actEl.dataset.act;
    const lesson = lessonById(e.target.closest("[data-event]")?.dataset.event);
    const school = schoolById(e.target.closest("[data-school]")?.dataset.school);
    const subject = subjectById(actEl.dataset.subject || e.target.closest("[data-subject]")?.dataset.subject);

    if (act === "add-school") return editSchool(null);
    if (act === "edit-school") return editSchool(school);
    if (act === "delete-school") return deleteSchool(school);
    if (act === "add-subject") return editSubject(null, school?.id);
    if (act === "edit-subject") return editSubject(subject);
    if (act === "delete-subject") return deleteSubject(subject);
    if (act === "add-lesson-for") return editLesson(null, subject?.id);
    if (act === "edit-lesson") return editLesson(lesson);
    if (act === "conduct" || act === "unconduct") {
      lesson.conducted = act === "conduct";
      lesson.conductedAt = lesson.conducted ? new Date().toISOString() : "";
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
