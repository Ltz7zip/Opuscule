import{Kn as e,L as t,P as n,U as r,Un as i,Xn as a,a as o,an as s,ar as c,at as l,it as u,jn as d,o as f,ot as p,qn as m,y as h,z as ee,zt as te}from"./utils-Dk4MDzbZ.js";import{U as ne,V as re,it as ie,t as g,z as ae}from"./layers-BpUy7Q_B.js";import{t as oe}from"./drag-Dc9_zdw7.js";import{t as se}from"./sin-DYm9hqTl.js";import{n as ce}from"./highlight-BA-X3wTZ.js";import{t as _}from"./emblems-generator-CFXxHBH0.js";import{i as v,t as le}from"./tooltips-3xx1wzLl.js";import{t as y}from"./controllers-C2OtiXZ_.js";import{n as b}from"./cultures-generator-BZQiuzLd.js";import{i as ue,l as x,n as de,r as fe,s as pe}from"./dialog-helpers-MF-Ear8n.js";import{t as me}from"./viewbox-events-bX9taDxt.js";import{i as he,r as ge}from"./index-BdCdSELe.js";import{t as _e}from"./highlighting-DOtPILkM.js";import{a as ve,i as ye,n as be,o as xe,r as Se}from"./table-BOwkVE_i.js";var S={},C={},w=34,T=10,E=13;function D(e){return Function(`d`,`return {`+e.map(function(e,t){return JSON.stringify(e)+`: d[`+t+`] || ""`}).join(`,`)+`}`)}function Ce(e,t){var n=D(e);return function(r,i){return t(n(r),i,e)}}function O(e){var t=Object.create(null),n=[];return e.forEach(function(e){for(var r in e)r in t||n.push(t[r]=r)}),n}function k(e,t){var n=e+``,r=n.length;return r<t?Array(t-r+1).join(0)+n:n}function we(e){return e<0?`-`+k(-e,6):e>9999?`+`+k(e,6):k(e,4)}function Te(e){var t=e.getUTCHours(),n=e.getUTCMinutes(),r=e.getUTCSeconds(),i=e.getUTCMilliseconds();return isNaN(e)?`Invalid Date`:we(e.getUTCFullYear(),4)+`-`+k(e.getUTCMonth()+1,2)+`-`+k(e.getUTCDate(),2)+(i?`T`+k(t,2)+`:`+k(n,2)+`:`+k(r,2)+`.`+k(i,3)+`Z`:r?`T`+k(t,2)+`:`+k(n,2)+`:`+k(r,2)+`Z`:n||t?`T`+k(t,2)+`:`+k(n,2)+`Z`:``)}function Ee(e){var t=RegExp(`["`+e+`
\r]`),n=e.charCodeAt(0);function r(e,t){var n,r,a=i(e,function(e,i){if(n)return n(e,i-1);r=e,n=t?Ce(e,t):D(e)});return a.columns=r||[],a}function i(e,t){var r=[],i=e.length,a=0,o=0,s,c=i<=0,l=!1;e.charCodeAt(i-1)===T&&--i,e.charCodeAt(i-1)===E&&--i;function u(){if(c)return C;if(l)return l=!1,S;var t,r=a,o;if(e.charCodeAt(r)===w){for(;a++<i&&e.charCodeAt(a)!==w||e.charCodeAt(++a)===w;);return(t=a)>=i?c=!0:(o=e.charCodeAt(a++))===T?l=!0:o===E&&(l=!0,e.charCodeAt(a)===T&&++a),e.slice(r+1,t-1).replace(/""/g,`"`)}for(;a<i;){if((o=e.charCodeAt(t=a++))===T)l=!0;else if(o===E)l=!0,e.charCodeAt(a)===T&&++a;else if(o!==n)continue;return e.slice(r,t)}return c=!0,e.slice(r,i)}for(;(s=u())!==C;){for(var d=[];s!==S&&s!==C;)d.push(s),s=u();t&&(d=t(d,o++))==null||r.push(d)}return r}function a(t,n){return t.map(function(t){return n.map(function(e){return u(t[e])}).join(e)})}function o(t,n){return n??=O(t),[n.map(u).join(e)].concat(a(t,n)).join(`
`)}function s(e,t){return t??=O(e),a(e,t).join(`
`)}function c(e){return e.map(l).join(`
`)}function l(t){return t.map(u).join(e)}function u(e){return e==null?``:e instanceof Date?Te(e):t.test(e+=``)?`"`+e.replace(/"/g,`""`)+`"`:e}return{parse:r,parseRows:i,format:o,formatBody:s,formatRows:c,formatRow:l,formatValue:u}}var A=Ee(`,`),De=A.parse;A.parseRows,A.format,A.formatBody,A.formatRows,A.formatRow,A.formatValue;var j=`culturesEditor`,M=`Cultures`,N={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},P=null,F=[{key:`color`,width:`1.2em`,permanent:!0},{key:`name`,label:`Culture`,width:`10em`,permanent:!0,sortBy:e=>e.name||``,sortType:`alpha`},{key:`type`,label:`Type`,width:`6em`,mobileHidden:!0,sortBy:e=>e.type||``,sortType:`alpha`},{key:`base`,label:`Namesbase`,width:`9em`,mobileHidden:!0,sortBy:e=>e.base},{key:`cells`,label:`Cells`,width:`5em`,hidden:!0,sortBy:e=>e.cells||0},{key:`expansionism`,label:`Expansion`,width:`5em`,hidden:!0,mobileHidden:!0,sortBy:e=>e.expansionism||0},{key:`area`,label:`Area`,width:`7em`,mobileHidden:!0,sortBy:e=>e.area||0},{key:`population`,label:`Population`,width:`6em`,defaultSort:`desc`,sortBy:e=>(e.rural||0)*options.map.units.population.scale+(e.urban||0)*options.map.units.population.scale*options.map.units.population.urbanization.rate},{key:`emblems`,label:`Emblems`,width:`7em`,hidden:!0,mobileHidden:!0,sortBy:e=>e.shield||``,sortType:`alpha`},{key:`note`,width:`1.1em`},{key:`locate`,width:`1.1em`},{key:`lock`,width:`1.1em`},{key:`remove`,width:`1.4em`,permanent:!0}],I=Se({getData:()=>he(j,pack.cultures.filter(e=>!e.removed),F),onUpdate:ke});function L(){customization||(de(`#${j}, .stable`),g.show(`cultures`),g.hide(`states`,`biomes`),g.hide(`religions`,`provinces`),Oe(),z(),q(),I.reset(),$(`#${j}`).dialog({title:`Cultures Editor`,resizable:!1,width:`fit-content`,close:Je,position:N}))}function Oe(){ue(`culturesEditor`);let e=`<div id="culturesEditor" class="dialog stable editorDialog">
    <div id="culturesBody" class="table" data-type="absolute">${ye({dialogId:j,columns:F})}</div>

    <div id="culturesFooter" class="totalLine">
      <div data-tip="Cultures number" style="margin-left: 12px">Cultures:&nbsp;<span id="culturesFooterCultures">0</span></div>
      <div data-tip="Total land cells number" style="margin-left: 12px" data-col="cells">Cells:&nbsp;<span id="culturesFooterCells">0</span></div>
      <div data-tip="Total land area" style="margin-left: 12px" data-col="area">Land Area:&nbsp;<span id="culturesFooterArea">0</span></div>
      <div data-tip="Total population" style="margin-left: 12px" data-col="population">Population:&nbsp;<span id="culturesFooterPopulation">0</span></div>
    </div>

    <div id="culturesBottom" class="editorToolbar">
      <button id="culturesEditorRefresh" data-tip="Refresh the Editor" class="icon-cw"></button>
      <button id="culturesEditStyle" data-tip="Edit cultures style in Style Editor" class="icon-adjust"></button>
      <button id="culturesLegend" data-tip="Toggle Legend box" class="icon-list-bullet"></button>
      <button id="culturesPercentage" data-tip="Toggle percentage / absolute values display mode" class="icon-percent"></button>
      <button id="culturesHeirarchy" data-tip="Show cultures hierarchy tree" class="icon-sitemap"></button>
      <button id="culturesManually" data-tip="Manually re-assign cultures" class="icon-brush"></button>
      <button id="culturesEditNamesBase" data-tip="Edit a database used for names generation" class="icon-font"></button>
      <button id="culturesAdd" data-tip="Add a new culture. Hold Shift to add multiple" class="icon-plus"></button>
      <button id="culturesExport" data-tip="Download cultures-related data" class="icon-download"></button>
      <button id="culturesImport" data-tip="Upload cultures-related data" class="icon-upload"></button>
      <button id="culturesRecalculate" data-tip="Recalculate cultures based on current values of growth-related attributes" class="icon-retweet"></button>
      <span
        data-tip="Allow culture centers, expansion and type changes to take an immediate effect"
        class="editorToolbarPanel"
        style="display: inline-flex"
      >
        <input id="culturesAutoChange" class="checkbox" type="checkbox" />
        <label for="culturesAutoChange" class="checkbox-label"><i>auto-apply changes</i></label>
      </span>
    </div>
  </div>`;n(`dialogs`).insertAdjacentHTML(`beforeend`,e),ge(j,I.reset),_e(j,({cellId:e})=>pack.cells.culture[e]),n(`culturesEditorRefresh`).addEventListener(`click`,R),be({dialogId:j,columns:F,onUpdate:()=>x(j,{width:`fit-content`,position:N})}),n(`culturesEditStyle`).addEventListener(`click`,()=>void y.StyleEditor.open(`cultures`)),n(`culturesLegend`).addEventListener(`click`,He),n(`culturesPercentage`).addEventListener(`click`,J),n(`culturesHeirarchy`).addEventListener(`click`,Y),n(`culturesRecalculate`).addEventListener(`click`,()=>X(!0)),n(`culturesManually`).addEventListener(`click`,Ue),n(`culturesEditNamesBase`).addEventListener(`click`,()=>y.NamesbaseEditor.open()),n(`culturesAdd`).addEventListener(`click`,Ge),n(`culturesExport`).addEventListener(`click`,qe),n(`culturesImport`).addEventListener(`click`,Ye)}function R(){z(),I.refresh(),q()}function z(){let{cells:e,cultures:t,burgs:n}=pack;t.forEach(e=>{e.cells=e.area=e.rural=e.urban=0});for(let r of e.i){if(e.h[r]<20)continue;let i=e.culture[r];t[i].cells+=1,t[i].area+=e.area[r],t[i].rural+=e.pop[r];let a=e.burg[r];a&&(t[i].urban+=n[a].population)}}function ke(e){let t=f(),r=``,i=0,a=0;for(let t of e.all)i+=o(t.area??0),a+=c((t.rural??0)*options.map.units.population.scale+(t.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate);for(let n of e.rows){let e=o(n.area??0),i=(n.rural??0)*options.map.units.population.scale,a=(n.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate,s=c(i+a),l=`Total population: ${h(s)}. Rural population: ${h(i)}. Urban population: ${h(a)}. Click to edit`;if(!n.i){r+=`<div
          class="states"
          data-id="${n.i}"
          data-name="${n.name}"
          data-color=""
          data-cells="${n.cells}"
          data-area="${e}"
          data-population="${s}"
          data-base="${n.base}"
          data-type=""
          data-expansionism=""
          data-emblems="${n.shield}"
        >
          <svg width="11" height="11" class="placeholder" data-col="color"></svg>
          <div data-col="name">
            <input data-tip="Neutral culture name. Click and type to change" class="cultureName italic"
              value="${n.name}" autocorrect="off" spellcheck="false" />
            <span class="icon-cw placeholder"></span>
          </div>
          <select class="cultureType placeholder" data-col="type">${B(n.type)}</select>
          <div data-col="base">
            <span data-tip="Click to re-generate names for burgs with this culture assigned" class="icon-arrows-cw"></span>
            <select data-tip="Culture namesbase. Click to change. Click on arrows to re-generate names"
              class="cultureBase">${V(n.base)}</select>
          </div>
          <div data-col="cells">
            <span data-tip="Cells count" class="icon-check-empty"></span>
            <div data-tip="Cells count" class="cultureCells">${n.cells}</div>
          </div>
          <div data-col="expansionism">
            <span class="icon-resize-full placeholder"></span>
            <input class="cultureExpan placeholder" type="number" />
          </div>
          <div data-col="area">
            <span data-tip="Culture area" class="icon-map-o"></span>
            <div data-tip="Culture area" class="cultureArea">${h(e)} ${t}</div>
          </div>
          <div data-col="population">
            <span data-tip="${l}" class="icon-male"></span>
            <div data-tip="${l}" class="culturePopulation pointer">${h(s)}</div>
          </div>
          <div data-col="emblems">${H(_.isDiversiform,n.shield)}</div>
          <div data-col="note"></div>
          <div data-col="locate"></div>
          <div data-col="lock"></div>
          <div data-col="remove"></div>
        </div>`;continue}r+=`<div
        class="states"
        data-id="${n.i}"
        data-name="${n.name}"
        data-color="${n.color}"
        data-cells="${n.cells}"
        data-area="${e}"
        data-population="${s}"
        data-base="${n.base}"
        data-type="${n.type}"
        data-expansionism="${n.expansionism}"
        data-emblems="${n.shield}"
      >
        <fill-box fill="${n.color}" data-col="color"></fill-box>
        <div data-col="name">
          <input data-tip="Culture name. Click and type to change" class="cultureName"
            value="${n.name}" autocorrect="off" spellcheck="false" />
          <span data-tip="Regenerate culture name" class="icon-cw hiddenIcon" style="visibility: hidden"></span>
        </div>
        <select data-tip="Culture type. Defines growth model. Click to change"
          class="cultureType" data-col="type">${B(n.type)}</select>
        <div data-col="base">
          <span data-tip="Click to re-generate names for burgs with this culture assigned" class="icon-arrows-cw"></span>
          <select data-tip="Culture namesbase. Click to change. Click on arrows to re-generate names"
            class="cultureBase">${V(n.base)}</select>
        </div>
        <div data-col="cells">
          <span data-tip="Cells count" class="icon-check-empty"></span>
          <div data-tip="Cells count" class="cultureCells">${n.cells}</div>
        </div>
        <div data-col="expansionism">
          <span data-tip="Culture expansionism. Defines competitive size" class="icon-resize-full"></span>
          <input
            data-tip="Culture expansionism. Defines competitive size. Click to change, then click Recalculate to apply change"
            class="cultureExpan"
            type="number"
            min="0"
            max="99"
            step=".1"
            value=${n.expansionism}
          />
        </div>
        <div data-col="area">
          <span data-tip="Culture area" class="icon-map-o"></span>
          <div data-tip="Culture area" class="cultureArea">${h(e)} ${t}</div>
        </div>
        <div data-col="population">
          <span data-tip="${l}" class="icon-male"></span>
          <div data-tip="${l}" class="culturePopulation pointer">${h(s)}</div>
        </div>
        <div data-col="emblems">${H(_.isDiversiform,n.shield)}</div>
        ${pe(`this culture`)}
        <span data-col="locate" data-tip="Locate the culture" class="icon-target"></span>
        <span data-col="lock" data-tip="Lock culture" class="icon-lock${n.lock?``:`-open`}"></span>
        <span data-col="remove" data-tip="Remove culture" class="icon-trash-empty"></span>
      </div>`}let s=n(`culturesBody`);s.querySelectorAll(`:scope > .states`).forEach(e=>{e.remove()}),s.insertAdjacentHTML(`beforeend`,r),n(`culturesFooterCultures`).innerHTML=String(pack.cultures.filter(e=>e.i&&!e.removed).length),n(`culturesFooterCells`).innerHTML=String(pack.cells.h.filter(e=>e>=20).length),n(`culturesFooterArea`).innerHTML=`${h(i)} ${t}`,n(`culturesFooterPopulation`).innerHTML=h(a),n(`culturesFooterArea`).dataset.area=String(i),n(`culturesFooterPopulation`).dataset.population=String(a),ve(n(`culturesFooter`),e,I.goto),n(`culturesBody`).querySelectorAll(`:scope > div.states`).forEach(e=>{e.addEventListener(`mouseenter`,U),e.addEventListener(`mouseleave`,W)}),n(`culturesBody`).querySelectorAll(`fill-box`).forEach(e=>void e.addEventListener(`click`,Ae)),n(`culturesBody`).querySelectorAll(`div > input.cultureName`).forEach(e=>void e.addEventListener(`input`,je)),n(`culturesBody`).querySelectorAll(`div > span.icon-cw`).forEach(e=>void e.addEventListener(`click`,G)),n(`culturesBody`).querySelectorAll(`div > input.cultureExpan`).forEach(e=>void e.addEventListener(`change`,Me)),n(`culturesBody`).querySelectorAll(`div > select.cultureType`).forEach(e=>void e.addEventListener(`change`,Ne)),n(`culturesBody`).querySelectorAll(`div > select.cultureBase`).forEach(e=>void e.addEventListener(`change`,Pe)),n(`culturesBody`).querySelectorAll(`div > select.cultureEmblems`).forEach(e=>void e.addEventListener(`change`,Fe)),n(`culturesBody`).querySelectorAll(`div > div.culturePopulation`).forEach(e=>void e.addEventListener(`click`,Ie)),n(`culturesBody`).querySelectorAll(`div > span.icon-arrows-cw`).forEach(e=>void e.addEventListener(`click`,Le)),n(`culturesBody`).querySelectorAll(`div > span.icon-book`).forEach(e=>void e.addEventListener(`click`,Re)),n(`culturesBody`).querySelectorAll(`div > span.icon-target`).forEach(e=>void e.addEventListener(`click`,ze)),n(`culturesBody`).querySelectorAll(`div > span.icon-trash-empty`).forEach(e=>void e.addEventListener(`click`,Be)),n(`culturesBody`).querySelectorAll(`div > span.icon-lock`).forEach(e=>void e.addEventListener(`click`,Q)),n(`culturesBody`).querySelectorAll(`div > span.icon-lock-open`).forEach(e=>void e.addEventListener(`click`,Q)),xe(j,_.isDiversiform?[]:[`emblems`]),n(`culturesBody`).dataset.type===`percentage`&&(n(`culturesBody`).dataset.type=`absolute`,J()),x(j,{width:`fit-content`,position:N})}function B(e){let t=``;return b.forEach(n=>{t+=`<option ${e===n?`selected`:``} value="${n}">${n}</option>`}),t}function V(e){let t=``;return Names.nameBases.forEach((n,r)=>{t+=`<option ${e===r?`selected`:``} value="${r}">${n.name}</option>`}),Names.nameBases[e]||(t+=`<option selected value="${e}">removed</option>`),t}function H(t,n){return t?`<select data-tip="Emblem shape associated with culture. Click to change" class="cultureEmblems">${Object.keys(_.shields.types).flatMap(e=>Object.keys(_.shields[e])).map(t=>`<option ${t===n?`selected`:``} value="${t}">${e(t)}</option>`)}</select>`:``}var U=r(e=>{let t=Number(e.id||e.target.dataset.id);if(!g.isOn(`cultures`)||customization)return;let n=s().duration(2e3).ease(se);d(`#cults`).select(`#culture${t}`).raise().transition(n).attr(`stroke-width`,2.5).attr(`stroke`,`#d0240f`),d(`#debug`).select(`#cultureCenter${t}`).raise().transition(n).attr(`r`,3).attr(`stroke`,`#d0240f`)},200);function W(e){let t=Number(e.id||e.target.dataset.id);g.isOn(`cultures`)&&(d(`#cults`).select(`#culture${t}`).transition().attr(`stroke-width`,null).attr(`stroke`,null),d(`#debug`).select(`#cultureCenter${t}`).transition().attr(`r`,2).attr(`stroke`,null))}function Ae(){let e=this.getAttribute(`fill`)||`#ffffff`,t=+this.parentNode.dataset.id;y.ColorPicker.open(e,e=>{this.fill=e,pack.cultures[t].color=e,d(`#cults`).select(`#culture${t}`).attr(`fill`,e),d(`#debug`).select(`#cultureCenter${t}`).attr(`fill`,e)})}function je(){let e=this.closest(`.states`),t=+e.dataset.id;e.dataset.name=this.value,this.value.trim()&&Cultures.rename(t,this.value)}function G(){let e=+this.closest(`.states`).dataset.id,t=pack.cultures[e].base;if(!Names.nameBases[t]){v(`Namesbase is not defined, please select a valid namesbase`,!1,`error`,5e3);return}let n=Names.getCultureShort(e);this.parentNode.querySelector(`input.cultureName`).value=n,Cultures.rename(e,n)}function Me(){let e=this.closest(`.states`),t=+e.dataset.id;e.dataset.expansionism=this.value,+this.value>=0&&+this.value<=99&&(Cultures.setExpansionism(t,+this.value),X())}function Ne(){let e=+this.parentNode.dataset.id;this.parentNode.dataset.type=this.value;let t=this.value;pack.cultures[e].type=t,X()}function Pe(){let e=this.closest(`.states`),t=+e.dataset.id,n=+this.value;Cultures.setBase(t,n),e.dataset.base=String(n)}function Fe(){let e=this.closest(`.states`),t=+e.dataset.id;Cultures.setEmblemShape(t,this.value),e.dataset.emblems=pack.cultures[t].shield;let n=(e,t)=>{let n=document.getElementById(e);!n||!t||(n.remove(),ie.trigger(e,t))};for(let e of pack.states)e.i&&e.culture===t&&n(`stateCOA${e.i}`,e.coa);for(let e of pack.provinces)e.i&&pack.cells.culture[e.center]===t&&n(`provinceCOA${e.i}`,e.coa);for(let e of pack.burgs)e?.i&&e.culture===t&&n(`burgCOA${e.i}`,e.coa)}function Ie(){let e=+this.closest(`.states`).dataset.id,t=pack.cultures[e];if(!t.cells){v(`Culture does not have any cells, cannot change population`,!1,`error`);return}let r=c((t.rural??0)*options.map.units.population.scale),i=c((t.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate),a=r+i,o=e=>Number(e).toLocaleString(),s=pack.burgs.filter(t=>!t.removed&&t.culture===e);alertMessage.innerHTML=`<div>
    <i>Change population of all cells assigned to the culture</i>
    <div style="margin: 0.5em 0">
      Rural: <input type="number" min="0" step="1" id="ruralPop" value=${r} style="width:6em" />
      Urban: <input type="number" min="0" step="1" id="urbanPop" value=${i} style="width:6em"
        ${s.length?``:`disabled`} />
    </div>
    <div>Total population: ${o(a)} ⇒ <span id="totalPop">${o(a)}</span>
      (<span id="totalPopPerc">100</span>%)
    </div>
  </div>`;let l=n(`ruralPop`),u=n(`urbanPop`),d=n(`totalPop`),f=n(`totalPopPerc`),p=()=>{let e=l.valueAsNumber+u.valueAsNumber;Number.isNaN(e)||(d.innerHTML=o(e),f.innerHTML=String(c(e/a*100)))};l.oninput=()=>p(),u.oninput=()=>p(),$(`#alert`).dialog({resizable:!1,title:`Change culture population`,width:`24em`,buttons:{Apply:function(){try{Cultures.setPopulation(e,+l.value||0,+u.value||0)}catch(e){v(m(e),!1,`error`);return}g.draw(`population`),R(),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`}})}function Le(){if(customization===4)return;let e=+this.closest(`.states`).dataset.id,t=pack.cultures[e].base;if(!Names.nameBases[t]){v(`Namesbase is not defined, please select a valid namesbase`,!1,`error`,5e3);return}let n=pack.burgs.filter(t=>t.culture===e&&!t.removed&&!t.lock);for(let t of n)Burgs.rename(t.i,Names.getCulture(e));g.draw(`labels`),v(`Names for ${n.length} burgs are regenerated`,!1,`success`)}function K(e){d(`#cults`).select(`#culture${e}`).remove(),d(`#debug`).select(`#cultureCenter${e}`).remove(),Cultures.remove(e),R()}function Re(){let e=+this.closest(`.states`).dataset.id;y.NotesEditor.open({type:`culture`,id:e})}function ze(){let e=+this.closest(`.states`).dataset.id;ce(d(`#cults`).select(`#culture${e}`).node(),4)}function Be(){if(customization)return;let e=+this.closest(`.states`).dataset.id;fe({title:`Remove culture`,message:`Are you sure you want to remove the culture? <br>This action cannot be reverted`,confirm:`Remove`,onConfirm:()=>K(e)})}function q(){let e=d(`#debug`);e.select(`#cultureCenters`).remove();let t=e.append(`g`).attr(`id`,`cultureCenters`).attr(`stroke-width`,.8).attr(`stroke`,`#444444`).style(`cursor`,`move`),r=pack.cultures.filter(e=>e.i&&!e.removed);t.selectAll(`circle`).data(r).enter().append(`circle`).attr(`id`,e=>`cultureCenter${e.i}`).attr(`data-id`,e=>e.i).attr(`r`,2).attr(`fill`,e=>e.color).attr(`cx`,e=>pack.cells.p[e.center][0]).attr(`cy`,e=>pack.cells.p[e.center][1]).on(`mouseenter`,(e,t)=>{v(`Drag to move the culture center (ancestral home)`,!0),n(`culturesBody`).querySelector(`div[data-id='${t.i}']`)?.classList.add(`selected`),U(e)}).on(`mouseleave`,(e,t)=>{v(``,!0),n(`culturesBody`).querySelector(`div[data-id='${t.i}']`)?.classList.remove(`selected`),W(e)}).call(oe().on(`start`,Ve))}function Ve(e){let t=+this.id.slice(13),n=a(this.getAttribute(`transform`)),i=+n[0]-e.x,o=+n[1]-e.y;function s(e){let{x:n,y:r}=e;this.setAttribute(`transform`,`translate(${i+n},${o+r})`);let a=Pack.findCell(n,r);if(!(a==null||pack.cells.h[a]<20)){try{Cultures.moveCenter(t,n,r)}catch(e){v(e instanceof Error?e.message:String(e),!1,`error`,2e3);return}X()}}let c=r(s,50);e.on(`drag`,c)}function He(){if(ne(M)){ae(M);return}let e=pack.cultures.filter(e=>e.i&&!e.removed&&e.cells).sort((e,t)=>(t.area??0)-(e.area??0)).map(e=>[e.i,e.color,e.name]);if(!e.length)return void v(`No cultures to show`,!1,`error`);re(M,e)}function J(){if(n(`culturesBody`).dataset.type===`absolute`){n(`culturesBody`).dataset.type=`percentage`;let e=+n(`culturesFooterCells`).innerText,t=+n(`culturesFooterArea`).dataset.area,r=+n(`culturesFooterPopulation`).dataset.population;n(`culturesBody`).querySelectorAll(`:scope > div.states`).forEach(n=>{let{cells:i,area:a,population:o}=n.dataset;n.querySelector(`.cultureCells`).innerText=`${c(+i/e*100)}%`,n.querySelector(`.cultureArea`).innerText=`${c(+a/t*100)}%`,n.querySelector(`.culturePopulation`).innerText=`${c(+o/r*100)}%`})}else n(`culturesBody`).dataset.type=`absolute`,I.refresh()}async function Y(){customization||y.HierarchyTree.open({type:`cultures`,data:pack.cultures,onNodeEnter:U,onNodeLeave:W,getDescription:e=>{let{name:t,type:n,rural:r,urban:i}=e,a=r*options.map.units.population.scale+i*options.map.units.population.scale*options.map.units.population.urbanization.rate;return`${t} culture. ${n}. ${a>0?`${h(c(a))} people`:`Extinct`}`},getShape:({type:e})=>{if(e===`Generic`)return`circle`;if(e===`River`)return`diamond`;if(e===`Lake`)return`hexagon`;if(e===`Naval`)return`square`;if(e===`Highland`)return`concave`;if(e===`Nomadic`)return`octagon`;if(e===`Hunting`)return`pentagon`}})}function X(e){(e||n(`culturesAutoChange`).checked)&&(Cultures.recalculate(),g.draw(`cultures`),R())}function Ue(){g.show(`cultures`),y.PaintEditor.open({title:`Paint Cultures`,parentDialogId:j,onClose:L,items:pack.cultures.filter(e=>!e.removed).map(e=>({id:e.i,name:e.name,color:e.color||`#ffffff`})),dontOverrideControl:!0,getValue:e=>pack.cells.culture[e],filterCell:e=>ee(e,pack),onApply:We})}function We(e){for(let[t,n]of i(e))Cultures.setCells(t,n);e.size&&(g.draw(`cultures`),document.getElementById(j)&&R())}function Ge(){if(this.classList.contains(`pressed`)){Z();return}customization=9,this.classList.add(`pressed`),v(`Click on the map to add a new culture`,!0),d(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,Ke),n(`culturesBody`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.pointerEvents=`none`})}function Z(){customization=0,me(),le(),n(`culturesBody`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.removeProperty(`pointer-events`)});let e=n(`culturesAdd`);e.classList.contains(`pressed`)&&e.classList.remove(`pressed`)}function Ke(e){let[n,r]=t(e,this);try{Cultures.add(n,r)}catch(e){v(m(e),!1,`error`);return}e.shiftKey===!1&&Z(),q(),I.refresh()}function qe(){let e=`Id,Name,Color,Cells,Expansionism,Type,Area ${f(`2`)},Population,Namesbase,Emblems Shape,Origins`,t=I.view().all.map(e=>{let t=o(e.area??0),n=c((e.rural??0)*options.map.units.population.scale+(e.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate),r=Names.nameBases[e.base].name,i=`"${(e.origins??[]).filter(e=>!!e).map(e=>pack.cultures[e].name).join(`, `)}"`;return[e.i,e.name,e.i&&e.color||``,e.cells||0,e.i?e.expansionism||0:``,e.i?e.type:``,t,n,r,e.shield,i].join(`,`)});l([e].concat(t).join(`
`),`${p(`Cultures`)}.csv`)}function Je(){d(`#debug #cultureCenters`).remove(),customization===9&&Z(),$(`#culturesEditor`).dialog(`destroy`),n(`culturesEditor`).remove()}function Ye(){P??=u(`.csv`),P.onchange=()=>void Xe.call(P),P.click()}async function Xe(){let e=this.files[0];this.value=``;let t=De(await e.text(),e=>({name:e.Name,i:+e.Id,color:e.Color,expansionism:+e.Expansionism,type:e.Type,population:+e.Population,emblemsShape:e[`Emblems Shape`],origins:e.Origins,namesbase:e.Namesbase})),{cultures:n,cells:r}=pack,i=Object.keys(_.shields.types).flatMap(e=>Object.keys(_.shields[e])),a=r.pop.map((e,t)=>e?t:null).filter(e=>e);n.forEach(e=>{e.i&&(e.removed=!0)});for(let e of t){let t;if(e.i<n.length){t=n[e.i],t.removed=!1;let r=t.urban*options.map.units.population.urbanization.rate,i=t.rural+r?r/(t.rural+r):0;if(e.population>=0)try{Cultures.setPopulation(e.i,e.population*(1-i),e.population*i)}catch{}}else t={i:n.length,center:te(a),area:0,cells:0,origins:[0],rural:0,urban:0},n.push(t);t.removed=!1,t.i&&e.name.trim()?Cultures.rename(t.i,e.name):t.name=e.name,t.i&&(t.color=e.color,t.expansionism=+e.expansionism,b.includes(e.type)?t.type=e.type:t.type=`Generic`),e.origins=t.i?r(e.origins||``):[null],t.shield=i.includes(e.emblemsShape)?e.emblemsShape:`heater`,t.base=Names.nameBases.findIndex(t=>t.name===e.namesbase);function r(e){let r=e.replaceAll(`"`,``).split(`,`).map(e=>e.trim()).filter(e=>e).map(e=>{let t=n.findIndex(t=>t.name===e);return t===-1?null:t});t.origins=r.filter(e=>e!==null),t.origins.length||(t.origins=[0])}}n.filter(e=>e.removed).forEach(e=>{K(e.i)}),g.draw(`cultures`),R()}function Q(){if(customization)return;let e=+this.closest(`.states`).dataset.id,t=this.classList;Cultures.setLocked(e,!pack.cultures[e].lock),t.toggle(`icon-lock-open`),t.toggle(`icon-lock`)}var Ze={open:L,showHierarchy:Y};export{Ze as CulturesEditor};