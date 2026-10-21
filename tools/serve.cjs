// Zero-dependency static server: the game uses ES modules, which need http://
// (a double-clicked file:// page can't load them; Deliverables\Pickleball.html can).
//   node tools/serve.cjs [port]      then open http://localhost:<port>/
// Phones on the same Wi-Fi use the printed address.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const root = path.join(__dirname, "..");
const port = parseInt(process.argv[2] || "8150", 10);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json",
  ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json"
};

http.createServer(function (req, res) {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const file = path.normalize(path.join(root, url === "/" ? "index.html" : url));
  if (file.indexOf(root) !== 0) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}).listen(port, function () {
  console.log("Pickleball on http://localhost:" + port + "/");
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (n) {
    nets[n].forEach(function (a) { if (a.family === "IPv4" && !a.internal) console.log("  phone on the same Wi-Fi: http://" + a.address + ":" + port + "/"); });
  });
});
