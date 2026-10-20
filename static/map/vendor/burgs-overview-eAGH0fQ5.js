import{J as e,P as t,_ as n,ar as r,at as i,it as a,jn as o,mt as s,n as c,ot as l,p as u,q as d,y as f}from"./utils-Dk4MDzbZ.js";import{nt as p,t as m}from"./layers--lc146Vt.js";import{t as h}from"./stratify-CGdiYggi.js";import{t as g}from"./pack-CyBKcrr4.js";import{i as _}from"./tooltips-3xx1wzLl.js";import{t as v}from"./state-B2hBYDzv.js";import{t as y}from"./controllers-Ulmfs1Xu.js";import{i as b,l as x,n as S,r as C}from"./dialog-helpers-MF-Ear8n.js";import{r as ee,t as te}from"./town-plan-C0b00gJx.js";import{n as w}from"./town-plans-CSwL3uPD.js";import{i as T,r as E}from"./index-CMqgB-kq.js";import{t as D}from"./highlighting-DOtPILkM.js";import{a as O,i as k,n as A,r as j}from"./table-BOwkVE_i.js";var M=`burgsOverview`,N={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},P,F=null,I=[{key:`locate`,width:`0.8em`,permanent:!0},{key:`name`,label:`Burg`,width:`8em`,permanent:!0,sortBy:e=>e.name||``,sortType:`alpha`},{key:`province`,label:`Province`,width:`8em`,hidden:!0,mobileHidden:!0,sortType:`alpha`,sortBy:e=>{let t=pack.cells.province[e.cell];return t&&pack.provinces[t]?.name||``}},{key:`state`,label:`State`,width:`8em`,sortBy:e=>pack.states[e.state]?.name||``,sortType:`alpha`},{key:`culture`,label:`Culture`,width:`10em`,mobileHidden:!0,sortBy:e=>pack.cultures[e.culture]?.name||``,sortType:`alpha`},{key:`group`,label:`Group`,width:`6em`,mobileHidden:!0,sortBy:e=>e.group||``,sortType:`alpha`},{key:`population`,label:`Population`,width:`7em`,defaultSort:`desc`,sortBy:e=>e.population*options.map.units.population.scale*options.map.units.population.urbanization.rate},{key:`grossproduct`,label:`Product`,width:`6.5em`,hidden:!0,mobileHidden:!0,sortBy:e=>r(e.product||0,2)},{key:`productpercapita`,label:`Wealth`,width:`6.5em`,mobileHidden:!0,tip:`Click to sort by burg wealth (gross product per capita)`,sortBy:e=>r(e.population>0?(e.product||0)/e.population:0,2)},{key:`treasury`,label:`Treasury`,width:`6.5em`,mobileHidden:!0,sortBy:e=>r(e.treasury||0,2)},{key:`features`,label:`Features`,width:`6em`,mobileHidden:!0,sortType:`alpha`,sortBy:e=>e.capital&&e.port?`a-capital-port`:e.capital?`c-capital`:e.port?`p-port`:`z-burg`},{key:`townplan`,label:`Town plan`,width:`1.2em`,tip:`Open the plan generated for this burg`},{key:`edit`,width:`1.1em`},{key:`lock`,width:`1.1em`},{key:`remove`,width:`1.4em`,permanent:!0}],L=j({getData:()=>T(M,W(),I),onUpdate:G});function R(e={}){customization||(P=v.get(M,`filters`,()=>({search:``,stateId:-1,cultureId:-1})),S(`#${M}, .stable`),m.show(`burgIcons`,`labels`),e.stateId!=null&&(P.stateId=e.stateId),e.cultureId!=null&&(P.cultureId=e.cultureId),z(),H(),de(),L.reset(),$(`#${M}`).dialog({title:`Burgs Overview`,resizable:!1,close:B,width:`fit-content`,position:N}))}function z(){b(`burgsOverview`);let e=`<div id="burgsOverview" class="dialog stable editorDialog">
      <div id="burgsBody" class="table">${k({dialogId:M,columns:I})}</div>
      <div id="burgsFilters" data-tip="Apply a filter" class="editorFilters">
        <label for="burgsSearch" data-tip="Filter by name, province, state, culture, or group"
          >Search: <input id="burgsSearch" type="search"
        /></label>
        <label for="burgsFilterState"
          >State:
          <select id="burgsFilterState"></select
        ></label>
        <label for="burgsFilterCulture"
          >Culture:
          <select id="burgsFilterCulture"></select
        ></label>
      </div>
      <div id="burgsFooter" class="totalLine">
        <div data-tip="Burgs displayed" style="margin-left: 5px">
          Burgs:&nbsp;<span id="burgsFooterBurgs">0 of 0</span>
        </div>
        <div data-tip="Average population" style="margin-left: 12px" data-col="population">
          Avg population:&nbsp;<span id="burgsFooterPopulation">0</span>
        </div>
        <div data-tip="Average gross product" style="margin-left: 12px" data-col="grossproduct">
          Avg product:&nbsp;<span id="burgsFooterGrossProduct">0</span> 🟡
        </div>
        <div data-tip="Average wealth (product per capita)" style="margin-left: 12px" data-col="productpercapita">
          Avg wealth:&nbsp;<span id="burgsFooterProductPerCapita">0</span> 🟡
        </div>
        <div data-tip="Average treasury" style="margin-left: 12px" data-col="treasury">
          Avg treasury:&nbsp;<span id="burgsFooterTreasury">0</span> 🟡
        </div>
      </div>
      <div id="burgsBottom" class="editorToolbar">
        <button id="burgsOverviewRefresh" data-tip="Refresh the Editor" class="icon-cw"></button>
        <button id="burgsGroupsEditorButton" data-tip="Edit burg groups" class="icon-cog"></button>
        <button id="burgsChart" data-tip="Show burgs bubble chart" class="icon-chart-area"></button>
        <button
          id="regenerateBurgNames"
          data-tip="Regenerate burg names based on assigned culture"
          class="icon-retweet"
        ></button>
        <button id="addNewBurg" data-tip="Add a new burg. Hold Shift to add multiple" class="icon-plus"></button>
        <button
          id="burgsExport"
          data-tip="Save burgs-related data as a text file (.csv)"
          class="icon-download"
        ></button>
        <button
          id="burgsExportPlans"
          data-tip="Save the plan of every burg as a single .zip archive"
          class="icon-export"
        ></button>
        <span id="burgsExportStatus" style="align-self: center; font-size: 0.85em; opacity: 0.75"></span>
        <button id="burgNamesImport" data-tip="Rename burgs in bulk" class="icon-upload"></button>
        <button id="burgsLockAll" data-tip="Lock or unlock all burgs" class="icon-lock"></button>
        <button
          id="burgsRemoveAll"
          data-tip="Remove all unlocked burgs except for capitals. To remove a capital remove its state first"
          class="icon-trash"
        ></button>
      </div>
    </div>`;t(`dialogs`).insertAdjacentHTML(`beforeend`,e),t(`burgsSearch`).value=P.search,E(M,L.reset),D(M,({target:e,cellId:t})=>{let n=pack.cells.burg[t];if(n)return n;let r=e.closest(`#labels [data-label-type='burg'][data-id], #burgIcons [data-id]`);return r?Number(r.dataset.id):void 0}),A({dialogId:M,columns:I,onUpdate:()=>x(M,{width:`fit-content`,position:N})}),t(`burgsOverviewRefresh`).addEventListener(`click`,V),t(`burgsGroupsEditorButton`).addEventListener(`click`,()=>y.BurgGroupEditor.open()),t(`burgsChart`).addEventListener(`click`,Z),t(`burgsFilterState`).addEventListener(`change`,U),t(`burgsFilterCulture`).addEventListener(`change`,U),t(`burgsSearch`).addEventListener(`input`,U),t(`regenerateBurgNames`).addEventListener(`click`,ae),t(`addNewBurg`).addEventListener(`click`,()=>void y.BurgCreator.toggle()),t(`burgsExport`).addEventListener(`click`,Q),t(`burgsExportPlans`).addEventListener(`click`,re),t(`burgNamesImport`).addEventListener(`click`,oe),t(`burgsLockAll`).addEventListener(`click`,ue),t(`burgsRemoveAll`).addEventListener(`click`,le)}function B(){document.getElementById(`addBurgTool`)?.classList.contains(`pressed`)&&y.BurgCreator.stop(),$(`#burgsOverview`).dialog(`destroy`),t(`burgsOverview`).remove()}function V(){H(),L.reset()}function H(){let e=t(`burgsFilterState`);new Set(pack.states.filter(e=>!e.removed).map(e=>e.i)).has(P.stateId)||(P.stateId=-1),e.options.length=0,e.options.add(new Option(`all`,`-1`,!1,P.stateId===-1)),e.options.add(new Option(pack.states[0].name,`0`,!1,P.stateId===0)),pack.states.filter(e=>e.i&&!e.removed).sort((e,t)=>e.name>t.name?1:-1).forEach(t=>void e.options.add(new Option(t.name,String(t.i),!1,t.i===P.stateId)));let n=t(`burgsFilterCulture`);new Set(pack.cultures.filter(e=>!e.removed).map(e=>e.i)).has(P.cultureId)||(P.cultureId=-1),n.options.length=0,n.options.add(new Option(`all`,`-1`,!1,P.cultureId===-1)),n.options.add(new Option(pack.cultures[0].name,`0`,!1,P.cultureId===0)),pack.cultures.filter(e=>e.i&&!e.removed).sort((e,t)=>e.name>t.name?1:-1).forEach(e=>void n.options.add(new Option(e.name,String(e.i),!1,e.i===P.cultureId))),v.set(M,`filters`,P)}function U(){P.search=t(`burgsSearch`).value,P.stateId=+t(`burgsFilterState`).value,P.cultureId=+t(`burgsFilterCulture`).value,v.set(M,`filters`,P),L.reset()}function W(){let e=P.search.toLowerCase().trim(),t=pack.burgs.filter(e=>e.i&&!e.removed);return e&&(t=t.filter(t=>{let n=t.name.toLowerCase(),r=(pack.states[t.state]?.name||``).toLowerCase(),i=pack.cells.province[t.cell],a=i?pack.provinces[i]?.name.toLowerCase():``,o=(pack.cultures[t.culture]?.name||``).toLowerCase();return n.includes(e)||r.includes(e)||a.includes(e)||o.includes(e)||t.group.toLowerCase().includes(e)})),P.stateId!==-1&&(t=t.filter(e=>e.state===P.stateId)),P.cultureId!==-1&&(t=t.filter(e=>e.culture===P.cultureId)),t}function G(e){let n=t(`burgsBody`),i=pack.burgs.filter(e=>e.i&&!e.removed).length;n.querySelectorAll(`:scope > .states`).forEach(e=>{e.remove()});let a=``,o=0,s=0,c=0,l=0;for(let t of e.all){let e=t.population*options.map.units.population.scale*options.map.units.population.urbanization.rate,n=r(t.product||0,2),i=r(t.population>0?(t.product||0)/t.population:0,2),a=r(t.treasury||0,2);o+=e,s+=n,c+=i,l+=a}for(let t of e.rows){let e=t.population*options.map.units.population.scale*options.map.units.population.urbanization.rate,n=r(t.product||0,2),i=r(t.population>0?(t.product||0)/t.population:0,2),o=r(t.treasury||0,2),s=t.capital&&t.port?`a-capital-port`:t.capital?`c-capital`:t.port?`p-port`:`z-burg`,c=pack.states[t.state].name,l=pack.cells.province[t.cell],u=l?pack.provinces[l].name:``,d=pack.cultures[t.culture].name;a+=`<div
        class="states"
        data-id=${t.i}
        data-name="${t.name}"
        data-state="${c}"
        data-province="${u}"
        data-culture="${d}"
        data-group="${t.group}"
        data-population=${e}
        data-grossproduct=${n}
        data-productpercapita=${i}
        data-treasury=${o}
        data-features="${s}"
      >
        <span data-tip="Click to zoom into view" class="icon-dot-circled pointer" data-col="locate"></span>
        <input data-tip="Burg name" class="burgName" value="${t.name}" data-col="name" disabled />
        <input data-tip="Burg province" value="${u}" data-col="province" disabled />
        <input data-tip="Burg state" value="${c}" data-col="state" disabled />
        <input data-tip="Dominant culture" value="${d}" data-col="culture" disabled />
        <input data-tip="Burg group" value="${t.group}" data-col="group" disabled />
        <div data-col="population">
          <span data-tip="Burg population" class="icon-male"></span>
          <input data-tip="Burg population" value=${f(e)} disabled />
        </div>
        <div data-col="grossproduct">
          <span data-tip="Gross Product: local sale revenue minus purchased ingredient costs during the production.">🟡</span>
          <input data-tip="Gross Product: local sale revenue minus purchased ingredient costs during the production." value=${n} disabled />
        </div>
        <div data-col="productpercapita">
          <span data-tip="Wealth: gross product divided by population">🟡</span>
          <input data-tip="Wealth: gross product divided by population" value=${i} disabled />
        </div>
        <div data-col="treasury">
          <span data-tip="Treasury: accumulated cash balance">🟡</span>
          <input data-tip="Treasury: accumulated cash balance" value=${o} disabled />
        </div>
        <div data-col="features">
          <span
            data-tip="${t.capital?` This burg is a state capital`:`This burg is a NOT state capital`}"
            class="icon-star-empty${t.capital?``:` inactive`}" style="padding: 0 1px;"></span>
          <span data-tip="${t.port?` This burg is a port`:`This burg is NOT a port`}"
          class="icon-anchor${t.port?``:` inactive`}" style="font-size: .9em; padding: 0 1px;"></span>
        </div>
        <span data-col="townplan" data-tip="Open the town plan" class="icon-map-o pointer"></span>
        <span data-col="edit" data-tip="Edit burg" class="icon-pencil"></span>
        <span data-col="lock" class="locks pointer ${t.lock?`icon-lock`:`icon-lock-open inactive`}" onmouseover="showElementLockTip(event)"></span>
        <span data-col="remove" data-tip="Remove burg" class="icon-trash-empty"></span>
      </div>`}n.insertAdjacentHTML(`beforeend`,a),t(`burgsFooterBurgs`).innerHTML=`${e.all.length} of ${i}`,t(`burgsFooterPopulation`).innerHTML=e.all.length?f(o/e.all.length):`0`,t(`burgsFooterGrossProduct`).innerHTML=e.all.length?String(r(s/e.all.length,2)):`0`,t(`burgsFooterProductPerCapita`).innerHTML=e.all.length?String(r(c/e.all.length,2)):`0`,t(`burgsFooterTreasury`).innerHTML=e.all.length?String(r(l/e.all.length,2)):`0`,O(t(`burgsFooter`),e,L.goto),n.querySelectorAll(`div.states`).forEach(e=>void e.addEventListener(`mouseenter`,e=>K(e))),n.querySelectorAll(`div.states`).forEach(e=>void e.addEventListener(`mouseleave`,()=>q())),n.querySelectorAll(`div > span.icon-dot-circled`).forEach(e=>void e.addEventListener(`click`,J)),n.querySelectorAll(`div > span[data-col="townplan"]`).forEach(e=>void e.addEventListener(`click`,ne)),n.querySelectorAll(`div > span.locks`).forEach(e=>void e.addEventListener(`click`,Y)),n.querySelectorAll(`div > span.icon-pencil`).forEach(e=>void e.addEventListener(`click`,X)),n.querySelectorAll(`div > span.icon-trash-empty`).forEach(e=>void e.addEventListener(`click`,ie))}function K(e){let t=+e.target.dataset.id,n=o(`#labels`).select(`[data-label-type='burg'][data-id='${t}']`);n.size()&&n.classed(`drag`,!0)}function q(){o(`#labels`).selectAll(`text[data-label-type='burg'].drag`).classed(`drag`,!1)}function J(){let e=+this.closest(`.states`).dataset.id,{x:t,y:n}=pack.burgs[e];zoomTo(t,n,8,2e3)}function Y(){let e=+this.closest(`.states`).dataset.id;Burgs.setLocked(e,!pack.burgs[e].lock),this.classList.contains(`icon-lock`)?(this.classList.remove(`icon-lock`),this.classList.add(`icon-lock-open`),this.classList.add(`inactive`)):(this.classList.remove(`icon-lock-open`),this.classList.add(`icon-lock`),this.classList.remove(`inactive`))}function X(){let e=+this.closest(`.states`).dataset.id;y.BurgEditor.open(e)}function ne(){te(+this.closest(`.states`).dataset.id)}async function re(){let e=t(`burgsExportStatus`),n=(t,...n)=>e.textContent=n.reduce((e,t)=>e.replace(`{}`,t),ee(t));this.disabled=!0,n(`Exporting town plans: {} of {}`,`0`,`…`);try{let{count:e,bytes:t}=await w(({stage:e,done:t,total:r})=>{e===`plans`?n(`Exporting town plans: {} of {}`,String(t),String(r)):n(`Packing the archive: {}%`,String(t))});e?n(`Exported {} town plans ({})`,String(e),`${(t/1048576).toFixed(1)} MB`):n(`No burgs to export`)}finally{this.disabled=!1}}function ie(){let e=+this.closest(`.states`).dataset.id;if(pack.burgs[e].capital){_(`You cannot remove the capital. Please change the state capital first`,!1,`error`);return}if(pack.markets?.some(t=>t.centerBurgId===e)){_(`You cannot remove a market center burg. Please remove the market first`,!1,`error`);return}C({title:`Remove burg`,message:`Are you sure you want to remove the burg? <br>This action cannot be reverted`,confirm:`Remove`,onConfirm:()=>{Burgs.remove(e),p(`burg`,e),L.refresh(),m.draw(`burgIcons`,`labels`)}})}function ae(){for(let e of W())e.lock||(e.name=Names.getCulture(e.culture));L.refresh(),m.draw(`labels`)}function Z(){let e=pack.states.map(e=>{let t=e.color?e.color:`#ccc`,n=e.fullName?e.fullName:e.name;return{id:e.i,state:e.i?0:null,color:t,name:n}}),n=pack.burgs.filter(e=>e.i&&!e.removed).map(t=>{let n=t.i+e.length-1,r=t.population,i=t.capital,a=pack.cells.province[t.cell],o=a?a+e.length-1:t.state;return{id:n,i:t.i,state:t.state,culture:t.culture,province:a,parent:o,name:t.name,population:r,capital:i,x:t.x,y:t.y}}),r=e.concat(n);if(r.length<2){_(`No burgs to show`,!1,`error`);return}let i=h().parentId(e=>e.state)(r).sum(e=>e.population).sort((e,t)=>t.value-e.value),a=t(`uiSize`).valueAsNumber,s=150+200*a,c=150+200*a,l={top:0,right:-50,bottom:-10,left:-50},u=s-l.left-l.right,d=c-l.top-l.bottom,p=g().size([u,d]).padding(3);alertMessage.innerHTML=`<select id="burgsTreeType" style="display:block; margin-left:13px; font-size:11px">
      <option value="states" selected>Group by state</option>
      <option value="cultures">Group by culture</option>
      <option value="parent">Group by province and state</option>
      <option value="provinces">Group by province</option>
    </select>`,alertMessage.innerHTML+=`<div id='burgsInfo' class='chartInfo'>&#8205;</div>`;let m=o(`#alertMessage`).insert(`svg`,`#burgsInfo`).attr(`id`,`burgsTree`).attr(`width`,s).attr(`height`,c-10).attr(`stroke-width`,2).append(`g`).attr(`transform`,`translate(-50, -10)`);t(`burgsTreeType`).addEventListener(`change`,x),p(i);let v=m.selectAll(`circle`).data(i.leaves()).join(`circle`).attr(`data-id`,e=>e.data.i).attr(`r`,e=>e.r).attr(`fill`,e=>e.parent.data.color).attr(`cx`,e=>e.x).attr(`cy`,e=>e.y).on(`mouseenter`,(e,t)=>y(e,t)).on(`mouseleave`,e=>b(e)).on(`click`,(e,t)=>zoomTo(t.data.x,t.data.y,8,2e3));function y(e,n){o(e.target).transition().duration(1500).attr(`stroke`,`#c13119`);let r=n.data.name,i=n.parent.data.name,a=f(n.value*options.map.units.population.scale*options.map.units.population.urbanization.rate);t(`burgsInfo`).innerHTML=`${r}. ${i}. Population: ${a}`,K(e),_(`Click to zoom into view`)}function b(e){q(),t(`burgsInfo`)&&(t(`burgsInfo`).innerHTML=`&#8205;`,o(e.target).transition().attr(`stroke`,null),_(``))}function x(){let e=()=>pack.states.map(e=>{let t=e.color?e.color:`#ccc`,n=e.fullName?e.fullName:e.name;return{id:e.i,state:e.i?0:null,color:t,name:n}}),t=()=>pack.cultures.map(e=>{let t=e.color?e.color:`#ccc`;return{id:e.i,culture:e.i?0:null,color:t,name:e.name}}),r=()=>{let e=pack.states.map(e=>{let t=e.color?e.color:`#ccc`,n=e.fullName?e.fullName:e.name;return{id:e.i,parent:e.i?0:null,color:t,name:n}}),t=pack.provinces.filter(e=>e.i&&!e.removed).map(t=>({id:t.i+e.length-1,parent:t.state,color:t.color,name:t.fullName}));return e.concat(t)},i=()=>pack.provinces.map(e=>{let t=e.color?e.color:`#ccc`,n=e.fullName?e.fullName:e.name;return{id:e.i?e.i:0,province:e.i?0:null,color:t,name:n}}),a=e=>{if(this.value===`states`)return e.state;if(this.value===`cultures`)return e.culture;if(this.value===`parent`)return e.parent;if(this.value===`provinces`)return e.province},o={states:e,cultures:t,parent:r,provinces:i}[this.value]();n.forEach(e=>{e.id=e.i+o.length-1});let s=o.concat(n),c=h().parentId(e=>a(e))(s).sum(e=>e.population).sort((e,t)=>t.value-e.value);v.data(p(c).leaves()).transition().duration(2e3).attr(`data-id`,e=>e.data.i).attr(`fill`,e=>e.parent.data.color).attr(`cx`,e=>e.x).attr(`cy`,e=>e.y).attr(`r`,e=>e.r)}$(`#alert`).dialog({title:`Burgs bubble chart`,width:`fit-content`,position:{my:`left bottom`,at:`left+10 bottom-10`,of:`svg`},buttons:{},close:()=>alertMessage.innerHTML=``})}function Q(){let t=`Id,Burg,Province,Province Full Name,State,State Full Name,Culture,Religion,Group,Population,X,Y,Latitude,Longitude,Elevation (${options.map.units.height.unit}),Temperature,Temperature likeness,Capital,Port,Citadel,Walls,Plaza,Temple,Shanty Town,Emblem,Preview link\n`;pack.burgs.filter(e=>e.i&&!e.removed).forEach(i=>{t+=`${i.i},`,t+=`${i.name},`;let a=pack.cells.province[i.cell];t+=a?`${pack.provinces[a].name},`:`,`,t+=a?`${pack.provinces[a].fullName},`:`,`,t+=`${pack.states[i.state].name},`,t+=`${pack.states[i.state].fullName},`,t+=`${pack.cultures[i.culture].name},`,t+=`${pack.religions[pack.cells.religion[i.cell]].name},`,t+=`${i.group},`,t+=`${r(i.population*options.map.units.population.scale*options.map.units.population.urbanization.rate)},`,t+=`${i.x},`,t+=`${i.y},`,t+=`${d(i.y,options.map.geography.coordinates,options.map.graph.height,2)},`,t+=`${e(i.x,options.map.geography.coordinates,options.map.graph.width,2)},`,t+=`${parseInt(u(pack.cells.h[i.cell]),10)},`;let o=grid.cells.temp[pack.cells.g[i.cell]];t+=`${c(o)},`,t+=`${n(o)},`,t+=i.capital?`capital,`:`,`,t+=i.port?`port,`:`,`,t+=i.citadel?`citadel,`:`,`,t+=i.walls?`walls,`:`,`,t+=i.plaza?`plaza,`:`,`,t+=i.temple?`temple,`:`,`,t+=i.shanty?`shanty town,`:`,`,t+=i.coa?`${JSON.stringify(i.coa).replace(/"/g,``).replace(/,/g,`;`)},`:`,`,t+=Burgs.getPreview(i).link,t+=`
`});let a=`${l(`Burgs`)}.csv`;i(t,a)}function oe(){alertMessage.innerHTML=`Download burgs list as a text file, make changes and re-upload the file. Make sure the file is a plain text document with each
    name on its own line (the dilimiter is CRLF). If you do not want to change the name, just leave it as is`,$(`#alert`).dialog({title:`Burgs bulk renaming`,width:`22em`,position:{my:`center`,at:`center`,of:`svg`},buttons:{Download:()=>{i(pack.burgs.filter(e=>e.i&&!e.removed).map(e=>e.name).join(`\r
`),`${l(`Burg names`)}.txt`)},Upload:se,Cancel:function(){$(this).dialog(`close`)}}})}function se(){F??=a(`.txt,.csv`),F.onchange=()=>s(F,ce),F.click()}function ce(e){if(!e){_(`Cannot load the file, please check the format`,!1,`error`);return}let t=e.replace(/\r\n|\r/g,`
`).split(`
`).map(e=>e.trim()).filter(Boolean);if(!t.length){_(`Cannot parse the list, please check the file format`,!1,`error`);return}let n=[],r=`Burgs to be renamed as below:`;r+=`<table class="overflow-table"><tr><th>Id</th><th>Current name</th><th>New Name</th></tr>`;let i=pack.burgs.filter(e=>e.i&&!e.removed);for(let e=0;e<t.length&&e<=i.length;e++){let a=t[e];!a||!i[e]||a===i[e].name||(n.push({id:i[e].i,name:a}),r+=`<tr><td style="width:20%">${i[e].i}</td><td style="width:40%">${i[e].name}</td><td style="width:40%">${a}</td></tr>`)}r+=`</tr></table>`,n.length||(r=`No changes found in the file. Please change some names to get a result`),alertMessage.innerHTML=r,C({title:`Burgs bulk renaming`,message:r,confirm:`Rename`,onConfirm:()=>{for(let{id:e,name:t}of n)Burgs.rename(e,t);L.refresh(),m.draw(`labels`)}})}function le(){let e=()=>pack.burgs.filter(e=>e.i&&!e.removed&&!(e.capital||e.lock)&&!pack.markets?.some(t=>t.centerBurgId===e.i));C({title:`Remove ${e().length} burgs`,message:`
        Are you sure you want to remove all <i>unlocked</i> burgs except for capitals and market centers?
        <br><i>To remove a capital you have to remove its state first</i>`,confirm:`Remove`,onConfirm:()=>{for(let t of e())Burgs.remove(t.i),p(`burg`,t.i);L.refresh(),m.draw(`burgIcons`,`labels`)}})}function ue(){let e=pack.burgs.filter(e=>e.i&&!e.removed),n=e.every(e=>e.lock);for(let t of e)Burgs.setLocked(t.i,!n);L.refresh(),t(`burgsLockAll`).className=n?`icon-lock`:`icon-lock-open`}function de(){let e=pack.burgs.every(({lock:e,i:t,removed:n})=>e||!t||n);t(`burgsLockAll`).className=e?`icon-lock-open`:`icon-lock`}var fe={open:R,showChart:Z,exportCsv:Q};export{fe as BurgsOverview};