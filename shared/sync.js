// Связь между страницами: пункты Roadmap ⇄ блоки расписания на главной.
// Каждая запись — свежее чтение и сразу сохранение, чтобы не затереть данные другой вкладки.
window.Sync = (() => {
  const get = (key) => fetch(`/api/store/${key}`, { cache: "no-store" }).then((r) => r.json());
  const put = async (key, data) => {
    const r = await fetch(`/api/store/${key}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error(r.status);
  };
  const isoWd = (key) => ((window.U.toDate(key).getDay() + 6) % 7) + 1;
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

  // Расписание: если главную ещё не открывали, шаблоны берутся из home/schedule-default.js
  async function loadSchedule() {
    const D = await get("schedule");
    D.version = 1;
    D.days = D.days || {};
    if (!D.templates) D.templates = structuredClone(window.SCHEDULE_DEFAULT.templates);
    return D;
  }

  // Добавить блок в день: день сначала копируется из основного шаблона, потом в него вставляется блок
  async function addBlock(date, block) {
    const D = await loadSchedule();
    if (!D.days[date]) D.days[date] = { blocks: structuredClone(D.templates.main[isoWd(date)]) };
    D.days[date].blocks.push(block);
    D.days[date].blocks.sort((a, b) => toMin(a.start) - toMin(b.start));
    await put("schedule", D);
  }

  // { roadmapId: [{ date, start, end, done }] } — какие пункты Roadmap стоят в расписании
  async function roadmapBlocks() {
    const D = await get("schedule").catch(() => ({}));
    const map = {};
    for (const [date, day] of Object.entries(D.days || {})) {
      for (const b of day.blocks || []) {
        if (b.roadmapId) (map[b.roadmapId] ||= []).push({ date, start: b.start, end: b.end, done: b.done });
      }
    }
    for (const list of Object.values(map)) list.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    return map;
  }

  // Отметить пункт Roadmap пройденным / снять отметку
  async function setRoadmapChecked(id, value) {
    const P = await get("progress");
    P.version = 1;
    P.items = P.items || {};
    P.periodic = P.periodic || {};
    P.notes = P.notes || {};
    if (value) P.items[id] ||= new Date().toISOString();
    else delete P.items[id];
    await put("progress", P);
  }

  return { loadSchedule, addBlock, roadmapBlocks, setRoadmapChecked };
})();
