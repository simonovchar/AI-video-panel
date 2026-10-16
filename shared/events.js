// Карточка события с датой и временем (занятие, запись к врачу, созвон, урок вождения)
// и чек-листом подготовки. Отметки в чек-листе обрабатываются здесь же — панель передаёт колбэки.
window.Events = (() => {
  const { esc, toDate, dayTitle, pad } = window.U;

  const startOf = (ev) => toDate(ev.date, ev.time || "00:00");
  const endOf = (ev) => new Date(+startOf(ev) + (Number(ev.duration) || 60) * 60_000);
  const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const byStart = (a, b) => startOf(a) - startOf(b);
  const isPast = (ev) => endOf(ev) < new Date();
  const isLive = (ev) => { const now = new Date(); return startOf(ev) <= now && now <= endOf(ev); };

  // Бейдж готовности по чек-листу: «Подготовка 1/3» → «Готов…»
  function prepBadge(items, readyLabel = "Готово к проведению", prepLabel = "Подготовка") {
    if (!items || !items.length) return null;
    const done = items.filter((t) => t.done).length;
    return done === items.length
      ? { cls: "is-ready", label: readyLabel }
      : { cls: "is-prep", label: `${prepLabel} ${done}/${items.length}` };
  }

  // ev: { id, color, time, endTime, live, done, pre, title, subHtml, notes, badges[], checklist, actions[] }
  // checklist: { title?, items: [{ id, title, done }], placeholder? } — placeholder включает поле добавления
  function card(ev) {
    const list = ev.checklist;
    return `<article class="card event ${ev.done ? "is-done" : ""}" style="--ev:${ev.color || "var(--accent)"}" data-event="${ev.id}">
      <div class="event-time">
        <b>${esc(ev.time || "—")}</b>${ev.endTime ? `<span>–${esc(ev.endTime)}</span>` : ""}
        ${ev.live ? `<span class="now">идёт сейчас</span>` : ""}
      </div>
      <div class="event-body">
        <div class="event-head">
          <div>
            <div class="event-title">${ev.pre ? `<span class="pre">${esc(ev.pre)} ·</span> ` : ""}${esc(ev.title)}</div>
            ${ev.subHtml ? `<div class="event-sub">${ev.subHtml}</div>` : ""}
          </div>
          ${(ev.badges || []).filter(Boolean).map((b) => `<span class="badge ${b.cls}">${esc(b.label)}</span>`).join("")}
        </div>
        ${ev.notes ? `<div class="event-notes">${esc(ev.notes)}</div>` : ""}
        ${list && (list.items.length || list.placeholder) ? `
          ${list.title && list.items.length ? `<div class="checklist-title">${esc(list.title)}</div>` : ""}
          ${list.items.length ? `<ul class="checklist">${list.items.map((t) => `
            <li class="check-item ${t.done ? "done" : ""}" data-ci="${t.id}">
              <input type="checkbox" class="check" ${t.done ? "checked" : ""} tabindex="-1">
              <span>${esc(t.title)}</span>
              <button class="x" data-ci-del title="Удалить" aria-label="Удалить">×</button>
            </li>`).join("")}</ul>` : ""}
          ${list.placeholder ? `<form class="check-add" data-ci-add><input name="title" placeholder="${esc(list.placeholder)}" autocomplete="off"></form>` : ""}` : ""}
        ${ev.actions?.length ? `<div class="event-actions">${ev.actions.map((a) =>
          `<button class="btn small ${a.cls || ""}" data-act="${a.act}">${esc(a.label)}</button>`).join("")}</div>` : ""}
      </div>
    </article>`;
  }

  // Группы «Сегодня, 16 октября», «Завтра, …» и т. д.
  function byDate(list, render) {
    const groups = new Map();
    for (const ev of list) {
      if (!groups.has(ev.date)) groups.set(ev.date, []);
      groups.get(ev.date).push(ev);
    }
    return [...groups].map(([date, evs]) => `
      <section class="group">
        <div class="group-head">${dayTitle(date)} <span class="n">${evs.length}</span></div>
        <div class="events">${evs.map(render).join("")}</div>
      </section>`).join("");
  }

  // handlers: { toggle(eventId, itemId), remove(eventId, itemId), add(eventId, title) } — после них панель перерисовывается
  function bindChecklists(handlers) {
    document.addEventListener("click", (e) => {
      const item = e.target.closest("[data-ci]");
      if (!item) return;
      e.preventDefault();
      e.stopPropagation();
      const eventId = item.closest("[data-event]").dataset.event;
      if (e.target.closest("[data-ci-del]")) handlers.remove(eventId, item.dataset.ci);
      else handlers.toggle(eventId, item.dataset.ci);
    }, true);
    document.addEventListener("submit", (e) => {
      const form = e.target.closest("[data-ci-add]");
      if (!form) return;
      e.preventDefault();
      const title = form.elements.title.value.trim();
      if (!title) return;
      const eventId = form.closest("[data-event]").dataset.event;
      handlers.add(eventId, title);
      // Курсор остаётся в поле, чтобы добавлять пункты подряд
      document.querySelector(`[data-event="${eventId}"] [data-ci-add] input`)?.focus();
    });
  }

  return { startOf, endOf, hhmm, byStart, isPast, isLive, prepBadge, card, byDate, bindChecklists };
})();
