const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["style-presets-YtU86apW.js","rolldown-runtime-QTnfLwEv.js","utils-Dk4MDzbZ.js","styles-BAziO62H.js","layers-DCXJRYE9.js","draw-landmass-B2Lw9Bcp.js","minIndex-4vd4__Hw.js","sin-DYm9hqTl.js","emblems-generator-CFXxHBH0.js","preload-helper-CtrmDIJD.js","tooltips-3xx1wzLl.js","platform-BuoS6NQK.js","emblems-uUqrpFK3.js","icons-list-BiXau1Li.js","natural-kerJ22Hb.js","state-B2hBYDzv.js","viewport-C0deAIKO.js","controllers-CTfyQhlk.js","hosted-BMyQ7M35.js","schemaUtils-B2thnuln.js","styles-legacy-aml3Mb2H.js","versioning-D9YLfEif.js","pins-L9rE4G31.js","options-schema-MDTOWXDp.js","cultures-generator-BZQiuzLd.js","population-generator-BKslz7iX.js","mean-4Awewi9R.js","median-0Tc6lw5O.js","sum-BpJJqxFM.js","validationUtils-cfDkYsje.js","style-preset-BZG7LbkG.js","dialog-helpers-MF-Ear8n.js","zoom-CiYn6oZo.js","icons-archive-CciXz59B.js","index-lTzorqRn.js","highlight-BA-X3wTZ.js","relief-generator-BI0DCFVU.js","extent-V-JVJWfI.js","options-tab-BP8xLyAH.js","notes-DG5Ag6TW.js","viewbox-events-BYU-vEWY.js","drag-Dc9_zdw7.js","layers-tab-iNymJj5i.js","layer-labels-C6lPCAWi.js","view-mode-BaECDGy8.js","generation-pipeline-BJtGx-BM.js","graph-override-C71UjRtI.js","names-generator-BDhdgsxI.js","view-3d-options-BhMg3vBH.js","features-generator-B11G9OYX.js","labels-generator-Dm649lCC.js","transports-generator-Dv1kk2bu.js","fonts-0hh8hzjh.js","town-plan-C20fDUBr.js","town-plans-CSwL3uPD.js","style-reference-CUz75NlW.js","schema-form-DDdjT_gZ.js","textures-YniTgxp3.js","emblem-image-D_ivI1wt.js","export-BlirpLlw.js"])))=>i.map(i=>d[i]);
import{$t as e,C as t,Jn as n,Kn as r,P as i,V as a,a as o,ar as s,c,g as l,h as u,i as d,l as f,n as p,o as m,p as h,qn as g,r as _,y as v}from"./utils-Dk4MDzbZ.js?v=2";import{b as ee,c as y,l as b,u as te,w as ne,x as re,y as ie}from"./options-tab-BP8xLyAH.js?v=2";import{Q as ae,t as oe}from"./layers-DCXJRYE9.js?v=2";import{i as se,t as ce}from"./emblems-generator-CFXxHBH0.js?v=2";import{t as x}from"./preload-helper-CtrmDIJD.js?v=2";import{i as le}from"./tooltips-3xx1wzLl.js?v=2";import{i as ue}from"./viewport-C0deAIKO.js?v=2";import{t as S}from"./controllers-CTfyQhlk.js?v=2";import{n as de}from"./layer-labels-C6lPCAWi.js?v=2";import{i as fe}from"./zoom-CiYn6oZo.js?v=2";import{t as pe}from"./validationUtils-cfDkYsje.js?v=2";import{r as me}from"./cultures-generator-BZQiuzLd.js?v=2";import{t as he}from"./features-generator-B11G9OYX.js?v=2";import{n as ge}from"./labels-generator-Dm649lCC.js?v=2";import{l as _e,t as ve}from"./styles-BAziO62H.js?v=2";import{c as ye}from"./dialog-helpers-MF-Ear8n.js?v=2";import{a as be,i as xe,n as Se,r as C,t as Ce}from"./notes-DG5Ag6TW.js?v=2";import{C as we,D as Te,F as Ee,I as De,L as Oe,M as ke,P as Ae,S as je,T as Me,c as Ne,f as Pe,k as Fe,m as Ie,w as Le,x as Re}from"./index-lTzorqRn.js?v=2";import{t as ze}from"./lore-EzhLGfXg.js?v=2";import{t as Be}from"./effects-D_7-dh8T.js?v=2";import{i as Ve,n as He,r as Ue,t as We}from"./reveal-BWZLaYgQ.js?v=2";var Ge=e(`4e79a7f28e2ce1575976b7b259a14fedc949af7aa1ff9da79c755fbab0ab`),w=class extends Error{code;retryAfter;constructor(e,t,n){super(t),this.name=`AzgaarServerError`,this.code=e,this.retryAfter=n}},Ke=()=>``,qe=()=>Ke().replace(/\/+$/,``)||`https://ask.azgaarsfmg.com`,Je=()=>!window.electron&&(location.origin===`https://azgaar.github.io`||!!Ke());async function Ye(e,t){let n=b(),r={...t.headers,...n?{Authorization:`Bearer ${n}`}:{}},i;try{i=await fetch(`${qe()}${e}`,{...t,headers:r})}catch(e){throw t.signal?.aborted?e:new w(`unreachable`,`The assistant is unreachable. Check your connection and try again.`)}if(i.ok){if(i.status===204)return;try{return await i.json()}catch{throw new w(`provider_error`,`The assistant returned an unreadable response.`)}}if(i.status===401)throw y(),new w(`unauthorized`,`Your sign-in has expired. Sign in with Discord again for more questions.`);let a=`provider_error`,o=`The assistant returned an error (${i.status}).`,s;try{let e=await i.json();e?.error&&(a=e.error.code??a,o=e.error.message??o,s=e.error.retryAfter)}catch{}throw new w(a,o,s)}var Xe=async(e,t,n)=>{let r=await Ye(`/v1/ask`,{method:`POST`,signal:n,headers:{"Content-Type":`application/json`},body:JSON.stringify(t?{question:e,conversationId:t}:{question:e})});if(!r)throw new w(`provider_error`,`The assistant returned an unreadable response.`);return r},Ze=(e,t)=>Ye(`/v1/feedback`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({requestId:e,rating:t})}),Qe=()=>Ye(`/v1/limits`,{method:`GET`}),$e=()=>te(`${qe()}/v1/auth/discord`);async function et(){try{await Ye(`/v1/auth/logout`,{method:`POST`})}catch{}y()}async function tt(e,t,n,r){n({kind:`question`,text:t});let i=e.serverChatId;try{let a=await Xe(t,i,r);if(r.aborted)return;e.serverChatId=a.conversationId,i&&i!==a.conversationId&&n({kind:`divider`}),n({kind:`answer`,text:a.answer,ratingId:a.requestId})}catch(t){if(r.aborted)return;throw t instanceof w&&t.code===`invalid_request`&&(e.serverChatId=void 0),t}}var nt=`fmg-assistant-chats`,rt=`fmg-assistant-current-chat`,it=60,T=[],at=``,ot=!1,st,ct=!1,lt=!1;function ut(){return st??=ldb.get(nt).then(e=>{T=Array.isArray(e)?e.filter(e=>e?.id&&Array.isArray(e.items)):[],at=localStorage.getItem(rt)||T[0]?.id||``,ot=!0},e=>{throw st=void 0,e}),st}var dt=()=>[...T].sort((e,t)=>t.updated-e.updated),ft=()=>T.find(e=>e.id===at);function pt(e){let t=T.find(t=>t.id===e);return t?(at=e,localStorage.setItem(rt,e),_t(t),t):ft()}function mt(e,t,n){let r={id:globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`,title:`New chat`,updated:Date.now(),tier:e,mapId:t,mapName:n,items:[],messages:[],usage:{input:0,output:0,cached:0}};return T.push(r),pt(r.id),r}function ht(e){T=T.filter(t=>t.id!==e),at===e&&(at=``,localStorage.removeItem(rt)),bt()}function gt(e,t){if(t.kind===`question`&&!e.items.some(e=>e.kind===`question`)){let n=t.text||`Image`;e.title=n.length>it?`${n.slice(0,it).trimEnd()}…`:n}e.items.push(t),_t(e)}function _t(e){e.updated=Date.now(),bt()}function vt(e,t,n){return!!t&&e.tier===`key`==(t===`key`)&&e.mapId===n}var yt=e=>e.tier===`key`&&JSON.stringify(e.messages,(e,t)=>e===`data`&&typeof t==`string`?``:t).length>1e5;function bt(){!ot||typeof ldb>`u`||(lt=!0,!ct&&(ct=!0,(async()=>{try{for(;lt;)lt=!1,await ldb.set(nt,T)}catch(e){ERROR&&console.error(`Assistant chats could not be saved`,e)}finally{ct=!1}})()))}function xt(e,t){let n=[{role:`system`,content:e.map(e=>e.text).join(`

`)}];for(let e of t){if(e.role===`assistant`){let t=e.content.filter(e=>e.type===`text`).map(e=>e.text).join(`

`),r=e.content.filter(e=>e.type===`tool_use`).map(e=>({id:e.id,type:`function`,function:{name:e.name,arguments:JSON.stringify(e.input)}}));if(!t&&!r.length)continue;let i={role:`assistant`,content:t||null};r.length&&(i.tool_calls=r),n.push(i);continue}let t=[];for(let r of e.content)if(r.type===`text`)n.push({role:`user`,content:r.text});else if(r.type===`image`)n.push({role:`user`,content:[St(r)]});else if(r.type===`tool_result`){let e=typeof r.content==`string`?[{type:`text`,text:r.content}]:r.content,i=e.flatMap(e=>e.type===`text`?[e.text]:[]).join(`
`);n.push({role:`tool`,tool_call_id:r.tool_use_id,content:i||`The image follows.`});for(let n of e)n.type===`image`&&t.push(St(n))}t.length&&n.push({role:`user`,content:[{type:`text`,text:`Images from the tools above:`},...t]})}return n}var St=({source:e})=>({type:`image_url`,image_url:{url:`data:${e.media_type};base64,${e.data}`}});function Ct(e){return e.map(e=>({type:`function`,function:{name:e.name,description:e.description,parameters:e.input_schema}}))}function wt(e){let t=e.choices?.[0]?.message??{},n=[];t.content&&n.push({type:`text`,text:t.content});for(let e of t.tool_calls??[])n.push({type:`tool_use`,id:e.id,name:e.function.name,input:Tt(e.function.arguments)});let r=e.usage?.prompt_tokens_details?.cached_tokens??e.usage?.prompt_cache_hit_tokens??0;return{content:n,truncated:e.choices?.[0]?.finish_reason===`length`,usage:{input:(e.usage?.prompt_tokens??0)-r,output:e.usage?.completion_tokens??0,cached:r}}}function Tt(e){try{let t=JSON.parse(e||`{}`);return typeof t!=`object`||!t||Array.isArray(t)?{[Ot]:`The arguments must be a JSON object. Send the call again with named parameters`}:t}catch(e){return{[Ot]:`The arguments are not valid JSON (${g(e)}); a long call may have hit the output limit. Send it again, shorter if it was long`}}}var Et=e=>e.includes(`deepseek.com`)?8192:4096;async function Dt(e,{key:t,model:n,system:r,messages:i,tools:a,signal:o}){let s=e===`https://api.openai.com/v1`,c=await fetch(`${e}/chat/completions`,{method:`POST`,signal:o,headers:{"Content-Type":`application/json`,...Pt(t)},body:JSON.stringify({model:n,messages:xt(r,i),tools:Ct(a),...s?{max_completion_tokens:4096}:{max_tokens:Et(e)},...s&&/^gpt-6-(sol|luna)$/.test(n)?{reasoning_effort:`none`}:{}})});if(!c.ok)throw Error(await Bt(c));return wt(await c.json())}var Ot=`invalidArguments`;function kt(e){let t=e.indexOf(`,`);return{type:`image`,source:{type:`base64`,media_type:e.startsWith(`data:image/jpeg`)?`image/jpeg`:`image/png`,data:e.slice(t+1)}}}var At=[{id:`anthropic`,label:`Anthropic`,fallbackModel:`claude-sonnet-5-5`,keyLink:`https://console.anthropic.com/account/keys`},{id:`openai`,label:`OpenAI`,fallbackModel:`gpt-6-luna`,keyLink:`https://platform.openai.com/account/api-keys`,baseUrl:`https://api.openai.com/v1`},{id:`deepseek`,label:`DeepSeek`,fallbackModel:`deepseek-flash`,keyLink:`https://platform.deepseek.com/api_keys`,baseUrl:`https://api.deepseek.com/v1`},{id:`mistral`,label:`Mistral`,fallbackModel:`mistral-small-latest`,keyLink:`https://console.mistral.ai/api-keys`,baseUrl:`https://api.mistral.ai/v1`},{id:`qwen`,label:`Qwen`,fallbackModel:`qwen3.8-flash`,keyLink:`https://modelstudio.console.alibabacloud.com/?tab=playground#/api-key`,baseUrl:`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`},{id:`local`,label:`Local`,fallbackModel:``,keyLink:`https://ollama.com`,baseUrl:`http://localhost:11434/v1`}],E=e=>At.find(t=>t.id===e),jt=E(`openai`),Mt=e=>`fmg-ai-kl-${e}`,Nt=(e,t=``)=>(e===`local`&&t||E(e)?.baseUrl||``).replace(/\/+$/,``),Pt=e=>e?{Authorization:`Bearer ${e}`}:{},Ft=e=>({"x-api-key":e,"anthropic-version":`2023-06-01`,"anthropic-dangerous-direct-browser-access":`true`}),It=3;async function Lt(e){e={...e,messages:e.messages.filter(e=>e.content.length)};let t=E(e.provider);if(!t)throw Error(`Unknown provider: ${e.provider}`);if(!e.model)throw Error(`Enter a model name (e.g. llama3.2)`);let n=t.id===`local`?void 0:AbortSignal.timeout(It*6e4),r=[e.signal,n].filter(e=>e!==void 0),i={...e,signal:r.length?AbortSignal.any(r):void 0};try{return t.id===`anthropic`?await Rt(i):await Dt(Nt(t.id,e.localUrl),i)}catch(r){throw!n?.aborted||e.signal?.aborted?r:Error(`${t.label} did not answer in ${It} minutes. Ask again, or pick another model`)}}async function Rt({key:e,model:t,system:n,messages:r,tools:i,signal:a}){let o=await fetch(`https://api.anthropic.com/v1/messages`,{method:`POST`,signal:a,headers:{"Content-Type":`application/json`,...Ft(e)},body:JSON.stringify({model:t,system:n,messages:zt(r),tools:i,max_tokens:4096})});if(!o.ok)throw Error(await Bt(o));let s=await o.json();return{content:s.content??[],truncated:s.stop_reason===`max_tokens`,usage:{input:(s.usage?.input_tokens??0)+(s.usage?.cache_creation_input_tokens??0),output:s.usage?.output_tokens??0,cached:s.usage?.cache_read_input_tokens??0}}}function zt(e){let t=e.at(-1);if(!t?.content.length)return e;let n=[...t.content],r={...n.at(-1),cache_control:{type:`ephemeral`}};return n[n.length-1]=r,[...e.slice(0,-1),{...t,content:n}]}async function Bt(e){try{let t=await e.json(),n=t.error?.message||t.error||t.message||t.output?.message;if(typeof n==`string`&&n)return n}catch{}return`${e.status} ${e.statusText}`}var Vt=`fmg-ai-chat-provider`,Ht=`fmg-ai-local-url`,Ut=`fmg-assistant-connected`,Wt=e=>`fmg-ai-model-${e}`;function D(e){let t=E(e??localStorage.getItem(Vt))??jt,n=t.id===`local`;return{provider:t.id,model:localStorage.getItem(Wt(t.id))||t.fallbackModel,key:n?``:localStorage.getItem(Mt(t.id))||``,localUrl:localStorage.getItem(Ht)||E(`local`).baseUrl}}function Gt({provider:e,model:t,key:n,localUrl:r}){localStorage.setItem(Vt,e),localStorage.setItem(Wt(e),t),e!==`local`&&localStorage.setItem(Mt(e),n),localStorage.setItem(Ht,r),localStorage.setItem(Ut,`1`)}function Kt(){localStorage.removeItem(Mt(D().provider)),localStorage.setItem(Ut,`0`)}function qt(){if(localStorage.getItem(Ut)===`0`)return!1;let e=D();return!!(e.provider===`local`?e.model:e.key)}var Jt=`StylePresets.apply`,Yt=new class{loaded=new Map;ensureGroupStyles;async preload(e){let t=new Set,n=e=>{if(Array.isArray(e))e.forEach(n);else if(e&&typeof e==`object`){let{op:r,args:i}=e;r===Jt&&Array.isArray(i)&&typeof i[0]==`string`?t.add(i[0]):Object.values(e).forEach(n)}};if(n(e),!t.size)return;let[{StylePresetsService:r},{ensureGroupStyles:i}]=await Promise.all([x(()=>import(`./style-presets-YtU86apW.js`).then(e=>e.a),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29])),x(()=>import(`./style-preset-BZG7LbkG.js`),__vite__mapDeps([30,2,4,1,5,6,7,8,9,10,11,12,13,14,15,16,17,18,31,32,3,19,33,23,24,25,26,27,28,29,0,20,21,22]))]);this.ensureGroupStyles=i;for(let e of t){let t=!r.isSystem(e);if(t&&this.loaded.delete(e),this.loaded.has(e)||t&&!r.listCustom().includes(e))continue;let{styles:n,error:i}=await r.load(e),a=!i&&r.parse(n);a&&this.loaded.set(e,a)}}apply(e){let t=this.loaded.get(e);if(!t)throw Error(`No style preset "${e}"; read_docs(["Styles"]) lists them`);let n=styles.relief.options.density;Object.assign(styles,structuredClone(t)),styles.relief.options.density=n,this.ensureGroupStyles?.()}},Xt={AddedLabels:we,Biomes:Ae,Burgs:re,Cultures:me,Emblems:ce,Features:he,Goods:Re,Journeys:Ne,Labels:ge,Lore:ze,Markers:Ie,Markets:Pe,Military:ee,Notes:Ce,Provinces:je,Religions:Le,Rivers:Ee,Routes:ke,States:Te,Styles:ve,StylePresets:Yt,Zones:Me},Zt={Burgs:[`rename`,`setPopulation`,`setGroup`,`setType`,`setBuilding`,`setCulture`,`setPort`,`setCapital`,`move`,`add`,`remove`,`setTreasury`,`setLocked`,`setLink`],States:[`rename`,`recolor`,`setFullName`,`setForm`,`setCulture`,`setType`,`setExpansionism`,`setRelation`,`recalculate`,`merge`,`add`,`remove`,`setTaxes`,`setTreasury`,`setLocked`,`setChronicleEntry`,`setCells`,`setPopulation`],Provinces:[`rename`,`recolor`,`setFullName`,`setForm`,`setCapital`,`setState`,`add`,`declareIndependence`,`remove`,`merge`,`setPopulation`,`setLocked`,`setCells`],Cultures:[`rename`,`recolor`,`setType`,`setBase`,`setExpansionism`,`recalculate`,`add`,`remove`,`setEmblemShape`,`setLocked`,`setOrigins`,`setCode`,`moveCenter`,`setCells`,`setPopulation`],Religions:[`rename`,`recolor`,`setDeity`,`setType`,`setForm`,`setExpansion`,`setExpansionism`,`recalculate`,`add`,`remove`,`setLocked`,`setOrigins`,`setCode`,`moveCenter`,`setCells`,`setPopulation`],Biomes:[`rename`,`recolor`,`setHabitability`,`add`,`remove`,`setCells`,`restore`],Rivers:[`rename`,`setType`,`add`,`remove`,`setParent`,`setWidth`,`create`],Routes:[`rename`,`setGroup`,`add`,`remove`,`setLocked`,`create`,`split`,`join`],Features:[`rename`,`setSubtype`,`setGroup`,`setCoastline`],Zones:[`rename`,`recolor`,`setType`,`setHidden`,`setCells`,`add`,`remove`,`setPopulation`],Markers:[`rename`,`setIcon`,`setType`,`setHidden`,`place`,`remove`,`move`,`setPinned`,`setLocked`,`setAppearance`],AddedLabels:[`rename`,`place`,`remove`],Labels:[`setGroup`,`setLayout`,`reset`],Military:[`rename`,`remove`,`add`,`setAlert`,`setUnits`,`setNaval`,`setIcon`,`move`,`rotate`,`setBase`,`split`,`attach`],Emblems:[`set`,`regenerateOne`,`place`],Journeys:[`add`,`remove`,`rename`,`setType`,`recolor`,`setHidden`,`setLocked`,`addSegment`,`removeSegment`,`moveSegment`,`setSegment`,`resetSegment`],Goods:[`rename`,`setIcon`,`recolor`,`setPrice`,`setUnit`,`setTags`,`setProduction`],Markets:[`rename`,`recolor`],Lore:[`rename`,`setYear`,`setEra`,`setDescription`],Notes:[`write`],Styles:[`setValue`],StylePresets:[`apply`]},Qt=new Set(Object.entries(Zt).flatMap(([e,t])=>t.map(t=>`${e}.${t}`)));function $t(e,t){let[n,r]=e.split(`.`);return Xt[n][r](...t)}var en=`var grid: GridGraph;
  var pack: PackedGraph;
  var customization: number;
  interface Window {
    applyLayersPreset: typeof applyLayersPreset;
    applyURLLayers: typeof applyURLLayers;
  }
  var Layers: LayersRegistry<LayerId>;
  var mapHistory: MapHistoryEntry[];
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var regeneratePrompt: (config?: GenerationConfig) => void;
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var regenerateMap: (config?: GenerationConfig | string) => void;
  var Options: OptionsModel;
  /** what this browser wants, read bare across the app and replaced wholesale on restore */
  var options: OptionsData;
  interface Window {
    connectToDropbox: typeof connectToDropbox;
    copyLinkToClipboard: typeof copyLinkToClipboard;
    loadURL: typeof loadURL;
    openExportToPngTiles: typeof openExportToPngTiles;
    exportToJson: typeof import("@/services/io/export-json").ExportJson.exportToJson;
  }
  // biome-ignore lint/suspicious/noRedeclare: legacy seam
  var toggleOptions: (event?: Event) => void;
  interface Window {
    showOptions: typeof showOptions;
    hideOptions: typeof hideOptions;
  }
  interface Window {
    showSupporters: typeof showSupporters;
  }
  // biome-ignore lint/suspicious/noRedeclare: legacy seam
  var changeCellsDensity: (density: number) => void;
  var initGoogleTranslate: () => void;
  var google: {
    translate: {
      TranslateElement: {
        new (config: { pageLanguage: string; layout: unknown }, elementId: string): unknown;
        InlineLayout: { VERTICAL: unknown };
      };
    };
  };
  interface Window {
    restoreSeed: typeof restoreSeed;
    generateMapWithSeed: typeof generateMapWithSeed;
    showSeedHistoryDialog: typeof showSeedHistoryDialog;
  }
  // biome-ignore lint/suspicious/noRedeclare: the bridges registered just below
  var zoomTo: ZoomTo;
  // biome-ignore lint/suspicious/noRedeclare: the bridges registered just below
  var resetZoom: ResetZoom;
  // biome-ignore lint/suspicious/noRedeclare: the bridges registered just below
  var invokeActiveZooming: InvokeActiveZooming;
  var edits: Uint8Array[] & { n: number };
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var Controllers: ControllersRegistry;
  interface Window {
    updateMinimap: () => void;
  }
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var heightmapTemplates: Record<string, HeightmapTemplate>;
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var precreatedHeightmaps: Record<string, PrecreatedHeightmap>;
  var Supporters: typeof supporters;
  var AddedLabels: AddedLabelsModule;
  var Biomes: BiomesGenerator;
  var Burgs: BurgModule;
  // vendored lib, loaded as a classic script from public/libs/simplify.js
  var simplify: (points: Point[], tolerance: number, highestQuality?: boolean) => Point[];
  var Coordinates: CoordinatesModule;
  var Cultures: CulturesGenerator;
  interface Window {
    Emblems: EmblemsGenerator;
  }
  var Features: FeatureModule;
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var GenerationPipeline: import("@/generators/pipeline").Pipeline<GenerationPipelineStepId, GenerationContext>;
  var Goods: GoodsModule;
  var Grid: GridModule;
  var HeightmapGenerator: HeightmapModule;
  var Ice: IceModule;
  var Journeys: JourneysModule;
  var Labels: LabelsModule;
  var Lakes: LakesModule;
  var Markers: MarkersModule;
  var Markets: MarketsModule;
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var Measurers: MeasurersModule;
  var Military: MilitaryModule;
  var Names: NamesGenerator;
  var Pack: PackModule;
  var Precipitation: PrecipitationModule;
  var Production: ProductionModule;
  var Provinces: ProvinceModule;
  var Relief: ReliefModel;
  var Religions: ReligionsModule;
  var Rivers: RiverModule;
  var Routes: RoutesModule;
  var States: StatesModule;
  /** the live style record, read bare across every layer and replaced wholesale on load */
  var styles: StylesData;
  var Temperature: TemperatureModule;
  var Transports: TransportsModule;
  var Zones: ZonesModule;
  interface Window {
    EmblemRenderer: EmblemRendererModule;
  }
  var TradeAnimation: TradeAnimationModule;
  interface Window {
    initiateAutosave: typeof initiateAutosave;
    toggleSaveReminder: typeof toggleSaveReminder;
  }
  var fonts: FontDefinition[];
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var Services: ServicesRegistry;
  interface Window {
    JSZip: any; // registered on demand by libs/jszip.min.js (see exportToPngTiles)
  }
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: { description?: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle>;
  }
  var TIME: boolean;
  var INFO: boolean;
  var WARN: boolean;
  var ERROR: boolean;
  var DEBUG: { stateLabels?: boolean; [key: string]: boolean | undefined };
  interface Window {
    electron?: ElectronBridge;
  }
  interface Navigator {
    userAgentData?: { mobile?: boolean };
    standalone?: boolean;
  }
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var focusOn: () => void;
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var generateMapOnLoad: () => void;
  interface Window {
    copyMapURL: typeof copyMapURL;
  }
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var VERSION: string;
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var cleanupData: () => Promise<void>;
  interface Window {
    tip: typeof import("../components/tooltips").tip;
    clearMainTip: typeof import("../components/tooltips").clearMainTip;
    showElementLockTip: typeof import("../components/tooltips").showElementLockTip;
    fitLegendBox: typeof import("../renderers/draw-legend").fitLegendBox;
    applyOption: typeof import("../utils").applyOption;
    closeDialogs: typeof import("../components/dialog/dialog-helpers").closeDialogs;
    confirmationDialog: typeof import("../components/dialog/dialog-helpers").confirmationDialog;
    downloadFile: typeof import("../utils").downloadFile;
    uploadFile: typeof import("../utils").uploadFile;
    setMapZoom: typeof import("../components/zoom").setMapZoom;
    setZoomExtent: typeof import("../components/zoom").setZoomExtent;
    setTranslateExtent: typeof import("../components/zoom").setTranslateExtent;
    getLabelsData: typeof import("../renderers/labels/label-data").getLabelsData;
  }

  // Elements the browser exposes as globals by their id. New code should use \`ensureEl\` instead
  var alertMessage: HTMLElement;

  // Vendored libraries, each loaded by its own <script> tag in index.html
  var $: (selector: any) => any; // jQuery + jQuery UI
  var aleaPRNG: (seed: string | number) => () => number;
  var FlatQueue: any;
  var RgbQuant: any; // image quantization, used by the heightmap image converter
  var THREE: any; // lazy-loaded by the 3d view
  var Dropbox: any; // dropbox-sdk, loaded on demand from libs/dropbox-sdk.min.js
  var ldb: {
    get: <T = Blob>(key: string) => Promise<T | null | undefined>; // any value IndexedDB can clone
    set: (key: string, value: unknown) => Promise<void>;
  };
  interface Window {
    last: typeof last;
    unique: typeof unique;
    TYPED_ARRAY_MAX: typeof TYPED_ARRAY_MAX;
  }
  interface Window {
    toHEX: typeof toHEX;
  }
  interface Window {
    ERROR: boolean;

    debounce: typeof debounce;
    parseError: typeof parseError;
    openURL: typeof openURL;
    wiki: typeof wiki;
    link: typeof link;
    isCtrlClick: typeof isCtrlClick;
  }
  interface Window {
    drawCellsValue: typeof drawCellsValue;
    drawPolygons: typeof drawPolygons;
    drawRouteConnections: typeof drawRouteConnections;
    drawPoint: typeof drawPoint;
    drawPath: typeof drawPath;
  }
  interface Window {
    dist2: typeof distanceSquared;
  }
  interface JSON {
    isValid: (str: string) => boolean;
    safeParse: (str: string) => any;
  }
  interface Window {
    nth: typeof nth;
    list: typeof list;
  }
  interface Window {
    getNextId: typeof getNextId;
    ensureEl: typeof ensureEl;
    findEl: typeof findEl;
  }
  interface Window {
    rn: typeof rn;
    minmax: typeof minmax;
    normalize: typeof normalize;
  }
  interface Window {
    getIsolines: typeof getIsolines;
    getVertexPath: typeof getVertexPath;
  }
  interface String {
    replaceAll(
      searchValue: string | RegExp,
      replaceValue: string | ((substring: string, ...args: any[]) => string)
    ): string;
  }

  // Array.flat and Array.at are polyfilled above for old browsers, but not declared here:
  // lib ES2023 already types them, and a \`flat(): T[]\` declaration would shadow it and mistype nested arrays

  interface ReadableStream<R> {
    [Symbol.asyncIterator](): AsyncIterableIterator<R>;
  }
  interface Window {
    rand: typeof rand;
    P: typeof P;
    each: typeof each;
    gauss: typeof gauss;
    rw: typeof rw;
    generateSeed: typeof generateSeed;
  }
  interface Window {
    round: typeof round;
    capitalize: typeof capitalize;
    parseTransform: typeof parseTransform;
    setInlineStyleProperty: typeof setInlineStyleProperty;
  }`,tn=`AddedLabels, Biomes, Burgs, Coordinates, Cultures, Features, GenerationPipeline, Goods, Grid, HeightmapGenerator, Ice, Labels, Lakes, Markers, Markets, Measurers, Military, Names, Pack, Precipitation, Production, Provinces, Relief, Religions, Rivers, Routes, States, Temperature, Transports, Zones`,nn=`Controllers.AiGenerator
Controllers.BattleScreen
Controllers.BiomesEditor
Controllers.BurgCreator
Controllers.BurgEditor
Controllers.BurgGroupEditor
Controllers.BurgsOverview
Controllers.CellInfo
Controllers.ChartsOverview
Controllers.CoastlineEditor
Controllers.ColorPicker
Controllers.ComparePrices
Controllers.CulturesEditor
Controllers.DiplomacyEditor
Controllers.DiplomacyOverview
Controllers.DistributionEditor
Controllers.ElevationProfile
Controllers.EmblemsEditor
Controllers.GoodEditor
Controllers.GoodsEditor
Controllers.FeaturesOverview
Controllers.HeightmapEditor
Controllers.HeightmapSelection
Controllers.Assistant
Controllers.IconPicker
Controllers.HierarchyTree
Controllers.IceEditor
Controllers.JourneyEditor
Controllers.JourneysOverview
Controllers.LabelsEditor
Controllers.LabelGroupsConfigurator
Controllers.LabelCreator
Controllers.LabelsOverview
Controllers.LakesEditor
Controllers.LoreEditor
Controllers.MarkersEditor
Controllers.MarkersSettings
Controllers.MarkerCreator
Controllers.MarkersInRadius
Controllers.MarkersOverview
Controllers.MarketDealsOverview
Controllers.MarketOverview
Controllers.MarketsOverview
Controllers.MeasurersEditor
Controllers.MilitaryOverview
Controllers.Minimap
Controllers.NamesbaseEditor
Controllers.NotesEditor
Controllers.Omnibar
Controllers.PaintEditor
Controllers.ProductionChains
Controllers.ProductionOverview
Controllers.ProvincesEditor
Controllers.RegimentEditor
Controllers.RegimentsOverview
Controllers.ReliefEditor
Controllers.ReliefRulesEditor
Controllers.ReligionsEditor
Controllers.RiverCreator
Controllers.RiverAutoCreator
Controllers.RiverEditor
Controllers.RiversOverview
Controllers.RouteCreator
Controllers.RouteEditor
Controllers.RouteGroupsEditor
Controllers.RoutesOverview
Controllers.StatesEditor
Controllers.StyleEditor
Controllers.StylePresetsEditor
Controllers.SubmapTool
Controllers.TemperatureGraph
Controllers.TradeAnimationEditor
Controllers.TradeDetails
Controllers.WrapTool
Controllers.TransformTool
Controllers.TransportEditor
Controllers.UnitsEditor
Controllers.View3d
Controllers.WorldConfigurator
Controllers.ZonesEditor
Services.AppOffer
Services.Cloud
Services.ExportJson
Services.ExportMap
Services.Load
Services.Save
Services.UiTour`,rn=`Voronoi data (grid): grid.{cellsDesired, spacing, cellsY, cellsX, points, boundary, cells, vertices}; grid.cells.{i, c, v, b}; grid.vertices.{p, c, v}
Voronoi data (pack): pack.{cells, vertices}; pack.cells.{i, p, c, v, b, g}; pack.vertices.{p, c, v}
Features data (grid): grid.{features}; i, land, border, type
Features data (pack): pack.{features}; i, land, border, type, subtype, group, cells, area, firstCell, vertices, name, note, coastline
Specific cells data (grid): grid.cells.{h, f, t, temp, prec}
Specific cells data (pack): pack.cells.{h, f, t, s, biome, burg, culture, state, province, religion, good, market, area, pop, r, fl, conf, harbor, haven, routes}
Cultures: i, base, name, origins, shield, center, code, color, expansionism, type, area, cells, rural, urban, lock, removed, note
Burgs: i, name, cell, x, y, culture, state, feature, population, type, group, label, coa, MFCG, link, capital, port, market, production, product, treasury, citadel, plaza, shanty, temple, walls, lock, removed, note
States: i, name, form, formName, fullName, color, center, pole, culture, type, expansionism, area, burgs, cells, rural, urban, neighbors, provinces, diplomacy, campaigns, alert, military, label, coa, salesTax, pollTax, treasury, lock, removed, note
States (regiment): i, x, y, bx, by, angle, icon, cell, state, name, n, u, note
Provinces: i, name, formName, fullName, color, center, pole, area, burg, burgs, cells, rural, urban, coa, label, lock, removed, note
Religions: i, name, type, form, deity, color, code, origins, center, culture, expansionism, expansion, area, cells, rural, urban, lock, removed, note
Rivers: i, name, type, source, mouth, parent, basin, cells, points, discharge, length, width, sourceWidth, note
Markers: i, name, icon, x, y, cell, type, size, fill, stroke, pin, pinned, dx, dy, px, lock, note
Labels: text, group, dx, dy, pathPoints, startOffset, fontSize, letterSpacing, i, label, note, groups, name, type, active, layerDependency, mode
Routes: i, points, feature, group, length, name, lock, note
Zones: i, name, type, color, cells, lock, hidden, note
Ice: i, type, offset, points
Measurers: type, points
Goods: i, name, tags, value, unit, icon, color, chance, distribution, biomeOutput, recipes, multipliers, demandCoverage, note
Markets: i, centerBurgId, color, goods, name, note
Biomes: i, name, color, cost, habitability, icons, iconsDensity, removed, note
Deals: i, seller, sellerType, buyer, buyerType, good, units, price, tax
Journeys: i, name, type, color, segments, visible, lock, note, transport, speed, distance, points, avoidRoads, duration, custom
Transports: i, name, speed, domain, hoursPerDay
Name bases: i, name, b, min, max, d, m`,an=`Burgs.rename(burgId: number, name: string) // Rename a burg; its label text follows the name
Burgs.setPopulation(burgId: number, people: number) // Set a burg's population as shown in the Burg Editor, in people
Burgs.setGroup(burgId: number, group: string) // Move a burg to an existing burg group
Burgs.setType(burgId: number, type: string) // Set a burg's culture type, which is about geography, not rank
Burgs.setBuilding(burgId: number, building: string, present: boolean) // Turn one of a burg's buildings on or off: citadel, plaza, shanty, temple or walls
Burgs.setCulture(burgId: number, cultureId: number) // Set the culture of a burg's people
Burgs.setPort(burgId: number, port: boolean) // Make a burg a port on the water body it faces or drains to, or stop it being one
Burgs.setCapital(burgId: number) // Make a burg the capital of the state it is in; the old capital becomes an ordinary burg
Burgs.move(burgId: number, x: number, y: number) // Move a burg to a free land cell at a map point; a capital stays inside its state or province. A port trades by the water at its new place, if any
Burgs.add(x: number, y: number) // Found a burg on a free land cell at a map point; returns its id
Burgs.remove(burgId: number) // Remove a burg that is neither a capital nor a market center
Burgs.setTreasury(burgId: number, amount: number) // Set a burg's treasury, in the map's currency
Burgs.setLocked(burgId: number, locked: boolean) // Lock a burg so regeneration keeps it, or unlock it
Burgs.setLink(burgId: number, url: string) // Set the URL of a burg's map preview: a generator link or an image. Empty restores the default preview
States.rename(stateId: number, name: string) // Rename a state; a custom full name or label keeps its pattern when the old name stands in it as a whole word
States.recolor(stateId: number, color: string) // Set a state's color
States.setFullName(stateId: number, fullName: string) // Set a state's full name, such as "Grand Duchy of Orwin"
States.setForm(stateId: number, formName: string, form?: string) // Set a state's form name, such as Kingdom or Free City; empty clears it. Its government (Monarchy, Republic, Union, Theocracy or Anarchy) follows a listed name, or \`form\` for a custom one. The full name is rebuilt
States.setCulture(stateId: number, cultureId: number) // Set a state's dominant culture
States.setType(stateId: number, type: string) // Set a state's type, which steers its expansion: Generic, Hunting, Highland, River, Lake, Naval or Nomadic
States.setExpansionism(stateId: number, expansionism: number) // Set how strongly a state expands when states are recalculated, from 0 to 99
States.setRelation(stateId: number, otherId: number, relation: string) // Set a state's relation towards another; the other takes the inverse and the chronicle records the change
States.recalculate() // Redraw state borders from their capitals, types and expansionism; provinces are regenerated
States.merge(rulingStateId: number, stateIds: number[], asProvinces = false) // Merge states into a ruling one, which takes their lands, burgs, provinces and regiments. With \`asProvinces\`, each merged state becomes one province of the ruling state instead of keeping its own provinces
States.add(x: number, y: number) // Found a state at a map point with the burg there, or a new one, as its capital. It owns only that cell. Returns its id
States.remove(stateId: number) // Remove a state with its provinces; its lands and burgs become neutral
States.setTaxes(stateId: number, salesTax: number, pollTax: number) // Set a state's sales tax (0 to 1, on deals it sells) and poll tax (per person); they take effect when production is regenerated
States.setTreasury(stateId: number, amount: number) // Set a state's treasury, in the map's currency
States.setLocked(stateId: number, locked: boolean) // Lock a state so regeneration keeps it, or unlock it
States.setChronicleEntry(index: number, lines: string[]) // Replace a chronicle entry with text lines, the first being its title. Index -1 adds an entry after any the batch records before it (setRelation does); no lines removes it
States.setCells(stateId: number, cellIds: number[]) // Give land cells to a state, or to neutral lands with id 0, with their burgs. Provinces follow: a province wholly taken changes owner, a split one is divided
States.setPopulation(stateId: number, rural: number, urban: number) // Set a state's rural and urban population, in people: its cells and burgs scale to the totals
Provinces.rename(provinceId: number, name: string) // Rename a province; a custom full name or label keeps its pattern when the old name stands in it as a whole word
Provinces.recolor(provinceId: number, color: string) // Set a province's color
Provinces.setFullName(provinceId: number, fullName: string) // Set a province's full name, such as "County of Vel"
Provinces.setForm(provinceId: number, formName: string) // Set a province's form, such as County or Duchy; empty clears it. The full name is rebuilt from it
Provinces.setCapital(provinceId: number, burgId: number) // Make a burg inside a province its capital
Provinces.setState(provinceId: number, stateId: number) // Give a province, with its lands and burgs, to another state
Provinces.add(x: number, y: number) // Found a province at a map point inside a state, with the cell and its neighbors in that state. Returns its id
Provinces.declareIndependence(provinceId: number) // Turn a province with a burg into a new state that takes its lands and burgs. Returns the state id
Provinces.remove(provinceId: number) // Remove a province; its lands stay with the state
Provinces.merge(primaryId: number, provinceIds: number[]) // Merge provinces of one state into a primary one, which takes their lands and burgs
Provinces.setPopulation(provinceId: number, rural: number, urban: number) // Set a province's rural and urban population, in people: its cells and burgs scale to the totals
Provinces.setLocked(provinceId: number, locked: boolean) // Lock a province so regeneration keeps it, or unlock it
Provinces.setCells(provinceId: number, cellIds: number[]) // Give land cells of the province's state to a province; another province's center cannot move
Cultures.rename(cultureId: number, name: string) // Rename a culture; its code is recomputed
Cultures.recolor(cultureId: number, color: string) // Set a culture's color
Cultures.setType(cultureId: number, type: string) // Set a culture's type: Generic, Hunting, Highland, River, Lake, Naval or Nomadic
Cultures.setBase(cultureId: number, baseId: number) // Set the name base a culture takes its names from, by index in Names.nameBases
Cultures.setExpansionism(cultureId: number, expansionism: number) // Set how strongly a culture expands when cultures are recalculated, from 0 to 99
Cultures.recalculate() // Redraw culture borders from their centers, types and expansionism; burgs take their cell's culture
Cultures.add(x: number, y: number) // Found a culture centered at a map point; it takes land when cultures are recalculated. Returns its id
Cultures.remove(cultureId: number) // Remove a culture; its lands, burgs, states and religions fall to the wildlands
Cultures.setEmblemShape(cultureId: number, shape: string) // Set a culture's emblem shape; emblems of its states, provinces and burgs take it, except icon emblems
Cultures.setLocked(cultureId: number, locked: boolean) // Lock a culture so regeneration keeps it, or unlock it
Cultures.setOrigins(cultureId: number, originIds: number[]) // Set a culture's origins, as the Hierarchy tree does: the first is primary (0 = top level), the rest secondary
Cultures.setCode(cultureId: number, code: string) // Set a culture's short code, 1 to 3 characters
Cultures.moveCenter(cultureId: number, x: number, y: number) // Move a culture's center to a land cell at a map point; it takes effect when cultures are recalculated
Cultures.setCells(cultureId: number, cellIds: number[]) // Give land cells to a culture, or to the wildlands with id 0; burgs there take it too
Cultures.setPopulation(cultureId: number, rural: number, urban: number) // Set a culture's rural and urban population, in people: its cells and burgs scale to the totals
Religions.rename(religionId: number, name: string) // Rename a religion; its code is recomputed
Religions.recolor(religionId: number, color: string) // Set a religion's color
Religions.setDeity(religionId: number, deity: string) // Set the deity a religion worships; empty clears it
Religions.setType(religionId: number, type: string) // Set a religion's type: Folk, Organized, Cult or Heresy
Religions.setForm(religionId: number, form: string) // Set a religion's form, a free label such as Polytheism or Dualism
Religions.setExpansion(religionId: number, expansion: string) // Set how far a religion may expand: global, state or culture
Religions.setExpansionism(religionId: number, expansionism: number) // Set how strongly a religion expands when religions are recalculated, from 0 to 99
Religions.recalculate() // Redraw religion borders from their centers, expansion and expansionism
Religions.add(x: number, y: number) // Found a religion centered at a map point, its type and name drawn from the local culture and faith. Returns its id
Religions.remove(religionId: number) // Remove a religion; its believers lose their faith
Religions.setLocked(religionId: number, locked: boolean) // Lock a religion so regeneration keeps it, or unlock it
Religions.setOrigins(religionId: number, originIds: number[]) // Set a religion's origins, as the Hierarchy tree does: the first is primary (0 = top level), the rest secondary
Religions.setCode(religionId: number, code: string) // Set a religion's short code, 1 to 3 characters
Religions.moveCenter(religionId: number, x: number, y: number) // Move a religion's center to a land cell at a map point; it takes effect when religions are recalculated
Religions.setCells(religionId: number, cellIds: number[]) // Give land cells to a religion, or to no religion with id 0
Religions.setPopulation(religionId: number, rural: number, urban: number) // Set a religion's rural and urban population, in people: its cells and burgs scale to the totals
Biomes.rename(biomeId: number, name: string) // Rename a biome
Biomes.recolor(biomeId: number, color: string) // Set a biome's color
Biomes.setHabitability(biomeId: number, percent: number) // Set a biome's habitability, in percent
Biomes.add(name: string, color: string, habitability: number) // Add a custom biome for painting; returns its id. There can be at most 255 biomes
Biomes.remove(biomeId: number) // Remove a custom biome that no cell uses; the generated biomes stay
Biomes.setCells(biomeId: number, cellIds: number[]) // Paint land cells with a biome; a cell's rural population does not follow until population is regenerated
Biomes.restore() // Restore the generated biomes: their default names, colors and habitability, and the cells they cover. Custom biomes are removed
Rivers.rename(riverId: number, name: string) // Rename a river; a custom label keeps its pattern when the old name stands in it as a whole word
Rivers.setType(riverId: number, type: string) // Set a river's type, a free label such as River, Creek or Fork
Rivers.add(x: number, y: number) // Start a river at a land point; it flows downhill to the sea, a lake or another river. Returns the river holding it
Rivers.remove(riverId: number) // Remove a river with all its tributaries; lakes forget them
Rivers.setParent(riverId: number, parentId: number) // Make a river a tributary of another, or a mainstem when the parent is itself; the basin follows
Rivers.setWidth(riverId: number, sourceWidth: number, widthFactor: number) // Set a river's width at its source and how fast it widens downstream; its mouth width follows
Rivers.create(cellIds: number[]) // Draw a river through cells from source to mouth, each a neighbor of the one before (\`pack.cells.c\`); it joins the river at its last cell, if any. Returns its id
Routes.rename(routeId: number, name: string) // Rename a route
Routes.setGroup(routeId: number, group: string) // Move a route to another route group, such as roads, trails or searoutes
Routes.add(fromBurgId: number, toBurgId: number, group: string) // Build a route between two burgs along the cheapest path: roads and trails by land, searoutes by water. Returns its id
Routes.remove(routeId: number) // Remove a route and its cell connections
Routes.setLocked(routeId: number, locked: boolean) // Lock a route so regeneration keeps it, or unlock it
Routes.create(points: number[][], group: string) // Draw a route in a group through map points [x, y], each in the cell under it. Returns its id
Routes.split(routeId: number, pointIndex: number) // Split a route at one of its inner points: the route ends there and a new one of the same group goes on. Returns the new id
Routes.join(routeId: number, otherId: number) // Join a route of the same group that starts or ends where this one starts or ends; the other route is removed
Features.rename(featureId: number, name: string) // Rename a geographical feature: an island, lake or ocean
Features.setSubtype(featureId: number, subtype: string) // Set a feature's subtype within its type: a lake's freshwater, salt, dry…, an island's continent, island or isle, an ocean's ocean, sea or gulf. Generators read it on their next run
Features.setGroup(featureId: number, group: string) // Move a lake to another lake group, which sets how it is drawn
Features.setCoastline(featureId: number, settings: Partial<CoastlineSettings> | null) // Give a feature its own coastline settings, merged over the current ones; null makes it follow the map settings again
Zones.rename(zoneId: number, name: string) // Rename a zone; its name is its description
Zones.recolor(zoneId: number, color: string) // Set a zone's color
Zones.setType(zoneId: number, type: string) // Set a zone's type, a free label such as Invasion or Disease
Zones.setHidden(zoneId: number, hidden: boolean) // Hide or show a zone
Zones.setCells(zoneId: number, cells: number[]) // Set the cells a zone covers, as a list of cell ids
Zones.add(name: string, type: string, cells: number[]) // Add a zone over a list of cell ids; returns its id
Zones.remove(zoneId: number) // Remove a zone
Zones.setPopulation(zoneId: number, rural: number, urban: number) // Set the rural and urban population of a zone's land, in people: its cells and burgs scale to the totals
Markers.rename(markerId: number, name: string) // Rename a marker
Markers.setIcon(markerId: number, icon: string) // Set a marker's icon: an emoji or an icon id
Markers.setType(markerId: number, type: string) // Set a marker's type, a free label such as volcano or ruins
Markers.setHidden(markerId: number, hidden: boolean) // Hide or show a marker
Markers.place(x: number, y: number, type: string, details: MarkerDetails = {}) // Place a marker at a map point with details: its name, legend note (HTML, as Notes.write takes) and icon (an emoji or icon id). A type from the markers config, such as volcanoes or ruins, generates all three, each replaced by the one given; any other type needs a note. Returns its id
Markers.remove(markerId: number) // Remove a marker
Markers.move(markerId: number, x: number, y: number) // Move a marker to a map point
Markers.setPinned(markerId: number, pinned: boolean) // Pin a marker so it shows even when its type is filtered out, or unpin it
Markers.setLocked(markerId: number, locked: boolean) // Lock a marker so regeneration keeps it, or unlock it
Markers.setAppearance(markerId: number, appearance: MarkerAppearance) // Set how a marker looks: size (marker), px (icon size), dx and dy (icon shift, %), pin shape, fill and stroke (pin), iconFill and iconStroke. null restores a default
AddedLabels.rename(labelId: number, text: string) // Change the text of a label placed on the map
AddedLabels.place(x: number, y: number, text: string, group?: string) // Place a text label at a map point, in an "added" label group (default: the first one). Returns its id
AddedLabels.remove(labelId: number) // Remove a label placed on the map
Labels.setGroup(type: LabelType, id: number, group: string) // Move a label to a label group, which sets its style and when it shows
Labels.setLayout(type: LabelType, id: number, layout: LabelLayout) // Adjust a label: dx and dy shift it, fontSize (30–300%) and letterSpacing (0–20 px) size its text, startOffset (0–100%) slides a label along its path, hidden hides it. null restores the automatic value
Labels.reset(type: LabelType, id: number) // Return a label to its automatic placement and style; an added label keeps its text and group
Military.rename(stateId: number, regimentId: number, name: string) // Rename a regiment, addressed by its state and its own id
Military.remove(stateId: number, regimentId: number) // Disband a regiment, addressed by its state and its own id
Military.add(stateId: number, x: number, y: number) // Raise an empty regiment of a state at a map point, a fleet on water; returns its id
Military.setAlert(stateId: number, alert: number) // Set a state's war alert, the modifier of its forces (generated from 0.1 to 5): every regiment's troops scale with it
Military.setUnits(stateId: number, regimentId: number, units: Record<string, number>) // Set a regiment's troops by unit name, such as { infantry: 800, archers: 200 }; the total follows
Military.setNaval(stateId: number, regimentId: number, naval: boolean) // Make a regiment a fleet or a land regiment
Military.setIcon(stateId: number, regimentId: number, icon: string) // Set a regiment's icon: an emoji or an icon id
Military.move(stateId: number, regimentId: number, x: number, y: number) // Move a regiment to a map point; its base stays
Military.rotate(stateId: number, regimentId: number, angle: number) // Turn a regiment to an angle in degrees, from -180 to 180
Military.setBase(stateId: number, regimentId: number, x: number, y: number) // Move a regiment's base, where it is stationed, to a map point
Military.split(stateId: number, regimentId: number) // Split a regiment in two halves; the new one stands just below. Returns its id
Military.attach(stateId: number, regimentId: number, targetStateId: number, targetId: number) // Attach a regiment to another, of any state: its troops join the target and it is disbanded
Emblems.set(key: string, coa: Emblem) // Set the emblem of a state, province or burg, keyed like "state:3": a heraldic emblem in the generator's vocabulary, or { icon } for a picture. Its size and position stay
Emblems.regenerateOne(key: string) // Draw a new emblem for a state, province or burg, akin to its overlord's; its shield, size and position stay
Emblems.place(key: string, x: number | null, y: number | null, size: number | null) // Place an emblem on the map: x and y in map units, size from 0 to 5. null returns a value to automatic
Journeys.add(random = false) // Add a journey, empty or a random story between burgs; returns its id
Journeys.remove(journeyId: number) // Remove a journey
Journeys.rename(journeyId: number, name: string) // Rename a journey
Journeys.setType(journeyId: number, type: string) // Set a journey's type, a free label such as Quest, Raid or Pilgrimage
Journeys.recolor(journeyId: number, color: string) // Set a journey's color; segments without their own color take it
Journeys.setHidden(journeyId: number, hidden: boolean) // Hide or show a journey on the map
Journeys.setLocked(journeyId: number, locked: boolean) // Lock a journey so regeneration keeps it, or unlock it
Journeys.addSegment(journeyId: number) // Append an empty segment to a journey, starting where the previous one ended; returns its id
Journeys.removeSegment(journeyId: number, segmentId: number) // Remove a segment of a journey
Journeys.moveSegment(journeyId: number, segmentId: number, index: number) // Move a segment to a position in its journey, counted from 0
Journeys.setSegment(journeyId: number, segmentId: number, fields: SegmentFields) // Change a segment: name, color (null = the journey's), hidden, transport, speed (km/h), duration (hours, null = from distance and speed), from and to (cells), avoidRoads. A changed transport, endpoint or road choice reroutes it
Journeys.resetSegment(journeyId: number, segmentId: number) // Drop a segment's manual overrides, color, speed, duration and drawn path, and route it again
Goods.rename(goodId: number, name: string) // Rename a good
Goods.setIcon(goodId: number, icon: string) // Set a good's icon: an emoji or an icon id
Goods.recolor(goodId: number, color: string) // Set a good's color on the Goods layer
Goods.setPrice(goodId: number, value: number) // Set a good's base value per unit, in the map's currency; markets price it from this on the next economy run
Goods.setUnit(goodId: number, unit: string) // Set the unit a good is counted in, such as "barrel"; empty for none
Goods.setTags(goodId: number, tags: string[]) // Set a good's tags, such as "food, luxury"
Goods.setProduction(goodId: number, rules: ProductionRules) // Set how a good is produced: chance (0–100), recipes ([{ goodId: amount }]), biomeOutput ({ biomeId: amount }), multipliers ({ cultureType | culture | state | religion | biome | zone: { key: factor } }), demandCoverage ({ category: share }). A key set to null clears it. Takes effect on the next economy run
Markets.rename(marketId: number, name: string) // Rename a market; empty takes its center burg's name again
Markets.recolor(marketId: number, color: string) // Set a market's color on the Markets layer
Lore.rename(name: string) // Rename the map; files it is downloaded as take the name
Lore.setYear(year: number) // Set the current year, a whole number that may be negative; history and battle reports are dated by it
Lore.setEra(era: string, eraShort?: string) // Set the era the current year belongs to and its short form, such as "Winter Era" and "WE"; without one the short form is abbreviated from the era
Lore.setDescription(text: string) // Set the author's free-text description of the world; empty clears it
Notes.write(key: string, html: string) // Replace an entity's note with HTML from the notes editor's subset; empty html removes the note
Styles.setValue(path: string, value: unknown) // Set one value of \`styles\` by its path, such as "ocean.groups.base.attrs.fill"; null unsets an attr. Draws nothing
StylePresets.apply(name: string) // Replace the whole style with a preset's, such as "ancient", keeping the relief density; Styles.setValue after it adjusts the result`,on=`interface CoastlineSettings {
  enabled: boolean; // master toggle — false bypasses all fractalization
  maxDepth: number; // max recursion depth per edge
  baseAmplitude: number; // peak displacement (scales with √edgeLength)
  amplitudeDecay: number; // amplitude multiplier per recursion level
  minEdge: number; // edges shorter than this are never subdivided
  smoothThreshold: number; // roughness values below this → zero displacement
  roughnessContrast: number; // power applied to the roughness field
  roughnessScale: number; // size of a calm or rough stretch of coast, in map units
  lakeSmoothThreshMult: number; // smooth-threshold multiplier for lake shores (1 = same as ocean, higher = calmer)
  variant: number; // reshuffles the coastlines of the map, changing nothing else about them
}
type MarkerDetails = { name?: string; note?: string; icon?: string };
type MarkerAppearance = Partial<
  Record<"size" | "px" | "dx" | "dy", number | null> &
    Record<"pin" | "fill" | "stroke" | "iconFill" | "iconStroke", string | null>
>;
type LabelType = (typeof LABEL_TYPES)[number];
type LabelLayout = Partial<
  Record<"dx" | "dy" | "fontSize" | "letterSpacing" | "startOffset", number | null> & { hidden: boolean | null }
>;
type Emblem = HeraldicEmblem | PictureEmblem;
type SegmentFields = Partial<{
  name: string;
  color: string | null;
  hidden: boolean;
  transport: string;
  speed: number;
  duration: number | null;
  from: number;
  to: number;
  avoidRoads: boolean;
}>;
type ProductionRules = Partial<{
  chance: number | null;
  recipes: Record<number, number>[] | null;
  biomeOutput: Partial<Record<number, number>> | null;
  multipliers: Good["multipliers"] | null;
  demandCoverage: Good["demandCoverage"] | null;
}>;
const LABEL_TYPES = ["state", "province", "burg", "river", "route", "added"] as const;
interface HeraldicEmblem extends EmblemBase {
  t1: string;
  division?: EmblemDivision;
  ordinaries?: EmblemOrdinary[];
  charges?: EmblemCharge[];
  inscriptions?: EmblemInscription[];
  diaper?: string;
  zoom?: number;
}
interface PictureEmblem extends EmblemBase {
  icon: string;
}
interface EmblemBase {
  size?: number;
  x?: number;
  y?: number;
  shield?: string;
}
interface EmblemDivision {
  division: string;
  t: string;
  line?: string;
}
interface EmblemOrdinary extends EmblemPlacement {
  ordinary: string;
  t: string;
  t2?: string;
  line?: string;
  above?: boolean;
  strokeWidth?: number;
  compony?: number; // bordure and orle tile length
  gyronny?: number; // bordure and orle sector count
}
interface EmblemCharge extends EmblemPlacement {
  charge: string;
  t: string;
  p: string;
  t2?: string;
  t3?: string;
  sinister?: number | boolean;
  reversed?: number | boolean;
  layered?: number | boolean; // redraws the charge's foreground over what it overlaps
  outside?: "above" | "below" | "around"; // drawn over or under the shield outline
}
interface EmblemInscription {
  text: string; // \`|\` breaks lines
  font: string;
  size: number;
  color: string;
  path: string; // around the shield center
  bold?: boolean;
  italic?: boolean;
  spacing?: number;
  shadow?: { x: number; y: number; blur: number; color: string };
}
interface EmblemPlacement {
  size?: number;
  stretch?: number; // negative widens, positive heightens
  x?: number;
  y?: number;
  angle?: number;
  stroke?: string;
  divided?: Divided;
}
type Divided = "field" | "division" | "counter";`,sn=[...Se,...xe].join(`, `),cn=Object.entries(Zt).map(([e,t])=>`${e}: ${t.join(`, `)}`).join(`
`),ln=[{type:`text`,text:["You are Azgaar Assistant in Fantasy Map Generator. Tools: `read_help` searches the Knowledge Base for\nhow-to questions; `read_map` runs scripts for facts about the open map (never guess them); `read_docs` returns\nreference docs; `propose_change` edits the map; `show_*` place widgets; `view_emblem` and `view_map` show you\nan emblem or the map.\n\nScope: the generator, the open map, cartography and world-building. Real-world knowledge is fine when it serves \nthe user's world. For anything else reply in one sentence that it is out of your scope.\nDo not answer out of scope questions, don't be polite.",`# Scripts (read_map)

- Read-only: never assign to map data or call mutating methods. Changes go only through \`propose_change\`.
- \`return\` the answer. Only it and console output come back, cut at 8000 characters: aggregate, count and slice;
  never return a whole entity array. Plan first: one script gathers all the answer needs, and independent calls
  share one turn. Stop reading once you can answer. On an error, fix and retry.
- Unsure of a shape? \`return describe("pack.burgs[1]")\`, an object (also works on singletons, e.g.
  \`describe("States")\`), or call \`read_docs\`. Declarations lag the code mid-migration, so check when it matters.
- Globals: \`pack\` (map data), \`grid\` (pre-repack grid), \`options\` (\`options.map\` holds the map's settings),
  \`styles\`, \`mapHistory\`, and generator singletons: ${tn}. Guard anything else with \`typeof\`.
- \`downloadFile(content, "name.csv", "text/csv")\` saves a file for the user; name it in the answer.
- Do not call \`draw*\` functions: applying a proposal redraws the map.`,'# Units\n\nAnswer in the map\'s units only (e.g. "152K mi²"); never mention map units, coordinates, pixels or cells unless asked.\nName a place by its nearest burg or province. Scripts have `units`, the app\'s own formatters: `si(n)` → "1.4M";\n`rn(n, decimals = 0)`; `getArea(mapUnits²)` with `getAreaUnit()`; `getDistance(mapUnits)` → "92 mi" for every distance you state, e.g. of `Math.hypot(dx, dy)`;\n`getHeight(h)` → "1640ft"; `convertTemperature(°C)`; `getPrecipitation(prec)`; `formatSpeed(km/h)`; `formatPrice(n)` for money.\nExample: `units.si(units.getArea(state.area)) + " " + units.getAreaUnit()`.',`# Gotchas

- Index 0 is reserved in states (neutrals), cultures (wildlands), religions (none) and provinces; in burgs and
  features element 0 is the number \`0\`. Cell 0 is real. Deleted entities keep their slot with \`removed: true\`:
  filter with \`x => x.i && !x.removed\`.
- Ids are not always array indices: goods and markets start at 1 (\`pack.goods[0]\` is good 1); rivers, markers,
  routes, zones, journeys and often deals are unordered. Look up with \`.find(x => x.i === id)\` or \`Goods.get(id)\`,
  \`Markets.get(id)\`; never \`pack.goods[id]\`. Burg \`production\` records hold \`good\`/\`dealId\` ids: resolve each.
- A cell's owner is \`cells.state[i]\` (0 = neutral); \`cells.s\` is a burg-site score. \`burgs\` and \`cells\` of states,
  provinces, cultures and religions are counts: a state's cells are
  \`pack.cells.i.filter(i => pack.cells.state[i] === id)\`, its burgs those with \`burg.state === id\`. \`center\` is a
  cell id; capitals are \`state.capital\`, \`province.burg\`.
- Cell arrays are typed: \`filter\` and \`map\` on them stay typed and wrap negatives (-1 → 4294967295). Use
  \`Array.from(cells)\` before mapping to other values.
- \`state.diplomacy[j]\`: relation to state j (${Object.keys(Fe).join(`, `)}); \`Enemy\` is war,
  \`Vassal\` of j, \`Suzerain\` over j.
- States have no religion: read their cells' \`cells.religion\`. Bordering states are \`state.neighbors\`; diplomacy says
  nothing of borders.
- \`burg.type\` is the culture type (Generic, River, Naval…), never rank: capital is \`burg.capital\` (1/0),
  size class is \`burg.group\`.
- Land is \`pack.cells.h[i] >= 20\` (heights 0–100). Water body: \`pack.features[pack.cells.f[i]]\`, type ocean/lake/island.
  Shore: \`cells.t[i]\` is 1 on coastal land, -1 on coastal water; \`cells.haven[i]\` is a coastal cell's water neighbor.
  Climate is on the grid: \`grid.cells.temp[pack.cells.g[i]]\` (°C), \`grid.cells.prec[…]\`.
- Population fields are points, not people: \`burg.population\`, \`cells.pop\`, \`rural\`/\`urban\`. Never show, compare or
  chart points: convert with \`units.getPeople(rural, urban)\`, e.g. \`units.getPeople(0, burg.population)\`, then \`si\`.
  Only states keep \`rural\`/\`urban\`/\`area\` current. For provinces, cultures and religions sum their cells'
  points (\`cells.pop[i]\` rural, burg \`cells.burg[i]\` urban) and \`pack.cells.area[i]\`.
- Areas (\`state.area\`, \`pack.cells.area[i]\`) are map units². Coordinates (\`cells.p[i]\` is [x, y]) are map units within
  \`options.map.graph.width\` × \`height\`; \`Pack.findCell(x, y)\` gives the cell. \`cells.b\` is 0/1, not boolean.`,`# Answers

Images the user attached are not the map: describe them, never read the map to guess them.
State only facts a result or image in this question gave (numbers, ranks, comparisons, terrain); compute
every comparison or count you state ("twice as large", "four remain"). Name
only UI that read_help or read_docs returned, or say it is not covered. Never repeat a proposal's content: its card
shows it.

Answer with a widget whenever one fits, with prose around it. A widget replaces the text it shows: never repeat its
content, add only what it does not say. Pick by the question, and combine widgets when several fit:

- one state is the subject (tell me about, describe, who rules) → \`show_card\`;
- 3 or more entities in the answer (which, list, find) → \`show_entities\` instead of a list;
- one number compared or ranked across items → \`show_chart\` bar; parts of one whole → pie. A table only when several
  columns matter;
- where something is, what a place or region is like → \`show_inset\`;
- ideas for the user to pick (names, options) → \`show_choices\`, a rename operation per name idea; then stop;
- an emblem, coat of arms or heraldry → \`view_emblem\` before describing it;
- how the map or a place looks (style, shapes) → \`view_map\` first;
- a \`read_help\` answer → \`show_source\`.

Otherwise prose, rendered as Markdown: a list for several findings, \`code\` for fields, bold for a headline number.
A one-line answer needs no formatting. No raw JSON unless asked.

Link every map entity you name by its key, \`[Vel](burg:12)\`: the user clicks to see it on the map. Key types: ${sn}
(\`i\` for most; the array index for cells, relief and measurers). Use only ids you
have read (return them from read_map), else leave the name unlinked. Link the editor
or dialog that answers a how-to, \`[Heightmap editor](command:editHeightmapButton)\`; ids come from
\`read_docs(["Commands"])\`, never guess one.`,`# Changing the map

\`propose_change({ summary, operations: [{ op, args }] })\` proposes ONE batch; the user previews before → after and
applies or discards it. \`args\` go in order, e.g. \`{ op: "Burgs.rename", args: [12, "Saltmere"] }\`. \`{ result: n }\`
stands for what operation n (from 0) of the batch returned, such as a new id: \`[{ op: "States.add", args: [410, 220] },
{ op: "States.rename", args: [{ result: 0 }, "Varn"] }]\`; \`{ result: n, type: "burg" }\` stands for its key, "burg:12",
for \`Notes\` and \`Emblems\`. Put everything asked into one proposal; \`summary\` is a short card title. On a validation
error nothing is proposed: fix and retry.
Success means the proposal is WAITING: say what you proposed, never that the map changed. Operations keep dependent
data (labels, full names, codes, cell ownership) in sync. "Proposals in this chat" in the map context shows what the
user did. If no operation can make a change, say so. Operations by model; ids are \`i\`, points are map units. Read
\`read_docs(["Operations: States, Markers"])\` (the models you need) for signatures and allowed values before using one
new to this chat, and \`read_docs(["Emblems"])\` for the heraldry \`Emblems.set\` accepts:

${cn}

The map's look is \`styles\`, a record by layer (\`attrs\` SVG attributes, \`options\` renderer inputs, \`groups\` nested
nodes): \`Styles.setValue("ocean.groups.base.attrs.fill", "#0d2240")\`, one op per value; a whole new look starts with
\`StylePresets.apply(name)\` of the closest preset. Read \`read_docs(["Styles"])\` for presets and choices, then
\`["Styles: ocean, labels"]\` for paths and values; never fetch source files. Heightmap, relief icons and ice have no operations: link their editor and stop.

A marker's story is its note: place every marker with a name, a fitting note and an emoji icon,
\`Markers.place(x, y, type, { name, note, icon })\`; prefer a configured type, \`Markers.configuration.map(c => c.type)\`.
Notes are HTML in an entity's \`note\` field (\`pack.burgs[12].note\`); there is no notes array. Keys are \`type:id\`
(\`burg:12\`, \`marker:0\`, \`route:0\`; regiments \`regiment:stateId-regimentId\`) of an existing entity, whose name is
the note's title; cells, ice, relief, measurers, deals, transports and name bases have no notes. \`Notes.write\` replaces the WHOLE note. Allowed: p, br, strong, em, u, s, a, img, ul/ol/li,
blockquote, h1–h6, sub, sup, span, div, simple tables, inline code, hr and inline styles; no classes, handlers,
scripts, iframes, javascript: URLs or Markdown. Keep the user's text unless asked; say in one line what changed.`,'# Asking first\n\nBefore creating something or a sweeping change, know what the user wants. When an essential detail is missing or\nambiguous (where, which entity, how much land), ask one short question and stop, offering likely answers with\n`show_choices` (a choice without operations becomes the reply). Never ask about what can be generated (names, colors,\nemblems, forms): propose it, then offer tweaks. Resolve places ("north of Vel", "on the coast") to points with\n`read_map`, e.g. a free land cell\'s `pack.cells.p[i]`. New states, provinces, cultures and religions start small (a\nstate owns only its capital cell): to grow them, add `Provinces.setState` for chosen provinces, or `recalculate()`,\nwhich redraws every border of that kind; ask which when the user did not say.',`# Data fields

Field names by data-model section. For meanings and types, pass section names to \`read_docs\`, as well as
Configuration, Globals, Registries or PackedGraph.

${rn}`].join(`

`),cache_control:{type:`ephemeral`}}],un=null;async function dn(){let[e,t,n,r,{MAP_COMMANDS:i,isLinkable:a}]=await Promise.all([x(()=>import(`./data-model-DzJrcmSz.js`),[]),x(()=>import(`./configuration-etxiWrbp.js`),[]),x(()=>import(`./PackedGraph-Dcov4qiy.js`),[]),x(()=>import(`./emblems-uUqrpFK3.js`).then(e=>e.t),__vite__mapDeps([12,1])),x(()=>import(`./index-lTzorqRn.js`).then(e=>e.R),__vite__mapDeps([34,1,5,2,4,6,7,8,9,10,11,12,13,14,15,16,17,18,26,27,28,35,36,37,3,19,38,31,39,29,40,41,32,23,24,25,42,43,44,22,45,46,47,48,49,50,20,51,52,53,54,21]))]),o=new Map;for(let t of e.default.split(/(?=^#{1,2} )/m)){let e=t.match(/^## (.+)$/m)?.[1];e&&o.set(e,t.trim())}o.set(`Configuration`,t.default),o.set(`Globals`,`\`\`\`ts\n${en}\n\`\`\``),o.set(`Registries`,`Callable as \`await Controllers.X.open()\` / \`await Services.X.method()\`:\n${nn}`),o.set(`PackedGraph`,`\`\`\`ts\n${n.default}\n\`\`\``),o.set(`Operations`,`Operations for \`propose_change\`, with argument types:\n\`\`\`ts\n${an}\n\`\`\`\n\nThe types they name:\n\`\`\`ts\n${on}\n\`\`\``),o.set(`Emblems`,gn(r));let s=i.filter(a).map(({id:e,name:t})=>`${e}: ${t}`);return o.set(`Commands`,`Command ids for \`[label](command:id)\` links, as \`id: name\`:\n${s.join(`
`)}`),new Map([...o].map(([e,t])=>[e.toLowerCase(),{title:e,text:t}]))}var fn=[...on.matchAll(/^(?:type|interface|const) (\w+)/gm)].map(e=>e[1]);function pn(e){let t=e.match(/^operations\s*:(.+)$/i)?.[1].split(/[\s,]+/).filter(Boolean);if(!t?.length)return;let n=t.map(e=>`${e.toLowerCase()}.`),r=an.split(`
`).filter(e=>n.some(t=>e.toLowerCase().startsWith(t)));if(!r.length)return;let i=r.join(`
`);return{title:e,text:`Operations for \`propose_change\`:\n\`\`\`ts\n${i}\n\`\`\`${fn.some(e=>RegExp(`\\b${e}\\b`).test(i))?`\n\nThe types they name:\n\`\`\`ts\n${on}\n\`\`\``:``}`}}async function mn(e){let t=e.match(/^styles\s*(?::(.*))?$/i);if(!t)return;let{styleFields:n,styleOverview:r}=await x(async()=>{let{styleFields:e,styleOverview:t}=await import(`./style-reference-CUz75NlW.js`);return{styleFields:e,styleOverview:t}},__vite__mapDeps([55,2,56,3,4,1,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,43,57,0,20,21,22,23,24,25,26,27,28,29])),i=t[1]?.split(/[\s,]+/).filter(Boolean);return{title:e,text:i?.length?n(i):r()}}async function hn(e){un??=await dn();let t=await Promise.all(e.map(e=>mn(e.trim()))),n=e.map((e,n)=>t[n]??pn(e.trim())??un.get(e.replace(/\(.*\)/,``).trim().toLowerCase())),r=n.flatMap(e=>e?.text??[]),i=e.filter((e,t)=>!n[t]);return i.length&&r.push(`Unknown topics: ${i.join(`, `)}. Available: ${[...un.values()].map(e=>e.title).join(`, `)}, "Operations: <Model>, <Model>", Styles, "Styles: <element>, <element>"`),r.join(`

`)}function gn({charges:e,divisions:t,lineWeights:n,ordinaries:r,shields:i,tinctures:a}){let o=e=>Object.keys(e).join(`, `),s=e,c=Object.keys(e.types).filter(e=>s[e]);return["Heraldic emblems for `Emblems.set`, in the generator's vocabulary (the `Emblem` type is in the Operations topic).",`Tinctures. Metals: ${o(a.metals)}. Colours: ${o(a.colours)}. Stains: ${o(a.stains)}.`,`Patterns fill a tincture slot as "pattern-tincture-tincture", such as "vair-argent-azure": ${o(a.patterns)}; "semy_of_<charge>-or-gules" strews a charge.`,`Divisions (\`division.division\`): ${o(t.variants)}.`,`Ordinaries that take a \`line\`: ${o(r.lined)}. Straight ordinaries: ${o(r.straight)}.`,`Lines: ${o(n)}.`,`Shields (\`shield\`): ${Object.keys(i.types).flatMap(e=>Object.keys(i[e]??{})).join(`, `)}.`,"Charge positions (`p`, one letter per copy): a b c / d e f / g h i are the 3×3 grid from the top left; e is the center; j k l / m n o a tighter grid above and below it; p q left and right of the center; y the top left corner, z the base; A–L around the border.",`Charges by category:`,...c.map(e=>`- ${e}: ${o(s[e])}`)].join(`
`)}var _n=3,vn=2500,yn=new Set([`_Footer`,`Home`,`Changelog`,`Dependencies`]),bn=new Set(`the and for how can what why does with from that this are not you your into there their have has get make map use way any all its was will where when which who also than then them they just only some more like want do my me is it to of in on an or be`.split(` `)),xn=null,Sn=Object.assign({}),Cn=e=>e.match(/([^/]+)\.md$/)[1],wn=Object.keys(Sn).map(Cn).filter(e=>!yn.has(e)),Tn=e=>(e.toLowerCase().match(/[a-z0-9]+/g)??[]).filter(e=>e.length>1&&!bn.has(e)).map(e=>e.length>3?e.replace(/(?:es|s)$/,``):e);async function En(){return(await Promise.all(Object.entries(Sn).map(async([e,t])=>[Cn(e),await t()]))).flatMap(([e,t])=>yn.has(e)?[]:Dn(e,t))}function Dn(e,t){let n=e.replace(/-/g,` `),r=e===`Knowledge Base`;return t.split(/(?=^#{2,3} )/m).flatMap(e=>{let t=e.match(/^#{2,3} (.+)$/m)?.[1];if(r&&!t)return[];let i=r?t:t?`${n} › ${t}`:n,a=t?e.replace(/^#{2,3} .+$/m,``).trim():e.trim();return a?[{heading:i,text:`### ${i}\n\n${a}`,headingTerms:new Set(Tn(i)),bodyTerms:new Set(Tn(a))}]:[]})}var On=e=>e.length<=vn?e:`${e.slice(0,vn)}\n… (cut: pass the heading as the query to read it all)`;async function kn(e){xn??=await En();let t=xn.find(t=>t.heading===e.trim());if(t)return t.text;let n=[...new Set(Tn(e))],r=xn.map(e=>({section:e,score:n.reduce((t,n)=>t+(e.headingTerms.has(n)?3:0)+ +!!e.bodyTerms.has(n),0)})).filter(({score:e})=>e>0).sort((e,t)=>t.score-e.score);if(!r.length)return`No help sections match "${e}". Try other words.`;let i=r.slice(0,_n).map(({section:e})=>On(e.text)),a=r.slice(_n,9).map(({section:e})=>`- ${e.heading}`);return a.length&&i.push(`Other matches (pass a heading as the query to read it):\n${a.join(`
`)}`),i.join(`

`)}var An=e=>Array.isArray(e)?e.filter(e=>typeof e==`string`):[],jn=[{status:`Reading help`,definition:{name:`read_help`,description:`Search the Knowledge Base for how to use the generator. Returns the best-matching sections and other matching headings; pass a heading to read that section.`,input_schema:{type:`object`,properties:{query:{type:`string`}},required:[`query`]}},handle:async e=>({content:await kn(String(e.query??``))})},{status:`Reading docs`,definition:{name:`read_docs`,description:`Read reference docs by topic: data-model sections, Configuration, Globals, Registries, PackedGraph, Operations, Commands, Styles (elements and choices), "Styles: ocean, labels" (their paths and values).`,input_schema:{type:`object`,properties:{topics:{type:`array`,items:{type:`string`}}},required:[`topics`]}},handle:async e=>({content:await hn(An(e.topics))})}],Mn=30,Nn=32e3,Pn=`[Earlier tool result shortened]`,Fn=1e3,In=`[The image is not available: this model cannot see images]`,Ln=`[The user attached an image, but this model cannot see images. Tell the user; never guess it from the map]`,Rn=`The user attached these images to the question:`,zn=`This model cannot see images, so it answered without yours. Connect a model with vision to ask about images.`,Bn=/image|vision|multimodal/i,Vn=/^(read|view)_/,Hn=`Your reply was cut off at the output limit. Think briefly and keep calls small: split a large batch into several propose_change calls.`,Un=/\bI(?:'ve| have)? (?:proposed|prepared|submitted)\b|\b(?:proposal|batch|card)\b[^.\n]{0,40}\b(?:is waiting|waiting for|pending|above)\b/i,Wn=/\bproposed nothing\b|\bnothing (?:to propose|proposed)\b/i,Gn=`Your answer says something was proposed, but no propose_change call succeeded in this question, so the user sees no card. Call propose_change now, or say plainly that nothing was proposed.`;async function Kn(e,t,n,r,{tools:i,context:a,onStatus:o,images:s=[]}){let c=[...jn,...i],l=c.map(e=>e.definition),u=new Map(c.map(e=>[e.definition.name,e]));n(s.length?{kind:`question`,text:t,images:s}:{kind:`question`,text:t});let d=e.messages.length,f=d,p=``,m=``,h=``,_=!1,v=!1;try{for(let t of qn(e.messages.slice(0,d)))t.content=Pn;for(let i=0;i<Mn;i++){r.throwIfAborted(),o?.(i?`Thinking · step ${i+1}`:`Thinking`);let c=await a();r.throwIfAborted(),i?c!==p&&e.messages.at(-1).content.push({type:`text`,text:c}):e.messages.push({role:`user`,content:[{type:`text`,text:c},...s.length?[{type:`text`,text:Rn},...s.map(kt)]:[],...t?[{type:`text`,text:t}]:[]]}),p=c,Yn(e.messages.slice(d));let ee={...D(),system:ln,messages:e.messages,tools:l,signal:r},y=await Lt(ee).catch(t=>{let i=!r.aborted&&Bn.test(g(t))&&Xn(e.messages);if(!i)throw t;return i===`attached`&&n({kind:`notice`,text:zn}),Lt(ee)});if(r.aborted)throw r.reason;e.usage.input+=y.usage.input,e.usage.output+=y.usage.output,e.usage.cached+=y.usage.cached,y.content.length&&e.messages.push({role:`assistant`,content:y.content});let b=y.content.filter(e=>e.type===`text`).map(e=>e.text).join(`

`).trim(),te=y.content.filter(e=>e.type===`tool_use`);if(!te.length&&y.truncated){e.messages.push({role:`user`,content:[{type:`text`,text:Hn}]});continue}if(!te.length){if(h+=b,(b||m)&&n({kind:`answer`,text:b||m}),!v&&u.has(`propose_change`)&&!_&&Un.test(h)&&!Wn.test(h)){v=!0,m=``,e.messages.push({role:`user`,content:[{type:`text`,text:Gn}]});continue}!b&&!m&&n({kind:`notice`,text:`The model ended without an answer. Ask again.`});return}let ne=[],re=[];for(let e of te){let t=u.get(e.name);r.aborted||o?.(t?.status??`Working`);let n=r.aborted?{content:`Cancelled before this tool ran.`,isError:!0}:`invalidArguments`in e.input?{content:String(e.input[Ot]),isError:!0}:t?await t.handle(e.input).catch(e=>({content:g(e),isError:!0})):{content:`Unknown tool ${e.name}. Available: ${[...u.keys()].join(`, `)}`,isError:!0};n.item&&re.push(n.item),ne.push({type:`tool_result`,tool_use_id:e.id,content:n.content,is_error:n.isError??!1})}b&&(te.every(e=>Vn.test(e.name))||ne.some(e=>e.is_error))?m=b:b&&(h+=b,n({kind:`answer`,text:b}),m=``),re.some(e=>e.kind===`proposal`)&&(_=!0);for(let e of re)n(e);e.messages.push({role:`user`,content:ne}),f=e.messages.length,r.throwIfAborted()}n({kind:`notice`,text:`Stopped after ${Mn} steps. Ask again to continue.`})}catch(t){throw e.messages.splice(f),t}}var qn=e=>e.flatMap(e=>e.content.filter(e=>e.type===`tool_result`)),Jn=({content:e})=>typeof e==`string`?e.length:e.reduce((e,t)=>e+(t.type===`text`?t.text.length:Fn),0);function Yn(e){let t=qn(e),n=qn(e.slice(-1)).length,r=t.reduce((e,t)=>e+Jn(t),0);for(let e of t.slice(0,t.length-n)){if(r<=Nn)return;r-=Jn(e)-31,e.content=Pn}}function Xn(e){let t=!1;for(let n of e)n.content=n.content.map(e=>e.type===`image`?(t=`attached`,{type:`text`,text:Ln}):e);for(let n of qn(e))typeof n.content!=`string`&&(n.content=n.content.map(e=>e.type===`image`?(t||=`tool`,{type:`text`,text:In}):e));return t}var Zn=/^ {0,3}```(\S*)\s*$/,Qn=/^ {0,3}(#{1,6})\s+(.*)$/,$n=/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/,er=/^ {0,3}>\s?(.*)$/,tr=/^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/,nr=/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/,rr=`\0`,ir=RegExp(`${rr}(\\d+)${rr}`,`g`);function ar(e,t){let n=e.replace(/\r\n?/g,`
`).split(`
`),r=[],i=0;for(;i<n.length;){let e=n[i];if(!e.trim()){i++;continue}if(Zn.test(e)){let e=[];for(i++;i<n.length&&!Zn.test(n[i]);)e.push(n[i++]);i++,r.push(`<pre><code>${dr(e.join(`
`))}</code></pre>`);continue}let a=e.match(Qn);if(a){let e=Math.min(a[1].length+2,6);r.push(`<h${e}>${ur(a[2],t)}</h${e}>`),i++;continue}if($n.test(e)){r.push(`<hr />`),i++;continue}if(er.test(e)){let e=[];for(;i<n.length&&er.test(n[i]);)e.push(n[i++].match(er)?.[1]??``);r.push(`<blockquote>${ar(e.join(`
`),t)}</blockquote>`);continue}if(tr.test(e)){let e=[];for(;i<n.length;){let t=n[i].match(tr);if(!t)break;e.push({indent:t[1].length,ordered:/\d/.test(t[2]),text:t[3]}),i++}r.push(sr(e,0,t).html);continue}if(e.includes(`|`)&&i+1<n.length&&nr.test(n[i+1])){i=cr(n,i,r,t);continue}let o=[];for(;i<n.length&&n[i].trim()&&!or(n[i]);)o.push(n[i++]);r.push(`<p>${o.map(e=>ur(e,t)).join(`<br />`)}</p>`)}return r.join(``)}function or(e){return Zn.test(e)||Qn.test(e)||$n.test(e)||er.test(e)||tr.test(e)}function sr(e,t,n){let{indent:r,ordered:i}=e[t],a=[],o=t;for(;o<e.length&&e[o].indent>=r;){if(e[o].indent>r&&a.length){let t=sr(e,o,n);a[a.length-1]+=t.html,o=t.next;continue}a.push(ur(e[o].text,n)),o++}let s=i?`ol`:`ul`;return{html:`<${s}>${a.map(e=>`<li>${e}</li>`).join(``)}</${s}>`,next:o}}function cr(e,t,n,r){let i=lr(e[t]),a=lr(e[t+1]).map(e=>e.startsWith(`:`)&&e.endsWith(`:`)?` style="text-align: center"`:e.endsWith(`:`)?` style="text-align: right"`:``),o=(e,t,n)=>`<${n}${a[t]??``}>${ur(e,r)}</${n}>`,s=[],c=t+2;for(;c<e.length&&e[c].includes(`|`);){let t=lr(e[c]);s.push(`<tr>${t.map((e,t)=>o(e,t,`td`)).join(``)}</tr>`),c++}let l=i.map((e,t)=>o(e,t,`th`)).join(``);return n.push(`<table><thead><tr>${l}</tr></thead><tbody>${s.join(``)}</tbody></table>`),c}var lr=e=>e.trim().replace(/^\|/,``).replace(/\|$/,``).split(`|`).map(e=>e.trim());function ur(e,t){let n=[];return dr(e.replace(/`([^`]+)`/g,(e,t)=>(n.push(`<code>${dr(t)}</code>`),`${rr}${n.length-1}${rr}`))).replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g,(e,n,r)=>/^https?:\/\//i.test(r)?`<a href="${r}" target="_blank" rel="noopener noreferrer">${n}</a>`:t?.(n,r)??e).replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,`<strong>$2</strong>`).replace(/\*(?=\S)([^*\n]*\S)\*/g,`<em>$1</em>`).replace(/~~(?=\S)([\s\S]*?\S)~~/g,`<del>$1</del>`).replace(ir,(e,t)=>n[Number(t)])}var dr=e=>e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`),fr=1568,pr=2e7;async function mr(e){if(e.size>pr)throw Error(`The image is over 20 MB`);let t=await createImageBitmap(e).catch(()=>{throw Error(`The pasted file cannot be read as an image`)}),n=Math.min(1,fr/Math.max(t.width,t.height)),r=document.createElement(`canvas`);r.width=Math.max(1,Math.round(t.width*n)),r.height=Math.max(1,Math.round(t.height*n));let i=r.getContext(`2d`);return i.fillStyle=`#fff`,i.fillRect(0,0,r.width,r.height),i.drawImage(t,0,0,r.width,r.height),t.close(),r.toDataURL(`image/jpeg`,.85)}var hr={read:mr},gr={anthropic:{include:/^claude/},openai:{include:/^(gpt|o\d)/,exclude:/audio|realtime|image|tts|embed|whisper|moderation|transcribe|dall|gpt-6-astra/},mistral:{exclude:/embed|moderation|ocr|voxtral|transcribe/},qwen:{include:/^qwen/,exclude:/embed|ocr|audio|tts|asr|image|video|omni|vl|mt/},deepseek:{include:/^deepseek/}};function _r(e,t){let n=gr[e];return n?t.filter(e=>(!n.include||n.include.test(e))&&!n.exclude?.test(e)):t}async function vr(e,t,n=``,r){return _r(e,await yr(e,t,n,r))}async function yr(e,t,n,r){if(e===`qwen`)return br(t,r);let i=await fetch(xr(e,n),{headers:Sr(e,t),signal:r});if(!i.ok)throw Error(await Bt(i));return((await i.json()).data??[]).map(e=>e.id)}async function br(e,t){let n=[];for(let r=1;;r++){let i=`https://dashscope-intl.aliyuncs.com/api/v1/models?providers=qwen&features=function-calling&page_no=${r}&page_size=100`,a=await fetch(i,{headers:Sr(`qwen`,e),signal:t});if(!a.ok)throw Error(await Bt(a));let o=await a.json(),s=o.output?.models??[];if(n.push(...s.map(e=>e.model)),!s.length||n.length>=(o.output?.total??n.length))return n}}function xr(e,t){return e===`anthropic`?`https://api.anthropic.com/v1/models?limit=1000`:`${Nt(e,t)}/models`}var Sr=(e,t)=>e===`anthropic`?Ft(t):Pt(t),Cr=new class{timer=null;discovery=null;wire(){i(`assistantProvider`).addEventListener(`change`,()=>this.fillProvider()),i(`assistantApiKey`).addEventListener(`input`,()=>this.scheduleDiscovery()),i(`assistantLocalUrl`).addEventListener(`input`,()=>this.scheduleDiscovery())}fill(){let e=D();i(`assistantProvider`).value=e.provider,this.input(`assistantLocalUrl`).value=e.localUrl,i(`assistantDisconnect`).hidden=!qt(),this.fillProvider()}cancelDiscovery(){this.discovery?.abort(),this.discovery=null,this.timer&&clearTimeout(this.timer),this.timer=null}save(){let e=this.provider.id,t=e===`local`,n=this.input(`assistantModel`).value.trim(),r=this.input(`assistantApiKey`).value.trim();return!n||!t&&!r?(i(`assistantDiscoveryError`).textContent=t?`Enter a model name.`:`Enter a model and API key.`,!1):(Gt({provider:e,model:n,key:t?``:r,localUrl:this.input(`assistantLocalUrl`).value.trim()||D().localUrl}),!0)}get provider(){return E(i(`assistantProvider`).value)??jt}input(e){return i(e)}setModels(e){i(`assistantModels`).replaceChildren(...e.map(e=>new Option(e)))}fillProvider(){let e=this.provider,t=e.id===`local`,n=D(e.id);this.input(`assistantModel`).value=n.model,this.input(`assistantApiKey`).value=n.key,i(`assistantModelLabel`).textContent=t?`Model name`:`Model`,i(`assistantKeyLink`).href=e.keyLink;for(let e of i(`assistantKey`).querySelectorAll(`[data-remote]`))e.hidden=t;for(let e of i(`assistantKey`).querySelectorAll(`[data-local]`))e.hidden=!t;this.setModels(e.fallbackModel?[e.fallbackModel]:[]),this.discover()}scheduleDiscovery(){this.cancelDiscovery(),i(`assistantDiscoveryError`).textContent=``,this.setModels([]),this.timer=setTimeout(()=>void this.discover(),350)}async discover(){let e=this.provider,t=this.input(`assistantApiKey`).value.trim(),n=this.input(`assistantLocalUrl`).value.trim();this.discovery?.abort(),this.discovery=new AbortController;let{signal:r}=this.discovery,a=i(`assistantDiscoveryError`);if(a.textContent=``,e.id!==`local`&&!t)return this.setModels([]);try{let i=await vr(e.id,t,n,r);r.aborted||this.setModels(i)}catch(e){r.aborted||(a.textContent=g(e))}}},wr=8e3,Tr=200,Er=50,Dr=500,Or=4,kr=Object.getPrototypeOf(async()=>{}).constructor;async function Ar(e,t={}){let n=[],r=zr(n),i=performance.now();try{return{ok:!0,value:Rr(await new kr(`describe`,...Object.keys(t),e)(Nr,...Object.values(t))),logs:n,ms:jr(i)}}catch(e){let t=e instanceof Error?e:Error(String(e)),r=(t.stack??``).split(`
`).slice(0,Or).join(`
`);return{ok:!1,value:``,logs:n,error:{message:t.message,stack:r},ms:jr(i)}}finally{r()}}var jr=e=>Math.round(performance.now()-e),Mr=e=>ArrayBuffer.isView(e)?e:void 0;function Nr(e){if(typeof e==`string`)try{return{path:e,...Fr(Function(`return (${e})`)()),...Pr(/^styles\b/.test(e))}}catch{}return{...Fr(e),...Pr(e===globalThis.styles)}}var Pr=e=>e?{hint:`read_docs(["Styles"]) lists the elements and choices, ["Styles: ocean"] every path and value`}:{};function Fr(e){if(e===null)return{type:`null`};if(e===void 0)return{type:`undefined`};let t=Mr(e);if(t)return{type:t.constructor.name,length:t.length,sample:Array.from(t.slice(0,5))};if(Array.isArray(e))return{type:`Array`,length:e.length,sample:e.slice(0,3).map(Lr)};if(typeof e==`function`)return{type:`function`,name:e.name||`anonymous`,arity:e.length};if(typeof e==`object`){let t=e,n={};for(let e of Object.keys(t))n[e]=Lr(t[e]);let r={type:t.constructor?.name??`object`,keys:n},i=Ir(t);return i.length&&(r.methods=i),r}return{type:typeof e,value:e}}function Ir(e){let t=Object.getPrototypeOf(e);return!t||t===Object.prototype?[]:Object.getOwnPropertyNames(t).filter(e=>e!==`constructor`)}function Lr(e){if(e===null)return`null`;let t=Mr(e);if(t)return`${t.constructor.name}(${t.length})`;if(Array.isArray(e))return`Array(${e.length})`;if(typeof e==`string`)return`string(${e.length})`;if(typeof e==`object`){let t=Object.keys(e);return`object{${t.slice(0,5).join(`, `)}${t.length>5?`, …`:``}}`}return typeof e}function Rr(e,t=wr){if(e===void 0)return`undefined`;let n=new WeakSet,r=(e,t)=>{if(typeof t==`function`)return`[Function ${t.name||`anonymous`}]`;if(typeof t==`bigint`)return String(t);let r=Mr(t);if(r){let e=Array.from(r.slice(0,10)).join(`, `);return`[${r.constructor.name}(${r.length}) ${e}${r.length>10?`, …`:``}]`}if(t instanceof Set)return{Set:[...t].slice(0,Tr)};if(t instanceof Map)return{Map:[...t.entries()].slice(0,Tr)};if(t&&typeof t==`object`){if(typeof t.nodeType==`number`)return`[Node ${t.nodeName??`?`}]`;if(n.has(t))return`[Circular]`;if(n.add(t),Array.isArray(t)&&t.length>Tr)return[...t.slice(0,Tr),`… ${t.length-Tr} more items`]}return t},i;try{i=JSON.stringify(e,r,1)??String(e)}catch(e){i=`[unserializable: ${g(e)}]`}return i.length<=t?i:`${i.slice(0,t)}\n… truncated, ${i.length-t} more characters. Return less data.`}function zr(e){let t=[`log`,`info`,`warn`,`error`],n=t.map(e=>console[e]);return t.forEach((t,r)=>{console[t]=(...i)=>{if(e.length<Er){let n=i.map(e=>typeof e==`object`?Rr(e,Dr):String(e)).join(` `);e.push(t===`log`?n:`[${t}] ${n}`)}n[r].apply(console,i)}}),()=>t.forEach((e,t)=>{console[e]=n[t]})}var Br=[`states`,`borders`,`provinces`,`burgIcons`,`labels`,`military`,`emblems`],Vr=[`provinces`,`borders`,`labels`,`emblems`],O={burg:{label:`Burg`,layers:[`burgIcons`,`labels`],references:`burg`},state:{label:`State`,layers:Br,references:`state`},province:{label:`Province`,layers:Vr,references:`province`},culture:{label:`Culture`,layers:[`cultures`],references:`culture`},religion:{label:`Religion`,layers:[`religions`],references:`religion`},biome:{label:`Biome`,layers:[`biomes`],references:`biome`},pop:{label:`Rural population`,layers:[`population`]},r:{label:`River`,layers:[`rivers`],references:`river`},fl:{label:`Water flux`,layers:[`rivers`]},conf:{label:`Confluence`,layers:[`rivers`]},routes:{label:`Route links`,layers:[`routes`]}},Hr=[`burgIcons`,`labels`,`emblems`,`population`],Ur={name:[`labels`],fullName:[`labels`],formName:[`labels`],form:[`labels`]},Wr={burg:{"":[...Hr,`goods`],...Ur,group:[`burgIcons`,`labels`],capital:[`burgIcons`,`labels`],port:[`burgIcons`],x:Hr,y:Hr,population:[`population`],production:[`goods`]},state:{"":Br,...Ur,color:[`states`,`military`],military:[`military`]},province:{"":Vr,...Ur,name:[`provinces`,`labels`],color:[`provinces`],center:[`emblems`]},culture:{"":[`cultures`],color:[`cultures`]},religion:{"":[`religions`],color:[`religions`]},biome:{"":[`biomes`],color:[`biomes`]},river:{"":[`rivers`,`labels`],name:[`labels`],type:[`labels`],sourceWidth:[`rivers`],widthFactor:[`rivers`]},route:{"*":[`routes`,`labels`]},feature:{group:[`lakes`],coastline:[`landmass`,`coastline`,`lakes`]},zone:{"*":[`zones`]},marker:{"*":[`markers`]},addedLabel:{"*":[`labels`]},journey:{"*":[`journeys`]},good:{icon:[`goods`],color:[`goods`]},market:{"*":[`markets`]}},Gr={label:[`labels`],coa:[`emblems`],note:[],lock:[]};function Kr({key:e,field:t}){let n=e.split(`:`)[0];if(n===`cells`)return O[t]?.layers??[];let r=Wr[n];if(!r)return[];let i=t.split(`.`)[0];return i===`removed`||!i?r[``]??r[`*`]??[]:r[i]??Gr[i]??r[`*`]??[]}function qr(e){return[...new Set(e.flatMap(Kr))]}var k=class e{pack;lore;styles;constructor(e,t,n){this.pack=e,this.lore=t,this.styles=n}static live(){return new e(globalThis.pack,globalThis.options?.map.lore,globalThis.styles)}static isItem(e){return typeof e==`object`&&!!e&&Number.isInteger(e.i)}draft(){let t=new Set([`v`,`c`,`b`,`p`]),{vertices:n,cells:r,...i}=this.pack,a={...structuredClone(i),vertices:n};return r&&(a.cells=Object.fromEntries(Object.entries(r).map(([e,n])=>[e,t.has(e)?n:ArrayBuffer.isView(n)?n.slice():structuredClone(n)]))),new e(a,this.lore&&structuredClone(this.lore),this.styles&&structuredClone(this.styles))}asLive(t){let n=e.live();this.makeLive();try{return t()}finally{n.makeLive()}}items(e){return C.list(e,this.pack)}cells(e){return this.pack.cells?.[e]}find(t){let n=C.parseKey(t),r=C.collections().find(({type:e})=>e===n?.type),i=r&&this.items(r.field);if(!n||!r||!i)return;let a=n.id,o=i[a],s=e.isItem(o)&&o.i===a?o:i.find(t=>e.isItem(t)&&t.i===a);return{list:i,indexed:r.indexed,i:a,item:s}}exists(e){let t=this.find(e)?.item;return!!(t&&!t.removed)}makeLive(){globalThis.pack=this.pack,this.lore&&globalThis.options&&(globalThis.options.map.lore=this.lore),this.styles&&ve.set(this.styles)}},Jr=e=>typeof e==`object`&&!!e&&!ArrayBuffer.isView(e),A=(e,t)=>e===t||JSON.stringify(e)===JSON.stringify(t);function Yr(e,t){for(let n=e.length-t.length;n>=0;n--)if(t.every((t,r)=>A(e[n+r],t)))return n;return-1}var j=class e{rows;static CELLS=`cells`;static LORE=`lore`;static STYLE=`style`;addedOrRemoved;constructor(e){this.rows=e,this.addedOrRemoved=new Set(e.filter(e=>!e.field||e.field===`removed`).map(e=>e.key))}static record(t,n){return[...e.entityRows(t,n),...e.cellRows(t,n),...e.recordRows(e.LORE,t,n),...e.recordRows(e.STYLE,t,n)]}get keys(){return new Set(this.rows.map(e=>e.key))}get layers(){return qr(this.rows)}get stylePaths(){return this.rows.filter(t=>t.key===e.STYLE).map(e=>e.field.split(`.`))}matches(e,t){let n=t===`before`?`after`:`before`,r=new Set(this.rows.filter(e=>!e.field&&e[n]===void 0).map(e=>e.key));return this.rows.every(n=>{if(!this.rowMatches(e,n,t))return!1;if(n.field||!r.has(n.key))return!0;let{list:i,indexed:a,i:o}=e.find(n.key),s=n.key.split(`:`)[0];return!a||i.every(e=>!k.isItem(e)||e.i<=o||r.has(`${s}:${e.i}`))})}keepsReferencesIntact(t,n){let r=this.addedOrRemoved.size?this.writtenDraft(t,n):t,i=[...this.keys].filter(t=>t!==e.CELLS&&!e.isRecord(t)).filter(e=>!r.exists(e));return i.some(e=>!this.addedOrRemoved.has(e))?!1:this.pointsOnlyAtExisting(r,n)&&this.nothingPointsAt(r,new Set(i))}writeTo(e,t){let n=t===`after`?this.rows:[...this.rows].reverse();for(let r of n)this.writeRow(e,r,t)}static entityRows(t,n){let r=[],i=(e,t)=>new Map((e.items(t)??[]).filter(k.isItem).map(e=>[e.i,e]));for(let{type:a,field:o,indexed:s}of C.collections()){let[c,l]=[i(t,o),i(n,o)];for(let i of new Set([...c.keys(),...l.keys()])){let u=`${a}:${i}`,[d,f]=[c.get(i),l.get(i)];if(d&&f){for(let t of e.diff(d,f))r.push({key:u,...t});continue}let p={key:u,field:``,before:structuredClone(d),after:f};if(!s){let e=(d?t:n).items(o),r=e.slice(e.indexOf(d??f)+1).filter(k.isItem);p.nextId=(d?r[0]:r.find(e=>c.has(e.i)))?.i??null}r.push(p)}}return r}static cellRows(t,n){let r=[];for(let i of Object.keys(O)){let[a,o]=[t.cells(i),n.cells(i)??{}];if(!a)continue;let s={},c={},l=ArrayBuffer.isView(a)?Array.from(a,(e,t)=>t):[...new Set([...Object.keys(a),...Object.keys(o)])].map(Number);for(let e of l)A(a[e],o[e])||(s[e]=structuredClone(a[e]),c[e]=o[e]);Object.keys(c).length&&r.push({key:e.CELLS,field:i,before:s,after:c})}return r}static recordRows(t,n,r){let i=e.recordOf(n,t);return i?e.diff(i,e.recordOf(r,t)).map(e=>({key:t,...e})):[]}static isRecord(t){return t===e.LORE||t===e.STYLE}static recordOf(t,n){return n===e.LORE?t.lore:t.styles}static diff(t,n,r=[]){return Array.isArray(t)&&Array.isArray(n)&&n.length>t.length&&t.every((e,t)=>A(e,n[t]))?[{field:r.join(`.`),after:n.slice(t.length),append:!0}]:Jr(t)&&Jr(n)&&Array.isArray(t)===Array.isArray(n)&&(!Array.isArray(t)||t.length===n.length)?[...new Set([...Object.keys(t),...Object.keys(n)])].flatMap(i=>e.diff(t[i],n[i],[...r,i])):A(t,n)?[]:[{field:r.join(`.`),before:structuredClone(t),after:n}]}rowMatches(t,n,r){let i=n[r];if(n.key===e.CELLS){let e=t.cells(n.field);return!!e&&Object.entries(i).every(([t,n])=>A(e[+t],n))}let a=e.isRecord(n.key)?void 0:t.find(n.key),o=e.isRecord(n.key)?e.recordOf(t,n.key):a?.item;if(!n.field)return!!a&&A(o,i);if(!o)return!1;let s=n.field.split(`.`).reduce((e,t)=>Jr(e)?e[t]:void 0,o);return n.append?Array.isArray(s)&&(r===`before`||Yr(s,i)>=0):A(s,i)}writtenDraft(e,t){let n=e.draft();return this.writeTo(n,t),n}pointsOnlyAtExisting(t,n){let r=e=>t.exists(e);return this.rows.every(i=>{let a=i[n];if(e.isRecord(i.key))return!0;if(i.key===e.CELLS)return Object.values(a).every(t=>e.everyId(O[i.field]?.references,t,r));if(!t.exists(i.key))return!0;let o=i.key.split(`:`)[0];return(i.field?[[i.field.split(`.`)[0],a]]:Object.entries(a)).every(([t,n])=>e.everyId(C.referenceType(o,t),n,r))})}nothingPointsAt(t,n){if(!n.size)return!0;let r=e=>!n.has(e);for(let{field:n,references:i={}}of C.collections()){let a=Object.entries(i);if(a.length){for(let i of t.items(n)??[])if(!(!k.isItem(i)||i.removed)&&!a.every(([t,n])=>e.everyId(n,i[t],r)))return!1}}return Object.entries(O).every(([n,{references:i}])=>!i||Object.values(t.cells(n)??{}).every(t=>e.everyId(i,t,r)))}static everyId(t,n,r){return t?Array.isArray(n)?n.every(n=>e.everyId(t,n,r)):!n||typeof n!=`number`||r(`${t}:${n}`):!0}writeRow(t,n,r){let i=n[r];if(n.key===e.CELLS){let e=t.cells(n.field);for(let[t,n]of Object.entries(i))n===void 0?delete e[+t]:e[+t]=structuredClone(n);return}let{list:a,i:o,item:s}=e.isRecord(n.key)?{list:[],i:0,item:e.recordOf(t,n.key)}:t.find(n.key);if(!n.field){if(s&&a.splice(a.indexOf(s),1),i===void 0)return;let e=a.findIndex(e=>k.isItem(e)&&(n.nextId===void 0?e.i>o:e.i===n.nextId));a.splice(e<0?a.length:e,0,structuredClone(i));return}let c=n.field.split(`.`),l=c.pop(),u=s;for(let e of c)Jr(u[e])||(u[e]={}),u=u[e];if(n.append){let[e,t]=[u[l],n.after];r===`after`?e.push(...structuredClone(t)):e.splice(Yr(e,t),t.length);return}i===void 0?delete u[l]:u[l]=structuredClone(i)}},Xr={apply:{from:`proposed`,expects:`before`,writes:`after`,to:`applied`},undo:{from:`applied`,expects:`after`,writes:`before`,to:`undone`},redo:{from:`undone`,expects:`before`,writes:`after`,to:`applied`}},M=new class{prepare(e){return Yt.preload(e)}propose(e,t,n,r){let i=this.parse(t);if(typeof i==`string`)return i;let a=k.live(),o=a.draft(),s,c;try{[s,c]=o.asLive(()=>{let e=[];for(let{op:t,args:n}of i)e.push($t(t,this.resolve(n,e)));let t=j.record(a,o);return[t,new Map(t.map(({key:e})=>[e,this.name(e)]))]})}catch(e){return g(e)}if(!s.length)return`These operations change nothing`;let l=s.find(e=>e.key===j.STYLE&&Be(e.field.split(`.`))===`regenerateRelief`);return l?`${l.field} regenerates every relief icon, which Undo cannot restore: the user changes it in the Style tab`:{number:n,mapId:r,summary:e,operations:i,change:s.map(e=>({...e,entity:this.label(e.key,c.get(e.key))})),state:`proposed`}}ready(e,t,n){let{from:r,expects:i}=Xr[e];return t.state!==r||t.mapId!==n?!1:new j(t.change).matches(k.live(),i)}can(e,t,n){return this.ready(e,t,n)?new j(t.change).keepsReferencesIntact(k.live(),Xr[e].writes):!1}run(e,t,n){if(!this.can(e,t,n))return!1;let r=new j(t.change);return r.writeTo(k.live(),Xr[e].writes),t.state=Xr[e].to,this.refresh(r),!0}discard(e){e.state===`proposed`&&(e.state=`discarded`)}parse(e){if(!Array.isArray(e)||!e.length)return`Propose at least one operation`;let t=[];for(let n of e){let{op:e,args:r=[]}=n??{};if(typeof e!=`string`||!Qt.has(e))return`Unknown operation ${JSON.stringify(e)}. Registered operations: ${[...Qt].join(`, `)}`;if(!Array.isArray(r))return`The args of ${e} must be a list, in the order of its parameters`;t.push({op:e,args:r})}return t}resolve(e,t){if(Array.isArray(e))return e.map(e=>this.resolve(e,t));if(typeof e!=`object`||!e||!Number.isInteger(e.result))return e;let{result:n,type:r,...i}=e;if(Object.keys(i).length||r!==void 0&&typeof r!=`string`)return e;if(n<0||n>=t.length)throw Error(`{ result: ${n} } must name an earlier operation of the batch, counted from 0`);if(t[n]===void 0)throw Error(`Operation ${n} returns nothing to refer to`);return r===void 0?t[n]:`${r}:${t[n]}`}name(e){let t=C.parseKey(e);return t?C.getName(t):``}label(e,t){if(e===j.LORE)return`Map lore`;if(e===j.STYLE)return`Style`;let n=C.parseKey(e);if(!n)return`Cells`;let{kind:r}=C.getDisplay(n),i=this.name(e)||t;return i?`${r}: ${i}`:r}refresh(e){oe.draw(...e.layers),this.refreshStyle(e.stylePaths),ye();for(let t of e.keys)this.refreshNameInputs(t);document.getElementById(`notesEditor`)&&S.NotesEditor.refresh(),e.keys.has(j.LORE)&&(ie.save(),document.getElementById(`loreEditor`)&&S.LoreEditor.refresh())}refreshStyle(e){if(!e.length)return;let t=new Set,n=!1;for(let r of e){let e=Be(r);r.includes(`attrs`)&&ve.writeAttr(r),r.at(-1)===`scheme`&&a.ensure(_e(styles,r)),e===`zoom`&&(n=!0),e===`draw`&&oe.has(r[0])&&t.add(r[0])}oe.draw(...t),n&&fe(),document.getElementById(`styleForm`)?.childElementCount&&S.StyleEditor.refresh()}refreshNameInputs(e){let t=C.parseKey(e),n=t&&C.get(t);if(!t||!n)return;let r=n.name??``;if(t.type===`state`||t.type===`province`){if(document.getElementById(`${t.type}NameEditor`)?.dataset[t.type]!==String(t.id))return;let e=document.getElementById(`${t.type}NameEditorShort`),i=document.getElementById(`${t.type}NameEditorFull`);e&&(e.value=r),i&&(i.value=n.fullName??r)}else{let n=document.getElementById(`${t.type}Editor`),i=document.getElementById(`${t.type}Name`);n?.dataset.entity===e&&i&&(i.value=r)}}},Zr=8,Qr={proposed:`apply`,applied:`undo`,undone:`redo`},$r={fullName:`Full name`,"label.text":`Label`},ei=new Set([`treasury`,`pollTax`]),ti=new Set([`pole`,`center`,`cells`,`neighbors`]),ni={burg:[`group`,`population`,`port`,`capital`],state:[`form`,`culture`],province:[`state`,`burg`],culture:[`type`],religion:[`type`,`culture`],marker:[`type`]},ri=new Set([`groups`,`attrs`,`options`]),ii=/^#[0-9a-f]{3,8}$/i,N=(e,t)=>`${v(e)} ${t}${e===1?``:`s`}`,ai=new class{html(e,t,i){let{change:a,state:o}=e,s=this.displayRows(a),c=[];for(let e of s.slice(0,Zr)){let t=c.at(-1);t?.[0].key===e.key?t.push(e):c.push([e])}let l=s.length-Zr,u=`${c.map(e=>`<div class="assistantChangeEntity">
          <div class="assistantChangeName">${n(this.entityLabel(e[0]))}${this.entityIcon(e[0])}${this.wholeTag(e[0])}</div>
          ${e.map(e=>this.rowHtml(e)).join(``)}
        </div>`).join(``)}${l>0?`<div class="assistantChangeMore">… ${l} more change${l===1?``:`s`}</div>`:``}`,d=new Set(s.map(e=>e.key)).size,f=`${N(s.length,`change`)}${d>1?` · ${d} entities`:``}`,p=(e,n,r,i=!1)=>`<button type="button" class="assistantButton${i?` assistantPrimary`:``}" data-action="${e}" data-index="${t}" ${r?``:`disabled`}>${n}</button>`,m=Qr[o],h=!!(m&&M.ready(m,e,i)),g=m?p(m,h?r(m):`Changed since`,h,o===`proposed`):``,_=o===`proposed`;return`<div class="assistantItem assistantProposal ${o}">
      <div class="assistantProposalHeader">
        <span class="assistantProposalState">${r(o)}</span>
        <span class="assistantProposalSummary">${n(e.summary)}</span>
        ${_?``:g}
      </div>
      ${_?`<div class="assistantProposalBody">${u}</div>
        <div class="assistantProposalFooter"><span>${f}</span><span class="assistantProposalActions">${p(`discard`,`Discard`,!0)}${g}</span></div>`:`<details class="assistantProposalBody"><summary>Show ${f}</summary>${u}</details>`}
    </div>`}text(e,t=20){let n=this.displayRows(e),r=n.slice(0,t).map(e=>{if(!e.field&&e.before===void 0)return[`${e.entity}: added`,...this.addedFields(e).map(([e,t])=>`${e}: ${t}`)].join(` · `);if(!e.field)return`${e.entity}: removed`;if(e.field===`coa`)return`${e.entity} · Emblem: redrawn`;if(e.key===`cells`)return`Cells · ${O[e.field]?.label??e.field}: ${N(Object.keys(e.after).length,`cell`)}`;if(e.field===`note`)return`${e.entity} · Note: rewritten`;if(e.append)return`${this.entityLabel(e)} · ${this.fieldLabel(e)}: + ${this.addedText(e)}`;let[t,n]=[this.valueText(e,e.before),this.valueText(e,e.after)];return`${this.entityLabel(e)} · ${this.fieldLabel(e)}: ${t??`none`} → ${n??`none`}`}),i=n.length-t;return r.join(`
`)+(i>0?`\n… ${i} more`:``)}displayRows(e){let t=this.wholeRows(e),n=new Set,r=t.flatMap(e=>e.field!==`coa`&&!e.field.startsWith(`coa.`)?[e]:n.has(e.key)?[]:(n.add(e.key),[{...e,field:`coa`,before:void 0,after:void 0}])),i=r.filter(e=>!(e.key.includes(`:`)&&ti.has(e.field.split(`.`)[0])));return i.length?i:r}wholeRows(e){let t=new Map;for(let n of e)n.field?n.field===`removed`&&n.after===!0&&!n.before&&t.set(n.key,{...n,field:``,before:!0,after:void 0}):t.set(n.key,n);let n=new Set;return e.flatMap(e=>{let r=t.get(e.key);return r?n.has(e.key)?[]:(n.add(e.key),[r]):[e]})}rowHtml(e){let{key:t,field:i,before:a,after:o}=e,s=(e,t,n=``)=>`<div class="assistantChangeField">
      <span>${e}</span>
      <span>${t}</span>
      ${n}
    </div>`;if(!i){let t=this.notePreview(a===void 0?o?.note:void 0);return(a===void 0?this.addedFields(e):[]).map(([e,t])=>s(n(e),n(t))).join(``)+t}if(i===`coa`)return s(`Emblem`,`redrawn`);if(t===`cells`)return s(O[i]?.label??r(i),N(Object.keys(o).length,`cell`));let c=n(this.fieldLabel(e));if(e.append)return s(c,`<ins>+ ${n(this.addedText(e))}</ins>`);if(i===`note`){let e=e=>typeof e==`string`&&e?N(e.length,`character`):`empty`;return s(c,`<del>${e(a)}</del><i>→</i><ins>${e(o)}</ins>`,this.notePreview(o))}let l=t=>{let r=this.valueText(e,t);return r===null?`<em>none</em>`:(ii.test(r)?`<span class="assistantSwatch" style="background:${r}"></span>`:``)+n(r)};return s(c,`<del>${l(a)}</del><i>→</i><ins>${l(o)}</ins>`)}fieldLabel(e){if(this.isChronicle(e))return`Entries`;if(e.key===`style`){let[t,...n]=e.field.split(`.`);return[de(t),...n.filter(e=>!ri.has(e)).map(e=>r(e.replace(/[-_]/g,` `).replace(/([a-z])([A-Z])/g,`$1 $2`).toLowerCase()))].join(` · `)}let t=e.key.startsWith(`state:`)&&e.field.match(/^diplomacy\.(\d+)$/);return t?`Relation to ${this.entityName(`state:${t[1]}`)||`state ${t[1]}`}`:$r[e.field]??r(e.field.replace(/\./g,` `).replace(/([a-z])([A-Z])/g,`$1 $2`).toLowerCase())}valueText(e,t){let{key:n,field:r}=e;if(t==null||t===``)return null;let i=n.slice(0,n.indexOf(`:`));if(typeof t==`number`){if(r===`population`&&i===`burg`)return v(u(0,t));if(r===`rural`)return v(u(t,0));if(r===`urban`)return v(u(0,t));if(ei.has(r)||r===`value`&&i===`good`)return _(t);if(r===`salesTax`)return`${s(t*100,2)}%`;if((r===`capital`||r===`port`)&&i===`burg`)return t?`yes`:`no`;if(r===`area`)return`${v(o(t))} ${m()}`;let e=C.referenceType(i,r);if(e)return this.entityName(`${e}:${t}`)||String(t)}if(Array.isArray(t))return this.isChronicle(e)?String(t.length):N(t.length,`item`);let a=typeof t==`string`?t:JSON.stringify(t);return a.length>80?`${a.slice(0,80)}…`:a}entityLabel(e){return this.isChronicle(e)?`Chronicle`:e.entity}addedFields(e){let t=e.after;return(ni[e.key.split(`:`)[0]]??[]).flatMap(n=>{let r=t?.[n],i=r?this.valueText({...e,field:n},r):null;return i===null?[]:[[this.fieldLabel({...e,field:n}),i]]})}addedText(e){let t=e.after;return this.isChronicle(e)?t.map(e=>e[0]).join(`, `):N(t.length,`item`)}entityIcon({key:e,field:t,before:n,after:r}){let i=t?void 0:r??n,a=this.refOf(e),o=typeof i==`object`?i?.icon:a&&C.get(a)?.icon;return typeof o==`string`&&o?` ${se.html(o)}`:``}wholeTag({field:e,before:t}){if(e)return``;let n=t===void 0;return`<span class="assistantChangeTag ${n?`add`:`remove`}">${n?`Add`:`Remove`}</span>`}notePreview(e){if(typeof e!=`string`||!e)return``;if(!pe(e))return`<div class="assistantNotePreview">${n(e)}</div>`;let t=document.createElement(`template`);t.innerHTML=e;for(let e of t.content.querySelectorAll(`img`))e.replaceWith(`[${e.alt||`image`}]`);return`<div class="assistantNotePreview">${t.innerHTML}</div>`}isChronicle({key:e,field:t}){return e===`state:0`&&t===`diplomacy`}refOf(e){return globalThis.pack?C.parseKey(e):void 0}entityName(e){let t=this.refOf(e);return t?C.getName(t):``}},oi=80;function si(e,n,r=!1){if(!e.length)return;let[i,a,o,s]=t(e),c=r?1:1.3,l=[Math.max(o-i,r?1:oi)*c,Math.max(s-a,r?1:oi)*c],u=n.width/n.height;l=l[0]/l[1]<u?[l[1]*u,l[1]]:[l[0],l[0]/u];let d=(e,t,n)=>t>=n?n/2:Math.min(Math.max(e,t/2),n-t/2),f=d((i+o)/2,l[0],options.map.graph.width),p=d((a+s)/2,l[1],options.map.graph.height);return{x0:f-l[0]/2,y0:p-l[1]/2,x1:f+l[0]/2,y1:p+l[1]/2,...n}}var ci=4e3,li=50,ui=30;function di(){return typeof mapHistory>`u`?0:mapHistory.at(-1)?.created??0}function fi(){return typeof options>`u`?`Unnamed map`:options.map.lore.name||`Unnamed map`}async function pi(e){if(typeof pack>`u`||!pack.cells)return`# Current map

No map is loaded yet.`;let t=e=>e?.filter(e=>e.i&&!e.removed).length??0,{distance:n,height:r,temperature:i}=options.map.units,a=[`name: ${fi()} (the world itself, not an entity: never link it)`,`seed: ${options.map.seed}`,`size: ${s(options.map.graph.width*n.scale)} × ${s(options.map.graph.height*n.scale)} ${n.unit}`,`units: 1 map unit = ${n.scale} ${n.unit}; 1 map unit² = ${s(o(1),4)} ${m()}; elevation in ${r.unit}; temperature in ${i.unit}`,`cells: ${pack.cells.i.length}`,`states: ${t(pack.states)}`,`burgs: ${t(pack.burgs)}`,`provinces: ${t(pack.provinces)}`,`cultures: ${t(pack.cultures)}`,`religions: ${t(pack.religions)}`,`rivers: ${pack.rivers?.length??0}`,`markers: ${pack.markers?.length??0}`,`chronicle entries: ${pack.states[0]?.diplomacy?.length??0} (\`States.getChronicle()\`: entries as text lines, the first the title; HTML-escaped)`],c=pack.states.flatMap(e=>e.i&&!e.removed?(e.diplomacy??[]).flatMap((t,n)=>t===`Vassal`?[`${e.name} (state:${e.i}) of ${pack.states[n]?.name} (state:${n})`]:[]):[]);return c.length&&a.push(`vassals: ${c.join(`; `)}`),[`# Current map\n\n${a.map(e=>`- ${e}`).join(`
`)}`,await hi(),mi(e)].filter(Boolean).join(`

`)}function mi(e){let t=e.items.findLastIndex(e=>e.kind===`question`),n=e.items.slice(0,t<0?void 0:t).flatMap(e=>e.kind===`proposal`?[e.proposal]:[]).slice(-20);if(!n.length)return null;let r={proposed:`waiting for the user`,applied:`applied`,undone:`applied, then undone`,discarded:`discarded`};return`# Proposals in this chat\n\n${n.map(({number:e,summary:t,state:n})=>`- #${e} ${r[n]}: ${t}`).join(`
`)}`}async function hi(){let e=await S.NotesEditor.current();if(!e)return null;let t=await S.NotesEditor.getSelectionHtml(),n=[`# Notes editor`,``,`The notes editor is open on note \`${e.id}\` ("${e.name}"). To rewrite it, propose \`Notes.write\` with the key \`${e.id}\`.`,``,`Current note HTML:`,"```html",gi(e),"```"];return t&&n.push(``,`The user has this part selected:`,"```html",t,"```"),n.join(`
`)}function gi(e){if(!e.legend)return`(empty)`;if(e.legend.length<=ci)return e.legend;let t=e.legend.length-ci;return`${e.legend.slice(0,ci)}\n… ${t} more characters — read the entity's .note field with read_map for the rest (entity key: ${e.id})`}var _i={si:v,rn:s,getArea:o,getAreaUnit:m,getDistance:c,getDistanceUnit:f,getHeight:h,convertTemperature:p,getPrecipitation:l,formatSpeed:d,formatPrice:_,getPeople:u},vi=[`state`,`province`,`burg`,`culture`,`religion`,`river`,`marker`,`feature`,`zone`,`route`,`good`],yi=40,bi=/[\p{L}\p{N}]/u;function xi(e,t){for(let n=e.indexOf(t);n>=0;n=e.indexOf(t,n+1))if(!bi.test(e[n-1]??``)&&!bi.test(e[n+t.length]??``))return n;return-1}function Si(e){let t=new Map;for(let n of vi)for(let{ref:r,entity:i}of C.collect(n)){let{name:n}=i;if(typeof n!=`string`||n.length<3)continue;let a=t.get(n)?.at??xi(e,n);if(a<0)continue;let o=t.get(n)??{at:a,keys:[]};o.keys.push(C.key(r)),t.set(n,o)}let n=[...t].sort(([,e],[,t])=>e.at-t.at).slice(0,yi).map(([e,{keys:t}])=>`${e}: ${t.join(`, `)}`);return n.length?`\n# Keys of the names above\n${n.join(`
`)}`:``}var Ci={status:`Reading the map`,definition:{name:`read_map`,description:`Run read-only JavaScript in the page. Return the result; describe(value) inspects a value. Scripts may call downloadFile for CSV or JSON. The result ends with the keys of map entities it names.`,input_schema:{type:`object`,properties:{code:{type:`string`}},required:[`code`]}},async handle(e){let t=typeof e.code==`string`?e.code:``,n=await Ar(t,{units:_i});if(!n.ok)return{content:n.error?.message||`Script failed`,item:{kind:`step`,code:t,result:n},isError:!0};let r=`${n.value}\n${n.logs.join(`
`)}`;return{content:r+Si(r),item:{kind:`step`,code:t,result:n}}}},wi={type:`array`,items:{type:`object`,properties:{op:{type:`string`},args:{type:`array`,items:{description:`A number, string, boolean or array, or { result: n }: what operation n returned`}}},required:[`op`,`args`]}},Ti=new Set([`population`,`rural`,`urban`]),Ei=({field:e,before:t,after:n})=>Ti.has(e)&&typeof t==`number`&&typeof n==`number`&&t>0&&n>0&&Math.max(n/t,t/n)>=100;function Di(e){let t=0,n=``;return{status:`Preparing a change`,definition:{name:`propose_change`,description:`Propose one batch of registered operations. It never changes the map: the user previews the batch and applies or discards it.`,input_schema:{type:`object`,properties:{summary:{type:`string`},operations:wi},required:[`summary`,`operations`]}},async handle(r){let i=Math.max(t,e.items.filter(e=>e.kind===`proposal`).length)+1,a=typeof r.summary==`string`&&r.summary.trim()?r.summary.trim():`Change`;await M.prepare(r.operations);let o=M.propose(a,r.operations,i,di());if(typeof o==`string`)return{content:o,isError:!0};let s=o.change.filter(Ei),c=JSON.stringify(o.operations);if(s.length&&c!==n)return n=c,{content:`Nothing proposed: these populations change 100-fold or more, as if given in points instead of people. Fix the amounts, or send the same batch again if this is meant:\n${ai.text(s)}`,isError:!0};t=i;let l=o.change.length;return{content:`Proposal #${i} (${l} change${l===1?``:`s`}) is waiting for the user to apply or discard it. Nothing has changed yet. Check its change does what was asked, as the user sees it:\n${ai.text(o.change)}`,item:{kind:`proposal`,proposal:o}}}}}var P=e=>typeof e==`string`?e.trim():``,Oi=e=>P(e).replace(/\[([^\]]*)\]\([^)]*\)/g,`$1`),ki=([e,t,n,r])=>n-e<=options.map.graph.width/2&&r-t<=options.map.graph.height/2,F=e=>`No entity ${e} on this map. Keys are type:id, e.g. burg:12`,Ai=Object.entries({entities:{description:`Show several map entities as a list the user can locate and ring on the map. Use it instead of a Markdown list whenever an answer names 3 or more entities (which, list, find, where are…).`,input_schema:{type:`object`,properties:{title:{type:`string`},entities:{type:`array`,items:{type:`string`}}},required:[`title`,`entities`]},parse(e){let t=Array.isArray(e.entities)?e.entities.map(String):[];if(!t.length||t.length>li)return`entities takes 1 to ${li} keys`;let n=t.find(e=>!C.resolveKey(e));return n?F(n):{type:`entities`,title:Oi(e.title)||`Entities`,entities:t}}},card:{description:`Show a state's profile card: emblem, full name and form, capital, population, area, burgs, culture, religion and the start of its note. Use it whenever one state is the subject (tell me about, describe, overview, who rules), then add only what the card does not say.`,input_schema:{type:`object`,properties:{entity:{type:`string`}},required:[`entity`]},parse(e){let t=P(e.entity);return C.resolveKey(t)?t.startsWith(`state:`)?{type:`card`,entity:t}:`Cards show states for now`:F(t)}},chart:{description:`Show numbers you computed with read_map as a chart. bar: one measure compared or ranked across items (largest states, burgs by population, top religions). pie: parts of one whole (population by culture, land by biome), given as amounts, not percentages: the chart computes shares. unit names the amounts (people, mi²); "money" for prices, treasuries and taxes. Prefer it to a table when each item has one number.`,input_schema:{type:`object`,properties:{chart:{type:`string`,enum:[`bar`,`pie`]},title:{type:`string`},unit:{type:`string`},rows:{type:`array`,items:{type:`object`,properties:{label:{type:`string`},value:{type:`number`},entity:{type:`string`}},required:[`label`,`value`]}}},required:[`chart`,`title`,`rows`]},parse(e){if(e.chart!==`bar`&&e.chart!==`pie`)return`chart is bar or pie`;let t=Array.isArray(e.rows)?e.rows:[];if(!t.length||t.length>ui)return`rows takes 1 to ${ui} items`;let n=[];for(let e of t){let{label:t,value:r,entity:i}=e??{};if(!P(t)||typeof r!=`number`||!Number.isFinite(r)||r<0)return`Each row needs a label and a non-negative number value, got ${JSON.stringify(e)}`;if(i!==void 0&&!C.resolveKey(i))return F(i);n.push(i===void 0?{label:P(t),value:r}:{label:P(t),value:r,entity:String(i)})}if(e.chart===`pie`&&!n.some(e=>e.value>0))return`A pie needs amounts that add up to more than 0`;let r=P(e.unit);return{type:`chart`,chart:e.chart,title:Oi(e.title)||`Chart`,...r&&{unit:r},rows:n}}},choices:{description:`Offer 2-4 alternatives for the user to pick: name ideas, options, directions. Give a choice operations (as in propose_change) when picking it should change the map, such as one rename per name idea; otherwise its label becomes the user's next question. Use it instead of listing suggestions, then stop and wait.`,input_schema:{type:`object`,properties:{title:{type:`string`},choices:{type:`array`,items:{type:`object`,properties:{label:{type:`string`},operations:wi},required:[`label`]}}},required:[`title`,`choices`]},parse(e){let t=Array.isArray(e.choices)?e.choices:[];if(t.length<2||t.length>4)return`choices takes 2 to 4 options`;let n=[];for(let[e,r]of t.entries()){let{label:t,operations:i}=r??{};if(!P(t))return`Choice ${e+1} needs a label`;if(i===void 0||Array.isArray(i)&&!i.length){n.push({label:P(t)});continue}let a=M.propose(P(t),i,0,di());if(typeof a==`string`)return`Choice ${e+1}: ${a}`;n.push({label:P(t),operations:a.operations})}return{type:`choices`,title:Oi(e.title)||`Choose one`,choices:n}}},inset:{description:`Show a picture of a small part of the map (at most half its width and height) around an entity key, or a box [x0, y0, x1, y1] in map units; clicking it zooms the map there. Use it when an answer is about where something is or what a place is like.`,input_schema:{type:`object`,properties:{title:{type:`string`},entity:{type:`string`},box:{type:`array`,items:{type:`number`}}}},parse(e){let n=Oi(e.title);if(e.entity!==void 0){let r=P(e.entity),i=C.resolveKey(r);if(!i)return F(r);let a=C.getPoints(i);return a.length?ki(t(a))?{type:`inset`,title:n||C.getName(i),entity:r}:`${r} covers too much of the map for an inset`:`${r} has no place on the map`}let r=Array.isArray(e.box)?e.box:[],{width:i,height:a}=options.map.graph,[o,s,c,l]=r;return r.length!==4||!r.every(Number.isFinite)||c<=o||l<=s||c<0||l<0||o>i||s>a?`An inset takes an entity key or a box [x0, y0, x1, y1] in map units within ${i} × ${a}`:ki([o,s,c,l])?{type:`inset`,title:n||`Map`,box:[o,s,c,l]}:`An inset shows a small part of the map, not most of it`}},source:{description:`Link the wiki page an answer from read_help came from, so the user can read more. page is the part of a section heading before " › ", or "Knowledge Base".`,input_schema:{type:`object`,properties:{page:{type:`string`}},required:[`page`]},parse(e){let t=P(e.page).replace(/[\s-]+/g,` `).toLowerCase(),n=wn.find(e=>e.replace(/-/g,` `).toLowerCase()===t);return n?{type:`source`,page:n}:`No wiki page "${P(e.page)}". Pages: ${wn.join(`, `)}`}}}).map(([e,{parse:t,...n}])=>({definition:{name:`show_${e}`,...n},status:`Preparing a widget`,async handle(e){await M.prepare(e);let n=t(e);return typeof n==`string`?{content:n,isError:!0}:{content:n.type===`choices`?`The choices are waiting for the user. Stop here: their pick arrives as a proposal or as their next question.`:`Shown the ${n.type} widget to the user`,item:{kind:`widget`,widget:n}}}})),ji=[`state`,`province`,`burg`],Mi=256,Ni={status:`Looking at the emblem`,definition:{name:`view_emblem`,description:`See the emblem (coat of arms) of a state, province or burg as an image, to describe it or match lore to it. The user sees it too.`,input_schema:{type:`object`,properties:{entity:{type:`string`}},required:[`entity`]}},async handle(e){let t=P(e.entity);if(!ji.some(e=>t.startsWith(`${e}:`)))return{content:`Emblems belong to states, provinces and burgs`,isError:!0};let n=C.resolveKey(t);if(!n)return{content:F(t),isError:!0};let r=C.get(n).coa;if(!r)return{content:`${t} has no emblem`,isError:!0};let{emblemPng:i}=await x(async()=>{let{emblemPng:e}=await import(`./emblem-image-D_ivI1wt.js`);return{emblemPng:e}},__vite__mapDeps([58,4,1,5,2,6,7,8,9,10,11,12,13,14,15,16,17,18,59,52])),a=await i(`${n.type}COA${n.id}`,r,Mi);return{content:[{type:`text`,text:`The emblem of ${C.getName(n)}`},kt(a)],item:{kind:`widget`,widget:{type:`emblem`,entity:t}}}}},Pi=1024,Fi=(e,t)=>{let n=Pi/Math.max(e,t);return{width:Math.round(e*n),height:Math.round(t*n)}};function Ii(e){let{width:t,height:n}=options.map.graph;if(e===`map`)return{x0:0,y0:0,x1:t,y1:n,...Fi(t,n)};if(e===`view`){let{scale:e,x:t,y:n}=ue,[r,i]=[-t/e,-n/e],[a,o]=[r+ue.width/e,i+ue.height/e];return{x0:r,y0:i,x1:a,y1:o,...Fi(a-r,o-i)}}let r=C.resolveKey(e);return r?si(C.getPoints(r),Fi(16,10))??`${e} has no place on the map`:F(e)}var Li={status:`Looking at the map`,definition:{name:`view_map`,description:`See the map as the user sees it, in its current style and visible layers: an entity framed, "view" for what the user has on screen, or "map" for the whole map. For looks, shapes and layout; read names and numbers with read_map.`,input_schema:{type:`object`,properties:{target:{type:`string`,description:`An entity key, "view" or "map"`}},required:[`target`]}},async handle(e){let t=P(e.target)||`view`,n=Ii(t);if(typeof n==`string`)return{content:n,isError:!0};let{ExportMap:r}=await x(async()=>{let{ExportMap:e}=await import(`./export-BlirpLlw.js`).then(e=>e.t);return{ExportMap:e}},__vite__mapDeps([59,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,52])),i=await r.getRegionImage(n,1,`image/jpeg`);return{content:[{type:`text`,text:`${t===`map`?`The whole map`:t===`view`?`The user's view`:`The map around ${t}`}.${typeof Layers>`u`?``:` Visible layers: ${Layers.state.active.join(`, `)}.`}`},kt(i)]}}};function Ri(e){return[Ci,Di(e),...Ai,Ni,Li]}var I={id:di,name:fi,context:pi,tools:Ri},zi=240,Bi=`money`,Vi={width:480,height:300},Hi=new WeakMap,Ui=0,Wi=null,Gi=()=>document.getElementById(`assistant`)?.closest(`.ui-dialog`)?.getBoundingClientRect();function Ki(e){let t=De.find(t=>t.id===e);return t&&Oe(t)?t:void 0}function qi(e){let t=e.type===`good`?C.get(e):void 0;return t?`<svg class="assistantGood" viewBox="0 0 100 100" aria-hidden="true">${ae(t)}</svg>`:`<span class="${C.getDisplay(e).icon}" aria-hidden="true"></span>`}var Ji=(e,t)=>`<button type="button" class="assistantEntity" data-action="entity" data-id="${C.key(e)}" data-tip="Show on the map">${qi(e)}${t}</button>`;function Yi(e,t,r=``){let i=t?C.resolveKey(e):void 0;return i?Ji(i,n(C.getName(i)||r)):n(r)}function Xi(e){return(t,n)=>{if(n.startsWith(`command:`)){let e=Ki(n.slice(8));return e?ta(e.id,t):t}if(!n.includes(`:`)||!be(n.split(`:`)[0]))return null;let r=e?C.resolveKey(n):void 0;return r&&ea(r,t)?Ji(r,t):t}}var Zi=`(?:${[...Se,...xe].join(`|`)}):\\d+(?:-\\d+)?`,Qi=RegExp(`\`[^\`\\n]*\`|\\[(${Zi})\\]\\(\\1\\)|\\[[^\\]\\n]*\\]\\([^)\\s]*\\)|\\b(${Zi})\\b`,`g`);function $i(e,t){let n=``,r=0;for(let i of e.matchAll(Qi)){let a=i[1]??i[2];if(!a)continue;let o=i.index,s=o+i[0].length,c=e[o-1]===`(`&&e[s]===`)`;c&&([o,s]=[o-1,s+1]);let l=e.slice(r,o),u=t?C.resolveKey(a):void 0,d=u?[C.get(u)?.name,C.getName(u)]:[],[f]=d.filter(e=>typeof e==`string`&&!!e);if(!c)n+=l+(f?`[${f}](${a})`:i[0]);else{let e=l.match(/[\s*_]*$/)[0],t=l.slice(0,l.length-e.length),r=d.find(e=>typeof e==`string`&&!!e&&t.toLowerCase().endsWith(e.toLowerCase()));n+=r?`${t.slice(0,-r.length)}[${t.slice(-r.length)}](${a})${e.trimEnd()}`:`${t}${e.trimEnd()}`}r=s}return ar(n+e.slice(r),Xi(t))}function ea(e,t){if(xe.includes(e.type))return!0;let r=n(C.getName(e)).toLowerCase(),i=t.replace(/[*_~]/g,``).toLowerCase();return!r||!i||r.includes(i)||i.includes(r)}var ta=(e,t,r=`assistantCommand`)=>`<button type="button" class="${r}" data-action="command" data-id="${e}" data-tip="${n(Ki(e)?.name??``)}">${t}</button>`,L=(e,t,n)=>`<div class="assistantItem assistantWidget">
    <div class="assistantWidgetHeader">${e}</div>
    ${n?``:`<div class="assistantWidgetNote">Its map is not open</div>`}
    ${t}
  </div>`;function na(e,t){return e.type===`card`?aa(e,t.live):e.type===`chart`?fa(e,t.live):e.type===`choices`?ma(e,t):e.type===`inset`?ba(e,t):e.type===`emblem`?sa(e,t.live):e.type===`source`?la(e):ra(e,t)}function ra(e,{index:t,live:r}){let i=e.entities.map(e=>{let t=r?C.resolveKey(e):void 0;if(!t)return`<li class="gone">${n(e)}</li>`;let i=C.getContext(t);return`<li>${Ji(t,n(C.getName(t)||C.getDisplay(t).kind))}${i?`<small>${n(i)}</small>`:``}</li>`}).join(``),a=Wi===e,o=`<button type="button" class="assistantButton" data-action="mark" data-index="${t}" aria-pressed="${a}" ${r?``:`disabled`}>${a?`Hide on map`:`Show on map`}</button>`;return L(`<span>${n(e.title)}</span>${o}`,`<ul>${i}</ul>`,r)}function ia(e){let t=document.createElement(`template`);return t.innerHTML=e,(t.content.textContent??``).replace(/\s+/g,` `).trim()}function aa(e,t){let r=t?C.resolveKey(e.entity):void 0,i=r&&C.get(r);if(!r||!i)return L(`<span>${n(e.entity)}</span>`,t?`<div class="assistantWidgetNote">No longer on this map</div>`:``,t);let a=u(i.rural,i.urban),s=pack.burgs[i.capital],c=s?pack.cells.religion?.[s.cell]:void 0,l=[[`Capital`,s?Yi(`burg:${s.i}`,t,s.name):`none`],[`Population`,v(a)],[`Area`,`${v(o(i.area||0))} ${m()}`],[`Burgs`,String(i.burgs??0)],[`Culture`,Yi(`culture:${i.culture}`,t)],[`Religion`,c?Yi(`religion:${c}`,t):``]],d=i.note?ia(i.note):``,f=d.length>zi?`${d.slice(0,zi)}…`:d;return`<div class="assistantItem assistantWidget assistantCard">
    <div class="assistantCardHead">
      ${oa(`stateCOA${i.i}`,i.coa)}
      <div>
        <strong>${n(i.fullName||i.name)}</strong>
        <small>${n(i.formName||i.form||`State`)}</small>
      </div>
    </div>
    <dl>${l.filter(([,e])=>e).map(([e,t])=>`<dt>${e}</dt><dd>${t}</dd>`).join(``)}</dl>
    ${f?`<p class="assistantCardNote">${n(f)}</p>`:``}
    <div class="assistantActions">
      <button type="button" class="assistantButton" data-action="entity" data-id="${C.key(r)}">Locate</button>
      ${ta(`editStatesButton`,`Edit`,`assistantButton`)}
    </div>
  </div>`}function oa(e,t,n=``){return t&&window.EmblemRenderer?.trigger(e,t),`<svg${n&&` class="${n}"`} viewBox="0 0 200 200" aria-hidden="true"><use href="#${e}"></use></svg>`}function sa(e,t){let r=t?C.resolveKey(e.entity):void 0,i=r&&C.get(r)?.coa;return!r||!i?L(`<span>${n(e.entity)}</span>`,``,t):L(Yi(e.entity,t),oa(`${r.type}COA${r.id}`,i,`assistantEmblem`),!0)}var ca=`https://github.com/Azgaar/Fantasy-Map-Generator/wiki/`;function la({page:e}){return L(`<span>Source</span>`,`<div class="assistantSource">📖 ${`<a href="${ca+encodeURIComponent(e.replace(/ /g,`-`))}" target="_blank" rel="noopener noreferrer">${n(e.replace(/-/g,` `))}</a>`}</div>`,!0)}function ua(e,t){if(t===Bi)return _(e);let r=e>=1e4?v(e):String(s(e,2));return t?`${r} ${n(t)}`:r}function da(e,t){let r=t?C.resolveKey(e.entity):void 0;return r?Ji(r,n(e.label)):n(e.label)}function fa(e,t){let r=`<span>${n(e.title)}</span>`;if(e.chart===`pie`)return L(r,pa(e,t),!0);let i=Math.max(...e.rows.map(e=>e.value),0)||1;return L(r,`<div class="assistantChart">${e.rows.map(n=>`<div class="assistantBar">
        <span>${da(n,t)}</span>
        <span class="assistantBarTrack"><i style="width: ${s(n.value/i*100,2)}%"></i></span>
        <span>${ua(n.value,e.unit)}</span>
      </div>`).join(``)}</div>`,!0)}function pa(e,t){let n=e.rows.reduce((e,t)=>e+t.value,0),r=e=>n?e/n:0,i=e=>Ge[e%Ge.length],a=-Math.PI/2,o=e.rows.map((e,t)=>{let n=r(e.value);if(n>=1)return`<circle r="1" fill="${i(t)}"></circle>`;let o=a;a+=n*Math.PI*2;let[c,l,u,d]=[Math.cos(o),Math.sin(o),Math.cos(a),Math.sin(a)].map(e=>s(e,4));return`<path d="M0 0L${c} ${l}A1 1 0 ${+(n>.5)} 1 ${u} ${d}Z" fill="${i(t)}"></path>`}).join(``),c=e.unit===`%`;return`<div class="assistantPie"><svg viewBox="-1 -1 2 2" aria-hidden="true">${o}</svg><ul>${e.rows.map((n,a)=>`<li${c?``:` data-tip="${ua(n.value,e.unit)}"`}>
        <i style="background: ${i(a)}"></i>${da(n,t)}
        <small>${s(r(n.value)*100,1)}%</small>
      </li>`).join(``)}</ul></div><div class="assistantChartCaption">${c?`Share of the total`:`Share of ${ua(n,e.unit)}`}</div>`}function ma(e,{index:t,live:r,canAsk:i}){let a=e.choices.map((a,o)=>{let s=e.picked===o,c=e.picked===void 0&&(a.operations?r:i),l=a.operations?`Propose this change`:`Ask this`;return`<button type="button" class="assistantButton${s?` assistantPrimary`:``}" data-action="choose" data-index="${t}" data-choice="${o}" data-tip="${l}" aria-pressed="${s}" ${c?``:`disabled`}>${n(a.label)}</button>`}).join(``);return L(`<span>${n(e.title)}</span>`,`<div class="assistantActions assistantChoices">${a}</div>`,!0)}function ha(e){if(e.box)return[e.box.slice(0,2),e.box.slice(2)];let t=C.resolveKey(e.entity);return t?C.getPoints(t):[]}var ga=e=>si(ha(e),Vi,!!e.box);function _a(e,{x0:t,y0:n,x1:r,y1:i}){let a=C.resolveKey(e.entity),o=a&&C.getAnchor(a);if(!o)return``;let s=(r-t)/40;return`<svg viewBox="${t} ${n} ${r-t} ${i-n}" aria-hidden="true"><circle cx="${o[0]}" cy="${o[1]}" r="${s}" fill="none" stroke="#d0240f" stroke-width="${s/4}"></circle></svg>`}var va=(e,{region:t,image:n,failed:r})=>n&&t?`<img src="${n}" alt="" />${_a(e,t)}`:`<span>${r?`Could not draw this part of the map`:`Drawing the map…`}</span>`;async function ya(e,t){try{if(!t.region)throw Error(`No region`);let{ExportMap:e}=await x(async()=>{let{ExportMap:e}=await import(`./export-BlirpLlw.js`).then(e=>e.t);return{ExportMap:e}},__vite__mapDeps([59,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,52]));t.image=await e.getRegionImage(t.region)}catch{t.failed=!0}let n=document.getElementById(t.id);n&&(n.innerHTML=va(e,t))}function ba(e,{index:t,live:r}){let i=`<span>${n(e.title)}</span>`;if(!r)return L(i,``,!1);let a=Hi.get(e);return a||(a={id:`assistantInset${++Ui}`,region:ga(e)},Hi.set(e,a),ya(e,a)),L(i,`<button type="button" id="${a.id}" class="assistantInset" data-action="inset" data-index="${t}" data-tip="Show on the map">${va(e,a)}</button>`,!0)}function xa(e){let t=C.resolveKey(e.entity);t?Ve(t,Gi()):Ue(ha(e),{layers:[],maxScale:20,element:()=>null,cover:Gi()})}function Sa(e){let t=C.resolveKey(e);t&&(Ve(t,Gi())||C.open(t)||le(`This element has no map location`,!1,`warn`,4e3))}function Ca(e){Ki(e)?.run()}function wa(e){if(Wi===e){Ta();return}Wi=He(e.entities.flatMap(e=>C.resolveKey(e)??[]),Gi())?e:null,Wi||le(`These entities have no map location`,!1,`warn`,4e3)}function Ta(){Wi=null,We()}var R={answer:$i,html:na,openEntity:Sa,runCommand:Ca,revealInset:xa,toggleMarks:wa,clearMarks:Ta},z=`assistant`,Ea=2e3,Da=4,Oa=`https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Policy`,ka=`https://discordapp.com/invite/X7E84HU`,Aa=`https://www.patreon.com/azgaar`,B,V=`chat`,H=!1,ja=null,Ma=null,U=null,W=!1,Na=0,Pa=null,G=null,Fa=`Thinking`,K=[],q=()=>qt()?`key`:Je()?b()?`member`:`guest`:null,Ia=e=>e?e.usage.input+e.usage.output+e.usage.cached:0,La=e=>!!(e&&vt(e,q(),I.id())),Ra=()=>document.getElementById(z)!==null,J=!1,za=!1,Y=e=>i(e);function Ba(){J?$(`#${z}`).dialog(`close`):Va()}function Va(){Ra()?($(`#${z}`).dialog(J?`moveToTop`:`open`),J||(J=!0,$a(!za),za=!1),co()):(J=!0,Ha()),ne(!0)}function Ha(){V=`chat`,Ga(),$(`#${z}`).dialog({title:`Azgaar Assistant`,position:{my:`right bottom`,at:`right-16 bottom-44`,of:window},width:Math.min(340,window.innerWidth-24),height:Math.min(580,window.innerHeight-140),minWidth:300,minHeight:320,resizable:!0,close:Ua}),Ka(),Ja()}function Ua(){J=!1,ne(!1),R.clearMarks()}var Wa=`
  <style>
    #assistant.ui-dialog-content { display: flex; flex-direction: column; gap: .5em; overflow: hidden; padding: .6em .7em .5em; font-family: var(--sans-serif); }
    #assistant > * { width: auto; }
    #assistant [hidden] { display: none !important; }
    #assistant button { cursor: pointer; font: inherit; }
    #assistant button:disabled { cursor: default; opacity: .5; }
    #assistant pre, #assistant code { font-family: var(--monospace); }
    .ui-dialog .ui-dialog-titlebar #assistantOpenChats { font-size: .62em; }

    #assistantTranscript, #assistantChats, #assistantKey { flex: 1; min-height: 0; overflow: hidden auto; padding-right: .2em; line-height: 1.45; }

    #assistant .assistantItem { max-width: 92%; margin: 0 0 .7em; overflow-wrap: anywhere; }
    #assistant .assistantItem > :first-child { margin-top: 0; }
    #assistant .assistantItem > :last-child { margin-bottom: 0; }
    #assistant .assistantItem p { margin: .45em 0; }
    #assistant .assistantItem :is(h1, h2, h3, h4, h5, h6) { margin: .7em 0 .3em; font-size: 1em; }
    #assistant .assistantItem :is(ol, ul) { margin: .45em 0; padding-left: 1.3em; }
    #assistant .assistantItem pre { overflow: auto; max-height: 14em; margin: .45em 0; padding: .4em .55em; border-radius: .3em; background: rgb(0 0 0 / 6%); white-space: pre-wrap; }
    #assistant .assistantItem table { display: block; overflow-x: auto; margin: .45em 0; border-collapse: collapse; font-size: .92em; }
    #assistant .assistantItem :is(td, th) { padding: .2em .5em; border: 1px solid rgb(0 0 0 / 14%); }
    #assistant .assistantItem th { background: rgb(0 0 0 / 5%); }

    #assistant .assistantQuestion { width: fit-content; margin-left: auto; padding: .45em .7em; border-radius: .8em .8em .2em .8em; background: var(--header); color: #fff; white-space: pre-wrap; }
    #assistant .assistantQuestionImages { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .3em; }
    #assistant .assistantQuestionImages:not(:last-child) { margin-bottom: .35em; }
    #assistant .assistantQuestionImages img { max-width: 100%; max-height: 8em; border-radius: .4em; }
    #assistant .assistantAnswer { padding: .1em .1em 0; }
    #assistant .assistantWelcome { padding: .6em .75em; border-radius: .5em; background: rgb(0 0 0 / 5%); }

    #assistant .assistantStep { width: fit-content; margin: 0 0 .5em; font-size: .9em; opacity: .75; }
    #assistant .assistantStep summary { cursor: pointer; }
    #assistant .assistantStep.failed summary { color: #a3262e; }
    #assistant .assistantProposal { width: 100%; overflow: hidden; border: 1px solid rgb(0 0 0 / 14%); border-radius: .55em; background: rgb(255 255 255 / 60%); }
    #assistant .assistantProposalHeader { display: flex; align-items: center; gap: .55em; padding: .5em .7em; border-bottom: 1px solid rgb(0 0 0 / 8%); background: rgb(0 0 0 / 3%); }
    #assistant .assistantProposalState { flex: none; padding: .1em .55em; border-radius: 1em; background: var(--header); color: #fff; font-size: .72em; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }
    #assistant .assistantProposal.applied .assistantProposalState { background: #3d7a3a; }
    #assistant .assistantProposal:is(.undone, .discarded) .assistantProposalState { background: rgb(0 0 0 / 40%); }
    #assistant .assistantProposalSummary { flex: 1; font-weight: 600; }
    #assistant .assistantProposalHeader .assistantButton { flex: none; padding: .1em .6em; font-size: .9em; }
    #assistant .assistantProposalBody { display: grid; gap: .55em; padding: .55em .7em; }
    #assistant details.assistantProposalBody:not([open]) { padding-block: .35em; }
    #assistant .assistantProposalBody > summary { cursor: pointer; opacity: .7; font-size: .9em; }
    #assistant .assistantChangeName { display: flex; align-items: center; gap: .35em; margin-bottom: .1em; font-weight: 600; }
    #assistant .assistantChangeName > svg { flex: none; }
    #assistant .assistantChangeTag { margin-left: auto; padding: 0 .5em; border-radius: 1em; font-size: .75em; font-weight: 600; }
    #assistant .assistantChangeTag.add { background: rgb(61 122 58 / 15%); color: #2f6a2c; }
    #assistant .assistantChangeTag.remove { background: rgb(160 40 40 / 12%); color: #8a2a2a; }
    #assistant .assistantChangeField { display: grid; grid-template-columns: 5.5em minmax(0, 1fr); gap: 0 .6em; padding-left: .6em; font-size: .92em; }
    #assistant .assistantChangeField > span:first-child { opacity: .6; }
    #assistant .assistantChangeField del { opacity: .55; }
    #assistant .assistantChangeField i { margin: 0 .35em; font-style: normal; opacity: .45; }
    #assistant .assistantChangeField ins { font-weight: 600; text-decoration: none; }
    #assistant .assistantChangeField em { opacity: .6; }
    #assistant .assistantSwatch { display: inline-block; width: .8em; height: .8em; margin-right: .3em; border: 1px solid rgb(0 0 0 / 25%); border-radius: 2px; vertical-align: -.1em; }
    #assistant .assistantChangeMore { opacity: .6; font-size: .9em; }
    #assistant .assistantNotePreview { contain: paint; grid-column: 1 / -1; max-height: 10em; overflow: auto; margin-top: .35em; padding: .35em .6em; border-radius: .35em; background: rgb(0 0 0 / 4%); }
    #assistant .assistantNotePreview p { margin: .3em 0; }
    #assistant .assistantChangeEntity > .assistantNotePreview { margin: .15em 0 0 .6em; font-size: .92em; }
    #assistant .assistantProposalFooter { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .4em; padding: .4em .7em; border-top: 1px solid rgb(0 0 0 / 8%); }
    #assistant .assistantProposalFooter > span:first-child { opacity: .6; font-size: .88em; }
    #assistant .assistantProposalActions { display: flex; gap: .4em; }
    #assistant :is(.assistantEntity, .assistantCommand) { padding: 0; border: 0; background: none; color: inherit; }
    #assistant .assistantEntity { text-decoration-line: underline; text-decoration-style: dotted; text-underline-offset: 2px; }
    #assistant .assistantEntity:hover { color: var(--header-active); }
    #assistant .assistantEntity > span { display: inline-block; margin-right: .35em; opacity: .55; font-size: .9em; }
    #assistant .assistantEntity > .assistantGood { width: 1.2em; height: 1.2em; margin-right: .3em; vertical-align: -.25em; }
    #assistant .assistantCommand { padding: 0 .4em; border: 1px solid var(--header); border-radius: .35em; }
    #assistant .assistantCommand:hover { background: rgb(0 0 0 / 5%); }
    #assistant .assistantWidget { width: 100%; overflow: hidden; border: 1px solid rgb(0 0 0 / 14%); border-radius: .55em; background: rgb(255 255 255 / 60%); }
    #assistant .assistantWidgetHeader { display: flex; align-items: center; justify-content: space-between; gap: .55em; padding: .4em .7em; border-bottom: 1px solid rgb(0 0 0 / 8%); background: rgb(0 0 0 / 3%); font-weight: 600; }
    #assistant .assistantWidgetHeader .assistantButton { flex: none; padding: .1em .6em; font-size: .9em; font-weight: normal; }
    #assistant .assistantWidgetHeader .assistantButton[aria-pressed="true"] { background: var(--header); color: #fff; }
    #assistant .assistantWidgetNote { padding: .3em .7em 0; opacity: .6; font-size: .9em; }
    #assistant .assistantWidget ul { max-height: 16em; overflow-y: auto; margin: 0; padding: .35em .7em; list-style: none; }
    #assistant .assistantWidget li { display: flex; align-items: baseline; gap: .4em; padding: .1em 0; }
    #assistant .assistantWidget li small { margin-left: auto; opacity: .6; text-align: right; }
    #assistant .assistantWidget li.gone { opacity: .5; }
    #assistant .assistantCard { padding: .6em .7em; }
    #assistant .assistantCardHead { display: flex; align-items: center; gap: .6em; }
    #assistant .assistantCardHead svg { flex: none; width: 3.6em; height: 3.6em; }
    #assistant .assistantCardHead strong { display: block; font-size: 1.05em; }
    #assistant .assistantCardHead small { opacity: .6; }
    #assistant .assistantCard dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .15em .8em; margin: .55em 0 0; }
    #assistant .assistantCard dt { opacity: .6; }
    #assistant .assistantCard dd { margin: 0; }
    #assistant .assistantCardNote { margin: .5em 0 0; opacity: .8; font-size: .92em; }
    #assistant .assistantChart { display: grid; grid-template-columns: minmax(0, max-content) minmax(3em, 1fr) auto; align-items: center; gap: .25em .6em; padding: .45em .7em; }
    #assistant .assistantBar { display: contents; }
    #assistant .assistantBar > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #assistant .assistantBar > span:last-child { font-variant-numeric: tabular-nums; opacity: .75; text-align: right; }
    #assistant .assistantBarTrack { height: .75em; border-radius: .2em; background: rgb(0 0 0 / 6%); }
    #assistant .assistantBarTrack i { display: block; height: 100%; min-width: 1px; border-radius: .2em; background: var(--header); }
    #assistant .assistantPie { display: flex; align-items: center; gap: .8em; padding: .45em .7em; }
    #assistant .assistantPie svg { flex: none; width: 6.5em; height: 6.5em; }
    #assistant .assistantPie ul { flex: 1; padding: 0; }
    #assistant .assistantPie li i { flex: none; width: .75em; height: .75em; border-radius: .15em; }
    #assistant .assistantChoices { margin: 0; padding: .5em .7em; }
    #assistant .assistantChartCaption { padding: 0 .7em .45em; opacity: .6; font-size: .88em; }
    #assistant .assistantInset { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 480 / 300; padding: 0; border: 0; background: rgb(0 0 0 / 4%); color: inherit; }
    #assistant .assistantInset :is(img, svg) { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
    #assistant .assistantInset span { opacity: .6; font-size: .9em; }
    #assistant .assistantSource { padding: .45em .7em; }
    #assistant .assistantSource a { color: inherit; }
    #assistant .assistantEmblem { display: block; width: 9em; height: 9em; margin: .5em auto; }
    #assistant .assistantNoticeItem { padding: .4em .6em; border-left: 3px solid var(--header); border-radius: .25em; background: rgb(0 0 0 / 4%); font-size: .9em; }
    #assistant .assistantDivider { display: flex; align-items: center; gap: .6em; margin: .8em 0; opacity: .5; font-size: .78em; text-transform: uppercase; letter-spacing: .06em; }
    #assistant .assistantDivider::before, #assistant .assistantDivider::after { content: ""; flex: 1; height: 1px; background: currentcolor; }

    #assistant .assistantActions { display: flex; flex-wrap: wrap; gap: .4em; margin-top: .5em; }
    #assistant .assistantButton { padding: .25em .7em; border: 1px solid var(--header); border-radius: .35em; background: none; color: inherit; }
    #assistant .assistantButton:hover:not(:disabled) { background: rgb(0 0 0 / 5%); }
    #assistant .assistantPrimary { background: var(--header); color: #fff; }
    #assistant .assistantPrimary:hover:not(:disabled) { background: var(--header-active); }
    #assistant .assistantLink { padding: 0; border: 0; background: none; color: inherit; text-decoration: underline; }
    #assistant .assistantLink:hover:not(:disabled) { color: var(--header-active); }

    #assistant .assistantFeedback { display: flex; gap: .15em; margin-top: .2em; }
    #assistant .assistantFeedback button { padding: 0 .2em; border: 0; background: none; opacity: .3; font-size: .9em; }
    #assistant .assistantFeedback button:hover { opacity: .7; }
    #assistant .assistantFeedback button[aria-pressed="true"] { opacity: 1; }

    #assistant .assistantTyping { display: flex; align-items: center; gap: .28em; padding: .2em .1em; opacity: .7; }
    #assistant .assistantTyping i { width: .4em; height: .4em; border-radius: 50%; background: currentcolor; animation: assistantTyping 1.2s infinite ease-in-out; }
    #assistant .assistantTyping i:nth-child(2) { animation-delay: .15s; }
    #assistant .assistantTyping i:nth-child(3) { animation-delay: .3s; margin-right: .35em; }
    @keyframes assistantTyping { 0%, 60%, 100% { opacity: .25; transform: none; } 30% { opacity: .9; transform: translateY(-.18em); } }
    @media (prefers-reduced-motion: reduce) { #assistant .assistantTyping i { animation: none; } }

    #assistantContext { flex: none; align-self: flex-start; padding: .1em .55em; border-radius: 1em; background: rgb(0 0 0 / 6%); font-size: .9em; }
    #assistantNotice { flex: none; max-height: 30%; overflow-y: auto; padding: .45em .6em; border-left: 3px solid var(--header); border-radius: .25em; background: rgb(0 0 0 / 5%); font-size: .9em; }
    #assistantNotice p { margin: 0 0 .3em; }

    #assistantComposer { flex: none; display: flex; flex-wrap: wrap; align-items: flex-end; gap: .4em; padding: .3em .3em .3em .6em; border: 1px solid rgb(0 0 0 / 20%); border-radius: .6em; background: rgb(255 255 255 / 70%); }
    #assistantComposer:focus-within { border-color: var(--header); }
    #assistantQuestion { flex: 1; min-width: 0; height: 1.7em; max-height: 108px; padding: .2em 0; border: 0; outline: none; background: none; resize: none; font: inherit; line-height: 1.4; }
    #assistantAsk { flex: none; display: flex; align-items: center; justify-content: center; width: 1.9em; height: 1.9em; padding: 0; border: 0; border-radius: .45em; background: var(--header); color: #fff; }
    #assistantAsk::before { margin: 0; }
    #assistantAsk:hover { background: var(--header-active); }
    #assistantQuestion:placeholder-shown + #assistantAsk:not(.busy) { opacity: .45; }
    #assistantAttachments { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: .4em; padding-top: .3em; }
    #assistantAttachments:not([hidden]) ~ #assistantAsk:not(.busy) { opacity: 1; }
    #assistant .assistantAttachment { position: relative; }
    #assistant .assistantAttachment img { display: block; max-width: 6em; height: 3.2em; object-fit: cover; border-radius: .3em; }
    #assistant .assistantAttachment button { position: absolute; top: -.4em; right: -.4em; width: 1.4em; height: 1.4em; padding: 0; border: 0; border-radius: 50%; background: rgb(0 0 0 / 65%); color: #fff; font-size: .8em; line-height: 1; }

    #assistant .assistantFooter { flex: none; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .2em .8em; padding-top: .4em; border-top: 1px solid rgb(0 0 0 / 10%); font-size: .9em; }
    #assistant .assistantFooter > span { display: flex; flex-wrap: wrap; align-items: center; gap: .2em .7em; }
    #assistant .assistantFooter a { color: inherit; }
    #assistantTier { padding: 0 .5em; border-radius: 1em; background: var(--header); color: #fff; }

    #assistant .assistantViewHeader { display: flex; justify-content: space-between; align-items: center; padding-bottom: .45em; border-bottom: 1px solid rgb(0 0 0 / 15%); }
    #assistant .assistantChatRow { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: .1em .6em; padding: .45em .3em; border-bottom: 1px solid rgb(0 0 0 / 8%); }
    #assistant .assistantChatRow:hover, #assistant .assistantChatRow.current { background: rgb(0 0 0 / 4%); }
    #assistant .assistantChatRow.current .assistantChatTitle { font-weight: bold; }
    #assistant .assistantChatTitle { overflow: hidden; padding: 0; border: 0; background: none; color: inherit; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
    #assistant .assistantChatRow :is(time, small) { font-size: .9em; opacity: .65; }
    #assistant .assistantChatRow small { grid-column: 1 / -1; }
    #assistant .assistantDelete { padding: 0 .2em; border: 0; background: none; opacity: .4; }
    #assistant .assistantDelete:is(:hover, :focus-visible) { opacity: 1; }
    #assistant .assistantEmpty { padding: 1em 0; opacity: .65; }

    #assistantKey h3 { margin: 0 0 .4em; font-size: 1.1em; }
    #assistantKey p { margin: 0 0 .5em; }
    #assistantKey .assistantFields { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: .45em .6em; margin: .8em 0 .4em; }
    #assistantKey .assistantFields :is(input, select) { width: 100%; box-sizing: border-box; }
    #assistantKey .assistantFields a { grid-column: 2; justify-self: start; color: inherit; font-size: .9em; }
    #assistantLocalHint { font-size: .9em; opacity: .8; }
    #assistantDiscoveryError { min-height: 1.2em; color: #a3262e; font-size: .9em; overflow-wrap: anywhere; }
    #assistant .assistantSheetActions { display: flex; justify-content: flex-end; gap: .5em; margin-top: .4em; }
  </style>`;function Ga(){let e=`<div id="${z}" class="dialog stable">
    ${Wa}
    <div id="assistantTranscript" role="log" aria-live="polite" aria-label="Assistant chat"></div>

    <div id="assistantChats" hidden>
      <div class="assistantViewHeader">
        <strong>Chats</strong>
        <button type="button" class="assistantLink" data-action="new-chat">+ New chat</button>
      </div>
      <div id="assistantChatList"></div>
    </div>

    <form id="assistantKey" hidden>
      <h3>Connect your AI key</h3>
      <p>Unlimited questions, and I can read and edit this map. Your key stays in this browser and goes only to the provider. I run scripts in this page to read your map. Only use me on maps from sources you trust.</p>
      <div class="assistantFields">
        <label for="assistantProvider">Provider</label>
        <select id="assistantProvider">${At.map(e=>`<option value="${e.id}">${e.label}</option>`).join(``)}</select>
        <label id="assistantModelLabel" for="assistantModel">Model</label>
        <input id="assistantModel" list="assistantModels" autocomplete="off" spellcheck="false" />
        <label for="assistantApiKey" data-remote>API key</label>
        <input id="assistantApiKey" type="password" autocomplete="off" data-remote />
        <a id="assistantKeyLink" target="_blank" rel="noopener noreferrer" data-remote>Where to get one</a>
        <label for="assistantLocalUrl" data-local>Server</label>
        <input id="assistantLocalUrl" autocomplete="off" spellcheck="false" data-local />
      </div>
      <datalist id="assistantModels"></datalist>
      <p id="assistantLocalHint" data-local>ⓘ Local models need no key. Point to the server and enter the model name. Set the server's context window to at least 8k tokens (Ollama's num_ctx).</p>
      <div id="assistantDiscoveryError" role="status"></div>
      <div class="assistantSheetActions">
        <button type="button" class="assistantButton" data-action="close-key">Cancel</button>
        <button type="button" id="assistantDisconnect" class="assistantButton" data-action="disconnect">Disconnect</button>
        <button type="submit" class="assistantButton assistantPrimary">Connect</button>
      </div>
    </form>

    <div id="assistantContext" hidden></div>

    <div id="assistantNotice" role="status" hidden>
      <div id="assistantNoticeText"></div>
      <div id="assistantNoticeActions" class="assistantActions">
        <button type="button" id="assistantRetry" class="assistantButton" data-action="retry">Retry</button>
        <button type="button" id="assistantNoticeSignIn" class="assistantButton" data-action="sign-in">Sign in</button>
        <button type="button" id="assistantNoticeKey" class="assistantButton assistantPrimary" data-action="key"></button>
      </div>
      <div id="assistantLong">
        <p>This chat is getting long — each question re-sends all of it.</p>
        <button type="button" class="assistantButton" data-action="new-chat">Start a new chat</button>
      </div>
    </div>

    <div id="assistantComposer">
      <div id="assistantAttachments" hidden></div>
      <textarea id="assistantQuestion" rows="1" maxlength="${Ea}" aria-label="Your question" placeholder="Ask a question…"></textarea>
      <button id="assistantAsk" type="button"></button>
    </div>

    <div class="assistantFooter">
      <span>
        <a href="${ka}" target="_blank" rel="noopener noreferrer">Discord</a>
        <a href="${Aa}" target="_blank" rel="noopener noreferrer">Patreon</a>
        <a href="${Oa}" target="_blank" rel="noopener noreferrer">Policy</a>
      </span>
      <span id="assistantAccount">
        <span id="assistantTier"></span>
        <span id="assistantStatus"></span>
        <button type="button" id="assistantSignIn" class="assistantLink" data-action="sign-in">Sign in</button>
        <button type="button" id="assistantSignOut" class="assistantLink" data-action="sign-out">Sign out</button>
        <button type="button" id="assistantUseKey" class="assistantLink" data-action="key"></button>
      </span>
    </div>
  </div>`;i(`dialogs`).insertAdjacentHTML(`beforeend`,e),Y(z).addEventListener(`click`,qa),Y(`assistantAsk`).addEventListener(`click`,()=>H?Do():void xo());let t=Y(`assistantQuestion`);t.addEventListener(`keydown`,e=>{e.key!==`Enter`||e.shiftKey||e.isComposing||(e.preventDefault(),H||xo())}),t.addEventListener(`input`,()=>so(t)),t.addEventListener(`paste`,e=>{let t=Array.from(e.clipboardData?.files??[]).filter(e=>e.type.startsWith(`image/`));t.length&&(e.preventDefault(),wo(t))}),Y(`assistantKey`).addEventListener(`submit`,e=>{e.preventDefault(),yo()}),Cr.wire()}function Ka(){let e=Y(z).closest(`.ui-dialog`)?.querySelector(`.ui-dialog-titlebar`);if(!e)return;let t=document.createElement(`button`);t.id=`assistantOpenChats`,t.type=`button`,t.className=`icon-list-bullet`,t.dataset.tip=`Chats`,t.setAttribute(`aria-label`,`Chats`),t.addEventListener(`click`,()=>{!H&&W&&X(V===`chats`?`chat`:`chats`)}),e.insertBefore(t,e.querySelector(`.ui-dialog-titlebar-reset, .ui-dialog-titlebar-collapse`)),e.querySelector(`.ui-dialog-titlebar-collapse`)?.setAttribute(`aria-label`,`Minimize or restore Assistant`),e.querySelector(`.ui-dialog-titlebar-close`)?.setAttribute(`aria-label`,`Close Assistant`)}function qa(e){let t=e.target.closest(`[data-action]`);if(!t||t.disabled)return;let{action:n,id:r,index:i,rating:a}=t.dataset;n===`new-chat`?Xa():n===`key`?vo():n===`close-key`?X(`chat`):n===`disconnect`?bo():n===`sign-in`?$e():n===`sign-out`?fo():n===`retry`?U?.retry?.():n===`open-chat`&&r?Za(r):n===`delete-chat`&&r?Qa(r):n===`apply`||n===`undo`||n===`redo`||n===`discard`?po(n,Number(i)):n===`rate`?_o(Number(i),a):n===`entity`&&r?R.openEntity(r):n===`command`&&r?R.runCommand(r):n===`mark`?mo(Number(i)):n===`choose`?go(Number(i),Number(t.dataset.choice)):n===`inset`?ho(Number(i)):n===`detach`&&To(Number(i))}async function Ja(){try{await ut()}catch{U={text:`Chats could not be loaded.`,retry:()=>void Ja()},$a();return}let e=q();Na=I.id(),B=ft(),(!La(B)||B?.tier!==e)&&(B=e?mt(e,I.id(),I.name()):void 0),Pa=e,W=!0,U=null,$a(),co(),Je()&&e!==`key`&&uo()}function Ya(){let e=q();B=e?mt(e,I.id(),I.name()):void 0,Pa=e,oo(),R.clearMarks();let t=Y(`assistantQuestion`);t.value=``,so(t),X(`chat`)}function Xa(){!H&&W&&Ya()}function Za(e){B=pt(e),oo(),R.clearMarks(),X(`chat`)}function Qa(e){ht(e),B?.id===e&&(B=void 0,R.clearMarks()),no()}function X(e){V===`key`&&e!==`key`&&Cr.cancelDiscovery(),V=e,$a()}function $a(e=!1){let t=!La(B);Y(`assistantTranscript`).hidden=V!==`chat`,Y(`assistantChats`).hidden=V!==`chats`,Y(`assistantKey`).hidden=V!==`key`,Y(`assistantComposer`).hidden=V!==`chat`||t,lo();let n=document.getElementById(`assistantOpenChats`);n&&(n.disabled=H||!W);let r=Y(`assistantAsk`);r.className=H?`busy icon-cancel`:`icon-right-big`,r.setAttribute(`aria-label`,H?`Stop`:`Send`),r.title=H?`Stop`:`Send (Enter)`,V===`chat`&&Z(e),V===`chats`&&no(),ao(),io()}function Z(e=!1){if(!J){za=!0;return}let t=Y(`assistantTranscript`),r=t.scrollTop,i=B?.items??[],a=q(),o=B?.mapId===I.id(),s=La(B),c=!H&&s,l=i.length?``:eo(a);i.forEach((e,t)=>{e!==U?.item&&(l+=to(e,{index:t,live:o,canAsk:c}))}),W&&!s&&(B||a)&&(l+=`<div class="assistantItem assistantNoticeItem">Start a new chat to continue
      <div class="assistantActions"><button type="button" class="assistantButton" data-action="new-chat">New chat</button></div>
    </div>`),H&&(l+=`<div class="assistantTyping"><i></i><i></i><i></i>${n(Fa)}…</div>`),t.innerHTML=l,t.scrollTop=e?r:t.scrollHeight}function eo(e){let t=G?n(G):``,r=e?e===`key`?[`Hi! Ask about the Fantasy Map Generator or this map. I can read and propose changes to your map.`,t?`I can work on the note “${t}”.`:``]:[`Hi! Ask anything about the Fantasy Map Generator.`,t?`Connect your own AI key and I can write the note “${t}”, and read, answer questions about and edit this map, with no daily limit.`:`Connect your own AI key and I can read this map, answer questions about it and edit it, with no daily limit.`]:[`The free Assistant runs only on the official site. Connect your own AI key or a local model to ask questions here.`],i=e===`key`?``:`<div class="assistantActions"><button type="button" class="assistantButton assistantPrimary" data-action="key">🔑 Connect your AI key</button></div>`;return`<div class="assistantItem assistantWelcome">${r.filter(Boolean).map(e=>`<p>${e}</p>`).join(``)}${i}</div>`}function to(e,t){let{index:r,live:i}=t;if(e.kind===`question`)return`<div class="assistantItem assistantQuestion">${e.images?.length?`<div class="assistantQuestionImages">${e.images.map(e=>`<img src="${n(e)}" alt="Attached image" />`).join(``)}</div>`:``}${n(e.text)}</div>`;if(e.kind===`answer`){let t=e.ratingId==null?``:`<div class="assistantFeedback">${[`up`,`down`].map(t=>`<button type="button" data-action="rate" data-index="${r}" data-rating="${t}" aria-pressed="${e.rating===t}" aria-label="${t===`up`?`Good answer`:`Bad answer`}">${t===`up`?`👍`:`👎`}</button>`).join(``)}</div>`;return`<div class="assistantItem assistantAnswer">${R.answer(e.text,i)}${t}</div>`}if(e.kind===`step`){let{result:t}=e,r=t?t.ok?`Read the map`:`Map read failed`:`Reading the map`,i=t?t.ok?[t.value,...t.logs].join(`
`):t.error?.message:``;return`<details class="assistantItem assistantStep${t&&!t.ok?` failed`:``}">
      <summary>${r}${t?` · ${t.ms} ms`:``}</summary>
      <pre>${n(e.code)}</pre>${i?`<pre>${n(i)}</pre>`:``}
    </details>`}return e.kind===`proposal`?ai.html(e.proposal,r,I.id()):e.kind===`divider`?`<div class="assistantDivider">New memory</div>`:e.kind===`widget`?R.html(e.widget,t):`<div class="assistantItem assistantNoticeItem">${ar(e.text)}</div>`}function no(){let e=dt();Y(`assistantChatList`).innerHTML=e.length?e.map(ro).join(``):`<div class="assistantEmpty">No chats yet.</div>`}function ro(e){let t=Ia(e),r=[n(e.mapName)+(e.mapId===I.id()?``:` (other map)`),e.tier===`key`?`🔑`:``,t?`${v(t)} tokens`:``].filter(Boolean).join(` · `),i=n(e.title),a=new Date(e.updated);return`<div class="assistantChatRow${e===B?` current`:``}">
    <button type="button" class="assistantChatTitle" data-action="open-chat" data-id="${e.id}" title="${i}">${i}</button>
    <time datetime="${a.toISOString()}" title="${a.toLocaleString()}">${Oo(e.updated)}</time>
    <button type="button" class="assistantDelete icon-trash" data-action="delete-chat" data-id="${e.id}" aria-label="Delete chat ${i}"></button>
    <small>${r}</small>
  </div>`}function io(){let e=q(),t=D();Y(`assistantTier`).hidden=e!==`guest`&&e!==`member`,Y(`assistantTier`).textContent=e===`member`?`Member`:`Guest`,Y(`assistantStatus`).textContent=e===`key`?`${t.provider===`local`?`Local`:`🔑`} ${t.model} · ${v(Ia(B))} tokens`:e&&Ma?ko(Ma):``,Y(`assistantSignIn`).hidden=e!==`guest`,Y(`assistantSignOut`).hidden=e!==`member`,Y(`assistantUseKey`).textContent=e===`key`?`Key`:`Use key`;for(let e of Y(`assistantAccount`).querySelectorAll(`button`))e.disabled=H||!W}function ao(){let e=!!(B&&yt(B)),t=!!U?.item,n=q();Y(`assistantNotice`).hidden=V!==`chat`||!U&&!e,Y(`assistantNoticeText`).hidden=!U,Y(`assistantNoticeText`).innerHTML=U?ar(U.text):``,Y(`assistantRetry`).hidden=!U?.retry,Y(`assistantNoticeSignIn`).hidden=!t||n!==`guest`,Y(`assistantNoticeKey`).hidden=!t,Y(`assistantNoticeKey`).textContent=n===`key`?`Key`:`🔑 Connect your AI key`,Y(`assistantNoticeActions`).hidden=!U?.retry&&!t,Y(`assistantLong`).hidden=!e;for(let e of Y(`assistantNotice`).querySelectorAll(`button`))e.disabled=H}function Q(e){U=e,ao()}function oo(){U=null}function so(e){e.style.height=``,e.value&&(e.style.height=`${e.scrollHeight}px`)}async function co(){let e=await S.NotesEditor.current();G=e?e.name||e.id:null,lo(),V===`chat`&&!B?.items.length&&Z()}function lo(){Y(`assistantContext`).textContent=G?`Note: ${G}`:``,Y(`assistantContext`).hidden=V!==`chat`||!G}async function uo(){if(!(!Je()||q()===`key`)){try{Ma=await Qe()}catch(e){Ma=e instanceof w&&e.code===`unauthorized`?await Qe().catch(()=>null):null}W&&Pa!==q()&&Xa(),io()}}async function fo(){await et(),Xa(),uo()}function po(e,t){let n=B,i=n?.items[t];if(!(!n||i?.kind!==`proposal`)){try{e===`discard`?M.discard(i.proposal):M.run(e,i.proposal,I.id())||Q({text:`The map changed since; ${r(e)} is unavailable.`}),_t(n)}catch(e){Q({text:g(e)})}B===n&&V===`chat`&&(Z(),co())}}function mo(e){let t=B?.items[e];t?.kind!==`widget`||t.widget.type!==`entities`||(R.toggleMarks(t.widget),Z(!0))}function ho(e){let t=B?.items[e];t?.kind===`widget`&&t.widget.type===`inset`&&R.revealInset(t.widget)}async function go(e,t){let n=B,r=n?.items[e];if(!n||r?.kind!==`widget`||r.widget.type!==`choices`||r.widget.picked!==void 0)return;let{widget:i}=r,a=i.choices[t];if(!a)return;if(!a.operations){if(H||!La(n))return;i.picked=t,Y(`assistantQuestion`).value=a.label,xo();return}if(await M.prepare(a.operations),i.picked!==void 0)return;let o=n.items.filter(e=>e.kind===`proposal`).length,s=M.propose(a.label,a.operations,o+1,I.id());if(typeof s==`string`){Q({text:s});return}i.picked=t,gt(n,{kind:`proposal`,proposal:s}),Z()}async function _o(e,t){let n=B,r=n?.items[e];if(!n||r?.kind!==`answer`||r.ratingId==null||r.rating===t)return;let i=e=>{r.rating=e,_t(n),B===n&&V===`chat`&&Z()},a=r.rating;i(t);try{await Ze(r.ratingId,t)}catch(e){i(a),e instanceof w&&e.code===`unauthorized`&&uo()}}function vo(){H||(X(`key`),Cr.fill())}function yo(){let e=qt();Cr.save()&&(e?X(`chat`):Xa())}function bo(){Kt(),Xa(),uo()}async function xo(){if(H||!La(B))return;let e=Y(`assistantQuestion`),t=K,n=Ao(e.value)??(t.length&&!e.value.trim()?``:null);if(n===null)return;if(t.length&&B.tier!==`key`)return Q({text:Co});e.value=``,so(e),K=[],Eo(),oo(),H=!0,Fa=`Thinking`;let r=new AbortController;ja=r;let i=B,a=i.items.length,o=()=>B===i,s=e=>{gt(i,e),o()&&(e.kind===`notice`&&Q({text:e.text,item:e}),e.kind===`answer`&&U&&(oo(),ao()),V===`chat`&&Z())},c=e=>{Fa=e,o()&&V===`chat`&&Z()};$a();try{i.tier===`key`?await Kn(i,n,s,r.signal,{tools:I.tools(i),context:()=>I.context(i),onStatus:c,images:t}):await tt(i,n,s,r.signal)}catch(e){if(!r.signal.aborted){let r={kind:`notice`,text:g(e)};gt(i,r),B===i&&Q({text:r.text,item:r,retry:()=>So(i,n,t,a)})}}finally{H=!1,ja=null,_t(i),$a(),J&&Y(`assistantQuestion`).focus(),uo()}}function So(e,t,n,r){if(H||B!==e)return;let i=e.items.slice(r);i.every(e=>e.kind===`question`||e.kind===`notice`)?e.items.splice(r):i.at(-1)?.kind===`notice`&&e.items.pop(),Y(`assistantQuestion`).value=t,K=n,xo()}var Co=`Images need your own AI key with a vision model: the free Assistant reads text only.`;async function wo(e){if(q()!==`key`)return Q({text:Co});let t=()=>Q({text:`Up to ${Da} images per question.`});e.length>Da-K.length&&t();for(let n of e.slice(0,Math.max(Da-K.length,0)))try{let e=await hr.read(n);K.length<Da?K.push(e):t()}catch(e){Q({text:g(e)})}Eo()}function To(e){K.splice(e,1),Eo(),Y(`assistantQuestion`).focus()}function Eo(){let e=Y(`assistantAttachments`);e.hidden=!K.length,e.innerHTML=K.map((e,t)=>`<span class="assistantAttachment"><img src="${n(e)}" alt="Attached image ${t+1}" /><button type="button" data-action="detach" data-index="${t}" aria-label="Remove image ${t+1}">✕</button></span>`).join(``)}function Do(){ja?.abort()}function Oo(e){let t=Math.round((Date.now()-e)/6e4);if(t<1)return`just now`;if(t<60)return`${t} min ago`;let n=Math.round(t/60);if(n<24)return`${n} h ago`;let r=Math.round(n/24);return r===1?`yesterday`:r<30?`${r} days ago`:new Date(e).toLocaleDateString()}window.addEventListener(`map:generated`,()=>{!W||Na===I.id()||(Na=I.id(),Do(),Ya(),co())}),window.addEventListener(`notes:context-changed`,()=>{Ra()&&co()});var ko=e=>e.remaining?`${e.remaining} question${e.remaining===1?``:`s`} left today`:`No questions left today`;function Ao(e){let t=e.trim();return t&&t.length<=Ea?t:null}var jo={open:Va,toggle:Ba};export{jo as Assistant};