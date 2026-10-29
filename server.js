// WUICHAT v2 (Fases 1+2): texto, stickers, imagem, voz, grupos, verificacao SMS
const express=require('express'),http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {WebSocketServer}=require('ws');
const D=process.env.DATA_DIR||__dirname,U=path.join(D,'uploads');fs.mkdirSync(U,{recursive:true});
const app=express();app.use(express.static(path.join(__dirname,'public')));app.use('/uploads',express.static(U));
const server=http.createServer(app);const wss=new WebSocketServer({server});
const F=path.join(D,'data.json');
let db={users:{},tokens:{},groups:{geral:{name:'Teste Geral',members:[]}},msgs:[]};
try{db={...db,...JSON.parse(fs.readFileSync(F))}}catch(e){}
const save=()=>fs.writeFile(F,JSON.stringify(db),()=>{});
const norm=p=>String(p||'').replace(/\D/g,'').slice(-9);
const codes=new Map();
app.post('/api/code',express.json(),async(req,res)=>{
  const phone=norm(req.body.phone),name=String(req.body.name||'').trim();
  if(phone.length<9||!name)return res.status(400).json({msg:'Escreve o nome e o telemóvel (9 dígitos).'});
  const prev=codes.get(phone);if(prev&&Date.now()-prev.at<30000)return res.status(429).json({msg:'Espera 30 segundos para pedir novo código.'});
  const code=String(crypto.randomInt(100000,1000000));codes.set(phone,{code,at:Date.now(),tries:0});
  if(!process.env.AT_API_KEY)return res.json({ok:1,dev:code}); // modo teste: mostra o codigo no ecra
  try{await fetch('https://api.africastalking.com/version1/messaging',{method:'POST',headers:{apiKey:process.env.AT_API_KEY,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
    body:new URLSearchParams({username:process.env.AT_USERNAME||'sandbox',to:'+244'+phone,message:'WUICHAT: o teu codigo e '+code})});res.json({ok:1})}
  catch(e){res.status(500).json({msg:'Falha ao enviar SMS.'})}
});
app.post('/api/verify',express.json(),(req,res)=>{
  const phone=norm(req.body.phone),c=codes.get(phone);
  if(!c||Date.now()-c.at>600000||++c.tries>5)return res.status(400).json({msg:'Código expirado. Pede outro.'});
  if(String(req.body.code).trim()!==c.code)return res.status(400).json({msg:'Código errado.'});
  codes.delete(phone);const token=crypto.randomBytes(24).toString('hex');
  db.tokens[token]=phone;db.users[phone]={name:String(req.body.name||'').trim().slice(0,30),phone};save();res.json({token});
});
app.post('/api/upload',express.raw({type:()=>true,limit:'8mb'}),(req,res)=>{
  const ext=String(req.query.ext);
  if(!db.tokens[req.query.token]||!['jpg','webm','m4a'].includes(ext)||!req.body.length)return res.status(403).json({msg:'Não autorizado'});
  const n=crypto.randomBytes(12).toString('hex')+'.'+ext;fs.writeFileSync(path.join(U,n),req.body);res.json({url:'/uploads/'+n});
});
const online=new Map();
const send=(ws,o)=>ws.readyState===1&&ws.send(JSON.stringify(o));
const dm=(a,b)=>'d:'+[a,b].sort().join('_');
const members=c=>c.startsWith('g:')?(db.groups[c.slice(2)]||{members:[]}).members:c.slice(2).split('_');
const snap=()=>({users:db.users,groups:db.groups,online:[...online.keys()]});
const bc=()=>wss.clients.forEach(c=>c.phone&&send(c,{t:'users',...snap()}));
wss.on('connection',ws=>{
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    if(m.t==='login'){
      const phone=db.tokens[m.token];
      if(!phone)return send(ws,{t:'err',msg:'Sessão inválida. Entra outra vez.'});
      ws.phone=phone;online.set(phone,ws);
      const g=db.groups.geral;if(!g.members.includes(phone)){g.members.push(phone);save()}
      send(ws,{t:'ready',me:phone,...snap()});return bc();
    }
    if(!ws.phone)return;
    if(m.t==='hist'&&members(m.chat).includes(ws.phone))
      send(ws,{t:'hist',chat:m.chat,msgs:db.msgs.filter(x=>x.chat===m.chat).slice(-200)});
    if(m.t==='msg'){
      const chat=String(m.to).startsWith('g:')?m.to:dm(ws.phone,String(m.to));
      if(!members(chat).includes(ws.phone))return;
      const kind=['sticker','image','audio'].includes(m.kind)?m.kind:'text',body=String(m.body||'').slice(0,2000);
      if(!body||(kind!=='text'&&kind!=='sticker'&&!body.startsWith('/uploads/')))return;
      const msg={chat,from:ws.phone,kind,body,ts:Date.now()};
      db.msgs.push(msg);if(db.msgs.length>20000)db.msgs.shift();save();
      members(chat).forEach(p=>online.has(p)&&send(online.get(p),{t:'msg',msg}));
    }
    if(m.t==='group'){
      const name=String(m.name||'').trim().slice(0,40);if(!name)return;
      const mem=[...new Set([ws.phone,...(m.members||[]).map(norm)])].filter(p=>db.users[p]).slice(0,500);
      db.groups[Date.now().toString(36)]={name,members:mem};save();bc();
    }
  });
  ws.on('close',()=>{if(ws.phone&&online.get(ws.phone)===ws){online.delete(ws.phone);bc()}});
});
const P=process.env.PORT||3000;
server.listen(P,'0.0.0.0',()=>console.log('WUICHAT v2 a correr na porta '+P));
