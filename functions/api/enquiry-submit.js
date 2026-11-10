import handler from '../lib/enquiry-handler.js';
// Reuse the reviewed enquiry protections on the website's same-origin, versioned endpoint.
export async function onRequest({request,env}){const url=new URL(request.url);if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return new Response(JSON.stringify({success:false,message:'Origin not allowed'}),{status:403,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});url.pathname='/verify';return handler.fetch(new Request(url,request),env);}
