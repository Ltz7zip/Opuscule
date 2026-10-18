import{Jt as e,L as t,P as n,Zn as r,ar as i,et as a,jn as o}from"./utils-Dk4MDzbZ.js";import{d as s,l as c,s as l,t as u}from"./layers-BpUy7Q_B.js";import{t as d}from"./drag-Dc9_zdw7.js";import{t as f}from"./natural-kerJ22Hb.js";import{i as p,r as m}from"./tooltips-3xx1wzLl.js";import{i as h}from"./viewport-C0deAIKO.js";import{t as g}from"./controllers-C2OtiXZ_.js";import{i as _,n as v,o as y,r as ee}from"./dialog-helpers-MF-Ear8n.js";import{r as te}from"./notes-Cl6G6xdC.js";import{t as b}from"./viewbox-events-bX9taDxt.js";import"./index-BdCdSELe.js";import{t as x}from"./label-arc-DKBQ5519.js";var S=``,C;function w(e,t){if(customization)return;v(`.stable`),u.show(`labels`);let n=document.querySelector(`#labels text[data-label-type='${e}'][data-id='${t}']`);if(!n)return;let r=l(e,t);r&&(C={...r},Q(n.id),o(`#viewbox`).on(`touchmove mousemove`,M),T(),$(`#labelEditor`).dialog({title:`Edit Label`,resizable:!1,width:`fit-content`,position:{my:`center top+10`,at:`bottom`,of:n,collision:`fit`},close:he}),N(),E(C.group),k(),D())}function T(){_(`labelEditor`);let e=`<div id="labelEditor" class="dialog">
      <button id="labelGroupShow" data-tip="Show the group selection" class="icon-tags"></button>
      <div id="labelGroupSection" style="display: none">
        <button id="labelGroupHide" data-tip="Hide the group selection" class="icon-tags"></button>
        <select id="labelGroupSelect" data-tip="Select a group for this label" style="width: 10em"></select>
        <button
          id="labelGroupsConfigure"
          data-tip="Open the Label Groups Configurator to create, edit and reorder groups"
          class="icon-cog"
        ></button>
      </div>
      <button id="labelTextShow" data-tip="Show the edit label text section" class="icon-pencil"></button>
      <div id="labelTextSection" style="display: none">
        <button id="labelTextHide" data-tip="Hide the edit label text section" class="icon-pencil"></button>
        <input
          id="labelText"
          data-tip='Type to change the label. Enter "|" to move to a new line'
          style="width: 12em"
        />
        <span id="labelTextSpeak" data-tip="Speak the name. You can change voice and language in options" class="speaker">🔊</span>
        <span id="labelTextRandom" data-tip="Generate random name" class="icon-shuffle pointer"></span>
      </div>
      <button id="labelEditStyle" data-tip="Edit label group style in Style Editor" class="icon-brush"></button>
      <button id="labelPathToggle"></button>
      <button id="labelSizeShow" data-tip="Show the font size section" class="icon-text-height"></button>
      <div id="labelSizeSection" style="display: none">
        <button id="labelSizeHide" data-tip="Hide the font size section" class="icon-text-height"></button>
        <span data-tip="Set relative size for the particular label">Size:</span>
        <input
          id="labelRelativeSize"
          data-tip="Set relative size for the particular label (% of group default)"
          type="number"
          min="30"
          max="300"
          step="1"
          style="width: 4.5em"
        />
      </div>
      <button id="labelOffsetShow" data-tip="Show the label offset section" class="icon-sliders"></button>
      <div id="labelOffsetSection" style="display: none">
        <button id="labelOffsetHide" data-tip="Hide the label offset section" class="icon-sliders"></button>
        <span data-tip="Set starting offset for the particular label">Offset:</span>
        <input
          id="labelStartOffset"
          data-tip="Set starting offset for the particular label (% along the path)"
          type="range"
          min="20"
          max="80"
          style="width: 8em"
        />
        <input
          id="labelStartOffsetValue"
          type="number"
          min="20"
          max="80"
          step="1"
          style="width: 3.5em"
          data-tip="Set starting offset numerically"
        />
      </div>
      <button id="labelLetterSpacingShow" data-tip="Show the letter spacing section" class="icon-text-width"></button>
      <div id="labelLetterSpacingSection" style="display: none">
        <button
          id="labelLetterSpacingHide"
          data-tip="Hide the letter spacing section"
          class="icon-text-width"
        ></button>
        <slider-input
          id="labelLetterSpacingSize"
          style="display: inline-block"
          data-tip="Set the letter spacing size for this label"
          min="0"
          max="20"
          step=".01"
          value="0"
        ></slider-input>
      </div>
      <button id="labelVisibility"></button>
      ${y(`labelLegend`,`this label`)}
      <button id="labelReset" data-tip="Restore the default label" class="icon-arrows-cw"></button>
      <button
        id="labelRemoveSingle"
        data-tip="Remove the label"
        data-shortcut="Delete"
        class="icon-trash fastDelete"
      ></button>
    </div>`;n(`dialogs`).insertAdjacentHTML(`beforeend`,e),n(`labelGroupShow`).addEventListener(`click`,B),n(`labelGroupHide`).addEventListener(`click`,V),n(`labelGroupSelect`).addEventListener(`change`,H),n(`labelGroupsConfigure`).addEventListener(`click`,()=>void g.LabelGroupsConfigurator.open()),n(`labelTextShow`).addEventListener(`click`,U),n(`labelTextHide`).addEventListener(`click`,W),n(`labelText`).addEventListener(`input`,G),n(`labelTextSpeak`).addEventListener(`click`,()=>a(n(`labelText`).value)),n(`labelTextRandom`).addEventListener(`click`,q),n(`labelEditStyle`).addEventListener(`click`,ne),n(`labelSizeShow`).addEventListener(`click`,J),n(`labelSizeHide`).addEventListener(`click`,Y),n(`labelOffsetShow`).addEventListener(`click`,X),n(`labelOffsetHide`).addEventListener(`click`,re),n(`labelStartOffset`).addEventListener(`input`,oe),n(`labelStartOffsetValue`).addEventListener(`input`,se),n(`labelRelativeSize`).addEventListener(`input`,ce),n(`labelLetterSpacingShow`).addEventListener(`click`,ie),n(`labelLetterSpacingHide`).addEventListener(`click`,ae),n(`labelLetterSpacingSize`).addEventListener(`input`,le),n(`labelPathToggle`).addEventListener(`click`,ue),n(`labelVisibility`).addEventListener(`click`,de),n(`labelLegend`).addEventListener(`click`,fe),n(`labelReset`).addEventListener(`click`,me),n(`labelRemoveSingle`).addEventListener(`click`,pe)}function E(e){S=e,V();let t=n(`labelGroupSelect`);t.options.length=0;for(let n of options.map.labels.groups)t.options.add(new Option(n.name,n.name,!1,n.name===e))}function D(){let e=O(),t=!n(`labelEditor`).classList.contains(`section-open`);n(`labelOffsetShow`).style.display=t&&e?`inline-block`:`none`,n(`labelRemoveSingle`).style.display=t&&C.type===`added`?`inline-block`:`none`,n(`labelReset`).style.display=t&&Labels.hasOverride(C.type,C.entityId)?`inline-block`:`none`;let r=n(`labelPathToggle`);r.className=e?`icon-resize-horizontal`:`icon-bezier-curve`,r.dataset.tip=e?`Remove the label path, render the label as a straight text`:`Curve the label along a path`;let i=n(`labelVisibility`);i.className=C.hidden?`icon-eye-off`:`icon-eye`,i.dataset.tip=C.hidden?`Show the label`:`Hide the label. You can toggle it on later in Labels Overview`}function O(){return!!C.pathPoints?.length}function k(){let e=C.startOffset||50;n(`labelText`).value=C.text||``,n(`labelStartOffset`).value=String(e),n(`labelStartOffsetValue`).value=String(e),n(`labelRelativeSize`).value=String(C.fontSize??100),n(`labelLetterSpacingSize`).value=String(C.letterSpacing??0)}function A(){n(`labelEditor`).classList.add(`section-open`),document.querySelectorAll(`#labelEditor > button`).forEach(e=>{e.style.display=`none`})}function j(){n(`labelEditor`).classList.remove(`section-open`),document.querySelectorAll(`#labelEditor > button`).forEach(e=>{e.style.display=`inline-block`}),D()}function M(e){m();let t=e.target,n=t.parentNode;t.closest(`#${C.id}`)?p(`Drag to move the label`):n?.id===`controlPoints`&&(t.tagName===`circle`&&p(`Drag to move, click to delete the control point`),t.tagName===`path`&&p(`Click to add a control point`))}function N(){if(o(`#debug`).select(`#controlPoints`).remove(),!O())return;let e=C.dx||C.dy?`translate(${C.dx||0}, ${C.dy||0})`:null;o(`#debug`).append(`g`).attr(`id`,`controlPoints`).attr(`transform`,e).append(`path`).attr(`d`,s(C)).style(`stroke-width`,Math.max(2.2/h.scale,.2)).on(`click`,R),C.pathPoints?.forEach(P)}function P(e){o(`#debug`).select(`#controlPoints`).append(`circle`).attr(`cx`,e[0]).attr(`cy`,e[1]).attr(`r`,Math.max(3/h.scale,.35)).style(`stroke-width`,Math.max(1/h.scale,.15)).call(d().on(`drag`,F)).on(`click`,L)}function F(e){this.setAttribute(`cx`,e.x),this.setAttribute(`cy`,e.y),I()}function I(){let t=[];o(`#debug > #controlPoints`).selectAll(`circle`).each(function(){let e=i(+this.getAttribute(`cx`),2),n=i(+this.getAttribute(`cy`),2);t.push([e,n])});let n=r(e().curve(f)(t)||``);o(`#debug`).select(`#controlPoints > path`).attr(`d`,n),C.pathPoints=t,Z(),t.length||N()}function L(){this.remove(),I()}function R(e){let n=t(e,this),r=[];o(`#debug #controlPoints`).selectAll(`circle`).each(function(){let e=+this.getAttribute(`cx`),t=+this.getAttribute(`cy`);r.push((n[0]-e)**2+(n[1]-t)**2)});let i=r.length;if(r.length>1){let e=r.slice(0).sort((e,t)=>e-t),t=r.indexOf(e[0]),n=r.indexOf(e[1]);i=t<=n?t+1:n+1}let a=`:nth-child(${i+2})`;o(`#debug`).select(`#controlPoints`).insert(`circle`,a).attr(`cx`,n[0]).attr(`cy`,n[1]).attr(`r`,2.5).attr(`stroke-width`,.8).call(d().on(`drag`,F)).on(`click`,L),I()}function z(e){let t=(C.dx||0)-e.x,n=(C.dy||0)-e.y;e.on(`drag`,e=>{C.dx=i(t+e.x,2),C.dy=i(n+e.y,2);let r=`translate(${C.dx}, ${C.dy})`;this.setAttribute(`transform`,r),o(`#debug #controlPoints`).attr(`transform`,r)}),e.on(`end`,()=>Z())}function B(){A(),n(`labelGroupSection`).style.display=`inline-block`}function V(){j(),n(`labelGroupSection`).style.display=`none`}function H(){let e=this.value,t=options.map.labels.groups.find(t=>t.name===e)?.type,n=()=>{S=e,C.group=e,Z()};if(t===C.type)return void n();ee({title:`Assign cross-type Label Group`,message:`Assign this ${C.type} label to the ${t} group "${e}"? It's better to avoid such cross-type assignment.`,confirm:`Assign`,onConfirm:n,onCancel:()=>{this.value=C.group}})}function U(){A(),n(`labelTextSection`).style.display=`inline-block`}function W(){j(),n(`labelTextSection`).style.display=`none`}function G(){let e=n(`labelText`).value;C.text=e,Z(),C.type===`state`&&p(`Use States Editor to change the actual state name, not just a label`,!1,`warn`),C.type===`province`&&p(`Use Provinces Editor to change the actual province name, not just a label`,!1,`warn`)}var K={burg:e=>Names.getCulture(pack.burgs[e.entityId].culture??0),state:e=>{let t=pack.states[e.entityId].culture;return Names.getState(Names.getCulture(t,4,7,``),t)},province:e=>{let t=pack.provinces[e.entityId];return Names.getState(t.name,pack.cells.culture[t.center])},added:e=>{let t=Pack.findCell(...e.anchor);return t?Names.getCulture(pack.cells.culture[t]):``},river:e=>{let t=Pack.findCell(...e.anchor);return t?Rivers.getName(t):``},route:e=>{let t=pack.routes.find(t=>t.i===e.entityId)?.points??[];return Routes.generateName({group:e.group,points:t})||`Unnamed route segment`}};function q(){n(`labelText`).value=K[C.type](C),G()}function ne(){g.StyleEditor.open(`labels`,C.group)}function J(){A(),n(`labelSizeSection`).style.display=`inline-block`}function Y(){j(),n(`labelSizeSection`).style.display=`none`}function X(){A(),n(`labelOffsetSection`).style.display=`inline-block`}function re(){j(),n(`labelOffsetSection`).style.display=`none`}function ie(){A(),n(`labelLetterSpacingSection`).style.display=`inline-block`}function ae(){j(),n(`labelLetterSpacingSection`).style.display=`none`}function oe(){if(!O())return;let e=this.value;n(`labelStartOffsetValue`).value=e,C.startOffset=+e,Z(),p(`Label offset: ${e}%`)}function se(){if(!O())return;let e=Math.min(80,Math.max(20,+this.value));n(`labelStartOffset`).value=String(e),this.value=String(e),C.startOffset=e,Z(),p(`Label offset: ${e}%`)}function ce(){C.fontSize=+this.value,Z(),p(`Label relative size: ${this.value}%`)}function le(){C.letterSpacing=+this.value,Z(),p(`Label letter-spacing size: ${this.value}px`)}function ue(){C.pathPoints=O()?[]:x(C),Z(),N()}function de(){C.hidden?delete C.hidden:C.hidden=!0,Z()}function fe(){let e=te.resolveElement(C.id);e&&g.NotesEditor.open(e)}function pe(){alertMessage.innerHTML=`Are you sure you want to remove the label?`,$(`#alert`).dialog({resizable:!1,title:`Remove label`,buttons:{Remove:function(){$(this).dialog(`close`),C.type===`added`&&(AddedLabels.remove(C.entityId),u.draw(`labels`),$(`#labelEditor`).dialog(`close`))},Cancel:function(){$(this).dialog(`close`)}}})}function Z(){let e=Labels.getEntity(C.type,C.entityId);e&&(e.label=ge(),c(C),Q(C.id),D())}function Q(e){o(`#${e}`).call(d().on(`start`,z)).classed(`draggable`,!0)}function me(){let{type:e,entityId:t}=C;Labels.reset(e,t),u.draw(`labels`),C={...l(e,t)??C},Q(C.id),E(C.group),k(),D(),N()}function he(){o(`#debug`).select(`#controlPoints`).remove(),o(`#${C.id}`).on(`.drag`,null).classed(`draggable`,!1),b(),$(`#labelEditor`).dialog(`destroy`),n(`labelEditor`).remove()}function ge(){return{text:C.text,group:C.group,dx:C.dx,dy:C.dy,fontSize:C.fontSize,letterSpacing:C.letterSpacing,pathPoints:C.pathPoints??[],startOffset:C.startOffset,hidden:C.hidden}}var _e={open:w,getLastSelectedGroup:()=>S};export{_e as LabelsEditor};