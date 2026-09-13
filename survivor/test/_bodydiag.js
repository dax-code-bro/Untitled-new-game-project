const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{await new Promise(r=>server.listen(8127,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:900,height:600}});
pg.on('pageerror',e=>console.log('ERR',e.message));
await pg.goto('http://localhost:8127/survivor/index.html',{waitUntil:'load'});
await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
await pg.click('#startBtn');await pg.waitForTimeout(2500);
const out=await pg.evaluate(()=>{
  const S=window.SURVIVOR,cam=S.game.camera;
  const rows=[];
  for(const a of S.game.actors){
    if(!/^fp:r:(shoulder|upperArm|forearm|palm)$/.test(a.name||''))continue;
    const d=Math.hypot(a.position.x-cam.position.x,a.position.y-cam.position.y,a.position.z-cam.position.z);
    rows.push({n:a.name,p:[+a.position.x.toFixed(3),+a.position.y.toFixed(3),+a.position.z.toFixed(3)],d:+d.toFixed(3),vis:a.visible});
  }
  return {near:cam.near,far:cam.far,fov:cam.fov,cam:[+cam.position.x.toFixed(3),+cam.position.y.toFixed(3),+cam.position.z.toFixed(3)],rows};
});
console.log(JSON.stringify(out,null,1));
await b.close();server.close();})();
