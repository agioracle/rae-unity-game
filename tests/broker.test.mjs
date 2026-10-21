import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, realpath, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
const broker = new URL("../dist/core/broker.js", import.meta.url).href;

test("broker preserves colliding backend callback IDs, progress, cancellation and resources from only one backend", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "rug-broker-"));
  const scripts = {};
  try {
    for (const owner of ["core", "unity"]) {
      const file = join(root, owner + ".mjs");
      scripts[owner] = file;
      await writeFile(
        file,
        `import{createInterface}from'node:readline';import{writeFileSync}from'node:fs';
const owner=${JSON.stringify(owner)};const out=m=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...m})+'\\n');let pending;
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
 if(m.method==='initialize')out({id:m.id,result:{protocolVersion:m.params.protocolVersion,serverInfo:{name:owner,version:'1'},capabilities:{tools:{},...(owner==='unity'?{resources:{}}:{})}}});
 else if(m.method==='tools/list')out({id:m.id,result:{tools:[{name:owner==='unity'?'unity_callback':'core_callback',inputSchema:{type:'object'},description:owner}]}});
 else if(m.method==='resources/list')out({id:m.id,result:{resources:[{uri:'unity-reconstruction://fixture',name:'fixture'}]}});
 else if(m.method==='tools/call'){pending=m;if(m.params.name.endsWith('_wait'))return;out({method:'roots/list',id:7,params:{_meta:{owner,cancel:m.params.name==='core_cancel_callback'}}});if(m.params.name==='core_cancel_callback'){const original=m.id;setTimeout(()=>out({method:'notifications/cancelled',params:{requestId:7}}),10);setTimeout(()=>out({id:original,result:{content:[{type:'text',text:'cancelled callback'}]}}),50);return;}if(m.params._meta?.progressToken!==undefined)out({method:'notifications/progress',params:{progressToken:m.params._meta.progressToken,progress:1,total:1,message:owner}});}
 else if(m.method==='notifications/cancelled'){writeFileSync(${JSON.stringify(join(root, owner + ".cancel"))},JSON.stringify(m));}
 else if(m.id===7&&m.result&&pending)out({id:pending.id,result:{content:[{type:'text',text:JSON.stringify({owner,callback:m.result})}],structuredContent:{owner},_meta:{'fixture/evidence':owner}}});
});`,
      );
    }
    const expression = `import{serveEdition}from ${JSON.stringify(broker)};await serveEdition(${JSON.stringify(scripts.unity)},{coreEntry:${JSON.stringify(scripts.core)},domainEntry:${JSON.stringify(scripts.unity)}});`;
    const client = new Client(
      { name: "callback-client", version: "1" },
      { capabilities: { roots: { listChanged: false } } },
    );
    let callbackCancellation = false;
    client.setRequestHandler(ListRootsRequestSchema, async (request, extra) => {
      if (request.params?._meta?.cancel)
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 200);
          extra.signal.addEventListener(
            "abort",
            () => {
              callbackCancellation = true;
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      return {
        roots: [
          {
            uri: `file:///${request.params?._meta?.owner}`,
            name: "callback scope",
          },
        ],
      };
    });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--input-type=module", "-e", expression],
      stderr: "pipe",
    });
    try {
      await client.connect(transport);
      const resources = await client.listResources();
      assert.equal(resources.resources.length, 1);
      await client.listTools();
      const progress = [];
      const results = await Promise.all(
        ["core_callback", "unity_callback"].map((name) =>
          client.callTool({ name, arguments: {} }, undefined, {
            onprogress: (p) => progress.push(p.message),
          }),
        ),
      );
      assert.deepEqual(
        results.map((r) => JSON.parse(r.content[0].text).owner),
        ["core", "unity"],
      );
      assert.deepEqual(
        results.map((r) => r.structuredContent.owner),
        ["core", "unity"],
      );
      assert.deepEqual(
        results.map((r) => r._meta["fixture/evidence"]),
        ["core", "unity"],
      );
      assert.deepEqual(
        results.map((r) => JSON.parse(r.content[0].text).callback.roots[0].uri),
        ["file:///core", "file:///unity"],
      );
      assert.deepEqual(progress.sort(), ["core", "unity"]);
      await client.callTool({ name: "core_cancel_callback", arguments: {} });
      assert.equal(
        callbackCancellation,
        true,
        "Backend cancellation must use the remapped callback ID.",
      );
      const abort = new AbortController();
      const pending = client.callTool(
        { name: "unity_wait", arguments: {} },
        undefined,
        { signal: abort.signal },
      );
      await new Promise((r) => setTimeout(r, 40));
      abort.abort();
      await assert.rejects(pending);
      for (let i = 0; i < 20; i++) {
        try {
          const m = JSON.parse(
            await readFile(join(root, "unity.cancel"), "utf8"),
          );
          assert.equal(m.method, "notifications/cancelled");
          break;
        } catch (e) {
          if (i === 19) throw e;
          await new Promise((r) => setTimeout(r, 20));
        }
      }
    } finally {
      await client.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
