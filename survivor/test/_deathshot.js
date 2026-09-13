const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const OUT=process.env.SHOT_DIR||'/tmp/claude-0/deathshots';
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(8135,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:1100,height:660}});
pg.on('pageerror',e=>console.log('ERR',e.message));
pg.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
await pg.goto('http://localhost:8135/survivor/index.html',{waitUntil:'load'});
await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
await pg.click('#startBtn');await pg.waitForTimeout(2800);
await pg.evaluate(()=>{window.SURVIVOR.world.clock.simSeconds=12*3600;});
const CAUSES=['exsanguination','hypothermia','trauma','drowning'];
for(const cause of CAUSES){
  await pg.evaluate((c)=>{
    const S=window.SURVIVOR;
    S.ctx.state.dead=false;S.ctx.state.dying=null;
    S.ctx.emit('respawn',{});
    S.ctx.state.dying={cause:c,day:1,permanent:false,t:0,claimed:false};
    S.ctx.emit('death',{cause:c,day:1,permanent:false});
  },cause);
  for(const frac of [0.3,0.7,1.0]){
    await pg.waitForTimeout(1900);
    await pg.screenshot({path:path.join(OUT,`${cause}-${frac}.png`)});
  }
  console.log('  ',cause);
}
await b.close();server.close();})();
