import { createHash, randomUUID } from "node:crypto";
import { sendNotification, setVapidDetails } from 'web-push';
const fields={kind:{type:'string',enum:['study','life'],description:'study cho học tập, life cho sinh hoạt cá nhân'},category:{type:'string',enum:['Ăn uống','Ngủ nghỉ','Vận động','Giải trí','Việc cá nhân','Khác']},day:{type:'string',description:'Ngày YYYY-MM-DD, theo giờ Việt Nam'},period:{type:'string',description:'Khung giờ do người dùng nêu'},note:{type:'string',description:'Hoạt động thực tế người dùng báo'},subject:{type:'string'},minutes:{type:['integer','null'],description:'Thời lượng hoạt động đã biết, tính bằng phút. Bỏ trống nếu chưa rõ.'}};
const schema=(properties,required)=>({type:'object',properties,required,additionalProperties:false});
const actions=[
 {name:'read_day',description:'Đọc nhật ký một ngày.',inputSchema:schema({day:fields.day},['day'])},
 {name:'add_entry',description:'Ghi hoạt động do Khang báo, không suy đoán số phút.',inputSchema:schema(fields,['day','period','note'])},
 {name:'edit_entry',description:'Sửa hoạt động trong ngày theo ID, gửi đủ nội dung sau chỉnh sửa.',inputSchema:schema({...fields,id:{type:'string'}},['day','id','period','note'])},
 {name:'delete_entry',description:'Xoá một hoạt động theo ID.',inputSchema:schema({day:fields.day,id:{type:'string'}},['day','id'])},
 {name:'list_schedule',description:'Xem lịch sinh hoạt lặp lại theo tuần.',inputSchema:schema({},[])},
 {name:'add_schedule',description:'Thêm một khung giờ sinh hoạt lặp lại theo tuần.',inputSchema:schema({weekday:{type:'integer',description:'0=Chủ nhật, 1=Thứ 2 … 6=Thứ 7'},start:{type:'string',description:'Giờ bắt đầu HH:MM'},end:{type:'string',description:'Giờ kết thúc HH:MM'},title:{type:'string'},note:{type:'string'}},['weekday','start','end','title'])},
 {name:'edit_schedule',description:'Sửa một khung giờ sinh hoạt theo ID.',inputSchema:schema({weekday:{type:'integer'},start:{type:'string'},end:{type:'string'},title:{type:'string'},note:{type:'string'},id:{type:'string'}},['weekday','start','end','title','id'])},
 {name:'delete_schedule',description:'Xoá một khung giờ sinh hoạt theo ID.',inputSchema:schema({id:{type:'string'}},['id'])},
 {name:'list_appointments',description:'Xem tất cả lịch hẹn.',inputSchema:schema({},[])},
 {name:'add_appointment',description:'Thêm một lịch hẹn.',inputSchema:schema({date:fields.day,time:{type:'string',description:'Giờ hẹn HH:MM'},title:{type:'string'},note:{type:'string'},done:{type:'boolean'}},['date','time','title'])},
 {name:'edit_appointment',description:'Sửa một lịch hẹn theo ID.',inputSchema:schema({date:fields.day,time:{type:'string'},title:{type:'string'},note:{type:'string'},done:{type:'boolean'},id:{type:'string'}},['date','time','title','id'])},
 {name:'delete_appointment',description:'Xoá một lịch hẹn theo ID.',inputSchema:schema({id:{type:'string'}},['id'])}
];
const isDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const isTime=t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t);
// Nhắc lịch hẹn: cửa sổ 30 phút trước giờ hẹn, giờ Việt Nam (UTC+7)
const REMIND_WINDOW_MIN=30;
const vnNow=()=>{const d=new Date(Date.now()+7*3600*1000);return {date:d.toISOString().slice(0,10),minutes:d.getUTCHours()*60+d.getUTCMinutes()}};
const timeToMin=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
const subHash=endpoint=>createHash('sha256').update(endpoint).digest('hex').slice(0,16);
async function sendTelegram(env,text){
 if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return false;
 try{
  const r=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text})});
  return r.ok;
 }catch{return false}
}
async function sendPush(env,subs,payload){
 if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return 0;
 setVapidDetails(env.VAPID_SUBJECT||'mailto:khang@ungdunghoctap.local',env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
 let sent=0;
 for(const sub of subs){
  try{await sendNotification(sub,JSON.stringify(payload));sent++}
  catch(e){if(e.statusCode===404||e.statusCode===410){try{await env.BUCKET.delete('push-subs/'+subHash(sub.endpoint))}catch{}}}
 }
 return sent;
}
async function collectionAction(name,a,bucket){
 const coll=name.includes('schedule')?'schedule':'appointments';
 const kind=name.split('_')[0],prefix=coll+'/';
 if(kind==='list'){
  const rows=await bucket.day(prefix);
  return rows.sort((x,y)=>coll==='schedule'?(x.weekday-y.weekday)||x.start.localeCompare(y.start):x.date.localeCompare(y.date)||x.time.localeCompare(y.time));
 }
 if(kind==='delete'){
  if(!/^[0-9a-f-]{36}$/.test(a.id))throw Error('ID không hợp lệ.');
  const old=await bucket.get(prefix+a.id);if(!old)throw Error('Không tìm thấy bản ghi.');
  await bucket.delete(prefix+a.id);return {deleted:true,id:a.id}
 }
 if(kind!=='add'&&kind!=='edit')throw Error('Lệnh không hợp lệ.');
 if(coll==='schedule'){
  if(!Number.isInteger(a.weekday)||a.weekday<0||a.weekday>6)throw Error('Ngày trong tuần không hợp lệ.');
  if(!isTime(a.start)||!isTime(a.end)||a.end<=a.start)throw Error('Khung giờ không hợp lệ.');
 }else{
  if(!isDay(a.date))throw Error('Ngày không hợp lệ.');
  if(!isTime(a.time))throw Error('Giờ không hợp lệ.');
  if(a.done!==undefined&&typeof a.done!=='boolean')throw Error('Trạng thái không hợp lệ.');
 }
 if(typeof a.title!=='string'||!a.title.trim()||a.title.length>120)throw Error('Kiểm tra tiêu đề.');
 if(a.note!==undefined&&(typeof a.note!=='string'||a.note.length>2000))throw Error('Kiểm tra ghi chú.');
 let previous={},created=new Date().toISOString(),id=randomUUID();
 if(kind==='edit'){
  if(!/^[0-9a-f-]{36}$/.test(a.id))throw Error('ID không hợp lệ.');
  id=a.id;const old=await bucket.get(prefix+id);if(!old)throw Error('Không tìm thấy bản ghi.');previous=await old.json();created=previous.created
 }
 const row=coll==='schedule'
  ?{id,created,weekday:a.weekday,start:a.start,end:a.end,title:a.title.trim(),note:(a.note||'').trim()}
  :{id,created,date:a.date,time:a.time,title:a.title.trim(),note:(a.note||'').trim(),done:a.done??previous.done??false};
 await bucket.put(prefix+id,JSON.stringify(row));return row
}
async function action(name,a,bucket){
 if(name.includes('schedule')||name.includes('appointment'))return collectionAction(name,a,bucket);
 if(!isDay(a.day))throw Error('Ngày không hợp lệ.');
 const prefix='journal/'+a.day+'/';
 if(name==='read_day'){
  const rows=await bucket.day(prefix);
  return rows.sort((a,b)=>a.created.localeCompare(b.created))
 }
 if(name==='delete_entry'){
  if(!/^[0-9a-f-]{36}$/.test(a.id))throw Error('ID không hợp lệ.');
  const old=await bucket.get(prefix+a.id);if(!old)throw Error('Không tìm thấy bản ghi.');
  await bucket.delete(prefix+a.id);return {deleted:true,id:a.id,day:a.day}
 }
 if(!['edit_entry','add_entry'].includes(name))throw Error('Lệnh không hợp lệ.');
 for(const [k,max] of [['note',4000],['period',100],['subject',120]]){
  if(k==='subject'&&a[k]===undefined)continue;
  if(typeof a[k]!=='string'||a[k].length>max||(k!=='subject'&&!a[k].trim()))throw Error('Kiểm tra trường '+k)
 }
 if(a.minutes!=null&&(!Number.isInteger(a.minutes)||a.minutes<0||a.minutes>1440))throw Error('Số phút không hợp lệ.');
 let previous={};
 let created=new Date().toISOString(),id=randomUUID();
 if(name==='edit_entry'){
  if(!/^[0-9a-f-]{36}$/.test(a.id))throw Error('ID không hợp lệ.');
  id=a.id;const old=await bucket.get(prefix+id);if(!old)throw Error('Không tìm thấy bản ghi.');previous=await old.json();created=previous.created
 }
 const kind=a.kind??previous.kind??'study';
 const category=kind==='life'?(a.category??previous.category??'Khác'):'';
 if(!['study','life'].includes(kind)||(kind==='life'&&!fields.category.enum.includes(category)))throw Error('Nhóm hoạt động không hợp lệ.');
 const row={kind,category,id,created,day:a.day,period:a.period,note:a.note,subject:kind==='study'?(a.subject||''):'',minutes:a.minutes??null};await bucket.put(prefix+id,JSON.stringify(row));return row
}
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 try{
 if(path==='/api/profile'){
  const key='settings/profile';
  if(request.method==='GET'){
   const stored=await env.BUCKET.get(key);
   return Response.json(stored?await stored.json():null,{headers:{'Cache-Control':'no-store'}});
  }
  if(request.method==='PUT'){
   if(!request.headers.get('content-type')?.includes('application/json'))return new Response(null,{status:415});
   const {name,bio,avatar,theme,goal,photo}=await request.json();
   if(typeof name!=='string'||!name.trim()||name.length>40||typeof bio!=='string'||bio.length>120||
      !['photo','planet','fox','cat','frog','panda','robot','whale','owl'].includes(avatar)||
      !['miku','space','forest','sunset'].includes(theme)||!Number.isInteger(goal)||goal<1||goal>1440)throw Error('Kiểm tra thông tin hồ sơ.');
   const profile={name:name.trim(),bio:bio.trim(),avatar,theme,goal};
   if(avatar==='photo'){
    if(typeof photo!=='string'||photo.length>180000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+=*$/.test(photo))throw Error('Ảnh đại diện không hợp lệ.');
    profile.photo=photo;
   }
   await env.BUCKET.put(key,JSON.stringify(profile));return Response.json(profile);
  }
 }
 if(path==='/mcp'&&request.method==='POST'){
 const q=await request.json();let result;
 if(q.method==='server/discover')result={supportedVersions:['2026-07-28'],capabilities:{tools:{}}};
 else if(q.method==='tools/list')result={tools:actions};
 else if(q.method==='tools/call'){try{const data=await action(q.params.name,q.params.arguments,env.BUCKET);result={content:[{type:'text',text:JSON.stringify(data)}]}}catch(e){result={isError:true,content:[{type:'text',text:e.message}]}}}
 else return Response.json({id:q.id,jsonrpc:'2.0',error:{code:-32601,message:'Unknown method'}});
 return Response.json({jsonrpc:'2.0',id:q.id,result})
 }
 if(path.startsWith('/api/days/')&&request.method==='GET')return Response.json(await action('read_day',{day:path.slice(10)},env.BUCKET));
 if((path==='/api/entries'&&request.method==='POST')||(path.startsWith('/api/entries/')&&request.method==='PUT')){
 if(!request.headers.get('Content-Type')?.includes('application/json'))return new Response(null,{status:415});
 const a=await request.json();const edit=request.method==='PUT';if(edit)a.id=path.slice(13);return Response.json(await action(edit?'edit_entry':'add_entry',a,env.BUCKET))
 }
 if(path.startsWith('/api/entries/')&&request.method==='DELETE'){
  const day=new URL(request.url).searchParams.get('day');
  return Response.json(await action('delete_entry',{day,id:path.slice(13)},env.BUCKET))
 }
 for(const coll of ['schedule','appointments']){
  const sing=coll==='appointments'?'appointment':'schedule',base='/api/'+coll;
  if(path===base&&request.method==='GET')return Response.json(await action('list_'+coll,{},env.BUCKET));
  if(path===base&&request.method==='POST'){
   if(!request.headers.get('Content-Type')?.includes('application/json'))return new Response(null,{status:415});
   return Response.json(await action('add_'+sing,await request.json(),env.BUCKET))
  }
  if(path.startsWith(base+'/')&&(request.method==='PUT'||request.method==='DELETE')){
   const id=path.slice(base.length+1);
   if(request.method==='DELETE')return Response.json(await action('delete_'+sing,{id},env.BUCKET));
   if(!request.headers.get('Content-Type')?.includes('application/json'))return new Response(null,{status:415});
   const a=await request.json();a.id=id;return Response.json(await action('edit_'+sing,a,env.BUCKET))
  }
 }
 if(path==='/api/remind'&&request.method==='POST'){
  const now=vnNow();
  const appts=await action('list_appointments',{},env.BUCKET);
  const due=appts.filter(a=>!a.done&&a.date===now.date&&timeToMin(a.time)>=now.minutes&&timeToMin(a.time)<=now.minutes+REMIND_WINDOW_MIN);
  const subs=await env.BUCKET.day('push-subs/');
  let telegram=0,push=0,skipped=0;const sent=[];
  for(const a of due){
   if(await env.BUCKET.get('reminded/'+a.id)){skipped++;continue}
   const text='📌 Sắp có lịch hẹn: '+a.time+' — '+a.title+(a.note?'\n'+a.note:'');
   if(await sendTelegram(env,text))telegram++;
   push+=await sendPush(env,subs,{title:'Sắp có lịch hẹn',body:a.time+' — '+a.title});
   await env.BUCKET.put('reminded/'+a.id,JSON.stringify({at:new Date().toISOString(),title:a.title}));
   sent.push(a.title);
  }
  return Response.json({checked:appts.length,due:due.length,sent,skipped,telegram,push});
 }
 if(path==='/api/push-subscribe'&&request.method==='GET'){
  const subs=await env.BUCKET.day('push-subs/');
  return Response.json({configured:!!env.VAPID_PUBLIC_KEY,publicKey:env.VAPID_PUBLIC_KEY||null,count:subs.length});
 }
 if(path==='/api/push-subscribe'&&request.method==='POST'){
  if(!request.headers.get('Content-Type')?.includes('application/json'))return new Response(null,{status:415});
  const sub=await request.json();
  if(!sub||typeof sub.endpoint!=='string'||!sub.endpoint.startsWith('https://')||!sub.keys||typeof sub.keys.p256dh!=='string'||typeof sub.keys.auth!=='string')throw Error('Thông tin đăng ký thông báo không hợp lệ.');
  await env.BUCKET.put('push-subs/'+subHash(sub.endpoint),JSON.stringify({endpoint:sub.endpoint,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth}}));
  return Response.json({saved:true});
 }
 if(path==='/api/push-subscribe'&&request.method==='DELETE'){
  const {endpoint}=await request.json().catch(()=>({}));
  if(typeof endpoint!=='string')throw Error('Thiếu endpoint.');
  await env.BUCKET.delete('push-subs/'+subHash(endpoint));
  return Response.json({deleted:true});
 }
 return new Response(null,{status:404})
 }catch(e){return Response.json({error:e.message},{status:400})}
}};