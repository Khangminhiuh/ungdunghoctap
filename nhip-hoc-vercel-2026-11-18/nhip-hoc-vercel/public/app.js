const get=id=>document.getElementById(id);
const now=new Date();
get('date').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).format(now);
let editing=null;


let currentRows = [];
async function api(path, method='GET', data) {
  const access=sessionStorage.getItem('nhip-key');
  if(!access){location.replace('/login.html');throw Error('Hãy đăng nhập.')}
  const response = await fetch(path, {method, headers: {'Content-Type':'application/json',Authorization:'Bearer '+access}, body: data ? JSON.stringify(data) : undefined});
  if(response.status===401){sessionStorage.removeItem('nhip-key');location.replace('/login.html');throw Error('Hãy đăng nhập lại.')}
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result;
}
function show(id,value){get(id).textContent=value}
// Hộp xác nhận xoá của app (không dùng hộp thoại của trình duyệt)
let confirmResolve=null;
function askDelete(text){
 if(get('confirmDelete').open)return Promise.resolve(false);
 show('confirmText',text);
 get('confirmDelete').showModal();
 return new Promise(resolve=>{confirmResolve=resolve});
}
function settleConfirm(value){
 const resolve=confirmResolve;confirmResolve=null;
 get('confirmDelete').close();
 if(resolve)resolve(value);
}
get('confirmYes').onclick=()=>settleConfirm(true);
get('confirmNo').onclick=()=>settleConfirm(false);
get('confirmDelete').addEventListener('close',()=>{if(confirmResolve){const resolve=confirmResolve;confirmResolve=null;resolve(false)}});
function syncKind(){
 const life=get('form').elements.kind.value==='life';
 get('studyField').hidden=life;get('lifeField').hidden=!life;
 show('minutesLabel',life?'Thời lượng (phút)':'Số phút học');
}
get('form').elements.kind.forEach(input=>input.onchange=syncKind);
get('filter').onchange=()=>render();
function reset(){editing=null;get('form').reset();syncKind();show('formTitle','Ghi hoạt động');get('cancel').hidden=true}
function render(){
 const rows=currentRows, known=rows.filter(r=>r.minutes!==null);
 show('weekday',new Date(get('date').value+'T12:00:00').toLocaleDateString('vi-VN',{weekday:'long',day:'numeric',month:'long'}));
 const study=known.filter(row=>row.kind!=='life'), life=known.filter(row=>row.kind==='life');
 show('lifeTotal',life.length?life.reduce((n,r)=>n+r.minutes,0)+' phút':'—');
 show('total',study.length?study.reduce((n,r)=>n+r.minutes,0)+' phút':'—');
 show('count',rows.length+' hoạt động đã ghi');show('unknown',rows.length-known.length? (rows.length-known.length)+' hoạt động chưa ghi thời lượng':'');
 const sums=new Map();for(const row of study){if(row.minutes){const s=row.subject||'Chưa ghi môn';sums.set(s,(sums.get(s)||0)+row.minutes)}}
 show('subjects',[...sums].map(([s,m])=>s+' · '+m+' phút').join(' / '));
 updateProgress();
 const visible=rows.filter(row=>get('filter').value==='all'||get('filter').value===(row.kind||'study'));
 const list=get('entries');list.dataset.empty=String(!visible.length);list.replaceChildren();if(!visible.length)list.textContent=rows.length?'Chưa có hoạt động thuộc nhóm này.':'Chưa có hoạt động nào trong ngày này.';
 for(const row of visible){
 const item=document.createElement('article');
 for(const [tag,value] of [['strong',row.period],['p',row.note],['small',[row.kind==='life'?'Sinh hoạt · '+row.category:'Học tập',row.subject,row.minutes===null?'Chưa rõ thời lượng':row.minutes+' phút'].filter(Boolean).join(' · ')]]){
 const node=document.createElement(tag);node.textContent=value;item.append(node)}
 const actions=document.createElement('div'), edit=document.createElement('button');edit.className='secondary';edit.textContent='Sửa';edit.onclick=()=>{editing=row.id;get('form').elements.kind.value=row.kind||'study';syncKind();get('category').value=row.category||'Khác';for(const field of ['period','note','subject','minutes'])get(field).value=row[field]??'';get('cancel').hidden=false;show('formTitle','Sửa hoạt động');show('msg','');get('period').focus()};const del=document.createElement('button');del.className='secondary';del.textContent='Xoá';del.onclick=async()=>{if(!await askDelete('Xoá hoạt động này?'))return;try{await api('/api/entries/'+row.id+'?day='+get('date').value,'DELETE');await refresh()}catch(e){show('msg',e.message)}};actions.append(edit,' ',del);item.append(actions);list.append(item)}
}
async function refresh(){
  const day=get('date').value;
  try {const rows=await api('/api/days/'+day); if(day===get('date').value){currentRows=rows;render()}}
  catch(error){if(day===get('date').value){show('entries','Không tải được nhật ký. Hãy tải lại trang.');show('msg',error.message)}}
}
get('date').onchange=()=>{if(!get('date').value)return;reset();currentRows=[];render();show('msg','');refresh()};

// Banner lịch hẹn sắp tới (hiện khi mở app)
async function refreshBanner(){
 const banner=get('apptBanner');
 try{
  const appts=await api('/api/appointments');
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
  const hm=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).split(':');
  const nowMin=Number(hm[0])*60+Number(hm[1]);
  const toMin=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
  const upcoming=appts.filter(a=>!a.done&&a.date===today&&toMin(a.time)>=nowMin).sort((x,y)=>x.time.localeCompare(y.time));
  const next=upcoming.length?upcoming:appts.filter(a=>!a.done&&a.date>today).sort((x,y)=>x.date.localeCompare(y.date)||x.time.localeCompare(y.time)).slice(0,1);
  if(!next.length){banner.hidden=true;banner.replaceChildren();return}
  banner.hidden=false;banner.replaceChildren();
  const strong=document.createElement('strong');
  strong.textContent=upcoming.length?'📌 Hôm nay còn '+upcoming.length+' lịch hẹn':'📌 Lịch hẹn sắp tới';
  banner.append(strong);
  for(const a of next.slice(0,3)){
   const line=document.createElement('div');
   line.textContent=(a.date===today?'':a.date+' · ')+a.time+' — '+a.title;
   banner.append(line);
  }
  const btn=document.createElement('button');btn.className='secondary';btn.textContent='Xem lịch hẹn';
  btn.onclick=()=>showView('appointments');banner.append(btn);
 }catch{banner.hidden=true}
}
refreshBanner();
get('cancel').onclick=reset;
get('form').onsubmit=async event=>{event.preventDefault();if(!get('date').value)return show('msg','Hãy chọn ngày.');
 const kind=get('form').elements.kind.value;
 const row={kind,...(kind==='life'?{category:get('category').value}:{}),id:editing||crypto.randomUUID(),period:get('period').value.trim(),note:get('note').value.trim(),subject:get('subject').value.trim(),minutes:get('minutes').value===''?null:Number(get('minutes').value)};
 if(!row.period||!row.note)return show('msg','Hãy nhập khung giờ và hoạt động.');
 get('save').disabled=true;
 try {
   await api(editing?'/api/entries/'+editing:'/api/entries', editing?'PUT':'POST',{...row,day:get('date').value});
   reset();await refresh();show('msg','Đã lưu hoạt động.');
 } catch(error){show('msg',error.message)}
 finally{get('save').disabled=false}
};

const avatarChoices = {
 planet:['🪐','Hành tinh'], fox:['🦊','Cáo'], cat:['🐱','Mèo'], frog:['🐸','Ếch'],
 panda:['🐼','Gấu trúc'], robot:['🤖','Robot'], whale:['🐳','Cá voi'], owl:['🦉','Cú mèo']
};
const themeChoices = {miku:'Miku xanh ngọc',space:'Vũ trụ tím',forest:'Rừng xanh',sunset:'Hoàng hôn'};
let profile = {name:'Khang',bio:'',avatar:'planet',theme:'miku',goal:60};
let profileReady=false;
function updateProgress(){
 const minutes=currentRows.filter(row=>row.kind!=='life').reduce((total,row)=>total+(row.minutes??0),0);
 get('progress').max=profile.goal;
 get('progress').value=Math.min(minutes,profile.goal);
 show('goalLabel','Mục tiêu '+profile.goal+' phút mỗi ngày');
}
function applyProfile(){
 document.documentElement.dataset.theme=profile.theme;
 drawAvatar('headAvatar',profile.avatar,profile.photo);
 show('headName',profile.name);
 get('openProfile').setAttribute('aria-label','Mở hồ sơ của '+profile.name);
 updateProgress();
}
function addChoice(parent,group,key,label,description){
 const wrapper=document.createElement('label'),input=document.createElement('input'),span=document.createElement('span');
 input.type='radio';input.name=group;input.value=key;input.setAttribute('aria-label',description);
 wrapper.title=description;span.textContent=label;wrapper.append(input,span);get(parent).append(wrapper);
}
for(const [key,[symbol,title]] of Object.entries(avatarChoices))addChoice('avatars','avatar',key,symbol,title);
for(const [key,title] of Object.entries(themeChoices))addChoice('themes','theme',key,title,title);
const profileForm=get('profileForm');
let draftPhoto=null, uploadVersion=0;
addChoice('avatars','avatar','photo','Ảnh riêng','Dùng ảnh riêng');
const photoChoice=get('avatars').lastElementChild;
photoChoice.hidden=true;
function drawAvatar(id,avatar,photo){
 const host=get(id);
 if(avatar==='photo' && photo){
  const img=document.createElement('img');
  img.src=photo;img.alt='';host.replaceChildren(img);
 }else host.textContent=avatarChoices[avatar]?.[0]||'🪐';
}
async function squarePhoto(file){
 if(file.size>12*1024*1024)throw Error('Hãy chọn ảnh nhỏ hơn hoặc bằng 12 MB.');
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();img.src=url;
  await img.decode();
  const side=Math.min(img.naturalWidth,img.naturalHeight);
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,256,256);
  ctx.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,256,256);
  return canvas.toDataURL('image/jpeg',0.86);
 }finally{URL.revokeObjectURL(url)}
}
get('avatarFile').onchange=async event=>{
 const file=event.target.files[0];
 if(!file)return;
 const version=++uploadVersion;
 get('saveProfile').disabled=true;
 show('profileMsg','Đang chuẩn bị ảnh…');
 try{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Hãy chọn ảnh JPG, PNG hoặc WebP.');
  const photo=await squarePhoto(file);
  if(version!==uploadVersion)return;
  draftPhoto=photo;photoChoice.hidden=false;
  profileForm.elements.avatar.value='photo';previewProfile();
  show('profileMsg','Ảnh đã sẵn sàng. Bấm Lưu hồ sơ để sử dụng.');
 }catch(error){if(version===uploadVersion)show('profileMsg',error instanceof DOMException?'Không đọc được ảnh. Hãy chọn ảnh khác.':error.message)}
 finally{if(version===uploadVersion){get('saveProfile').disabled=false;event.target.value=''}}
};
function previewProfile(){
 drawAvatar('previewAvatar',profileForm.elements.avatar.value,draftPhoto);
 show('previewName',get('displayName').value.trim()||'Tên hiển thị');
 show('previewBio',get('bio').value);
 document.documentElement.dataset.theme=profileForm.elements.theme.value;
}
async function loadProfile(){
 const saved=await api('/api/profile');
 if(saved)profile=saved;
 profileReady=true;applyProfile();
}
get('openProfile').onclick=async()=>{
 get('openProfile').disabled=true;
 try{
 if(!profileReady)await loadProfile();
 get('displayName').value=profile.name;get('bio').value=profile.bio;get('goal').value=profile.goal;
 draftPhoto=profile.photo||null;
 photoChoice.hidden=!draftPhoto;get('avatarFile').value='';
 profileForm.elements.avatar.value=profile.avatar;profileForm.elements.theme.value=profile.theme;
 show('profileMsg','');previewProfile();get('profile').showModal();
 }catch{show('msg','Chưa tải được hồ sơ. Hãy thử mở lại.')}
 finally{get('openProfile').disabled=false}
};
get('closeProfile').onclick=()=>get('profile').close();
get('profile').addEventListener('close',()=>{uploadVersion++;get('saveProfile').disabled=false;applyProfile()});
profileForm.oninput=previewProfile;
profileForm.onsubmit=async event=>{
 event.preventDefault();
 const next={name:get('displayName').value.trim(),bio:get('bio').value.trim(),goal:Number(get('goal').value),
 avatar:profileForm.elements.avatar.value,theme:profileForm.elements.theme.value};
 if(next.avatar==='photo')next.photo=draftPhoto;
 if(!next.name){show('profileMsg','Hãy nhập tên hiển thị.');return}
 get('saveProfile').disabled=true;
 try{profile=await api('/api/profile','PUT',next);applyProfile();get('profile').close();show('msg','Đã lưu hồ sơ.')}
 catch(error){show('profileMsg',error.message)}
 finally{get('saveProfile').disabled=false}
};
get('openProfile').disabled=true;
loadProfile().catch(()=>{}).finally(()=>{get('openProfile').disabled=false});
refresh();

// Menu + chuyển view (Nhật ký / Lịch sinh hoạt / Lịch hẹn)
const views={journal:'workspace',schedule:'view-schedule',appointments:'view-appointments'};
function showView(name){
 for(const [key,id] of Object.entries(views))get(id).hidden=key!==name;
 get('menu').hidden=true;get('menuBtn').setAttribute('aria-expanded','false');
 document.querySelectorAll('#menu button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
 if(name==='schedule')refreshSchedule();
 if(name==='appointments')refreshAppointments();
 if(name==='journal')refreshBanner();
}
get('menuBtn').onclick=event=>{event.stopPropagation();const open=get('menu').hidden;get('menu').hidden=!open;get('menuBtn').setAttribute('aria-expanded',String(open))};
document.querySelectorAll('#menu button').forEach(b=>b.onclick=()=>showView(b.dataset.view));
document.addEventListener('click',event=>{if(!event.target.closest('.menuWrap')){get('menu').hidden=true;get('menuBtn').setAttribute('aria-expanded','false')}});

// Lịch sinh hoạt (lặp lại theo tuần)
const weekdayNames=['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
let currentSched=[],editingSched=null;
function renderSched(){
 const list=get('schedList');list.replaceChildren();
 if(!currentSched.length){list.textContent='Chưa có khung giờ nào. Thêm một khung giờ ở bên trái.';return}
 const groups=new Map();
 for(const row of currentSched){if(!groups.has(row.weekday))groups.set(row.weekday,[]);groups.get(row.weekday).push(row)}
 for(const [day,rows] of [...groups].sort((a,b)=>a[0]-b[0])){
  const head=document.createElement('h3');head.textContent=weekdayNames[day];list.append(head);
  for(const row of rows){
   const item=document.createElement('article');
   const strong=document.createElement('strong');strong.textContent=row.start+'–'+row.end+' · '+row.title;item.append(strong);
   if(row.note){const p=document.createElement('p');p.textContent=row.note;item.append(p)}
   const actions=document.createElement('div');
   const edit=document.createElement('button');edit.className='secondary';edit.textContent='Sửa';
   edit.onclick=()=>{editingSched=row.id;get('schedWeekday').value=row.weekday;get('schedStart').value=row.start;get('schedEnd').value=row.end;get('schedTitle').value=row.title;get('schedNote').value=row.note||'';get('schedCancel').hidden=false;show('schedFormTitle','Sửa khung giờ');show('schedMsg','');get('schedTitle').focus()};
   const del=document.createElement('button');del.className='secondary';del.textContent='Xoá';
   del.onclick=async()=>{if(!await askDelete('Xoá khung giờ này?'))return;try{await api('/api/schedule/'+row.id,'DELETE');await refreshSchedule()}catch(e){show('schedMsg',e.message)}};
   actions.append(edit,' ',del);item.append(actions);list.append(item);
  }
 }
}
async function refreshSchedule(){
 try{currentSched=await api('/api/schedule');renderSched()}
 catch(e){show('schedList','Không tải được lịch sinh hoạt.');show('schedMsg',e.message)}
}
function resetSched(){editingSched=null;get('schedForm').reset();show('schedFormTitle','Thêm khung giờ');get('schedCancel').hidden=true}
get('schedCancel').onclick=resetSched;
get('schedForm').onsubmit=async event=>{
 event.preventDefault();
 const row={weekday:Number(get('schedWeekday').value),start:get('schedStart').value,end:get('schedEnd').value,title:get('schedTitle').value.trim(),note:get('schedNote').value.trim()};
 if(!row.title)return show('schedMsg','Hãy nhập việc cần làm.');
 get('schedSave').disabled=true;
 try{await api(editingSched?'/api/schedule/'+editingSched:'/api/schedule',editingSched?'PUT':'POST',row);resetSched();await refreshSchedule();show('schedMsg','Đã lưu khung giờ.')}
 catch(e){show('schedMsg',e.message)}
 finally{get('schedSave').disabled=false}
};

// Lịch hẹn (một lần)
let currentAppt=[],editingAppt=null;
function renderAppt(){
 const list=get('apptList');list.replaceChildren();
 if(!currentAppt.length){list.textContent='Chưa có lịch hẹn nào.';return}
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
 for(const row of currentAppt){
  const item=document.createElement('article');
  if(row.done)item.classList.add('done');
  const strong=document.createElement('strong');strong.textContent=row.date+' · '+row.time+' · '+row.title;item.append(strong);
  if(row.note){const p=document.createElement('p');p.textContent=row.note;item.append(p)}
  const small=document.createElement('small');small.textContent=row.done?'Đã xong':(row.date<today?'Đã qua':row.date===today?'Hôm nay':'Sắp tới');item.append(small);
  const actions=document.createElement('div');
  const done=document.createElement('button');done.className='secondary';done.textContent=row.done?'Chưa xong':'Đã xong';
  done.onclick=async()=>{try{await api('/api/appointments/'+row.id,'PUT',{date:row.date,time:row.time,title:row.title,note:row.note||'',done:!row.done});await refreshAppointments()}catch(e){show('apptMsg',e.message)}};
  const edit=document.createElement('button');edit.className='secondary';edit.textContent='Sửa';
  edit.onclick=()=>{editingAppt=row.id;get('apptDate').value=row.date;get('apptTime').value=row.time;get('apptTitle').value=row.title;get('apptNote').value=row.note||'';get('apptCancel').hidden=false;show('apptFormTitle','Sửa lịch hẹn');show('apptMsg','');get('apptTitle').focus()};
  const del=document.createElement('button');del.className='secondary';del.textContent='Xoá';
  del.onclick=async()=>{if(!await askDelete('Xoá lịch hẹn này?'))return;try{await api('/api/appointments/'+row.id,'DELETE');await refreshAppointments()}catch(e){show('apptMsg',e.message)}};
  actions.append(done,' ',edit,' ',del);item.append(actions);list.append(item);
 }
}
async function refreshAppointments(){
 try{currentAppt=await api('/api/appointments');renderAppt();refreshBanner()}
 catch(e){show('apptList','Không tải được lịch hẹn.');show('apptMsg',e.message)}
}

// Thông báo đẩy của trình duyệt (Web Push)
let pushReg=null,pushKey=null;
function b64ToUint8(s){const pad='='.repeat((4-s.length%4)%4);const b64=(s+pad).replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(b64),c=>c.charCodeAt(0))}
async function updatePushBtn(){
 const sub=await pushReg.pushManager.getSubscription();
 get('pushBtn').textContent=sub?'🔔 Đã bật thông báo':'🔔 Bật thông báo';
 show('pushMsg',sub?'Trình duyệt sẽ báo khi sắp tới giờ hẹn.':'Bật để trình duyệt báo khi sắp tới giờ hẹn.');
}
async function initPush(){
 const btn=get('pushBtn');if(!btn)return;
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){btn.hidden=true;show('pushMsg','Trình duyệt này không hỗ trợ thông báo đẩy.');return}
 try{
  pushReg=await navigator.serviceWorker.register('/sw.js');
  const info=await api('/api/push-subscribe');
  if(!info.configured){btn.disabled=true;show('pushMsg','Chưa cấu hình thông báo trên máy chủ.');return}
  pushKey=info.publicKey;
  await updatePushBtn();
 }catch(e){btn.disabled=true;show('pushMsg','Không bật được thông báo: '+e.message)}
}
get('pushBtn').onclick=async()=>{
 const btn=get('pushBtn');btn.disabled=true;
 try{
  const existing=await pushReg.pushManager.getSubscription();
  if(existing){await api('/api/push-subscribe','DELETE',{endpoint:existing.endpoint});await existing.unsubscribe()}
  else{
   const perm=await Notification.requestPermission();
   if(perm!=='granted')throw Error('Bạn chưa cho phép thông báo.');
   const sub=await pushReg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToUint8(pushKey)});
   await api('/api/push-subscribe','POST',sub.toJSON());
  }
  await updatePushBtn();
 }catch(e){show('pushMsg',e.message)}
 finally{btn.disabled=false}
};
initPush();
function resetAppt(){editingAppt=null;get('apptForm').reset();show('apptFormTitle','Thêm lịch hẹn');get('apptCancel').hidden=true}
get('apptCancel').onclick=resetAppt;
get('apptForm').onsubmit=async event=>{
 event.preventDefault();
 const row={date:get('apptDate').value,time:get('apptTime').value,title:get('apptTitle').value.trim(),note:get('apptNote').value.trim()};
 if(!row.date||!row.time||!row.title)return show('apptMsg','Hãy nhập đủ ngày, giờ và việc hẹn.');
 get('apptSave').disabled=true;
 try{await api(editingAppt?'/api/appointments/'+editingAppt:'/api/appointments',editingAppt?'PUT':'POST',row);resetAppt();await refreshAppointments();show('apptMsg','Đã lưu lịch hẹn.')}
 catch(e){show('apptMsg',e.message)}
 finally{get('apptSave').disabled=false}
};
