import{Jn as e,P as t}from"./utils-Dk4MDzbZ.js?v=2";import{i as n}from"./tooltips-3xx1wzLl.js?v=2";var r=e=>e.filter(e=>e.i&&!e.removed);function i(e,t){return e?.length?e.map(e=>t.find(t=>t.i===e)?.name??``).join(`, `):`all`}function a({title:i,heading:a,items:o,allowed:s,onApply:c}){let l=r(o).map(({i:t,name:n,fullName:r,color:i})=>`<tr data-tip="${e(n)}">
      <td><span style="color:${e(i??``)}">⬤</span></td>
      <td>
        <input data-i="${t}" id="limitation${t}" type="checkbox" class="checkbox" ${!s?.length||s.includes(t)?`checked`:``}>
        <label for="limitation${t}" class="checkbox-label">${e(r||n)}</label>
      </td>
    </tr>`),u=t(`alertMessage`);u.innerHTML=`<b>${e(a)}:</b>
    <table style="margin-top:.3em"><tbody>${l.join(``)}</tbody></table>`;let d=()=>Array.from(u.querySelectorAll(`input`));$(`#alert`).dialog({width:`fit-content`,title:i,close:()=>$(`#alert`).dialog(`option`,`buttons`,{}),buttons:{Invert:()=>{for(let e of d())e.checked=!e.checked},Apply:()=>{let e=d().filter(e=>e.checked);if(!e.length)return n(`Select at least one element`,!1,`error`);c(e.length===d().length?[]:e.map(e=>Number(e.dataset.i))),$(`#alert`).dialog(`close`)},Cancel:()=>$(`#alert`).dialog(`close`)}})}export{a as n,i as t};