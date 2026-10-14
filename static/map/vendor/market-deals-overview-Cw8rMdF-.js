import{P as e,ar as t,at as n,ot as r,r as i}from"./utils-BmikVS3h.js";import{Z as a}from"./layers-BxIfJwH8.js";import{i as o}from"./emblems-generator-BjakVvgH.js";import{i as s}from"./tooltips-BXzxW7Tn.js";import{t as c}from"./state-B2hBYDzv.js";import{i as l,l as u}from"./dialog-helpers-B3U8so3J.js";import{i as d,r as f}from"./index-CYvTpyWp.js";import{a as p,i as m,n as h,r as g}from"./table-CiMUvPqh.js";var _=0,v,y=`marketDeals`,b={my:`right top`,at:`right bottom+10`,of:`#marketOverview`,collision:`fit`},x=[{key:`icon`,width:`2em`,permanent:!0},{key:`good`,label:`Good`,width:`6.8em`,permanent:!0,sortBy:e=>Goods.get(e.good)?.name??``,sortType:`alpha`},{key:`direction`,label:`Type`,width:`5em`,sortBy:e=>A(e,_),sortType:`alpha`},{key:`counterparty`,label:`Counterparty`,width:`8em`,sortBy:e=>N(e)?.name??``,sortType:`alpha`},{key:`units`,label:`Units`,width:`5em`,sortBy:e=>e.units},{key:`income`,label:`Income`,width:`5em`,permanent:!0,sortBy:e=>P(e,_)}],S=g({getData:E,onUpdate:D});function C(t){o.retry(`goods`);let n=Markets.get(t);if(!n){s(`Invalid market. The selected market does not exist`,!0,`error`,5e3);return}v=c.get(y,`filters`,()=>({scope:`all`})),[`all`,`local`,`global`].includes(v.scope)||(v.scope=`all`),c.set(y,`filters`,v),_=t,w(),e(`marketDealsFilter`).value=v.scope,S.reset(),$(`#${y}`).dialog({title:`${Markets.getName(n)} Market Deals`,position:b,close:T})}function w(){l(y);let t=`<div id="${y}" class="dialog stable editorDialog">
      <div>
        ${m({dialogId:y,columns:x})}
        <div id="marketDealsBody" class="table" style="max-height:30em"></div>

        <div id="marketDealsFooter" class="totalLine">
          <div style="margin-left: 5px" data-tip="Deals count">Deals: <span id="marketDealsFooterDeals">0</span></div>
          <div data-col="income" style="margin-left: 12px" data-tip="Net flow for this market">Net Flow: <span id="marketDealsFooterNet">🟡 0</span></div>
        </div>

        <div id="marketDealsBottom">
          <button id="marketDealsRefresh" data-tip="Refresh the Deals screen" class="icon-cw"></button>
          <button id="marketDealsExport" data-tip="Save market deals data as a text file (.csv)" class="icon-download"></button>
          <select id="marketDealsFilter" data-tip="Filter deals by scope" style="margin-left: 8px">
            <option value="all">All</option>
            <option value="local">Local</option>
            <option value="global">Global</option>
          </select>
        </div>
      </div>
  </div>`;e(`dialogs`).insertAdjacentHTML(`beforeend`,t),f(y,S.reset),h({dialogId:y,columns:x,onUpdate:()=>u(y,{width:`fit-content`,position:b})}),e(`marketDealsRefresh`).addEventListener(`click`,S.refresh),e(`marketDealsExport`).addEventListener(`click`,F),e(`marketDealsBody`).addEventListener(`click`,e=>{let t=e.target.closest(`.marketDealParty`)?.closest(`.marketDeal`)?.dataset.id,n=pack.deals.find(e=>e.i===Number(t));if(!n)return;let r=N(n);r&&zoomTo(r.x,r.y,8,2e3)}),e(`marketDealsFilter`).addEventListener(`change`,e=>{v.scope=e.target.value,c.set(y,`filters`,v),S.reset()})}function T(){$(`#${y}`).dialog(`destroy`),e(y).remove()}function E(){return Markets.get(_)?d(y,O(pack.deals,_).filter(e=>{if(v.scope===`all`)return!0;let t=j(e,_);return v.scope===`local`?t.type===`burg`:t.type===`market`}),x):(s(`Invalid market. The selected market does not exist`,!0,`error`,5e3),[])}function D(t){let n=t.rows.map(M).join(``),r=t.all.reduce((e,t)=>e+P(t,_),0);e(`marketDealsBody`).innerHTML=n||`No market deals recorded`,e(`marketDealsFooterDeals`).innerHTML=String(t.all.length),e(`marketDealsFooterNet`).innerHTML=i(r),p(e(`marketDealsFooter`),t,S.goto),u(y,{width:`fit-content`,position:b})}function O(e,t){return e.filter(e=>e.sellerType===`market`&&e.seller===t||e.buyerType===`market`&&e.buyer===t)}function k(e,t){return e.sellerType===`market`&&e.seller===t}function A(e,t){return k(e,t)?`out`:`in`}function j(e,t){return k(e,t)?{id:e.buyer,type:e.buyerType}:{id:e.seller,type:e.sellerType}}function M(e){let n=Goods.get(e.good);if(!n)return``;let r=P(e,_),o=N(e),s=j(e,_),c=A(e,_),l=r>=0?`#2a6`:`#c44`,u=r>=0?`#dff0d8`:`#f2dede`;return`<div class="states marketDeal" data-id="${e.i}" data-good="${n.name}" data-direction="${c}" data-units="${t(e.units,2)}" data-counterparty="${s.type}_${o?.name}" data-income="${r}">
      <svg data-col="icon" data-tip="Good icon" width="1.3em" height="1.3em" class="goodIcon">
        ${a(n)}
      </svg>
      <div data-col="good" data-tip="Good name" class="goodName">${n.name}</div>
      <div data-col="direction"><span class="marketBadge" style="background:${u}; color:${l}">${c.toUpperCase()}</span></div>
      <div data-col="counterparty" class="marketDealParty pointer" data-tip="Click to zoom">
        <div class="${s.type===`burg`?`icon-dot-circled`:`icon-store`}" style="display:inline-block; width: 0.8em; ${s.type===`market`?`font-size: 0.85em;`:``}"></div>
        <div style="display:inline-block; width: 6.8em;">${o?.name}</div>
      </div>
      <div data-col="units" class="marketDealUnits">${t(e.units,2)}</div>
      <div data-col="income" class="marketDealIncome" style="color:${l}">${i(r)}</div>
    </div>`}function N(e){let t=j(e,_),n=t.type===`burg`?t.id:Markets.get(t.id)?.centerBurgId;return n&&pack.burgs[n]||null}function P(e,n){let r=t(e.units*e.price,2);return k(e,n)?r:-r}function F(){if(!Markets.get(_))return;let e=O(pack.deals,_),i=`Id,Good,Type,Client,Units,Price,Net
`;for(let n of e){let e=Goods.get(n.good);e&&(i+=[n.i,e.name,A(n,_),N(n)?.name??``,t(n.units,2),t(n.price,2),t(P(n,_),2)].join(`,`),i+=`
`)}n(i,`${r(`Market_${_}_Deals`)}.csv`)}var I={open:C};export{I as MarketDealsOverview};