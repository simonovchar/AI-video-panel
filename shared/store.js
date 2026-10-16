// Хранилище данных панели: data/<key>.json через /api/store/<key>.
// Если сайт открыт без сервера — данные живут в localStorage этого браузера.
window.PanelStore = {
  async open(key, defaults, onStatus = () => {}) {
    const lsKey = `panel-store-${key}`;
    let data = null;
    let mode = "server";
    try {
      const r = await fetch(`/api/store/${key}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
    } catch {
      mode = "local";
      try { data = JSON.parse(localStorage.getItem(lsKey) || "{}"); } catch { data = {}; }
    }
    data = Object.assign(structuredClone(defaults), data);

    let timer = null;
    async function flush() {
      timer = null;
      try { localStorage.setItem(lsKey, JSON.stringify(data)); } catch { /* ignore */ }
      if (mode === "local") return onStatus("Сохранено в браузере (сервер не запущен)", false);
      try {
        const r = await fetch(`/api/store/${key}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          keepalive: true,
        });
        if (!r.ok) throw new Error(r.status);
        onStatus("Сохранено", false);
      } catch {
        onStatus("Ошибка сохранения — сервер запущен?", true);
      }
    }
    window.addEventListener("beforeunload", () => { if (timer) { clearTimeout(timer); flush(); } });
    onStatus(mode === "server" ? "Сохранено" : "Сервер не запущен — данные только в этом браузере", mode !== "server");

    return {
      data,
      mode,
      // Перечитать данные с диска (другая вкладка могла их поменять); не трогает несохранённые правки
      async reload() {
        if (timer || mode !== "server") return false;
        try {
          const r = await fetch(`/api/store/${key}`, { cache: "no-store" });
          if (!r.ok) return false;
          const fresh = Object.assign(structuredClone(defaults), await r.json());
          for (const k of Object.keys(data)) delete data[k];
          Object.assign(data, fresh);
          return true;
        } catch { return false; }
      },
      save() {
        clearTimeout(timer);
        onStatus("Сохранение…", false);
        timer = setTimeout(flush, 300);
      },
    };
  },
};
