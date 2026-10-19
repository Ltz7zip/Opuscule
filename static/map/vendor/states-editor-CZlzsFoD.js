import{Bt as e,Et as t,L as n,Ln as r,M as i,P as a,Un as o,a as s,ar as c,at as l,et as u,jn as d,o as f,ot as p,qn as m,r as h,y as g,z as _}from"./utils-Dk4MDzbZ.js?v=2";import{B as v,H as y,W as b,at as ee,et as x,nt as S,o as te,s as C,t as w}from"./layers-DCXJRYE9.js?v=2";import{i as T,n as E}from"./highlight-BA-X3wTZ.js?v=2";import{t as ne}from"./stratify-CGdiYggi.js?v=2";import{t as re}from"./pack-CyBKcrr4.js?v=2";import{i as D,t as ie}from"./tooltips-3xx1wzLl.js?v=2";import{t as O}from"./controllers-CTfyQhlk.js?v=2";import{i as k,l as A,n as ae,r as j,s as oe}from"./dialog-helpers-MF-Ear8n.js?v=2";import{t as se}from"./viewbox-events-BYU-vEWY.js?v=2";import{E as ce,i as M,r as le}from"./index-lTzorqRn.js?v=2";import{t as N}from"./highlighting-DOtPILkM.js?v=2";import{a as ue,i as de,n as fe,r as pe}from"./table-BOwkVE_i.js?v=2";import{t as me}from"./annex-mode-BPTQqliH.js?v=2";var P=`statesEditor`,F=`States`,I={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},L=[{key:`color`,width:`1.2em`,permanent:!0},{key:`name`,label:`State`,width:`7em`,permanent:!0,sortBy:e=>e.name||``,sortType:`alpha`},{key:`emblem`,width:`1.4em`},{key:`form`,label:`Form`,width:`8em`,mobileHidden:!0,sortBy:e=>e.i&&e.formName||``,sortType:`alpha`},{key:`capital`,label:`Capital`,width:`7em`,sortBy:e=>e.i&&pack.burgs[e.capital]?.name||``,sortType:`alpha`},{key:`culture`,label:`Culture`,width:`10em`,mobileHidden:!0,sortBy:e=>e.i&&pack.cultures[e.culture]?.name||``,sortType:`alpha`},{key:`burgs`,label:`Burgs`,width:`5em`,mobileHidden:!0,sortBy:e=>e.burgs||0},{key:`cells`,label:`Cells`,width:`5em`,hidden:!0,mobileHidden:!0,sortBy:e=>e.cells||0},{key:`area`,label:`Area`,width:`7em`,mobileHidden:!0,defaultSort:`desc`,sortBy:e=>s(e.area||0)},{key:`population`,label:`Population`,width:`6em`,sortBy:e=>c((e.rural||0)*options.map.units.population.scale+(e.urban||0)*options.map.units.population.scale*options.map.units.population.urbanization.rate)},{key:`treasury`,label:`Treasury`,width:`6em`,mobileHidden:!0,tip:`Click to sort by state treasury. Click on a value to view and edit taxes`,sortBy:e=>e.treasury||0},{key:`type`,label:`Type`,width:`5em`,hidden:!0,sortBy:e=>e.i&&e.type||``,sortType:`alpha`},{key:`expansionism`,label:`Expansion`,width:`5em`,hidden:!0,sortBy:e=>e.i&&e.expansionism||0},{key:`note`,width:`1.1em`},{key:`locate`,width:`1.1em`},{key:`focus`,width:`1.1em`},{key:`lock`,width:`1.1em`},{key:`remove`,width:`1.4em`,permanent:!0}],R=pe({getData:()=>M(P,pack.states.filter(e=>!e.removed),L),onUpdate:_e});function z(){customization||(ae(`#${P}, .stable`),w.show(`states`,`borders`),w.hide(`cultures`,`biomes`,`religions`),he(),States.collectStatistics(),R.reset(),$(`#${P}`).dialog({title:`States Editor`,resizable:!1,position:I,close:ge}))}function he(){k(P);let e=`<div id="${P}" class="dialog stable editorDialog">
    <div id="statesBodySection" class="table" data-type="absolute">
      ${de({dialogId:P,columns:L})}
    </div>

    <div id="statesFooter" class="totalLine">
      <div data-tip="States number" style="margin-left: 5px">States:&nbsp;<span id="statesFooterStates">0</span></div>
      <div data-tip="Total burgs number" style="margin-left: 12px" data-col="burgs">Burgs:&nbsp;<span id="statesFooterBurgs">0</span></div>
      <div data-tip="Total land area" style="margin-left: 12px" data-col="area">Land Area:&nbsp;<span id="statesFooterArea">0</span></div>
      <div data-tip="Total population" style="margin-left: 12px" data-col="population">Population:&nbsp;<span id="statesFooterPopulation">0</span></div>
    </div>

    <div id="statesBottom" class="editorToolbar">
      <button id="statesEditorRefresh" data-tip="Refresh the Editor" class="icon-cw"></button>
      <button id="statesEditStyle" data-tip="Edit states style in Style Editor" class="icon-adjust"></button>
      <button id="statesLegend" data-tip="Toggle Legend box" class="icon-list-bullet"></button>
      <button id="statesPercentage" data-tip="Toggle percentage / absolute values views" class="icon-percent"></button>
      <button id="statesChart" data-tip="Show states bubble chart" class="icon-chart-area"></button>

      <button id="statesRegenerate" data-tip="Show the regeneration menu and more data" class="icon-cog-alt"></button>
      <div id="statesRegenerateButtons" style="display: none">
        <button id="statesRegenerateBack" data-tip="Hide the regeneration menu" class="icon-cog-alt"></button>
        <button id="statesRandomize" data-tip="Randomize states Expansion value and re-calculate states and provinces" class="icon-shuffle"></button>
        <button id="statesRecalculate" data-tip="Recalculate states based on current values of growth-related attributes" class="icon-retweet"></button>
        <div data-tip="Allow states neutral distance, expansion and type changes to take an immediate effect" style="display: inline-block">
          <input id="statesAutoChange" class="checkbox" type="checkbox" />
          <label for="statesAutoChange" class="checkbox-label"><i>auto-apply changes</i></label>
        </div>
        <div data-tip="Allow system to change state labels when states data is change" style="display: inline-block">
          <input id="adjustLabels" class="checkbox" type="checkbox" />
          <label for="adjustLabels" class="checkbox-label"><i>auto-change labels</i></label>
        </div>
      </div>

      <button id="statesManually" data-tip="Manually re-assign states" class="icon-brush"></button>

      <button id="statesAdd" data-tip="Add a new state. Hold Shift to add multiple" class="icon-plus"></button>
      <button id="statesMerge" data-tip="Merge several states into one" class="icon-layer-group"></button>
      <button id="statesAnnex" data-tip="Annex states: click the annexing state, then the states it absorbs. Hold Shift to keep annexing" class="icon-crown"></button>
      <button id="statesExport" data-tip="Save state-related data as a text file (.csv)" class="icon-download"></button>
    </div>
  </div>`;a(`dialogs`).insertAdjacentHTML(`beforeend`,e),le(P,R.reset),N(P,({cellId:e})=>pack.cells.h[e]<20?void 0:pack.cells.state[e]),fe({dialogId:P,columns:L,onUpdate:()=>A(P,{width:`fit-content`,position:I})}),a(`statesEditorRefresh`).addEventListener(`click`,B),a(`statesEditStyle`).addEventListener(`click`,()=>void O.StyleEditor.open(`states`)),a(`statesLegend`).addEventListener(`click`,je),a(`statesPercentage`).addEventListener(`click`,G),a(`statesChart`).addEventListener(`click`,K),a(`statesRegenerate`).addEventListener(`click`,Me),a(`statesRegenerateBack`).addEventListener(`click`,Pe),a(`statesRecalculate`).addEventListener(`click`,()=>q(!0)),a(`statesRandomize`).addEventListener(`click`,Ne),a(`statesManually`).addEventListener(`click`,Fe),a(`statesAdd`).addEventListener(`click`,Ie),a(`statesMerge`).addEventListener(`click`,Re),a(`statesAnnex`).addEventListener(`click`,Q.toggle),a(`statesExport`).addEventListener(`click`,Be),a(`statesBodySection`).addEventListener(`click`,e=>{let t=e.target,n=t.classList,r=t.closest(`.states`);if(!r)return;let i=Number(r.dataset.id);t.tagName===`FILL-BOX`?ve(t):n.contains(`name`)?ye(i):n.contains(`coaIcon`)?O.EmblemsEditor.open(`state`,`stateCOA${i}`,pack.states[i]):n.contains(`icon-star-empty`)?we(i):n.contains(`icon-dot-circled`)?O.BurgsOverview.open({stateId:i}):n.contains(`statePopulation`)?Se(i):n.contains(`stateTreasury`)?Ce(i):n.contains(`icon-book`)?O.NotesEditor.open({type:`state`,id:i}):n.contains(`icon-pin`)?Oe(i,n):n.contains(`icon-target`)?E(d(`#regions`).select(`#state${i}`).node(),4):n.contains(`icon-trash-empty`)?ke(i):(n.contains(`icon-lock`)||n.contains(`icon-lock-open`))&&Ve(i,n)}),a(`statesBodySection`).addEventListener(`change`,e=>{let t=e.target,n=t.classList,r=t.closest(`.states`);if(!r)return;let i=+r.dataset.id;n.contains(`stateCulture`)?Te(i,r,t.value):n.contains(`cultureType`)?Ee(i,r,t.value):n.contains(`statePower`)&&De(i,r,t.value)})}function ge(){customization===3&&Y(),Q.exit(),O.ColorPicker.close(),d(`#debug`).selectAll(`.highlight`).remove();let e=R.view();e.rows=[],e.all=[],k(P)}function B(){States.collectStatistics(),R.refresh()}function _e(e){let t=f(),n=0,r=0,i=0;for(let t of e.all){n+=s(t.area||0);let e=(t.rural||0)*options.map.units.population.scale,a=(t.urban||0)*options.map.units.population.scale*options.map.units.population.urbanization.rate;r+=c(e+a),i+=t.burgs||0}let o=``;for(let n of e.rows){let e=s(n.area||0),r=(n.rural||0)*options.map.units.population.scale,i=(n.urban||0)*options.map.units.population.scale*options.map.units.population.urbanization.rate,a=c(r+i),l=`Total population: ${g(a)}; Rural population: ${g(r)}; Urban population: ${g(i)}. Click to change`,u=d(`#deftemp`).select(`#fog #focusState${n.i}`).size(),f=`Current treasury: 🟡 ${g(n.treasury)}. Sales Tax: ${c((n.salesTax||0)*100,1)}%. Poll Tax: ${c((n.pollTax||0)*100,1)}%. Click to view and edit taxes`;if(!n.i){o+=`<div
        class="states"
        data-id=${n.i}
        data-name="${n.name}"
        data-cells=${n.cells}
        data-area=${e}
        data-population=${a}
        data-burgs=${n.burgs}
        data-treasury="0"
        data-color=""
        data-form=""
        data-capital=""
        data-culture=""
        data-type=""
        data-expansionism=""
      >
        <svg width="1em" height="1em" class="placeholder" data-col="color"></svg>
        <input data-tip="Neutral lands name. Click to change" class="stateName name pointer italic" value="${n.name}" readonly data-col="name" />
        <svg class="coaIcon placeholder" viewBox="0 0 200 200" data-col="emblem"></svg>
        <input class="stateForm placeholder" value="none" data-col="form" />
        <div data-col="capital">
          <span class="icon-star-empty placeholder"></span>
          <div class="stateCapital placeholder"></div>
        </div>
        <select class="stateCulture placeholder" data-col="culture">${V(0)}</select>
        <div data-col="burgs">
          <span data-tip="Click to overview neutral burgs" class="icon-dot-circled pointer" style="padding-right: 1px"></span>
          <div data-tip="Burgs count" class="stateBurgs">${n.burgs}</div>
        </div>
        <div data-col="cells">
          <span data-tip="Cells count" class="icon-check-empty"></span>
          <div data-tip="Cells count" class="stateCells">${n.cells}</div>
        </div>
        <div data-col="area">
          <span data-tip="Neutral lands area" style="padding-right: 4px" class="icon-map-o"></span>
          <div data-tip="Neutral lands area" class="stateArea">${g(e)} ${t}</div>
        </div>
        <div data-col="population">
          <span data-tip="${l}" class="icon-male"></span>
          <div data-tip="${l}" class="statePopulation pointer">${g(a)}</div>
        </div>
        <div data-tip="Neutrals collect no taxes" class="stateTreasury placeholder" data-col="treasury"></div>
        <select class="cultureType placeholder" data-col="type">${H(0)}</select>
        <div data-col="expansionism">
          <span class="icon-resize-full placeholder"></span>
          <input class="statePower placeholder" type="number" value="0" />
        </div>
        <div data-col="note"></div>
        <div data-col="locate"></div>
        <div data-col="focus"></div>
        <div data-col="lock"></div>
        <div data-col="remove"></div>
      </div>`;continue}let p=pack.burgs[n.capital].name;ee.trigger(`stateCOA${n.i}`,n.coa),o+=`<div
      class="states"
      data-id=${n.i}
      data-name="${n.name}"
      data-form="${n.formName}"
      data-capital="${p}"
      data-color="${n.color}"
      data-cells=${n.cells}
      data-area=${e}
      data-population=${a}
      data-burgs=${n.burgs}
      data-treasury="${n.treasury}"
      data-culture=${pack.cultures[n.culture].name}
      data-type=${n.type}
      data-expansionism=${n.expansionism}
    >
      <fill-box fill="${n.color}" data-col="color"></fill-box>
      <input data-tip="State name. Click to change" class="stateName name pointer" value="${n.name}" readonly data-col="name" />
      <svg data-tip="Click to show and edit state emblem" class="coaIcon pointer" viewBox="0 0 200 200" data-col="emblem"><use href="#stateCOA${n.i}"></use></svg>
      <input data-tip="State form name. Click to change" class="stateForm name pointer" value="${n.formName}" readonly data-col="form" />
      <div data-col="capital">
        <span data-tip="State capital. Click to zoom into view" class="icon-star-empty pointer"></span>
        <div data-tip="Capital name" class="stateCapital">${p}</div>
      </div>
      <select data-tip="Dominant culture. Click to change" class="stateCulture" data-col="culture">${V(n.culture)}</select>
      <div data-col="burgs">
        <span data-tip="Click to overview state burgs" style="padding-right: 1px" class="icon-dot-circled pointer"></span>
        <div data-tip="Burgs count" class="stateBurgs">${n.burgs}</div>
      </div>
      <div data-col="cells">
        <span data-tip="Cells count" class="icon-check-empty"></span>
        <div data-tip="Cells count" class="stateCells">${n.cells}</div>
      </div>
      <div data-col="area">
        <span data-tip="State area" style="padding-right: 4px" class="icon-map-o"></span>
        <div data-tip="State area" class="stateArea">${g(e)} ${t}</div>
      </div>
      <div data-col="population">
        <span data-tip="${l}" class="icon-male"></span>
        <div data-tip="${l}" class="statePopulation pointer">${g(a)}</div>
      </div>
      <div data-tip="${f}" class="stateTreasury pointer" data-col="treasury">🟡 ${g(n.treasury)}</div>
      <select data-tip="State type. Defines growth model. Click to change" class="cultureType" data-col="type">${H(n.type)}</select>
      <div data-col="expansionism">
        <span data-tip="State expansionism" class="icon-resize-full"></span>
        <input data-tip="Expansionism (defines competitive size). Change to re-calculate states based on new value"
          class="statePower" type="number" min="0" max="99" step=".1" value=${n.expansionism} />
      </div>
      ${oe(`this state`)}
      <span data-col="locate" data-tip="Locate the state" class="icon-target"></span>
      <span data-col="focus" data-tip="Toggle state focus" class="icon-pin ${u?``:` inactive`}"></span>
      <span data-col="lock" data-tip="Lock the state to protect it from re-generation" class="icon-lock${n.lock?``:`-open`}"></span>
      <span data-col="remove" data-tip="Remove the state" class="icon-trash-empty"></span>
    </div>`}let l=a(`statesBodySection`);l.querySelectorAll(`:scope > .states`).forEach(e=>{e.remove()}),l.insertAdjacentHTML(`beforeend`,o),a(`statesFooterStates`).innerHTML=String(pack.states.filter(e=>e.i&&!e.removed).length),a(`statesFooterBurgs`).innerHTML=String(i),a(`statesFooterArea`).innerHTML=g(n)+t,a(`statesFooterArea`).dataset.area=String(n),a(`statesFooterPopulation`).innerHTML=g(r),a(`statesFooterPopulation`).dataset.population=String(r),ue(a(`statesFooter`),e,R.goto),a(`statesBodySection`).querySelectorAll(`:scope > .states`).forEach(e=>{e.addEventListener(`mouseenter`,U),e.addEventListener(`mouseleave`,W)}),a(`statesBodySection`).dataset.type===`percentage`&&(a(`statesBodySection`).dataset.type=`absolute`,G()),A(P,{width:`fit-content`,position:I})}function V(e){let t=``;return pack.cultures.forEach(n=>{n.removed||(t+=`<option ${n.i===e?`selected`:``} value="${n.i}">${n.name}</option>`)}),t}function H(e){let t=``;return[`Generic`,`River`,`Lake`,`Naval`,`Nomadic`,`Hunting`,`Highland`].forEach(n=>{t+=`<option ${e===n?`selected`:``} value="${n}">${n}</option>`}),t}function U(e){if(!w.isOn(`states`)||d(`#deftemp`).select(`#fog path`).size())return;let t=+e.target.dataset.id;customization||!t||T(d(`#regions`).select(`#state${t}`).attr(`d`))}function W(){d(`#debug`).selectAll(`.highlight`).each(function(){d(this).transition().duration(1e3).attr(`opacity`,0).remove()})}function ve(e){let t=e.getAttribute(`fill`)||`#ffffff`,n=+e.closest(`.states`).dataset.id;O.ColorPicker.open(t,t=>{e.fill=t,pack.states[n].color=t,w.draw(`states`),w.draw(`military`)})}function ye(n){be();let r=a(`stateNameEditorCustomForm`),o=a(`stateNameEditorSelectForm`);r.value=``,r.style.display===`inline-block`&&(r.style.display=`none`,o.style.display=`inline-block`);let s=pack.states[n];a(`stateNameEditor`).dataset.state=String(n),a(`stateNameEditorShort`).value=s.name||``,i(o,s.formName||``),a(`stateNameEditorFull`).value=s.fullName||``,$(`#stateNameEditor`).dialog({resizable:!1,title:`Change state name`,buttons:{Apply:function(){p(s),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`},close:xe}),a(`stateNameEditorShortCulture`).addEventListener(`click`,c),a(`stateNameEditorShortRandom`).addEventListener(`click`,l),a(`stateNameEditorShortSpeak`).addEventListener(`click`,()=>u(a(`stateNameEditorShort`).value)),a(`stateNameEditorAddForm`).addEventListener(`click`,d),a(`stateNameEditorCustomForm`).addEventListener(`change`,d),a(`stateNameEditorFullRegenerate`).addEventListener(`click`,f),a(`stateNameEditorFullSpeak`).addEventListener(`click`,()=>u(a(`stateNameEditorFull`).value));function c(){let e=+a(`stateNameEditor`).dataset.state,t=pack.states[e].culture,n=Names.getState(Names.getCultureShort(t),t);a(`stateNameEditorShort`).value=n}function l(){let t=e(Names.nameBases.length-1),n=Names.getState(Names.getBase(t),void 0,t);a(`stateNameEditorShort`).value=n}function d(){let e=r.value,t=r.style.display===`inline-block`;r.style.display=t?`none`:`inline-block`,o.style.display=t?`inline-block`:`none`,e&&t&&i(o,e),r.value=``}function f(){let e=a(`stateNameEditorShort`).value,n=a(`stateNameEditorSelectForm`).value;a(`stateNameEditorFull`).value=r();function r(){if(!n)return e;if(!e&&n)return`The ${n}`;let r=a(`stateNameEditorFullRegenerate`),i=+r.dataset.tick;return r.dataset.tick=String(i+1),i%2?`${t(e)} ${n}`:`${n} of ${e}`}}function p(e){let t=a(`stateNameEditorShort`).value.trim(),n=a(`stateNameEditorSelectForm`).value,r=a(`stateNameEditorFull`).value.trim(),i=e.fullName,o=t!==e.name||n!==(e.formName??``)||r!==i;t&&t!==e.name&&States.rename(e.i,t),n!==(e.formName??``)&&States.setForm(e.i,n),r&&r!==i&&States.setFullName(e.i,r),o&&a(`stateNameEditorUpdateLabel`).checked&&(e.label?.text&&delete e.label.text,w.draw(`labels`)),B()}}function be(){k(`stateNameEditor`);let e=`<div id="stateNameEditor" class="dialog" data-state="0">
      <div>
        <div data-tip="State short name" class="label">Short name:</div>
        <input
          id="stateNameEditorShort"
          data-tip="Type to change the short name"
          autocorrect="off"
          spellcheck="false"
          style="width: 11em"
        />
        <span id="stateNameEditorShortSpeak" data-tip="Speak the name. You can change voice and language in options" class="speaker">🔊</span>
        <span
          id="stateNameEditorShortCulture"
          data-tip="Generate culture-specific name"
          class="icon-book pointer"
        ></span>
        <span id="stateNameEditorShortRandom" data-tip="Generate random name" class="icon-globe pointer"></span>
      </div>
      <div data-tip="Select form name">
        <div data-tip="State form name" class="label">Form name:</div>
        <select id="stateNameEditorSelectForm" style="width: 11em">
          <option value="">blank</option>
          ${Object.entries(ce).map(([e,t])=>`<optgroup label="${e}">${t.map(e=>`<option value="${e}">${e}</option>`).join(``)}</optgroup>`).join(``)}
        </select>
        <input
          id="stateNameEditorCustomForm"
          placeholder="type form name"
          data-tip="Enter custom form name"
          style="display: none; width: 11em"
        />
        <span
          id="stateNameEditorAddForm"
          data-tip="Click to add custom state form name to the list"
          class="icon-plus pointer"
        ></span>
      </div>
      <div>
        <div data-tip="State full name" class="label">Full name:</div>
        <input
          id="stateNameEditorFull"
          data-tip="Type to change the full name"
          autocorrect="off"
          spellcheck="false"
          style="width: 11em"
        />
        <span id="stateNameEditorFullSpeak" data-tip="Speak the name. You can change voice and language in options" class="speaker">🔊</span>
        <span
          id="stateNameEditorFullRegenerate"
          data-tip="Click to re-generate full name"
          data-tick="0"
          class="icon-arrows-cw pointer"
        ></span>
      </div>
      <div data-tip="Uncheck to not update state label on name change" style="padding-block: 0.2em">
        <input id="stateNameEditorUpdateLabel" class="checkbox" type="checkbox" checked />
        <label for="stateNameEditorUpdateLabel" class="checkbox-label"><i>Update label on Apply</i></label>
      </div>
    </div>`;a(`dialogs`).insertAdjacentHTML(`beforeend`,e)}function xe(){$(`#stateNameEditor`).dialog(`destroy`),a(`stateNameEditor`).remove()}function Se(e){let t=pack.states[e];if(!t.cells){D(`State does not have any cells, cannot change population`,!1,`error`);return}let n=c((t.rural||0)*options.map.units.population.scale),r=c((t.urban||0)*options.map.units.population.scale*options.map.units.population.urbanization.rate),i=n+r,o=e=>Number(e).toLocaleString();alertMessage.innerHTML=`<div>
    <i>Change population of all cells assigned to the state</i>
    <div style="margin: 0.5em 0">
      Rural: <input type="number" min="0" step="1" id="ruralPop" value=${n} style="width:6em" />
      Urban: <input type="number" min="0" step="1" id="urbanPop" value=${r} style="width:6em" />
    </div>
    <div>Total population: ${o(i)} ⇒ <span id="totalPop">${o(i)}</span>
      (<span id="totalPopPerc">100</span>%)
    </div>
  </div>`;let s=a(`ruralPop`),l=a(`urbanPop`),u=a(`totalPop`),d=a(`totalPopPerc`),f=()=>{let e=s.valueAsNumber+l.valueAsNumber;Number.isNaN(e)||(u.innerHTML=o(e),d.innerHTML=String(c(e/i*100)))};s.oninput=()=>f(),l.oninput=()=>f(),$(`#alert`).dialog({resizable:!1,title:`Change state population`,width:`24em`,buttons:{Apply:function(){p(),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`}});function p(){try{States.setPopulation(e,+s.value||0,+l.value||0)}catch(e){D(m(e),!1,`error`);return}w.draw(`population`),B()}}function Ce(e){let t=pack.states[e];if(!e||!t||t.removed)return;let n=c(t.pollTax*((t.rural||0)+(t.urban||0)),2),r=pack.deals.reduce((t,n)=>{if(!n.tax)return t;let r=0;if(n.sellerType===`burg`)r=pack.burgs[n.seller]?.state||0;else if(n.sellerType===`market`){let e=Markets.get(n.seller)?.centerBurgId;r=e&&pack.burgs[e]?.state||0}return r===e?t+n.tax:t},0);alertMessage.innerHTML=`<div data-tip="Sales tax is applied to deals with a seller from the state. Poll tax is applied to all population of the state. Tax changes take effect on Production regeneration" style="margin: 0.6em 0; display: grid; grid-template-columns: 7em auto auto; row-gap: 0.4em; align-items: center">
      <label for="stateSalesTaxInput">Sales Tax:</label>
      <input id="stateSalesTaxInput" type="number" min="0" max="1" step="0.01" value="${t.salesTax}" style="width: 6em"/> = ${h(r)}
      <label for="statePollTaxInput">Poll Tax:</label>
      <input id="statePollTaxInput" type="number" min="0" max="10" step="0.01" value="${t.pollTax}" style="width: 6em"/> = ${h(n)}
      <label for="stateTreasuryInput">Treasury:</label>
      <input id="stateTreasuryInput" type="number" step="1" value="${t.treasury}" style="width: 6em" />
    </div>`,$(`#alert`).dialog({resizable:!1,title:`Taxes and Treasury: ${t.name}`,width:`26em`,buttons:{Apply:function(){let n=a(`stateSalesTaxInput`),r=a(`statePollTaxInput`),i=a(`stateTreasuryInput`),o=Math.max(0,Math.min(1,+n.value)),s=Math.max(0,+r.value),c=+i.value;States.setTaxes(e,Number.isFinite(o)?o:t.salesTax,Number.isFinite(s)?s:t.pollTax),Number.isFinite(c)&&States.setTreasury(e,c),B(),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`}})}function we(e){let t=pack.states[e].capital,{x:n,y:r}=pack.burgs[t];zoomTo(n,r,8,2e3)}function Te(e,t,n){States.setCulture(e,+n),t.dataset.base=String(+n)}function Ee(e,t,n){States.setType(e,n),t.dataset.type=n,q()}function De(e,t,n){let r=Number(n);r>=0&&r<=99&&(States.setExpansionism(e,r),t.dataset.expansionism=n,q())}function Oe(e,t){if(customization)return;let n=d(`#statesBody`).select(`#state${e}`).attr(`d`),r=`focusState${e}`;t.contains(`inactive`)?te(r,n):C(r),t.toggle(`inactive`)}function ke(e){customization||j({title:`Remove state`,message:`Are you sure you want to remove the state? <br>This action cannot be reverted`,confirm:`Remove`,onConfirm:()=>Ae(e)})}function Ae(e){C(`focusState${e}`),S(`state`,e);for(let t of pack.states[e].provinces||[])S(`province`,t);States.remove(e),d(`#debug`).selectAll(`.highlight`).remove(),w.draw(`burgIcons`,`labels`,`military`,`borders`,`provinces`,`states`),B()}function je(){if(b(F)){v(F);return}let e=pack.states.filter(e=>e.i&&!e.removed&&e.cells).sort((e,t)=>(t.area??0)-(e.area??0)).map(e=>[e.i,e.color,e.name]);if(!e.length)return void D(`No states to show`,!1,`error`);y(F,e)}function G(){if(a(`statesBodySection`).dataset.type===`absolute`){a(`statesBodySection`).dataset.type=`percentage`;let e=+a(`statesFooterBurgs`).innerText,t=+a(`statesFooterArea`).dataset.area,n=+a(`statesFooterPopulation`).dataset.population,r=pack.states.reduce((e,t)=>e+(t.treasury||0),0),i=pack.states.reduce((e,t)=>e+(t.i&&!t.removed&&t.cells||0),0);a(`statesBodySection`).querySelectorAll(`:scope > .states`).forEach(a=>{let{burgs:o,area:s,population:l,treasury:u,cells:d}=a.dataset;a.querySelector(`.stateBurgs`).innerText=`${c(+o/e*100)}%`,a.querySelector(`.stateCells`).innerText=`${c(+d/i*100)}%`,a.querySelector(`.stateArea`).innerText=`${c(+s/t*100)}%`,a.querySelector(`.statePopulation`).innerText=`${c(+l/n*100)}%`,a.querySelector(`.stateTreasury`).innerText=`${c(+u/r*100,2)}%`})}else a(`statesBodySection`).dataset.type=`absolute`,R.refresh()}function K(){let e=pack.states.filter(e=>!e.removed);if(e.length<2){D(`There are no states to show`,!1,`error`);return}let t=ne().id(e=>String(e.i)).parentId(e=>e.i?`0`:null)(e).sum(e=>e.area).sort((e,t)=>t.value-e.value),n=150+200*a(`uiSize`).valueAsNumber,i={top:0,right:-50,bottom:0,left:-50},o=n-i.left-i.right,l=n-i.top-i.bottom,u=re().size([o,l]).padding(3);alertMessage.innerHTML=`<select id="statesTreeType" style="display:block; margin-left:13px; font-size:11px">
    <option value="area" selected>Area</option>
    <option value="population">Total population</option>
    <option value="rural">Rural population</option>
    <option value="urban">Urban population</option>
    <option value="burgs">Burgs number</option>
  </select>`,alertMessage.innerHTML+=`<div id='statesInfo' class='chartInfo'>&#8205;</div>`;let p=d(`#alertMessage`).insert(`svg`,`#statesInfo`).attr(`id`,`statesTree`).attr(`width`,n).attr(`height`,n).style(`font-family`,`Almendra SC`).attr(`text-anchor`,`middle`).attr(`dominant-baseline`,`central`).append(`g`).attr(`transform`,`translate(-50, 0)`);a(`statesTreeType`).addEventListener(`change`,b),u(t);let m=p.selectAll(`g`).data(t.leaves()).enter().append(`g`).attr(`transform`,e=>`translate(${e.x},${e.y})`).attr(`data-id`,e=>e.data.i).on(`mouseenter`,(e,t)=>v(e,t)).on(`mouseleave`,e=>y(e));m.append(`circle`).attr(`fill`,e=>e.data.color).attr(`r`,e=>e.r);let h=/(?=[A-Z][^A-Z])/g,_=e=>(r(e.split(h).map(e=>e.length))??0)+1;m.append(`text`).attr(`text-rendering`,`optimizeSpeed`).style(`font-size`,e=>`${c(e.r**.97*4/_(e.data.name),2)}px`).selectAll(`tspan`).data(e=>e.data.name.split(h)).join(`tspan`).attr(`x`,0).text(e=>e).attr(`dy`,(e,t,n)=>`${t?1:(n.length-1)/-2}em`);function v(e,t){d(e.target).select(`circle`).classed(`selected`,!0);let n=t.data.fullName,r=`${s(t.data.area)} ${f()}`,i=c(t.data.rural*options.map.units.population.scale),o=c(t.data.urban*options.map.units.population.scale*options.map.units.population.urbanization.rate),l=a(`statesTreeType`).value,u=l===`area`?`Area: ${r}`:l===`rural`?`Rural population: ${g(i)}`:l===`urban`?`Urban population: ${g(o)}`:l===`burgs`?`Burgs number: ${t.data.burgs}`:`Population: ${g(i+o)}`;a(`statesInfo`).innerHTML=`${n}. ${u}`,U(e)}function y(e){W(),document.getElementById(`statesInfo`)&&(a(`statesInfo`).innerHTML=`&#8205;`,d(e.target).select(`circle`).classed(`selected`,!1))}function b(){let e=this.value===`area`?e=>e.area:this.value===`rural`?e=>e.rural:this.value===`urban`?e=>e.urban:this.value===`burgs`?e=>e.burgs:e=>e.rural+e.urban;t.sum(e),m.data(u(t).leaves()),m.transition().duration(1500).attr(`transform`,e=>`translate(${e.x},${e.y})`),m.select(`circle`).transition().duration(1500).attr(`r`,e=>e.r),m.select(`text`).transition().duration(1500).style(`font-size`,e=>`${c(e.r**.97*4/_(e.data.name),2)}px`)}$(`#alert`).dialog({title:`States bubble chart`,width:`fit-content`,position:{my:`left bottom`,at:`left+10 bottom-10`,of:`svg`},buttons:{},close:()=>{alertMessage.innerHTML=``}})}function Me(){a(`statesBottom`).querySelectorAll(`:scope > button`).forEach(e=>{e.style.display=`none`}),a(`statesRegenerateButtons`).style.display=`block`}function q(e){if(!(!e&&!a(`statesAutoChange`).checked)){if(States.recalculate(),w.draw(`states`,`borders`,`provinces`,`goods`,`emblems`),a(`adjustLabels`).checked){for(let e of pack.states)e.label&&(e.label.pathPoints=void 0);w.draw(`labels`)}B()}}function Ne(){pack.states.forEach(e=>{if(!e.i||e.removed)return;let t=c(Math.random()*4+1,1);e.expansionism=t,a(`statesBodySection`).querySelector(`div.states[data-id='${e.i}'] input.statePower`).value=String(t)}),q(!0)}function Pe(){a(`statesBottom`).querySelectorAll(`:scope > button`).forEach(e=>{e.style.display=`inline-block`}),a(`statesRegenerateButtons`).style.display=`none`}function Fe(){w.show(`states`);let e=a(`adjustLabels`).checked;O.PaintEditor.open({title:`Paint States`,parentDialogId:P,onClose:z,items:pack.states.filter(e=>!e.removed).map(e=>({id:e.i,name:e.name,color:e.color||`#ffffff`})),dontOverrideControl:!0,getValue:e=>pack.cells.state[e],filterCell:(e,t)=>_(e,pack)&&e!==pack.states[t].center,onApply:t=>J(t,e)})}function J(e,t){if(!e.size)return;let n=new Set;for(let[t,r]of o(e)){for(let e of r)n.add(pack.cells.state[e]).add(t);States.setCells(t,r)}if(w.draw(`states`,`borders`,`provinces`,`emblems`),t){for(let e of n)delete pack.states[e].label;w.draw(`labels`)}document.getElementById(P)&&B()}function Ie(){if(this.classList.contains(`pressed`)){Y();return}customization=3,this.classList.add(`pressed`),D(`Click on the map to create a new capital or promote an existing burg`,!0),d(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,Le),a(`statesBodySection`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.pointerEvents=`none`})}function Le(e){let[t,r]=n(e,this),i=pack.cells.burg[Pack.findCell(t,r)],a;try{a=States.add(t,r)}catch(e){D(m(e),!1,`error`);return}e.shiftKey===!1&&Y(),i||x(`burg`,pack.states[a].capital),x(`state`,a),w.hide(`provinces`),w.draw(`burgIcons`,`labels`,`routes`,`states`,`borders`),R.refresh()}function Y(){customization=0,se(),ie(),a(`statesBodySection`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.removeProperty(`pointer-events`)});let e=a(`statesAdd`);e.classList.contains(`pressed`)&&e.classList.remove(`pressed`)}var X=e=>`<svg class="coaIcon" viewBox="0 0 200 200"><use href="#stateCOA${e}"></use></svg>`;function Re(){let e=pack.states.filter(e=>e.i&&!e.removed).map(e=>`
      <div data-id="${e.i}" data-tip="${e.fullName}" style="cursor:default">
        <input type="radio" name="rulingState" value="${e.i}" />
        <input id="selectState${e.i}" class="checkbox" type="checkbox" name="statesToMerge" value="${e.i}" />
        <label for="selectState${e.i}" class="checkbox-label"><fill-box fill="${e.color}" disabled></fill-box>${X(e.i)}${e.fullName}</label>
      </div>
    `).join(``);alertMessage.innerHTML=`
    <form id='mergeStatesForm' style="overflow: hidden; display: flex; flex-direction: column; gap: 1em;">
      <p style="margin:0">
        Check the <b>checkbox</b> next to each state you want to merge.
        Use the <b>radio button</b> to pick the <em>ruling state</em> that will absorb all others (its name, color, and capital will be kept).
        Hover over a row to highlight the state on the map.
      </p>
      <main style='display: grid; grid-template-columns: 1fr 1fr; gap: .3em;'>
        ${e}
      </main>
    </form>
  `,a(`mergeStatesForm`).querySelectorAll(`div[data-id]`).forEach(e=>{e.addEventListener(`mouseenter`,t),e.addEventListener(`mouseleave`,W)}),N(`alert`,({cellId:e})=>pack.cells.state[e]);function t(e){if(!w.isOn(`states`))return;let t=+e.currentTarget.dataset.id;if(!t)return;let n=d(`#regions`).select(`#state${t}`).attr(`d`);n&&(W(),T(n))}$(`#alert`).dialog({width:600,title:`Merge states`,close:W,buttons:{Merge:function(){let e=new FormData(a(`mergeStatesForm`)),t=Number(e.get(`rulingState`));if(!t){D(`Please select a state to merge into`,!1,`error`);return}let n=e.getAll(`statesToMerge`).map(Number).filter(e=>e!==t);if(!n.length){D(`Please select several states to merge`,!1,`error`);return}Z(n,t,()=>$(this).dialog(`close`))},Cancel:function(){$(this).dialog(`close`)}}})}function Z(e,t,n){let r=pack.states[t],i=`${X(r.i)}${r.name}`;j({title:`Merge states`,message:`
      <p>The following states will be <strong>removed</strong>: ${e.map(e=>`${X(e)}${pack.states[e].name}`).join(`, `)}.</p>
      <p>Removed states data (burgs, provinces, regiments) will be assigned to ${i}.</p>
      <label style="display: flex; align-items: center"><input id="mergeStatesAsProvinces" class="checkbox native" type="checkbox"> Keep each removed state as a province of ${i}, replacing its own provinces</label>
      <p>Are you sure you want to merge states? This action cannot be reverted.</p>`,confirm:`Merge`,onConfirm:()=>{ze(e,t,a(`mergeStatesAsProvinces`).checked),n?.()}})}var Q=me({buttonId:`statesAnnex`,bodySectionId:`statesBodySection`,noun:`state`,ownerOf:e=>pack.cells.state[e],colorOf:e=>pack.states[e].color??`#999999`,nameOf:e=>pack.states[e].name,commit:(e,t)=>Z(t,e)});function ze(e,t,n=!1){for(let t of e)S(`state`,t);States.merge(t,e,n),C(),d(`#debug`).selectAll(`.highlight`).remove(),w.draw(`states`,`borders`,`burgIcons`,`labels`,`provinces`,`military`,`emblems`),n&&w.show(`provinces`),B()}function Be(){let e=`Id,State,Full Name,Form,Color,Capital,Culture,Type,Expansionism,Cells,Burgs,Area ${f(`2`)},Total Population,Rural Population,Urban Population`,t=R.view().all.map(e=>{let t=e.rural||0,n=e.urban||0,r=c(t*options.map.units.population.scale+n*options.map.units.population.scale*options.map.units.population.urbanization.rate);return[e.i,e.name,e.fullName||``,e.i?e.formName:``,e.i?e.color:``,e.i?pack.burgs[e.capital].name:``,e.i?pack.cultures[e.culture].name:``,e.i?e.type:``,e.i?e.expansionism:``,e.cells,e.burgs,s(e.area||0),r,Math.round(t*options.map.units.population.scale),Math.round(n*options.map.units.population.scale*options.map.units.population.urbanization.rate)].join(`,`)});l([e].concat(t).join(`
`),`${p(`States`)}.csv`)}function Ve(e,t){States.setLocked(e,!pack.states[e].lock),t.toggle(`icon-lock-open`),t.toggle(`icon-lock`)}var He={open:z,showChart:K};export{He as StatesEditor};