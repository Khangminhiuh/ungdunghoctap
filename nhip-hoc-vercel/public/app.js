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
 const actions=document.createElement('div'), edit=document.createElement('button');edit.className='secondary';edit.textContent='Sửa';edit.onclick=()=>{editing=row.id;get('form').elements.kind.value=row.kind||'study';syncKind();get('category').value=row.category||'Khác';for(const field of ['period','note','subject','minutes'])get(field).value=row[field]??'';get('cancel').hidden=false;show('formTitle','Sửa hoạt động');show('msg','');get('period').focus()};actions.append(edit);item.append(actions);list.append(item)}
}
async function refresh(){
  const day=get('date').value;
  try {const rows=await api('/api/days/'+day); if(day===get('date').value){currentRows=rows;render()}}
  catch(error){if(day===get('date').value){show('entries','Không tải được nhật ký. Hãy tải lại trang.');show('msg',error.message)}}
}
get('date').onchange=()=>{if(!get('date').value)return;reset();currentRows=[];render();show('msg','');refresh()};
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
