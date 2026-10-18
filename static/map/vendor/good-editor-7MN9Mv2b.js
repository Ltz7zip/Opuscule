import{Gn as e,Jn as t,Kn as n,P as r,ar as i,bt as a}from"./utils-Dk4MDzbZ.js";import{Q as o,t as s}from"./layers-BpUy7Q_B.js";import{i as c}from"./emblems-generator-CFXxHBH0.js";import{i as l}from"./tooltips-3xx1wzLl.js";import{t as u}from"./controllers-C2OtiXZ_.js";import{n as d}from"./cultures-generator-BZQiuzLd.js";import{c as f,i as p}from"./dialog-helpers-MF-Ear8n.js";import{v as m,y as h}from"./index-BdCdSELe.js";function g(a,d){let g={...a?.demandCoverage||{}},x={...a?.biomeOutput||{}},S=()=>{let e=h.map(e=>[e,g[e]??0]).filter(([,e])=>e>0);return e.length?e.map(([e,t])=>`${m[e]} ${n(e)}: ${t}`).join(`, `):`none`},C=()=>{let e=Object.entries(x).filter(([,e])=>(e??0)>0);return e.length?e.map(([e,t])=>`${pack.biomes[Number(e)].name}: ${t}`).join(`, `):`none`},w={cultureType:{...a?.multipliers?.cultureType??{}},culture:{...a?.multipliers?.culture??{}},state:{...a?.multipliers?.state??{}},religion:{...a?.multipliers?.religion??{}},biome:{...a?.multipliers?.biome??{}},zone:{...a?.multipliers?.zone??{}}},T=e=>{let t=w[e]??{},n=Object.entries(t).filter(([,e])=>e!==1);return n.length?n.map(([t,n])=>`${_(e,t)} ×${i(n,2)}`).join(`, `):`none`},E=(e,t)=>`
      <label data-tip="Production multiplier by ${t.toLowerCase()}. 1 = no effect, 0 = fully suppressed.">${t}</label>
      <div class="ge-edit-row">
        <span id="mSummary_${e}">${T(e)}</span>
        <button class="mEdit icon-pencil ge-edit" data-dim="${e}" data-tip="Edit ${t} multipliers"></button>
      </div>`,D=a?.recipes||[],O=a?.icon||`goods-unknown`,k;A(),c.retry(Goods.iconSet.id),$(k).dialog({width:`30em`,resizable:!1,title:a?`Edit good`:`Add new good`,open:function(){a&&(this.parentElement?.querySelector(`.ui-dialog-buttonpane`))?.insertAdjacentHTML(`afterbegin`,`<div class="dontAsk" data-tip="Re-place this good and recompute production, trade and taxes. Uncheck to update the good only, without disturbing the current economy.">
          <input id="goodRegenerateEconomy" class="checkbox" type="checkbox" checked />
          <label for="goodRegenerateEconomy" class="checkbox-label"><i>regenerate economy on apply</i></label>
        </div>`)},close:()=>{p(`goodEditor`)},buttons:{Cancel:function(){$(this).dialog(`close`)},[a?`Apply`:`Add`]:()=>{let t=[],n=r(`newGoodName`).value.trim(),i=e(r(`newGoodTags`).value.trim().split(`,`).map(e=>e.trim().toLocaleLowerCase())),o=+r(`newGoodValue`).value,c=+r(`newGoodChance`).value,u=r(`newGoodUnit`).value.trim(),p=r(`newGoodColor`).value,m=r(`newGoodDistribution`).textContent?.trim()??``;if(n||t.push(`Name is required`),(!Number.isFinite(o)||o<0)&&t.push(`Value must be a valid non-negative number`),(!Number.isFinite(c)||c<0||c>100)&&t.push(`Chance must be between 0 and 100`),m)try{let e=Goods.getMethods(),t=`{${Object.keys(e).join(`, `)}}`;Function(t,`return ${m}`)(e)}catch(e){t.push(`Distribution function is invalid: ${e.message||e}`)}for(let e of D){for(let[n,r]of Object.entries(e)){let e=Number(n),i=Goods.get(e);i||t.push(`Recipe references unknown good id: ${e}`);let a=Number(r);(Number.isNaN(a)||!Number.isFinite(a)||a<=0)&&t.push(`Invalid recipe amount for good ${i?.name}`)}Object.keys(e).length||t.push(`Each recipe must have at least one ingredient`)}if(r(`newGoodError`).textContent=t.join(`. `),t.length)return;function h(){let e={};for(let[t,n]of Object.entries(w)){let r=Object.fromEntries(Object.entries(n??{}).filter(([,e])=>e!==void 0&&e!==1));Object.keys(r).length&&(e[t]=r)}return Object.keys(e).length?e:void 0}if(a){let e=a.i;Goods.rename(e,n),Goods.setTags(e,i),Goods.setIcon(e,O),Goods.recolor(e,p),Goods.setPrice(e,o),Goods.setUnit(e,u),Goods.setProduction(e,{chance:c,demandCoverage:g,multipliers:h()??null,biomeOutput:Object.keys(x).length?x:null,recipes:D.length?D:null}),a.distribution=m||void 0,r(`goodRegenerateEconomy`).checked?(Goods.regeneratePlacement(a.i),Production.regenerateEconomy(),s.draw(`markets`,`goods`),s.draw(`trade`),f()):Goods.sync()}else pack.goods.push({i:(()=>{let e=pack.goods?.at(-1)?.i??1;for(;Goods.get(e);)e++;return e})(),name:n,tags:i,icon:O,color:p,value:o,chance:c,unit:u,demandCoverage:g,multipliers:h(),distribution:m||void 0,biomeOutput:Object.keys(x).length?x:void 0,recipes:D.length?D:void 0}),Goods.sync();l(a?`Good is updated`:`Good is added`,!1,`success`,5e3),d?.(),$(k).dialog(`close`)}}});function A(){p(`goodEditor`),r(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="goodEditor" class="dialog">
    <style>
      .ge                 { display:flex; width: auto !important; flex-direction:column; gap:9px; max-height:72vh; overflow-y:auto; padding-right:2px; }
      .ge-section-title   { display:flex; align-items:center; justify-content:space-between; font-weight:bold; text-transform:uppercase; font-size:.8em; letter-spacing:.06em; margin-bottom:7px; padding-bottom:4px; border-bottom:1px solid #666; }
      .ge-grid            { display:grid; grid-template-columns:9em minmax(0, 1fr); gap:.2em; align-items:center; }
      .ge-grid--top       { align-items:start; }
      .ge-grid > *        { min-width:0; }
      .ge-grid > label    { color:#555; }
      .ge-field           { width:100%; }
      input.ge-num        { width:6em; }
      .ge-inline          { display:flex; align-items:center; gap:.4em; }
      .ge-icon-select     { flex:1; min-width:0; display:flex; align-items:center; gap:.4em; margin:0; }
      .ge-icon-preview    { flex-shrink:0; }
      .ge-color           { width:2.4em; height:1.4em; padding:0; border:none; flex-shrink:0; }
      .ge-edit-row        { display:flex; align-items:flex-start; justify-content:space-between; gap:6px; }
      .ge-edit-row > span { flex:1; min-width:0; }
      .ge-edit            { flex-shrink:0; }
      .ge-dist            { flex:1; min-width:0; color:#555; font-size:.9em; font-family:var(--monospace); word-break:break-all; }
      .ge-note            { color:#777; font-style:italic; font-size:.9em; }
      .ge-error           { color:#b20000; min-height:1.2em; }
      .ge-recipe-list     { display:flex; flex-direction:column; gap:.45em; }
      .ge-recipe          { border:1px solid #ccc; border-radius:3px; }
      .ge-recipe-head     { display:flex; align-items:center; justify-content:space-between; padding:.2em .3em; }
      .ge-recipe-actions  { display:flex; gap:.3em; }
      .ge-recipe-ings     { display:flex; flex-direction:column; gap:.2em; padding:.3em .4em; }
      .ge-recipe-ing      { display:grid; grid-template-columns:1fr 5em 1.5em; gap:.25em; align-items:center; }
    </style>

    <div class="ge">
      <div>
        <div class="ge-section-title">General</div>
        <div class="ge-grid">
          <label for="newGoodName">Name*</label>
          <input id="newGoodName" class="ge-field" value="${a?.name||``}" />

          <label for="newGoodTags">Tags</label>
          <input id="newGoodTags" class="ge-field" value="${a?.tags.join(`, `)||``}" placeholder="comma separated" />

          <label for="newGoodValue">Base Price*</label>
          <span class="ge-inline"><input id="newGoodValue" class="ge-num" type="number" min="0" step="1" value="${a?.value??1}" /> 🟡</span>

          <label for="newGoodChance">Chance</label>
          <input id="newGoodChance" class="ge-num" type="number" min="0" max="100" step="0.1" value="${a?.chance??1}" />

          <label for="newGoodUnit">Unit</label>
          <input id="newGoodUnit" class="ge-field" placeholder="e.g. wagon, barrel" value="${a?.unit||``}" />

          <label for="newGoodIcon">Icon*</label>
          <div class="ge-inline">
            <button id="newGoodIcon" type="button" class="ge-icon-select" data-tip="Select the good's icon">
              <svg class="ge-icon-preview" width="2em" height="2em">
                <circle id="newGoodIconCircle" cx="50%" cy="50%" r="42%" fill="${a?.color||`#ff5959`}" stroke="${Goods.getStroke(a?.color||`#ff5959`)}"/>
                <use id="newGoodIconPreview" href="${t(c.href(O))}" x="10%" y="10%" width="80%" height="80%"${o()}/>
              </svg>
              <span id="newGoodIconName">${t(c.name(O))}</span>
            </button>
            <input id="newGoodColor" class="ge-color" type="color" data-tip="Set a stroke color" value="${a?.color||`#ff5959`}" />
          </div>

          <label data-tip="How much of each demand category this good satisfies. Click the pencil icon to edit.">Demand Coverage</label>
          <div class="ge-edit-row">
            <span id="demandCoverageSummary" >${S()}</span>
            <button class="dcEdit icon-pencil ge-edit" data-tip="Edit demand coverage"></button>
          </div>
        </div>
      </div>

      <div>
        <div class="ge-section-title">Raw Production</div>
        <div class="ge-grid ge-grid--top">
          <label data-tip="For raw resources: sets the baseline production per biome">Rural production</label>
          <div class="ge-edit-row">
            <span id="biomeProductionSummary">${C()}</span>
            <button class="bpEdit icon-pencil ge-edit" data-tip="Edit biome baseline production"></button>
          </div>

          <label data-tip="For raw resources: controls where and how this good is produced directly from the environment (e.g. biome, elevation, temperature)">Bonus distribution</label>
          <div class="ge-edit-row">
            <div id="newGoodDistribution" class="ge-dist">${a?.distribution||``}</div>
            <button id="newGoodDistributionEditor" class="icon-pencil ge-edit" data-tip="Open the Distribution visual editor"></button>
          </div>
        </div>
        <div id="newGoodRawNote" class="ge-note"></div>
      </div>

      <div>
        <div class="ge-section-title">
          <span data-tip="For manufactured goods: recipes define which other goods are required to produce this good">Recipes</span>
          <button id="newGoodAddRecipe" class="icon-plus" data-tip="Add a recipe"></button>
        </div>
        <div id="newGoodRecipeList" class="ge-recipe-list"></div>
        <div id="newGoodRecipeNote" class="ge-note"></div>
      </div>

      <div>
        <div class="ge-section-title">
          <span data-tip="Per-dimension production multipliers. 1 = no effect, 0 = fully suppressed.">Multipliers</span>
        </div>
        <div class="ge-grid ge-grid--top">
          ${E(`cultureType`,`Culture Type`)}
          ${E(`culture`,`Culture`)}
          ${E(`state`,`State`)}
          ${E(`religion`,`Religion`)}
          ${E(`biome`,`Biome`)}
          ${E(`zone`,`Zone`)}
        </div>
      </div>

      <div id="newGoodError" class="ge-error"></div>
    </div>
  </div>`),k=r(`goodEditor`);let e=r(`newGoodRecipeList`),n=pack.goods[0]?.i??0,i=[...pack.goods].sort((e,t)=>e.name.localeCompare(t.name)),s=()=>!Object.values(x).some(e=>(e??0)>0)&&!document.getElementById(`newGoodDistribution`)?.textContent?.trim(),l=()=>{let e=s(),t=D.length===0,n=r(`newGoodRecipeNote`);n.textContent=`This good is raw-only: gathered from the environment.`,n.style.display=t&&!e?``:`none`;let i=r(`newGoodRawNote`);i.textContent=`This good is manufactured-only: made from recipes in burgs.`,i.style.display=e&&!t?``:`none`},d=()=>{e.innerHTML=D.map((e,t)=>`
          <div class="recipeOption ge-recipe" data-recipe-index="${t}" >
            <div class="ge-recipe-head">
              <span>Recipe ${t+1}</span>
              <div class="ge-recipe-actions">
                <span class="recipeAddIngredient icon-plus pointer" data-recipe-index="${t}" data-tip="Add ingredient"></span>
                <span class="recipeRemoveOption icon-trash-empty pointer" data-recipe-index="${t}" data-tip="Remove recipe"></span>
              </div>
            </div>
            <div class="recipeIngredients ge-recipe-ings">
              ${Object.entries(e).map(([e,n],r)=>`
                    <div class="ge-recipe-ing" data-recipe-index="${t}" data-ingredient-index="${r}">
                      <select class="recipeGoodSelect" data-recipe-index="${t}" data-ingredient-index="${r}">${i.map(t=>`<option value="${t.i}" ${t.i===Number(e)?`selected`:``}>${t.name}</option>`).join(``)}</select>
                      <input class="recipeAmountInput" data-recipe-index="${t}" data-ingredient-index="${r}" type="number" min="1" step="1" value="${n}" />
                      <span class="recipeRemoveIngredient icon-trash-empty pointer" data-recipe-index="${t}" data-ingredient-index="${r}" data-tip="Remove ingredient" />
                    </div>`).join(``)}
            </div>
          </div>
        `).join(``),e.querySelectorAll(`.recipeGoodSelect`).forEach(e=>{e.onchange=()=>{let t=+e.value,n=+e.dataset.recipeIndex,r=+e.dataset.ingredientIndex,i=D[n],a=i[r]||0;delete i[r],i[t]=a,d()}}),e.querySelectorAll(`.recipeAmountInput`).forEach(e=>{e.onchange=()=>{let t=+e.dataset.recipeIndex,n=+e.dataset.ingredientIndex,r=D[t],i=Number(Object.keys(r)[n]);r[i]=+e.value}}),e.querySelectorAll(`.recipeAddIngredient`).forEach(e=>{e.onclick=t=>{t.preventDefault();let r=D[+e.dataset.recipeIndex],i=Object.keys(r).length?Math.max(...Object.keys(r).map(e=>+e))+1:n;r[i]=1,d()}}),e.querySelectorAll(`.recipeRemoveIngredient`).forEach(e=>{e.onclick=t=>{t.preventDefault();let n=+e.dataset.recipeIndex,r=+e.dataset.ingredientIndex,i=D[n];if(Object.keys(i).length>1){let e=Number(Object.keys(i)[r]);delete i[e],d()}}}),e.querySelectorAll(`.recipeRemoveOption`).forEach(e=>{e.onclick=t=>{t.preventDefault();let n=+e.dataset.recipeIndex;D.splice(n,1),d()}}),l()};d(),k.querySelectorAll(`.mEdit`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.dim;v(t,w[t]??{},e=>{w[t]=e;let n=document.getElementById(`mSummary_${t}`);n&&(n.textContent=T(t))})})}),k.querySelector(`.dcEdit`).addEventListener(`click`,()=>{y({...g},e=>{Object.keys(g).forEach(e=>void delete g[e]),Object.assign(g,e);let t=document.getElementById(`demandCoverageSummary`);t&&(t.textContent=S())})}),k.querySelector(`.bpEdit`).addEventListener(`click`,()=>{b({...x},e=>{Object.keys(x).forEach(e=>void delete x[+e]),Object.assign(x,e);let t=document.getElementById(`biomeProductionSummary`);t&&(t.textContent=C()),l()})}),r(`newGoodAddRecipe`).addEventListener(`click`,e=>{e.preventDefault(),D.push({[n]:1}),d()}),r(`newGoodDistributionEditor`).addEventListener(`click`,()=>{let e=r(`newGoodDistribution`);u.DistributionEditor.open(t=>{e.textContent=t,l()},e.textContent?.trim()??``)});let f=e=>{O=e,r(`newGoodIconPreview`).setAttribute(`href`,c.href(e)),r(`newGoodIconName`).textContent=c.name(e)};r(`newGoodIcon`).onclick=()=>u.IconPicker.open({current:O,onPick:f});let m=r(`newGoodColor`);m.oninput=()=>{let e=r(`newGoodIconCircle`);e.setAttribute(`fill`,m.value),e.setAttribute(`stroke`,Goods.getStroke(m.value))}}}function _(e,t){return e===`cultureType`?t:e===`culture`?pack.cultures[+t]?.name??`Culture ${t}`:e===`state`?pack.states[+t]?.name??`State ${t}`:e===`religion`?pack.religions[+t]?.name??`Religion ${t}`:e===`zone`?pack.zones.find(e=>e.i===+t)?.name??`Zone ${t}`:pack.biomes[+t]?.name??`Biome ${t}`}function v(e,t,n){let r,i;switch(e){case`cultureType`:r=d.map(e=>({id:e,name:e})),i=`Culture Type`;break;case`culture`:r=pack.cultures.filter(e=>e.i&&!e.removed).map(e=>({id:String(e.i),name:e.name,color:e.color})),i=`Culture`;break;case`state`:r=pack.states.filter(e=>e.i&&!e.removed).map(e=>({id:String(e.i),name:e.fullName||e.name,color:e.color})),i=`State`;break;case`religion`:r=pack.religions.filter(e=>e.i&&!e.removed).map(e=>({id:String(e.i),name:e.name,color:e.color})),i=`Religion`;break;case`biome`:r=pack.biomes.filter(e=>!e.removed).map(({i:e,name:t,color:n})=>({id:String(e),name:t,color:n})),i=`Biome`;break;case`zone`:r=pack.zones.map(e=>({id:String(e.i),name:e.name,color:e.color})),i=`Zone`;break}let o=r.map(e=>{let n=t[e.id]??1;return`${`<fill-box fill="${e.color||a()}" size="1em" disabled data-tip="${e.name}"></fill-box>`}<span>${e.name}</span><input type="number" class="mPopupInput" data-id="${e.id}" min="0" step="0.1" style="width:5em;" value="${n}" />`}),s=document.createElement(`div`);document.body.appendChild(s),s.innerHTML=`<div style="max-height:320px; overflow-y:auto; padding:.2em;">${o.length?`<div style="display:grid; grid-template-columns:auto 1fr 5em; gap:.3em .5em; align-items:center;">${o.join(``)}</div>`:`<div style="color:#777; font-style:italic;">No ${i.toLowerCase()}s available</div>`}</div>`,$(s).dialog({title:`${i} multipliers`,width:`22em`,resizable:!1,buttons:{Cancel:function(){$(this).dialog(`close`)},Apply:function(){let e=Array.from(s.querySelectorAll(`.mPopupInput`)),t={};for(let n of e){let e=n.dataset.id,r=Number(n.value);Number.isFinite(r)&&r>=0&&r!==1&&(t[e]=r)}n(t),$(this).dialog(`close`)}},close:()=>{$(s).dialog(`destroy`),s.remove()}})}function y(e,t){let r=h.map(t=>{let r=e[t]??0;return`<span>${m[t]} ${n(t)}</span><input type="number" class="dcPopupInput" data-cat="${t}" min="0" step="0.05" style="width:5em;" value="${r}" />`}).join(``),i=document.createElement(`div`);document.body.appendChild(i),i.innerHTML=`<div style="display:grid;grid-template-columns:1fr 5em;gap:.3em .5em;align-items:center;padding:.2em;">${r}</div>`,$(i).dialog({title:`Demand Coverage`,width:`18em`,resizable:!1,buttons:{Cancel:function(){$(this).dialog(`close`)},Apply:function(){let e={};i.querySelectorAll(`.dcPopupInput`).forEach(t=>{let n=t.dataset.cat,r=Number(t.value);Number.isFinite(r)&&r>0&&(e[n]=r)}),t(e),$(this).dialog(`close`)}},close:()=>{$(i).dialog(`destroy`),i.remove()}})}function b(e,t){let n=pack.biomes.filter(e=>!e.removed).map(({i:t,name:n})=>`<span>${n}</span><input type="number" class="bpPopupInput" data-id="${t}" min="0" step="0.01" style="width:5em;" value="${e[t]??0}" />`).join(``),r=document.createElement(`div`);document.body.appendChild(r),r.innerHTML=`<div style="max-height:320px;overflow-y:auto;padding:.2em;"><div style="display:grid;grid-template-columns:1fr 5em;gap:.3em .5em;align-items:center;">${n}</div></div>`,$(r).dialog({title:`Biome Baseline Production`,width:`22em`,resizable:!1,buttons:{Cancel:function(){$(this).dialog(`close`)},Apply:function(){let e={};r.querySelectorAll(`.bpPopupInput`).forEach(t=>{let n=Number(t.dataset.id),r=Number(t.value);Number.isFinite(r)&&r>0&&(e[n]=r)}),t(e),$(this).dialog(`close`)}},close:()=>{$(r).dialog(`destroy`),r.remove()}})}var x={open:g};export{x as GoodEditor};