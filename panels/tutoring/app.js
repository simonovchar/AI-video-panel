(async () => {
  "use strict";

  const { esc, uid, dateKey, toDate, addDays, daysFromToday, shortDate, dayTitle, plural, formDialog, confirmDialog } = window.U;
  const $ = (sel) => document.querySelector(sel);
  const COLORS = ["#d97706", "#4f46e5", "#0e9f6e", "#db2777", "#0891b2", "#7c3aed", "#65a30d", "#2563eb"];

  const store = await PanelStore.open("tutoring", { version: 1, schools: [], subjects: [], lessons: [] }, (text, error) => {
    const el = $("#save-status");
    el.textContent = text;
    el.classList.toggle("error", error);
  });
  const D = store.data;

  // ---------- Данные ----------
  const schoolById = (id) => D.schools.find((s) => s.id === id);
  const subjectById = (id) => D.subjects.find((s) => s.id === id);
  const lessonById = (id) => D.lessons.find((l) => l.id === id);
  const subjectsOf = (schoolId) => D.subjects.filter((s) => s.schoolId === schoolId);
  const startOf = (l) => toDate(l.date, l.time);
  const endOf = (l) => new Date(+startOf(l) + (Number(l.duration) || 60) * 60_000);
  const byStart = (a, b) => startOf(a) - startOf(b);
  const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  // Готовность занятия и его проведение — разные вещи:
  // все задания выполнены → «Готов к проведению»; «Проведено» отмечается отдельной кнопкой.
  function statusOf(l) {
    if (l.conducted) return { key: "done", label: "Проведено" };
    const done = l.tasks.filter((t) => t.done).length;
    if (endOf(l) < new Date()) return { key: "late", label: "Ждёт отметки «Проведено»" };
    if (!l.tasks.length) return { key: "none", label: "Заданий нет" };
    if (done === l.tasks.length) return { key: "ready", label: "Готов к проведению" };
    return { key: "prep", label: `Подготовка ${done}/${l.tasks.length}` };
  }
  const upcoming = () => D.lessons.filter((l) => !l.conducted && endOf(l) >= new Date()).sort(byStart);
  const awaiting = () => D.lessons.filter((l) => !l.conducted && endOf(l) < new Date()).sort(byStart);
  const inDays = (l, n) => daysFromToday(l.date) <= n;

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
    const st = statusOf(l);
    const now = new Date();
    const live = !l.conducted && startOf(l) <= now && now <= endOf(l);
    return `<article class="card lesson status-${st.key}" style="--school:${school.color}" data-lesson="${l.id}">
      <div class="lesson-time">
        <b>${esc(l.time)}</b><span>–${hhmm(endOf(l))}</span>
        ${live ? `<span class="now">идёт сейчас</span>` : ""}
      </div>
      <div class="lesson-body">
        <div class="lesson-head">
          <div>
            <div class="lesson-title"><span class="school-name">${esc(school.name)} ·</span> ${esc(subject.name)}</div>
            ${l.topic ? `<div class="lesson-topic">${esc(l.topic)}</div>` : ""}
          </div>
          <span class="badge is-${st.key}">${st.label}</span>
        </div>
        ${l.tasks.length ? `<ul class="prep">${l.tasks.map((t) => `
          <li class="prep-item ${t.done ? "done" : ""}" data-ptask="${t.id}">
            <input type="checkbox" class="check" ${t.done ? "checked" : ""} tabindex="-1">
            <span>${esc(t.title)}</span>
            <button class="x" data-pdel title="Удалить задание" aria-label="Удалить задание">×</button>
          </li>`).join("")}</ul>` : ""}
        ${l.conducted ? "" : `<form class="prep-add" data-padd>
          <input class="inline-input" name="title" placeholder="+ Добавить задание к занятию и нажать Enter" autocomplete="off">
        </form>`}
        <div class="lesson-actions">
          ${l.conducted
            ? `<button class="btn small" data-act="unconduct">Вернуть в непроведённые</button>`
            : `<button class="btn small ok" data-act="conduct">✓ Отметить проведённым</button>`}
          <button class="btn small ghost" data-act="edit-lesson">Изменить</button>
        </div>
      </div>
    </article>`;
  }

  function lessonGroups(list) {
    const byDate = new Map();
    for (const l of list) {
      if (!byDate.has(l.date)) byDate.set(l.date, []);
      byDate.get(l.date).push(l);
    }
    return [...byDate].map(([date, ls]) => `
      <section class="group">
        <div class="group-head">${dayTitle(date)} <span class="n">${ls.length}</span></div>
        <div class="lessons">${ls.map(lessonCard).join("")}</div>
      </section>`).join("");
  }

  function emptySchools() {
    return `<div class="card empty-state">
      <h2>Добавьте первую IT-школу</h2>
      <p>Школа → предметы, которые вы в ней ведёте → занятия с датой, временем и заданиями для подготовки.</p>
      <button class="btn primary" data-act="add-school">+ Добавить школу</button>
    </div>`;
  }

  // ---------- Страницы ----------
  function pageUpcoming() {
    if (!D.schools.length) return emptySchools();
    const up = upcoming();
    const late = awaiting();
    const today = up.filter((l) => l.date === dateKey());
    const week = up.filter((l) => inDays(l, 7));
    const notReady = week.filter((l) => statusOf(l).key === "prep");
    const openTasks = week.reduce((n, l) => n + l.tasks.filter((t) => !t.done).length, 0);

    return `
      <div class="main-head"><h2>Ближайшие занятия</h2></div>
      <div class="stats">
        <div class="card stat"><div class="value">${today.length}</div><div class="label">${plural(today.length, "занятие", "занятия", "занятий")} сегодня</div></div>
        <div class="card stat"><div class="value">${week.length}</div><div class="label">в ближайшие 7 дней</div></div>
        <div class="card stat ${notReady.length ? "alert" : ""}"><div class="value">${notReady.length}</div><div class="label">ещё не готовы</div></div>
        <div class="card stat"><div class="value">${openTasks}</div><div class="label">${plural(openTasks, "задание", "задания", "заданий")} к подготовке</div></div>
      </div>
      ${late.length ? `<section class="group overdue">
        <div class="group-head">Прошли — отметьте, проведены ли <span class="n">${late.length}</span></div>
        <div class="lessons">${late.map(lessonCard).join("")}</div>
      </section>` : ""}
      ${up.length ? lessonGroups(up) : `<div class="card empty">Предстоящих занятий нет — нажмите «+ Занятие».</div>`}`;
  }

  function pageSchools() {
    if (!D.schools.length) return emptySchools();
    return `
      <div class="main-head">
        <h2>Школы и предметы</h2>
        <div class="actions"><button class="btn small" data-act="add-school">+ Школа</button></div>
      </div>
      <div class="schools">${D.schools.map((school) => {
        const subjects = subjectsOf(school.id);
        return `<section class="card school" style="--school:${school.color}" data-school="${school.id}">
          <div class="school-head">
            <h3>${esc(school.name)}</h3>
            <button class="btn small" data-act="add-subject">+ Предмет</button>
            <button class="btn small ghost" data-act="edit-school">Переименовать</button>
            <button class="btn small ghost" data-act="delete-school">Удалить</button>
          </div>
          ${subjects.length ? subjects.map((s) => {
            const next = upcoming().find((l) => l.subjectId === s.id);
            return `<div class="subject-row" data-subject="${s.id}">
              <a href="#/subject/${s.id}">
                <div class="name">${esc(s.name)}</div>
                <div class="meta">${next ? `Ближайшее: ${shortDate(next.date)}, ${next.time} · ${statusOf(next).label}` : "Нет запланированных занятий"}</div>
              </a>
              <button class="btn small" data-act="add-lesson-for">+ Занятие</button>
            </div>`;
          }).join("") : `<div class="empty">Предметов пока нет — добавьте предмет, который ведёте в этой школе.</div>`}
        </section>`;
      }).join("")}</div>`;
  }

  function pageSubject(subjectId) {
    const subject = subjectById(subjectId);
    const school = schoolById(subject.schoolId);
    const all = D.lessons.filter((l) => l.subjectId === subjectId);
    const up = all.filter((l) => !l.conducted && endOf(l) >= new Date()).sort(byStart);
    const past = all.filter((l) => l.conducted || endOf(l) < new Date()).sort((a, b) => byStart(b, a));
    return `
      <div class="main-head">
        <span class="dot" style="--dot:${school.color};width:14px;height:14px"></span>
        <h2>${esc(subject.name)} <span class="muted" style="font-weight:500;font-size:16px">· ${esc(school.name)}</span></h2>
        <div class="actions">
          <button class="btn small" data-act="add-lesson-for" data-subject="${subject.id}">+ Занятие</button>
          <button class="btn small ghost" data-act="edit-subject" data-subject="${subject.id}">Переименовать</button>
          <button class="btn small ghost" data-act="delete-subject" data-subject="${subject.id}">Удалить</button>
        </div>
      </div>
      <section class="group">
        <div class="group-head">Предстоящие <span class="n">${up.length}</span></div>
        ${up.length ? `<div class="lessons">${up.map(lessonCard).join("")}</div>` : `<div class="card empty">Предстоящих занятий нет.</div>`}
      </section>
      ${past.length ? `<section class="group">
        <div class="group-head">Прошедшие <span class="n">${past.length}</span></div>
        <div class="lessons">${past.map(lessonCard).join("")}</div>
      </section>` : ""}`;
  }

  function pageHistory() {
    const done = D.lessons.filter((l) => l.conducted).sort((a, b) => byStart(b, a));
    return `
      <div class="main-head"><h2>Проведённые занятия</h2></div>
      ${done.length ? `<ul class="card rows">${done.map((l) => {
        const subject = subjectById(l.subjectId);
        const school = schoolById(subject.schoolId);
        return `<li class="row" data-lesson="${l.id}" data-act="edit-lesson">
          <span class="dot" style="--dot:${school.color};margin-top:6px"></span>
          <div class="row-main">
            <div class="row-title">${esc(school.name)} · ${esc(subject.name)}</div>
            <div class="row-meta">${l.topic ? `<span>${esc(l.topic)}</span>` : ""}<span>${l.tasks.length ? `заданий: ${l.tasks.filter((t) => t.done).length}/${l.tasks.length}` : ""}</span></div>
          </div>
          <div class="row-side">${shortDate(l.date)}<small>${esc(l.time)}–${hhmm(endOf(l))}</small></div>
        </li>`;
      }).join("")}</ul>` : `<div class="card empty">Проведённых занятий пока нет.</div>`}`;
  }

  function renderSide() {
    const r = route();
    const week = upcoming().filter((l) => inDays(l, 7)).length;
    const link = (href, label, count, active, extra = "") =>
      `<a class="side-link ${extra} ${active ? "active" : ""}" href="${href}"><span class="label">${label}</span><span class="count">${count || ""}</span></a>`;
    $("#side").innerHTML = `
      ${link("#/", "Ближайшие занятия", week + awaiting().length, r.name === "")}
      ${link("#/schools", "Школы и предметы", "", r.name === "schools")}
      ${link("#/history", "Проведённые", D.lessons.filter((l) => l.conducted).length, r.name === "history")}
      ${D.schools.length ? `<div class="side-title">Школы</div>` : ""}
      ${D.schools.map((school) => `
        <a class="side-link" href="#/schools"><span class="dot" style="--dot:${school.color}"></span><span class="label">${esc(school.name)}</span></a>
        ${subjectsOf(school.id).map((s) => `
          <a class="side-link sub ${r.subjectId === s.id ? "active" : ""}" href="#/subject/${s.id}">
            <span class="label">${esc(s.name)}</span>
            <span class="count">${upcoming().filter((l) => l.subjectId === s.id).length || ""}</span>
          </a>`).join("")}`).join("")}
      <button class="side-link add" data-act="add-school">+ Добавить школу</button>`;
  }

  function render() {
    const r = route();
    renderSide();
    $("#main").innerHTML = r.name === "schools" ? pageSchools()
      : r.name === "subject" ? pageSubject(r.subjectId)
      : r.name === "history" ? pageHistory()
      : pageUpcoming();
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
    if (!D.subjects.length) {
      if (!D.schools.length) return editSchool(null);
      return editSubject(null);
    }
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
  document.addEventListener("click", (e) => {
    const actEl = e.target.closest("[data-act]");
    const act = actEl?.dataset.act;
    const lesson = lessonById(e.target.closest("[data-lesson]")?.dataset.lesson);
    const school = schoolById(e.target.closest("[data-school]")?.dataset.school);
    const subject = subjectById(actEl?.dataset.subject || e.target.closest("[data-subject]")?.dataset.subject);

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
      return render();
    }

    const ptask = e.target.closest("[data-ptask]");
    if (ptask && lesson) {
      const idx = lesson.tasks.findIndex((t) => t.id === ptask.dataset.ptask);
      if (e.target.closest("[data-pdel]")) lesson.tasks.splice(idx, 1);
      else {
        e.preventDefault();
        lesson.tasks[idx].done = !lesson.tasks[idx].done;
      }
      store.save();
      render();
    }
  });

  document.addEventListener("submit", (e) => {
    const form = e.target.closest("[data-padd]");
    if (!form) return;
    e.preventDefault();
    const title = form.elements.title.value.trim();
    if (!title) return;
    const lesson = lessonById(form.closest("[data-lesson]").dataset.lesson);
    lesson.tasks.push({ id: uid(), title, done: false });
    store.save();
    render();
    // Курсор остаётся в поле, чтобы добавлять задания подряд
    document.querySelector(`[data-lesson="${lesson.id}"] [data-padd] input`)?.focus();
  });

  $("#add-lesson-btn").addEventListener("click", () => editLesson(null));
  window.addEventListener("hashchange", render);
  setInterval(() => {
    const busy = document.querySelector("dialog[open]") || document.activeElement?.matches("input, textarea");
    if (!busy) render();
  }, 60_000);

  render();
})();
