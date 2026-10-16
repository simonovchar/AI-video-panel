// Плитки панелей со сводками (вкладка «Все панели» на главной).
window.renderTiles = (el) => {
  "use strict";

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const now = new Date();

  // ---------- Плитки ----------
  const icon = (p) => `<div class="panel-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${p.icon}</svg></div>`;

  el.innerHTML = window.PANELS.map((p) => `
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
    async university() {
      const D = await fetch("/api/store/university", { cache: "no-store" }).then((r) => r.json());
      const { toDate, shortDate, relative, plural } = window.U;
      const open = (D.tasks || []).filter((t) => !t.done);
      if (!D.subjects?.length) return null;
      const due = (t) => toDate(t.deadline, t.deadlineTime || "23:59");
      const withDeadline = open.filter((t) => t.deadline).sort((a, b) => due(a) - due(b));
      const overdue = withDeadline.filter((t) => due(t) < now).length;
      const PRIO = { high: "высокий", medium: "средний", low: "низкий" };
      const next = withDeadline.filter((t) => due(t) >= now).slice(0, 2);
      return `
        <div class="tile-stat"><b>${open.length}</b><span>${plural(open.length, "открытое задание", "открытых задания", "открытых заданий")}</span>
          ${overdue ? `<span class="tile-alert">просрочено: ${overdue}</span>` : ""}</div>
        <div class="tile-list">${next.length ? next.map((t) => `
          <div class="tile-item prio-${t.priority}"><span>${esc(t.title)}</span><small>${shortDate(t.deadline)} · ${relative(t.deadline)} · ${PRIO[t.priority]}</small></div>`).join("")
          : `<div class="tile-item"><small>Ближайших дедлайнов нет</small></div>`}</div>`;
    },
    async tutoring() {
      const D = await fetch("/api/store/tutoring", { cache: "no-store" }).then((r) => r.json());
      const { toDate, shortDate, relative, plural } = window.U;
      if (!D.schools?.length) return null;
      const end = (l) => new Date(+toDate(l.date, l.time) + (Number(l.duration) || 60) * 60_000);
      const pending = (D.lessons || []).filter((l) => !l.conducted);
      const up = pending.filter((l) => end(l) >= now).sort((a, b) => toDate(a.date, a.time) - toDate(b.date, b.time));
      const late = pending.length - up.length;
      const week = up.filter((l) => window.U.daysFromToday(l.date) <= 7).length;
      const next = up[0];
      let nextHtml = `<div class="tile-item"><small>Предстоящих занятий нет</small></div>`;
      if (next) {
        const subject = D.subjects.find((s) => s.id === next.subjectId);
        const school = D.schools.find((s) => s.id === subject.schoolId);
        const done = next.tasks.filter((t) => t.done).length;
        const ready = done === next.tasks.length ? "готов к проведению" : `подготовка ${done}/${next.tasks.length}`;
        nextHtml = `<div class="tile-item"><span>${esc(school.name)} · ${esc(subject.name)}</span>
          <small>${shortDate(next.date)}, ${next.time} · ${relative(next.date)} · ${next.tasks.length ? ready : "заданий нет"}</small></div>`;
      }
      return `
        <div class="tile-stat"><b>${week}</b><span>${plural(week, "занятие", "занятия", "занятий")} за 7 дней</span>
          ${late ? `<span class="tile-alert">не отмечено: ${late}</span>` : ""}</div>
        <div class="tile-list"><div class="tile-label">Ближайшее занятие</div>${nextHtml}</div>`;
    },
    async health() {
      const D = await fetch("/api/store/health", { cache: "no-store" }).then((r) => r.json());
      const { toDate, shortDate, relative, plural } = window.U;
      if (!D.clinics?.length) return null;
      const end = (v) => new Date(+toDate(v.date, v.time) + 30 * 60_000);
      const pending = (D.visits || []).filter((v) => !v.done);
      const up = pending.filter((v) => end(v) >= now).sort((a, b) => toDate(a.date, a.time) - toDate(b.date, b.time));
      const late = pending.length - up.length;
      const label = (v) => {
        if (v.kind === "doctor") { const d = D.doctors.find((x) => x.id === v.refId); return d ? [d.specialty, d.name].filter(Boolean).join(" — ") : "Врач"; }
        const t = D.tests.find((x) => x.id === v.refId); return t ? `Анализ: ${t.name}` : "Анализ";
      };
      return `
        <div class="tile-stat"><b>${up.length}</b><span>${plural(up.length, "запись", "записи", "записей")} впереди</span>
          ${late ? `<span class="tile-alert">не отмечено: ${late}</span>` : ""}</div>
        <div class="tile-list"><div class="tile-label">Ближайшая запись</div>${up[0]
          ? `<div class="tile-item"><span>${esc(label(up[0]))}</span><small>${shortDate(up[0].date)}, ${up[0].time} · ${relative(up[0].date)}</small></div>`
          : `<div class="tile-item"><small>Записей нет</small></div>`}</div>`;
    },
    async navigator() {
      const D = await fetch("/api/store/navigator", { cache: "no-store" }).then((r) => r.json());
      const { toDate, shortDate, relative, plural } = window.U;
      if (!D.calls?.length && !D.tasks?.length) return null;
      const end = (c) => new Date(+toDate(c.date, c.time) + (Number(c.duration) || 30) * 60_000);
      const next = (D.calls || []).filter((c) => !c.held && end(c) >= now).sort((a, b) => toDate(a.date, a.time) - toDate(b.date, b.time))[0];
      const open = (D.tasks || []).filter((t) => !t.done);
      const overdue = open.filter((t) => t.checkDate && toDate(t.checkDate, t.checkTime || "23:59") < now).length;
      return `
        <div class="tile-stat"><b>${open.length}</b><span>${plural(open.length, "открытая задача", "открытые задачи", "открытых задач")}</span>
          ${overdue ? `<span class="tile-alert">срок прошёл: ${overdue}</span>` : ""}</div>
        <div class="tile-list"><div class="tile-label">Ближайший созвон</div>${next
          ? `<div class="tile-item"><span>${esc(next.title)}</span><small>${shortDate(next.date)}, ${next.time} · ${relative(next.date)}</small></div>`
          : `<div class="tile-item"><small>Созвонов не запланировано</small></div>`}</div>`;
    },
    async rights() {
      const D = await fetch("/api/store/rights", { cache: "no-store" }).then((r) => r.json());
      const { toDate, shortDate, relative } = window.U;
      const n = Object.keys(D.tickets || {}).length;
      if (!n && !D.lessons?.length) return null;
      const end = (l) => new Date(+toDate(l.date, l.time) + (Number(l.duration) || 90) * 60_000);
      const next = (D.lessons || []).filter((l) => !l.done && end(l) >= now).sort((a, b) => toDate(a.date, a.time) - toDate(b.date, b.time))[0];
      return `
        <div class="tile-stat"><b>${n}/40</b><span>билетов пройдено</span></div>
        <div class="bar"><span style="width:${(n / 40) * 100}%"></span></div>
        <div class="tile-meta"><span>${next ? `Урок: ${shortDate(next.date)}, ${next.time} · ${relative(next.date)}` : "Уроков не запланировано"}</span></div>`;
    },
  };

  function loadScript(src) {
    if (src.endsWith("roadmap.js") && window.ROADMAP) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
  }

  for (const [id, fn] of Object.entries(summaries)) {
    const box = el.querySelector(`[data-panel="${id}"] [data-summary]`);
    fn().then((html) => { if (html) box.innerHTML = html; }).catch(() => { /* оставляем описание */ });
  }
};
