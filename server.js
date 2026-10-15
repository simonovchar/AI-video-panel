// Локальный сервер личной панели. Без зависимостей — нужен только Node.js.
// Запуск: npm start  (или F5 в VS Code)
//
//   /                 главный экран со всеми панелями
//   /<панель>/        панель из папки panels/<панель>/
//   /home/, /shared/  файлы главного экрана и общие стили/скрипты
//   /api/store/<key>  JSON-хранилище панели в data/<key>.json (GET / PUT)
const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PANELS_DIR = path.join(ROOT, "panels");
const START_PORT = Number(process.env.PORT) || 4321;
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

const storeFile = (key) => path.join(DATA_DIR, `${key}.json`);

function readStore(key) {
  try {
    return fs.readFileSync(storeFile(key), "utf8");
  } catch {
    return "{}";
  }
}

function writeStore(key, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = storeFile(key);
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(DATA_DIR, `${key}.backup.json`));
  fs.writeFileSync(file + ".tmp", JSON.stringify(data, null, 2));
  fs.renameSync(file + ".tmp", file);
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
  res.end(body);
}

// URL → файл на диске. Отдаём только главный экран, home/, shared/ и panels/<панель>/.
function resolveStatic(pathname) {
  const parts = decodeURIComponent(pathname).split("/").filter(Boolean);
  if (parts.some((p) => p.startsWith("."))) return null;
  if (parts.length === 0) return path.join(ROOT, "index.html");
  const [head, ...rest] = parts;
  let base;
  if (head === "home" || head === "shared") base = path.join(ROOT, head);
  else if (fs.existsSync(path.join(PANELS_DIR, head, "index.html"))) base = path.join(PANELS_DIR, head);
  else return null;
  const file = path.join(base, ...(rest.length ? rest : ["index.html"]));
  return file.startsWith(base + path.sep) ? file : null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  const store = url.pathname.match(/^\/api\/store\/([a-z0-9-]+)$/);
  if (store) {
    const key = store[1];
    if (req.method === "GET") return send(res, 200, readStore(key));
    if (req.method === "PUT") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("bad shape");
          writeStore(key, data);
          send(res, 200, '{"ok":true}');
        } catch (e) {
          send(res, 400, JSON.stringify({ ok: false, error: String(e.message) }));
        }
      });
      return;
    }
    return send(res, 405, '{"ok":false}');
  }

  // /roadmap → /roadmap/, чтобы относительные пути внутри панели работали
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 1 && !url.pathname.endsWith("/") && !path.extname(parts[0])) {
    res.writeHead(301, { Location: url.pathname + "/" + url.search });
    return res.end();
  }

  const file = resolveStatic(url.pathname);
  if (!file) return send(res, 404, "Not found", "text/plain");
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    send(res, 200, buf, TYPES[path.extname(file)] || "application/octet-stream");
  });
});

function listen(port) {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && port < START_PORT + 20) return listen(port + 1);
    throw err;
  });
  server.listen(port, "127.0.0.1", () => {
    const address = `http://localhost:${port}`;
    console.log(`\n  Личная панель запущена: ${address}`);
    console.log(`  Данные панелей сохраняются в: ${DATA_DIR}`);
    console.log("  Остановить: Ctrl+C\n");
    if (!process.argv.includes("--no-open")) {
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start \"\"" : "xdg-open";
      exec(`${cmd} ${address}`);
    }
  });
}

listen(START_PORT);
