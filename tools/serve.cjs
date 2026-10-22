// Zero-dependency static server: the game uses ES modules, which need http://
// (a double-clicked file:// page can't load them; Deliverables\Pickleball.html can).
//   node tools/serve.cjs [port]      then open http://localhost:<port>/
// Phones on the same Wi-Fi use the printed address.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

// node tools/serve.cjs 8197 Work   serves just the game (what Dev Mode and a tunnel need); no dir = the repo root (harness)
const root = process.argv[3] ? path.resolve(path.join(__dirname, ".."), process.argv[3]) : path.join(__dirname, "..");
const port = parseInt(process.argv[2] || "8150", 10);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json",
  ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json", ".glb": "model/gltf-binary", ".mp3": "audio/mpeg"
};

http.createServer(function (req, res) {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const file = path.normalize(path.join(root, url === "/" ? "index.html" : url));
  if (file.indexOf(root) !== 0) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    // TEST ONLY: the game has no test switches of its own. A page asked for with ?fake=<id> gets the stand-in SDK
    // (tools/fake-hoplobby.js) in place of HopLobby's, and &auto adds the autopilot (tools/auto.js).
    const q = new URLSearchParams(req.url.split("?")[1] || "");
    if (q.has("fake") && path.extname(file) === ".html") {
      let html = data.toString("utf8").replace('<script src="https://hoplobby.com/sdk/v1/hoplobby.js"></script>', '<script type="module" src="/tools/fake-hoplobby.js"></script>');
      if (q.has("auto")) html = html.replace("</body>", '<script defer src="/tools/auto.js"></script>\n</body>');
      data = Buffer.from(html, "utf8");
    }
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
