import{F as e,Fn as t,P as n,Qt as r,Xn as i,Zn as a,ar as o,en as s,jn as c,m as l,n as u}from"./utils-Dk4MDzbZ.js";import{Ct as d,St as f,_t as p,bt as m,gt as h,t as g,vt as _,wt as v,xt as y,yt as b}from"./layers--lc146Vt.js";import{i as x}from"./tooltips-3xx1wzLl.js";import{t as S}from"./pins-L9rE4G31.js";import{i as C}from"./dialog-helpers-MF-Ear8n.js";function w(e){return function(t,n){var r=v(t*t+n*n),i=e(r),a=d(i),o=y(i);return[m(t*a,r*o),b(r&&n*a/r)]}}function T(e,t){return[y(t)*d(e),d(t)]}T.invert=w(b);function E(){return h(T).scale(249.5).clipAngle(90+f)}var D=p(E().translate([100,100]).scale(100));function O(){customization||(k(),I(),z(),R(),B(),$(`#worldConfigurator`).dialog({title:`Configure World`,resizable:!1,width:`minmax(40em, 85vw)`,buttons:{"Update world":L},open:function(){(this.parentElement?.querySelector(`.ui-dialog-buttonpane`))?.insertAdjacentHTML(`afterbegin`,`<div class="dontAsk" data-tip="Automatically update world on input changes and button clicks">
        <input id="wcAutoChange" class="checkbox" type="checkbox" checked />
        <label for="wcAutoChange" class="checkbox-label"><i>auto-apply changes</i></label>
      </div>`),(this.parentElement?.querySelector(`.ui-dialog-buttonset > button`))?.addEventListener(`mousemove`,()=>x(`Apply current settings to the map`))},close:()=>C(`worldConfigurator`)}))}function k(){C(`worldConfigurator`),n(`dialogs`).insertAdjacentHTML(`beforeend`,A()),j()}function A(){let e=(e,t,n)=>`<div>
    <i data-locked="0" id="lock_${e}" class="icon-lock-open"></i>
    <label data-tip="${n}">
      <i>${t}:</i>
      <input id="${e}Input" type="number" min="-50" max="50" />
      <span>°C<span id="${e}Converted"></span></span>
      <input id="${e}Output" type="range" min="-50" max="50" />
    </label>
  </div>`;return`<div id="worldConfigurator" class="dialog stable">
    <div style="display: flex">
      <div id="worldControls">
        ${e(`temperatureEquator`,`Equator`,`Set temperature at equator`)}
        ${e(`temperatureNorthPole`,`North Pole`,`Set the North Pole average yearly temperature`)}
        ${e(`temperatureSouthPole`,`South Pole`,`Set the South Pole average yearly temperature`)}
        <div>
          <i data-locked="0" id="lock_mapSize" class="icon-lock-open"></i>
          <label data-tip="Set map size relative to the world size">
            <i>Map size:</i>
            <input id="mapSizeInput" type="number" min="1" max="100" step="0.1" />%
            <input id="mapSizeOutput" type="range" min="1" max="100" step="0.1" />
          </label>
        </div>
        <div>
          <i data-locked="0" id="lock_latitude" class="icon-lock-open"></i>
          <label data-tip="Set a North-South map shift, set to 50 to make map center lie on Equator">
            <i>Latitudes:</i>
            <input id="latitudeInput" type="number" min="0" max="100" step="0.1" />
            <br /><i>N</i
            ><input
              id="latitudeOutput"
              type="range"
              min="0"
              max="100"
              step="0.1"
              style="width: 10.3em"
            /><i>S</i>
          </label>
        </div>
        <div>
          <i data-locked="0" id="lock_longitude" class="icon-lock-open"></i>
          <label data-tip="Set a West-East map shift, set to 50 to make map center lie on Prime meridian">
            <i>Longitudes:</i>
            <input id="longitudeInput" type="number" min="0" max="100" step="0.1" />
            <br /><i>W</i
            ><input
              id="longitudeOutput"
              type="range"
              min="0"
              max="100"
              step="0.1"
              style="width: 10.3em"
            /><i>E</i>
          </label>
        </div>
        <div>
          <label
            data-tip="Set precipitation - water amount clouds can bring. Defines rivers and biomes generation. Keep around 100% for default generation"
          >
            <i data-locked="0" id="lock_prec" class="icon-lock-open"></i>
            <i>Precipitation:</i>
            <input id="precInput" type="number" />%
            <input id="precOutput" type="range" min="0" max="500" />
          </label>
        </div>
        <div data-tip="The coordinate extent this map was generated on. The next map's is set in Options">
          <i>Map size:</i><br />
          <span id="mapSize"></span> px = <span id="mapSizeFriendly"></span>
        </div>
        <div>
          <i data-tip="Length of Meridian. Almost half of the equator length">Meridian length:</i><br />
          <span id="meridianLength" data-tip="Length of Meridian in pixels"></span> px =
          <span
            id="meridianLengthFriendly"
            data-tip="Length of Meridian is friendly units (depends on user configuration)"
          ></span>
          <span
            id="meridianLengthEarth"
            data-tip="Fantasy world Meridian length relative to real-world Earth (20k km)"
          ></span>
        </div>
        <div data-tip="Map coordinates on globe"><i>Coords:</i> <span id="mapCoordinates"></span></div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end">
        <svg id="globe" width="22em" viewBox="-20 -25 240 240">
          <defs>
            <linearGradient id="temperatureGradient" x1="0" x2="0" y1="0" y2="1">
              <stop id="grad90" offset="0%" stop-color="blue" />
              <stop id="grad60" offset="16.6%" stop-color="green" />
              <stop id="grad30" offset="33.3%" stop-color="yellow" />
              <stop id="grad0" offset="50%" stop-color="red" />
              <stop id="grad-30" offset="66.6%" stop-color="yellow" />
              <stop id="grad-60" offset="83.3%" stop-color="green" />
              <stop id="grad-90" offset="100%" stop-color="blue" />
            </linearGradient>
          </defs>
          <g id="globeNoteLines">
            <line x1="5" x2="220" y1="0" y2="0" />
            <line x1="5" x2="220" y1="13" y2="13" />
            <line x1="5" x2="220" y1="49.5" y2="49.5" />
            <line x1="-5" x2="220" y1="100" y2="100" />
            <line x1="5" x2="220" y1="150.5" y2="150.5" />
            <line x1="5" x2="220" y1="187" y2="187" />
            <line x1="5" x2="220" y1="200" y2="200" />
          </g>
          <g id="globeWindArrows" data-tip="Click to change wind direction" stroke-linejoin="round">
            <circle cx="210" cy="6" r="12" />
            <path data-tier="0" d="M210,11 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(225 210 6)" />
            <circle cx="210" cy="30" r="12" />
            <path data-tier="1" d="M210,35 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(45 210 30)" />
            <circle cx="210" cy="75" r="12" />
            <path data-tier="2" d="M210,80 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(225 210 75)" />
            <circle cx="210" cy="130" r="12" />
            <path data-tier="3" d="M210,135 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(315 210 130)" />
            <circle cx="210" cy="173" r="12" />
            <path data-tier="4" d="M210,178 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(135 210 173)" />
            <circle cx="210" cy="194" r="12" />
            <path data-tier="5" d="M210,199 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(315 210 194)" />
          </g>
          <g id="globaAxisLabels">
            <text x="82%" y="-4%">wind</text>
            <text x="-8%" y="-4%">latitude</text>
          </g>
          <g id="globeLatLabels">
            <text x="-15" y="5">90°</text>
            <text x="-15" y="18">60°</text>
            <text x="-15" y="53">30°</text>
            <text x="-15" y="103">0°</text>
            <text x="-15" y="153">30°</text>
            <text x="-15" y="190">60°</text>
            <text x="-15" y="204">90°</text>
          </g>
          <circle id="globeGradient" cx="100" cy="100" r="100" fill="url(#temperatureGradient)" stroke="none" />
          <line id="globePrimeMeridian" x1="100" x2="100" y1="0" y2="200" />
          <line id="globeEquator" x1="1" x2="200" y1="100" y2="100" />
          <circle id="globeOutline" cx="100" cy="100" r="100" fill="none" />
          <path id="globeGraticule" />
          <path id="globeArea" />
        </svg>
        <button id="restoreWinds" data-tip="Click to restore default (Earth-based) wind directions">
          Restore winds
        </button>
      </div>
    </div>
    <div style="margin-top: 0.3em">
      <i>Presets:</i>
      <button id="wcWholeWorld" data-tip="Click to set map size to cover the whole world">Whole world</button>
      <button id="wcNorthern" data-tip="Click to set map size to cover the Northern latitudes">Northern</button>
      <button id="wcTropical" data-tip="Click to set map size to cover the Tropical latitudes">Tropical</button>
      <button id="wcSouthern" data-tip="Click to set map size to cover the Southern latitudes">Southern</button>
    </div>
  </div>`}function j(){c(`#globe`).select(`#globeWindArrows`).on(`click`,V),c(`#globe`).select(`#globeGraticule`).attr(`d`,a(D(_()())??``)),n(`worldConfigurator`).addEventListener(`input`,N),n(`restoreWinds`).addEventListener(`click`,H),n(`wcWholeWorld`).addEventListener(`click`,()=>U(100,50)),n(`wcNorthern`).addEventListener(`click`,()=>U(33,25)),n(`wcTropical`).addEventListener(`click`,()=>U(33,50)),n(`wcSouthern`).addEventListener(`click`,()=>U(33,75)),S.bindIcons(n(`worldConfigurator`),M)}function M(e){let{temperature:t}=options.map.climate;if(e===`temperatureEquator`)return t.equator;if(e===`temperatureNorthPole`)return t.northPole;if(e===`temperatureSouthPole`)return t.southPole;if(e===`prec`)return options.map.climate.precipitation;if(e===`mapSize`)return options.map.geography.mapSize;if(e===`latitude`)return options.map.geography.latitude;if(e===`longitude`)return options.map.geography.longitude}function N(t){let n=t.target,r=n.id.match(/^(\w+?)(Input|Output)$/);if(!r||!n.value)return;let[,i,a]=r,o=Number(n.value);if(Number.isNaN(o))return;let s=e(`${i}${a===`Input`?`Output`:`Input`}`);s&&(s.value=n.value);let{geography:c,climate:l}=options.map;if(i===`temperatureEquator`)l.temperature.equator=o;else if(i===`temperatureNorthPole`)l.temperature.northPole=o;else if(i===`temperatureSouthPole`)l.temperature.southPole=o;else if(i===`prec`)l.precipitation=o;else if(i===`mapSize`||i===`latitude`||i===`longitude`)c[i]=o,Coordinates.calculate();else return;S.set(i,o),Options.save(),F(),e(`wcAutoChange`)?.checked&&L()}function P(e){return options.map.units.temperature.unit===`°C`?``:` = ${u(e)}`}function F(){let{equator:e,northPole:t,southPole:r}=options.map.climate.temperature;n(`temperatureEquatorConverted`).innerText=P(e),n(`temperatureNorthPoleConverted`).innerText=P(t),n(`temperatureSouthPoleConverted`).innerText=P(r)}function I(){let{temperature:t,precipitation:n}=options.map.climate,{mapSize:r,latitude:i,longitude:a}=options.map.geography;for(let[o,s]of Object.entries({temperatureEquator:t.equator,temperatureNorthPole:t.northPole,temperatureSouthPole:t.southPole,prec:n,mapSize:r,latitude:i,longitude:a}))for(let t of[`Input`,`Output`]){let n=e(`${o}${t}`);n&&(n.value=String(s))}F()}function L(){z(),R(),Temperature.generate(),Precipitation.generate();let t=new Uint8Array(pack.cells.h);Rivers.generate(),Rivers.specify(),pack.cells.h=new Float32Array(t),Biomes.define(),Features.defineGroups(),Features.defineNames(),g.draw(`temperature`,`precipitation`),g.draw(`biomes`,`coordinates`,`rivers`),e(`canvas3d`)&&setTimeout(()=>window.Controllers.View3d.update(),500)}function R(){let e=options.map.graph.height/2*100/options.map.geography.mapSize;Coordinates.calculate();let t=options.map.geography.coordinates,r=options.map.units.distance.unit,i=e*2*options.map.units.distance.scale*l();n(`mapSize`).innerHTML=`${options.map.graph.width}x${options.map.graph.height}`,n(`mapSizeFriendly`).innerHTML=`${o(options.map.graph.width*options.map.units.distance.scale)}x${o(options.map.graph.height*options.map.units.distance.scale)} ${r}`,n(`meridianLength`).innerHTML=String(o(e*2)),n(`meridianLengthFriendly`).innerHTML=`${o(e*2*options.map.units.distance.scale)} ${r}`,n(`meridianLengthEarth`).innerHTML=i?` = ${o(i/200)}%🌏`:``,n(`mapCoordinates`).innerHTML=`${s(t.latN)} ${Math.abs(o(t.lonW))}°W; ${s(t.latS)} ${o(t.lonE)}°E`;function s(e){return e>0?`${Math.abs(o(e))}°N`:`${Math.abs(o(e))}°S`}let u=_().extent([[t.lonW??0,t.latN??0],[t.lonE??0,t.latS??0]]);c(`#globe`).select(`#globeArea`).attr(`d`,a(D(u.outline())??``))}function z(){let e=options.map.climate.temperature.equator,t=options.map.climate.temperature.northPole,n=options.map.climate.temperature.southPole,i=s(r),a=e=>i(1-e),[o,l]=[-25,30],u=l-o;c(`#globe`).select(`#grad90`).attr(`stop-color`,a((t-o)/u)),c(`#globe`).select(`#grad60`).attr(`stop-color`,a((e-(e-t)*2/3-o)/u)),c(`#globe`).select(`#grad30`).attr(`stop-color`,a((e-(e-t)*1/4-o)/u)),c(`#globe`).select(`#grad0`).attr(`stop-color`,a((e-o)/u)),c(`#globe`).select(`#grad-30`).attr(`stop-color`,a((e-(e-n)*1/4-o)/u)),c(`#globe`).select(`#grad-60`).attr(`stop-color`,a((e-(e-n)*2/3-o)/u)),c(`#globe`).select(`#grad-90`).attr(`stop-color`,a((n-o)/u))}function B(){c(`#globe`).select(`#globeWindArrows`).selectAll(`path`).each(function(e,t){let n=i(this.getAttribute(`transform`)??``);this.setAttribute(`transform`,`rotate(${options.map.climate.winds[t]} ${n[1]} ${n[2]})`)})}function V(e){let r=e.target,a=r.tagName===`path`?r:r.nextElementSibling;if(!a?.dataset.tier)return;let o=+a.dataset.tier;options.map.climate.winds[o]=(options.map.climate.winds[o]+45)%360,Options.save();let s=i(a.getAttribute(`transform`)??``);a.setAttribute(`transform`,`rotate(${options.map.climate.winds[o]} ${s[1]} ${s[2]})`);let c=t(options.map.geography.coordinates.latN,options.map.geography.coordinates.latS,-30).map(e=>(90-e)/30|0);n(`wcAutoChange`).checked&&c.includes(o)&&L()}function H(){let e=[225,45,225,315,135,315],r=t(options.map.geography.coordinates.latN,options.map.geography.coordinates.latS,-30).map(e=>(90-e)/30|0),i=n(`wcAutoChange`).checked&&r.some(t=>options.map.climate.winds[t]!==e[t]);options.map.climate.winds=e,Options.save(),B(),i&&L()}function U(t,n){options.map.geography.mapSize=t,options.map.geography.latitude=n,Coordinates.calculate(),Options.save(),S.set(`mapSize`,t),S.set(`latitude`,n),I(),e(`wcAutoChange`)?.checked&&L()}var W={open:O};export{W as WorldConfigurator};