import{Bt as e,Gn as t,L as n,M as r,P as i,Un as a,a as o,an as s,ar as c,at as l,bt as u,et as d,jn as f,o as p,ot as m,qn as h,un as g,vn as _,y as v,z as y}from"./utils-Dk4MDzbZ.js?v=2";import{at as b,et as x,nt as S,o as C,s as w,t as T,tt as ee}from"./layers-DCXJRYE9.js?v=2";import{t as te}from"./sin-DYm9hqTl.js?v=2";import{i as ne,n as re}from"./highlight-BA-X3wTZ.js?v=2";import{r as ie,t as ae}from"./stratify-CGdiYggi.js?v=2";import{n as E,t as D}from"./constant-CUk6ox2a.js?v=2";import{i as O,t as oe}from"./tooltips-3xx1wzLl.js?v=2";import{t as k}from"./state-B2hBYDzv.js?v=2";import{t as A}from"./controllers-CTfyQhlk.js?v=2";import{i as j,l as M,n as N,r as P,s as se}from"./dialog-helpers-MF-Ear8n.js?v=2";import{t as ce}from"./viewbox-events-BYU-vEWY.js?v=2";import{i as le,r as ue}from"./index-lTzorqRn.js?v=2";import{t as de}from"./highlighting-DOtPILkM.js?v=2";import{a as fe,i as pe,n as me,r as he}from"./table-BOwkVE_i.js?v=2";import{t as ge}from"./annex-mode-BPTQqliH.js?v=2";function _e(e){e.x0=Math.round(e.x0),e.y0=Math.round(e.y0),e.x1=Math.round(e.x1),e.y1=Math.round(e.y1)}function ve(e,t,n,r,i){for(var a=e.children,o,s=-1,c=a.length,l=e.value&&(r-t)/e.value;++s<c;)o=a[s],o.y0=n,o.y1=i,o.x0=t,o.x1=t+=o.value*l}function ye(e,t,n,r,i){for(var a=e.children,o,s=-1,c=a.length,l=e.value&&(i-n)/e.value;++s<c;)o=a[s],o.x0=t,o.x1=r,o.y0=n,o.y1=n+=o.value*l}var be=(1+Math.sqrt(5))/2;function xe(e,t,n,r,i,a){for(var o=[],s=t.children,c,l,u=0,d=0,f=s.length,p,m,h=t.value,g,_,v,y,b,x,S;u<f;){p=i-n,m=a-r;do g=s[d++].value;while(!g&&d<f);for(_=v=g,x=Math.max(m/p,p/m)/(h*e),S=g*g*x,b=Math.max(v/S,S/_);d<f;++d){if(g+=l=s[d].value,l<_&&(_=l),l>v&&(v=l),S=g*g*x,y=Math.max(v/S,S/_),y>b){g-=l;break}b=y}o.push(c={value:g,dice:p<m,children:s.slice(u,d)}),c.dice?ve(c,n,r,i,h?r+=m*g/h:a):ye(c,n,r,h?n+=p*g/h:i,a),h-=g,u=d}return o}var Se=(function e(t){function n(e,n,r,i,a){xe(t,e,n,r,i,a)}return n.ratio=function(t){return e((t=+t)>1?t:1)},n})(be);function Ce(){var e=Se,t=!1,n=1,r=1,i=[0],a=D,o=D,s=D,c=D,l=D;function u(e){return e.x0=e.y0=0,e.x1=n,e.y1=r,e.eachBefore(d),i=[0],t&&e.eachBefore(_e),e}function d(t){var n=i[t.depth],r=t.x0+n,u=t.y0+n,d=t.x1-n,f=t.y1-n;d<r&&(r=d=(r+d)/2),f<u&&(u=f=(u+f)/2),t.x0=r,t.y0=u,t.x1=d,t.y1=f,t.children&&(n=i[t.depth+1]=a(t)/2,r+=l(t)-n,u+=o(t)-n,d-=s(t)-n,f-=c(t)-n,d<r&&(r=d=(r+d)/2),f<u&&(u=f=(u+f)/2),e(t,r,u,d,f))}return u.round=function(e){return arguments.length?(t=!!e,u):t},u.size=function(e){return arguments.length?(n=+e[0],r=+e[1],u):[n,r]},u.tile=function(t){return arguments.length?(e=ie(t),u):e},u.padding=function(e){return arguments.length?u.paddingInner(e).paddingOuter(e):u.paddingInner()},u.paddingInner=function(e){return arguments.length?(a=typeof e==`function`?e:E(+e),u):a},u.paddingOuter=function(e){return arguments.length?u.paddingTop(e).paddingRight(e).paddingBottom(e).paddingLeft(e):u.paddingTop()},u.paddingTop=function(e){return arguments.length?(o=typeof e==`function`?e:E(+e),u):o},u.paddingRight=function(e){return arguments.length?(s=typeof e==`function`?e:E(+e),u):s},u.paddingBottom=function(e){return arguments.length?(c=typeof e==`function`?e:E(+e),u):c},u.paddingLeft=function(e){return arguments.length?(l=typeof e==`function`?e:E(+e),u):l},u}var F=`provincesEditor`,I={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},L,R=e=>o(e.area),z=e=>c(e.rural*options.map.units.population.scale+e.urban*options.map.units.population.scale*options.map.units.population.urbanization.rate),B=[{key:`color`,width:`1.2em`,permanent:!0},{key:`name`,label:`Province`,width:`7em`,permanent:!0,sortBy:e=>e.name||``,sortType:`alpha`},{key:`emblem`,width:`1.4em`},{key:`form`,label:`Form`,width:`7em`,mobileHidden:!0,sortBy:e=>e.formName||``,sortType:`alpha`},{key:`capital`,label:`Capital`,width:`7em`,sortBy:e=>e.burg&&pack.burgs[e.burg]?.name||``,sortType:`alpha`},{key:`state`,label:`State`,width:`7em`,permanent:!0,sortBy:e=>pack.states[e.state]?.name||``,sortType:`alpha`},{key:`burgs`,label:`Burgs`,width:`5em`,mobileHidden:!0,sortBy:e=>e.burgs?.length||0},{key:`area`,label:`Area`,width:`7em`,mobileHidden:!0,defaultSort:`desc`,sortBy:R},{key:`population`,label:`Population`,width:`6em`,sortBy:z},{key:`note`,width:`1.1em`},{key:`independence`,width:`1.1em`},{key:`locate`,width:`1.1em`},{key:`focus`,width:`1.1em`},{key:`lock`,width:`1.1em`},{key:`remove`,width:`1.4em`,permanent:!0}],V=he({getData:G,onUpdate:Ee});function H(){customization||(L=k.get(F,`filters`,()=>({stateId:1})),N(`#provincesEditor, .stable`),T.show(`provinces`,`borders`),T.hide(`states`,`cultures`),we(),U(),$(`#provincesEditor`).dialog({title:`Provinces Editor`,resizable:!1,width:`fit-content`,close:Qe,position:I}))}function we(){j(`provincesEditor`);let e=`<div id="provincesEditor" class="dialog stable editorDialog">
      <div id="provincesBodySection" class="table" data-type="absolute">
        ${pe({dialogId:F,columns:B})}
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
    </div>`;i(`dialogs`).insertAdjacentHTML(`beforeend`,e),ue(F,V.reset),me({dialogId:F,columns:B,onUpdate:()=>M(F,{width:`fit-content`,position:I})}),de(`provincesEditor`,({cellId:e})=>pack.cells.province[e]),i(`provincesEditorRefresh`).addEventListener(`click`,U),i(`provincesEditStyle`).addEventListener(`click`,()=>void A.StyleEditor.open(`provinces`)),i(`provincesFilterState`).addEventListener(`change`,e=>{L.stateId=+e.target.value,k.set(F,`filters`,L),V.reset()}),i(`provincesPercentage`).addEventListener(`click`,Ue),i(`provincesChart`).addEventListener(`click`,X),i(`provincesExport`).addEventListener(`click`,Xe),i(`provincesRemoveAll`).addEventListener(`click`,Ze),i(`provincesManually`).addEventListener(`click`,Ge),i(`provincesRelease`).addEventListener(`click`,We),i(`provincesAdd`).addEventListener(`click`,qe),i(`provincesMerge`).addEventListener(`click`,$e),i(`provincesAnnex`).addEventListener(`click`,tt.toggle),i(`provincesRecolor`).addEventListener(`click`,Ye),i(`provincesBodySection`).addEventListener(`click`,e=>{if(customization)return;let t=e.target,n=t.classList,r=t.closest(`.states`);if(!r)return;let i=+r.dataset.id,a=pack.provinces[i].state;t.tagName===`FILL-BOX`?Oe(t):n.contains(`name`)?Pe(i):n.contains(`coaIcon`)?A.EmblemsEditor.open(`province`,`provinceCOA${i}`,pack.provinces[i]):n.contains(`icon-star-empty`)?ke(i):n.contains(`icon-flag-empty`)?Ae(i):n.contains(`icon-dot-circled`)?A.BurgsOverview.open({stateId:a}):n.contains(`culturePopulation`)?je(i):n.contains(`icon-target`)?re(f(`#provs`).select(`#province${i}`).node(),8):n.contains(`icon-pin`)?Me(i,n):n.contains(`icon-book`)?A.NotesEditor.open({type:`province`,id:i}):n.contains(`icon-trash-empty`)?Ne(i):(n.contains(`icon-lock`)||n.contains(`icon-lock-open`))&&at(i,n)}),i(`provincesBodySection`).addEventListener(`change`,e=>{let t=e.target,n=t.classList,r=t.closest(`.states`);if(!r)return;let i=+r.dataset.id;n.contains(`cultureBase`)&&He(i,r,t.value)})}function U(){W(),Te(),V.reset()}function W(){let{cells:e,provinces:t,burgs:n}=pack;t.forEach(e=>{!e.i||e.removed||(e.area=e.rural=e.urban=0,e.burgs=[],(e.burg&&!n[e.burg]||n[e.burg]?.removed)&&(e.burg=0))});for(let r of e.i){let i=e.province[r];i&&(t[i].area+=e.area[r],t[i].rural+=e.pop[r],e.burg[r]&&(t[i].urban+=n[e.burg[r]].population??0,t[i].burgs.push(e.burg[r])))}t.forEach(e=>{!e.i||e.removed||!e.burg&&e.burgs.length&&(e.burg=e.burgs[0])})}function Te(){let e=i(`provincesFilterState`);L.stateId!==-1&&!pack.states.some(e=>e.i===L.stateId&&!e.removed)&&(L.stateId=-1),e.options.length=0,e.options.add(new Option(`all`,`-1`,!1,L.stateId===-1)),pack.states.filter(e=>e.i&&!e.removed).sort((e,t)=>e.name>t.name?1:-1).forEach(t=>{e.options.add(new Option(t.name,String(t.i),!1,t.i===L.stateId))}),k.set(F,`filters`,L)}function G(){let e=pack.provinces.filter(e=>e.i&&!e.removed);return le(F,L.stateId===-1?e:e.filter(e=>e.state===L.stateId),B)}function Ee(e){let t=i(`provincesBodySection`),n=` ${p()}`,r=e.all.reduce((e,t)=>({area:e.area+R(t),population:e.population+z(t),burgs:e.burgs+t.burgs.length}),{area:0,population:0,burgs:0}),a=t.dataset.type===`percentage`,o=e.rows.map(e=>{let t=R(e),i=e.rural*options.map.units.population.scale,o=e.urban*options.map.units.population.scale*options.map.units.population.urbanization.rate,s=z(e),l=`Total population: ${v(s)}; Rural population: ${v(i)}; Urban population: ${v(o)}`,u=pack.states[e.state].name,d=e.burg&&e.burg!==pack.states[e.state].capital,p=f(`#deftemp`).select(`#fog #focusProvince${e.i}`).size();return b.trigger(`provinceCOA${e.i}`,e.coa),`<div class="states" data-id=${e.i}>
      <fill-box data-col="color" fill="${e.color}"></fill-box>
      <input data-col="name" data-tip="Province name. Click to change" class="name pointer" value="${e.name}" readonly />
      <svg data-col="emblem" data-tip="Click to show and edit province emblem" class="coaIcon pointer" viewBox="0 0 200 200"><use href="#provinceCOA${e.i}"></use></svg>
      <input data-col="form" data-tip="Province form name. Click to change" class="name pointer" value="${e.formName}" readonly />
      <div data-col="capital">
        <span data-tip="Province capital. Click to zoom into view" class="icon-star-empty pointer ${e.burg?``:`placeholder`}"></span>
        <select data-tip="Province capital. Click to select from burgs within the state. No capital means the province is governed from the state capital" class="cultureBase ${e.burgs.length?``:`placeholder`}">${e.burgs.length?De(e.burgs,e.burg):``}</select>
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
      ${se(`this province`)}
      <span data-col="independence" data-tip="Declare province independence (turn non-capital province with burgs into a new state)" class="icon-flag-empty ${d?``:`placeholder`}"></span>
      <span data-col="locate" data-tip="Locate the province" class="icon-target"></span>
      <span data-col="focus" data-tip="Toggle province focus" class="icon-pin ${p?``:` inactive`}"></span>
      <span data-col="lock" data-tip="Lock the province" class="icon-lock${e.lock?``:`-open`}"></span>
      <span data-col="remove" data-tip="Remove the province" class="icon-trash-empty"></span>
    </div>`}).join(``);t.querySelectorAll(`:scope > .states`).forEach(e=>{e.remove()}),t.insertAdjacentHTML(`beforeend`,o),i(`provincesFooterNumber`).innerHTML=String(e.all.length),i(`provincesFooterBurgs`).innerHTML=String(r.burgs),i(`provincesFooterArea`).innerHTML=e.all.length?v(r.area/e.all.length)+n:`0${n}`,i(`provincesFooterPopulation`).innerHTML=e.all.length?v(r.population/e.all.length):`0`,i(`provincesFooterArea`).dataset.area=String(r.area),i(`provincesFooterPopulation`).dataset.population=String(r.population),fe(i(`provincesFooter`),e,V.goto),t.querySelectorAll(`div.states`).forEach(e=>{e.addEventListener(`mouseenter`,K),e.addEventListener(`mouseleave`,q)}),M(F,{width:`fit-content`,position:I})}function De(e,t){let n=``;return e.forEach(e=>{n+=`<option ${e===t?`selected`:``} value="${e}">${pack.burgs[e].name}</option>`}),n}function K(e){let t=+e.target.dataset.id,n=i(`provincesBodySection`).querySelector(`div[data-id='${t}']`);if(n&&n.classList.add(`active`),!T.isOn(`provinces`)||customization)return;let r=s().duration(2e3).ease(te);f(`#provs`).select(`#province${t}`).raise().transition(r).attr(`stroke-width`,2.5).attr(`stroke`,`#d0240f`)}function q(e){let t=e.target?.dataset?.id?+e.target.dataset.id:null;if(t){let e=i(`provincesBodySection`).querySelector(`div[data-id='${t}']`);e&&e.classList.remove(`active`)}if(!T.isOn(`provinces`)||!t){f(`#debug`).selectAll(`.highlight`).remove();return}f(`#provs`).select(`#province${t}`).transition().attr(`stroke-width`,null).attr(`stroke`,null),f(`#debug`).selectAll(`.highlight`).remove()}function Oe(e){let t=e.getAttribute(`fill`),n=+e.closest(`.states`).dataset.id;A.ColorPicker.open(t,t=>{e.fill=t,pack.provinces[n].color=t,T.draw(`provinces`)})}function ke(e){let t=pack.provinces[e].burg,{x:n,y:r}=pack.burgs[t];zoomTo(n,r,8,2e3)}function Ae(e){P({title:`Declare independence`,message:`Are you sure you want to declare province independence? <br>It will turn province into a new state`,confirm:`Declare`,onConfirm:()=>{let t=J(e);if(!t)return;let[n,r]=t;Y([n],[r])}})}function J(e){let t=pack.provinces[e].state;try{let n=Provinces.declareIndependence(e);return S(`province`,e),[t,n]}catch(e){O(h(e),!1,`error`)}}function Y(e,n){let r=t([...e,...n]);T.hide(`provinces`),T.show(`states`,`borders`),T.draw(`burgIcons`,`labels`),ee(r.map(e=>[`state`,e])),w(),N(),A.StatesEditor.open()}function je(e){let t=pack.provinces[e];if(!pack.cells.i.filter(t=>pack.cells.province[t]===e).length){O(`Province does not have any cells, cannot change population`,!1,`error`);return}let n=c(t.rural*options.map.units.population.scale),r=c(t.urban*options.map.units.population.scale*options.map.units.population.urbanization.rate),a=n+r,o=e=>Number(e).toLocaleString();alertMessage.innerHTML=` Rural: <input type="number" min="0" step="1" id="ruralPop" value=${n} style="width:6em" /> Urban:
    <input type="number" min="0" step="1" id="urbanPop" value=${r} style="width:6em" ${t.burgs.length?``:`disabled`} />
    <p>Total population: ${o(a)} ⇒ <span id="totalPop">${o(a)}</span> (<span id="totalPopPerc">100</span>%)</p>`;let s=i(`ruralPop`),l=i(`urbanPop`),u=()=>{let e=s.valueAsNumber+l.valueAsNumber;Number.isNaN(e)||(i(`totalPop`).innerHTML=o(e),i(`totalPopPerc`).innerHTML=String(c(e/a*100)))};s.oninput=()=>u(),l.oninput=()=>u(),$(`#alert`).dialog({resizable:!1,title:`Change province population`,width:`24em`,buttons:{Apply:function(){d(),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`}});function d(){try{Provinces.setPopulation(e,+s.value||0,+l.value||0)}catch(e){O(h(e),!1,`error`);return}T.draw(`population`),U()}}function Me(e,t){let n=f(`#provs`).select(`#province${e}`).attr(`d`),r=`focusProvince${e}`;t.contains(`inactive`)?C(r,n):w(r),t.toggle(`inactive`)}function Ne(e){alertMessage.innerHTML=`Are you sure you want to remove the province? <br />This action cannot be reverted`,$(`#alert`).dialog({resizable:!1,title:`Remove province`,buttons:{Remove:function(){Provinces.remove(e),w(`focusProvince${e}`),S(`province`,e);let t=f(`#provs`).select(`#provincesBody`);t.select(`#province${e}`).remove(),t.select(`#province-gap${e}`).remove(),T.draw(`borders`),T.draw(`labels`),U(),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}}})}function Pe(e){Fe();let t=pack.provinces[e];i(`provinceNameEditor`).dataset.province=String(e),i(`provinceNameEditorShort`).value=t.name,r(i(`provinceNameEditorSelectForm`),t.formName),i(`provinceNameEditorFull`).value=t.fullName;let n=pack.cells.culture[t.center];i(`provinceCultureDisplay`).innerText=pack.cultures[n].name,$(`#provinceNameEditor`).dialog({resizable:!1,title:`Change province name`,buttons:{Apply:function(){Ve(t),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`},close:Ie})}function Fe(){j(`provinceNameEditor`),i(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="provinceNameEditor" class="dialog" data-province="0">
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
    </div>`),i(`provinceNameEditorShortCulture`).addEventListener(`click`,Le),i(`provinceNameEditorShortRandom`).addEventListener(`click`,Re),i(`provinceNameEditorShortSpeak`).addEventListener(`click`,()=>d(i(`provinceNameEditorShort`).value)),i(`provinceNameEditorAddForm`).addEventListener(`click`,ze),i(`provinceNameEditorFullRegenerate`).addEventListener(`click`,Be),i(`provinceNameEditorFullSpeak`).addEventListener(`click`,()=>d(i(`provinceNameEditorFull`).value))}function Ie(){$(`#provinceNameEditor`).dialog(`destroy`),i(`provinceNameEditor`).remove()}function Le(){let e=+i(`provinceNameEditor`).dataset.province,t=pack.cells.culture[pack.provinces[e].center],n=Names.getState(Names.getCultureShort(t),t);i(`provinceNameEditorShort`).value=n}function Re(){let t=e(Names.nameBases.length-1),n=Names.getState(Names.getBase(t),void 0,t);i(`provinceNameEditorShort`).value=n}function ze(){let e=i(`provinceNameEditorCustomForm`),t=i(`provinceNameEditorSelectForm`),n=e.value,a=e.style.display===`inline-block`;e.style.display=a?`none`:`inline-block`,t.style.display=a?`inline-block`:`none`,a&&r(t,n)}function Be(){let e=i(`provinceNameEditorShort`).value,t=i(`provinceNameEditorSelectForm`).value,n=()=>t?!e&&t?`The ${t}`:`${e} ${t}`:e;i(`provinceNameEditorFull`).value=n()}function Ve(e){let t=i(`provinceNameEditorShort`).value.trim(),n=i(`provinceNameEditorSelectForm`).value,r=i(`provinceNameEditorFull`).value.trim(),a=e.fullName;t&&t!==e.name&&Provinces.rename(e.i,t),n!==(e.formName??``)&&Provinces.setForm(e.i,n),r&&r!==a&&Provinces.setFullName(e.i,r),T.draw(`provinces`),T.draw(`labels`),U()}function He(e,t,n){Provinces.setCapital(e,+n),t.dataset.capital=pack.burgs[+n].name}function Ue(){let e=i(`provincesBodySection`);e.dataset.type=e.dataset.type===`absolute`?`percentage`:`absolute`,V.refresh()}function X(){W();let e=e=>!e.i||e.removed||e.color[0]!==`#`?`#666`:String(_(e.color).darker()),t=pack.states.map(t=>({id:t.i,state:t.i?0:null,color:e(t)})),n=pack.provinces.filter(e=>e.i&&!e.removed).map(e=>({id:e.i+t.length-1,i:e.i,state:e.state,color:e.color,name:e.name,fullName:e.fullName,area:e.area,urban:e.urban,rural:e.rural})),r=[...t,...n],a=ae().parentId(e=>e.state)(r).sum(e=>e.area),s=+i(`uiSize`).value,l=300+300*s,u=90+90*s,d={top:10,right:10,bottom:0,left:10},m=l-d.left-d.right,h=u-d.top-d.bottom,g=Ce().size([m,h]).padding(2);alertMessage.innerHTML=`<select id="provincesTreeType" style="display:block; margin-left:13px; font-size:11px">
    <option value="area" selected>Area</option>
    <option value="population">Total population</option>
    <option value="rural">Rural population</option>
    <option value="urban">Urban population</option>
  </select>`,alertMessage.innerHTML+=`<div id='provinceInfo' class='chartInfo'>&#8205;</div>`;let y=f(`#alertMessage`).insert(`svg`,`#provinceInfo`).attr(`id`,`provincesTree`).attr(`width`,l).attr(`height`,u).attr(`font-size`,`10px`).append(`g`).attr(`transform`,`translate(10, 0)`);i(`provincesTreeType`).addEventListener(`change`,w),g(a);let b=y.selectAll(`g`).data(a.leaves()).enter().append(`g`).attr(`data-id`,e=>e.data.i).on(`mouseenter`,(e,t)=>x(e,t)).on(`mouseleave`,e=>S(e));function x(e,t){f(e.currentTarget).select(`rect`).classed(`selected`,!0);let n=t.data.fullName,r=pack.states[t.data.state].fullName,a=`${o(t.data.area)} ${p()}`,s=c(t.data.rural*options.map.units.population.scale),l=c(t.data.urban*options.map.units.population.scale*options.map.units.population.urbanization.rate),u=i(`provincesTreeType`).value,d=u===`area`?`Area: ${a}`:u===`rural`?`Rural population: ${v(s)}`:u===`urban`?`Urban population: ${v(l)}`:`Population: ${v(s+l)}`;i(`provinceInfo`).innerHTML=`${n}. ${r}. ${d}`,K(e)}function S(e){q(e),document.getElementById(`provinceInfo`)&&(i(`provinceInfo`).innerHTML=`&#8205;`,f(e.currentTarget).select(`rect`).classed(`selected`,!1))}b.append(`rect`).attr(`stroke`,e=>e.parent.data.color).attr(`stroke-width`,1).attr(`fill`,e=>e.data.color).attr(`x`,e=>e.x0).attr(`y`,e=>e.y0).attr(`width`,e=>e.x1-e.x0).attr(`height`,e=>e.y1-e.y0),b.append(`text`).attr(`text-rendering`,`optimizeSpeed`).attr(`dx`,`.2em`).attr(`dy`,`1em`).attr(`x`,e=>e.x0).attr(`y`,e=>e.y0);function C(){b.select(`text`).each(function(e){this.innerHTML=e.data.name;let t=this.getBBox();t.y+t.height>e.y1+1&&(this.innerHTML=``);for(let n=0;n<15&&t.width>0&&t.x+t.width>e.x1;n++){if(this.innerHTML.length<3){this.innerHTML=``;break}this.innerHTML=`${this.innerHTML.slice(0,-2)}…`,t=this.getBBox()}})}function w(){let e=this.value===`area`?e=>e.area:this.value===`rural`?e=>e.rural:this.value===`urban`?e=>e.urban:e=>e.rural+e.urban;a.sum(e),b.data(g(a).leaves()),b.select(`rect`).transition().duration(1500).attr(`x`,e=>e.x0).attr(`y`,e=>e.y0).attr(`width`,e=>e.x1-e.x0).attr(`height`,e=>e.y1-e.y0),b.select(`text`).transition().duration(1500).attr(`x`,e=>e.x0).attr(`y`,e=>e.y0),setTimeout(C,2e3)}$(`#alert`).dialog({title:`Provinces chart`,width:`fit-content`,position:{my:`left bottom`,at:`left+10 bottom-10`,of:`svg`},buttons:{},close:()=>{alertMessage.innerHTML=``}}),C()}function We(){P({title:`Release provinces`,message:`Are you sure you want to release all provinces?
        </br>It will turn all separable provinces into independent states.
        </br>Capital province and provinces without any burgs will state as they are`,confirm:`Release`,onConfirm:()=>{let e=[],n=[];G().forEach(t=>{if(!t.burg||t.burg===pack.states[t.state].capital||t.burgs.some(e=>pack.burgs[e].capital))return;let r=J(t.i);r&&(e.push(r[0]),n.push(r[1]))}),Y(t(e),n)}})}function Ge(){T.show(`provinces`,`borders`),A.PaintEditor.open({title:`Paint Provinces`,parentDialogId:F,onClose:H,items:G().map(e=>({id:e.i,name:e.name,color:e.color||`#ffffff`})),getValue:e=>pack.cells.province[e],filterCell:(e,t,n)=>!y(e,pack)||!pack.cells.state[e]||pack.cells.state[e]!==pack.provinces[n].state?!1:!t||e!==pack.provinces[t].center?!0:(O(`Province center cannot be assigned to a different region. Please remove the province first`,!1,`error`),!1),dontOverrideControl:!0,onApply:Ke})}function Ke(e){for(let[t,n]of a(e))Provinces.setCells(t,n);T.draw(`borders`,`provinces`),T.draw(`labels`),document.getElementById(F)&&U()}function qe(){if(this.classList.contains(`pressed`)){Z();return}customization=12,this.classList.add(`pressed`),O(`Click on the map to place a new province center`,!0),f(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,Je),i(`provincesBodySection`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.pointerEvents=`none`})}function Je(e){let[t,r]=n(e,this),a;try{a=Provinces.add(t,r)}catch(e){O(h(e),!1,`error`);return}e.shiftKey===!1&&Z(),x(`province`,a),T.draw(`borders`,`provinces`,`labels`),W(),L.stateId=pack.provinces[a].state,k.set(F,`filters`,L),i(`provincesFilterState`).value=String(L.stateId),V.reset()}function Z(){customization=0,ce(),oe(),i(`provincesBodySection`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.removeProperty(`pointer-events`)});let e=i(`provincesAdd`);e.classList.contains(`pressed`)&&e.classList.remove(`pressed`)}function Ye(){let e=L.stateId;pack.provinces.forEach(t=>{if(!t||t.removed||e!==-1&&t.state!==e)return;let n=pack.states[t.state].color,r=u();t.color=n[0]===`#`?_(g(n,r)(.2)).hex():r}),T.draw(`provinces`),V.refresh()}function Xe(){let e=`Id,Province,Full Name,Form,State,Color,Capital,Area ${options.map.units.area.unit===`square`?`${options.map.units.distance.unit}2`:options.map.units.area.unit},Total Population,Rural Population,Urban Population,Burgs\n`;for(let t of G()){let n=t.burg?pack.burgs[t.burg].name:``;e+=`${t.i},${t.name},${t.fullName},${t.formName},${pack.states[t.state].name},${t.color},${n},${R(t)},${z(t)},${Math.round(t.rural*options.map.units.population.scale)},${Math.round(t.urban*options.map.units.population.scale*options.map.units.population.urbanization.rate)},${t.burgs.length}\n`}let t=`${m(`Provinces`)}.csv`;l(e,t)}function Ze(){alertMessage.innerHTML=`Are you sure you want to remove all provinces? <br />This action cannot be reverted`,$(`#alert`).dialog({resizable:!1,title:`Remove all provinces`,buttons:{Remove:function(){$(this).dialog(`close`),pack.provinces.forEach(e=>{e.i&&S(`province`,e.i)}),pack.provinces=[0],pack.cells.province=new Uint16Array(pack.cells.i.length),pack.states.forEach(e=>{e.provinces=[]}),w(),T.draw(`borders`),f(`#provs`).select(`#provincesBody`).remove(),T.hide(`provinces`),T.draw(`labels`),V.reset()},Cancel:function(){$(this).dialog(`close`)}}})}function Qe(){customization===12&&Z(),tt.exit(),A.ColorPicker.close();let e=V.view();e.rows=[],e.all=[],$(`#provincesEditor`).dialog(`destroy`),i(`provincesEditor`).remove()}function $e(){let e=L.stateId;if(e===-1){alertMessage.innerHTML=`Please select a specific state from the filter to merge provinces within that state.`,$(`#alert`).dialog({title:`Merge Provinces`,buttons:{OK:function(){$(this).dialog(`close`)}}});return}let t=pack.provinces.filter(t=>t.i&&!t.removed&&t.state===e);if(t.length<2){alertMessage.innerHTML=`Not enough provinces in the selected state to merge.`,$(`#alert`).dialog({title:`Merge Provinces`,buttons:{OK:function(){$(this).dialog(`close`)}}});return}let n=t.map(e=>`
    <div data-id="${e.i}" data-tip="${e.fullName||e.name}" style="cursor:default">
      <input type="radio" name="rulingProvince" value="${e.i}" />
      <input id="selectProvince${e.i}" class="checkbox" type="checkbox" name="provincesToMerge" value="${e.i}" />
      <label for="selectProvince${e.i}" class="checkbox-label"><fill-box fill="${e.color}" disabled></fill-box>${Q(e.i)}${e.name}</label>
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
  `,i(`mergeProvincesForm`).querySelectorAll(`div[data-id]`).forEach(e=>{e.addEventListener(`mouseenter`,nt),e.addEventListener(`mouseleave`,q)}),$(`#alert`).dialog({width:600,title:`Merge provinces`,close:q,buttons:{Merge:function(){let e=new FormData(i(`mergeProvincesForm`)),t=Number(e.get(`rulingProvince`));if(!t){O(`Please select a province to merge into`,!1,`error`);return}let n=e.getAll(`provincesToMerge`).map(Number).filter(e=>e!==t);if(!n.length){O(`Please select several provinces to merge`,!1,`error`);return}et(n,t,()=>$(this).dialog(`close`))},Cancel:function(){$(this).dialog(`close`)}}})}var Q=e=>`<svg class="coaIcon" viewBox="0 0 200 200"><use href="#provinceCOA${e}"></use></svg>`;function et(e,t,n){P({title:`Merge provinces`,message:`
      <p>The following provinces will be <strong>removed</strong>: ${e.map(e=>`${Q(e)}${pack.provinces[e].name}`).join(`, `)}.</p>
      <p>Removed provinces data (burgs and cells) will be assigned to ${Q(t)}${pack.provinces[t].name}.</p>
      <p>Are you sure you want to merge provinces? This action cannot be reverted.</p>`,confirm:`Merge`,onConfirm:()=>{it(e,t),n?.()}})}var tt=ge({buttonId:`provincesAnnex`,bodySectionId:`provincesBodySection`,noun:`province`,ownerOf:e=>pack.cells.province[e],colorOf:e=>pack.provinces[e].color,nameOf:e=>pack.provinces[e].name,rejectReason:(e,t)=>pack.provinces[t].state===pack.provinces[e].state?void 0:`${pack.provinces[t].name} belongs to another state. Merge states first, or pick a province of ${pack.states[pack.provinces[e].state].name}`,commit:(e,t)=>et(t,e)});function nt(e){if(!T.isOn(`provinces`))return;let t=+e.currentTarget.dataset.id;if(!t)return;let n=f(`#provs`).select(`#province${t}`).attr(`d`);n&&(q(e),ne(n))}function rt(e){w(`focusProvince${e}`),S(`province`,e)}function it(e,t){for(let n of e)n!==t&&rt(n);Provinces.merge(t,e),W(),T.draw(`provinces`,`borders`,`labels`),w(),f(`#debug`).selectAll(`.highlight`).remove(),U()}function at(e,t){Provinces.setLocked(e,!pack.provinces[e].lock),t.toggle(`icon-lock-open`),t.toggle(`icon-lock`)}var ot={open:H,showChart:X};export{ot as ProvincesEditor};