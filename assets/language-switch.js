(() => {
 'use strict';
 const key='joypur-language';
 let language='en',dictionary=null,loading=null,choice=0;
 const textState=new WeakMap(),attrState=new WeakMap();
 const normal=value=>String(value).replace(/\s+/g,' ').trim();
 const selector='[data-language-ui],script,style,noscript,code,pre,iframe,textarea';
 const origin=new URL(document.currentScript.src);
 const catalogueURL=new URL('hi.json',origin);
 const wrap=document.createElement('div');wrap.className='site-language-wrap';wrap.dataset.languageUi='';
 const group=document.createElement('div');group.className='site-language';group.setAttribute('role','group');group.setAttribute('aria-label','Choose language / भाषा चुनें');
 const status=document.createElement('div');status.className='site-language-status';status.setAttribute('role','status');status.hidden=true;
 const buttons={};
 for(const [code,label] of [['en','English'],['hi','हिन्दी']]){
  const button=document.createElement('button');button.type='button';button.textContent=label;button.lang=code;button.dataset.language=code;button.addEventListener('click',()=>choose(code,true));group.append(button);buttons[code]=button;
 }
 wrap.append(group,status);
 const header=document.querySelector('header nav.wrap')||document.querySelector('header .nav-wrap')||document.querySelector('header .container');
 (header||document.body).append(wrap);
 // Explicit values keep form submissions in their original language when labels change.
 for(const option of document.querySelectorAll('option'))if(!option.hasAttribute('value'))option.value=option.textContent.trim();
 function translated(source){
  const t=normal(source);if(!t)return source;
  const hi=dictionary?.[t];
  if(hi)return source.replace(source.trim(),hi);
  const years=t.match(/^(\d+) years$/);if(years)return years[1]+' वर्ष';
  const explore=t.match(/^Explore (.+) details$/);if(explore&&dictionary?.[explore[1]])return dictionary[explore[1]]+' का विवरण देखें';
  const discuss=t.match(/^Discuss (.+) requirement$/);if(discuss&&dictionary?.[discuss[1]])return dictionary[discuss[1]]+' की ज़रूरत पर चर्चा करें';
  return source;
 }
 const observer=new MutationObserver(()=>apply());
 function apply(){
  observer.disconnect();
  try{
   const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
   let node;
   while((node=walker.nextNode())){
    if(!node.parentElement||node.parentElement.closest(selector))continue;
    let state=textState.get(node);
    if(!state||node.nodeValue!==state.last)state={source:node.nodeValue,last:node.nodeValue};
    const next=language==='hi'?translated(state.source):state.source;
    if(node.nodeValue!==next)node.nodeValue=next;
    state.last=next;textState.set(node,state);
   }
   for(const element of document.querySelectorAll('[placeholder],[aria-label],[alt],title')){
    if(element.closest('[data-language-ui],iframe'))continue;
    let states=attrState.get(element);if(!states){states={};attrState.set(element,states);}
    for(const attr of ['placeholder','aria-label','alt']){
     if(!element.hasAttribute(attr))continue;
     const current=element.getAttribute(attr);let state=states[attr];
     if(!state||current!==state.last)state={source:current,last:current};
     const next=language==='hi'?translated(state.source):state.source;
     if(current!==next)element.setAttribute(attr,next);
     state.last=next;states[attr]=state;
    }
   }
   let title=attrState.get(document.head)||{};
   const current=document.title;if(!title.source||current!==title.last)title={source:current,last:current};
   const next=language==='hi'?translated(title.source):title.source;if(current!==next)document.title=next;title.last=next;attrState.set(document.head,title);
   document.documentElement.lang=language;
   for(const [code,button] of Object.entries(buttons))button.setAttribute('aria-pressed',String(code===language));
  }finally{observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','alt']});}
 }
 async function choose(next,persist){
  if(!['en','hi'].includes(next))return;
  const request=++choice;
  if(next==='hi'&&!dictionary){
   status.hidden=false;status.textContent='हिन्दी लोड हो रही है…';
   try{
    if(!loading)loading=fetch(catalogueURL,{headers:{Accept:'application/json'}}).then(r=>{if(!r.ok)throw Error('Catalogue unavailable');return r.json();});
    dictionary=await loading;
   }catch{loading=null;if(request===choice)status.textContent='हिन्दी लोड नहीं हुई। कृपया फिर कोशिश करें। / Please try again.';return;}
  }
  if(request!==choice)return;
  language=next;status.hidden=true;apply();
  if(persist)try{localStorage.setItem(key,next);}catch{}
 }
 let saved='en';try{saved=localStorage.getItem(key)||'en';}catch{}
 choose(saved==='hi'?'hi':'en',false);
 window.addEventListener('storage',event=>{if(event.key===key)choose(event.newValue==='hi'?'hi':'en',false);});
})();
