// Общие помощники панелей: даты, экранирование, диалоги-формы.
window.U = (() => {
  const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, "0");

  const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const timeKey = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  // "2026-10-16" + "18:30" → Date в местном времени
  function toDate(key, time = "00:00") {
    const [y, m, d] = key.split("-").map(Number);
    const [hh, mm] = (time || "00:00").split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }
  const addDays = (key, n) => { const d = toDate(key); d.setDate(d.getDate() + n); return dateKey(d); };
  // Сколько календарных дней от сегодня до даты (отрицательное — в прошлом)
  const daysFromToday = (key) => Math.round((toDate(key) - toDate(dateKey())) / 864e5);

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  const days = (n) => `${n} ${plural(n, "день", "дня", "дней")}`;

  // "пт, 16 окт"
  function shortDate(key) {
    const d = toDate(key);
    return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  }
  // "Сегодня" / "Завтра" / "Пятница, 16 октября"
  function dayTitle(key) {
    const diff = daysFromToday(key);
    const d = toDate(key);
    const full = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    if (diff === 0) return `Сегодня, ${full}`;
    if (diff === 1) return `Завтра, ${full}`;
    if (diff === -1) return `Вчера, ${full}`;
    const wd = WEEKDAYS[d.getDay()];
    return `${wd[0].toUpperCase()}${wd.slice(1)}, ${full}`;
  }
  // "сегодня" / "завтра" / "через 3 дня" / "просрочено на 2 дня"
  function relative(key) {
    const diff = daysFromToday(key);
    if (diff === 0) return "сегодня";
    if (diff === 1) return "завтра";
    if (diff === -1) return "вчера";
    return diff > 0 ? `через ${days(diff)}` : `${days(-diff)} назад`;
  }

  // День, в который задание планируется сделать: «сделать сегодня» / «план прошёл: ср, 14 окт»
  function planInfo(planDate, dueDate = "") {
    if (!planDate) return null;
    const diff = daysFromToday(planDate);
    const text = diff === 0 ? "сделать сегодня" : diff === 1 ? "сделать завтра"
      : diff < 0 ? `план прошёл: ${shortDate(planDate)}` : `сделать ${shortDate(planDate)}`;
    return { text, cls: diff < 0 ? "late" : diff === 0 ? "today" : "", afterDue: Boolean(dueDate && planDate > dueDate) };
  }
  const planHtml = (planDate, dueDate) => {
    const p = planInfo(planDate, dueDate);
    if (!p) return "";
    return `<span class="plan ${p.cls}">${esc(p.text)}</span>${p.afterDue ? `<span class="plan late">позже дедлайна</span>` : ""}`;
  };

  // ---------- Диалог-форма ----------
  // fields: [{ name, label, type: text|textarea|date|time|number|select|segmented|checkbox, value, required,
  //            options: [{ value, label, group?, color? }], suggestions: [строки для подсказок], placeholder, half, hint, min, max }]
  // Возвращает Promise: { action: "save", values } | { action: "delete" } | null (отмена)
  function formDialog({ title, fields, submit = "Сохранить", deleteLabel = "" }) {
    return new Promise((resolve) => {
      const dlg = document.createElement("dialog");
      dlg.className = "dialog";
      const fieldHtml = (f) => {
        const id = `f-${f.name}`;
        const req = f.required ? "required" : "";
        const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : "";
        let input;
        if (f.type === "textarea") {
          input = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" ${ph} ${req}>${esc(f.value)}</textarea>`;
        } else if (f.type === "select") {
          const groups = new Map();
          for (const o of f.options) {
            if (!groups.has(o.group || "")) groups.set(o.group || "", []);
            groups.get(o.group || "").push(o);
          }
          const opt = (o) => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value) ? "selected" : ""}>${esc(o.label)}</option>`;
          input = `<select id="${id}" name="${f.name}" ${req}>${[...groups].map(([g, os]) =>
            g ? `<optgroup label="${esc(g)}">${os.map(opt).join("")}</optgroup>` : os.map(opt).join("")).join("")}</select>`;
        } else if (f.type === "checkbox") {
          return `<div class="field ${f.half ? "half" : ""}"><label class="check-field">
            <input type="checkbox" class="check" name="${f.name}" value="1" ${f.value ? "checked" : ""}> ${esc(f.label)}</label></div>`;
        } else if (f.type === "segmented") {
          input = `<div class="segmented">${f.options.map((o) => `
            <label style="--seg:${o.color || "var(--accent)"}"><input type="radio" name="${f.name}" value="${esc(o.value)}" ${o.value === f.value ? "checked" : ""}><span>${esc(o.label)}</span></label>`).join("")}</div>`;
        } else {
          const extra = [f.min != null ? `min="${f.min}"` : "", f.max != null ? `max="${f.max}"` : "", f.step ? `step="${f.step}"` : ""].join(" ");
          const list = f.suggestions?.length ? `list="${id}-list"` : "";
          input = `<input id="${id}" type="${f.type || "text"}" name="${f.name}" value="${esc(f.value)}" ${ph} ${req} ${extra} ${list} autocomplete="off">`
            + (list ? `<datalist id="${id}-list">${f.suggestions.map((v) => `<option value="${esc(v)}"></option>`).join("")}</datalist>` : "");
        }
        return `<div class="field ${f.half ? "half" : ""}">
          ${f.label ? `<label for="${id}">${esc(f.label)}</label>` : ""}${input}
          ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ""}
        </div>`;
      };
      dlg.innerHTML = `<form class="dialog-form" novalidate>
        <h2>${esc(title)}</h2>
        <div class="fields">${fields.map(fieldHtml).join("")}</div>
        <div class="dialog-actions">
          ${deleteLabel ? `<button type="button" class="btn danger" data-act="delete">${esc(deleteLabel)}</button>` : ""}
          <span class="spacer"></span>
          <button type="button" class="btn" data-act="cancel">Отмена</button>
          <button type="submit" class="btn primary">${esc(submit)}</button>
        </div>
      </form>`;
      const form = dlg.querySelector("form");
      let result = null;
      const finish = (r) => { result = r; dlg.close(); };
      dlg.addEventListener("close", () => { dlg.remove(); resolve(result); });
      dlg.querySelector('[data-act="cancel"]').addEventListener("click", () => finish(null));
      dlg.querySelector('[data-act="delete"]')?.addEventListener("click", () => finish({ action: "delete" }));
      dlg.addEventListener("click", (e) => { if (e.target === dlg) finish(null); });
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const values = {};
        for (const f of fields) {
          const v = new FormData(form).get(f.name);
          values[f.name] = f.type === "checkbox" ? v !== null : typeof v === "string" ? v.trim() : v ?? "";
        }
        finish({ action: "save", values });
      });
      document.body.append(dlg);
      dlg.showModal();
      dlg.querySelector("input:not([type=radio]), textarea, select")?.focus();
    });
  }

  const confirmDialog = async (title, text, label = "Удалить") => {
    const r = await formDialog({ title, fields: [{ name: "_", type: "hidden", value: "", hint: text }], submit: label });
    return Boolean(r);
  };

  return { planInfo, planHtml, esc, uid, pad, dateKey, timeKey, toDate, addDays, daysFromToday, plural, days, shortDate, dayTitle, relative, formDialog, confirmDialog, MONTHS, WEEKDAYS };
})();
