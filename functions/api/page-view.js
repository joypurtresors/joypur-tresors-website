const paths=new Set(['/','/home-loans','/business-loans','/mortgage-loans','/working-capital','/bg-lrd','/personal-auto','/service','/privacy','/disclaimer','/blog','/blog/article']);
const reply=status=>new Response(null,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestPost({request,env}){
 const url=new URL(request.url);if(request.headers.get('Origin')!==url.origin)return reply(403);
 if(request.headers.get('DNT')==='1'||request.headers.get('Sec-GPC')==='1')return reply(204);
 if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))return reply(415);
 const agent=request.headers.get('User-Agent')||'';if(/bot|crawler|spider|headless/i.test(agent))return reply(204);
 let body;try{if(Number(request.headers.get('Content-Length'))>512)return reply(413);if(!request.body)return reply(400);const reader=request.body.getReader(),chunks=[];let length=0;while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>512){await reader.cancel();return reply(413);}chunks.push(value);}const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400);}
 if(!body||Object.keys(body).length!==1||!paths.has(body.path))return reply(400);
 try{await env.DB.prepare("INSERT INTO traffic_hourly(bucket,path,views) VALUES(strftime('%Y-%m-%d %H:00:00','now','+330 minutes'),?,1) ON CONFLICT(bucket,path) DO UPDATE SET views=traffic_hourly.views+1").bind(body.path).run();return reply(204);}catch{return reply(503);}
}
