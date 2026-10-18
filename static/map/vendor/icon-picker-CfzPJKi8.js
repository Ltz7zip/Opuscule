import{Jn as e,Kn as t,P as n,at as r,it as i,ot as a}from"./utils-Dk4MDzbZ.js";import{a as o,i as s,n as c}from"./emblems-generator-CFXxHBH0.js";import{i as l}from"./tooltips-3xx1wzLl.js";import{n as u}from"./icons-list-BiXau1Li.js";import{i as d,r as f}from"./dialog-helpers-MF-Ear8n.js";import{t as p}from"./icons-archive-CciXz59B.js";import{t as m}from"./pictures-CmpWd_MP.js";var h=`iconPositioner`,g=.25,[_,v]=[25,400],y=`
  #${h} > div { width: auto; }
  #${h} .stage { width: 16em; height: 16em; margin: 0 auto; background: repeating-conic-gradient(#e8e8e8 0 25%, #fff 0 50%) 0 0 / 1em 1em; cursor: grab; touch-action: none; }
  #${h} .stage:active { cursor: grabbing; }
  #${h} .stage svg { display: block; width: 100%; height: 100%; }
  #${h} .controls { display: flex; align-items: center; gap: .4em; margin-top: .5em; }
  #${h} .controls slider-input { flex: 1; min-width: 0; }
  #${h} .controls input[type=range] { flex: 1; min-width: 0; }
  #${h} .previews { display: flex; justify-content: center; align-items: center; gap: 1em; margin-top: .5em; }
  #${h} .previews svg { width: 2em; height: 2em; }
  #${h} .previews .circle svg { border-radius: 50%; background: #d4c7a1; }
  #${h} .previews .small svg { width: 1em; height: 1em; }
`;function b(e){let t=document.getElementById(h);t&&(!e||t.dataset.icon===e)&&$(t).dialog(`close`)}function x(t){let r=c.get(t);if(!r||!document.getElementById(t))return;let i=e=>document.getElementById(t)?.setAttribute(`viewBox`,e),a=r.viewBox,o=S(a),u={...o};b(),n(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="${h}" class="dialog" data-icon="${e(t)}">
      <style>${y}</style>
      <div class="stage" data-tip="Drag to pan, scroll to zoom">
        <svg><g class="art"${s.paintAttributes(t)}>${document.getElementById(t).innerHTML}</g><path class="shade" fill="#000" fill-opacity=".45" fill-rule="evenodd"/><rect class="edge" fill="none" stroke="#d0240f" vector-effect="non-scaling-stroke" stroke-dasharray="4 3"/></svg>
      </div>
      <div class="controls">
        <span>Zoom</span>
        <slider-input min="${_}" max="${v}" value="100"></slider-input>
        <button type="button" class="fit" data-tip="Fit the frame to the picture's visible content">Fit</button>
      </div>
      <div class="previews" data-tip="The icon at map sizes">
        <span class="small">${s.html(t)}</span>
        <span>${s.html(t)}</span>
        <span class="circle">${s.html(t)}</span>
      </div>
    </div>`);let f=n(h),p=f.querySelector(`.stage svg`),x=f.querySelector(`slider-input`),w=(e,t=!1)=>{u=e;let{x:n,y:r,side:a}=u,s=a*g,[c,l,d]=[n-a/2-s,r-a/2-s,a+2*s];p.setAttribute(`viewBox`,`${c} ${l} ${d} ${d}`);let[f,m]=[n-a/2,r-a/2];p.querySelector(`.shade`).setAttribute(`d`,`M${c},${l}h${d}v${d}h${-d}z M${f},${m}v${a}h${a}v${-a}z`);let h=p.querySelector(`.edge`);for(let[e,t]of Object.entries({x:f,y:m,width:a,height:a}))h.setAttribute(e,String(t));t||(x.value=String(Math.round(o.side/a*100))),i(C(u))};w(u);let T=(e,t=!1)=>{let[n,r]=[o.side*100/v,o.side*100/_];w({...u,side:Math.min(r,Math.max(n,e))},t)};x.addEventListener(`input`,e=>{e.target===x&&T(o.side*100/x.valueAsNumber,!0)}),x.addEventListener(`change`,e=>{e.target===x&&w(u)}),p.addEventListener(`wheel`,e=>{e.preventDefault(),T(u.side*1.1**Math.sign(e.deltaY))}),p.addEventListener(`pointerdown`,e=>{p.setPointerCapture(e.pointerId);let t={x:e.clientX,y:e.clientY},n=e=>{let n=u.side*1.5/p.getBoundingClientRect().width;w({...u,x:u.x-(e.clientX-t.x)*n,y:u.y-(e.clientY-t.y)*n}),t={x:e.clientX,y:e.clientY}},r=()=>{p.removeEventListener(`pointermove`,n),p.removeEventListener(`pointerup`,r),p.removeEventListener(`pointercancel`,r)};p.addEventListener(`pointermove`,n),p.addEventListener(`pointerup`,r),p.addEventListener(`pointercancel`,r)}),f.querySelector(`.fit`).addEventListener(`click`,async()=>{let e=await m.fit(r);f.isConnected&&(w(S(e)),l(`The frame is fitted to the picture`,!1,`success`,2e3))});let E=!1;$(f).dialog({title:`Position icon`,width:`20em`,position:{my:`center`,at:`center`,of:`svg`},close:()=>{E||i(a),d(h)},buttons:{Apply:function(){E=!0,c.update(t,{viewBox:C(u)}),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}}})}function S(e){let[t,n,r,i]=s.parseFrame(e)??[0,0,100,100];return{x:t+r/2,y:n+i/2,side:Math.max(r,i)}}function C({x:e,y:t,side:n}){return s.formatFrame([e-n/2,t-n/2,n,n])}var w=`iconPicker`,T=`
  #${w} { padding: .4em .6em; }
  #${w} > div { width: auto; }
  #${w} .head { display: flex; align-items: center; gap: .6em; padding-bottom: .5em; border-bottom: 1px solid #0000001a; }
  #${w} .current { display: flex; align-items: center; gap: .5em; flex: 1; min-width: 0; }
  #${w} .current .preview { flex: none; display: grid; place-items: center; width: 2.2em; height: 2.2em; border-radius: 4px; background: #0000000d; }
  #${w} .current .preview svg { width: 1.7em; height: 1.7em; overflow: visible; }
  #${w} .current .about { display: flex; align-items: baseline; gap: .5em; min-width: 0; white-space: nowrap; }
  #${w} .current .name { font-weight: bold; overflow: hidden; text-overflow: ellipsis; }
  #${w} .current .from { font-size: .85em; opacity: .65; overflow: hidden; text-overflow: ellipsis; }
  #${w} .currentActions { display: flex; gap: .2em; margin-left: auto; }
  #${w} .currentActions button { margin: 0; padding: .2em .4em; white-space: nowrap; }
  #${w} .search { width: 11em; }
  #${w} .body { display: grid; grid-template-columns: 11.5em 1fr; height: min(32em, 64vh); }
  #${w} nav { overflow-y: auto; padding: .4em .4em .4em 0; border-right: 1px solid #0000001a; }
  #${w} nav button { display: flex; justify-content: space-between; width: 100%; margin: 0; padding: .25em .4em; border: 0; border-radius: 4px; background: none; box-shadow: none; text-align: left; white-space: nowrap; }
  #${w} nav button:hover { background: #0000000d; }
  #${w} nav button.active { background: #0000001a; color: inherit; font-weight: bold; }
  #${w} nav button small { margin-left: .4em; opacity: .6; font-weight: normal; }
  #${w} nav .section { margin-top: .5em; font-weight: bold; }
  #${w} nav div.section { padding: .25em .4em; white-space: nowrap; }
  #${w} nav .entry { padding-left: 1.2em; }
  #${w} .panel { position: relative; overflow-y: auto; padding: .4em 0 .4em .6em; }
  #${w} .panel h4 { margin: .6em 0 .3em; font-size: .85em; opacity: .7; }
  #${w} .panel h4:first-child { margin-top: 0; }
  #${w} .choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.4em, 1fr)); gap: .4em; }
  #${w} .choices button { display: grid; place-items: center; aspect-ratio: 1; margin: 0; padding: 0; border: 1px solid transparent; border-radius: 4px; background: #0000000a; box-shadow: none; font-size: 2.6em; }
  #${w} .choices button:hover { background: #00000017; }
  #${w} .choices button.pressed { border-color: var(--dark-solid); background: #0000001f; }
  #${w} .choices button svg { width: 80%; height: 80%; overflow: visible; pointer-events: none; }
  #${w} .glyphText { display: flex; align-items: center; gap: .4em; margin-bottom: .5em; }
  #${w} .glyphText input { width: 6em; }
  #${w} .customAdd { display: flex; gap: .3em; margin-bottom: .5em; }
  #${w} .customAdd input { flex: 1; min-width: 0; }
  #${w} .customAdd button { margin: 0; white-space: nowrap; }
  #${w} .customArchive { display: flex; gap: .3em; margin-top: .5em; }
  #${w} .customArchive button { margin: 0; }
  #${w} .replacing { margin: -.2em 0 .5em; padding: .3em .5em; border-radius: 4px; background: #ffd70033; }
  #${w} .replacing a { cursor: pointer; text-decoration: underline; }
  #${w} .note { margin: .6em 0 0; font-size: .85em; opacity: .7; }
  #${w} .empty { margin: 1em 0; font-style: italic; opacity: .7; }
  #${w}.busy { cursor: progress; }
  #${w}.busy :is(.customAdd, .customArchive) { pointer-events: none; opacity: .5; }
  @media (max-width: 600px) {
    #${w} .head { flex-wrap: wrap; }
    #${w} .search { width: 100%; }
    #${w} .body { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
    #${w} nav { display: flex; gap: .2em; overflow-x: auto; padding: .4em 0; border: 0; border-bottom: 1px solid #0000001a; }
    #${w} nav button { width: auto; white-space: nowrap; }
    #${w} nav .section, #${w} nav .entry { margin: 0; padding-left: .4em; }
    #${w} .choices { grid-template-columns: repeat(auto-fill, minmax(4.4em, 1fr)); }
    #${w} .panel { padding-left: 0; }
  }
`,E=null;function D({current:e,onPick:t,live:o=!1,preferCustom:u,profile:h=`icon`}){let g=e,_=!1,v=k(),y=M(e,v,u),S=``,C=null;d(w),n(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="${w}" class="dialog">
      <style>${T}</style>
      <div class="head">
        <div class="current"></div>
        <input type="search" class="search" placeholder="Search built-in icons" data-tip="Find a built-in icon or emoji by name" />
      </div>
      <div class="body">
        <nav></nav>
        <div class="panel"></div>
      </div>
    </div>`);let D=n(w),A=D.querySelector(`nav`),j=D.querySelector(`.panel`),N=D.querySelector(`.search`),z=options.map,B=()=>D.isConnected&&options.map===z,V=()=>{D.querySelector(`.current`).innerHTML=ee(e,C,v)},H=()=>{A.innerHTML=te(v,S?null:y)},U=()=>{if(S)j.innerHTML=I(v,S,e);else if(y===`custom`)j.innerHTML=R(e,C,h);else{let t=v.filter(({key:e})=>e===y);j.innerHTML=(y.startsWith(`glyph`)?L(e):``)+P(t,e),F(t)}W()},W=()=>{let e=j.querySelector(`.pressed`);j.scrollTop=e?e.offsetTop-j.clientHeight/2:0},G=e=>{y=e,S=``,N.value=``,H(),U()},K=n=>{e=n;for(let e of j.querySelectorAll(`.choices [data-icon]`))e.classList.toggle(`pressed`,e.dataset.icon===n);V(),o&&t(n)},q=()=>{_=!0,o||t(e),$(D).dialog(`close`)},J=e=>{C=e,V(),e?G(`custom`):y===`custom`&&!S&&U()},Y=()=>{H(),V(),y===`custom`&&!S&&U()},X=async e=>{if(!B()||D.classList.contains(`busy`))return;let t=C,n=t??c.newId();D.classList.add(`busy`);try{let r=await e(n);if(!B()||C!==t)return;t?(b(n),c.update(n,r),C=null,Y()):(c.add({id:n,...r}),Y(),K(n))}catch(e){B()&&l(e.message,!1,`error`,6e3)}finally{D.classList.remove(`busy`)}},ne=()=>j.querySelector(`.customAdd input`)?.value??``,Z=(e,t)=>{E??=i(e),E.accept=e,E.onchange=()=>{let e=E.files?.[0];E.value=``,e&&t(e)},E.click()},re=()=>Z(`image/*,.svg`,e=>void X(t=>m.fromFile(e,t,h))),ie=async()=>{r(await p.pack(),`${a(`Custom icons`)}.zip`,`application/zip`)},ae=t=>{!B()||D.classList.contains(`busy`)||(D.classList.add(`busy`),b(e),p.unpack(t).then(({added:e,unchanged:t,conflicts:n,invalid:r})=>{B()&&(Y(),l(`Custom icons imported: ${[`${e} added`,t&&`${t} already here`,r&&`${r} invalid skipped`].filter(Boolean).join(`, `)}`,!1,`success`,5e3),n.length&&oe(n))}).catch(e=>B()&&l(e.message,!1,`error`,6e3)).finally(()=>D.classList.remove(`busy`)))},oe=e=>{f({title:`Import custom icons`,message:`${e.length===1?`1 archived icon has`:`${e.length} archived icons have`} the id of a different icon on this map. Replace the map's pictures with the archived ones? Everything using them will change`,confirm:`Replace`,cancel:`Keep the map's`,onConfirm:()=>{for(let{id:t}of e)b(t);p.replace(e),B()&&Y(),l(`${e.length} custom icon(s) replaced`,!1,`success`,4e3)}})},Q={link:()=>void X(()=>m.fromLink(ne())),upload:re,exportAll:()=>void ie().catch(e=>l(e.message,!1,`error`,6e3)),importArchive:()=>Z(`.zip,application/zip`,ae),stopReplacing:()=>J(null),position:()=>x(e),replace:()=>J(C===e?null:e),remove:()=>{let t=e,n=s.uses(t),r=Object.values(n).reduce((e,t)=>e+t,0);f({title:`Remove custom icon`,message:r?`The icon is used by ${s.describeUses(n)}. ${r===1?`It`:`They`} will show no icon.<br>Remove it anyway?`:`The icon is not used on the map. Remove it?`,confirm:`Remove`,onConfirm:()=>{C===t&&(C=null),b(t),c.remove(t),Y()}})}};D.addEventListener(`click`,e=>{let t=e.target,n=t.closest(`nav [data-source]`)?.dataset.source;if(n)return G(n);let r=t.closest(`[data-action]`)?.dataset.action;if(r)return Q[r]?.();let i=t.closest(`.choices [data-icon]`)?.dataset.icon;if(i===void 0)return;let a=j.querySelector(`.glyphText input`);a&&(a.value=s.glyphText(i)??``),K(i)}),j.addEventListener(`dblclick`,e=>{e.target.closest(`.choices [data-icon]`)&&q()}),j.addEventListener(`input`,e=>{let t=e.target;t.closest(`.glyphText`)&&K(s.glyph(t.value))}),j.addEventListener(`keydown`,e=>{e.key===`Enter`&&e.target.closest(`.customAdd`)&&Q.link()}),N.addEventListener(`input`,()=>{S=N.value.trim().toLowerCase(),H(),U()}),V(),H(),U(),$(D).dialog({title:`Select icon`,width:O(),position:{my:`center`,at:`center`,of:`svg`},close:()=>{o&&!_&&e!==g&&t(g),d(w)},buttons:{Apply:q,Cancel:()=>$(D).dialog(`close`)}}),W()}function O(){let e=Number.parseFloat(getComputedStyle(document.body).fontSize)||10;return Math.min(52*e,(window.visualViewport?.width??window.innerWidth)-16)}function k(){return[...Object.entries(u).map(([e,t])=>({key:`glyph/${e}`,group:`Emoji`,label:e,icons:Object.keys(t).map(e=>s.glyph(e))})),...o.sets().flatMap(A)]}function A({id:e,group:n}){let r=e,i=new Map;for(let e of o.files(r)){let t=e.slice(0,Math.max(0,e.lastIndexOf(`/`)));i.set(t,[...i.get(t)??[],o.symbolId(r,e)])}let a=e.slice(e.indexOf(`-`)+1);return[...i].map(([e,i])=>({key:e?`${r}/${e}`:r,group:n,label:t((e||a).replaceAll(/[-/]/g,` `).replace(/([a-z0-9])([A-Z])/g,`$1 $2`)),icons:i,set:r}))}function j(e,t){let n=o.setForId(t);return e.find(e=>e.icons.includes(t))??(n&&e.find(e=>e.set===n))}function M(e,t,n){let r=s.kind(e);return r===`custom`||!e&&n?`custom`:(j(t,e)??t.find(({set:e})=>r===`glyph`?!e:e))?.key??`custom`}function N(e){return e.label===e.group?e.group:`${e.group} · ${e.label}`}function ee(n,r,i){let a=s.kind(n),o=a===`set`?j(i,n):void 0,l=n?a===`glyph`?`Emoji`:a===`custom`?`Carried by this map`:o?N(o):`Built-in`:`No icon selected`,u=a===`custom`&&c.get(n)?`<div class="currentActions">
          <button type="button" data-action="position" data-tip="Zoom and pan the picture in its frame"><span class="icon-resize-full"></span> Position</button>
          <button type="button" data-action="replace" class="${r===n?`pressed`:``}" data-tip="Give the icon a new picture: every use follows"><span class="icon-upload"></span> Replace</button>
          <button type="button" data-action="remove" data-tip="Remove the icon from the map"><span class="icon-trash-empty"></span></button>
        </div>`:``;return`<span class="preview">${s.html(n)}</span>
    <div class="about"><span class="name">${e(n?t(s.name(n)):`None`)}</span><span class="from">${l}</span></div>
    ${u}`}function te(t,n){let r=(t,r,i,a=``)=>`<button type="button" data-source="${e(t)}" class="${a} ${t===n?`active`:``}">${r}${i?` <small>${i}</small>`:``}</button>`,i=``,a=t.map(e=>{if(e.label===e.group)return r(e.key,e.label,e.icons.length,`section`);let t=e.group===i?``:`<div class="section">${e.group}</div>`;return i=e.group,t+r(e.key,e.label,e.icons.length,`entry`)});return r(`custom`,`Custom`,c.all.length)+a.join(``)}function P(e,t,n=!1){return e.map(e=>{let r=e.icons.map(e=>z(e,t)).join(``);return`${n?`<h4>${e.label}</h4>`:``}<div class="choices">${r}</div>`}).join(``)}function F(e){for(let t of new Set(e.map(e=>e.set)))t&&s.retry(t)}function I(t,n,r){let i=t.map(e=>({...e,label:N(e),icons:e.icons.filter(e=>s.name(e).toLowerCase().includes(n))})).filter(e=>e.icons.length);return F(i),i.length?P(i,r,!0):`<p class="empty">No built-in icon is called “${e(n)}”.</p>`}function L(t){return`<label class="glyphText">Type any short text
      <input value="${e(s.glyphText(t)??``)}" placeholder="XIV" />
    </label>`}function R(e,t,n){let r=c.all.map(({id:t})=>z(t,e));return`<div class="customAdd">
      <input type="url" placeholder="Paste a link to an image" data-tip="A linked image keeps the map small; it shows while its site serves it" />
      <button type="button" data-action="link">Add link</button>
      <button type="button" data-action="upload" data-tip="Upload an SVG file (up to ${n===`emblem`?`1 MB`:`200 kB`}) or a PNG, JPEG or WebP image (up to ${n===`emblem`?`10 MB, shrunk to 1024 px`:`2 MB, shrunk to 256 px`})">Upload</button>
    </div>
    <div class="replacing" ${t?``:`hidden`}>Link or upload the new picture of the selected icon. <a data-action="stopReplacing">Cancel</a></div>
    ${r.length?`<div class="choices">${r.join(``)}</div>`:`<p class="empty">This map carries no custom icons yet.</p>`}
    <div class="customArchive">
      ${r.length?`<button type="button" data-action="exportAll" data-tip="Download all custom icons as a zip archive, to import them into another map">Download all</button>`:``}
      <button type="button" data-action="importArchive" data-tip="Import custom icons from a downloaded zip archive. An icon whose id the map uses for another picture is replaced only on confirmation">Import zip</button>
    </div>
    <p class="note">Free icons: <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a>,
      <a href="https://thenounproject.com" target="_blank" rel="noopener">The Noun Project</a>,
      <a href="https://openmoji.org" target="_blank" rel="noopener">OpenMoji</a>,
      <a href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a>.</p>`}function z(n,r){let i=n===r?`pressed`:``,a=s.glyphText(n),o=a===null?s.html(n):e(a);return`<button type="button" class="${i}" data-icon="${e(n)}" data-tip="${e(t(s.name(n)))}">${o}</button>`}var B={open:D};export{B as IconPicker};