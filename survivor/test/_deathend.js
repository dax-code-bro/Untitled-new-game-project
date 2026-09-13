const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const OUT='/tmp/claude-0/deathend';
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(8137,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:1100,height:660}});
const errs=[];
pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text());});
await pg.goto('http://localhost:8137/survivor/index.html',{waitUntil:'load'});
await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
await pg.click('#startBtn');await pg.waitForTimeout(3000);
// Kill for real, through the physiology.
await pg.evaluate(()=>{const S=window.SURVIVOR;S.player.body.coreTempC=23;});
await pg.waitForFunction(()=>!!window.SURVIVOR.ctx.state.dying,{timeout:60000}).catch(()=>{});
console.log('dying:',await pg.evaluate(()=>JSON.stringify(window.SURVIVOR.ctx.state.dying||null)));
for (let i=0;i<10;i++){await pg.waitForTimeout(1500);
 console.log(i, await pg.evaluate(()=>{const v=document.getElementById('deathVeil');
  return JSON.stringify({over:document.getElementById('gameover').hidden,veil:v&&v.style.opacity,
   dead:!!window.SURVIVOR.ctx.state.dead});}));}
console.log(errs.slice(0,8).join('\n'));
await pg.waitForSelector('#gameover:not([hidden])',{timeout:40000});
await pg.waitForTimeout(500);
await pg.screenshot({path:path.join(OUT,'gameover.png')});
console.log('gameover shown');
// And back again.
await pg.click('#gameover .btn');await pg.waitForTimeout(2500);
const back=await pg.evaluate(()=>({dead:!!window.SURVIVOR.ctx.state.dead,hud:!document.getElementById('hud').hidden,
 over:document.getElementById('gameover').hidden,body:window.SURVIVOR.game.actors.filter(a=>/^fp:/.test(a.name||'')&&a.visible).length}));
console.log('after respawn:',JSON.stringify(back));
await pg.screenshot({path:path.join(OUT,'respawned.png')});
console.log(errs.length?errs.slice(0,6).join('\n'):'no console errors');
await b.close();server.close();})();
