import{Xn as e,ar as t,bn as n,jn as r,yn as i}from"./utils-Dk4MDzbZ.js?v=2";import{t as a}from"./drag-Dc9_zdw7.js?v=2";import{i as o}from"./tooltips-3xx1wzLl.js?v=2";import{i as s}from"./viewport-C0deAIKO.js?v=2";var c={pickerH:360,pickerS:1,pickerL:1},l=14,u=22,d=20,f=4,p=16,m=315;function h(){document.getElementById(`pickerContainer`)?.remove()}function g(e,t){h(),v(_(),t),e[0]===`#`&&(x(e),O(),k()),C(e)}function _(){let e=Array.from(document.querySelectorAll(`g#defs-hatching > pattern`)),t=e.length,n=Array.from({length:t},(e,n)=>i(n/t*360,.7,.7).formatHex()),r=Math.ceil(t/l),a=36+r*d,o=16+t*2+r*d,c=Math.max(40,a,o)+9,h=(s.width-m)/2,g=(s.height-c)/2,_=Array.from(document.querySelectorAll(`.ui-front`)).reduce((e,t)=>Math.max(e,Number(getComputedStyle(t).zIndex)||0),100)+1,v=[{id:`pickerH`,label:`H:`,x:4,x1:18,x2:107,cx:75,tip:`Set palette hue`},{id:`pickerS`,label:`S:`,x:113,x1:124,x2:206,cx:181.4,tip:`Set palette saturation`},{id:`pickerL`,label:`L:`,x:213,x1:226,x2:306,cx:282,tip:`Set palette lightness`}].map(e=>`<g data-tip="${e.tip}">
        <text x="${e.x}" y="14">${e.label}</text>
        <line x1="${e.x1}" y1="10" x2="${e.x2}" y2="10"></line>
        <circle cx="${e.cx}" cy="10" r="5" id="${e.id}"></circle>
      </g>`).join(``),y=n.map((e,t)=>`<rect
        id="picker_${e}"
        fill="${e}"
        class="${t?``:`selected`}"
        x="${t%l*u+f}"
        y="${40+Math.floor(t/l)*d}"
        width="${p}"
        height="${p}"
      ></rect>`).join(``),b=e.map((e,n)=>`<rect
        id="picker_${e.id}"
        fill="url(#${e.id})"
        x="${n%l*u+f}"
        y="${Math.floor(n/l)*d+20+t*2}"
        width="${p}"
        height="${p}"
      ></rect>`).join(``);return document.body.insertAdjacentHTML(`beforeend`,`<svg
      id="pickerContainer"
      width="100%"
      height="100%"
      style="z-index: ${_}"
    >
      <rect id="pickerOverlay" x="0" y="0" width="100%" height="100%" opacity="0.2"></rect>
      <g id="picker" transform="translate(${h},${g})">
        <rect id="pickerBackground" x="0" y="0" width="${m}" height="${c}" fill="#ffffff" stroke="#5d4651"></rect>
        <g id="pickerControls">${v}</g>
        <foreignObject id="pickerSpaces" x="4" y="20" width="303" height="20"><label style="margin-right: 6px"
    >HSL: <input type="number" id="pickerHSL_H" data-space="hsl" min="0" max="360" value="231" />,
    <input type="number" id="pickerHSL_S" data-space="hsl" min="0" max="100" value="70" />,
    <input type="number" id="pickerHSL_L" data-space="hsl" min="0" max="100" value="70" />
  </label>
  <label style="margin-right: 6px"
    >RGB: <input type="number" id="pickerRGB_R" data-space="rgb" min="0" max="255" value="125" />,
    <input type="number" id="pickerRGB_G" data-space="rgb" min="0" max="255" value="142" />,
    <input type="number" id="pickerRGB_B" data-space="rgb" min="0" max="255" value="232" />
  </label>
  <label>HEX: <input type="text" id="pickerHEX" data-space="hex" style="width:42px" autocorrect="off" spellcheck="false" value="#7d8ee8" /></label></foreignObject>
        <g id="pickerColors" stroke="#333333">${y}</g>
        <g id="pickerHatches" stroke="#333333">${b}</g>
        <rect id="pickerHeader" x="0" y="-30" width="${m}" height="30"></rect>
        <text id="pickerLabel" x="12" y="-10">Color Picker</text>
        <rect id="pickerCloseRect" x="${m-23}" y="-21" width="14" height="14"></rect>
        <text id="pickerCloseText" x="${m-20}" y="-10">✕</text>
      </g>
    </svg>`),document.getElementById(`pickerContainer`)}function v(e,t){let n=b(`picker`),i=()=>e.remove(),s=()=>o(`Click to close the picker`),c=()=>o(`Drag to change the picker position`);b(`pickerOverlay`).addEventListener(`mousemove`,s),b(`pickerOverlay`).addEventListener(`click`,i),b(`pickerCloseRect`).addEventListener(`mousemove`,s),b(`pickerCloseRect`).addEventListener(`click`,i),b(`pickerBackground`).addEventListener(`mousemove`,c),b(`pickerHeader`).addEventListener(`mousemove`,c),b(`pickerLabel`).addEventListener(`mousemove`,c),b(`pickerControls`).addEventListener(`mousemove`,e=>{let t=e.target.closest(`g[data-tip]`);t&&o(t.dataset.tip||``)}),e.querySelectorAll(`#pickerControls line`).forEach(e=>{e.addEventListener(`click`,e=>j(e,t))}),e.querySelectorAll(`#pickerSpaces input`).forEach(e=>{e.addEventListener(`change`,e=>N(e,t))}),b(`pickerSpaces`).addEventListener(`mousemove`,()=>o(`Color value in different color spaces. Edit to change`)),y(b(`pickerColors`),t,`Click to fill with the color`),y(b(`pickerHatches`),t),r(n).call(a().filter(e=>e.target.tagName!==`INPUT`).on(`start`,function(e){P.call(this,e)})),r(n).selectAll(`#pickerControls circle`).call(a().on(`start`,function(e){M.call(this,e,t)}))}function y(e,t,n){e.addEventListener(`click`,e=>{let n=e.target.closest(`rect`);n&&A(n,t)}),e.addEventListener(`mouseover`,e=>{let t=e.target.closest(`rect`);t&&o(n||`Click to fill with the hatching ${t.id}`)})}function b(e){return document.getElementById(e)}function x(e){let{h:t,s:n,l:r}=i(e);Number.isNaN(t)||T(`pickerH`,t,360),Number.isNaN(n)||T(`pickerS`,n,1),Number.isNaN(r)||T(`pickerL`,r,1)}function S(e){let t=b(`picker`).querySelector(`rect.selected`);t&&e(t.getAttribute(`fill`))}function C(e){let t=b(`picker`);t.querySelector(`rect.selected`)?.classList.remove(`selected`),t.querySelector(`rect[fill='${e.toLowerCase()}']`)?.classList.add(`selected`)}var w=e=>b(e);function T(e,t,n){let r=w(e),i=r.previousElementSibling,a=Number(i.getAttribute(`x1`)),o=Number(i.getAttribute(`x2`))-a;r.setAttribute(`cx`,String(a+t/n*o))}function E(e){let t=w(e),n=t.previousElementSibling,r=Number(n.getAttribute(`x1`)),i=Number(n.getAttribute(`x2`))-r;return(Number(t.getAttribute(`cx`))-r)/i*c[e]}var D=()=>i(E(`pickerH`),E(`pickerS`),E(`pickerL`));function O(){let{h:e,s:r,l:i}=D(),a=(e,t)=>{document.getElementById(e).value=String(t)};a(`pickerHSL_H`,t(e)),a(`pickerHSL_S`,t(r*100)),a(`pickerHSL_L`,t(i*100));let o=n(D());a(`pickerRGB_R`,o.r),a(`pickerRGB_G`,o.g),a(`pickerRGB_B`,o.b),a(`pickerHEX`,o.formatHex())}function k(){let e=Array.from(b(`pickerColors`).querySelectorAll(`rect`)),t=e.length,{h:n,s:r,l:a}=D();e.forEach((e,o)=>{let s=i(o/t*180+n,r,a).formatHex();e.id=`picker_${s}`,e.setAttribute(`fill`,s)})}function A(e,t){let n=e.getAttribute(`fill`);C(n),S(t);let{h:r}=i(n);Number.isNaN(r)||(T(`pickerH`,r,360),O())}function j(e,t){let n=e.currentTarget,r=n.getScreenCTM()?.e||0;n.nextElementSibling.setAttribute(`cx`,String(e.x-r)),O(),k(),S(t)}function M(e,t){let n=this.previousElementSibling,r=Number(n.getAttribute(`x1`)),i=Number(n.getAttribute(`x2`));e.on(`drag`,e=>{this.setAttribute(`cx`,String(Math.max(Math.min(e.x,i),r))),O(),k(),S(t)})}function N(e,t){let r=e.currentTarget,a=()=>o(`You must provide a correct value`,!1,`error`);if(!r.checkValidity())return void a();let s=r.dataset.space,c=Array.from(r.parentNode?.querySelectorAll(`input`)||[]).map(e=>e.value),l=s===`hex`?n(r.value):s===`rgb`?n(Number(c[0]),Number(c[1]),Number(c[2])):i(Number(c[0]),Number(c[1])/100,Number(c[2])/100),{l:u}=i(l);if(Number.isNaN(u))return void a();x(l.formatHex()),O(),k(),S(t)}function P(n){let r=e(this.getAttribute(`transform`)),i=Number(r[0])-n.x,a=Number(r[1])-n.y,o=this.getBBox();n.on(`drag`,e=>{let n=t((i+e.x+o.width)/s.width*100,2),r=t((a+e.y+o.height)/s.height*100,2);this.setAttribute(`transform`,`translate(${i+e.x},${a+e.y})`),this.dataset.x=String(n),this.dataset.y=String(r)})}var F={open:g,close:h};export{F as ColorPicker};