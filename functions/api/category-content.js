import {categories} from '../lib/category-fields.js';
export async function onRequestGet({env}){
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 try{
  const result=await env.DB.prepare("SELECT section_key,content_key,content_value FROM website_content WHERE section_key IN ('categories_en','categories_hi')").all();const overrides={en:{},hi:{}};
  for(const row of result.results||[]){const parts=row.content_key.split('.');const field=parts.pop(),category=parts.join('.');if(Object.hasOwn(categories,category)&&Object.hasOwn(categories[category].fields,field)&&typeof row.content_value==='string')overrides[row.section_key==='categories_hi'?'hi':'en'][row.content_key]=row.content_value;}
  return new Response(JSON.stringify({success:true,overrides}),{headers});
 }catch{return new Response(JSON.stringify({error:'Category content unavailable'}),{status:503,headers});}
}
