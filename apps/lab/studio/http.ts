import type { IncomingMessage, ServerResponse } from "node:http";

type Answer = { status: number; json: unknown };
/** Decode once: a UTF-8 character may span multiple network chunks. */
export function jsonRequest(req: IncomingMessage, res: ServerResponse, route: (body: unknown) => Answer): void {
  const reply = (status: number, json: unknown) => {
    if (res.writableEnded) return;
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(json));
  };
  const writing = !["GET", "HEAD"].includes(req.method ?? "GET");
  if (writing && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
    reply(403, { error: "foreign origin" }); req.resume(); return;
  }
  if (writing && req.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") {
    reply(415, { error: "application/json required" }); req.resume(); return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  req.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > 1024 * 1024) { reply(413, { error: "request too large" }); return; }
    chunks.push(chunk);
  });
  req.on("end", () => {
    if (res.writableEnded) return;
    let body: unknown;
    try { body = size ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined; }
    catch { reply(400, { error: "invalid JSON" }); return; }
    try { const answer = route(body); reply(answer.status, answer.json); }
    catch { reply(500, { error: "internal error" }); }
  });
  req.on("error", () => reply(400, { error: "incomplete request" }));
}
