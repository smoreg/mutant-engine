import { createServer, request } from "node:http";
import { once } from "node:events";
import { expect, it } from "vitest";
import { jsonRequest } from "../studio/http.js";

it("preserves split UTF-8 and refuses malformed, oversized and foreign writes before routing", async () => {
  let calls = 0;
  const server = createServer((req, res) => jsonRequest(req, res, body => {
    calls++; return { status: 200, json: body };
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  async function send(chunks: Buffer[], headers: Record<string,string> = {}) {
    return await new Promise<{status:number; body:string}>((resolve,reject) => {
      const req = request({ hostname:"127.0.0.1", port, method:"POST", headers: { "content-type":"application/json", ...headers } }, res => {
        let body="";
        res.on("data", c => body+=c);
        res.on("end",()=>resolve({status:res.statusCode!,body}));
      });
      req.on("error",reject);
      for (const chunk of chunks) req.write(chunk);
      req.end();
    });
  }
  try {
    const bytes=Buffer.from(JSON.stringify({name:"Жук"}));
    const split=bytes.indexOf(Buffer.from("Ж"))+1;
    expect(await send([bytes.subarray(0,split),bytes.subarray(split)])).toEqual({status:200,body:'{"name":"Жук"}'});
    expect((await send([Buffer.from("{")])).status).toBe(400);
    expect((await send([bytes], {origin:"https://foreign.example"})).status).toBe(403);
    expect((await send([bytes], {"content-type":"text/plain"})).status).toBe(415);
    expect((await send([Buffer.alloc(1024*1024+1,32)])).status).toBe(413);
    expect(calls).toBe(1);
  } finally { await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())); }
});

it("decodes a character split across incoming data events exactly once", async () => {
  const { PassThrough } = await import("node:stream");
  const stream = new PassThrough() as InstanceType<typeof PassThrough> & {method:string;headers:Record<string,string>};
  stream.method="POST";stream.headers={"content-type":"application/json"};
  let answer="";
  const response={writableEnded:false,writeHead:()=>{},end:(s:string)=>{answer=s;response.writableEnded=true;}};
  jsonRequest(stream as unknown as import("node:http").IncomingMessage, response as unknown as import("node:http").ServerResponse,
    body=>({status:200,json:body}));
  const bytes=Buffer.from('"Ж"');
  stream.write(bytes.subarray(0,2));
  stream.end(bytes.subarray(2));
  await once(stream,"end");
  expect(answer).toBe('"Ж"');
});
