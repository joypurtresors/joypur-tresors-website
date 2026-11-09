(() => {
 'use strict';
 const key='joypur-language';
 let language='en',dictionary=null,loading=null,choice=0;
 let cms=null,cmsLoading=null;
 let categoryOverrides=null,categoryLoading=null;const categoryDefaults=new WeakMap();
 async function loadCategories(){if(!document.querySelector('.product-categories'))return;if(!categoryLoading)categoryLoading=fetch(new URL('/api/category-content',origin),{cache:'no-store',headers:{Accept:'application/json'}}).then(async r=>{if(r.ok){const d=await r.json();if(d.success){categoryOverrides=d.overrides;window.JoypurCategoryView?.install(d);}else window.JoypurCategoryView?.fail();}else window.JoypurCategoryView?.fail();}).catch(()=>window.JoypurCategoryView?.fail());return categoryLoading;}
 function applyCategories(){window.JoypurCategoryView?.apply(language,translated);for(const element of document.querySelectorAll('[data-category-field]')){let original=categoryDefaults.get(element);if(original===undefined){original=element.textContent;categoryDefaults.set(element,original);}const id=element.dataset.categoryField;const saved=categoryOverrides?.[language]?.[id];const english=categoryOverrides?.en?.[id];const isCustom=!!element.closest('[data-custom-category]');const next=typeof saved==='string'&&saved.trim()?saved:(language==='hi'?(isCustom&&english?english:translated(original)):original);element.hidden=!next.trim();if(window.JoypurRichText)window.JoypurRichText.render(element,next);else if(element.textContent!==next)element.textContent=next;}} 
 const cmsSnapshots=new WeakMap();
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
 async function loadCMS(){
  if(cmsLoading)return cmsLoading;
  cmsLoading=fetch(new URL('/api/public-content',origin),{cache:'no-store',headers:{Accept:'application/json'}}).then(async response=>{
   if(!response.ok)return;
   const data=await response.json();if(data?.success)cms=data;
  }).catch(()=>{});
  return cmsLoading;
 }
 function applyCMS(){
  if(!cms?.translations)return;
  const targets=[];
  const hero=document.querySelector('#home .hero-copy');
  if(hero)for(const [key,selector] of [['eyebrow','.eyebrow'],['heading','h1'],['description','p']])targets.push([hero.querySelector(selector),cms.content?.[key],cms.translations.content?.[key]]);
  for(const [id,key] of [['home-loans','home_loans'],['business-loans','business_loans'],['mortgage-loans','mortgage_loans'],['working-capital','od_cc'],['bg-lrd','bg_lrd'],['personal-auto','personal_auto']]){
   for(const [suffix,tag] of [['title','h3'],['description','p']])targets.push([document.querySelector('#'+id+' .body '+tag),cms.services?.[key+'_'+suffix],cms.translations.services?.[key+'_'+suffix]]);
  }
  const key=document.body.dataset.serviceKey;
  if(key)for(const [suffix,selector] of [['title','[data-product-title]'],['description','[data-product-description]']])targets.push([document.querySelector(selector),cms.services?.[key+'_'+suffix],cms.translations.services?.[key+'_'+suffix]]);
  for(const [element,english,hindi] of targets){
   if(!element||typeof english!=='string'||typeof hindi!=='string'||!hindi.trim())continue;
   let snapshot=cmsSnapshots.get(element);
   if(language==='hi'){
    if(!snapshot?.active||element.textContent!==snapshot.hindi){
     snapshot={nodes:[...element.childNodes].map(node=>node.cloneNode(true)),english,hindi:hindi.trim(),active:true};cmsSnapshots.set(element,snapshot);
    }
    if(element.textContent!==hindi.trim())element.textContent=hindi.trim();
   }else if(snapshot?.active){
    const captured=snapshot.nodes.map(node=>node.textContent).join('').replace(/\s/g,'');
    if(captured===english.replace(/\s/g,''))element.replaceChildren(...snapshot.nodes.map(node=>node.cloneNode(true)));
    else element.textContent=english;
    snapshot.active=false;
   }
  }
 }
 function apply(){
  observer.disconnect();
  try{
   applyCMS();
   window.JoypurServices?.apply(language,translated);
   applyCategories();
   const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
   let node;
   while((node=walker.nextNode())){
    if(!node.parentElement||node.parentElement.closest(selector+', [data-category-field], [data-category-title], [data-service-text]'))continue;
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
  await Promise.all([loadCategories(),window.JoypurServices?.load(),next==='hi'?loadCMS():Promise.resolve()]);
  if(request!==choice)return;
  language=next;status.hidden=true;apply();
  if(persist)try{localStorage.setItem(key,next);}catch{}
 }
 let saved='en';try{saved=localStorage.getItem(key)||'en';}catch{}
 choose(saved==='hi'?'hi':'en',false);
 window.addEventListener('storage',event=>{if(event.key===key)choose(event.newValue==='hi'?'hi':'en',false);});
})();
