import { randomUUID } from "node:crypto";
const fields={kind:{type:'string',enum:['study','life'],description:'study cho học tập, life cho sinh hoạt cá nhân'},category:{type:'string',enum:['Ăn uống','Ngủ nghỉ','Vận động','Giải trí','Việc cá nhân','Khác']},day:{type:'string',description:'Ngày YYYY-MM-DD, theo giờ Việt Nam'},period:{type:'string',description:'Khung giờ do người dùng nêu'},note:{type:'string',description:'Hoạt động thực tế người dùng báo'},subject:{type:'string'},minutes:{type:['integer','null'],description:'Thời lượng hoạt động đã biết, tính bằng phút. Bỏ trống nếu chưa rõ.'}};
const schema=(properties,required)=>({type:'object',properties,required,additionalProperties:false});
const actions=[
 {name:'read_day',description:'Đọc nhật ký một ngày.',inputSchema:schema({day:fields.day},['day'])},
 {name:'add_entry',description:'Ghi hoạt động do Khang báo, không suy đoán số phút.',inputSchema:schema(fields,['day','period','note'])},
 {name:'edit_entry',description:'Sửa hoạt động trong ngày theo ID, gửi đủ nội dung sau chỉnh sửa.',inputSchema:schema({...fields,id:{type:'string'}},['day','id','period','note'])}
];
async function action(name,a,bucket){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(a.day)||new Date(a.day+'T12:00:00Z').toISOString().slice(0,10)!==a.day)throw Error('Ngày không hợp lệ.');
 const prefix='journal/'+a.day+'/';
 if(name==='read_day'){
  const rows=await bucket.day(prefix);
  return rows.sort((a,b)=>a.created.localeCompare(b.created))
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
 return new Response(null,{status:404})
 }catch(e){return Response.json({error:e.message},{status:400})}
}};