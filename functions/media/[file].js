const keyPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:jpg|png|webp)$/;
export async function onRequest({request,env,params}){
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
 const key=params.file;if(typeof key!=='string'||!keyPattern.test(key))return new Response(null,{status:404});
 if(!env.MEDIA_BUCKET)return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}});
 try{const object=request.method==='HEAD'?await env.MEDIA_BUCKET.head(key):await env.MEDIA_BUCKET.get(key);if(!object)return new Response(null,{status:404});
 const mime={jpg:'image/jpeg',png:'image/png',webp:'image/webp'}[key.split('.').pop()];
 const headers=new Headers({'Content-Type':mime,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline','ETag':object.httpEtag});
 if(request.headers.get('If-None-Match')===object.httpEtag)return new Response(null,{status:304,headers});
 headers.set('Content-Length',String(object.size));return new Response(request.method==='HEAD'?null:object.body,{headers});
 }catch{return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}});}
}
