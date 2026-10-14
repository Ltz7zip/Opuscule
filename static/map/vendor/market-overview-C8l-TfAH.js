import{L as e,P as t,ar as n,at as r,jn as i,ot as a,r as o}from"./utils-BmikVS3h.js";import{Z as s,it as c,t as l}from"./layers-BxIfJwH8.js";import{i as u}from"./emblems-generator-BjakVvgH.js";import{i as d,t as f}from"./tooltips-BXzxW7Tn.js";import{t as p}from"./controllers-ruU_lk_t.js";import{i as m,l as h,n as g,o as _}from"./dialog-helpers-B3U8so3J.js";import{t as v}from"./viewbox-events-DPNWFt4Z.js";import{i as y,r as b}from"./index-CYvTpyWp.js";import{a as x,i as S,n as C,r as w}from"./table-CiMUvPqh.js";var T=0,E=`marketOverview`,D={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},O=[{key:`icon`,width:`2.5em`,permanent:!0},{key:`good`,label:`Good`,width:`8em`,permanent:!0,sortBy:e=>e.good,sortType:`alpha`},{key:`stock`,label:`Stock`,width:`5em`,sortBy:e=>e.stock,defaultSort:`desc`},{key:`price`,label:`Price`,width:`5em`,permanent:!0,sortBy:e=>e.price}],k=w({getData:I,onUpdate:L});function A(e){if(u.retry(`goods`),customization)return;let t=Markets.get(e);if(!t){d(`Invalid market. The selected market does not exist`,!0,`error`,5e3);return}T=e,g(`#${E}, .stable`),j(),k.reset(),M(t),$(`#${E}`).dialog({title:`Market Stock: ${Markets.getName(t)}`,width:`auto`,close:V,position:D})}function j(){m(E);let e=`<div id="${E}" class="dialog stable editorDialog">
      ${S({dialogId:E,columns:O})}
      <div id="marketOverviewGoodsBody" class="table" style="max-height:40em"></div>
      <div id="marketOverviewSummary" class="totalLine"></div>
      <div id="marketOverviewNameLine" style="display: flex; align-items: center; margin-bottom: 0.4em">
        <div class="label">Name:</div>
        <input
          id="marketOverviewName"
          data-tip="Type to rename the market. Clear the field to reset to the default name"
          autocorrect="off"
          spellcheck="false"
          style="width: 11em; margin-left: 0.3em;"
        />
        <span
          id="marketOverviewNameReset"
          data-tip="Reset to the default name (center burg name)"
          class="icon-ccw pointer"
          style="margin-left: 0.3em"
        ></span>
      </div>
      <div id="marketOverviewInfo" style="margin-bottom: 0.3em"></div>
      <div id="marketOverviewBottom">
        <button id="marketOverviewRefresh" data-tip="Refresh the Overview screen" class="icon-cw"></button>
        <button id="marketOverviewOpenDeals" data-tip="View market deals" class="icon-list-bullet"></button>
        ${_(`marketOverviewLegend`,`this market`)}
        <button
          id="marketOverviewRelocate"
          data-tip="Relocate market. Click on a burg on the map to move the market center"
          class="icon-map-pin"
        ></button>
        <button id="marketOverviewExport" data-tip="Save market deals data as a text file (.csv)" class="icon-download"></button>
      </div>
  </div>`;t(`dialogs`).insertAdjacentHTML(`beforeend`,e),b(E,k.reset),C({dialogId:E,columns:O,onUpdate:()=>h(E,{width:`fit-content`,position:D})}),t(`marketOverviewRefresh`).addEventListener(`click`,k.refresh),t(`marketOverviewExport`).addEventListener(`click`,B),t(`marketOverviewOpenDeals`).addEventListener(`click`,()=>p.MarketDealsOverview.open(T)),t(`marketOverviewRelocate`).addEventListener(`click`,R),t(`marketOverviewLegend`).addEventListener(`click`,N),t(`marketOverviewName`).addEventListener(`input`,P),t(`marketOverviewNameReset`).addEventListener(`click`,F)}function M(e){let n=t(`marketOverviewName`);n.value=e.name||``,n.placeholder=pack.burgs[e.centerBurgId]?.name||`Market ${e.i}`}function N(){p.NotesEditor.open({type:`market`,id:T})}function P(){let e=Markets.get(T);e&&(Markets.rename(e.i,this.value),$(`#marketOverview`).dialog(`option`,`title`,`Market Stock: ${Markets.getName(e)}`))}function F(){let e=Markets.get(T);e&&(Markets.rename(e.i,``),t(`marketOverviewName`).value=``,$(`#marketOverview`).dialog(`option`,`title`,`Market Stock: ${Markets.getName(e)}`))}function I(){let e=Markets.get(T);if(!e)return d(`Invalid market. The selected market does not exist`,!0,`error`,5e3),[];let t=pack.burgs[e.centerBurgId];return!t||t.removed?(d(`Invalid market. The selected market has no center burg`,!0,`error`,5e3),[]):y(E,Object.entries(e.goods).flatMap(([e,t])=>{let n=Goods.get(+e);return n?[{goodId:+e,good:n.name,stock:t.stock,price:t.price}]:[]}),O)}function L(e){let r=Markets.get(T);if(!r)return;let i=e.rows.map(e=>{let t=Goods.get(e.goodId);return`<div class="states marketGood"
      data-good="${t.name}"
      data-stock="${n(e.stock,2)}"
      data-price="${n(e.price,2)}">
      <svg data-col="icon" data-tip="Good icon" width="2em" height="2em" class="goodIcon">
        ${s(t)}
      </svg>
      <div data-col="good" data-tip="Good name" class="goodName">${t.name}</div>
      <div data-col="stock" data-tip="Good stock" class="marketGoodStock">${n(e.stock,2)}</div>
      <div data-col="price" data-tip="Good price" class="marketGoodPrice">${o(e.price)}</div>
    </div>`});t(`marketOverviewGoodsBody`).innerHTML=i.join(``)||`No market goods available`;let a=pack.burgs[r.centerBurgId],l=pack.states[a?.state||0],u=`stateCOA${l.i}`;l&&c.trigger(u,l.coa),t(`marketOverviewInfo`).innerHTML=`<svg class="coaIcon" viewBox="0 0 200 200"><use href="#${u}"></use></svg><b>Owner:</b> ${l.fullName||l.name}`;let d=pack.burgs.filter(e=>!e.removed&&e.market===r.i),f=e.all.reduce((e,t)=>e+t.stock,0);t(`marketOverviewSummary`).innerHTML=`
    <div style="margin-left:5px">Cells: ${pack.cells.market.reduce((e,t)=>e+ +(t===r.i),0)}</div>
    <div style="margin-left:12px">Burgs: ${d.length}</div>
    <div data-col="stock" style="margin-left:12px">Stock: ${n(f,2)}</div>`,x(t(`marketOverviewSummary`),e,k.goto),h(E,{width:`fit-content`,position:D})}function R(){let e=t(`marketOverviewRelocate`);e.classList.toggle(`pressed`),e.classList.contains(`pressed`)?(i(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,z),d(`Click on a burg on the map to relocate the market center`,!0)):(f(),v())}function z(t){let n=Markets.get(T);if(!n)return;let[r,i]=e(t,this),a=Pack.findCell(r,i);if(a===void 0)return;let o=pack.cells.burg[a],s=pack.burgs[o];if(!o||!s||s.removed){d(`No valid burg in this cell. Click on a cell with a burg`,!1,`error`);return}if(o===n.centerBurgId){d(`This burg is already the center of this market`,!1,`error`);return}if(pack.markets.some(e=>e.centerBurgId===o)){d(`This burg is already a center of another market`,!1,`error`);return}Markets.relocateMarket(T,o)&&(R(),l.draw(`markets`),M(n),$(`#marketOverview`).dialog(`option`,`title`,`Market Stock: ${Markets.getName(n)}`),k.refresh())}function B(){let e=Markets.get(T);if(!e)return;let t=`Good,Stock,Buy Price,Sell Price
`;for(let[r,i]of Object.entries(e.goods)){let e=Goods.get(Number(r));if(!e)continue;let a=n(Markets.customerBuyPrice(i.price),2),o=n(Markets.customerSellPrice(i.price),2);t+=`${[e.name,n(i.stock,2),a,o].join(`,`)}\n`}r(t,`${a(`Market`)}.csv`)}function V(){t(`marketOverviewRelocate`).classList.contains(`pressed`)&&R(),$(`#${E}`).dialog(`destroy`),t(E).remove()}var H={open:A};export{H as MarketOverview};