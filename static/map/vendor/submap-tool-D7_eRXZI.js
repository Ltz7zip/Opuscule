import{J as e,P as t,ar as n,q as r,rr as i}from"./utils-Dk4MDzbZ.js?v=2";import{C as a,S as o,T as s,n as c,s as l,t as u}from"./options-tab-BP8xLyAH.js?v=2";import{t as d}from"./layers-DCXJRYE9.js?v=2";import{i as f}from"./viewport-C0deAIKO.js?v=2";import{o as p}from"./options-schema-MDTOWXDp.js?v=2";import{a as m}from"./generation-pipeline-BJtGx-BM.js?v=2";import{i as h}from"./dialog-helpers-MF-Ear8n.js?v=2";import{s as g}from"./index-lTzorqRn.js?v=2";function _(){v(),y(),$(`#submapTool`).dialog({title:`Create a submap`,resizable:!1,width:`32em`,position:{my:`center`,at:`center`,of:`svg`},close:b,buttons:{Submap:function(){S(),$(this).dialog(`close`)},Cancel:function(){$(this).dialog(`close`)}}})}function v(){h(`submapTool`);let e=String(options.generation.graph.density),n=p[+e],r=`<div id="submapTool" class="dialog">
    <p style="font-weight: bold">
      This operation is destructive and irreversible. It will create a completely new map based on the current one.
      Don't forget to save the .map file to your machine first!
    </p>
    <div style="display: flex; flex-direction: column; gap: 0.5em">
      <div data-tip="Set points (cells) number of the submap" style="display: flex; gap: 1em">
        <div>Points number</div>
        <div>
          <input id="submapPointsInput" type="range" min="1" max="13" value="${e}" />
          <output id="submapPointsFormatted" style="color: ${u(n)}">${n/1e3}K</output>
        </div>
      </div>
      <div data-tip="Check to fit burg styles (icon and label size) to the submap scale">
        <input type="checkbox" class="checkbox" id="submapRescaleBurgStyles" checked />
        <label for="submapRescaleBurgStyles" class="checkbox-label">Rescale burg styles</label>
      </div>
    </div>
  </div>`;t(`dialogs`).insertAdjacentHTML(`beforeend`,r)}function y(){t(`submapPointsInput`).oninput=x}function b(){h(`submapTool`)}function x(e){let n=p[+e.target.value],r=t(`submapPointsFormatted`);r.value=`${n/1e3}K`,r.style.color=u(n)}function S(){INFO&&console.group(`generateSubmap`);let{scale:e,x:n,y:r}=f,[i,u]=[Math.abs(n/e),Math.abs(r/e)];C(i,u,e);let p=t(`submapPointsInput`).value;p!==String(options.generation.graph.density)&&c(+p),o(),a(),resetZoom(0),m(),g.process({projection:(t,n)=>[(t-i)*e,(n-u)*e],inverse:(t,n)=>[t/e+i,n/e+u],scale:e}),t(`submapRescaleBurgStyles`).checked&&w(e),d.drawAll(),l(),s(),INFO&&console.groupEnd()}function C(t,i,a){let{geography:o,graph:s,units:c}=options.map,{coordinates:l}=o;o.mapSize=n(o.mapSize/a,2);let u=l.latT/a;o.latitude=n((90-r(i,l,s.height))/(180-u)*100,2);let d=l.lonT/a;o.longitude=n((180-e(t+s.width/a,l,s.width))/(360-d)*100,2),c.distance.scale=n(c.distance.scale/a,2),c.population.scale=n(c.population.scale/a,2),Options.save()}function w(e){window.Burgs.ensureBurgGroupStyles();for(let r of t(`burgIcons`).querySelectorAll(`:scope > g`)){let t=styles.burgIcons.groups[r.id]?.groups.icons;t&&(t.options.size=n(i(t.options.size*e,.2,10),2)),r.remove()}let r=new Set(pack.burgs.filter(e=>e.i&&!e.removed).map(e=>e.label?.group||e.group||`burg`));for(let t of r){let r=styles.labels.groups[t];if(!r)continue;let i=Number.parseFloat(r.attrs[`font-size`])||0,a=Math.max(n((i+i/e)/2,2),1)*e;r.attrs[`font-size`]=`${n(a,2)}%`}}var T={open:_};export{T as SubmapTool};