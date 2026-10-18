import{Bt as e,F as t,L as n,P as r,Y as i,ar as a,et as o,jn as s}from"./utils-Dk4MDzbZ.js";import{E as c,T as l,t as u}from"./layers-BpUy7Q_B.js";import{t as d}from"./drag-Dc9_zdw7.js";import{i as f,t as p}from"./tooltips-3xx1wzLl.js";import{t as m}from"./controllers-C2OtiXZ_.js";import{i as h,n as g,o as _}from"./dialog-helpers-MF-Ear8n.js";var v,y=!1;function b(e){if(customization||t(`riverEditor`)&&e===v.attr(`id`))return;g(`.stable`),u.show(`rivers`),y=!u.isOn(`cells`),u.show(`cells`),c(Number(e.slice(5))),v=s(`#${e}`).on(`click`,M),f(`Drag control points to change the river course. Click on point to remove it. Click on river to add additional control point. For major changes please create a new river instead`,!0),s(`#debug`).append(`g`).attr(`id`,`controlCells`),s(`#debug`).append(`g`).attr(`id`,`controlPoints`),x(),r(`riverEditor`).dataset.entity=`river:${Number(e.slice(5))}`,T();let{cells:n,points:i}=w();O(Rivers.getRiverPoints(n,i??null)),k(n),$(`#riverEditor`).dialog({title:`Edit River`,resizable:!1,position:{my:`left top`,at:`left+10 top+10`,of:`#map`},close:W})}function x(){h(`riverEditor`);let e=`<div id="riverEditor" class="dialog">
    <div id="riverBody" style="padding-bottom: 0.3em">
      <div>
        <div class="label" style="width: 4.8em">Name:</div>
        <span id="riverNameCulture" data-tip="Generate culture-specific name for the river" class="icon-book pointer"></span>
        <span id="riverNameRandom" data-tip="Generate random name for the river" class="icon-globe pointer"></span>
        <input id="riverName" data-tip="Type to rename the river" autocorrect="off" spellcheck="false" />
        <span id="riverNameSpeak" data-tip="Speak the name. You can change voice and language in options" class="speaker">🔊</span>
      </div>
      <div data-tip="Type to change river type (e.g. fork, creek, river, brook, stream)">
        <div class="label">Type:</div>
        <input id="riverType" autocorrect="off" spellcheck="false" />
      </div>
      <div data-tip="Select parent river">
        <div class="label">Mainstem:</div>
        <select id="riverMainstem"></select>
      </div>
      <div data-tip="River drainage basin (watershed)">
        <div class="label">Basin:</div>
        <input id="riverBasin" disabled />
      </div>
      <div data-tip="River discharge (flux power)">
        <div class="label">Discharge:</div>
        <input id="riverDischarge" disabled />
      </div>
      <div data-tip="River length in selected units">
        <div class="label">Length:</div>
        <input id="riverLength" disabled />
      </div>
      <div data-tip="River mouth width in selected units">
        <div class="label">Mouth width:</div>
        <input id="riverWidth" disabled />
      </div>
      <div data-tip="River source additional width. Default value is 0">
        <div class="label">Source width:</div>
        <input id="riverSourceWidth" type="number" min="0" max="3" step=".01" />
      </div>
      <div data-tip="River width multiplier. Default value is 1">
        <div class="label">Width modifier:</div>
        <input id="riverWidthFactor" type="number" min=".1" max="4" step=".1" />
      </div>
    </div>
    <div id="riverBottom">
      <button id="riverCreateSelectingCells" data-tip="Create a new river selecting river cells" class="icon-map-pin"></button>
      <button id="riverEditStyle" data-tip="Edit style for all rivers in Style Editor" class="icon-brush"></button>
      <button id="riverElevationProfile" data-tip="Show the elevation profile for the river" class="icon-chart-area"></button>
      ${_(`riverLegend`,`this river`)}
      <button id="riverRemove" data-tip="Remove river" data-shortcut="Delete" class="icon-trash fastDelete"></button>
    </div>
  </div>`;r(`dialogs`).insertAdjacentHTML(`beforeend`,e),r(`riverCreateSelectingCells`).addEventListener(`click`,S),r(`riverEditStyle`).addEventListener(`click`,C),r(`riverElevationProfile`).addEventListener(`click`,V),r(`riverLegend`).addEventListener(`click`,H),r(`riverRemove`).addEventListener(`click`,U),r(`riverName`).addEventListener(`input`,P),r(`riverNameSpeak`).addEventListener(`click`,()=>o(r(`riverName`).value)),r(`riverType`).addEventListener(`input`,F),r(`riverNameCulture`).addEventListener(`click`,I),r(`riverNameRandom`).addEventListener(`click`,L),r(`riverMainstem`).addEventListener(`change`,R),r(`riverSourceWidth`).addEventListener(`input`,z),r(`riverWidthFactor`).addEventListener(`input`,B)}function S(){m.RiverCreator.open()}function C(){m.StyleEditor.open(`rivers`)}function w(){let e=+v.attr(`id`).slice(5);return pack.rivers.find(t=>t.i===e)}function T(){let e=w();r(`riverName`).value=e.name,r(`riverType`).value=e.type;let t=r(`riverMainstem`);t.options.length=0;let n=e.parent||e.i;pack.rivers.slice().sort((e,t)=>e.name>t.name?1:-1).forEach(e=>{let r=new Option(e.name,String(e.i),!1,e.i===n);t.options.add(r)}),r(`riverBasin`).value=pack.rivers.find(t=>t.i===e.basin).name,r(`riverDischarge`).value=`${e.discharge} m³/s`,r(`riverSourceWidth`).value=String(e.sourceWidth),r(`riverWidthFactor`).value=String(e.widthFactor),E(e),Rivers.updateWidth(e),D(e)}function E(e){e.length=a(v.node().getTotalLength()/2,2);let t=`${a(e.length*options.map.units.distance.scale)} ${options.map.units.distance.unit}`;r(`riverLength`).value=t}function D(e){let t=`${a(e.width*options.map.units.distance.scale,3)} ${options.map.units.distance.unit}`;r(`riverWidth`).value=t}function O(e){s(`#controlPoints`).selectAll(`circle`).data(e).join(`circle`).attr(`cx`,e=>e[0]).attr(`cy`,e=>e[1]).attr(`r`,.6).call(d().on(`start`,A)).on(`click`,N)}function k(e){let t=[...new Set(e)].filter(e=>pack.cells.i[e]);s(`#controlCells`).selectAll(`polygon`).data(t).join(`polygon`).attr(`points`,e=>String(Pack.getPolygon(e)))}function A(e){let{r:t,fl:n}=pack.cells,r=w(),{x:i,y:o}=e,s=Pack.findCell(i,o),c=null;e.on(`drag`,function(e){let{x:t,y:n}=e,i=Pack.findCell(t,n);c=s===i?null:i,this.setAttribute(`cx`,t),this.setAttribute(`cy`,n),this.__data__=[a(t,1),a(n,1)],j(),k(r.cells)}),e.on(`end`,()=>{if(c&&!t[c]){t[s]=0,t[c]=r.i;let e=n[s];n[s]=n[c],n[c]=e,j()}})}function j(){let e=w();e.points=s(`#controlPoints`).selectAll(`*`).data(),e.cells=e.points.map(([e,t])=>Pack.findCell(e,t)),l(e),E(e),u.draw(`labels`),t(`elevationProfile`)&&V()}function M(e){let[t,r]=n(e,this),o=[a(t,1),a(r,1)],c=w();c.points||=s(`#controlPoints`).selectAll(`*`).data();let l=i(c.points,o,2);c.points.splice(l,0,o),O(c.points),j()}function N(){this.remove(),j();let{cells:e}=w();k(e)}function P(){this.value.trim()&&(Rivers.rename(w().i,this.value),u.draw(`labels`))}function F(){this.value.trim()&&(Rivers.setType(w().i,this.value),u.draw(`labels`))}function I(){let e=w(),t=Rivers.getName(e.mouth);r(`riverName`).value=t,Rivers.rename(e.i,t),u.draw(`labels`)}function L(){let t=Names.getBase(e(Names.nameBases.length-1));r(`riverName`).value=t,Rivers.rename(w().i,t),u.draw(`labels`)}function R(){let e=w();try{Rivers.setParent(e.i,+this.value)}catch(t){f(t.message,!1,`error`),this.value=String(e.parent||e.i);return}r(`riverBasin`).value=pack.rivers.find(t=>t.i===e.basin).name}function z(){let e=w();Rivers.setWidth(e.i,Math.max(0,+this.value||0),e.widthFactor),D(e),j()}function B(){let e=w();Rivers.setWidth(e.i,e.sourceWidth??0,Math.max(0,+this.value||0)),D(e),j()}function V(){let e=s(`#controlPoints`).selectAll(`*`).data().map(([e,t])=>Pack.findCell(e,t)),t=a(w().length*options.map.units.distance.scale);m.ElevationProfile.open(e,t,!0)}function H(){m.NotesEditor.open({type:`river`,id:w().i})}function U(){alertMessage.innerHTML=`Are you sure you want to remove the river and all its tributaries`,$(`#alert`).dialog({resizable:!1,width:`22em`,title:`Remove river and tributaries`,buttons:{Remove:function(){$(this).dialog(`close`);let e=+v.attr(`id`).slice(5);Rivers.remove(e),$(`#riverEditor`).dialog(`close`),u.draw(`rivers`,`labels`)},Cancel:function(){$(this).dialog(`close`)}}})}function W(){s(`#controlPoints`).remove(),s(`#controlCells`).remove(),v.on(`click`,null),c(null),p(),y&&u.hide(`cells`),y=!1,h(`riverEditor`),v=null}var G={open:b};export{G as RiverEditor};