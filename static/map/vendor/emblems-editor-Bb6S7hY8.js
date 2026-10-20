import{Jn as e,Kn as t,P as n,Q as r,ar as i,at as a,jn as o,ot as s,rr as c}from"./utils-Dk4MDzbZ.js";import{at as l,ct as u,dt as d,et as f,ft as ee,it as te,lt as ne,ot as re,pt as p,st as ie,ut as ae}from"./layers--lc146Vt.js";import{t as oe}from"./drag-Dc9_zdw7.js";import{r as se}from"./highlight-BA-X3wTZ.js";import{i as m,n as h,r as ce,t as g}from"./emblems-generator-CFXxHBH0.js";import{i as _,t as le}from"./tooltips-3xx1wzLl.js";import{r as v}from"./emblems-uUqrpFK3.js";import{_ as ue,d as y,h as b,m as x,x as S}from"./schemaUtils-B2thnuln.js";import{i as de}from"./dialog-helpers-MF-Ear8n.js";import{cloneEmblem as fe,emblemURL as pe,loadEmblemIcons as C}from"./emblem-image-Drqqpx2w.js";import{t as me}from"./pictures-CmpWd_MP.js";import{IconPicker as he}from"./icon-picker-CfzPJKi8.js";var w=`https://azgaar.github.io/Armoria/`,ge=`https://armoria.herokuapp.com/`,T=`Paste an Armoria edit link, API link or COA string. Use the picture button for other images`;function E(e){let t=e.trim();if(!/^https?:\/\//i.test(t))return D(t);let n;try{n=new URL(t)}catch{throw Error(`The link is not a valid URL`)}if(!(n.origin===new URL(`https://azgaar.github.io/Armoria/`).origin&&n.pathname.startsWith(`/Armoria`)||n.origin===new URL(`https://armoria.herokuapp.com/`).origin)||!n.searchParams.has(`coa`))throw Error(T);return D(n.searchParams.get(`coa`)??``)}function D(e){if(!e)throw Error(T);try{let t=JSON.parse(/^%7b/i.test(e)?decodeURIComponent(e):e);if(O.safeParse(t).success)return t}catch{}throw Error(`The Armoria COA is not valid JSON with a field tincture`)}var O=b({t1:S(),shield:S().optional(),diaper:S().optional(),division:b({division:S(),t:S()}).optional(),charges:y(b({charge:S(),t:S(),p:S()})).optional(),ordinaries:y(b({ordinary:S(),t:S()})).optional(),inscriptions:y(b({text:S(),path:S()})).optional()});function _e(e){let t=new URL(ge);return t.searchParams.set(`size`,`1024`),t.searchParams.set(`format`,`svg`),t.searchParams.set(`coa`,JSON.stringify(e)),t.href}var ve=ue({type:x(`armoria:coa`),version:x(1),session:S(),coa:O,svg:S()}),ye=class{sessions=new Map;start(e,t,n,r=new URL(w).origin){for(let[e,n]of this.sessions)n.key===t&&this.sessions.delete(e);let i=crypto.randomUUID();return this.sessions.set(i,{target:e,key:t,map:n,origin:r}),i}receive(e,t){let n=ve.safeParse(e.data);if(!n.success)return null;let{session:r,coa:i,svg:a}=n.data,o=this.sessions.get(r);return!o||e.origin!==o.origin||o.map!==t?null:{target:o.target,coa:i,svg:a}}};function be(e){let t=e=>{if(!e||typeof e!=`string`)return!1;if(e in p||/^#[\da-f]{3,8}$/i.test(e))return!0;let[n,r,i]=e.split(`-`);return!t(r)||!t(i)?!1:n.startsWith(`semy_of_`)?!!g.chargeIcon(n.slice(8)):n in ae},n=e=>!e||e in d,r=e=>{let t=u(e,`heater`);return t?t in ne:!!g.chargeArt(e)};return t(e.t1)&&(!e.shield||e.shield in ne)&&(!e.diaper||e.diaper===`no`||e.diaper in ee)&&(!e.division||(e.division.division===`no`||e.division.division in re)&&t(e.division.t)&&n(e.division.line))&&(e.ordinaries??[]).every(e=>(e.ordinary===`bordure`||e.ordinary===`orle`||e.ordinary in ie)&&t(e.t)&&(!e.t2||t(e.t2))&&n(e.line))&&(e.charges??[]).every(e=>r(e.charge)&&t(e.t)&&(!e.t2||t(e.t2))&&(!e.t3||t(e.t3)))}var k=`Size of this emblem, 0 hides it. Change a whole category in Menu ⭢ Style ⭢ Emblems`,xe=`
  #emblemEditor { padding: .5em .7em .6em; }
  #emblemEditor > div { width: auto; }
  #emblemEditor .preview { width: 12em; height: 12em; margin: 0 auto .2em; }
  #emblemEditor .preview svg { width: 100%; height: 100%; overflow: visible; }
  #emblemArmiger { display: block; margin-bottom: .5em; text-align: center; }
  #emblemEditor .fields { display: grid; grid-template-columns: 6.4em minmax(0, 1fr); align-items: center; gap: .3em .4em; }
  #emblemEditor .fields .row { display: contents; }
  #emblemEditor .fields .row.hidden { display: none; }
  #emblemEditor .tincture { display: flex; align-items: center; gap: .35em; }
  #emblemEditor .tincture select { flex: 1; min-width: 0; }
  #emblemEditor .swatch { flex: none; width: 1.1em; height: 1.1em; border: 1px solid #0006; border-radius: 2px; }
  #emblemEditor .fields label { white-space: nowrap; padding: .15em .35em; border-radius: 3px; transition: background-color .3s ease-out; }
  #emblemEditor .fields label.active { background-color: #54ca7733; font-weight: bold; }
  #emblemEditor .fields select { width: 100%; min-width: 0; margin: 0; }
  #emblemEditor .fields hr { grid-column: 1 / -1; width: 100%; margin: .2em 0; border: 0; border-top: 1px solid #0000001f; }
  #emblemEditor .size { display: flex; align-items: center; gap: .4em; }
  #emblemEditor .size input[type="range"] { flex: 1; min-width: 0; margin: 0; }
  #emblemEditor .size input[type="number"] { width: 3.8em; margin: 0; }
  #emblemEditor .armoria { margin-top: .6em; }
  #emblemEditor .armoria button { width: 100%; margin: 0; padding: .4em; font-weight: bold; }
  #emblemEditor .armoria p { margin: .3em 0 0; font-size: .85em; opacity: .75; text-align: center; }
  #emblemEditor .toolbar { display: grid; grid-template-columns: repeat(7, 1fr); gap: .25em; margin-top: .7em; }
  #emblemEditor .control { display: flex; align-items: center; gap: .3em; margin-top: .4em; }
  #emblemEditor .control.hidden { display: none; }
  #emblemEditor .control input[type="text"] { flex: 1; min-width: 0; margin: 0; }
  #emblemEditor .control input[type="number"] { width: 4.6em; margin: 0; }
  #emblemEditor .control button { margin: 0; }
  #emblemEditor #emblemDownloadControl button { flex: 1; }
`,A,j,M,N,P=new ye,F=w;async function Se(){let e=pack.states.find(e=>e.i&&!e.removed&&e.coa),t=pack.burgs.find(e=>e.i&&!e.removed&&e.coa),n=e?`state`:`burg`,r=e??t;if(!r?.coa){_(`No emblems to edit, please generate states and burgs first`,!1,`error`);return}let i=`${n}COA${r.i}`;await l.trigger(i,r.coa),I(n,i,r)}function I(e,t,n,r){if(!customization){if(!t&&r)we(r);else{if(!e||!t||!n?.coa)return;A=e,j=t,M=n}Ce(),Q(),N?.(),N=te(Q),L(),$(`#emblemEditor`).dialog({title:`Edit Emblem`,resizable:!0,width:`22em`,height:`auto`,position:{my:`left top`,at:`left+10 top+10`,of:`svg`,collision:`fit`},close:Ge})}}function Ce(){de(`emblemEditor`);let e=`<div id="emblemEditor" class="dialog stable">
      <style>${xe}</style>
      <div class="preview"><svg viewBox="0 0 200 200"><use id="emblemImage"></use></svg></div>
      <b id="emblemArmiger"></b>
      <div class="fields">
        <label for="emblemStates" data-tip="Select state">State</label>
        <select id="emblemStates" data-tip="Select state"></select>
        <label for="emblemProvinces" data-tip="Select province in state">Province</label>
        <select id="emblemProvinces" data-tip="Select province in state"></select>
        <label for="emblemBurgs" data-tip="Select burg in province or state">Burg</label>
        <select id="emblemBurgs" data-tip="Select burg in province or state"></select>
        <hr />
        <div id="emblemShapeRow" class="row">
        <label for="emblemShapeSelector" data-tip="Select shape of the emblem">Shape</label>
          <select id="emblemShapeSelector" data-tip="Select shape of the emblem">
            <option value="">None</option>
            <optgroup label="Basic">
              <option value="heater">Heater</option>
              <option value="spanish">Spanish</option>
              <option value="french">French</option>
            </optgroup>
            <optgroup label="Regional">
              <option value="horsehead">Horsehead</option>
              <option value="horsehead2">Horsehead Edgy</option>
              <option value="polish">Polish</option>
              <option value="hessen">Hessen</option>
              <option value="swiss">Swiss</option>
            </optgroup>
            <optgroup label="Historical">
              <option value="boeotian">Boeotian</option>
              <option value="roman">Roman</option>
              <option value="kite">Kite</option>
              <option value="oldFrench">Old French</option>
              <option value="renaissance">Renaissance</option>
              <option value="baroque">Baroque</option>
            </optgroup>
            <optgroup label="Specific">
              <option value="targe">Targe</option>
              <option value="targe2">Targe2</option>
              <option value="pavise">Pavise</option>
              <option value="wedged">Wedged</option>
              <option value="embowed">Embowed</option>
            </optgroup>
            <optgroup label="Banner">
              <option value="flag">Flag</option>
              <option value="pennon">Pennon</option>
              <option value="guidon">Guidon</option>
              <option value="banner">Banner</option>
              <option value="dovetail">Dovetail</option>
              <option value="gonfalon">Gonfalon</option>
              <option value="pennant">Pennant</option>
            </optgroup>
            <optgroup label="Simple">
              <option value="round">Round</option>
              <option value="oval">Oval</option>
              <option value="vesicaPiscis">Vesica Piscis</option>
              <option value="square">Square</option>
              <option value="diamond">Diamond</option>
              <option value="hexagon">Hexagon</option>
            </optgroup>
            <optgroup label="Fantasy">
              <option value="fantasy1">Fantasy1</option>
              <option value="fantasy2">Fantasy2</option>
              <option value="fantasy3">Fantasy3</option>
              <option value="fantasy4">Fantasy4</option>
              <option value="fantasy5">Fantasy5</option>
            </optgroup>
            <optgroup label="Middle Earth">
              <option value="noldor">Noldor</option>
              <option value="gondor">Gondor</option>
              <option value="easterling">Easterling</option>
              <option value="erebor">Erebor</option>
              <option value="ironHills">Iron Hills</option>
              <option value="urukHai">UrukHai</option>
              <option value="moriaOrc">Moria Orc</option>
            </optgroup>
          </select>
        </div>
        <div id="emblemFieldRow" class="row">
          <label for="emblemField" data-tip="Tincture of the field">Field</label>
          <div class="tincture"><span class="swatch"></span><select id="emblemField"></select></div>
        </div>
        <div id="emblemChargeRows" class="row">
          <label for="emblemChargeTincture" data-tip="Tincture of the main charge. A raster picture keeps its own colours">Charge</label>
          <div class="tincture"><span class="swatch"></span><select id="emblemChargeTincture"></select></div>
          <label for="emblemChargeSizeNumber" data-tip="Size of the main charge">Charge size</label>
          <div class="size" data-tip="Size of the main charge">
            <input id="emblemChargeSizeSlider" type="range" min=".2" max="3" step=".05" />
            <input id="emblemChargeSizeNumber" type="number" min=".2" max="3" step=".05" />
          </div>
        </div>
        <label for="emblemSizeNumber" data-tip="${k}">Map size</label>
        <div class="size" data-tip="${k}">
          <input id="emblemSizeSlider" type="range" min="0" max="5" step=".1" />
          <input id="emblemSizeNumber" type="number" min="0" max="5" step=".1" />
        </div>
      </div>
      <div class="armoria">
        <button id="emblemsArmoria" type="button" data-tip="Open the emblem in Armoria, the heraldry editor: your changes show on the map as you make them"><span class="icon-font"></span> Edit in Armoria</button>
      </div>
      <div class="toolbar">
        <button id="emblemsPaste" data-tip="Edit the COA string by hand, or paste an Armoria edit link, API link or COA string" class="icon-link"></button>
        <button id="emblemsCharge" data-tip="Set the charge: choose, link or upload a picture to place on the field" class="icon-chess-knight"></button>
        <button id="emblemsUpload" data-tip="Replace the whole emblem with a picture: choose, link or upload an image, such as a ready coat of arms" class="icon-shield-alt"></button>
        <button id="emblemsDownload" data-tip="Download the emblem as an image" class="icon-download"></button>
        <button id="emblemsGallery" data-tip="Download all emblems as an HTML gallery (open it in a browser; preparing takes a while)" class="icon-layer-group"></button>
        <button id="emblemsRegenerate" data-tip="Regenerate the emblem" class="icon-shuffle"></button>
        <button id="emblemsFocus" data-tip="Show the area or place of the emblem" class="icon-target"></button>
      </div>
      <div id="emblemPasteControl" class="control hidden">
        <input id="emblemPaste" type="text" placeholder="Armoria link or COA string" data-tip="The emblem's COA string: edit it, or replace it with an Armoria link or COA string, then Apply" />
        <button id="emblemPasteApply" type="button" data-tip="Apply the pasted emblem">Apply</button>
      </div>
      <div id="emblemDownloadControl" class="control hidden">
        <input id="emblemsDownloadSize" data-tip="Image size in pixels" type="number" value="500" step="100" min="100" max="10000" />
        <span>px</span>
        <button id="emblemsDownloadSVG" data-tip="Scalable vector image: best quality, opens in a browser or Inkscape">SVG</button>
        <button id="emblemsDownloadPNG" data-tip="Lossless raster image with a transparent background">PNG</button>
        <button id="emblemsDownloadJPG" data-tip="Compressed raster image on a white background">JPG</button>
      </div>
    </div>`;n(`dialogs`).insertAdjacentHTML(`beforeend`,e),n(`emblemStates`).oninput=Te,n(`emblemProvinces`).oninput=Ee,n(`emblemBurgs`).oninput=De,n(`emblemShapeSelector`).oninput=Oe,n(`emblemField`).oninput=ke,n(`emblemChargeTincture`).oninput=Ae,n(`emblemChargeSizeSlider`).oninput=V,n(`emblemChargeSizeNumber`).oninput=V,n(`emblemSizeSlider`).oninput=G,n(`emblemSizeNumber`).oninput=G,n(`emblemsRegenerate`).onclick=Pe,n(`emblemsArmoria`).onclick=Fe,n(`emblemsCharge`).onclick=()=>Re(`charge`),n(`emblemsUpload`).onclick=()=>Re(`whole`),n(`emblemsPaste`).onclick=()=>q(`emblemPasteControl`),n(`emblemPasteApply`).onclick=()=>void Ie(),n(`emblemPaste`).onkeydown=e=>{e.key===`Enter`&&Ie()},n(`emblemsDownload`).onclick=()=>q(`emblemDownloadControl`),n(`emblemsDownloadSVG`).onclick=()=>J(`svg`),n(`emblemsDownloadPNG`).onclick=()=>J(`png`),n(`emblemsDownloadJPG`).onclick=()=>J(`jpeg`),n(`emblemsGallery`).onclick=Ve,n(`emblemsFocus`).onclick=Ne}function we(e){let t=e.parentNode,n=t.id===`burgEmblems`?`burg`:t.id===`provinceEmblems`?`province`:`state`,r=+e.dataset.i,i=X(n,r);if(!i)throw Error(`Cannot edit ${n} emblem ${r}`);A=n,j=`${A}COA${r}`,M=i}function L(){let e=A,t=M,r=n(`emblemStates`),i=n(`emblemProvinces`),a=n(`emblemBurgs`),o=0,s=0,c=0;for(let[t,n]of[[r,`state`],[i,`province`],[a,`burg`]])t.previousElementSibling?.classList.toggle(`active`,e===n);e===`state`?o=t.i:e===`province`?(s=t.i,o=pack.states[t.state].i):(c=t.i,s=pack.cells.province[t.cell]?pack.provinces[pack.cells.province[t.cell]].i:0,o=t.state??0);let u=pack.burgs.filter(e=>e.i&&!e.removed&&e.coa);r.options.length=0,u.filter(e=>!e.state).length&&r.options.add(new Option(pack.states[0].name,`0`,!1,!o)),pack.states.filter(e=>e.i&&!e.removed).forEach(e=>{r.options.add(new Option(e.name,String(e.i),!1,e.i===o))}),i.options.length=0,i.options.add(new Option(``,`0`,!1,!s)),pack.provinces.filter(e=>!e.removed&&e.state===o).forEach(e=>{i.options.add(new Option(e.name,String(e.i),!1,e.i===s))}),a.options.length=0,a.options.add(new Option(``,`0`,!1,!c)),u.filter(e=>s?pack.cells.province[e.cell]===s:e.state===o).forEach(e=>{a.options.add(new Option(e.capital?`👑 ${e.name}`:e.name,String(e.i),!1,e.i===c))}),a.options[0].disabled=!0,l.trigger(j,t.coa),R()}function R(){let e=M;if(!e.coa)return;n(`emblemImage`).setAttribute(`href`,`#${j}`);let t=e.fullName||e.name;A===`burg`&&(t=`Burg of ${t}`),n(`emblemArmiger`).innerText=t??``;let r=n(`emblemShapeSelector`);r.value=e.coa.shield??(`icon`in e.coa?``:`heater`);let i=e.coa,a=B(),o=!!a&&!g.chargeIcon(a.charge)&&!!m.kind(a.charge);n(`emblemShapeRow`).classList.toggle(`hidden`,!o&&!(`icon`in i)),n(`emblemFieldRow`).classList.toggle(`hidden`,!o),n(`emblemChargeRows`).classList.toggle(`hidden`,!o),o&&!(`icon`in i)&&W(`emblemField`,i.t1),o&&a&&(W(`emblemChargeTincture`,a.t),n(`emblemChargeSizeSlider`).value=String(a.size??1),n(`emblemChargeSizeNumber`).value=String(a.size??1));let s=n(`emblemPaste`);if(document.activeElement!==s){let e=K(i);s.value=e?JSON.stringify(e):``}let c=e.coa.size??1;n(`emblemSizeSlider`).value=String(c),n(`emblemSizeNumber`).value=String(c)}function Te(){let e=+n(`emblemStates`).value;if(e){if(!Z(`state`,e))return}else{let e=pack.burgs.filter(e=>e.i&&!e.removed&&!e.state);if(!e.length||!Z(`burg`,e[0].i))return}L()}function Ee(){let e=+n(`emblemProvinces`).value;if(e){if(!Z(`province`,e))return}else if(!Z(`state`,+n(`emblemStates`).value))return;L()}function De(){Z(`burg`,+n(`emblemBurgs`).value)&&L()}function Oe(){let e=n(`emblemShapeSelector`),t=e.value,r=M.coa;if(t)`icon`in r?M.coa=z(r.icon,t,r):r.shield=t;else if(!(`icon`in r)){let t=r.charges?.[0]&&g.chargeArt(r.charges[0].charge);if(!t){e.value=r.shield??`heater`,_(`Only an emblem with a charge can show it without a shield`,!1,`warn`);return}M.coa={icon:t,size:r.size,x:r.x,y:r.y}}document.getElementById(j)?.remove(),l.trigger(j,M.coa),f(A,M.i),R()}function z(e,t,{size:n,x:r,y:i}){return{t1:`argent`,shield:t,charges:[{charge:g.chargeOf(e),t:`gules`,p:`e`,size:1.5}],size:n,x:r,y:i}}function B(){let e=M.coa;return`icon`in e?void 0:e.charges?.[0]}function ke(){let e=M.coa;`icon`in e||(e.t1=n(`emblemField`).value,H())}function Ae(){let e=B();e&&(e.t=n(`emblemChargeTincture`).value,H())}function V(e){let t=B(),n=+e.currentTarget.value;!t||!(n>0)||(t.size=n,H())}function H(){l.trigger(j,M.coa),R()}var U=[[`Metals`,v.metals],[`Colours`,v.colours],[`Stains`,v.stains]];function W(r,i){let a=n(r);a.innerHTML=(U.some(([,e])=>i in e)?``:`<option value="${e(i)}">${e(je(i))}</option>`)+U.map(([e,n])=>`<optgroup label="${e}">${Object.keys(n).map(e=>`<option value="${e}">${t(e)}</option>`).join(``)}</optgroup>`).join(``),a.value=i,a.previousElementSibling.style.background=Me(i)}function je(e){let[n,r,i]=e.split(`-`);return i?`${t(n.replace(`semy_of_`,`semy of `).replace(/([a-z])([A-Z])/g,`$1 $2`).toLowerCase())}: ${r} and ${i}`:e}function Me(e){let[,t,n]=e.split(`-`);return n?`repeating-linear-gradient(45deg, ${p[t]??t} 0 3px, ${p[n]??n} 3px 6px)`:p[e]??e}function Ne(){se(A,M)}function G(e){let t=c(+e.currentTarget.value||0,0,5);n(`emblemSizeSlider`).value=String(t),n(`emblemSizeNumber`).value=String(t);let{x:r,y:i}=M.coa;g.place(`${A}:${M.i}`,r??null,i??null,t),f(A,M.i)}function Pe(){g.regenerateOne(`${A}:${M.i}`),l.trigger(j,M.coa),f(A,M.i),R()}function K(e){if(`icon`in e){let t=h.get(e.icon);if(t?.kind!==`image`||!t.content.startsWith(`https://armoria.herokuapp.com/`))return null;try{return E(t.content)}catch{return null}}let{size:t,x:n,y:r,...i}=e;return i}function Fe(){let e=K(M.coa)??{t1:`sable`};e.charges?.some(({charge:e})=>!g.chargeIcon(e)&&m.kind(e))&&_(`Armoria cannot show pictures from the icon library: those charges are missing there`,!1,`warn`,6e3);let t=P.start({type:A,id:M.i,entity:M,queue:Promise.resolve()},`${A}:${M.i}`,options.map,new URL(F).origin),n=new URL(F);n.searchParams.set(`coa`,JSON.stringify(e)),n.searchParams.set(`from`,`FMG`),n.searchParams.set(`session`,t),n.searchParams.set(`returnOrigin`,location.origin),r(n.href)}async function Ie(){try{await Le(A,M.i,E(n(`emblemPaste`).value)),q(`emblemPasteControl`)}catch(e){_(e.message,!1,`error`,6e3)}}async function Le(e,t,n,r,i){let a=X(e,t);if(!a)return i;let o=options.map,{size:s,x:c,y:u}=a.coa,d;if(be(n))a.coa={...n,size:s,x:c,y:u},i&&h.get(i)&&!Object.keys(m.uses(i)).length&&h.remove(i);else{let t=i&&h.get(i)?i:void 0,l=t??h.newId(),f=r?await me.fromFile(new File([r],`armoria.svg`,{type:`image/svg+xml`}),l,`emblem`):{kind:`image`,content:_e(n),viewBox:ce};if(options.map!==o||X(e,a.i)!==a)return i;t?h.update(t,f):h.add({id:l,...f}),a.coa={icon:l,size:s,x:c,y:u},d=l,t||_(`This COA uses art FMG cannot draw; it shows as Armoria's picture`,!1,`warn`,5e3)}return A===e&&M.i===t&&(l.trigger(j,a.coa),R()),f(e,t),d}window.addEventListener(`message`,e=>{let t=P.receive(e,options.map);if(!t)return;let n=t.target;n.queue=n.queue.then(async()=>{X(n.type,n.id)===n.entity&&(n.picture=await Le(n.type,n.id,t.coa,t.svg,n.picture))}).catch(e=>_(e.message,!1,`error`,6e3))});function Re(e){let t=M,n=A,r=j,i=options.map,a=t.coa,o=`icon`in a?``:a.charges?.[0]?g.chargeArt(a.charges[0].charge)??``:``;he.open({current:`icon`in a?a.icon:e===`charge`?o:``,preferCustom:!0,profile:`emblem`,onPick:a=>{if(!a||options.map!==i||X(n,t.i)!==t)return;let o=t.coa;if(e===`whole`)t.coa={icon:a,size:o.size,x:o.x,y:o.y};else if(`icon`in o)t.coa=z(a,o.shield??g.getShield(t.culture??0,t.state),o);else{let e=g.chargeOf(a);o.charges?.length?o.charges[0]={...o.charges[0],charge:e}:o.charges=[{charge:e,t:/^(argent|or)$/.test(o.t1)?`gules`:`or`,p:`e`,size:1.5}]}l.trigger(r,t.coa),f(n,t.i),M===t&&R()}})}function q(e){for(let[t,r]of Object.entries({emblemPasteControl:`emblemsPaste`,emblemDownloadControl:`emblemsDownload`})){let i=t===e&&n(t).classList.contains(`hidden`);n(t).classList.toggle(`hidden`,!i),n(r).classList.toggle(`pressed`,i),i&&n(t).querySelector(`input`)?.focus()}}async function J(e){await l.trigger(j,M.coa);let t=document.getElementById(j);await C([t]);let r=+n(`emblemsDownloadSize`).value,i=await pe(t,r,e!==`svg`),a=document.createElement(`a`);a.download=`${s(`Emblem ${M.fullName||M.name}`)}.${e}`,e===`svg`?ze(i,a):Be(e,i,a,r),q(`emblemDownloadControl`)}function ze(e,t){t.href=e,t.click()}function Be(e,t,n,r){let i=document.createElement(`canvas`),a=i.getContext(`2d`);i.width=r,i.height=r;let o=new Image;o.src=t,o.onload=()=>{e===`jpeg`&&(a.fillStyle=`#fff`,a.fillRect(0,0,i.width,i.height)),a.drawImage(o,0,0,i.width,i.height);let t=i.toDataURL(`image/${e}`,.92);n.href=t,n.click(),window.setTimeout(()=>window.URL.revokeObjectURL(t),6e3)}}function Y(e,t){return new XMLSerializer().serializeToString(fe(e,t))}async function Ve(){let e=s(`Emblems Gallery`),t=pack.states.filter(e=>e.i&&!e.removed&&e.coa),n=pack.provinces.filter(e=>e.i&&!e.removed&&e.coa),r=pack.burgs.filter(e=>e.i&&!e.removed&&e.coa);await He(t,n,r),await C([...document.querySelectorAll(`#coas > svg`)]);let i=`<a href="javascript:history.back()">Go Back</a>`,o=`<div><h2>States</h2>${t.map(e=>{let t=document.getElementById(`stateCOA${e.i}`);return`<figure id="state_${e.i}"><a href="#provinces_${e.i}"><figcaption>${e.fullName}</figcaption>${Y(t,200)}</a></figure>`}).join(``)}</div>`,c=t.map(e=>{let t=n.filter(t=>t.state===e.i),r=t.map(e=>{let t=document.getElementById(`provinceCOA${e.i}`);return`<figure id="province_${e.i}"><a href="#burgs_${e.i}"><figcaption>${e.fullName}</figcaption>${Y(t,200)}</a></figure>`}).join(``);return t.length?`<div id="provinces_${e.i}">${i}<h2>${e.fullName} provinces</h2>${r}</div>`:``}).join(``),l=t.map(e=>{let t=r.filter(t=>t.state===e.i),a=n.filter(t=>t.state===e.i).map(e=>{let n=t.filter(t=>pack.cells.province[t.cell]===e.i),r=n.map(e=>{let t=document.getElementById(`burgCOA${e.i}`);return t?`<figure id="burg_${e.i}"><figcaption>${e.name}</figcaption>${Y(t,200)}</figure>`:``}).join(``);return n.length?`<div id="burgs_${e.i}">${i}<h2>${e.fullName} burgs</h2>${r}</div>`:``}).join(``),o=t.filter(e=>!pack.cells.province[e.cell]).map(e=>{let t=document.getElementById(`burgCOA${e.i}`);return t?`<figure id="burg_${e.i}"><figcaption>${e.name}</figcaption>${Y(t,200)}</figure>`:``}).join(``);return o&&(a+=`<div><h2>${e.fullName} burgs under direct control</h2>${o}</div>`),a}).join(``),u=r.filter(e=>!e.state),d=u.length?`<div><h2>Independent burgs</h2>${u.map(e=>{let t=document.getElementById(`burgCOA${e.i}`);return t?`<figure id="burg_${e.i}"><figcaption>${e.name}</figcaption>${Y(t,200)}</figure>`:``}).join(``)}</div>`:``;a(`<!DOCTYPE html>
    <html>
      <head>
        <title>${options.map.lore.name} Emblems Gallery</title>
      </head>
      <style type="text/css">
        body { margin: 0; padding: 1em; font-family: serif; }
        h1, h2 { font-family: "Forum"; }
        div { width: 100%; max-width: 1018px; margin: 0 auto; border-bottom: 1px solid #ddd; }
        figure { margin: 0 0 2em; display: inline-block; transition: 0.2s; }
        figure:hover { background-color: #f6f6f6; }
        figcaption { text-align: center; margin: 0.4em 0; width: 200px; font-family: "Overlock SC"; }
        address { width: 100%; max-width: 1018px; margin: 0 auto; }
        a { color: black; }
        figure > a { text-decoration: none; }
        div > a { float: right; font-family: var(--monospace); margin-top: 0.8em; }
      </style>
      <link href="https://fonts.googleapis.com/css2?family=Forum&family=Overlock+SC" rel="stylesheet" />
      <body>
        <div><h1>${options.map.lore.name} Emblems Gallery</h1></div>
        ${o} ${c} ${l} ${d}
        <address>Generated by <a href="https://azgaar.github.io/Fantasy-Map-Generator" target="_blank">Azgaar's Fantasy Map Generator</a>. The tool is free, but images may be copyrighted, see <a target="_blank" href="https://github.com/Azgaar/Armoria#license">the license</a></address>
      </body>
    </html>`,`${e}.html`,`text/plain`)}async function He(e,t,n){_(`Preparing for download...`,!0,`warn`);let r=e.map(e=>l.trigger(`stateCOA${e.i}`,e.coa)),i=t.map(e=>l.trigger(`provinceCOA${e.i}`,e.coa)),a=n.map(e=>l.trigger(`burgCOA${e.i}`,e.coa)),o=[...r,...i,...a];await Promise.allSettled(o),le()}function Ue(e){let t=Number(this.getAttribute(`x`))-e.x,n=Number(this.getAttribute(`y`))-e.y;e.on(`drag`,function(e){this.setAttribute(`x`,String(t+e.x)),this.setAttribute(`y`,String(n+e.y))}),e.on(`end`,function(e){let r=Number(this.parentNode.getAttribute(`font-size`))*Number.parseFloat(this.getAttribute(`width`)||`1`)/2,a=We(this.parentElement?.id),o=Number(this.dataset.i),s=a&&Number.isInteger(o)?X(a,o):void 0;if(!a||!s)return;let{width:l,height:u}=options.map.graph,d=c(i(t+e.x+r,2),0,l),ee=c(i(n+e.y+r,2),0,u);g.place(`${a}:${o}`,d,ee,s.coa.size??null),f(a,o)})}function We(e){if(e===`burgEmblems`)return`burg`;if(e===`provinceEmblems`)return`province`;if(e===`stateEmblems`)return`state`}function X(e,t){let n=e===`burg`?pack.burgs[t]:e===`province`?pack.provinces[t]:pack.states[t];return n?.coa?n:void 0}function Z(e,t){let n=X(e,t);return n?(A=e,j=`${e}COA${t}`,M=n,!0):!1}function Q(){o(`#emblems`).selectAll(`use`).call(oe().on(`drag`,Ue)).classed(`draggable`,!0)}function Ge(){N?.(),N=void 0,o(`#emblems`).selectAll(`use`).on(`.drag`,null).attr(`class`,null),$(`#emblemEditor`).dialog(`destroy`),n(`emblemEditor`).remove()}var Ke={open:I,openDefault:Se};export{Ke as EmblemsEditor};