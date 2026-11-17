import { createHash, timingSafeEqual } from 'node:crypto';
import journal from '../lib/journal.js';

async function redis(...command) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method:'POST',
    headers:{Authorization:'Bearer '+process.env.UPSTASH_REDIS_REST_TOKEN,'Content-Type':'application/json'},
    body:JSON.stringify(command)
  });
  if (!response.ok) throw Error('Không kết nối được Upstash. Kiểm tra URL và token trên Vercel.');
  const {result,error}=await response.json();
  if(error) throw Error('Upstash chưa thực hiện được lệnh.');
  return result;
}
function splitKey(key){
  const index=key.lastIndexOf('/');
  return ['nhip:'+key.slice(0,index+1),key.slice(index+1)];
}
const store={
  async get(key){const value=await redis('HGET',...splitKey(key));return value===null?null:{json:()=>JSON.parse(value)}},
  async put(key,value){await redis('HSET',...splitKey(key),value)},
  async day(prefix){return (await redis('HVALS','nhip:'+prefix)).map(value=>JSON.parse(value))}
};
const digest=value=>createHash('sha256').update(value).digest();
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(!process.env.NHIP_HOC_KEY || !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)
    return res.status(503).json({error:'Thiếu biến môi trường. Hãy cấu hình đủ 3 biến rồi Redeploy.'});
  if(!timingSafeEqual(digest(req.headers.authorization||''),digest('Bearer '+process.env.NHIP_HOC_KEY)))
    return res.status(401).json({error:'Mã truy cập chưa đúng.'});
  const route=req.query.route;
  if(typeof route!=='string'||! /^(profile|mcp|entries(?:\/[a-f0-9-]{36})?|days\/\d{4}-\d{2}-\d{2})$/.test(route))
    return res.status(404).json({error:'Đường dẫn không hợp lệ.'});
  const request=new Request('https://internal.local/'+(route==='mcp'?'mcp':'api/'+route),{
    method:req.method,headers:{'Content-Type':req.headers['content-type']||''},
    body:['GET','HEAD'].includes(req.method)?undefined:typeof req.body==='string'?req.body:JSON.stringify(req.body)
  });
  const response=await journal.fetch(request,{BUCKET:store});
  res.status(response.status).setHeader('Content-Type','application/json');
  res.end(await response.text());
}
