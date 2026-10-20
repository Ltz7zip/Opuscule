import{P as e}from"./utils-Dk4MDzbZ.js";import{t}from"./layers--lc146Vt.js";import{i as n}from"./tooltips-3xx1wzLl.js";import{t as r}from"./controllers-Ulmfs1Xu.js";import{c as i,i as a,n as o,r as s}from"./dialog-helpers-MF-Ear8n.js";import{n as c}from"./limitation-picker-dsNr8paO.js";var l=/^[\p{L}_][\p{L}\p{N}_-]*$/u;function u(){customization||(o(`.stable`),d(),p(),$(`#burgGroupsEditor`).dialog({title:`Configure Burg groups`,resizable:!1,position:{my:`center`,at:`center`,of:`svg`},close:f,buttons:{Apply:()=>{e(`burgGroupsForm`).requestSubmit()},Add:()=>{let t={name:``,order:Math.max(0,...options.map.burgs.groups.map(({order:e})=>e))+1,active:!0};e(`burgGroupsBody`).insertAdjacentHTML(`beforeend`,m(t))},Restore:()=>{p(Burgs.getDefaultGroups())},Cancel:function(){$(this).dialog(`close`)}}}))}function d(){a(`burgGroupsEditor`),e(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="burgGroupsEditor" class="dialog stable">
    <form id="burgGroupsForm">
      <table class="table">
        <thead>
          <tr>
            <th data-tip="Rendering order: higher values are rendered on top">Order</th>
            <th data-tip="Type group name">Name</th>
            <th data-tip="Burg preview generator">Preview generator</th>
            <th data-tip="Set min and max population constraint in population points (see the multiplier in Units Editor)" colspan="3">Population</th>
            <th data-tip="Select allowed biomes">Biomes</th>
            <th data-tip="Select allowed states">States</th>
            <th data-tip="Select allowed cultures">Cultures</th>
            <th data-tip="Select allowed religions">Religions</th>
            <th data-tip="Select allowed features">Features</th>
            <th data-tip="Number of burgs in group">Count</th>
            <th data-tip="Activate/deactivate group">Active</th>
            <th data-tip="Select group to be assigned if burg doesn't pass the criteria for other groups">
              Default
            </th>
          </tr>
        </thead>
        <tbody id="burgGroupsBody"></tbody>
      </table>
    </form>
    <div style="padding: 0.5em 0; font-style: italic;">
      Burg population is calculated as <code style="font-size: smaller;">value * population_point * urbanization_rate</code>, see the <a style="text-decoration: underline;" id="burgGroupsUnitsEditorLink">Units Editor</a>.
      <br>Applying changes reclassifies Burgs, but label groups are not affected. Reconcile label groups in <a id="burgGroupsLabelGroupsLink" style="text-decoration: underline;">Label Group Configurator</a>.
    </div>
  </div>`);let t=e(`burgGroupsForm`);t.addEventListener(`change`,v),t.addEventListener(`submit`,x),e(`burgGroupsBody`).addEventListener(`click`,e=>{let t=e.target,n=t.closest(`tr`);if(n){if(t.getAttribute(`name`)===`biomes`)return h(t,pack.biomes.filter(e=>!e.removed).map(({i:e,name:t,color:n})=>({i:e,name:t,color:n})));if(t.getAttribute(`name`)===`states`)return h(t,pack.states);if(t.getAttribute(`name`)===`cultures`)return h(t,pack.cultures);if(t.getAttribute(`name`)===`religions`)return h(t,pack.religions);if(t.getAttribute(`name`)===`features`)return g(t);if(t.getAttribute(`name`)===`up`){let e=n.previousElementSibling;e&&n.parentNode.insertBefore(n,e);return}if(t.getAttribute(`name`)===`down`){let e=n.nextElementSibling;e&&n.parentNode.insertBefore(e,n);return}if(t.getAttribute(`name`)===`remove`)return _(n)}}),e(`burgGroupsUnitsEditorLink`).addEventListener(`click`,()=>r.UnitsEditor.open()),e(`burgGroupsLabelGroupsLink`).addEventListener(`click`,()=>r.LabelGroupsConfigurator.open())}function f(){$(`#burgGroupsEditor`).dialog(`destroy`),e(`burgGroupsEditor`).remove()}function p(t=options.map.burgs.groups){let n=t.map(m);e(`burgGroupsBody`).innerHTML=n.join(``)}function m(e){let t=pack.burgs.filter(t=>!t.removed&&t.group===e.name).length;return`<tr name="${e.name}">
      <td data-tip="Rendering order: higher values are rendered on top"><input type="number" name="order" min="1" max="999" step="1" required value="${e.order||``}" /></td>
      <td data-tip="Type group name. Must start with a letter or underscore, followed by letters, digits, underscores, or dashes. Spaces are not allowed"><input type="text" name="name" value="${e.name}" required /></td>
      <td data-tip="Burg preview generator">
        <select name="preview">
          <option value="" ${e.preview?``:`selected`}>no</option>
          <option value="watabou-city" ${e.preview===`watabou-city`?`selected`:``}>Watabou City</option>
          <option value="watabou-village" ${e.preview===`watabou-village`?`selected`:``}>Watabou Village</option>
          <option value="watabou-dwelling" ${e.preview===`watabou-dwelling`?`selected`:``}>Watabou Dwelling</option>
        </select>
      </td>
      <td data-tip="Set min population constraint in population points (see the multiplier in Units Editor)"><input type="number" name="min" min="0" step="any" value="${e.min||``}" /></td>
      <td data-tip="Set max population constraint in population points (see the multiplier in Units Editor)"><input type="number" name="max" min="0" step="any" value="${e.max||``}" /></td>
      <td data-tip="Set population percentile: 0-100, where 90 means the burg must have a population higher than 90% of all burgs"><input type="number" name="percentile" min="0" max="100" step="any" value="${e.percentile||``}" /></td>
      <td data-tip="Select allowed biomes">
        <input type="hidden" name="biomes" value="${e.biomes||``}">
        <button type="button" name="biomes">${e.biomes?`some`:`all`}</button>
      </td>
      <td data-tip="Select allowed states">
        <input type="hidden" name="states" value="${e.states||``}">
        <button type="button" name="states">${e.states?`some`:`all`}</button>
      </td>
      <td data-tip="Select allowed cultures">
        <input type="hidden" name="cultures" value="${e.cultures||``}">
        <button type="button" name="cultures">${e.cultures?`some`:`all`}</button>
      </td>
      <td data-tip="Select allowed religions">
        <input type="hidden" name="religions" value="${e.religions||``}">
        <button type="button" name="religions">${e.religions?`some`:`all`}</button>
      </td>
      <td data-tip="Select allowed features" >
        <input type="hidden" name="features" value='${JSON.stringify(e.features||{})}'>
        <button type="button" name="features">${Object.keys(e.features||{}).length?`some`:`any`}</button>
      </td>
      <td data-tip="Number of burgs in group">${t}</td>
      <td data-tip="Activate/deactivate group"><input type="checkbox" name="active" class="native" ${e.active&&`checked`} /></td>
      <td data-tip="Select group to be assigned if other groups are not passed"><input type="radio" name="isDefault" ${e.isDefault&&`checked`}></td>
      <td data-tip="Assignment order: move group up"><button type="button" name="up" class="icon-up-big"></button></td>
      <td data-tip="Assignment order: move group down"><button type="button" name="down" class="icon-down-big"></button></td>
      <td data-tip="Remove group"><button type="button" name="remove" class="icon-trash"></button></td>
    </tr>`}function h(e,t){let n=e.previousElementSibling;c({title:`Limit group`,heading:`Limit group by ${e.getAttribute(`name`)}`,items:t,allowed:n.value?n.value.split(`,`).map(Number):[],onApply:t=>{n.value=t.join(`,`),e.innerHTML=t.length?`some`:`all`}})}function g(t){let n=t.previousElementSibling.value,r=n?JSON.parse(n):{},i=[{name:`capital`,icon:`icon-star`},{name:`port`,icon:`icon-anchor`},{name:`citadel`,icon:`icon-chess-rook`},{name:`walls`,icon:`icon-fort-awesome`},{name:`plaza`,icon:`icon-store`},{name:`temple`,icon:`icon-chess-bishop`},{name:`shanty`,icon:`icon-campground`}],a=i.map(({name:e,icon:t})=>`
        <tr data-tip="Select limitation for burg feature: ${e}">
          <td>
            <span class="${t}"></span>
            <span style="margin-left:.2em">${e}</span>
          </td>
          <td>
            <input type="radio" name="${e}" value="true" ${r[e]===!0?`checked`:``} style="margin:0" >
          </td>
          <td>
            <input type="radio" name="${e}" value="false" ${r[e]===!1?`checked`:``} style="margin:0">
          </td>
          <td>
            <input type="radio" name="${e}" value="undefined" ${r[e]===void 0?`checked`:``} style="margin:0">
          </td>
        </tr>`);alertMessage.innerHTML=`
      <form id="featuresLimitationForm">
        <table>
          <thead style="font-weight:bold">
            <td style="width:6em">Features</td>
            <td style="width:3em">True</td>
            <td style="width:3em">False</td>
            <td style="width:3em">Any</td>
          </thead>
          <tbody>
            ${a.join(``)}
          </tbody>
        </table>
      </form>`,$(`#alert`).dialog({width:`fit-content`,title:`Limit group by features`,buttons:{Apply:function(){let n=e(`featuresLimitationForm`),r=i.reduce((e,{name:t})=>{let r=n[t].value;return r!==`undefined`&&(e[t]=r===`true`),e},{});t.previousElementSibling.value=JSON.stringify(r),t.innerHTML=Object.keys(r).length?`some`:`any`,$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}}})}function _(t){if(e(`burgGroupsBody`).children.length<2){n(`At least one group should be defined`,!1,`error`);return}s({title:`Remove group`,message:`Are you sure you want to remove the group? <br>This WON'T change the burgs unless the changes are applied`,confirm:`Remove`,onConfirm:()=>{t.remove(),v()}})}function v(){let t=e(`burgGroupsForm`),n=t.name;if(n.length){let e=Array.from(n).map(e=>e.value);n.forEach(t=>{let n=t.value,r=l.test(n),i=e.filter(e=>e===n).length===1,a=r?i?``:`Group name should be unique`:`Group name must start with a letter or underscore and then contain only letters, digits, underscores, or dashes`;t.setCustomValidity(a)})}else{let e=n.value,t=l.test(e)?``:`Group name must start with a letter or underscore and then contain only letters, digits, underscores, or dashes`;n.setCustomValidity(t)}let r=t.active;if(r.length){let e=Array.from(r).map(e=>e.checked);r[0].setCustomValidity(e.includes(!0)?``:`At least one group should be active`)}else r.setCustomValidity(r.checked?``:`At least one group should be active`);let i=t.isDefault;if(i.length){let e=Array.from(i).map(e=>e.checked);i[0].setCustomValidity(e.includes(!0)?``:`At least one group should be default`)}else i.setCustomValidity(i.checked?``:`At least one group should be default`);let a=t.checkValidity();return a||t.reportValidity(),a}function y(e){let t=t=>e.querySelector(`input[name="${t}"]`),n=e=>{let n=t(e).valueAsNumber;return Number.isNaN(n)||n===0?void 0:n},r=e=>{let n=t(e).value;return n?n.split(`,`).map(Number):void 0};return{name:t(`name`).value,order:t(`order`).valueAsNumber,active:t(`active`).checked,isDefault:t(`isDefault`).checked,preview:e.querySelector(`select[name="preview"]`).value||void 0,min:n(`min`),max:n(`max`),percentile:n(`percentile`),features:b(t(`features`).value),biomes:r(`biomes`),states:r(`states`),cultures:r(`cultures`),religions:r(`religions`)}}function b(e){if(!JSON.isValid(e))return;let t=JSON.parse(e);return Object.keys(t).length?t:void 0}function x(r){if(r.preventDefault(),!v())return;let a=Array.from(e(`burgGroupsBody`).children);if(!a.length){n(`At least one group should be defined`,!1,`error`);return}options.map.burgs.groups=a.map(y),Options.save();let o=pack.burgs.filter(e=>e.i&&!e.removed),s=o.map(e=>e.population).sort((e,t)=>e-t);o.forEach(e=>void Burgs.defineGroup(e,s)),window.Labels.ensureBurgLabelGroups(),window.Burgs.ensureBurgGroupStyles(),t.draw(`burgIcons`),t.draw(`labels`),i(),$(`#burgGroupsEditor`).dialog(`close`)}var S={open:u};export{S as BurgGroupEditor};