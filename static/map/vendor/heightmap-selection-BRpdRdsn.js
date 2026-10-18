import{Lt as e,P as t,V as n}from"./utils-Dk4MDzbZ.js";import{g as r,r as i}from"./options-tab-CvGZP1eW.js";import{X as a}from"./layers-BpUy7Q_B.js";import{s as o}from"./options-schema-MDTOWXDp.js";import{t as s}from"./pins-L9rE4G31.js";import{s as c}from"./generation-pipeline-efzL-V7h.js";import{n as l,r as u}from"./dialog-helpers-MF-Ear8n.js";var d=e(),f=S(),p=C();g(),_(),v();function m(){l(`.stable`),b(options.generation.template),f=S(),p=C(),t(`heightmapSelection`).style.setProperty(`--preview-aspect-ratio`,`${f.width}/${f.height}`),D(),$(`#heightmapSelection`).dialog({title:`Select Heightmap`,resizable:!1,position:{my:`center`,at:`center`,of:`svg`},close:h,buttons:{Cancel:function(){$(this).dialog(`close`)},Select:function(){let e=y();e&&(Options.set(t=>t.generation.template=e),i(),s.set(`template`,options.generation.template),$(this).dialog(`close`))},"New Map":function(){let e=y();if(!e)return;Options.set(t=>t.generation.template=e),i(),s.set(`template`,options.generation.template);let t=x(),n=p,r=f;n&&r&&regeneratePrompt({seed:t,graph:n,...r}),$(this).dialog(`close`)}}})}function h(){p=null,f=null,HeightmapGenerator.clearData()}function g(){let e=document.createElement(`style`);e.textContent=`
    div.dialog > div.heightmap-selection {
      width: 70vw;
      height: 70vh;
    }

    .heightmap-selection_container {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      grid-gap: 6px;
    }

    @media (max-width: 600px) {
      .heightmap-selection_container {
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
        grid-gap: 4px;
      }
    }

    @media (min-width: 2000px) {
      .heightmap-selection_container {
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        grid-gap: 8px;
      }
    }

    .heightmap-selection_options {
      display: grid;
      grid-template-columns: 2fr 1fr;
    }

    .heightmap-selection_options > div:first-child {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      align-items: center;
      justify-self: start;
      justify-items: start;
    }

    @media (max-width: 600px) {
      .heightmap-selection_options {
        grid-template-columns: 3fr 1fr;
      }

      .heightmap-selection_options > div:first-child {
        display: block;
      }
    }

    .heightmap-selection_options > div:last-child {
      justify-self: end;
    }

    .heightmap-selection article {
      padding: 4px;
      border-radius: 8px;
      transition: all 0.1s ease-in-out;
      filter: drop-shadow(1px 1px 4px #999);
    }

    .heightmap-selection article:hover {
      background-color: #ddd;
      filter: drop-shadow(1px 1px 8px #999);
      cursor: pointer;
    }

    .heightmap-selection article.selected {
      background-color: #ccc;
      outline: 1px solid var(--dark-solid);
      filter: drop-shadow(1px 1px 8px #999);
    }

    .heightmap-selection article > div {
      display: flex;
      justify-content: space-between;
      padding: 2px 1px;
    }

    .heightmap-selection article > img {
      width: 100%;
      aspect-ratio: var(--preview-aspect-ratio);
      border-radius: 8px;
      object-fit: fill;
    }

    .heightmap-selection article .regeneratePreview {
      outline: 1px solid #bbb;
      padding: 1px 3px;
      border-radius: 4px;
      transition: all 0.1s ease-in-out;
    }

    .heightmap-selection article .regeneratePreview:hover {
      outline: 1px solid #666;
    }

    .heightmap-selection article .regeneratePreview:active {
      outline: 1px solid #333;
      color: #000;
      transform: rotate(45deg);
    }
  `,document.head.appendChild(e)}function _(){let e=p,i=f;if(!e||!i)return;let a=`<div id="heightmapSelection" class="dialog stable">
    <div class="heightmap-selection">
      <section data-tip="Select heightmap template – template provides unique, but similar-looking maps on generation">
        <header><h1>Heightmap templates</h1></header>
        <div class="heightmap-selection_container"></div>
      </section>
      <section data-tip="Select precreated heightmap – it will be the same for each map">
        <header><h1>Precreated heightmaps</h1></header>
        <div class="heightmap-selection_container"></div>
      </section>
      <section>
        <header><h1>Options</h1></header>
        <div class="heightmap-selection_options">
          <div>
            <label data-tip="Rerender all preview images" class="checkbox-label" id="heightmapSelectionRedrawPreview">
              <i class="icon-cw"></i>
              Redraw preview
            </label>
            <div>
              <input id="heightmapSelectionRenderOcean" class="checkbox" type="checkbox" />
              <label data-tip="Draw heights of water cells" for="heightmapSelectionRenderOcean" class="checkbox-label">Render ocean heights</label>
            </div>
            <div data-tip="Color scheme used for heightmap preview">
              Color scheme
              <select id="heightmapSelectionColorScheme">${n.names().map(e=>`<option value="${e}">${e}</option>`).join(``)}</select>
            </div>
          </div>
          <div>
            <button data-tip="Open Template Editor" data-tool="templateEditor" id="heightmapSelectionEditTemplates">Edit Templates</button>
            <button data-tip="Open Image Converter" data-tool="imageConverter" id="heightmapSelectionImportHeightmap">Import Heightmap</button>
          </div>
        </div>
      </section>
    </div>
  </div>`;t(`dialogs`).insertAdjacentHTML(`beforeend`,a);let o=document.getElementsByClassName(`heightmap-selection_container`);o[0].innerHTML=Object.keys(c).map(t=>{let n=c[t].name;return Math.random=aleaPRNG(d),`<article data-id="${t}" data-seed="${d}">
        <img src="${k(HeightmapGenerator.fromTemplate(e,t,i))}" alt="${n}" />
        <div>
          ${n}
          <span data-tip="Regenerate preview" class="icon-cw regeneratePreview"></span>
        </div>
      </article>`}).join(``),o[1].innerHTML=Object.keys(r).map(e=>{let t=r[e].name;return T(e),`<article data-id="${e}" data-seed="${d}">
        <img alt="${t}" />
        <div>${t}</div>
      </article>`}).join(``)}function v(){t(`heightmapSelection`).addEventListener(`click`,e=>{let t=e.target,n=t.closest(`#heightmapSelection article`);if(!n)return;let r=n.dataset.id;r&&(t.matches(`span.icon-cw`)&&E(n,r),b(r))}),t(`heightmapSelectionRenderOcean`).addEventListener(`change`,D),t(`heightmapSelectionColorScheme`).addEventListener(`change`,D),t(`heightmapSelectionRedrawPreview`).addEventListener(`click`,D),t(`heightmapSelectionEditTemplates`).addEventListener(`click`,e=>O(e.currentTarget)),t(`heightmapSelectionImportHeightmap`).addEventListener(`click`,e=>O(e.currentTarget))}function y(){return t(`heightmapSelection`).querySelector(`.selected`)?.dataset?.id}function b(e){let n=t(`heightmapSelection`);n.querySelector(`.selected`)?.classList?.remove(`selected`),n.querySelector(`[data-id="${e}"]`)?.classList?.add(`selected`)}function x(){return t(`heightmapSelection`).querySelector(`.selected`)?.dataset?.seed}function S(){let{width:e,height:t,density:n}=options.generation.graph;return{width:e,height:t,points:o(n)}}function C(){let{width:e,height:t,points:n}=f??S(),r=options.map.graph;if(r.width!==e||r.height!==t||r.points!==n)return Grid.generate(d,e,t,n);let i=structuredClone(grid);return Grid.resetHeights(i),i}function w(e){let n=p,r=f;if(!n||!r)return;let i=k(HeightmapGenerator.fromTemplate(n,e,r));t(`heightmapSelection`).querySelector(`[data-id="${e}"]`)?.querySelector(`img`)?.setAttribute(`src`,i)}async function T(e){let n=p,r=f;if(!n||!r)return;let i=await HeightmapGenerator.fromPrecreated(n,e,r);if(n!==p)return;let a=k(i);t(`heightmapSelection`).querySelector(`[data-id="${e}"]`)?.querySelector(`img`)?.setAttribute(`src`,a)}function E(t,n){if(!p)return;Grid.resetHeights(p);let r=e();t.dataset.seed=r,Math.random=aleaPRNG(r),w(n)}function D(){if(!p)return;Grid.resetHeights(p);let e=t(`heightmapSelection`).querySelectorAll(`article`);for(let t of e){let{id:e,seed:n}=t.dataset;!e||!n||(Math.random=aleaPRNG(n),e in c?w(e):T(e))}}function O(e){let t=e.dataset.tool;t&&u({title:e.dataset.tip??``,message:`Opening the tool will erase the current map. Are you sure you want to proceed?`,confirm:`Continue`,onConfirm:()=>window.Controllers.HeightmapEditor.open({mode:`erase`,tool:t})})}function k(e){if(!p||!e?.length)return``;let r=n.get(t(`heightmapSelectionColorScheme`).value),i=t(`heightmapSelectionRenderOcean`).checked;return a({heights:e,width:p.cellsX,height:p.cellsY,scheme:r,renderOcean:i})}var A={open:m};export{A as HeightmapSelection};