import{B as e,Fn as t,In as n,Kn as r,Ln as i,Mn as a,P as o,Xt as s,Zt as c,a as l,ar as u,at as d,g as f,in as p,jn as m,n as h,o as g,ot as _,p as v,r as y,tn as ee,y as b}from"./utils-Dk4MDzbZ.js";import{t as x}from"./extent-V-JVJWfI.js";import{t as S}from"./mean-4Awewi9R.js";import{t as C}from"./sum-BpJJqxFM.js";import{n as te,r as w}from"./axis-I8_pxNLd.js";import{i as T}from"./tooltips-3xx1wzLl.js";import{i as E,l as D,n as O}from"./dialog-helpers-MF-Ear8n.js";var k=class extends Map{constructor(e,t=N){if(super(),Object.defineProperties(this,{_intern:{value:new Map},_key:{value:t}}),e!=null)for(let[t,n]of e)this.set(t,n)}get(e){return super.get(A(this,e))}has(e){return super.has(A(this,e))}set(e,t){return super.set(j(this,e),t)}delete(e){return super.delete(M(this,e))}};function A({_intern:e,_key:t},n){let r=t(n);return e.has(r)?e.get(r):n}function j({_intern:e,_key:t},n){let r=t(n);return e.has(r)?e.get(r):(e.set(r,n),n)}function M({_intern:e,_key:t},n){let r=t(n);return e.has(r)&&(n=e.get(r),e.delete(r)),n}function N(e){return typeof e==`object`&&e?e.valueOf():e}function P(e,t,...n){return F(e,Array.from,t,n)}function F(e,t,n,r){return(function e(i,a){if(a>=r.length)return n(i);let o=new k,s=r[a++],c=-1;for(let e of i){let t=s(e,++c,i),n=o.get(t);n?n.push(e):o.set(t,[e])}for(let[t,n]of o)o.set(t,e(n,a));return t(o)})(e,0)}function ne(e){return m(a(e).call(document.documentElement))}var I=Symbol(`implicit`);function L(){var e=new k,t=[],n=[],r=I;function i(i){let a=e.get(i);if(a===void 0){if(r!==I)return r;e.set(i,a=t.push(i)-1)}return n[a%n.length]}return i.domain=function(n){if(!arguments.length)return t.slice();t=[],e=new k;for(let r of n)e.has(r)||e.set(r,t.push(r)-1);return i},i.range=function(e){return arguments.length?(n=Array.from(e),i):n.slice()},i.unknown=function(e){return arguments.length?(r=e,i):r},i.copy=function(){return L(t,n).unknown(r)},p.apply(i,arguments),i}function re(){var e=L().unknown(void 0),n=e.domain,r=e.range,i=0,a=1,o,s,c=!1,l=0,u=0,d=.5;delete e.unknown;function f(){var e=n().length,f=a<i,p=f?a:i,m=f?i:a;o=(m-p)/Math.max(1,e-l+u*2),c&&(o=Math.floor(o)),p+=(m-p-o*(e-l))*d,s=o*(1-l),c&&(p=Math.round(p),s=Math.round(s));var h=t(e).map(function(e){return p+o*e});return r(f?h.reverse():h)}return e.domain=function(e){return arguments.length?(n(e),f()):n()},e.range=function(e){return arguments.length?([i,a]=e,i=+i,a=+a,f()):[i,a]},e.rangeRound=function(e){return[i,a]=e,i=+i,a=+a,c=!0,f()},e.bandwidth=function(){return s},e.step=function(){return o},e.round=function(e){return arguments.length?(c=!!e,f()):c},e.padding=function(e){return arguments.length?(l=Math.min(1,u=+e),f()):l},e.paddingInner=function(e){return arguments.length?(l=Math.min(1,e),f()):l},e.paddingOuter=function(e){return arguments.length?(u=+e,f()):u},e.align=function(e){return arguments.length?(d=Math.max(0,Math.min(1,e)),f()):d},e.copy=function(){return re(n(),[i,a]).round(c).paddingInner(l).paddingOuter(u).align(d)},p.apply(f(),arguments)}function R(e,t){if((o=e.length)>1)for(var n=1,r,i,a=e[t[0]],o,s=a.length;n<o;++n)for(i=a,a=e[t[n]],r=0;r<s;++r)a[r][1]+=a[r][0]=isNaN(i[r][1])?i[r][0]:i[r][1]}function z(e){for(var t=e.length,n=Array(t);--t>=0;)n[t]=t;return n}function B(e,t){return e[t]}function V(e){let t=[];return t.key=e,t}function ie(){var e=c([]),t=z,n=R,r=B;function i(i){var a=Array.from(e.apply(this,arguments),V),o,c=a.length,l=-1,u;for(let e of i)for(o=0,++l;o<c;++o)(a[o][l]=[0,+r(e,a[o].key,l,i)]).data=e;for(o=0,u=s(t(a));o<c;++o)a[u[o]].index=o;return n(a,u),a}return i.keys=function(t){return arguments.length?(e=typeof t==`function`?t:c(Array.from(t)),i):e},i.value=function(e){return arguments.length?(r=typeof e==`function`?e:c(+e),i):r},i.order=function(e){return arguments.length?(t=e==null?z:typeof e==`function`?e:c(Array.from(e)),i):t},i.offset=function(e){return arguments.length?(n=e??R,i):n},i}function ae(e,t){if((r=e.length)>0){for(var n,r,i=0,a=e[0].length,o;i<a;++i){for(o=n=0;n<r;++n)o+=e[n][i][1]||0;if(o)for(n=0;n<r;++n)e[n][i][1]/=o}R(e,t)}}function oe(e,t){if((c=e.length)>0)for(var n,r=0,i,a,o,s,c,l=e[t[0]].length;r<l;++r)for(o=s=0,n=0;n<c;++n)(a=(i=e[t[n]][r])[1]-i[0])>0?(i[0]=o,i[1]=o+=a):a<0?(i[1]=s,i[0]=s+=a):(i[0]=0,i[1]=a)}var H={states:{label:`State`,getId:e=>pack.cells.state[e],getName:X(`states`),getColors:Z(`states`),landOnly:!0},cultures:{label:`Culture`,getId:e=>pack.cells.culture[e],getName:X(`cultures`),getColors:Z(`cultures`),landOnly:!0},religions:{label:`Religion`,getId:e=>pack.cells.religion[e],getName:X(`religions`),getColors:Z(`religions`),landOnly:!0},provinces:{label:`Province`,getId:e=>pack.cells.province[e],getName:X(`provinces`),getColors:Z(`provinces`),landOnly:!0},biomes:{label:`Biome`,getId:e=>pack.cells.biome[e],getName:Se,getColors:Ce,landOnly:!1},markets:{label:`Market`,getId:e=>pack.cells.market[e],getName:we,getColors:Te,landOnly:!1},goods:{label:`Good`,requires:`good`,getId:(e,t)=>t.good,getName:Ee,getColors:De,landOnly:!1}},U={total_population:{label:`Total population`,quantize:e=>ke(e)+Q(e),aggregate:e=>u(C(e)),formatTicks:e=>b(e),stringify:e=>e.toLocaleString(),stackable:!0,landOnly:!0},urban_population:{label:`Urban population`,quantize:ke,aggregate:e=>u(C(e)),formatTicks:e=>b(e),stringify:e=>e.toLocaleString(),stackable:!0,landOnly:!0},rural_population:{label:`Rural population`,quantize:Q,aggregate:e=>u(C(e)),formatTicks:e=>b(e),stringify:e=>e.toLocaleString(),stackable:!0,landOnly:!0},area:{label:`Land area`,quantize:e=>l(pack.cells.area[e]),aggregate:e=>u(C(e)),formatTicks:e=>`${b(e)} ${g()}`,stringify:e=>`${e.toLocaleString()} ${g()}`,stackable:!0,landOnly:!0},cells:{label:`Cells`,hint:`Number of land cells`,quantize:()=>1,aggregate:e=>C(e),formatTicks:e=>e,stringify:e=>e.toLocaleString(),stackable:!0,landOnly:!0},burgs_number:{label:`Burgs`,hint:`Number of burgs`,quantize:e=>+!!pack.cells.burg[e],aggregate:e=>C(e),formatTicks:e=>e,stringify:e=>e.toLocaleString(),stackable:!0,landOnly:!0},average_elevation:{label:`Average elevation`,quantize:e=>pack.cells.h[e],aggregate:e=>S(e),formatTicks:e=>v(e),stringify:e=>v(e),stackable:!1,landOnly:!1},max_elevation:{label:`Maximum mean elevation`,quantize:e=>pack.cells.h[e],aggregate:e=>i(e),formatTicks:e=>v(e),stringify:e=>v(e),stackable:!1,landOnly:!1},min_elevation:{label:`Minimum mean elevation`,quantize:e=>pack.cells.h[e],aggregate:e=>n(e),formatTicks:e=>v(e),stringify:e=>v(e),stackable:!1,landOnly:!1},average_temperature:{label:`Annual mean temperature`,quantize:e=>grid.cells.temp[pack.cells.g[e]],aggregate:e=>S(e),formatTicks:e=>h(e),stringify:e=>h(e),stackable:!1,landOnly:!1},max_temperature:{label:`Annual max temperature`,hint:`Highest mean temperature of the year`,quantize:e=>grid.cells.temp[pack.cells.g[e]],aggregate:e=>i(e),formatTicks:e=>h(e),stringify:e=>h(e),stackable:!1,landOnly:!1},min_temperature:{label:`Annual min temperature`,hint:`Lowest mean temperature of the year`,quantize:e=>grid.cells.temp[pack.cells.g[e]],aggregate:e=>n(e),formatTicks:e=>h(e),stringify:e=>h(e),stackable:!1,landOnly:!1},average_precipitation:{label:`Annual mean precipitation`,quantize:e=>grid.cells.prec[pack.cells.g[e]],aggregate:e=>u(S(e)),formatTicks:e=>f(u(e)),stringify:e=>f(u(e)),stackable:!1,landOnly:!0},max_precipitation:{label:`Annual max precipitation`,hint:`Highest mean precipitation of the year`,quantize:e=>grid.cells.prec[pack.cells.g[e]],aggregate:e=>u(i(e)),formatTicks:e=>f(u(e)),stringify:e=>f(u(e)),stackable:!1,landOnly:!0},min_precipitation:{label:`Annual min precipitation`,hint:`Lowest mean precipitation of the year`,quantize:e=>grid.cells.prec[pack.cells.g[e]],aggregate:e=>u(n(e)),formatTicks:e=>f(u(e)),stringify:e=>f(u(e)),stackable:!1,landOnly:!0},coastal_cells:{label:`Number of coastal cells`,quantize:e=>+(pack.cells.t[e]===1),aggregate:e=>C(e),formatTicks:e=>e,stringify:e=>e.toLocaleString(),stackable:!0,landOnly:!0},river_cells:{label:`Number of river cells`,quantize:e=>+!!pack.cells.r[e],aggregate:e=>C(e),formatTicks:e=>e,stringify:e=>e.toLocaleString(),stackable:!0,landOnly:!0},production_value:{label:`Production value`,hint:`Worth of produced goods`,provides:[`good`],prepare:()=>({biomeProduction:Goods.getBiomesProduction()}),getContributions:(e,{biomeProduction:t})=>{let n=Oe(e,t),r=[];for(let[e,t]of Object.entries(n)){let n=Goods.get(+e);n&&r.push({good:+e,value:t*n.value})}return r},aggregate:e=>u(C(e)),formatTicks:e=>b(e),stringify:e=>y(e),stackable:!0,landOnly:!0},production_units:{label:`Production volume`,hint:`Units of goods produced`,provides:[`good`],prepare:()=>({biomeProduction:Goods.getBiomesProduction()}),getContributions:(e,{biomeProduction:t})=>{let n=Oe(e,t),r=[];for(let[e,t]of Object.entries(n))r.push({good:+e,value:t});return r},aggregate:e=>u(C(e)),formatTicks:e=>b(e),stringify:e=>`${e.toLocaleString()} units`,stackable:!0,landOnly:!0},burgs_profit:{label:`Burgs profit`,hint:`Burgs profit from trade and manufacturing`,quantize:e=>{let t=pack.cells.burg[e];return t&&pack.burgs[t].product||0},aggregate:e=>u(C(e)),formatTicks:e=>b(e),stringify:e=>y(e),stackable:!0,landOnly:!0}},se={stackedBar:{offset:oe},normalizedStackedBar:{offset:ae,formatX:e=>`${u(e*100)}%`}},W=[],G;function ce(){le(),he(),ue(),O(`#chartsOverview, .stable`);let e=mapHistory.at(-1)?.created;if(G!==e&&(W=[],G=e),!W.length)de();else for(let e of W)fe(e);$(`#chartsOverview`).dialog({title:`Data Charts`,width:`60vw`,height:`auto`,position:{my:`center`,at:`center`,of:`svg`},close:ge})}function le(){E(`chartsOverview`);let e=Object.entries(H).map(([e,{label:t}])=>[e,t]),t=Object.entries(U).map(([e,{label:t}])=>[e,t]),n=([e,t])=>`<option value="${e}">${t}</option>`,r=e=>e.map(n).join(``),i=`<div id="chartsOverview" class="dialog stable">
    <form id="chartsOverview__form">
      <div>
        <button data-tip="Add a chart" type="submit">Plot</button>

        <select data-tip="Select entity (y axis)" id="chartsOverview__entitiesSelect">
          ${r(e)}
        </select>

        <label for="chartsOverview__plotBySelect" data-tip="Select metric to plot (x axis)">
          <span>by</span>
          <select id="chartsOverview__plotBySelect">
            ${r(t)}
          </select>
          <i id="chartsOverview__plotByInfo" class="icon-info-circled" style="display: none"></i>
        </label>

        <label for="chartsOverview__groupBySelect" data-tip="Select entity to group by. If you don't need grouping, set it the same as the entity">
          <span>grouped by</span>
          <select id="chartsOverview__groupBySelect">
            ${r(e)}
          </select>
        </label>

        <label data-tip="Sorting type" for="chartsOverview__sortingSelect">
          <span>sorted</span>
          <select id="chartsOverview__sortingSelect">
            <option value="value">by value</option>
            <option value="name">by name</option>
            <option value="natural">naturally</option>
          </select>
        </label>
      </div>

      <div>
        <label data-tip="Select chart type" for="chartsOverview__chartType">
          <span>Type</span>
          <select id="chartsOverview__chartType">
            <option value="stackedBar" selected>Stacked Bar</option>
            <option value="normalizedStackedBar">Normalized Bar</option>
          </select>
        </label>

        <label data-tip="Show the charts in 1, 2, 3 or 4 columns" for="chartsOverview__viewColumns">
          <span>Columns</span>
          <select id="chartsOverview__viewColumns">
            <option value="1" selected>1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </label>

        <label data-tip="Exclude zero element from the results (id 0, e.g. the neutral state)" for="chartsOverview__excludeNeutral">
          <input id="chartsOverview__excludeNeutral" type="checkbox" class="native" />
          <span>Exclude neutral</span>
        </label>
      </div>
    </form>

    <section id="chartsOverview__charts"></section>
  </div>`;o(`dialogs`).insertAdjacentHTML(`beforeend`,i),o(`chartsOverview__entitiesSelect`).value=`states`,o(`chartsOverview__plotBySelect`).value=`total_population`,o(`chartsOverview__groupBySelect`).value=`cultures`,o(`chartsOverview__form`).addEventListener(`submit`,de),o(`chartsOverview__viewColumns`).addEventListener(`change`,he),o(`chartsOverview__plotBySelect`).addEventListener(`change`,ue),document.getElementById(`chartsOverviewStyle`)?.remove();let a=document.createElement(`style`);a.id=`chartsOverviewStyle`,a.textContent=`
    #chartsOverview {
      max-width: 90vw !important;
      max-height: 90vh !important;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto 1fr;
    }

    #chartsOverview__form {
      display: grid;
      font-size: 1.1em;
      margin: 0.3em 0;
    }

    #chartsOverview__form > div:first-child {
      display: flex;
      align-items: center;
      gap: 0.2em;
    }

    #chartsOverview__form > div:nth-child(2) {
      display: flex;
      align-items: center;
      gap: 1em;
    }

    #chartsOverview__form label {
      display: inline-flex;
      align-items: center;
    }

    #chartsOverview__charts {
      overflow: auto;
      scroll-behavior: smooth;
      display: grid;
    }

    #chartsOverview__charts figure {
      margin: 0;
      padding: 0.6em 0 1em;
      border-top: 1px solid rgba(128, 128, 128, 0.4);
    }

    #chartsOverview__charts figcaption {
      font-size: 1.2em;
      margin: 0 1% 0.4em 4%;
      display: grid;
      align-items: center;
      grid-template-columns: 1fr auto;
    }

    #chartsOverview__plotByInfo {
      margin-left: 0.3em;
      cursor: help;
      opacity: 0.6;
    }
  `,document.head.appendChild(a)}function ue(){let e=o(`chartsOverview__plotBySelect`).value,t=o(`chartsOverview__plotByInfo`),{hint:n}=U[e];n?(t.dataset.tip=n,t.style.display=``):t.style.display=`none`}function de(e){e&&e.preventDefault();let t=o(`chartsOverview__entitiesSelect`).value,n=o(`chartsOverview__plotBySelect`).value,r=o(`chartsOverview__groupBySelect`).value,i=o(`chartsOverview__sortingSelect`).value,a=o(`chartsOverview__chartType`).value,s=o(`chartsOverview__excludeNeutral`).checked,{label:c,stackable:l,provides:u=[]}=U[n],d=[t,r].find(e=>{let t=H[e].requires;return t?!u.includes(t):!1});if(d){T(`${c} cannot be broken down by ${H[d].label.toLowerCase()}`,!1,`error`,4e3);return}!l&&r!==t&&(T(`Grouping is not supported for ${n}`,!1,`warn`,4e3),r=t);let f={id:Date.now(),entity:t,plotBy:n,groupBy:r,sorting:i,type:a,excludeNeutral:s};W.push(f),fe(f),K()}function fe({id:t,entity:n,plotBy:i,groupBy:a,sorting:s,type:c,excludeNeutral:l}){let{label:d,stringify:f,quantize:p,getContributions:m,prepare:h,aggregate:g,formatTicks:_,landOnly:v}=U[i],y=a===n,{label:ee,getName:b,getId:x,landOnly:S}=H[n],{label:C,getName:te,getId:w,getColors:T}=H[a],E=h?h():void 0,D=m?e=>m(e,E):e=>[{value:p(e)}],O=`${r(n)} by ${d}${y?``:` grouped by ${C}`}`,k=(e,t,n,r)=>{let i=`${ee}: ${e}`,a=y?``:`${C}: ${t}`,o=`${d}: ${f(n)}`;return y||(o+=` (${u(r*100)}%)`),[i,a,o].filter(Boolean)},A={},j=new Set;for(let t of pack.cells.i)if(!((S||v)&&e(t,pack)))for(let e of D(t)){let n=x(t,e),r=w(t,e);if(l&&(n===0||r===0))continue;let{value:i}=e;A[n]?A[n][r]?A[n][r].push(i):A[n][r]=[i]:A[n]={[r]:[i]},j.add(r)}let M=Ae(Object.entries(A).flatMap(([e,t])=>{let n=b(e);return Object.entries(t).map(([e,t])=>({name:n,group:te(e),value:g(t)}))}),s),N=T(),{offset:P,formatX:F=_}=se[c];me(t,M,pe(M,{colors:N,tooltip:k,offset:P,formatX:F}),O),o(`chartsOverview__charts`).lastElementChild?.scrollIntoView()}function pe(e,{colors:n,tooltip:r,offset:i,formatX:a}){let o=e.map(e=>e.value),s=e.map(e=>e.name),c=e.map(e=>e.group),l=new Set(s),u=new Set(c),d=t(o.length).filter(e=>l.has(s[e])&&u.has(c[e])),f=Array.from(l),p=Array.from(u),m=be(f),h=xe(p,Y-m-15),g={top:30,right:15,bottom:h*20+10,left:m},_=[g.left,Y-g.right],v=l.size*25+g.top+g.bottom,y=[v-g.bottom,g.top],b=P(d,([e])=>e,e=>s[e],e=>c[e]),S=ie().keys(p).value(([,e],t)=>o[new Map(e).get(t)]).order(z).offset(i)(b).map(e=>{let t=e.filter(e=>!Number.isNaN(e[1])).map(t=>Object.assign(t,{i:new Map(t.data[1]).get(e.key)}));return{key:e.key,data:t}}),E=ee(x(S.flatMap(e=>e.data.flatMap(e=>[e[0],e[1]]))),_),D=re(f,y).paddingInner(_e),O=w(E).ticks(Y/80,null),k=te(D).tickSizeOuter(0),A=ne(`svg`).attr(`version`,`1.1`).attr(`xmlns`,`http://www.w3.org/2000/svg`).attr(`viewBox`,`0 0 ${Y} ${v}`).attr(`style`,`max-width: 100%; height: auto; height: intrinsic;`);A.append(`g`).attr(`transform`,`translate(0,${g.top})`).call(O).call(e=>e.select(`.domain`).remove()).call(e=>e.selectAll(`text`).text(e=>a(e))).call(e=>e.selectAll(`.tick line`).clone().attr(`y2`,v-g.top-g.bottom).attr(`stroke-opacity`,.1));let j=A.append(`g`).attr(`stroke`,`#666`).attr(`stroke-width`,.5).selectAll(`g`).data(S).join(`g`).attr(`fill`,e=>n[e.key]).selectAll(`rect`).data(e=>e.data.filter(([e,t])=>e!==t)).join(`rect`).attr(`x`,([e,t])=>Math.min(E(e),E(t))).attr(`y`,({i:e})=>D(s[e])).attr(`width`,([e,t])=>Math.abs(E(e)-E(t))).attr(`height`,D.bandwidth()),M=Object.fromEntries(P(d,e=>C(e,e=>o[e]),e=>s[e])),N=({i:e})=>r(s[e],c[e],o[e],o[e]/M[s[e]]);j.append(`title`).text(e=>N(e).join(`\r
`)),j.on(`mouseover`,(e,t)=>T(N(t).join(`. `))),A.append(`g`).attr(`transform`,`translate(${E(0)},0)`).call(k);let F=Math.ceil(p.length/h),I=Y/(F+.5),L=(e,t)=>t%F*I,R=(e,t)=>L(e,t)+ye,B=(e,t)=>Math.floor(t/F)*20,V=A.append(`g`).attr(`stroke`,`#666`).attr(`stroke-width`,.5).attr(`dominant-baseline`,`central`).attr(`transform`,`translate(${g.left},${v-g.bottom+15})`);return V.selectAll(`circle`).data(p).join(`rect`).attr(`x`,L).attr(`y`,B).attr(`width`,10).attr(`height`,10).attr(`transform`,`translate(-5, -5)`).attr(`fill`,e=>n[e]),V.selectAll(`text`).data(p).join(`text`).attr(`x`,R).attr(`y`,B).text(e=>e),A.node()}function me(e,t,n,r){let i=o(`chartsOverview__charts`),a=document.createElement(`figure`),s=document.createElement(`figcaption`);s.innerHTML=`
    <div>
      <strong>Figure ${i.childElementCount+1}</strong>. ${r}
    </div>
    <div>
      <button data-tip="Download chart data as a text file (.csv)" class="icon-download"></button>
      <button data-tip="Download the chart as a PNG image" class="icon-export"></button>
      <button data-tip="Download the chart in SVG format (vector, opens in a browser or Inkscape)" class="icon-chart-bar"></button>
      <button data-tip="Remove the chart" class="icon-trash"></button>
    </div>
  `,a.appendChild(s),a.appendChild(n),i.appendChild(a),a.querySelector(`button.icon-download`)?.addEventListener(`click`,()=>{let e=`${_(r)}.csv`;d(`Name,Group,Value
`+t.map(({name:e,group:t,value:n})=>`${e},${t},${n}`).join(`
`),e)}),a.querySelector(`button.icon-export`)?.addEventListener(`click`,()=>{let{width:e,height:t}=n.viewBox.baseVal,i=n.cloneNode(!0);i.setAttribute(`width`,String(e)),i.setAttribute(`height`,String(t));let a=new XMLSerializer().serializeToString(i),o=URL.createObjectURL(new Blob([a],{type:`image/svg+xml;charset=utf-8`})),s=new Image;s.onload=()=>{let n=document.createElement(`canvas`);n.width=e*2,n.height=t*2;let i=n.getContext(`2d`);i&&(i.fillStyle=`#fff`,i.fillRect(0,0,n.width,n.height),i.drawImage(s,0,0,n.width,n.height),n.toBlob(e=>e&&d(e,`${_(r)}.png`,`image/png`))),URL.revokeObjectURL(o)},s.src=o}),a.querySelector(`button.icon-chart-bar`)?.addEventListener(`click`,()=>{let e=`${_(r)}.svg`;d(n.outerHTML,e)}),a.querySelector(`button.icon-trash`)?.addEventListener(`click`,()=>{a.remove(),W=W.filter(t=>t.id!==e),K()})}function he(){let e=o(`chartsOverview__viewColumns`).value,t=o(`chartsOverview__charts`);t.style.gridTemplateColumns=`repeat(${e}, 1fr)`,K()}function K(){D(`chartsOverview`,{position:{my:`center`,at:`center`,of:`svg`,collision:`fit`}})}function ge(){$(`#chartsOverview`).dialog(`destroy`),o(`chartsOverview`).remove(),document.getElementById(`chartsOverviewStyle`)?.remove()}var q=`#ccc`,J=`no`,Y=800,_e=.2,ve=7,ye=10;function be(e){return i(e.map(e=>e.length))*ve}function xe(e,t){if(!e.length)return 0;let n=ye+be(e),r=Math.max(1,Math.floor(t/n));return Math.ceil(e.length/r)}function X(e){return t=>pack[e][+t]?.name||J}function Z(e){return()=>Object.fromEntries(pack[e].map(e=>[e.name||J,e.color||q]))}function Se(e){return pack.biomes[+e]?.name||J}function Ce(){return Object.fromEntries(pack.biomes.map(({name:e,color:t})=>[e,t]))}function we(e){let t=Markets.get(+e);return t?t.name||pack.burgs[t.centerBurgId]?.name||`Market ${t.i}`:J}function Te(){return Object.fromEntries((pack.markets||[]).map(e=>[we(e.i),e.color||q]))}function Ee(e){return Goods.get(+e)?.name||J}function De(){return Object.fromEntries((pack.goods||[]).map(e=>[e.name||J,e.color||q]))}function Oe(e,t){let n=Production.getCellProduction(e,t),r=pack.cells.burg[e];if(r){let e=Production.getBurgProduction(pack.burgs[r]);for(let[t,r]of Object.entries(e))n[+t]=(n[+t]||0)+r}return n}function ke(e){let t=pack.cells.burg[e];return t?(pack.burgs[t].population||0)*options.map.units.population.scale*options.map.units.population.urbanization.rate:0}function Q(e){return pack.cells.pop[e]*options.map.units.population.scale}function Ae(e,t){if(t===`natural`)return e;if(t===`name`)return e.sort((e,t)=>e.name===t.name?e.group.localeCompare(t.group):t.name.localeCompare(e.name));if(t===`value`){let t={},n={};for(let{name:r,group:i,value:a}of e)t[r]=(t[r]||0)+a,n[i]=(n[i]||0)+a;return e.sort((e,r)=>e.name===r.name?n[r.group]-n[e.group]:t[e.name]-t[r.name])}return e}var je={open:ce};export{je as ChartsOverview};