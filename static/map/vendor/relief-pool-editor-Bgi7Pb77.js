import{Jn as e,P as t,ar as n,p as r,rr as i}from"./utils-Dk4MDzbZ.js?v=2";import{A as a,t as o}from"./layers-DCXJRYE9.js?v=2";import{i as s}from"./tooltips-3xx1wzLl.js?v=2";import{t as c}from"./controllers-CTfyQhlk.js?v=2";import{i as l,r as u}from"./dialog-helpers-MF-Ear8n.js?v=2";import{P as d}from"./index-lTzorqRn.js?v=2";import{n as f,o as p,r as m,t as h}from"./relief-previews-BSXxXZdp.js?v=2";var g=`reliefPoolEditor`,_=250,v=5,y=`#d8d2bb`,b=`
  #${g} { padding: .4em .6em; }
  #${g} > div { width: auto; }
  #${g} .patch { position: relative; height: 7em; margin-bottom: .3em; border-radius: 4px; overflow: hidden; }
  #${g} .patch .art, #${g} .patch svg { display: block; width: 100%; height: 100%; }
  #${g} .patch .empty { display: grid; place-items: center; height: 100%; margin: 0; }
  #${g} .patch .shuffle { position: absolute; top: .3em; right: .3em; margin: 0; padding: .1em .3em; border: 0; border-radius: 3px; background: #ffffffb0; box-shadow: none; cursor: pointer; }
  #${g} .heights { display: flex; justify-content: space-between; font-size: .85em; opacity: .7; }
  #${g} .setting { display: flex; align-items: center; gap: .5em; margin: .3em 0; }
  #${g} .setting > span:first-child { width: 3.6em; }
  #${g} .setting slider-input { flex: 1; }
  #${g} .setting input[type=range] { flex: 1; min-width: 0; }
  #${g} .setting input[type=number] { width: 4em; }
  #${g} .entries { display: grid; gap: .2em; max-height: 16em; overflow-y: auto; margin: .5em 0 .6em; }
  #${g} .entry, #${g} .head { display: grid; grid-template-columns: 2em 1fr 3.8em 3.8em 3em 1.6em; align-items: center; gap: 1em; }
  #${g} .head { opacity: .7; }
  #${g} .head span:nth-child(n+3) { text-align: center; }
  #${g} .entry .preview { display: grid; place-items: center; font-size: 1.8em; }
  #${g} .entry .preview svg { width: 1em; height: 1em; overflow: visible; }
  #${g} .entry .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #${g} .entry .share { text-align: right; opacity: .7; }
  #${g} .entry button { margin: 0; padding: 0; border: 0; background: none; box-shadow: none; cursor: pointer; }
  #${g} .empty { margin: .4em 0; font-style: italic; opacity: .7; }
  #${g} .caption { margin: .4em 0 .3em; font-size: .85em; opacity: .7; }
  #${g} .types { display: grid; grid-template-columns: repeat(7, 1fr); gap: .3em; }
  #${g} .types button { display: grid; place-items: center; aspect-ratio: 1; margin: 0; padding: 0; border: 1px solid transparent; border-radius: 4px; background: #0000000a; box-shadow: none; font-size: 1.9em; cursor: pointer; }
  #${g} .types button:hover { background: #00000017; }
  #${g} .types button svg { width: 1em; height: 1em; overflow: visible; pointer-events: none; }
  #${g} .actions { display: flex; gap: .3em; margin: .5em 0 0; }
  #${g} .actions button { margin: 0; }
  #${g} .any { flex: 1; }
`,x=e=>structuredClone(e);function S(e){if(`rule`in e){let{rule:t}=e,n=t.biomes?.length===1?pack.biomes[t.biomes[0]]:void 0,r=Relief.getDefaultRules().find(({name:e})=>e===t.name);return{title:`Relief rule: ${t.name}`,place:`the cells the ${t.name} rule claims`,draft:{icons:x(t.icons),density:t.density,size:{...t.size}},rule:t,color:n?.color??y,write:e=>{Object.assign(t,e),Options.save()},defaults:r&&(()=>({icons:r.icons,density:r.density,size:r.size})),covers:e=>Relief.claim(e)===t,exists:()=>options.map.relief.rules.includes(t)}}let t=pack.biomes[e.biome];return{title:`Relief pool: ${t.name}`,place:`${t.name} lowland`,draft:{icons:x(t.icons),density:t.iconsDensity},color:t.color??y,write:({icons:e,density:n})=>Object.assign(t,{icons:e,iconsDensity:n}),defaults:()=>{let t=d.getDefault()[e.biome];return{icons:t?.icons??{},density:t?.iconsDensity??0}},covers:t=>Relief.isPoolCell(t,e.biome),exists:()=>pack.biomes[e.biome]===t&&!t.removed}}function C(a){let o=S(a),{set:u}=styles.relief.options,d=o.draft,{rule:y}=o,C=1,T=d.size?`<div class="setting ruleSize" data-tip="Icon size at the rule's lowest height, growing with height up to the second value. Each entry's size scales it">
        <span>Size</span>
        <input type="number" data-bound="min" min="0.1" step="0.1" value="${d.size.min}" />–<input type="number" data-bound="max" min="0.1" step="0.1" value="${d.size.max}" />
      </div>`:``,E=y?`<div class="heights"><span>${r(y.height.min)}</span><span>Height</span><span>${r(y.height.max)}</span></div>`:``;l(g),t(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="${g}" class="dialog">
      <style>${b}</style>
      <div class="patch" style="background: color-mix(in srgb, ${e(o.color)} 55%, white)" data-tip="A sample of the relief the pool places, at the map's sizes and spacing">
        <div class="art"></div>
        <button type="button" class="shuffle icon-shuffle" data-tip="Draw another sample"></button>
      </div>
      ${E}
      <div class="setting density" data-tip="How packed the relief is. 0 places none">
        <span>Density</span>
        <slider-input min="0" max="${_}" step="1" value="${d.density}"></slider-input>
      </div>
      ${T}
      <div class="entries"></div>
      <div class="caption">Add a relief type, drawn in the style's relief set</div>
      <div class="types">${Relief.types.map(({type:e,label:t})=>`<button type="button" data-entry="${e}" data-tip="Add ${t}">${f(e,u)}</button>`).join(``)}</div>
      <div class="actions">
        <button type="button" class="any" data-tip="Add your own icon, an emoji or another set's art">Add any icon…</button>
        ${o.defaults?`<button type="button" class="restore icon-ccw" data-tip="Restore the default pool, density${d.size?` and size`:``}. Apply to keep it"></button>`:``}
      </div>
    </div>`);let D=t(g),O=D.querySelector(`.patch .art`),k=D.querySelector(`.entries`),A=D.querySelector(`slider-input`),j=()=>{let t=y&&d.size?{...y,size:d.size}:void 0;O.innerHTML=p(d.icons,d.density,t,C)||`<p class="empty">No relief: ${e(o.place)} stays bare</p>`},M=()=>Object.values(d.icons).reduce((e,{weight:t})=>e+t,0),N=e=>`${n(e/M()*100)}%`,P=()=>{k.innerHTML=M()?`<div class="head"><span></span><span></span><span>Weight</span><span>Size</span><span>Share</span><span></span></div>`+Object.entries(d.icons).map(([t,{weight:n,size:r=1}])=>`<div class="entry" data-entry="${e(t)}">
              <span class="preview">${f(t,u)}</span>
              <span class="name">${e(m(t))}</span>
              <input type="number" class="weight" min="1" step="1" value="${n}" data-tip="Weight: how often the entry is picked, relative to the others" />
              <input type="number" class="size" min="0.1" max="${v}" step="0.1" value="${r}" data-tip="Size: the entry's icons as a multiple of the pool's size" />
              <span class="share" data-tip="Share of the pool's relief">${N(n)}</span>
              <button type="button" class="icon-trash-empty" data-tip="Remove from the pool"></button>
            </div>`).join(``):`<p class="empty">The pool is empty: ${e(o.place)} gets no relief</p>`,h(D,u),j()},F=e=>{let t=d.icons[e];d.icons[e]={...t,weight:(t?.weight??0)+1},P()},I=e=>e.closest(`.entry`)?.dataset.entry??null,L=(e,t)=>{let r=I(e);if(r===null||!d.icons[r])return!1;let a=Number(e.value);if(!t&&!(a>0))return!1;let o=d.icons[r];if(e.classList.contains(`weight`))o.weight=Math.max(1,Math.round(a)||1);else if(e.classList.contains(`size`)){let e=i(n(a||1,2),.1,v);e===1?delete o.size:o.size=e}return!0};D.querySelector(`.types`).addEventListener(`click`,e=>{let t=e.target.closest(`button[data-entry]`)?.dataset.entry;t&&F(t)}),D.querySelector(`.any`).addEventListener(`click`,()=>{c.IconPicker.open({current:``,onPick:e=>e&&F(e)})}),D.querySelector(`.shuffle`).addEventListener(`click`,()=>{C++,j()}),A.addEventListener(`input`,e=>{e.target===A&&(d.density=i(Math.round(A.valueAsNumber)||0,0,_),j())}),D.querySelector(`.ruleSize`)?.addEventListener(`change`,e=>{let t=e.target,n=t.dataset.bound,r=d.size;r[n]=Math.max(.1,Number(t.value)||r[n]),r.min>r.max&&(r[n===`min`?`max`:`min`]=r[n]),R(),j()});let R=()=>{for(let e of D.querySelectorAll(`.ruleSize input`))e.value=String(d.size[e.dataset.bound])};D.querySelector(`.restore`)?.addEventListener(`click`,()=>{let{icons:e,density:t,size:n}=o.defaults();Object.assign(d,{icons:x(e),density:t},n&&{size:{...n}}),A.value=String(t),n&&R(),P()}),k.addEventListener(`input`,e=>{let t=e.target;if(L(t,!1)){for(let e of k.querySelectorAll(`.entry`))e.querySelector(`.share`).textContent=N(d.icons[e.dataset.entry].weight);j()}}),k.addEventListener(`change`,e=>{L(e.target,!0)&&P()}),k.addEventListener(`click`,e=>{let t=I(e.target);t===null||!e.target.classList.contains(`icon-trash-empty`)||(delete d.icons[t],P())}),P();let z=()=>{d.density=i(Math.round(A.valueAsNumber)||0,0,_),o.write(d),a.onApply?.()},B=()=>$(D).dialog(`close`),V=()=>s(`${o.title} no longer exists: nothing is applied`,!1,`error`);$(D).dialog({title:o.title,width:`28em`,resizable:!1,position:{my:`center`,at:`center`,of:`svg`},close:()=>l(g),buttons:{Apply:()=>{o.exists()?z():V(),B()},"Apply and re-place":()=>{o.exists()?w(o.place,o.covers,()=>{z(),B()}):(V(),B())},Cancel:B}})}function w(t,n,r){u({title:`Re-place relief`,message:`Replace the ${pack.relief?.length?Relief.iconsOn(n).length:0} relief icons on ${e(t)} with new ones? Relief elsewhere is kept`,confirm:`Re-place`,onConfirm:()=>{r?.(),pack.relief?.length&&Relief.regenerate(n),o.isOn(`relief`)?a():o.show(`relief`)}})}var T={open:C};export{w as n,T as t};