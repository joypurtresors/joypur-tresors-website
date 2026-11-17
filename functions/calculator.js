export async function onRequestGet({request,env}){const url=new URL('/index.html',request.url);return env.ASSETS.fetch(new Request(url,{method:'GET'}));}
