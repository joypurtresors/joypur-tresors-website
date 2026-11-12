import {begin as beginEmail,finish as finishEmail} from './email-notifications.js';
// Enquiry flow reconstructed from the inspected preview Worker, with dynamic service validation and durable receipts.
const ORIGINS = new Set(['https://joypurtresors.com','https://www.joypurtresors.com','https://preview-integration.joypur-tresors-website.pages.dev']);
const BUILTINS={home_loans:['Home Loans','Home Loan'],business_loans:['Business Loans','Business Loan'],mortgage_loans:['Mortgage Loans','Mortgage Loan'],od_cc:['OD / CC Facilities','OD / CC'],bg_lrd:['BG & LRD','BG / LRD'],personal_auto:['Personal & Auto Loans','Personal Loan']};
const STATES=new Set(['enabled','disabled','deleted']);
const cors=origin=>ORIGINS.has(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin'}:{};
const json=(data,status=200,origin='')=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...cors(origin)}});
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
async function resolveService(DB,data){
 const loan=clean(data.loan||data.loanType,200),requested=clean(data.serviceId,100);
 let id=requested;if(!id){id=Object.keys(BUILTINS).find(key=>BUILTINS[key][1]===loan)||(loan==='Auto Loan'?'personal_auto':'');if(!id){if(!['','Other'].includes(loan))return null;return {id:null,title:loan||null,custom:false};}}
 if(!Object.hasOwn(BUILTINS,id)&&!/^service_[a-f0-9-]{36}$/.test(id))return null;
 const row=await DB.prepare("SELECT content_value FROM website_content WHERE section_key='loan_services' AND content_key=?").bind(id).first();
 let meta=null;if(row){try{meta=JSON.parse(row.content_value);}catch{return null;}if(!meta||!STATES.has(meta.state)||meta.state!=='enabled'||typeof meta.titleEn!=='string'||!meta.titleEn.trim()||meta.titleEn.length>200)return null;}
 const custom=!Object.hasOwn(BUILTINS,id);if(custom&&!meta)return null;
 let title=meta?.titleEn.trim()||BUILTINS[id][0];
 if(!custom){const saved=await DB.prepare("SELECT content_value FROM website_content WHERE section_key='services' AND content_key=?").bind(id+'_title').first();if(saved?.content_value?.trim())title=saved.content_value.trim().slice(0,200);if(!requested)title=loan;else if(id==='personal_auto'&&['Auto Loan','Personal Loan'].includes(loan))title+=' — '+loan;}
 return {id,title,custom};
}
export default {async fetch(request,env){
 const origin=request.headers.get('Origin')||'',url=new URL(request.url);
 if(url.pathname!=='/verify')return json({success:false,message:'Not found'},404,origin);
 if(request.method==='OPTIONS')return ORIGINS.has(origin)?new Response(null,{status:204,headers:{...cors(origin),'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400'}}):new Response(null,{status:403});
 if(request.method!=='POST')return json({success:false,message:'Method not allowed'},405,origin);
 if(!ORIGINS.has(origin))return json({success:false,message:'Origin not allowed'},403);
 if(!env.DB||!env.TURNSTILE_SECRET_KEY||!env.RESEND_API_KEY)return json({success:false,message:'Server configuration incomplete'},503,origin);
 try{
  if(!(request.headers.get('Content-Type')||'').toLowerCase().includes('application/json'))return json({success:false,message:'JSON required'},415,origin);
  const raw=await request.text();if(raw.length>12000)return json({success:false,message:'Request too large'},413,origin);
  let data;try{data=JSON.parse(raw);}catch{return json({success:false,message:'Invalid JSON'},400,origin);}if(!data||typeof data!=='object'||Array.isArray(data))return json({success:false,message:'Invalid request'},400,origin);
  if(data.website)return json({success:true,message:'Thank you.'},200,origin);
  const name=clean(data.name,100),mobile=clean(data.mobile,25),email=clean(data.email,150),city=clean(data.city,100),age=clean(data.age,3),message=clean(data.message,1500),token=clean(data.turnstileToken||data['cf-turnstile-response'],2048);
  if(name.length<2||!/^[0-9+\s()-]{10,25}$/.test(mobile)||mobile.replace(/\D/g,'').length<10||!token)return json({success:false,message:'Please enter a valid name, mobile number and CAPTCHA.'},400,origin);
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({success:false,message:'Please enter a valid email address.'},400,origin);
  if(age&&(!/^\d{1,3}$/.test(age)||Number(age)<18||Number(age)>120))return json({success:false,message:'Please enter a valid age.'},400,origin);
  if(data.serviceId!==undefined&&(typeof data.serviceId!=='string'||data.serviceId.length>100))return json({success:false,message:'Invalid service selection.'},400,origin);
  const verificationBody=new FormData();verificationBody.append('secret',env.TURNSTILE_SECRET_KEY);verificationBody.append('response',token);const ip=request.headers.get('CF-Connecting-IP');if(ip)verificationBody.append('remoteip',ip);
  const verified=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:verificationBody});if(!verified.ok)return json({success:false,message:'CAPTCHA verification unavailable. Please try again.'},502,origin);const verification=await verified.json();if(!verification.success||verification.hostname!==new URL(origin).hostname)return json({success:false,message:'CAPTCHA verification failed. Please try again.'},400,origin);
  const service=await resolveService(env.DB,data);if(!service)return json({success:false,message:'This service is currently unavailable. Please choose another service.'},409,origin);
  // The availability predicate is checked in the same statement as INSERT, so a concurrent disable cannot slip through.
  const result=await env.DB.prepare(`INSERT INTO enquiries(name,mobile,email,age,city,loan_category,message,service_id)
   SELECT ?,?,?,?,?,?,?,? WHERE ? IS NULL OR (
    NOT EXISTS(SELECT 1 FROM website_content WHERE section_key='loan_services' AND content_key=? AND json_extract(content_value,'$.state')!='enabled')
    AND (?=0 OR EXISTS(SELECT 1 FROM website_content WHERE section_key='loan_services' AND content_key=? AND json_extract(content_value,'$.state')='enabled'))
   )`).bind(name,mobile,email||null,age?Number(age):null,city||null,service.title,message||null,service.id,service.id,service.id,service.custom?1:0,service.id).run();
  if(result.meta?.changes!==1)return json({success:false,message:'This service is currently unavailable. Please choose another service.'},409,origin);
  // The receipt means a real Admin record exists. Notification failure must not invite duplicate submissions.
  const id=result.meta.last_row_id;
  const notification=await beginEmail(env.DB,'enquiry',id);
  try{const lines=['New enquiry from Joypur Tresors website','',`Enquiry ID: ${id}`,`Name: ${name}`,`Mobile: ${mobile}`,`Email: ${email||'Not provided'}`,`Age: ${age||'Not provided'}`,`City: ${city||'Not provided'}`,`Loan Requirement: ${service.title||'Not specified'}`,`Service ID: ${service.id||'Not specified'}`,'','Message:',message||'Not provided'];const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:'Joypur Tresors <enquiry@joypurtresors.com>',to:['joypurtresors@gmail.com'],subject:'New Website Enquiry - Joypur Tresors',text:lines.join('\n'),...(email?{reply_to:email}:{})})});await finishEmail(env.DB,notification,sent.ok?'accepted':'rejected',sent.status);if(!sent.ok)console.error('Enquiry notification failed',sent.status);}catch{await finishEmail(env.DB,notification,'uncertain');console.error('Enquiry notification unavailable');}
  return json({success:true,id,message:'Thank you! Your enquiry has been submitted.'},200,origin);
 }catch(error){console.error('Enquiry processing failed',error?.name||'Unknown');return json({success:false,message:'Unable to save enquiry right now. Please try again.'},503,origin);}
}};
