// Локальный сервер трекера roadmap. Без зависимостей — нужен только Node.js.
// Запуск: npm start  (или F5 в VS Code)
const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PROGRESS_FILE = path.join(DATA_DIR, "progress.json");
const BACKUP_FILE = path.join(DATA_DIR, "progress.backup.json");
const START_PORT = Number(process.env.PORT) || 4321;
const STATIC = new Set(["index.html", "app.js", "styles.css", "roadmap.js"]);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

function readProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  } catch {
    return { version: 1, items: {}, periodic: {}, notes: {} };
  }
}

function writeProgress(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(PROGRESS_FILE)) fs.copyFileSync(PROGRESS_FILE, BACKUP_FILE);
  const tmp = PROGRESS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, PROGRESS_FILE);
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/api/progress") {
    if (req.method === "GET") return send(res, 200, JSON.stringify(readProgress()));
    if (req.method === "PUT") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          if (typeof data !== "object" || !data.items) throw new Error("bad shape");
          writeProgress(data);
          send(res, 200, '{"ok":true}');
        } catch (e) {
          send(res, 400, JSON.stringify({ ok: false, error: String(e.message) }));
        }
      });
      return;
    }
    return send(res, 405, '{"ok":false}');
  }

  const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  if (!STATIC.has(name)) return send(res, 404, "Not found", "text/plain");
  fs.readFile(path.join(ROOT, name), (err, buf) => {
    if (err) return send(res, 500, "Read error", "text/plain");
    send(res, 200, buf, TYPES[path.extname(name)]);
  });
});

function listen(port) {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && port < START_PORT + 20) return listen(port + 1);
    throw err;
  });
  server.listen(port, "127.0.0.1", () => {
    const address = `http://localhost:${port}`;
    console.log(`\n  Roadmap Control запущен: ${address}`);
    console.log(`  Прогресс сохраняется в: ${PROGRESS_FILE}`);
    console.log("  Остановить: Ctrl+C\n");
    if (!process.argv.includes("--no-open")) {
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start \"\"" : "xdg-open";
      exec(`${cmd} ${address}`);
    }
  });
}

listen(START_PORT);
