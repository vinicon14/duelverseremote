// Static server + fake Realtime broadcast (SSE down / POST up) + report sink.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

export function startServer({ port, dist }) {
  const topics = new Map(); // topic -> Set<res>
  const reports = new Map(); // name -> array of reports
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && url.pathname === "/events") {
      const topic = url.searchParams.get("topic");
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      res.write("data: ping\n\n");
      if (!topics.has(topic)) topics.set(topic, new Set());
      topics.get(topic).add(res);
      const ping = setInterval(() => res.write("data: ping\n\n"), 1000);
      req.on("close", () => { clearInterval(ping); topics.get(topic)?.delete(res); });
      return;
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const msg = JSON.parse(body || "{}");
          if (url.pathname === "/broadcast") {
            const line = `data: ${JSON.stringify(msg)}\n\n`;
            topics.get(msg.topic)?.forEach((r) => r.write(line));
            server.broadcasts = (server.broadcasts ?? 0) + (topics.get(msg.topic)?.size ?? 0);
          } else if (url.pathname === "/report") {
            if (!reports.has(msg.name)) reports.set(msg.name, []);
            const list = reports.get(msg.name);
            list.push(msg);
            if (list.length > 600) list.shift();
          }
        } catch { /* ignore */ }
        res.writeHead(204).end();
      });
      return;
    }
    let file = path.join(dist, url.pathname === "/" ? "index.html" : url.pathname);
    if (!file.startsWith(dist) || !fs.existsSync(file)) file = path.join(dist, "index.html");
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  server.reports = reports;
  return new Promise((resolve) => server.listen(port, "0.0.0.0", () => resolve(server)));
}
