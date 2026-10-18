import{Bt as e,Jn as t,L as n,P as r,Q as i,_ as a,ar as o,et as s,jn as c,n as ee,p as te,qn as l,rr as u}from"./utils-Dk4MDzbZ.js";import{Q as ne,it as re,t as d,tt as ie}from"./layers-BpUy7Q_B.js";import{i as ae}from"./emblems-generator-CFXxHBH0.js";import{i as f,t as p}from"./tooltips-3xx1wzLl.js";import{t as m}from"./controllers-C2OtiXZ_.js";import{i as oe,n as h,o as se,r as g}from"./dialog-helpers-MF-Ear8n.js";import{t as ce}from"./viewbox-events-bX9taDxt.js";import{i as _,r as v,t as le}from"./town-plans-CSwL3uPD.js";var y={k:1,x:0,y:0};function b({k:e,x:t,y:n},r){return{k:e,x:u(t,r.width*(1-e),0),y:u(n,r.height*(1-e),0)}}function x(e,t,n,r,i=32){let a=u(e.k*n,1,Math.max(1,i)),o=a/e.k;return b({k:a,x:t.x-(t.x-e.x)*o,y:t.y-(t.y-e.y)*o},r)}function ue(e,t,n,r){return b({k:e.k,x:e.x+t,y:e.y+n},r)}var S=null,C=null,w={...y},T=32,E=1,D=0,O=!1;function de(e){customization||(h(`.stable`),d.show(`burgIcons`,`labels`),C=+e,S=c(`#labels`).select(`[data-label-type='burg'][data-id='${e}']`),S.size()||(S=c(`#burgIcons`).select(`[data-id='${e}']`)),fe(),r(`burgEditor`).dataset.entity=`burg:${C}`,pe(),A(),$(`#burgEditor`).dialog({title:`Edit Burg`,resizable:!1,close:Ie,position:{my:`left top`,at:`left+10 top+10`,of:`svg`,collision:`fit`}}))}function fe(){oe(`burgEditor`);let e=`<div id="burgEditor" class="dialog" data-burg-id="${k()}">
      <div id="burgBody" style="padding-bottom: 0.3em">
        <div style="display: flex; align-items: center">
          <svg data-tip="Burg emblem. Click to edit" class="pointer" viewBox="0 0 200 200" width="13em" height="13em">
            <use id="burgEmblem"></use>
          </svg>
          <div style="display: grid; grid-auto-rows: minmax(1.6em, auto)">
            <div id="burgProvinceAndState" style="font-weight: bold; max-width: 16em"></div>
            <div>
              <div class="label">Name:</div>
              <input
                id="burgName"
                data-tip="Type to rename the burg"
                autocorrect="off"
                spellcheck="false"
                style="width: 9em"
              />
              <span id="burgNameSpeak" data-tip="Speak the name. You can change voice and language in options" class="speaker">🔊</span>
              <span
                id="burgNameReRandom"
                data-tip="Generate random name for the burg"
                class="icon-globe pointer"
              ></span>
            </div>
            <div data-tip="Select burg group. Groups defines burg icon, label size and style">
              <div class="label">Group:</div>
              <select id="burgGroup" style="width: 9em"></select>
              <span id="burgGroupConfigure" data-tip="Configure burg groups" class="icon-cog pointer"></span>
            </div>
            <div data-tip="Select burg type. Type slightly affects emblem generation">
              <div class="label">Type:</div>
              <select id="burgType" style="width: 9em">
                <option value="Generic">Generic</option>
                <option value="River">River</option>
                <option value="Lake">Lake</option>
                <option value="Naval">Naval</option>
                <option value="Nomadic">Nomadic</option>
                <option value="Hunting">Hunting</option>
                <option value="Highland">Highland</option>
              </select>
            </div>
            <div data-tip="Select dominant culture">
              <div class="label">Culture:</div>
              <select id="burgCulture" style="width: 9em"></select>
              <span
                id="burgNameReCulture"
                data-tip="Generate culture-specific name for the burg"
                class="icon-book pointer"
              ></span>
            </div>
            <div data-tip="Set burg population">
              <div class="label">Population:</div>
              <input id="burgPopulation" type="number" min="0" step="1" style="width: 9em" />
            </div>
            <div data-tip="Burg average yearly temperature" style="display: flex; justify-content: space-between">
              <div>
                <div class="label">Temperature:</div>
                <span id="burgTemperature"></span>
              </div>
              <div style="display: flex; gap: 0.5em">
                <i class="icon-info-circled" id="burgTemperatureLikeIn"></i>
                <i
                  id="burgTemperatureGraph"
                  data-tip="Show temperature graph for the burg"
                  class="icon-chart-area pointer"
                ></i>
              </div>
            </div>
            <div data-tip="Burg height above mean sea level">
              <div class="label">Elevation:</div>
              <span id="burgElevation"></span> above sea level
            </div>
            <div>
              <div class="label">Features:</div>
              <span
                id="burgCapital"
                data-tip="Shows whether the burg is a state capital. Click to toggle"
                data-feature="capital"
                class="burgFeature icon-star"
              ></span>
              <span
                id="burgPort"
                data-tip="Shows whether the burg is a port. Click to toggle"
                data-feature="port"
                class="burgFeature icon-anchor"
              ></span>
              <span
                id="burgCitadel"
                data-tip="Shows whether the burg has a citadel (castle). Click to toggle"
                data-feature="citadel"
                class="burgFeature icon-chess-rook"
                style="font-size: 1.1em"
              ></span>
              <span
                id="burgWalls"
                data-tip="Shows whether the burg is walled. Click to toggle"
                data-feature="walls"
                class="burgFeature icon-fort-awesome"
              ></span>
              <span
                id="burgPlaza"
                data-tip="Shows whether the burg is a trade center (market center). Click to toggle"
                data-feature="plaza"
                class="burgFeature icon-store"
                style="font-size: 1em"
              ></span>
              <span
                id="burgTemple"
                data-tip="Shows whether the burg is a religious center. Click to toggle"
                data-feature="temple"
                class="burgFeature icon-chess-bishop"
                style="font-size: 1.1em; margin-left: 3px"
              ></span>
              <span
                id="burgShanty"
                data-tip="Shows whether the burg has a shanty town. Click to toggle"
                data-feature="shanty"
                class="burgFeature icon-campground"
                style="font-size: 1em"
              ></span>
            </div>
            <div data-tip="Burg average daily production">
              <div class="label">Production:</div>
              <span id="burgProduction" style="display: inline-flex; flex-wrap: wrap; column-gap: 0.3em; max-width: 110px;"></span>
            </div>
            <div data-tip="Gross product per population point, daily average">
              <div class="label">Wealth</div>
              <span id="burgWealth"></span>
            </div>
            <div data-tip="Set treasury balance. Production won't be changed automatically">
              <div class="label"><label for="burgTreasury">Treasury:</label></div>
              <input id="burgTreasury" type="number" step="0.01" style="width: 9em" /> 🟡
            </div>
          </div>
        </div>
        <div id="burgPreviewSection" data-tip="Burg map preview: scroll to zoom, drag to pan" style="display: flex; flex-direction: column">
          <div style="display: flex; justify-content: space-between">
            <span>Burg preview:</span>
            <div style="display: flex; gap: 0.5em">
              <i id="burgPreviewReset" data-tip="Reset preview zoom" class="icon-ccw pointer"></i>
              <i id="burgLinkOpen" data-tip="Open burg map in a new tab" class="icon-link-ext pointer"></i>
            </div>
          </div>
          <div
            id="burgPreviewObject"
            style="overflow: hidden; position: relative; touch-action: none; height: 320px; max-width: 60vw; max-height: 60vh"
          ></div>
        </div>
      </div>
      <div id="burgBottom">
        <button id="burgStyleShow" data-tip="Show style edit section" class="icon-brush"></button>
        <div id="burgStyleSection" style="display: none">
          <button id="burgStyleHide" data-tip="Hide style edit section" class="icon-brush"></button>
          <button
            id="burgEditLabelStyle"
            data-tip="Edit label style for burg group in Style Editor"
            class="icon-font"
          ></button>
          <button
            id="burgEditGroupStyle"
            data-tip="Edit icon and anchor style for the burg group in Style Editor"
            class="icon-dot-circled"
          ></button>
        </div>
        <button id="burgEditLabel" data-tip="Edit this burg label" class="icon-font"></button>
        <button id="burgEditEmblem" data-tip="Edit emblem" class="icon-shield-alt"></button>
        <button id="burgSetPreviewLink" data-tip="Set custom burg map URL" class="icon-map-o"></button>
        <button id="burgLocate" data-tip="Zoom map and center view in the burg" class="icon-target"></button>
        <button
          id="burgProductionOverview"
          data-tip="Show production overview for this burg"
          class="icon-chart-bar"
        ></button>
        <button
          id="burgRelocate"
          data-tip="Relocate burg. Click on map to move the burg"
          class="icon-map-pin"
        ></button>
        ${se(`burglLegend`,`this burg`)}
        <button id="burgLock" class="icon-lock-open" onmouseover="showElementLockTip(event)"></button>
        <button
          id="burgRemove"
          data-tip="Remove non-capital burg"
          data-shortcut="Delete"
          class="icon-trash fastDelete"
        ></button>
      </div>
    </div>`;r(`dialogs`).insertAdjacentHTML(`beforeend`,e),r(`burgName`).addEventListener(`input`,j),r(`burgNameSpeak`).addEventListener(`click`,()=>s(r(`burgName`).value)),r(`burgNameReRandom`).addEventListener(`click`,M),r(`burgGroup`).addEventListener(`change`,N),r(`burgGroupConfigure`).addEventListener(`click`,Fe),r(`burgType`).addEventListener(`change`,P),r(`burgCulture`).addEventListener(`change`,F),r(`burgNameReCulture`).addEventListener(`click`,I),r(`burgPopulation`).addEventListener(`change`,L),r(`burgTreasury`).addEventListener(`change`,R),r(`burgBody`).querySelectorAll(`.burgFeature`).forEach(e=>void e.addEventListener(`click`,z)),r(`burgLinkOpen`).addEventListener(`click`,Oe),r(`burgPreviewReset`).addEventListener(`click`,G),r(`burgPreviewObject`).addEventListener(`wheel`,Ce,{passive:!1}),r(`burgPreviewObject`).addEventListener(`dblclick`,we),r(`burgPreviewObject`).addEventListener(`pointerdown`,Te),r(`burgStyleShow`).addEventListener(`click`,ve),r(`burgStyleHide`).addEventListener(`click`,ye),r(`burgEditLabelStyle`).addEventListener(`click`,be),r(`burgEditGroupStyle`).addEventListener(`click`,Se),r(`burgEmblem`).addEventListener(`click`,Y),r(`burgSetPreviewLink`).addEventListener(`click`,ke),r(`burgEditEmblem`).addEventListener(`click`,Y),r(`burgLocate`).addEventListener(`click`,Ae),r(`burgEditLabel`).addEventListener(`click`,xe),r(`burgRelocate`).addEventListener(`click`,Z),r(`burglLegend`).addEventListener(`click`,Q),r(`burgLock`).addEventListener(`click`,_e),r(`burgRemove`).addEventListener(`click`,Pe),r(`burgTemperatureGraph`).addEventListener(`click`,Me),r(`burgProductionOverview`).addEventListener(`click`,Ne)}function k(){return C??+S.attr(`data-id`)}function pe(){let e=r(`burgGroup`);e.options.length=0;for(let{name:t}of options.map.burgs.groups)e.options.add(new Option(t,t))}function A(){let e=k(),t=pack.burgs[e],n=pack.cells.province[t.cell],i=n?`${pack.provinces[n].fullName}, `:``,s=pack.states[t.state].fullName||pack.states[t.state].name;r(`burgProvinceAndState`).innerHTML=i+s,r(`burgName`).value=t.name,r(`burgGroup`).value=t.group,r(`burgType`).value=t.type||`Generic`,r(`burgPopulation`).value=String(o(t.population*options.map.units.population.scale*options.map.units.population.urbanization.rate)),r(`burgWealth`).innerHTML=`🟡 ${o(t.population>0?(t.product||0)/t.population:0,2)}`,r(`burgTreasury`).value=String(o(t.treasury||0,2));let c=r(`burgCulture`);c.options.length=0,pack.cultures.filter(e=>!e.removed).forEach(e=>void c.options.add(new Option(e.name,String(e.i),!1,e.i===t.culture)));let l=grid.cells.temp[pack.cells.g[t.cell]];r(`burgTemperature`).innerHTML=ee(l),r(`burgTemperatureLikeIn`).dataset.tip=`Average yearly temperature is like in ${a(l)}`,r(`burgElevation`).innerHTML=te(pack.cells.h[t.cell]),r(`burgCapital`).classList.toggle(`inactive`,!t.capital),r(`burgPort`).classList.toggle(`inactive`,!t.port),r(`burgCitadel`).classList.toggle(`inactive`,!t.citadel),r(`burgWalls`).classList.toggle(`inactive`,!t.walls),r(`burgPlaza`).classList.toggle(`inactive`,!t.plaza),r(`burgTemple`).classList.toggle(`inactive`,!t.temple),r(`burgShanty`).classList.toggle(`inactive`,!t.shanty),r(`burgProduction`).innerHTML=Le(Production.getBurgProduction(t)),V();let u=`burgCOA${e}`;re.trigger(u,t.coa),r(`burgEmblem`).setAttribute(`href`,`#${u}`),J(t)}function j(){let e=r(`burgName`).value;e.trim()&&(Burgs.rename(k(),e),d.draw(`labels`))}function M(){let t=e(Names.nameBases.length-1);r(`burgName`).value=Names.getBase(t),j()}function N(){let e=k(),t=pack.burgs[e];Burgs.changeGroup(t,this.value),d.draw(`burgIcons`,`labels`)}function P(){let e=k();Burgs.setType(e,this.value)}function F(){Burgs.setCulture(k(),+this.value)}function I(){let e=k(),t=pack.burgs[e].culture;r(`burgName`).value=Names.getCulture(t),j()}function L(){let e=k(),t=pack.burgs[e],n=r(`burgPopulation`).valueAsNumber;Number.isFinite(n)&&n>=0&&Burgs.setPopulation(e,n),J(t)}function R(){let e=pack.burgs[k()];try{Burgs.setTreasury(e.i,this.valueAsNumber)}catch{f(`Enter a valid treasury amount`,!1,`error`)}this.value=String(o(e.treasury||0,2))}function z(){let e=k(),t=pack.burgs[e],n=this.dataset.feature,r=Number(this.classList.contains(`inactive`));if(n===`plaza`&&!r){let t=pack.markets?.find(t=>t.centerBurgId===e);if(t){me(t);return}}n===`port`?he(e):n===`capital`?ge(e):Burgs.setBuilding(e,n,!!r),this.classList.toggle(`inactive`,!t[n]),J(t)}function me(e){g({title:`Remove market`,message:`This burg is the center of the market "${t(Markets.getName(e))}". Remove the market?<br>This action cannot be reverted`,confirm:`Remove`,onConfirm:()=>{Markets.removeMarket(e.i),d.draw(`markets`),A()}})}function he(e){B(()=>Burgs.setPort(e,!pack.burgs[e].port))&&d.draw(`burgIcons`)}function ge(e){if(pack.burgs[e].capital){f(`To change capital please assign a capital status to another burg of this state`,!1,`error`);return}B(()=>Burgs.setCapital(e))&&d.draw(`burgIcons`,`labels`)}function B(e){try{return e(),!0}catch(e){return f(l(e),!1,`error`),!1}}function _e(){let e=k();Burgs.setLocked(e,!pack.burgs[e].lock),V()}function V(){let e=k();pack.burgs[e].lock?(r(`burgLock`).classList.remove(`icon-lock-open`),r(`burgLock`).classList.add(`icon-lock`)):(r(`burgLock`).classList.remove(`icon-lock`),r(`burgLock`).classList.add(`icon-lock-open`))}function ve(){document.querySelectorAll(`#burgBottom > button`).forEach(e=>{e.style.display=`none`}),r(`burgStyleSection`).style.display=`inline-block`}function ye(){document.querySelectorAll(`#burgBottom > button`).forEach(e=>{e.style.display=`inline-block`}),r(`burgStyleSection`).style.display=`none`}function be(){let e=pack.burgs[k()];h(`.stable`),m.StyleEditor.open(`labels`,e.label?.group||e.group)}function xe(){let e=k();$(`#burgEditor`).dialog(`close`),m.LabelsEditor.open(`burg`,e)}function Se(){let e=pack.burgs[k()];h(`.stable`),m.StyleEditor.open(`burgIcons`,e.group)}function H(){let e=r(`burgPreviewObject`);return{width:e.clientWidth,height:e.clientHeight}}function U(){let e=r(`burgPreviewObject`),t=e.firstElementChild;if(!t)return;let{k:n,x:i,y:a}=w;t.style.transformOrigin=`0 0`,t.style.transform=`translate(${i}px, ${a}px) scale(${n/E})`,t.style.left=`0`,t.style.top=`0`,e.style.cursor=n>1?`grab`:`default`,clearTimeout(D),O||(D=window.setTimeout(W,200))}function W(){if(O)return;let e=r(`burgPreviewObject`).firstElementChild;if(!e)return;let{k:t,x:n,y:i}=w;E=t,e.style.width=`${t*100}%`,e.style.height=`${t*100}%`,e.style.transform=`none`,e.style.left=`${n}px`,e.style.top=`${i}px`}function G(){w={...y},clearTimeout(D),O?U():W(),r(`burgPreviewObject`).style.cursor=`default`}function K(e){let t=r(`burgPreviewObject`).getBoundingClientRect();return{x:e.clientX-t.left,y:e.clientY-t.top}}function Ce(e){e.preventDefault();let t=Math.exp(-e.deltaY*(e.deltaMode===1?.05:e.deltaMode?1:.002));w=x(w,K(e),t,H(),T),U()}function we(e){w=x(w,K(e),2,H(),T),U()}function Te(e){if(w.k<=1)return;e.preventDefault();let t=r(`burgPreviewObject`);t.setPointerCapture(e.pointerId),t.style.cursor=`grabbing`;let n={x:e.clientX,y:e.clientY},i=e=>{let t=e;w=ue(w,t.clientX-n.x,t.clientY-n.y,H()),n={x:t.clientX,y:t.clientY},U()},a=()=>{t.removeEventListener(`pointermove`,i),t.removeEventListener(`pointerup`,a),t.removeEventListener(`pointercancel`,a),t.style.cursor=`grab`};t.addEventListener(`pointermove`,i),t.addEventListener(`pointerup`,a),t.addEventListener(`pointercancel`,a)}var q=0;function Ee(){if(!q){let e=document.createElement(`canvas`).getContext(`webgl`);q=e?e.getParameter(e.MAX_TEXTURE_SIZE):4096}return q}function De(){let{width:e,height:t}=H(),n=Math.max(e,t,1);return Ee()/2/(devicePixelRatio*n)}function J(e){let t=Burgs.getPreview(e).preview,n=e.link?null:_(e.i);if(!n&&!t){r(`burgPreviewSection`).style.display=`none`;return}r(`burgPreviewSection`).style.display=`flex`;let i=r(`burgPreviewObject`);i.innerHTML=``;let a=document.createElement(n?`div`:`iframe`);if(a.style.position=`absolute`,a.style.border=`none`,a.style.pointerEvents=`none`,n)a.className=`tx-burgplan`,a.innerHTML=v(n),O=!1,E=1,T=32;else if(a.setAttribute(`sandbox`,`allow-scripts allow-same-origin`),a.src=t,O=t.includes(`watabou.github.io`),O){let e=Math.max(1,Math.min(4,De()));E=e,a.style.width=`${e*100}%`,a.style.height=`${e*100}%`,T=Math.min(32,e*2.5)}else E=1,T=32;i.insertBefore(a,null),G()}function Oe(){let e=k(),t=pack.burgs[e];if(!t.link){let e=_(t.i);if(e){le(v(e),e.name);return}}let n=Burgs.getPreview(t).link;n&&i(n)}function ke(){let e=k(),t=pack.burgs[e];prompt(`Provide custom URL to the burg map. It can be a link to a generator or just an image. Leave empty to use the default map preview`,{default:Burgs.getPreview(t).link||``,required:!1},n=>{try{Burgs.setLink(e,String(n??``))}catch(e){f(e.message,!1,`error`)}J(t)})}function Y(){let e=k(),t=pack.burgs[e];m.EmblemsEditor.open(`burg`,`burgCOA${e}`,t)}function Ae(){let e=k(),t=pack.burgs[e];zoomTo(t.x,t.y,8,2e3)}var X=!1;function Z(){r(`burgRelocate`).classList.toggle(`pressed`),r(`burgRelocate`).classList.contains(`pressed`)?(c(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,je),f(`Click on map to relocate burg. Hold Shift for continuous move`,!0),d.isOn(`cells`)||(d.show(`cells`),X=!0)):(p(),ce(),X&&=(d.hide(`cells`),!1))}function je(e){let[t,r]=n(e,this);B(()=>Burgs.move(k(),t,r))&&(d.draw(`burgIcons`,`labels`),e.shiftKey===!1&&Z())}function Q(){m.NotesEditor.open({type:`burg`,id:k()})}function Me(){let e=k();m.TemperatureGraph.open(e)}function Ne(){let e=k();m.ProductionOverview.open(e)}function Pe(){let e=k();pack.burgs[e].capital?(alertMessage.innerHTML=`You cannot remove the capital. You must change the state capital first`,$(`#alert`).dialog({resizable:!1,title:`Remove burg`,buttons:{Ok:function(){$(this).dialog(`close`)}}})):pack.markets?.some(t=>t.centerBurgId===e)?(alertMessage.innerHTML=`You cannot remove a market center burg. Please remove the market first`,$(`#alert`).dialog({resizable:!1,title:`Remove burg`,buttons:{Ok:function(){$(this).dialog(`close`)}}})):g({title:`Remove burg`,message:`Are you sure you want to remove the burg? <br>This action cannot be reverted`,confirm:`Remove`,onConfirm:()=>{Burgs.remove(e),ie(`burg`,e),d.draw(`burgIcons`,`labels`),$(`#burgEditor`).dialog(`close`)}})}function Fe(){m.BurgGroupEditor.open()}function Ie(){clearTimeout(D),r(`burgRelocate`).classList.contains(`pressed`)&&Z(),S=null,$(`#burgEditor`).dialog(`destroy`),r(`burgEditor`).remove()}function Le(e){if(!e)return``;let t=``,n=Object.entries(e).sort(([,e],[,t])=>t-e);for(let[e,r]of n){let n=Goods.get(+e);if(!n)continue;let{name:i,unit:a,icon:o}=n,s=r===1?a:`${a}s`;t+=`<span data-tip="${i}: ${r} ${s} per day">
      <svg class="resIcon" width="1em" height="1em"><use href="${ae.href(o)}"${ne()}></use></svg>
      <span style="margin: 0 0.2em 0 -0.2em">${r}</span>
    </span>`}return t}var Re={open:de};export{Re as BurgEditor};