import{F as e,P as t,X as n}from"./utils-Dk4MDzbZ.js";import{mt as r,t as i}from"./layers--lc146Vt.js";import{t as a}from"./layer-labels-C6lPCAWi.js";var o={political:`Political map`,cultural:`Cultural map`,religions:`Religions map`,provinces:`Provinces map`,biomes:`Biomes map`,heightmap:`Heightmap`,physical:`Physical map`,poi:`Places of interest`,goods:`Goods map`,trade:`Trade animation`,military:`Military map`,emblems:`Emblems`,landmass:`Pure landmass`},s=e=>[...a].find(([,t])=>t.shortcut===e)?.[0],c=`
  <p data-tip="Select a map layers preset" style="display: inline-block">Layers preset:</p>
  <select data-tip="Select a map layers preset" id="layersPreset" style="width: 45%">
    ${Object.entries(o).map(([e,t])=>`<option value="${e}">${t}</option>`).join(``)}
    <option hidden value="custom">Custom (not saved)</option>
  </select>
  <button
    id="savePresetButton"
    data-tip="Click to save displayed layers as a new preset"
    class="icon-plus sideButton"
    style="display: none"
  ></button>
  <button
    id="removePresetButton"
    data-tip="Click to remove current custom preset"
    class="icon-minus sideButton"
    style="display: none"
  ></button>
  <p>Displayed layers and layer order:</p>
  <ul
    data-tip="Click to toggle a layer, drag to raise or lower a layer. Ctrl + click to edit layer style"
    id="mapLayers"
  >
  </ul>
  <div class="tip">Click to toggle, drag to raise or lower the layer</div>
  <div class="tip">Ctrl + click to edit layer style</div>
  <div id="viewMode" data-tip="Set view mode">
    <p>View mode:</p>
    <button data-tip="Standard view mode for editing the map" id="viewStandard" class="pressed">
      Standard
    </button>
    <button
      data-tip="Map presentation in 3D scene. Works best for heightmap. Cannot be used for editing"
      id="viewMesh"
    >
      3D scene
    </button>
    <button data-tip="Project map on globe. Cannot be used for editing" id="viewGlobe">Globe</button>
  </div>
`;t(`layersContent`).innerHTML=c;function l(){t(`mapLayers`).replaceChildren(...i.all.flatMap(e=>{let t=a.get(e.id);if(!t)return[];let n=document.createElement(`li`);return n.dataset.layer=e.id,n.dataset.tip=`${t.label.replace(/<\/?u>/g,``)}: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style`,t.shortcut&&(n.dataset.shortcut=t.hint??t.shortcut.replace(`Key`,``)),n.innerHTML=t.label,n.classList.toggle(`buttonoff`,!i.isOn(e.id)),n.classList.toggle(`solid`,e.params.parent!==`viewbox`),[n]}))}t(`mapLayers`).addEventListener(`click`,e=>{let t=e.target.closest(`li`)?.dataset.layer;if(!(!t||!i.has(t))){if(n(e))return void Controllers.StyleEditor.open(t);i.toggle(t)}}),$(`#mapLayers`).sortable({items:`li:not(.solid)`,containment:`parent`,cancel:`.solid`,update:(e,t)=>{let n=t.item.data(`layer`),r=t.item.next().data(`layer`),a=i.has(n)?n:void 0,o=i.has(r)?r:void 0;a&&i.move(a,o)}}),i.subscribe(l),i.subscribe(()=>r.renderNow());var u;i.subscribe(()=>{e(`canvas3d`)&&(clearTimeout(u),u=window.setTimeout(()=>void Controllers.View3d.update(),400))}),l();export{s as n,o as t};