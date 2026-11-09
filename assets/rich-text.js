(()=>{'use strict';const cache=new WeakMap();
 function render(target,source){source=String(source||'');if(cache.get(target)===source)return;const fragment=document.createDocumentFragment(),stack=[{node:fragment,token:null}];const tokens=source.split(/(\*\*|==|\[small\]|\[\/small\]|\[large\]|\[\/large\])/g);
  for(const token of tokens){const top=()=>stack[stack.length-1];if(['**','==','[small]','[large]'].includes(token)){if(top().token===token&&(token==='**'||token==='==')){stack.pop();continue;}if(stack.length>8){top().node.append(document.createTextNode(token));continue;}const node=document.createElement(token==='**'?'strong':token==='=='?'mark':token==='[small]'?'small':'span');if(token==='[large]')node.className='rich-large';top().node.append(node);stack.push({node,token});}else if(token==='[/small]'||token==='[/large]'){if(top().token===(token==='[/small]'?'[small]':'[large]'))stack.pop();else top().node.append(document.createTextNode(token));}else top().node.append(document.createTextNode(token));}
  target.replaceChildren(fragment);cache.set(target,source);
 }window.JoypurRichText={render};
})();
