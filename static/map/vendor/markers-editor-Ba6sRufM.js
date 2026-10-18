import{F as e,P as t,ar as n,jn as r,rr as i}from"./utils-Dk4MDzbZ.js";import{I as a,L as o}from"./layers-BpUy7Q_B.js";import{t as s}from"./drag-Dc9_zdw7.js";import{i as c}from"./emblems-generator-CFXxHBH0.js";import{i as l,t as u}from"./tooltips-3xx1wzLl.js";import{t as d}from"./controllers-C2OtiXZ_.js";import{c as f,i as p,n as m,o as h,r as g}from"./dialog-helpers-MF-Ear8n.js";import{t as _}from"./map-placement-C037LmJt.js";var v,y;function b(n,i){if(customization)return;m(`.stable`);let a=S(n,i);a&&([v,y]=a,r(v).raise().call(s().on(`start`,w)).classed(`draggable`,!0),e(`notesEditor`)&&d.NotesEditor.open({type:`marker`,id:y.i}),x(),t(`markerEditor`).dataset.entity=`marker:${y.i}`,T(),$(`#markerEditor`).dialog({title:`Edit Marker`,resizable:!1,position:{my:`left top`,at:`left+10 top+10`,of:`svg`,collision:`fit`},close:q}))}function x(){p(`markerEditor`);let e=`<div id="markerEditor" class="dialog">
    <div id="markerBody" style="padding-bottom: 0.3em">
      <div data-tip="Marker name, shown in the notes editor and overviews">
        <div class="label">Name:</div>
        <input id="markerName" style="width: 10.3em" />
      </div>
      <div data-tip="Marker type. Style changes will apply to all markers of the same type. Leave blank if the marker is unique">
        <div class="label">Type:</div>
        <input id="markerType" style="width: 10.3em" />
      </div>
      <div data-tip="Marker icon" style="display: flex; align-items: center">
        <div class="label">Icon:</div>
        <div id="markerIcon" style="font-size: 1.5em; width: 3.7em; display: flex"></div>
        <button id="markerIconSelect" style="width: 5em">select</button>
      </div>
      <div data-tip="Marker marker element and icon sizes in pixels">
        <div class="label">Size:</div>
        <input data-tip="Marker element size in pixels" id="markerSize" type="number" min="1" max="500" style="width: 5em" />
        <input data-tip="Marker icon sizes in pixels" id="markerIconSize" type="number" min="1" max="50" step="0.1" style="width: 5em" />
      </div>
      <div data-tip="Marker icon shift (by X and by Y axis), percent. Set to 50 to position icon in center">
        <div class="label">Icon shift:</div>
        <input id="markerIconShiftX" type="number" min="0" max="100" step="1" style="width: 5em" />
        <input id="markerIconShiftY" type="number" min="0" max="100" step="1" style="width: 5em" />
      </div>
      <div data-tip="Marker pin shape">
        <div class="label">Pin shape:</div>
        <select id="markerPin" style="width: 10.3em">
          <option value="bubble">Bubble</option>
          <option value="pin">Pin</option>
          <option value="square">Square</option>
          <option value="squarish">Squarish</option>
          <option value="diamond">Diamond</option>
          <option value="hex">Hex</option>
          <option value="hexy">Hexy</option>
          <option value="shieldy">Shieldy</option>
          <option value="shield">Shield</option>
          <option value="pentagon">Pentagon</option>
          <option value="heptagon">Heptagon</option>
          <option value="circle">Circle</option>
          <option value="no">No</option>
        </select>
      </div>
      <div data-tip="Pin fill and stroke colors">
        <div class="label">Pin colors:</div>
        <input id="markerFill" type="color" style="width: 5em; height: 1.6em" />
        <input id="markerStroke" type="color" style="width: 5em; height: 1.6em" />
      </div>
      <div data-tip="Icon fill and stroke colors: they paint the parts the icon leaves uncolored. Emoji keep their own colors">
        <div class="label">Icon colors:</div>
        <input id="markerIconFill" type="color" style="width: 5em; height: 1.6em" />
        <input id="markerIconStroke" type="color" style="width: 5em; height: 1.6em" />
        <i id="markerIconPaintReset" data-tip="Restore the icon's default colors" class="icon-ccw pointer"></i>
      </div>
    </div>
    <div id="markerBottom">
      ${h(`markerNotes`,`this marker`)}
      <button id="markerRadius" data-tip="Show markers within a radius of this one" class="icon-dot-circled"></button>
      <button id="markerLock" class="icon-lock-open" onmouseover="showElementLockTip(event)"></button>
      <button id="markerAdd" data-tip="Add additional marker of that type" class="icon-plus"></button>
      <button id="markerRemove" data-tip="Remove the marker" data-shortcut="Delete" class="icon-trash fastDelete"></button>
    </div>
  </div>`;t(`dialogs`).insertAdjacentHTML(`beforeend`,e),t(`markerName`).addEventListener(`change`,D),t(`markerType`).addEventListener(`change`,O),t(`markerIconSelect`).addEventListener(`click`,k),t(`markerIconSize`).addEventListener(`input`,A),t(`markerIconShiftX`).addEventListener(`input`,j),t(`markerIconShiftY`).addEventListener(`input`,M),t(`markerSize`).addEventListener(`input`,N),t(`markerPin`).addEventListener(`change`,P),t(`markerFill`).addEventListener(`input`,F),t(`markerStroke`).addEventListener(`input`,I),t(`markerIconFill`).addEventListener(`input`,L),t(`markerIconStroke`).addEventListener(`input`,R),t(`markerIconPaintReset`).addEventListener(`click`,z),t(`markerNotes`).addEventListener(`click`,V),t(`markerRadius`).addEventListener(`click`,H),t(`markerLock`).addEventListener(`click`,U),t(`markerAdd`).addEventListener(`click`,W),t(`markerRemove`).addEventListener(`click`,G)}function S(t,n){let r=n?Number(n.closest(`svg`)?.id.slice(6)):t,i=pack.markers.find(({i:e})=>e===r);if(!i)return null;o(i);let a=e(`marker${r}`);return a||o(null),a?[a,i]:null}function C(){let e=y.type;return e?pack.markers.filter(({type:t})=>t===e):[y]}function w(e){let t=+this.getAttribute(`x`)-e.x,r=+this.getAttribute(`y`)-e.y;e.on(`drag`,function(e){this.setAttribute(`x`,String(t+e.x)),this.setAttribute(`y`,String(r+e.y))}),e.on(`end`,function(e){let{width:o,height:s}=options.map.graph,c=i(e.x+t,0,o),l=i(e.y+r,0,s);this.setAttribute(`x`,String(n(c,2))),this.setAttribute(`y`,String(n(l,2))),Markers.move(y.i,c,l),a()})}function T(){let e=y;E(),t(`markerName`).value=e.name||``,t(`markerType`).value=e.type||``,t(`markerIconSize`).value=String(e.px||12),t(`markerIconShiftX`).value=String(e.dx||50),t(`markerIconShiftY`).value=String(e.dy||50),t(`markerSize`).value=String(e.size||30),t(`markerPin`).value=e.pin||`bubble`,t(`markerFill`).value=e.fill||`#ffffff`,t(`markerStroke`).value=e.stroke||`#000000`,t(`markerLock`).className=e.lock?`icon-lock`:`icon-lock-open`}function E(){let{icon:e,iconFill:n,iconStroke:r}=y,i=c.paint(e),a=e=>e&&/^#[\da-f]{6}$/i.test(e)?e:`#000000`;t(`markerIcon`).innerHTML=c.html(e,{fill:n,stroke:r}),t(`markerIconFill`).value=a(n??i.fill),t(`markerIconStroke`).value=a(r??i.stroke),t(`markerIconPaintReset`).style.visibility=n||r?`visible`:`hidden`}function D(){this.value.trim()&&Markers.rename(y.i,this.value),e(`notesEditor`)&&d.NotesEditor.open({type:`marker`,id:y.i})}function O(){this.value.trim()&&Markers.setType(y.i,this.value)}function k(){d.IconPicker.open({current:y.icon,live:!0,onPick:e=>{for(let t of C())t.icon=e;E(),a()}})}function A(){B({px:+this.value})}function j(){B({dx:+this.value})}function M(){B({dy:+this.value})}function N(){B({size:+this.value})}function P(){B({pin:this.value})}function F(){B({fill:this.value})}function I(){B({stroke:this.value})}function L(){B({iconFill:this.value}),E()}function R(){B({iconStroke:this.value}),E()}function z(){B({iconFill:null,iconStroke:null}),E()}function B(e){try{for(let t of C())Markers.setAppearance(t.i,e)}catch(e){l(e.message,!1,`error`)}a()}function V(){d.NotesEditor.open({type:`marker`,id:y.i})}function H(){d.MarkersInRadius.open(y)}function U(){Markers.setLocked(y.i,!y.lock);let e=t(`markerLock`);e.classList.toggle(`icon-lock-open`),e.classList.toggle(`icon-lock`)}function W(){d.MarkerCreator.toggle(y)}function G(){g({title:`Remove marker`,message:`Are you sure you want to remove this marker? The action cannot be reverted`,confirm:`Remove`,onConfirm:K})}function K(){Markers.remove(y.i),a(),$(`#markerEditor`).dialog(`close`),f()}function q(){r(v).on(`.drag`,null).classed(`draggable`,!1),o(null),t(`addMarker`).classList.contains(`pressed`)&&_(),u(),p(`markerEditor`),v=null,y=null}var J={open:b};export{J as MarkersEditor};