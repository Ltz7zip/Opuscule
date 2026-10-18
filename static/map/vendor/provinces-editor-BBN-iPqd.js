import{Bt as e,Gn as t,L as n,M as r,P as i,Un as a,a as o,an as s,ar as c,at as l,bt as u,et as d,jn as f,o as p,ot as m,qn as h,un as g,vn as _,y as v,z as y}from"./utils-Dk4MDzbZ.js";import{$ as b,a as x,et as S,it as C,o as w,t as T,tt as E}from"./layers-BpUy7Q_B.js";import{t as ee}from"./sin-DYm9hqTl.js";import{i as te,n as ne}from"./highlight-BA-X3wTZ.js";import{r as re,t as ie}from"./stratify-CGdiYggi.js";import{n as D,t as O}from"./constant-CUk6ox2a.js";import{i as k,t as ae}from"./tooltips-3xx1wzLl.js";import{t as A}from"./state-B2hBYDzv.js";import{t as j}from"./controllers-C2OtiXZ_.js";import{i as M,l as N,n as P,r as F,s as oe}from"./dialog-helpers-MF-Ear8n.js";import{t as se}from"./viewbox-events-bX9taDxt.js";import{i as ce,r as le}from"./index-BdCdSELe.js";import{t as ue}from"./highlighting-DOtPILkM.js";import{a as de,i as fe,n as pe,r as me}from"./table-BOwkVE_i.js";import{t as he}from"./annex-mode-TBBDNHih.js";function ge(e){e.x0=Math.round(e.x0),e.y0=Math.round(e.y0),e.x1=Math.round(e.x1),e.y1=Math.round(e.y1)}function _e(e,t,n,r,i){for(var a=e.children,o,s=-1,c=a.length,l=e.value&&(r-t)/e.value;++s<c;)o=a[s],o.y0=n,o.y1=i,o.x0=t,o.x1=t+=o.value*l}function ve(e,t,n,r,i){for(var a=e.children,o,s=-1,c=a.length,l=e.value&&(i-n)/e.value;++s<c;)o=a[s],o.x0=t,o.x1=r,o.y0=n,o.y1=n+=o.value*l}var ye=(1+Math.sqrt(5))/2;function be(e,t,n,r,i,a){for(var o=[],s=t.children,c,l,u=0,d=0,f=s.length,p,m,h=t.value,g,_,v,y,b,x,S;u<f;){p=i-n,m=a-r;do g=s[d++].value;while(!g&&d<f);for(_=v=g,x=Math.max(m/p,p/m)/(h*e),S=g*g*x,b=Math.max(v/S,S/_);d<f;++d){if(g+=l=s[d].value,l<_&&(_=l),l>v&&(v=l),S=g*g*x,y=Math.max(v/S,S/_),y>b){g-=l;break}b=y}o.push(c={value:g,dice:p<m,children:s.slice(u,d)}),c.dice?_e(c,n,r,i,h?r+=m*g/h:a):ve(c,n,r,h?n+=p*g/h:i,a),h-=g,u=d}return o}var xe=(function e(t){function n(e,n,r,i,a){be(t,e,n,r,i,a)}return n.ratio=function(t){return e((t=+t)>1?t:1)},n})(ye);function Se(){var e=xe,t=!1,n=1,r=1,i=[0],a=O,o=O,s=O,c=O,l=O;function u(e){return e.x0=e.y0=0,e.x1=n,e.y1=r,e.eachBefore(d),i=[0],t&&e.eachBefore(ge),e}function d(t){var n=i[t.depth],r=t.x0+n,u=t.y0+n,d=t.x1-n,f=t.y1-n;d<r&&(r=d=(r+d)/2),f<u&&(u=f=(u+f)/2),t.x0=r,t.y0=u,t.x1=d,t.y1=f,t.children&&(n=i[t.depth+1]=a(t)/2,r+=l(t)-n,u+=o(t)-n,d-=s(t)-n,f-=c(t)-n,d<r&&(r=d=(r+d)/2),f<u&&(u=f=(u+f)/2),e(t,r,u,d,f))}return u.round=function(e){return arguments.length?(t=!!e,u):t},u.size=function(e){return arguments.length?(n=+e[0],r=+e[1],u):[n,r]},u.tile=function(t){return arguments.length?(e=re(t),u):e},u.padding=function(e){return arguments.length?u.paddingInner(e).paddingOuter(e):u.paddingInner()},u.paddingInner=function(e){return arguments.length?(a=typeof e==`function`?e:D(+e),u):a},u.paddingOuter=function(e){return arguments.length?u.paddingTop(e).paddingRight(e).paddingBottom(e).paddingLeft(e):u.paddingTop()},u.paddingTop=function(e){return arguments.length?(o=typeof e==`function`?e:D(+e),u):o},u.paddingRight=function(e){return arguments.length?(s=typeof e==`function`?e:D(+e),u):s},u.paddingBottom=function(e){return arguments.length?(c=typeof e==`function`?e:D(+e),u):c},u.paddingLeft=function(e){return arguments.length?(l=typeof e==`function`?e:D(+e),u):l},u}var I=`provincesEditor`,L={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},R,z=e=>o(e.area),B=e=>c(e.rural*options.map.units.population.scale+e.urban*options.map.units.population.scale*options.map.units.population.urbanization.rate),V=[{key:`color`,width:`1.2em`,permanent:!0},{key:`name`,label:`Province`,width:`7em`,permanent:!0,sortBy:e=>e.name||``,sortType:`alpha`},{key:`emblem`,width:`1.4em`},{key:`form`,label:`Form`,width:`7em`,mobileHidden:!0,sortBy:e=>e.formName||``,sortType:`alpha`},{key:`capital`,label:`Capital`,width:`7em`,sortBy:e=>e.burg&&pack.burgs[e.burg]?.name||``,sortType:`alpha`},{key:`state`,label:`State`,width:`7em`,permanent:!0,sortBy:e=>pack.states[e.state]?.name||``,sortType:`alpha`},{key:`burgs`,label:`Burgs`,width:`5em`,mobileHidden:!0,sortBy:e=>e.burgs?.length||0},{key:`area`,label:`Area`,width:`7em`,mobileHidden:!0,defaultSort:`desc`,sortBy:z},{key:`population`,label:`Population`,width:`6em`,sortBy:B},{key:`note`,width:`1.1em`},{key:`independence`,width:`1.1em`},{key:`locate`,width:`1.1em`},{key:`focus`,width:`1.1em`},{key:`lock`,width:`1.1em`},{key:`remove`,width:`1.4em`,permanent:!0}],H=me({getData:K,onUpdate:Te});function U(){customization||(R=A.get(I,`filters`,()=>({stateId:1})),P(`#provincesEditor, .stable`),T.show(`provinces`,`borders`),T.hide(`states`,`cultures`),Ce(),W(),$(`#provincesEditor`).dialog({title:`Provinces Editor`,resizable:!1,width:`fit-content`,close:$e,position:L}))}function Ce(){M(`provincesEditor`);let e=`<div id="provincesEditor" class="dialog stable editorDialog">
      <div id="provincesBodySection" class="table" data-type="absolute">
        ${fe({dialogId:I,columns:V})}
      </div>
      <div id="provincesFooter" class="totalLine">
        <div data-tip="Provinces displayed" style="margin-left: 4px">
          Provinces:&nbsp;<span id="provincesFooterNumber">0</span>
        </div>
        <div data-tip="Total burgs number" style="margin-left: 12px" data-col="burgs">
          Burgs:&nbsp;<span id="provincesFooterBurgs">0</span>
        </div>
        <div data-tip="Average area" style="margin-left: 14px" data-col="area">
          Mean area:&nbsp;<span id="provincesFooterArea">0</span>
        </div>
        <div data-tip="Average population" style="margin-left: 14px" data-col="population">
          Mean population:&nbsp;<span id="provincesFooterPopulation">0</span>
        </div>
      </div>
      <div id="provincesBottom" class="editorToolbar">
        <button id="provincesEditorRefresh" data-tip="Refresh the Editor" class="icon-cw"></button>
        <button id="provincesEditStyle" data-tip="Edit provinces style in Style Editor" class="icon-adjust"></button>
        <button
          id="provincesRecolor"
          data-tip="Recolor listed provinces based on state color"
          class="icon-paint-roller"
        ></button>
        <button
          id="provincesPercentage"
          data-tip="Toggle percentage / absolute values views"
          class="icon-percent"
        ></button>
        <button id="provincesChart" data-tip="Show provinces chart" class="icon-chart-area"></button>
        <button
          id="provincesExport"
          data-tip="Save provinces-related data as a text file (.csv)"
          class="icon-download"
        ></button>
        <button id="provincesManually" data-tip="Manually re-assign provinces" class="icon-brush"></button>
        <button
          id="provincesRelease"
          data-tip="Release all provinces. It will make all provinces with burgs independent"
          class="icon-flag"
        ></button>
        <button
          id="provincesAdd"
          data-tip="Add a new province. Hold Shift to add multiple"
          class="icon-plus"
        ></button>
        <button id="provincesMerge" data-tip="Merge several provinces into one" class="icon-layer-group"></button>
        <button
          id="provincesAnnex"
          data-tip="Annex provinces: click the annexing province, then the provinces of the same state it absorbs. Hold Shift to keep annexing"
          class="icon-crown"
        ></button>
        <button
          id="provincesRemoveAll"
          data-tip="Remove all provinces. States will remain as they are"
          class="icon-trash"
        ></button>
        <span>State: </span>
        <select id="provincesFilterState"></select>
      </div>
    </div>`;i(`dialogs`).insertAdjacentHTML(`beforeend`,e),le(I,H.reset),pe({dialogId:I,columns:V,onUpdate:()=>N(I,{width:`fit-content`,position:L})}),ue(`provincesEditor`,({cellId:e})=>pack.cells.province[e]),i(`provincesEditorRefresh`).addEventListener(`click`,W),i(`provincesEditStyle`).addEventListener(`click`,()=>void j.StyleEditor.open(`provinces`)),i(`provincesFilterState`).addEventListener(`change`,e=>{R.stateId=+e.target.value,A.set(I,`filters`,R),H.reset()}),i(`provincesPercentage`).addEventListener(`click`,Ue),i(`provincesChart`).addEventListener(`click`,We),i(`provincesExport`).addEventListener(`click`,Ze),i(`provincesRemoveAll`).addEventListener(`click`,Qe),i(`provincesManually`).addEventListener(`click`,Ke),i(`provincesRelease`).addEventListener(`click`,Ge),i(`provincesAdd`).addEventListener(`click`,Je),i(`provincesMerge`).addEventListener(`click`,et),i(`provincesAnnex`).addEventListener(`click`,Q.toggle),i(`provincesRecolor`).addEventListener(`click`,Xe),i(`provincesBodySection`).addEventListener(`click`,e=>{if(customization)return;let t=e.target,n=t.classList,r=t.closest(`.states`);if(!r)return;let i=+r.dataset.id,a=pack.provinces[i].state;t.tagName===`FILL-BOX`?De(t):n.contains(`name`)?Pe(i):n.contains(`coaIcon`)?j.EmblemsEditor.open(`province`,`provinceCOA${i}`,pack.provinces[i]):n.contains(`icon-star-empty`)?Oe(i):n.contains(`icon-flag-empty`)?ke(i):n.contains(`icon-dot-circled`)?j.BurgsOverview.open({stateId:a}):n.contains(`culturePopulation`)?je(i):n.contains(`icon-target`)?ne(f(`#provs`).select(`#province${i}`).node(),8):n.contains(`icon-pin`)?Me(i,n):n.contains(`icon-book`)?j.NotesEditor.open({type:`province`,id:i}):n.contains(`icon-trash-empty`)?Ne(i):(n.contains(`icon-lock`)||n.contains(`icon-lock-open`))&&at(i,n)}),i(`provincesBodySection`).addEventListener(`change`,e=>{let t=e.target,n=t.classList,r=t.closest(`.states`);if(!r)return;let i=+r.dataset.id;n.contains(`cultureBase`)&&He(i,r,t.value)})}function W(){G(),we(),H.reset()}function G(){let{cells:e,provinces:t,burgs:n}=pack;t.forEach(e=>{!e.i||e.removed||(e.area=e.rural=e.urban=0,e.burgs=[],(e.burg&&!n[e.burg]||n[e.burg]?.removed)&&(e.burg=0))});for(let r of e.i){let i=e.province[r];i&&(t[i].area+=e.area[r],t[i].rural+=e.pop[r],e.burg[r]&&(t[i].urban+=n[e.burg[r]].population??0,t[i].burgs.push(e.burg[r])))}t.forEach(e=>{!e.i||e.removed||!e.burg&&e.burgs.length&&(e.burg=e.burgs[0])})}function we(){let e=i(`provincesFilterState`);R.stateId!==-1&&!pack.states.some(e=>e.i===R.stateId&&!e.removed)&&(R.stateId=-1),e.options.length=0,e.options.add(new Option(`all`,`-1`,!1,R.stateId===-1)),pack.states.filter(e=>e.i&&!e.removed).sort((e,t)=>e.name>t.name?1:-1).forEach(t=>{e.options.add(new Option(t.name,String(t.i),!1,t.i===R.stateId))}),A.set(I,`filters`,R)}function K(){let e=pack.provinces.filter(e=>e.i&&!e.removed);return ce(I,R.stateId===-1?e:e.filter(e=>e.state===R.stateId),V)}function Te(e){let t=i(`provincesBodySection`),n=` ${p()}`,r=e.all.reduce((e,t)=>({area:e.area+z(t),population:e.population+B(t),burgs:e.burgs+t.burgs.length}),{area:0,population:0,burgs:0}),a=t.dataset.type===`percentage`,o=e.rows.map(e=>{let t=z(e),i=e.rural*options.map.units.population.scale,o=e.urban*options.map.units.population.scale*options.map.units.population.urbanization.rate,s=B(e),l=`Total population: ${v(s)}; Rural population: ${v(i)}; Urban population: ${v(o)}`,u=pack.states[e.state].name,d=e.burg&&e.burg!==pack.states[e.state].capital,p=f(`#deftemp`).select(`#fog #focusProvince${e.i}`).size();return C.trigger(`provinceCOA${e.i}`,e.coa),`<div class="states" data-id=${e.i}>
      <fill-box data-col="color" fill="${e.color}"></fill-box>
      <input data-col="name" data-tip="Province name. Click to change" class="name pointer" value="${e.name}" readonly />
      <svg data-col="emblem" data-tip="Click to show and edit province emblem" class="coaIcon pointer" viewBox="0 0 200 200"><use href="#provinceCOA${e.i}"></use></svg>
      <input data-col="form" data-tip="Province form name. Click to change" class="name pointer" value="${e.formName}" readonly />
      <div data-col="capital">
        <span data-tip="Province capital. Click to zoom into view" class="icon-star-empty pointer ${e.burg?``:`placeholder`}"></span>
        <select data-tip="Province capital. Click to select from burgs within the state. No capital means the province is governed from the state capital" class="cultureBase ${e.burgs.length?``:`placeholder`}">${e.burgs.length?Ee(e.burgs,e.burg):``}</select>
      </div>
      <input data-col="state" data-tip="Province owner" class="provinceOwner" value="${u}" disabled>
      <div data-col="burgs">
        <span data-tip="Click to overview province burgs" class="icon-dot-circled pointer"></span>
        <span data-tip="Burgs count" class="provinceBurgs">${a?`${c(r.burgs?e.burgs.length/r.burgs*100:0)}%`:e.burgs.length}</span>
      </div>
      <div data-col="area">
        <span data-tip="Province area" class="icon-map-o" style="padding-right: 4px"></span>
        <span data-tip="Province area" class="biomeArea">${a?`${c(r.area?t/r.area*100:0)}%`:v(t)+n}</span>
      </div>
      <div data-col="population">
        <span data-tip="${l}" class="icon-male"></span>
        <span data-tip="${l}" class="culturePopulation">${a?`${c(r.population?s/r.population*100:0)}%`:v(s)}</span>
      </div>
      ${oe(`this province`)}
      <span data-col="independence" data-tip="Declare province independence (turn non-capital province with burgs into a new state)" class="icon-flag-empty ${d?``:`placeholder`}"></span>
      <span data-col="locate" data-tip="Locate the province" class="icon-target"></span>
      <span data-col="focus" data-tip="Toggle province focus" class="icon-pin ${p?``:` inactive`}"></span>
      <span data-col="lock" data-tip="Lock the province" class="icon-lock${e.lock?``:`-open`}"></span>
      <span data-col="remove" data-tip="Remove the province" class="icon-trash-empty"></span>
    </div>`}).join(``);t.querySelectorAll(`:scope > .states`).forEach(e=>{e.remove()}),t.insertAdjacentHTML(`beforeend`,o),i(`provincesFooterNumber`).innerHTML=String(e.all.length),i(`provincesFooterBurgs`).innerHTML=String(r.burgs),i(`provincesFooterArea`).innerHTML=e.all.length?v(r.area/e.all.length)+n:`0${n}`,i(`provincesFooterPopulation`).innerHTML=e.all.length?v(r.population/e.all.length):`0`,i(`provincesFooterArea`).dataset.area=String(r.area),i(`provincesFooterPopulation`).dataset.population=String(r.population),de(i(`provincesFooter`),e,H.goto),t.querySelectorAll(`div.states`).forEach(e=>{e.addEventListener(`mouseenter`,q),e.addEventListener(`mouseleave`,J)}),N(I,{width:`fit-content`,position:L})}function Ee(e,t){let n=``;return e.forEach(e=>{n+=`<option ${e===t?`selected`:``} value="${e}">${pack.burgs[e].name}</option>`}),n}function q(e){let t=+e.target.dataset.id,n=i(`provincesBodySection`).querySelector(`div[data-id='${t}']`);if(n&&n.classList.add(`active`),!T.isOn(`provinces`)||customization)return;let r=s().duration(2e3).ease(ee);f(`#provs`).select(`#province${t}`).raise().transition(r).attr(`stroke-width`,2.5).attr(`stroke`,`#d0240f`)}function J(e){let t=e.target?.dataset?.id?+e.target.dataset.id:null;if(t){let e=i(`provincesBodySection`).querySelector(`div[data-id='${t}']`);e&&e.classList.remove(`active`)}if(!T.isOn(`provinces`)||!t){f(`#debug`).selectAll(`.highlight`).remove();return}f(`#provs`).select(`#province${t}`).transition().attr(`stroke-width`,null).attr(`stroke`,null),f(`#debug`).selectAll(`.highlight`).remove()}function De(e){let t=e.getAttribute(`fill`),n=+e.closest(`.states`).dataset.id;j.ColorPicker.open(t,t=>{e.fill=t,pack.provinces[n].color=t,T.draw(`provinces`)})}function Oe(e){let t=pack.provinces[e].burg,{x:n,y:r}=pack.burgs[t];zoomTo(n,r,8,2e3)}function ke(e){F({title:`Declare independence`,message:`Are you sure you want to declare province independence? <br>It will turn province into a new state`,confirm:`Declare`,onConfirm:()=>{let t=Y(e);if(!t)return;let[n,r]=t;Ae([n],[r])}})}function Y(e){let t=pack.provinces[e].state;try{let n=Provinces.declareIndependence(e);return E(`province`,e),[t,n]}catch(e){k(h(e),!1,`error`)}}function Ae(e,n){let r=t([...e,...n]);T.hide(`provinces`),T.show(`states`,`borders`),T.draw(`burgIcons`,`labels`),S(r.map(e=>[`state`,e])),w(),P(),j.StatesEditor.open()}function je(e){let t=pack.provinces[e];if(!pack.cells.i.filter(t=>pack.cells.province[t]===e).length){k(`Province does not have any cells, cannot change population`,!1,`error`);return}let n=c(t.rural*options.map.units.population.scale),r=c(t.urban*options.map.units.population.scale*options.map.units.population.urbanization.rate),a=n+r,o=e=>Number(e).toLocaleString();alertMessage.innerHTML=` Rural: <input type="number" min="0" step="1" id="ruralPop" value=${n} style="width:6em" /> Urban:
    <input type="number" min="0" step="1" id="urbanPop" value=${r} style="width:6em" ${t.burgs.length?``:`disabled`} />
    <p>Total population: ${o(a)} ⇒ <span id="totalPop">${o(a)}</span> (<span id="totalPopPerc">100</span>%)</p>`;let s=i(`ruralPop`),l=i(`urbanPop`),u=()=>{let e=s.valueAsNumber+l.valueAsNumber;Number.isNaN(e)||(i(`totalPop`).innerHTML=o(e),i(`totalPopPerc`).innerHTML=String(c(e/a*100)))};s.oninput=()=>u(),l.oninput=()=>u(),$(`#alert`).dialog({resizable:!1,title:`Change province population`,width:`24em`,buttons:{Apply:function(){d(),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`}});function d(){try{Provinces.setPopulation(e,+s.value||0,+l.value||0)}catch(e){k(h(e),!1,`error`);return}T.draw(`population`),W()}}function Me(e,t){let n=f(`#provs`).select(`#province${e}`).attr(`d`),r=`focusProvince${e}`;t.contains(`inactive`)?x(r,n):w(r),t.toggle(`inactive`)}function Ne(e){alertMessage.innerHTML=`Are you sure you want to remove the province? <br />This action cannot be reverted`,$(`#alert`).dialog({resizable:!1,title:`Remove province`,buttons:{Remove:function(){Provinces.remove(e),w(`focusProvince${e}`),E(`province`,e);let t=f(`#provs`).select(`#provincesBody`);t.select(`#province${e}`).remove(),t.select(`#province-gap${e}`).remove(),T.draw(`borders`),T.draw(`labels`),W(),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}}})}function Pe(e){Fe();let t=pack.provinces[e];i(`provinceNameEditor`).dataset.province=String(e),i(`provinceNameEditorShort`).value=t.name,r(i(`provinceNameEditorSelectForm`),t.formName),i(`provinceNameEditorFull`).value=t.fullName;let n=pack.cells.culture[t.center];i(`provinceCultureDisplay`).innerText=pack.cultures[n].name,$(`#provinceNameEditor`).dialog({resizable:!1,title:`Change province name`,buttons:{Apply:function(){Ve(t),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`},close:Ie})}function Fe(){M(`provinceNameEditor`),i(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="provinceNameEditor" class="dialog" data-province="0">
      <div>
        <div data-tip="Province short name" class="label">Short name:</div>
        <input
          id="provinceNameEditorShort"
          data-tip="Type to change the short name"
          autocorrect="off"
          spellcheck="false"
          style="width: 11em"
        />
        <span id="provinceNameEditorShortSpeak" data-tip="Speak the name. You can change voice and language in options" class="speaker">🔊</span>
        <span
          id="provinceNameEditorShortCulture"
          data-tip="Generate culture-specific name for the province"
          class="icon-book pointer"
        ></span>
        <span id="provinceNameEditorShortRandom" data-tip="Generate random name" class="icon-globe pointer"></span>
      </div>
      <div data-tip="Select form name">
        <div data-tip="Province form name" class="label">Form name:</div>
        <select id="provinceNameEditorSelectForm" style="display: inline-block; width: 11em; height: 1.645em">
          <option value="">blank</option>
          <option value="Area">Area</option>
          <option value="Autonomy">Autonomy</option>
          <option value="Barony">Barony</option>
          <option value="Canton">Canton</option>
          <option value="Captaincy">Captaincy</option>
          <option value="Chiefdom">Chiefdom</option>
          <option value="Clan">Clan</option>
          <option value="Colony">Colony</option>
          <option value="Council">Council</option>
          <option value="County">County</option>
          <option value="Deanery">Deanery</option>
          <option value="Department">Department</option>
          <option value="Dependency">Dependency</option>
          <option value="Diaconate">Diaconate</option>
          <option value="District">District</option>
          <option value="Earldom">Earldom</option>
          <option value="Governorate">Governorate</option>
          <option value="Island">Island</option>
          <option value="Islands">Islands</option>
          <option value="Land">Land</option>
          <option value="Landgrave">Landgrave</option>
          <option value="Mandate">Mandate</option>
          <option value="Margrave">Margrave</option>
          <option value="Municipality">Municipality</option>
          <option value="Occupation zone">Occupation zone</option>
          <option value="Parish">Parish</option>
          <option value="Prefecture">Prefecture</option>
          <option value="Province">Province</option>
          <option value="Region">Region</option>
          <option value="Republic">Republic</option>
          <option value="Reservation">Reservation</option>
          <option value="Seneschalty">Seneschalty</option>
          <option value="Shire">Shire</option>
          <option value="State">State</option>
          <option value="Territory">Territory</option>
          <option value="Tribe">Tribe</option>
        </select>
        <input
          id="provinceNameEditorCustomForm"
          placeholder="type form name"
          data-tip="Create custom province form name"
          style="display: none; width: 11em"
        />
        <span
          id="provinceNameEditorAddForm"
          data-tip="Click to add custom province form name to the list"
          class="icon-plus pointer"
        ></span>
      </div>
      <div>
        <div data-tip="Province full name" class="label">Full name:</div>
        <input
          id="provinceNameEditorFull"
          data-tip="Type to change the full name"
          autocorrect="off"
          spellcheck="false"
          style="width: 11em"
        />
        <span id="provinceNameEditorFullSpeak" data-tip="Speak the name. You can change voice and language in options" class="speaker">🔊</span>
        <span
          id="provinceNameEditorFullRegenerate"
          data-tip="Click to re-generate full name"
          class="icon-arrows-cw pointer"
        ></span>
      </div>
      <div
        id="provinceCultureName"
        data-tip="Dominant culture in the province. This defines culture-based naming. Can be changed via the Cultures Editor"
        style="margin-top: 0.2em"
      >
        Dominant culture:&nbsp;<span id="provinceCultureDisplay"></span>
      </div>
    </div>`),i(`provinceNameEditorShortCulture`).addEventListener(`click`,Le),i(`provinceNameEditorShortRandom`).addEventListener(`click`,Re),i(`provinceNameEditorShortSpeak`).addEventListener(`click`,()=>d(i(`provinceNameEditorShort`).value)),i(`provinceNameEditorAddForm`).addEventListener(`click`,ze),i(`provinceNameEditorFullRegenerate`).addEventListener(`click`,Be),i(`provinceNameEditorFullSpeak`).addEventListener(`click`,()=>d(i(`provinceNameEditorFull`).value))}function Ie(){$(`#provinceNameEditor`).dialog(`destroy`),i(`provinceNameEditor`).remove()}function Le(){let e=+i(`provinceNameEditor`).dataset.province,t=pack.cells.culture[pack.provinces[e].center],n=Names.getState(Names.getCultureShort(t),t);i(`provinceNameEditorShort`).value=n}function Re(){let t=e(Names.nameBases.length-1),n=Names.getState(Names.getBase(t),void 0,t);i(`provinceNameEditorShort`).value=n}function ze(){let e=i(`provinceNameEditorCustomForm`),t=i(`provinceNameEditorSelectForm`),n=e.value,a=e.style.display===`inline-block`;e.style.display=a?`none`:`inline-block`,t.style.display=a?`inline-block`:`none`,a&&r(t,n)}function Be(){let e=i(`provinceNameEditorShort`).value,t=i(`provinceNameEditorSelectForm`).value,n=()=>t?!e&&t?`The ${t}`:`${e} ${t}`:e;i(`provinceNameEditorFull`).value=n()}function Ve(e){let t=i(`provinceNameEditorShort`).value.trim(),n=i(`provinceNameEditorSelectForm`).value,r=i(`provinceNameEditorFull`).value.trim(),a=e.fullName;t&&t!==e.name&&Provinces.rename(e.i,t),n!==(e.formName??``)&&Provinces.setForm(e.i,n),r&&r!==a&&Provinces.setFullName(e.i,r),T.draw(`provinces`),T.draw(`labels`),W()}function He(e,t,n){Provinces.setCapital(e,+n),t.dataset.capital=pack.burgs[+n].name}function Ue(){let e=i(`provincesBodySection`);e.dataset.type=e.dataset.type===`absolute`?`percentage`:`absolute`,H.refresh()}function We(){G();let e=e=>!e.i||e.removed||e.color[0]!==`#`?`#666`:String(_(e.color).darker()),t=pack.states.map(t=>({id:t.i,state:t.i?0:null,color:e(t)})),n=pack.provinces.filter(e=>e.i&&!e.removed).map(e=>({id:e.i+t.length-1,i:e.i,state:e.state,color:e.color,name:e.name,fullName:e.fullName,area:e.area,urban:e.urban,rural:e.rural})),r=[...t,...n],a=ie().parentId(e=>e.state)(r).sum(e=>e.area),s=+i(`uiSize`).value,l=300+300*s,u=90+90*s,d={top:10,right:10,bottom:0,left:10},m=l-d.left-d.right,h=u-d.top-d.bottom,g=Se().size([m,h]).padding(2);alertMessage.innerHTML=`<select id="provincesTreeType" style="display:block; margin-left:13px; font-size:11px">
    <option value="area" selected>Area</option>
    <option value="population">Total population</option>
    <option value="rural">Rural population</option>
    <option value="urban">Urban population</option>
  </select>`,alertMessage.innerHTML+=`<div id='provinceInfo' class='chartInfo'>&#8205;</div>`;let y=f(`#alertMessage`).insert(`svg`,`#provinceInfo`).attr(`id`,`provincesTree`).attr(`width`,l).attr(`height`,u).attr(`font-size`,`10px`).append(`g`).attr(`transform`,`translate(10, 0)`);i(`provincesTreeType`).addEventListener(`change`,w),g(a);let b=y.selectAll(`g`).data(a.leaves()).enter().append(`g`).attr(`data-id`,e=>e.data.i).on(`mouseenter`,(e,t)=>x(e,t)).on(`mouseleave`,e=>S(e));function x(e,t){f(e.currentTarget).select(`rect`).classed(`selected`,!0);let n=t.data.fullName,r=pack.states[t.data.state].fullName,a=`${o(t.data.area)} ${p()}`,s=c(t.data.rural*options.map.units.population.scale),l=c(t.data.urban*options.map.units.population.scale*options.map.units.population.urbanization.rate),u=i(`provincesTreeType`).value,d=u===`area`?`Area: ${a}`:u===`rural`?`Rural population: ${v(s)}`:u===`urban`?`Urban population: ${v(l)}`:`Population: ${v(s+l)}`;i(`provinceInfo`).innerHTML=`${n}. ${r}. ${d}`,q(e)}function S(e){J(e),document.getElementById(`provinceInfo`)&&(i(`provinceInfo`).innerHTML=`&#8205;`,f(e.currentTarget).select(`rect`).classed(`selected`,!1))}b.append(`rect`).attr(`stroke`,e=>e.parent.data.color).attr(`stroke-width`,1).attr(`fill`,e=>e.data.color).attr(`x`,e=>e.x0).attr(`y`,e=>e.y0).attr(`width`,e=>e.x1-e.x0).attr(`height`,e=>e.y1-e.y0),b.append(`text`).attr(`text-rendering`,`optimizeSpeed`).attr(`dx`,`.2em`).attr(`dy`,`1em`).attr(`x`,e=>e.x0).attr(`y`,e=>e.y0);function C(){b.select(`text`).each(function(e){this.innerHTML=e.data.name;let t=this.getBBox();t.y+t.height>e.y1+1&&(this.innerHTML=``);for(let n=0;n<15&&t.width>0&&t.x+t.width>e.x1;n++){if(this.innerHTML.length<3){this.innerHTML=``;break}this.innerHTML=`${this.innerHTML.slice(0,-2)}…`,t=this.getBBox()}})}function w(){let e=this.value===`area`?e=>e.area:this.value===`rural`?e=>e.rural:this.value===`urban`?e=>e.urban:e=>e.rural+e.urban;a.sum(e),b.data(g(a).leaves()),b.select(`rect`).transition().duration(1500).attr(`x`,e=>e.x0).attr(`y`,e=>e.y0).attr(`width`,e=>e.x1-e.x0).attr(`height`,e=>e.y1-e.y0),b.select(`text`).transition().duration(1500).attr(`x`,e=>e.x0).attr(`y`,e=>e.y0),setTimeout(C,2e3)}$(`#alert`).dialog({title:`Provinces chart`,width:`fit-content`,position:{my:`left bottom`,at:`left+10 bottom-10`,of:`svg`},buttons:{},close:()=>{alertMessage.innerHTML=``}}),C()}function Ge(){F({title:`Release provinces`,message:`Are you sure you want to release all provinces?
        </br>It will turn all separable provinces into independent states.
        </br>Capital province and provinces without any burgs will state as they are`,confirm:`Release`,onConfirm:()=>{let e=[],n=[];K().forEach(t=>{if(!t.burg||t.burg===pack.states[t.state].capital||t.burgs.some(e=>pack.burgs[e].capital))return;let r=Y(t.i);r&&(e.push(r[0]),n.push(r[1]))}),Ae(t(e),n)}})}function Ke(){T.show(`provinces`,`borders`),j.PaintEditor.open({title:`Paint Provinces`,parentDialogId:I,onClose:U,items:K().map(e=>({id:e.i,name:e.name,color:e.color||`#ffffff`})),getValue:e=>pack.cells.province[e],filterCell:(e,t,n)=>!y(e,pack)||!pack.cells.state[e]||pack.cells.state[e]!==pack.provinces[n].state?!1:!t||e!==pack.provinces[t].center?!0:(k(`Province center cannot be assigned to a different region. Please remove the province first`,!1,`error`),!1),dontOverrideControl:!0,onApply:qe})}function qe(e){for(let[t,n]of a(e))Provinces.setCells(t,n);T.draw(`borders`,`provinces`),T.draw(`labels`),document.getElementById(I)&&W()}function Je(){if(this.classList.contains(`pressed`)){X();return}customization=12,this.classList.add(`pressed`),k(`Click on the map to place a new province center`,!0),f(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,Ye),i(`provincesBodySection`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.pointerEvents=`none`})}function Ye(e){let[t,r]=n(e,this),a;try{a=Provinces.add(t,r)}catch(e){k(h(e),!1,`error`);return}e.shiftKey===!1&&X(),b(`province`,a),T.draw(`borders`,`provinces`,`labels`),G(),R.stateId=pack.provinces[a].state,A.set(I,`filters`,R),i(`provincesFilterState`).value=String(R.stateId),H.reset()}function X(){customization=0,se(),ae(),i(`provincesBodySection`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.removeProperty(`pointer-events`)});let e=i(`provincesAdd`);e.classList.contains(`pressed`)&&e.classList.remove(`pressed`)}function Xe(){let e=R.stateId;pack.provinces.forEach(t=>{if(!t||t.removed||e!==-1&&t.state!==e)return;let n=pack.states[t.state].color,r=u();t.color=n[0]===`#`?_(g(n,r)(.2)).hex():r}),T.draw(`provinces`),H.refresh()}function Ze(){let e=`Id,Province,Full Name,Form,State,Color,Capital,Area ${options.map.units.area.unit===`square`?`${options.map.units.distance.unit}2`:options.map.units.area.unit},Total Population,Rural Population,Urban Population,Burgs\n`;for(let t of K()){let n=t.burg?pack.burgs[t.burg].name:``;e+=`${t.i},${t.name},${t.fullName},${t.formName},${pack.states[t.state].name},${t.color},${n},${z(t)},${B(t)},${Math.round(t.rural*options.map.units.population.scale)},${Math.round(t.urban*options.map.units.population.scale*options.map.units.population.urbanization.rate)},${t.burgs.length}\n`}let t=`${m(`Provinces`)}.csv`;l(e,t)}function Qe(){alertMessage.innerHTML=`Are you sure you want to remove all provinces? <br />This action cannot be reverted`,$(`#alert`).dialog({resizable:!1,title:`Remove all provinces`,buttons:{Remove:function(){$(this).dialog(`close`),pack.provinces.forEach(e=>{e.i&&E(`province`,e.i)}),pack.provinces=[0],pack.cells.province=new Uint16Array(pack.cells.i.length),pack.states.forEach(e=>{e.provinces=[]}),w(),T.draw(`borders`),f(`#provs`).select(`#provincesBody`).remove(),T.hide(`provinces`),T.draw(`labels`),H.reset()},Cancel:function(){$(this).dialog(`close`)}}})}function $e(){customization===12&&X(),Q.exit(),j.ColorPicker.close();let e=H.view();e.rows=[],e.all=[],$(`#provincesEditor`).dialog(`destroy`),i(`provincesEditor`).remove()}function et(){let e=R.stateId;if(e===-1){alertMessage.innerHTML=`Please select a specific state from the filter to merge provinces within that state.`,$(`#alert`).dialog({title:`Merge Provinces`,buttons:{OK:function(){$(this).dialog(`close`)}}});return}let t=pack.provinces.filter(t=>t.i&&!t.removed&&t.state===e);if(t.length<2){alertMessage.innerHTML=`Not enough provinces in the selected state to merge.`,$(`#alert`).dialog({title:`Merge Provinces`,buttons:{OK:function(){$(this).dialog(`close`)}}});return}let n=t.map(e=>`
    <div data-id="${e.i}" data-tip="${e.fullName||e.name}" style="cursor:default">
      <input type="radio" name="rulingProvince" value="${e.i}" />
      <input id="selectProvince${e.i}" class="checkbox" type="checkbox" name="provincesToMerge" value="${e.i}" />
      <label for="selectProvince${e.i}" class="checkbox-label"><fill-box fill="${e.color}" disabled></fill-box>${Z(e.i)}${e.name}</label>
    </div>
  `).join(``);alertMessage.innerHTML=`
    <form id='mergeProvincesForm' style="overflow: hidden; display: flex; flex-direction: column; gap: 1em;">
      <p style="margin:0">
        Check the <b>checkbox</b> next to each province you want to merge.
        Use the <b>radio button</b> to pick the <em>primary province</em> that will absorb all others.
        Hover over a row to highlight the province on the map.
      </p>
      <main style='display: grid; grid-template-columns: 1fr 1fr; gap: .3em;'>
        ${n}
      </main>
    </form>
  `,i(`mergeProvincesForm`).querySelectorAll(`div[data-id]`).forEach(e=>{e.addEventListener(`mouseenter`,nt),e.addEventListener(`mouseleave`,J)}),$(`#alert`).dialog({width:600,title:`Merge provinces`,close:J,buttons:{Merge:function(){let e=new FormData(i(`mergeProvincesForm`)),t=Number(e.get(`rulingProvince`));if(!t){k(`Please select a province to merge into`,!1,`error`);return}let n=e.getAll(`provincesToMerge`).map(Number).filter(e=>e!==t);if(!n.length){k(`Please select several provinces to merge`,!1,`error`);return}tt(n,t,()=>$(this).dialog(`close`))},Cancel:function(){$(this).dialog(`close`)}}})}var Z=e=>`<svg class="coaIcon" viewBox="0 0 200 200"><use href="#provinceCOA${e}"></use></svg>`;function tt(e,t,n){F({title:`Merge provinces`,message:`
      <p>The following provinces will be <strong>removed</strong>: ${e.map(e=>`${Z(e)}${pack.provinces[e].name}`).join(`, `)}.</p>
      <p>Removed provinces data (burgs and cells) will be assigned to ${Z(t)}${pack.provinces[t].name}.</p>
      <p>Are you sure you want to merge provinces? This action cannot be reverted.</p>`,confirm:`Merge`,onConfirm:()=>{it(e,t),n?.()}})}var Q=he({buttonId:`provincesAnnex`,bodySectionId:`provincesBodySection`,noun:`province`,ownerOf:e=>pack.cells.province[e],colorOf:e=>pack.provinces[e].color,nameOf:e=>pack.provinces[e].name,rejectReason:(e,t)=>pack.provinces[t].state===pack.provinces[e].state?void 0:`${pack.provinces[t].name} belongs to another state. Merge states first, or pick a province of ${pack.states[pack.provinces[e].state].name}`,commit:(e,t)=>tt(t,e)});function nt(e){if(!T.isOn(`provinces`))return;let t=+e.currentTarget.dataset.id;if(!t)return;let n=f(`#provs`).select(`#province${t}`).attr(`d`);n&&(J(e),te(n))}function rt(e){w(`focusProvince${e}`),E(`province`,e)}function it(e,t){for(let n of e)n!==t&&rt(n);Provinces.merge(t,e),G(),T.draw(`provinces`,`borders`,`labels`),w(),f(`#debug`).selectAll(`.highlight`).remove(),W()}function at(e,t){Provinces.setLocked(e,!pack.provinces[e].lock),t.toggle(`icon-lock-open`),t.toggle(`icon-lock`)}var ot={open:U,showChart:We};export{ot as ProvincesEditor};