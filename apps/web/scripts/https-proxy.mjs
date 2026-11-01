// Local HTTPS front for browser tests: https://localhost:3443 -> http://127.0.0.1:3100.
// Self-signed certificate, generated in memory each start. Test use only.
import http from "node:http";
import https from "node:https";
import selfsigned from "selfsigned";

const target = { host: "127.0.0.1", port: Number(process.env.TARGET_PORT ?? 3100) };
const pems = await selfsigned.generate([{ name: "commonName", value: "localhost" }], { days: 2, keySize: 2048, extensions: [{ name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }] }] });
https
  .createServer({ key: pems.private, cert: pems.cert }, (req, res) => {
    const headers = { ...req.headers, "x-forwarded-for": req.socket.remoteAddress ?? "127.0.0.1", "x-forwarded-proto": "https" };
    const up = http.request({ ...target, method: req.method, path: req.url, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => { res.writeHead(502); res.end("upstream error"); });
    req.pipe(up);
  })
  .listen(Number(process.env.PORT ?? 3443), () => console.log("https proxy ready"));
