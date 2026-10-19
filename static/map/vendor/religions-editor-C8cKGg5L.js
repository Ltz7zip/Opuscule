import{L as e,P as t,U as n,Un as r,Xn as i,a,an as o,ar as s,at as c,jn as l,o as u,ot as d,qn as f,y as p,z as m}from"./utils-Dk4MDzbZ.js?v=2";import{B as h,H as ee,W as te,t as g}from"./layers-DCXJRYE9.js?v=2";import{t as _}from"./drag-Dc9_zdw7.js?v=2";import{t as v}from"./sin-DYm9hqTl.js?v=2";import{n as y}from"./highlight-BA-X3wTZ.js?v=2";import{i as b,t as ne}from"./tooltips-3xx1wzLl.js?v=2";import{t as x}from"./state-B2hBYDzv.js?v=2";import{t as S}from"./controllers-CTfyQhlk.js?v=2";import{i as re,l as C,n as ie,r as ae,s as oe}from"./dialog-helpers-MF-Ear8n.js?v=2";import{t as se}from"./viewbox-events-BYU-vEWY.js?v=2";import{i as w,r as T}from"./index-lTzorqRn.js?v=2";import{t as E}from"./highlighting-DOtPILkM.js?v=2";import{a as D,i as ce,n as le,r as ue}from"./table-BOwkVE_i.js?v=2";var O=`religionsEditor`,k=`Religions`,A={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},j,M=[{key:`color`,width:`1.2em`,permanent:!0},{key:`name`,label:`Religion`,width:`14em`,permanent:!0,sortBy:e=>e.name||``,sortType:`alpha`},{key:`type`,label:`Type`,width:`6em`,defaultSort:`asc`,sortBy:e=>e.type||``,sortType:`alpha`},{key:`form`,label:`Form`,width:`7em`,mobileHidden:!0,sortBy:e=>e.form||``,sortType:`alpha`},{key:`deity`,label:`Deity`,width:`14em`,mobileHidden:!0,sortBy:e=>e.deity||``,sortType:`alpha`},{key:`area`,label:`Area`,width:`7em`,mobileHidden:!0,sortBy:e=>e.area||0},{key:`population`,label:`Population`,width:`6em`,sortBy:e=>(e.rural||0)*options.map.units.population.scale+(e.urban||0)*options.map.units.population.scale*options.map.units.population.urbanization.rate},{key:`expansion`,label:`Expansion`,width:`5em`,hidden:!0,mobileHidden:!0,sortBy:e=>e.expansion||``,sortType:`alpha`},{key:`expansionism`,label:`Expansionism`,width:`5em`,hidden:!0,mobileHidden:!0,sortBy:e=>e.expansionism||0},{key:`note`,width:`1.1em`},{key:`locate`,width:`1.1em`},{key:`lock`,width:`1.1em`},{key:`remove`,width:`1.4em`,permanent:!0}];function N(){return pack.religions.filter(e=>!e.removed&&!(e.i&&!e.cells&&!j.showExtinct))}var P=ue({getData:()=>w(O,N(),M),onUpdate:z});function F(){customization||(j=x.get(O,`filters`,()=>({showExtinct:!1})),ie(`#${O}, .stable`),g.show(`religions`),g.hide(`states`,`biomes`),g.hide(`cultures`,`provinces`),I(),R(),K(),P.reset(),$(`#${O}`).dialog({title:`Religions Editor`,resizable:!1,width:`fit-content`,close:je,position:A}))}function I(){re(`religionsEditor`);let e=`<div id="religionsEditor" class="dialog stable editorDialog">
    <div id="religionsBody" class="table" data-type="absolute">${ce({dialogId:O,columns:M})}</div>

    <div id="religionsFooter" class="totalLine">
      <div data-tip="Total number of organized religions" style="margin-left: 12px">
        Organized:&nbsp;<span id="religionsOrganized">0</span>
      </div>
      <div data-tip="Total number of heresies" style="margin-left: 12px">
        Heresies:&nbsp;<span id="religionsHeresies">0</span>
      </div>
      <div data-tip="Total number of cults" style="margin-left: 12px">
        Cults:&nbsp;<span id="religionsCults">0</span>
      </div>
      <div data-tip="Total number of folk religions" style="margin-left: 12px">
        Folk:&nbsp;<span id="religionsFolk">0</span>
      </div>
      <div data-tip="Total land area" style="margin-left: 12px" data-col="area">
        Land Area:&nbsp;<span id="religionsFooterArea">0</span>
      </div>
      <div data-tip="Total number of believers (population)" style="margin-left: 12px" data-col="population">
        Believers:&nbsp;<span id="religionsFooterPopulation">0</span>
      </div>
    </div>

    <div id="religionsBottom" class="editorToolbar">
      <button id="religionsEditorRefresh" data-tip="Refresh the Editor" class="icon-cw"></button>
      <button id="religionsEditStyle" data-tip="Edit religions style in Style Editor" class="icon-adjust"></button>
      <button id="religionsLegend" data-tip="Toggle Legend box" class="icon-list-bullet"></button>
      <button id="religionsPercentage" data-tip="Toggle percentage / absolute values display mode" class="icon-percent"></button>
      <button id="religionsHeirarchy" data-tip="Show religions hierarchy tree" class="icon-sitemap"></button>
      <button id="religionsExtinct" data-tip="Show/hide extinct religions (religions without cells)" class="icon-eye-off"></button>

      <button id="religionsManually" data-tip="Manually re-assign religions" class="icon-brush"></button>
      <button id="religionsAdd" data-tip="Add a new religion. Hold Shift to add multiple" class="icon-plus"></button>
      <button id="religionsExport" data-tip="Download religions-related data" class="icon-download"></button>
      <button id="religionsRecalculate" data-tip="Recalculate religions based on current values of growth-related attributes" class="icon-retweet"></button>
      <span
        data-tip="Allow religion center, extent, and expansionism changes to take an immediate effect"
        class="editorToolbarPanel"
      >
        <input id="religionsAutoChange" class="checkbox" type="checkbox" />
        <label for="religionsAutoChange" class="checkbox-label"><i>auto-apply changes</i></label>
      </span>
    </div>
  </div>`;t(`dialogs`).insertAdjacentHTML(`beforeend`,e),Y(),T(O,P.reset),E(O,({cellId:e})=>pack.cells.religion[e]),t(`religionsEditorRefresh`).addEventListener(`click`,L),le({dialogId:O,columns:M,onUpdate:()=>C(O,{width:`fit-content`,position:A})}),t(`religionsEditStyle`).addEventListener(`click`,()=>void S.StyleEditor.open(`religions`)),t(`religionsLegend`).addEventListener(`click`,Se),t(`religionsPercentage`).addEventListener(`click`,q),t(`religionsHeirarchy`).addEventListener(`click`,J),t(`religionsExtinct`).addEventListener(`click`,Ce),t(`religionsManually`).addEventListener(`click`,we),t(`religionsAdd`).addEventListener(`click`,Ee),t(`religionsExport`).addEventListener(`click`,Oe),t(`religionsRecalculate`).addEventListener(`click`,()=>Q(!0))}function L(){R(),P.refresh()}function R(){let{cells:e,religions:t,burgs:n}=pack;t.forEach(e=>{e.cells=e.area=e.rural=e.urban=0});for(let r of e.i){if(e.h[r]<20)continue;let i=e.religion[r];t[i].cells+=1,t[i].area+=e.area[r],t[i].rural+=e.pop[r];let a=e.burg[r];a&&(t[i].urban+=n[a].population)}}function z(e){let n=` ${u()}`,r=``,i=0,o=0;for(let t of e.all)i+=a(t.area??0),o+=s((t.rural??0)*options.map.units.population.scale+(t.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate);for(let t of e.rows){let e=a(t.area??0),i=(t.rural??0)*options.map.units.population.scale,o=(t.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate,c=s(i+o),l=`Believers: ${p(c)}; Rural areas: ${p(i)}; Urban areas: ${p(o)}. Click to change`;if(!t.i){r+=`<div
        class="states"
        data-id="${t.i}"
        data-name="${t.name}"
        data-color=""
        data-area="${e}"
        data-population="${c}"
        data-type=""
        data-form=""
        data-deity=""
        data-expansion=""
        data-expansionism=""
      >
        <svg width="9" height="9" class="placeholder" data-col="color"></svg>
        <input data-tip="Religion name. Click and type to change" class="religionName italic"
          value="${t.name}" autocorrect="off" spellcheck="false" data-col="name" />
        <select data-tip="Religion type" class="religionType placeholder" data-col="type">
          ${B(t.type)}
        </select>
        <input data-tip="Religion form" class="religionForm placeholder" value="" autocorrect="off" spellcheck="false" data-col="form" />
        <div data-col="deity">
          <span class="icon-arrows-cw placeholder"></span>
          <input class="religionDeity placeholder" value="" autocorrect="off" spellcheck="false" />
        </div>
        <div data-col="area">
          <span data-tip="Religion area" style="padding-right: 4px" class="icon-map-o"></span>
          <div data-tip="Religion area" class="religionArea">${p(e)+n}</div>
        </div>
        <div data-col="population">
          <span data-tip="${l}" class="icon-male"></span>
          <div data-tip="${l}" class="religionPopulation pointer">${p(c)}</div>
        </div>
        <div data-col="expansion">
          <span class="icon-resize-full-alt placeholder" style="padding-right: 2px"></span>
          <span class="religionExtent placeholder">n/a</span>
        </div>
        <div data-col="expansionism">
          <span class="icon-resize-full placeholder"></span>
          <input class="religionExpantion placeholder" disabled type="number" value="0" />
        </div>
        <div data-col="note"></div>
        <div data-col="locate"></div>
        <div data-col="lock"></div>
        <div data-col="remove"></div>
      </div>`;continue}r+=`<div
      class="states"
      data-id=${t.i}
      data-name="${t.name}"
      data-color="${t.color}"
      data-area=${e}
      data-population=${c}
      data-type="${t.type}"
      data-form="${t.form}"
      data-deity="${t.deity||``}"
      data-expansion="${t.expansion}"
      data-expansionism="${t.expansionism}"
    >
      <fill-box fill="${t.color}" data-col="color"></fill-box>
      <input data-tip="Religion name. Click and type to change" class="religionName"
        value="${t.name}" autocorrect="off" spellcheck="false" data-col="name" />
      <select data-tip="Religion type" class="religionType" data-col="type">
        ${B(t.type)}
      </select>
      <input data-tip="Religion form" class="religionForm"
        value="${t.form}" autocorrect="off" spellcheck="false" data-col="form" />
      <div data-col="deity">
        <span data-tip="Click to re-generate supreme deity" class="icon-arrows-cw pointer"></span>
        <input data-tip="Religion supreme deity" class="religionDeity"
          value="${t.deity||``}" autocorrect="off" spellcheck="false" />
      </div>
      <div data-col="area">
        <span data-tip="Religion area" style="padding-right: 4px" class="icon-map-o"></span>
        <div data-tip="Religion area" class="religionArea">${p(e)+n}</div>
      </div>
      <div data-col="population">
        <span data-tip="${l}" class="icon-male"></span>
        <div data-tip="${l}" class="religionPopulation pointer">${p(c)}</div>
      </div>
      ${V(t)}
      ${oe(`this religion`)}
      <span data-col="locate" data-tip="Locate the religion" class="icon-target"></span>
      <span data-col="lock" data-tip="Lock this religion" class="icon-lock${t.lock?``:`-open`}"></span>
      <span data-col="remove" data-tip="Remove religion" class="icon-trash-empty"></span>
    </div>`}let c=t(`religionsBody`);c.querySelectorAll(`:scope > .states`).forEach(e=>{e.remove()}),c.insertAdjacentHTML(`beforeend`,r);let l=pack.religions.filter(e=>e.i&&!e.removed);t(`religionsOrganized`).innerHTML=String(l.filter(e=>e.type===`Organized`).length),t(`religionsHeresies`).innerHTML=String(l.filter(e=>e.type===`Heresy`).length),t(`religionsCults`).innerHTML=String(l.filter(e=>e.type===`Cult`).length),t(`religionsFolk`).innerHTML=String(l.filter(e=>e.type===`Folk`).length),t(`religionsFooterArea`).innerHTML=p(i)+n,t(`religionsFooterPopulation`).innerHTML=p(o),t(`religionsFooterArea`).dataset.area=String(i),t(`religionsFooterPopulation`).dataset.population=String(o),D(t(`religionsFooter`),e,P.goto),t(`religionsBody`).querySelectorAll(`:scope > .states`).forEach(e=>{e.addEventListener(`mouseenter`,U),e.addEventListener(`mouseleave`,W)}),t(`religionsBody`).querySelectorAll(`fill-box`).forEach(e=>void e.addEventListener(`click`,de)),t(`religionsBody`).querySelectorAll(`div > input.religionName`).forEach(e=>void e.addEventListener(`input`,G)),t(`religionsBody`).querySelectorAll(`div > select.religionType`).forEach(e=>void e.addEventListener(`change`,fe)),t(`religionsBody`).querySelectorAll(`div > input.religionForm`).forEach(e=>void e.addEventListener(`input`,pe)),t(`religionsBody`).querySelectorAll(`div > input.religionDeity`).forEach(e=>void e.addEventListener(`input`,me)),t(`religionsBody`).querySelectorAll(`div > span.icon-arrows-cw`).forEach(e=>void e.addEventListener(`click`,he)),t(`religionsBody`).querySelectorAll(`div > div.religionPopulation`).forEach(e=>void e.addEventListener(`click`,ge)),t(`religionsBody`).querySelectorAll(`div > select.religionExtent`).forEach(e=>void e.addEventListener(`change`,_e)),t(`religionsBody`).querySelectorAll(`div > input.religionExpantion`).forEach(e=>void e.addEventListener(`change`,ve)),t(`religionsBody`).querySelectorAll(`div > span.icon-trash-empty`).forEach(e=>void e.addEventListener(`click`,ye)),t(`religionsBody`).querySelectorAll(`div > span.icon-book`).forEach(e=>void e.addEventListener(`click`,ke)),t(`religionsBody`).querySelectorAll(`div > span.icon-target`).forEach(e=>void e.addEventListener(`click`,Ae)),t(`religionsBody`).querySelectorAll(`div > span.icon-lock`).forEach(e=>void e.addEventListener(`click`,Z)),t(`religionsBody`).querySelectorAll(`div > span.icon-lock-open`).forEach(e=>void e.addEventListener(`click`,Z)),t(`religionsBody`).dataset.type===`percentage`&&(t(`religionsBody`).dataset.type=`absolute`,q()),C(O,{width:`fit-content`,position:A})}function B(e){let t=``;return[`Folk`,`Organized`,`Cult`,`Heresy`].forEach(n=>{t+=`<option ${e===n?`selected`:``} value="${n}">${n}</option>`}),t}function V(e){if(e.type===`Folk`){let e=`Folk religions are not competitive and do not expand. Initially they cover all cells of their parent culture, but get ousted by organized religions when they expand`;return`
      <div data-col="expansion">
        <span data-tip="${e}" class="icon-resize-full-alt" style="padding-right: 2px"></span>
        <span data-tip="${e}" class="religionExtent">culture</span>
      </div>
      <div data-col="expansionism">
        <span data-tip="${e}" class="icon-resize-full"></span>
        <input data-tip="${e}" class="religionExpantion" disabled type="number" value='0' />
      </div>`}return`
    <div data-col="expansion">
      <span data-tip="Potential religion extent" class="icon-resize-full-alt" style="padding-right: 2px"></span>
      <select data-tip="Potential religion extent" class="religionExtent">
        ${H(e.expansion)}
      </select>
    </div>
    <div data-col="expansionism">
      <span data-tip="Religion expansionism. Defines competitive size" class="icon-resize-full"></span>
      <input
        data-tip="Religion expansionism. Defines competitive size. Click to change, then click Recalculate to apply change"
        class="religionExpantion"
        type="number"
        min="0"
        max="99"
        step=".1"
        value=${e.expansionism}
      />
    </div>`}function H(e){let t=``;return[`global`,`state`,`culture`].forEach(n=>{t+=`<option ${e===n?`selected`:``} value="${n}">${n}</option>`}),t}var U=n(e=>{let n=Number(e.id||e.target.dataset.id),r=t(`religionsBody`).querySelector(`div[data-id='${n}']`);if(r&&r.classList.add(`active`),!g.isOn(`religions`)||customization)return;let i=o().duration(2e3).ease(v);l(`#relig`).select(`#religion${n}`).raise().transition(i).attr(`stroke-width`,2.5).attr(`stroke`,`#d0240f`),l(`#debug`).select(`#religionsCenter${n}`).raise().transition(i).attr(`r`,3).attr(`stroke`,`#d0240f`)},200);function W(e){let n=Number(e.id||e.target.dataset.id),r=t(`religionsBody`).querySelector(`div[data-id='${n}']`);r&&r.classList.remove(`active`),l(`#relig`).select(`#religion${n}`).transition().attr(`stroke-width`,null).attr(`stroke`,null),l(`#debug`).select(`#religionsCenter${n}`).transition().attr(`r`,2).attr(`stroke`,null)}function de(){let e=this.getAttribute(`fill`)||`#ffffff`,t=+this.parentNode.dataset.id;S.ColorPicker.open(e,e=>{this.fill=e,pack.religions[t].color=e,l(`#relig`).select(`#religion${t}`).attr(`fill`,e),l(`#debug`).select(`#religionsCenter${t}`).attr(`fill`,e)})}function G(){let e=+this.parentNode.dataset.id;this.parentNode.dataset.name=this.value,this.value.trim()&&Religions.rename(e,this.value)}function fe(){let e=+this.parentNode.dataset.id;this.parentNode.dataset.type=this.value,Religions.setType(e,this.value)}function pe(){let e=+this.parentNode.dataset.id;this.parentNode.dataset.form=this.value,this.value.trim()&&Religions.setForm(e,this.value)}function me(){let e=this.closest(`.states`),t=+e.dataset.id;e.dataset.deity=this.value,Religions.setDeity(t,this.value)}function he(){let e=this.closest(`.states`),t=+e.dataset.id,n=pack.religions[t].culture,r=Religions.getDeityName(n)??``;e.dataset.deity=r,pack.religions[t].deity=r,this.nextElementSibling.value=r}function ge(){let e=+this.closest(`.states`).dataset.id,n=pack.religions[e];if(!n.cells){b(`Religion does not have any cells, cannot change population`,!1,`error`);return}let r=s((n.rural??0)*options.map.units.population.scale),i=s((n.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate),a=r+i,o=e=>Number(e).toLocaleString(),c=pack.burgs.filter(t=>!t.removed&&pack.cells.religion[t.cell]===e);alertMessage.innerHTML=`<div>
    <i>All population of religion territory is considered believers of this religion. It means believers number change will directly affect population</i>
    <div style="margin: 0.5em 0">
      Rural: <input type="number" min="0" step="1" id="ruralPop" value=${r} style="width:6em" />
      Urban: <input type="number" min="0" step="1" id="urbanPop" value=${i} style="width:6em"
        ${c.length?``:`disabled`} />
    </div>
    <div>Total population: ${o(a)} ⇒ <span id="totalPop">${o(a)}</span>
      (<span id="totalPopPerc">100</span>%)
    </div>
  </div>`;let l=t(`ruralPop`),u=t(`urbanPop`),d=t(`totalPop`),p=t(`totalPopPerc`),m=()=>{let e=l.valueAsNumber+u.valueAsNumber;Number.isNaN(e)||(d.innerHTML=o(e),p.innerHTML=String(s(e/a*100)))};l.oninput=()=>m(),u.oninput=()=>m(),$(`#alert`).dialog({resizable:!1,title:`Change believers number`,width:`24em`,buttons:{Apply:function(){h(),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`}});function h(){try{Religions.setPopulation(e,+l.value||0,+u.value||0)}catch(e){b(f(e),!1,`error`);return}g.draw(`population`),L()}}function _e(){let e=this.closest(`.states`),t=+e.dataset.id;e.dataset.expansion=this.value,Religions.setExpansion(t,this.value),Q()}function ve(){let e=this.closest(`.states`),t=+e.dataset.id;e.dataset.expansionism=this.value,+this.value>=0&&+this.value<=99&&(Religions.setExpansionism(t,+this.value),Q())}function ye(){if(customization)return;let e=+this.closest(`.states`).dataset.id;ae({title:`Remove religion`,message:`Are you sure you want to remove the religion? <br>This action cannot be reverted`,confirm:`Remove`,onConfirm:()=>be(e)})}function be(e){l(`#relig`).select(`#religion${e}`).remove(),l(`#relig`).select(`#religion-gap${e}`).remove(),l(`#debug`).select(`#religionsCenter${e}`).remove(),Religions.remove(e),L()}function K(){let e=l(`#debug`);e.select(`#religionCenters`).remove();let t=e.append(`g`).attr(`id`,`religionCenters`).attr(`stroke-width`,.8).attr(`stroke`,`#444444`).style(`cursor`,`move`),n=pack.religions.filter(e=>e.i&&e.center&&!e.removed);j.showExtinct||(n=n.filter(e=>(e.cells??0)>0)),t.selectAll(`circle`).data(n).enter().append(`circle`).attr(`id`,e=>`religionsCenter${e.i}`).attr(`data-id`,e=>e.i).attr(`r`,2).attr(`fill`,e=>e.color).attr(`cx`,e=>pack.cells.p[e.center][0]).attr(`cy`,e=>pack.cells.p[e.center][1]).on(`mouseenter`,(e,t)=>{b(`${t.name}. Drag to move the religion center`,!0),U(e)}).on(`mouseleave`,e=>{b(``,!0),W(e)}).call(_().on(`start`,xe))}function xe(e){let t=+this.dataset.id,r=i(this.getAttribute(`transform`)),a=+r[0]-e.x,o=+r[1]-e.y;function s(e){let{x:n,y:r}=e;this.setAttribute(`transform`,`translate(${a+n},${o+r})`);let i=Pack.findCell(n,r);if(!(i==null||pack.cells.h[i]<20)){try{Religions.moveCenter(t,n,r)}catch(e){b(e instanceof Error?e.message:String(e),!1,`error`,2e3);return}Q()}}let c=n(s,50);e.on(`drag`,c)}function Se(){if(te(k)){h(k);return}let e=pack.religions.filter(e=>e.i&&!e.removed&&e.area).sort((e,t)=>(t.area??0)-(e.area??0)).map(e=>[e.i,e.color,e.name]);if(!e.length)return void b(`No religions to show`,!1,`error`);ee(k,e)}function q(){if(t(`religionsBody`).dataset.type===`absolute`){t(`religionsBody`).dataset.type=`percentage`;let e=+t(`religionsFooterArea`).dataset.area,n=+t(`religionsFooterPopulation`).dataset.population;t(`religionsBody`).querySelectorAll(`:scope > .states`).forEach(t=>{let{area:r,population:i}=t.dataset;t.querySelector(`.religionArea`).innerText=`${s(+r/e*100)}%`,t.querySelector(`.religionPopulation`).innerText=`${s(+i/n*100)}%`})}else t(`religionsBody`).dataset.type=`absolute`,P.refresh()}async function J(){customization||S.HierarchyTree.open({type:`religions`,data:pack.religions,onNodeEnter:U,onNodeLeave:W,getDescription:e=>{let{name:t,type:n,form:r,rural:i,urban:a}=e,o=()=>t.includes(n)||r.includes(n)?``:n===`Folk`||n===`Organized`?`. ${n} religion`:`. ${n}`,c=r===n?``:`. ${r}`,l=i*options.map.units.population.scale+a*options.map.units.population.scale*options.map.units.population.urbanization.rate,u=l>0?`${p(s(l))} people`:`Extinct`;return`${t}${o()}${c}. ${u}`},getShape:({type:e})=>{if(e===`Folk`)return`circle`;if(e===`Organized`)return`square`;if(e===`Cult`)return`hexagon`;if(e===`Heresy`)return`diamond`}})}function Ce(){j.showExtinct=!j.showExtinct,x.set(O,`filters`,j),Y(),P.reset(),K()}function Y(){t(`religionsBody`).dataset.extinct=j.showExtinct?`show`:`hide`,t(`religionsExtinct`).classList.toggle(`active`,j.showExtinct)}function we(){g.show(`religions`),S.PaintEditor.open({title:`Paint Religions`,parentDialogId:O,onClose:F,items:pack.religions.filter(e=>!e.removed&&(!e.i||e.cells)).map(e=>({id:e.i,name:e.name,color:e.color||`#ffffff`})),dontOverrideControl:!0,getValue:e=>pack.cells.religion[e],filterCell:e=>m(e,pack),onApply:Te})}function Te(e){for(let[t,n]of r(e))Religions.setCells(t,n);e.size&&(g.draw(`religions`),document.getElementById(O)&&L(),K())}function Ee(){if(this.classList.contains(`pressed`)){X();return}customization=8,this.classList.add(`pressed`),b(`Click on the map to add a new religion`,!0),l(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,De),t(`religionsBody`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.pointerEvents=`none`})}function X(){customization=0,se(),ne(),t(`religionsBody`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.removeProperty(`pointer-events`)});let e=t(`religionsAdd`);e.classList.contains(`pressed`)&&e.classList.remove(`pressed`)}function De(t){let[n,r]=e(t,this);try{Religions.add(n,r)}catch(e){b(f(e),!1,`error`);return}t.shiftKey===!1&&X(),g.draw(`religions`),L(),K()}function Oe(){let e=`Id,Name,Color,Type,Form,Supreme Deity,Area ${u(`2`)},Believers,Origins,Potential,Expansionism`,t=P.view().all.map(e=>{let t=a(e.area??0),n=s((e.rural??0)*options.map.units.population.scale+(e.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate),r=`"${e.deity||``}"`,i=`"${(e.origins??[]).filter(e=>!!e).map(e=>pack.religions[e].name).join(`, `)}"`;return[e.i,e.name,e.color??``,e.type??``,e.form??``,r,t,n,i,e.expansion??``,e.i?e.expansionism??``:``].join(`,`)});c([e].concat(t).join(`
`),`${d(`Religions`)}.csv`)}function ke(){let e=+this.closest(`.states`).dataset.id;S.NotesEditor.open({type:`religion`,id:e})}function Ae(){let e=+this.closest(`.states`).dataset.id,t=l(`#relig`).select(`#religion${e}`).node();t&&y(t,4)}function Z(){if(customization)return;let e=+this.closest(`.states`).dataset.id,t=this.classList;Religions.setLocked(e,!pack.religions[e].lock),t.toggle(`icon-lock-open`),t.toggle(`icon-lock`)}function Q(e){!e&&!t(`religionsAutoChange`).checked||(Religions.recalculate(),g.draw(`religions`),L(),K())}function je(){l(`#debug`).select(`#religionCenters`).remove(),customization===8&&X(),S.ColorPicker.close();let e=P.view();e.rows=[],e.all=[],$(`#religionsEditor`).dialog(`destroy`),t(`religionsEditor`).remove()}var Me={open:F,showHierarchy:J};export{Me as ReligionsEditor};