import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const walk = async (dir) =>
  (
    await Promise.all(
      (await fs.readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? walk(dir + "/" + e.name) : [dir + "/" + e.name],
      ),
    )
  ).flat();
const files = (await walk("dist")).filter((f) => !f.endsWith("sw.js")).sort();
const hash = createHash("sha256");
for (const f of files) hash.update(await fs.readFile(f));
const key = "ductledger-" + hash.digest("hex").slice(0, 16);
const urls = files.map((f) => "/" + f.slice(5));
await fs.writeFile(
  "dist/sw.js",
  `const CACHE=${JSON.stringify(key)}, ASSETS=${JSON.stringify(urls)};
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);for(let i=0;i<ASSETS.length;i+=16)await c.addAll(ASSETS.slice(i,i+16));await self.skipWaiting()})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('ductledger-')&&k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match(u.pathname.startsWith('/workspace')?'/workspace/index.html':'/index.html')));return}if(ASSETS.includes(u.pathname))e.respondWith(caches.match(u.pathname).then(r=>r||fetch(e.request)))});
`,
);
console.log("Offline application shell:", urls.length, "local assets");
