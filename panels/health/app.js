(async () => {
  "use strict";

  const { esc, uid, dateKey, daysFromToday, shortDate, plural, formDialog, confirmDialog } = window.U;
  const { endOf, hhmm, byStart, isPast, isLive, prepBadge, card, byDate } = window.Events;
  const $ = (sel) => document.querySelector(sel);
  const COLORS = ["#e11d48", "#0891b2", "#7c3aed", "#0e9f6e", "#d97706", "#2563eb", "#db2777", "#65a30d"];

  const store = await PanelStore.open("health", { version: 1, clinics: [], doctors: [], tests: [], visits: [] }, Shell.status);
  const D = store.data;

  // ---------- Данные ----------
  const clinicById = (id) => D.clinics.find((c) => c.id === id);
  const doctorById = (id) => D.doctors.find((d) => d.id === id);
  const testById = (id) => D.tests.find((t) => t.id === id);
  const visitById = (id) => D.visits.find((v) => v.id === id);
  const targetOf = (v) => (v.kind === "doctor" ? doctorById(v.refId) : testById(v.refId));
  const clinicOf = (v) => clinicById(targetOf(v)?.clinicId);
  const visitsOfClinic = (clinicId) => D.visits.filter((v) => clinicOf(v)?.id === clinicId);
  const upcoming = (list = D.visits) => list.filter((v) => !v.done && !isPast(v)).sort(byStart);
  const awaiting = (list = D.visits) => list.filter((v) => !v.done && isPast(v)).sort(byStart);
  const doctorLabel = (d) => [d.specialty, d.name].filter(Boolean).join(" — ");

  // ---------- Маршрут ----------
  function route() {
    const [, name = "", arg = "", tab = ""] = location.hash.match(/^#\/([^/]*)\/?([^/]*)\/?(.*)$/) || [];
    if (name === "clinic" && clinicById(arg)) return { name, clinicId: arg, tab: ["tests", "visits"].includes(tab) ? tab : "doctors" };
    if (name === "history") return { name };
    return { name: "" };
  }

  // ---------- Карточка записи ----------
  function visitCard(v) {
    const target = targetOf(v);
    const clinic = clinicOf(v);
    const isDoctor = v.kind === "doctor";
    const sub = [clinic.address, v.room ? `каб. ${v.room}` : "", clinic.phone].filter(Boolean).map(esc).join(" · ");
    const status = v.done
      ? { cls: "is-done", label: isDoctor ? "Был на приёме" : "Анализ сдан" }
      : isPast(v) ? { cls: "is-late", label: "Прошло — отметьте" } : prepBadge(v.prep, "Всё готово");
    return card({
      id: v.id,
      color: clinic.color,
      time: v.time,
      live: !v.done && isLive(v),
      done: v.done,
      pre: clinic.name,
      title: isDoctor ? doctorLabel(target) : `Анализ: ${target.name}`,
      subHtml: sub,
      notes: v.notes,
      badges: [{ cls: "is-kind", label: isDoctor ? "Врач" : "Анализ" }, status],
      checklist: { title: "Что подготовить", items: v.prep, placeholder: v.done ? "" : "+ Что взять или подготовить (полис, натощак…) и Enter" },
      actions: [
        v.done
          ? { act: "undone", label: "Вернуть в предстоящие" }
          : { act: "done", label: isDoctor ? "✓ Был на приёме" : "✓ Анализ сдан", cls: "ok" },
        { act: "edit-visit", label: "Изменить", cls: "ghost" },
      ],
    });
  }

  const visitsHtml = (list, emptyText) => {
    const late = awaiting(list);
    const up = upcoming(list);
    if (!late.length && !up.length) return `<div class="card empty">${emptyText}</div>`;
    return `${late.length ? `<section class="group late">
        <div class="group-head">Прошли — отметьте, были ли <span class="n">${late.length}</span></div>
        <div class="events">${late.map(visitCard).join("")}</div>
      </section>` : ""}${byDate(up, visitCard)}`;
  };

  const emptyClinics = () => `<div class="card empty-state">
      <h2>Добавьте поликлинику</h2>
      <p>В поликлинике — врачи и анализы. К ним вы записываетесь, а здесь видите, когда и куда идти.</p>
      <button class="btn primary" data-act="add-clinic">+ Добавить поликлинику</button>
    </div>`;

  // ---------- Страницы ----------
  function pageVisits() {
    const head = `<div class="eyebrow">Здоровье</div><h1>Мои записи</h1>`;
    if (!D.clinics.length) return head + emptyClinics();
    const up = upcoming();
    const week = up.filter((v) => daysFromToday(v.date) <= 7);
    const late = awaiting();
    return `${head}
      <div class="stats">
        <div class="card stat"><div class="value">${week.length}</div><div class="label">${plural(week.length, "запись", "записи", "записей")} в ближайшие 7 дней</div></div>
        <div class="card stat"><div class="value">${up.filter((v) => v.kind === "doctor").length}</div><div class="label">к врачам впереди</div></div>
        <div class="card stat"><div class="value">${up.filter((v) => v.kind === "test").length}</div><div class="label">на анализы впереди</div></div>
        <div class="card stat ${late.length ? "alert" : ""}"><div class="value">${late.length}</div><div class="label">прошли, не отмечены</div></div>
      </div>
      ${visitsHtml(D.visits, D.doctors.length || D.tests.length
        ? "Записей нет — нажмите «+ Запись»."
        : "Сначала добавьте в поликлинику врачей или анализы, потом записывайтесь к ним.")}`;
  }

  function pageClinic(clinicId, tab) {
    const c = clinicById(clinicId);
    const doctors = D.doctors.filter((d) => d.clinicId === clinicId);
    const tests = D.tests.filter((t) => t.clinicId === clinicId);
    const visits = visitsOfClinic(clinicId);
    const nextOf = (kind, id) => upcoming().find((v) => v.kind === kind && v.refId === id);
    const nextText = (v) => (v ? `Запись: ${shortDate(v.date)}, ${v.time}` : "");

    let body;
    if (tab === "doctors") {
      body = `<div class="toolbar"><button class="btn" data-act="add-doctor">+ Врач</button></div>
        ${doctors.length ? `<div class="card list-card">${doctors.map((d) => `
          <div class="entity" data-doctor="${d.id}">
            <div class="entity-main">
              <div class="entity-title">${esc(d.name || d.specialty)}</div>
              <div class="entity-sub">${[d.name ? d.specialty : "", d.room ? `каб. ${d.room}` : "", d.notes, nextText(nextOf("doctor", d.id))].filter(Boolean).map(esc).join(" · ")}</div>
            </div>
            <div class="entity-actions">
              <button class="btn small primary" data-act="book-doctor">+ Записаться</button>
              <button class="btn small ghost" data-act="edit-doctor">Изменить</button>
            </div>
          </div>`).join("")}</div>` : `<div class="card empty">Врачей пока нет — добавьте врача, к которому ходите.</div>`}`;
    } else if (tab === "tests") {
      body = `<div class="toolbar"><button class="btn" data-act="add-test">+ Анализ</button></div>
        ${tests.length ? `<div class="card list-card">${tests.map((t) => `
          <div class="entity" data-test="${t.id}">
            <div class="entity-main">
              <div class="entity-title">${esc(t.name)}</div>
              <div class="entity-sub">${[t.prep ? `Подготовка: ${t.prep.split("\n").join(", ")}` : "", nextText(nextOf("test", t.id))].filter(Boolean).map(esc).join(" · ")}</div>
            </div>
            <div class="entity-actions">
              <button class="btn small primary" data-act="book-test">+ Записаться</button>
              <button class="btn small ghost" data-act="edit-test">Изменить</button>
            </div>
          </div>`).join("")}</div>` : `<div class="card empty">Анализов пока нет — добавьте анализ, который сдаёте здесь.</div>`}`;
    } else {
      body = visitsHtml(visits, "Записей в эту поликлинику нет.");
    }

    const tabLink = (key, label, n) => `<a href="#/clinic/${c.id}/${key}" class="${tab === key ? "active" : ""}">${label}<span class="count">${n || ""}</span></a>`;
    return `
      <div class="page-head">
        <div>
          <div class="eyebrow">Поликлиника</div>
          <h1>${esc(c.name)}</h1>
          ${[c.address, c.phone, c.notes].some(Boolean) ? `<div class="info-line">${[c.address, c.phone, c.notes].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
        </div>
        <div class="actions">
          <button class="btn ghost" data-act="edit-clinic">Изменить</button>
          <button class="btn ghost danger" data-act="delete-clinic">Удалить</button>
        </div>
      </div>
      <nav class="tabs">
        ${tabLink("doctors", "Врачи", doctors.length)}
        ${tabLink("tests", "Анализы", tests.length)}
        ${tabLink("visits", "Записи", upcoming(visits).length + awaiting(visits).length)}
      </nav>
      ${body}`;
  }

  function pageHistory() {
    const done = D.visits.filter((v) => v.done).sort((a, b) => byStart(b, a));
    return `<div class="eyebrow">Здоровье</div><h1>История посещений</h1>
      <div style="margin-top:22px">${done.length ? `<div class="card list-card">${done.map((v) => {
        const t = targetOf(v);
        const c = clinicOf(v);
        return `<div class="entity" data-event="${v.id}" data-act="edit-visit" style="cursor:pointer">
          <div class="entity-main">
            <div class="entity-title">${v.kind === "doctor" ? esc(doctorLabel(t)) : `Анализ: ${esc(t.name)}`}</div>
            <div class="entity-sub">${[c.name, v.notes].filter(Boolean).map(esc).join(" · ")}</div>
          </div>
          <div class="when">${shortDate(v.date)}<small>${esc(v.time)}</small></div>
        </div>`;
      }).join("")}</div>` : `<div class="card empty">Посещений пока нет.</div>`}</div>`;
  }

  function renderSidebar() {
    const r = route();
    const late = awaiting().length;
    $("#nav").innerHTML = `
      <a href="#/" class="${r.name === "" ? "active" : ""}">Мои записи<span class="count ${late ? "alert" : ""}">${late ? `${late} не отмеч.` : upcoming().length || ""}</span></a>
      <a href="#/history" class="${r.name === "history" ? "active" : ""}">История<span class="count">${D.visits.filter((v) => v.done).length || ""}</span></a>`;
    $("#side-list").innerHTML = `
      <div class="block-title"><span>Поликлиники</span><span>${D.clinics.length || ""}</span></div>
      ${D.clinics.map((c) => {
        const n = upcoming(visitsOfClinic(c.id)).length;
        return `<a href="#/clinic/${c.id}" class="stage-link ${r.clinicId === c.id ? "active" : ""}" style="--subj:${c.color}" title="${esc(c.name)}">
          <span class="num">${esc(c.name.trim()[0] || "?").toUpperCase()}</span>
          <span class="label">${esc(c.name)}</span>
          <span class="pct">${n || ""}</span>
        </a>`;
      }).join("")}
      <button class="stage-link add" data-act="add-clinic"><span class="num">+</span><span class="label">Добавить поликлинику</span></button>`;
  }

  function renderOverall() {
    const up = upcoming();
    const next = up[0];
    const late = awaiting().length;
    let nextText = "Записей нет";
    if (next) {
      const t = targetOf(next);
      nextText = `Ближайшая: <b>${shortDate(next.date)}, ${next.time}</b> · ${esc(next.kind === "doctor" ? t.specialty || t.name : t.name)}`;
    }
    $("#overall").innerHTML = `<span class="overall-text">${nextText}<span class="hide-sm"> · всего впереди <b>${up.length}</b></span>${late ? ` · не отмечено <b class="alert">${late}</b>` : ""}</span>`;
  }

  let lastView = "";
  function render() {
    const r = route();
    const scroll = window.scrollY;
    $("#main").innerHTML = r.name === "clinic" ? pageClinic(r.clinicId, r.tab) : r.name === "history" ? pageHistory() : pageVisits();
    window.scrollTo(0, location.hash === lastView ? scroll : 0);
    lastView = location.hash;
    renderSidebar();
    renderOverall();
  }

  // ---------- Формы ----------
  async function editClinic(clinic) {
    const r = await formDialog({
      title: clinic ? "Поликлиника" : "Новая поликлиника",
      fields: [
        { name: "name", label: "Название", value: clinic?.name || "", required: true, placeholder: "Например, Поликлиника №3" },
        { name: "address", label: "Адрес", value: clinic?.address || "" },
        { name: "phone", label: "Телефон регистратуры", value: clinic?.phone || "", type: "tel" },
        { name: "notes", label: "Заметки", value: clinic?.notes || "", placeholder: "Часы работы, как записаться, сайт" },
      ],
      submit: clinic ? "Сохранить" : "Добавить",
    });
    if (!r) return;
    if (clinic) Object.assign(clinic, r.values);
    else {
      const c = { id: uid(), ...r.values, color: COLORS[D.clinics.length % COLORS.length] };
      D.clinics.push(c);
      location.hash = `#/clinic/${c.id}`;
    }
    store.save();
    render();
  }

  async function deleteClinic(clinic) {
    const doctors = D.doctors.filter((d) => d.clinicId === clinic.id);
    const tests = D.tests.filter((t) => t.clinicId === clinic.id);
    const visits = visitsOfClinic(clinic.id);
    const ok = await confirmDialog(`Удалить «${clinic.name}»?`,
      `Удалятся врачи (${doctors.length}), анализы (${tests.length}) и записи (${visits.length}) этой поликлиники.`);
    if (!ok) return;
    D.clinics = D.clinics.filter((c) => c !== clinic);
    D.doctors = D.doctors.filter((d) => !doctors.includes(d));
    D.tests = D.tests.filter((t) => !tests.includes(t));
    D.visits = D.visits.filter((v) => !visits.includes(v));
    store.save();
    location.hash = "#/";
    render();
  }

  async function removeWithVisits(kind, item, title) {
    const visits = D.visits.filter((v) => v.kind === kind && v.refId === item.id);
    const ok = await confirmDialog(`Удалить «${title}»?`,
      visits.length ? `Вместе с ним удалятся записи (${visits.length}).` : "Записей к нему нет.");
    if (!ok) return false;
    D.visits = D.visits.filter((v) => !visits.includes(v));
    return true;
  }

  async function editDoctor(doctor, clinicId) {
    const r = await formDialog({
      title: doctor ? "Врач" : "Новый врач",
      fields: [
        { name: "specialty", label: "Специальность", value: doctor?.specialty || "", required: true, placeholder: "Например, Терапевт",
          suggestions: ["Терапевт", "Стоматолог", "Окулист", "ЛОР", "Невролог", "Хирург", "Кардиолог", "Дерматолог", "Эндокринолог", "Гастроэнтеролог"] },
        { name: "name", label: "ФИО врача", value: doctor?.name || "", placeholder: "Необязательно" },
        { name: "room", label: "Кабинет", value: doctor?.room || "", half: true },
        { name: "notes", label: "Заметки", value: doctor?.notes || "", placeholder: "Дни приёма, как записаться" },
      ],
      submit: doctor ? "Сохранить" : "Добавить",
      deleteLabel: doctor ? "Удалить врача" : "",
    });
    if (!r) return;
    if (r.action === "delete") {
      if (!(await removeWithVisits("doctor", doctor, doctorLabel(doctor)))) return;
      D.doctors = D.doctors.filter((d) => d !== doctor);
    } else if (doctor) Object.assign(doctor, r.values);
    else D.doctors.push({ id: uid(), clinicId, ...r.values });
    store.save();
    render();
  }

  async function editTest(test, clinicId) {
    const r = await formDialog({
      title: test ? "Анализ" : "Новый анализ",
      fields: [
        { name: "name", label: "Анализ", value: test?.name || "", required: true, placeholder: "Например, Общий анализ крови",
          suggestions: ["Общий анализ крови", "Биохимия крови", "Общий анализ мочи", "Глюкоза", "Гормоны щитовидной железы", "ЭКГ", "Флюорография", "УЗИ"] },
        { name: "prep", label: "Подготовка", type: "textarea", value: test?.prep || "", placeholder: "Каждый пункт с новой строки:\nНатощак\nНе пить кофе с утра",
          hint: "Эти пункты попадут в чек-лист «Что подготовить» при записи" },
      ],
      submit: test ? "Сохранить" : "Добавить",
      deleteLabel: test ? "Удалить анализ" : "",
    });
    if (!r) return;
    if (r.action === "delete") {
      if (!(await removeWithVisits("test", test, test.name))) return;
      D.tests = D.tests.filter((t) => t !== test);
    } else if (test) Object.assign(test, r.values);
    else D.tests.push({ id: uid(), clinicId, ...r.values });
    store.save();
    render();
  }

  async function editVisit(visit, preset) {
    if (!D.doctors.length && !D.tests.length) {
      if (!D.clinics.length) return editClinic(null);
      const c = clinicById(route().clinicId) || D.clinics[0];
      location.hash = `#/clinic/${c.id}/doctors`;
      return editDoctor(null, c.id);
    }
    const options = [];
    for (const c of D.clinics) {
      for (const d of D.doctors.filter((x) => x.clinicId === c.id)) options.push({ value: `doctor:${d.id}`, label: `Врач: ${doctorLabel(d)}`, group: c.name });
      for (const t of D.tests.filter((x) => x.clinicId === c.id)) options.push({ value: `test:${t.id}`, label: `Анализ: ${t.name}`, group: c.name });
    }
    const current = visit ? `${visit.kind}:${visit.refId}` : preset || options[0].value;
    const fields = [
      { name: "target", label: "Куда записаны", type: "select", value: current, options },
      { name: "date", label: "Дата", type: "date", value: visit?.date || dateKey(), required: true, half: true },
      { name: "time", label: "Время", type: "time", value: visit?.time || "09:00", required: true, half: true },
      { name: "room", label: "Кабинет", value: visit?.room ?? "", half: true, placeholder: "Если отличается" },
      { name: "notes", label: "Заметки", type: "textarea", rows: 2, value: visit?.notes || "", placeholder: "Жалобы, вопросы врачу, номер талона" },
    ];
    const r = await formDialog({
      title: visit ? "Запись" : "Новая запись",
      fields,
      submit: visit ? "Сохранить" : "Записаться",
      deleteLabel: visit ? "Отменить запись" : "",
    });
    if (!r) return;
    if (r.action === "delete") {
      D.visits = D.visits.filter((v) => v !== visit);
    } else {
      const v = r.values;
      const [kind, refId] = v.target.split(":");
      const target = kind === "doctor" ? doctorById(refId) : testById(refId);
      const base = { kind, refId, date: v.date, time: v.time, duration: 30, room: v.room || (kind === "doctor" ? target.room || "" : ""), notes: v.notes };
      if (visit) Object.assign(visit, base);
      else {
        // Подготовка из карточки анализа сразу становится чек-листом записи
        const prep = kind === "test" ? (target.prep || "").split("\n").map((s) => s.trim()).filter(Boolean) : [];
        D.visits.push({ id: uid(), ...base, prep: prep.map((title) => ({ id: uid(), title, done: false })), done: false, doneAt: "" });
      }
    }
    store.save();
    render();
  }

  // ---------- События ----------
  window.Events.bindChecklists({
    toggle(id, itemId) { const t = visitById(id).prep.find((x) => x.id === itemId); t.done = !t.done; store.save(); render(); },
    remove(id, itemId) { const v = visitById(id); v.prep = v.prep.filter((x) => x.id !== itemId); store.save(); render(); },
    add(id, title) { visitById(id).prep.push({ id: uid(), title, done: false }); store.save(); render(); },
  });

  document.addEventListener("click", (e) => {
    const actEl = e.target.closest("[data-act]");
    if (!actEl) return;
    const act = actEl.dataset.act;
    const r = route();
    const clinic = clinicById(r.clinicId);
    const visit = visitById(e.target.closest("[data-event]")?.dataset.event);
    const doctor = doctorById(e.target.closest("[data-doctor]")?.dataset.doctor);
    const test = testById(e.target.closest("[data-test]")?.dataset.test);

    if (act === "add-clinic") return editClinic(null);
    if (act === "edit-clinic") return editClinic(clinic);
    if (act === "delete-clinic") return deleteClinic(clinic);
    if (act === "add-doctor") return editDoctor(null, clinic.id);
    if (act === "edit-doctor") return editDoctor(doctor);
    if (act === "add-test") return editTest(null, clinic.id);
    if (act === "edit-test") return editTest(test);
    if (act === "book-doctor") return editVisit(null, `doctor:${doctor.id}`);
    if (act === "book-test") return editVisit(null, `test:${test.id}`);
    if (act === "edit-visit") return editVisit(visit);
    if (act === "done" || act === "undone") {
      visit.done = act === "done";
      visit.doneAt = visit.done ? new Date().toISOString() : "";
      store.save();
      render();
    }
  });

  $("#primary-btn").addEventListener("click", () => editVisit(null));
  window.addEventListener("hashchange", render);
  setInterval(() => {
    const busy = document.querySelector("dialog[open]") || document.activeElement?.matches("input, textarea");
    if (!busy) render();
  }, 60_000);

  render();
})();
