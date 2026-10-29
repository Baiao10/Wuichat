self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));

// Notificação vinda do servidor (se um dia enviares push)
self.addEventListener('push',e=>{
  let data={title:'WUICHAT',body:'Nova mensagem',chat:''};
  try{data={...data,...e.data.json()}}catch{}
  e.waitUntil(self.registration.showNotification(data.title,{
    body:data.body,icon:'/icon.svg',badge:'/icon.svg',
    tag:data.chat||'wuichat',vibrate:[40,60,40],
    data:{chat:data.chat}
  }));
});

// Clique na notificação → abre o chat
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const chat=e.notification.data&&e.notification.data.chat;
  e.waitUntil(
    self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      for(const c of list){
        if('focus'in c){c.postMessage({type:'openChat',chat});return c.focus()}
      }
      return self.clients.openWindow('/'+(chat?'?chat='+encodeURIComponent(chat):''));
    })
  );
});

// fetch pass-through
self.addEventListener('fetch',()=>{});