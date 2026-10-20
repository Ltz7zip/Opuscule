import{It as e,Mt as t,P as n,ar as r,qn as i}from"./utils-Dk4MDzbZ.js";import{q as a,s as o,t as s}from"./layers--lc146Vt.js";import{t as c}from"./population-generator-BKslz7iX.js";import{t as l}from"./graph-override-ujD-mQqM.js";var u={volcano:{id:0,name:`Volcano`,template:`Hill 1 90-100 44-56 40-60
  Multiply 0.8 50-100 0 0
  Range 1.5 30-55 45-55 40-60
  Smooth 3 0 0 0
  Hill 1.5 35-45 25-30 20-75
  Hill 1 35-55 75-80 25-75
  Hill 0.5 20-25 10-15 20-25
  Mask 3 0 0 0`,probability:3},highIsland:{id:1,name:`High Island`,template:`Hill 1 90-100 65-75 47-53
  Add 7 all 0 0
  Hill 5-6 20-30 25-55 45-55
  Range 1 40-50 45-55 45-55
  Multiply 0.8 land 0 0
  Mask 3 0 0 0
  Smooth 2 0 0 0
  Trough 2-3 20-30 20-30 20-30
  Trough 2-3 20-30 60-80 70-80
  Hill 1 10-15 60-60 50-50
  Hill 1.5 13-16 15-20 20-75
  Range 1.5 30-40 15-85 30-40
  Range 1.5 30-40 15-85 60-70
  Pit 3-5 10-30 15-85 20-80`,probability:19},lowIsland:{id:2,name:`Low Island`,template:`Hill 1 90-99 60-80 45-55
  Hill 1-2 20-30 10-30 10-90
  Smooth 2 0 0 0
  Hill 6-7 25-35 20-70 30-70
  Range 1 40-50 45-55 45-55
  Trough 2-3 20-30 15-85 20-30
  Trough 2-3 20-30 15-85 70-80
  Hill 1.5 10-15 5-15 20-80
  Hill 1 10-15 85-95 70-80
  Pit 5-7 15-25 15-85 20-80
  Multiply 0.4 20-100 0 0
  Mask 4 0 0 0`,probability:9},continents:{id:3,name:`Continents`,template:`Hill 1 80-85 60-80 40-60
  Hill 1 80-85 20-30 40-60
  Hill 6-7 15-30 25-75 15-85
  Multiply 0.6 land 0 0
  Hill 8-10 5-10 15-85 20-80
  Range 1-2 30-60 5-15 25-75
  Range 1-2 30-60 80-95 25-75
  Range 0-3 30-60 80-90 20-80
  Strait 2 vertical 0 0
  Strait 1 vertical 0 0
  Smooth 3 0 0 0
  Trough 3-4 15-20 15-85 20-80
  Trough 3-4 5-10 45-55 45-55
  Pit 3-4 10-20 15-85 20-80
  Mask 4 0 0 0`,probability:16},archipelago:{id:4,name:`Archipelago`,template:`Add 11 all 0 0
  Range 2-3 40-60 20-80 20-80
  Hill 5 15-20 10-90 30-70
  Hill 2 10-15 10-30 20-80
  Hill 2 10-15 60-90 20-80
  Smooth 3 0 0 0
  Trough 10 20-30 5-95 5-95
  Strait 2 vertical 0 0
  Strait 2 horizontal 0 0`,probability:18},atoll:{id:5,name:`Atoll`,template:`Hill 1 75-80 50-60 45-55
  Hill 1.5 30-50 25-75 30-70
  Hill .5 30-50 25-35 30-70
  Smooth 1 0 0 0
  Multiply 0.2 25-100 0 0
  Hill 0.5 10-20 50-55 48-52`,probability:1},mediterranean:{id:6,name:`Mediterranean`,template:`Range 4-6 30-80 0-100 0-10
  Range 4-6 30-80 0-100 90-100
  Hill 6-8 30-50 10-90 0-5
  Hill 6-8 30-50 10-90 95-100
  Multiply 0.9 land 0 0
  Mask -2 0 0 0
  Smooth 1 0 0 0
  Hill 2-3 30-70 0-5 20-80
  Hill 2-3 30-70 95-100 20-80
  Trough 3-6 40-50 0-100 0-10
  Trough 3-6 40-50 0-100 90-100`,probability:5},peninsula:{id:7,name:`Peninsula`,template:`Range 2-3 20-35 40-50 0-15
  Add 5 all 0 0
  Hill 1 90-100 10-90 0-5
  Add 13 all 0 0
  Hill 3-4 3-5 5-95 80-100
  Hill 1-2 3-5 5-95 40-60
  Trough 5-6 10-25 5-95 5-95
  Smooth 3 0 0 0
  Invert 0.4 both 0 0`,probability:3},pangea:{id:8,name:`Pangea`,template:`Hill 1-2 25-40 15-50 0-10
  Hill 1-2 5-40 50-85 0-10
  Hill 1-2 25-40 50-85 90-100
  Hill 1-2 5-40 15-50 90-100
  Hill 8-12 20-40 20-80 48-52
  Smooth 2 0 0 0
  Multiply 0.7 land 0 0
  Trough 3-4 25-35 5-95 10-20
  Trough 3-4 25-35 5-95 80-90
  Range 5-6 30-40 10-90 35-65`,probability:5},isthmus:{id:9,name:`Isthmus`,template:`Hill 5-10 15-30 0-30 0-20
  Hill 5-10 15-30 10-50 20-40
  Hill 5-10 15-30 30-70 40-60
  Hill 5-10 15-30 50-90 60-80
  Hill 5-10 15-30 70-100 80-100
  Smooth 2 0 0 0
  Trough 4-8 15-30 0-30 0-20
  Trough 4-8 15-30 10-50 20-40
  Trough 4-8 15-30 30-70 40-60
  Trough 4-8 15-30 50-90 60-80
  Trough 4-8 15-30 70-100 80-100
  Invert 0.25 x 0 0`,probability:2},shattered:{id:10,name:`Shattered`,template:`Hill 8 35-40 15-85 30-70
  Trough 10-20 40-50 5-95 5-95
  Range 5-7 30-40 10-90 20-80
  Pit 12-20 30-40 15-85 20-80`,probability:7},taklamakan:{id:11,name:`Taklamakan`,template:`Hill 1-3 20-30 30-70 30-70
  Hill 2-4 60-85 0-5 0-100
  Hill 2-4 60-85 95-100 0-100
  Hill 3-4 60-85 20-80 0-5
  Hill 3-4 60-85 20-80 95-100
  Smooth 3 0 0 0`,probability:1},oldWorld:{id:12,name:`Old World`,template:`Range 3 70 15-85 20-80
  Hill 2-3 50-70 15-45 20-80
  Hill 2-3 50-70 65-85 20-80
  Hill 4-6 20-25 15-85 20-80
  Multiply 0.5 land 0 0
  Smooth 2 0 0 0
  Range 3-4 20-50 15-35 20-45
  Range 2-4 20-50 65-85 45-80
  Strait 3-7 vertical 0 0
  Trough 6-8 20-50 15-85 45-65
  Pit 5-6 20-30 10-90 10-90`,probability:8},fractious:{id:13,name:`Fractious`,template:`Hill 12-15 50-80 5-95 5-95
  Mask -1.5 0 0 0
  Mask 3 0 0 0
  Add -20 30-100 0 0
  Range 6-8 40-50 5-95 10-90`,probability:3}};window.heightmapTemplates=u;var d={"africa-centric":[45,53,38],arabia:[20,35,35],atlantics:[42,23,65],britain:[7,20,51.3],caribbean:[15,40,74.8],"east-asia":[11,28,9.4],eurasia:[38,19,27],europe:[20,16,44.8],"europe-accented":[14,22,44.8],"europe-and-central-asia":[25,10,39.5],"europe-central":[11,22,46.4],"europe-north":[7,18,48.9],greenland:[22,7,55.8],hellenica:[8,27,43.5],iceland:[2,15,55.3],"indian-ocean":[45,55,14],"mediterranean-sea":[10,29,45.8],"middle-east":[8,31,34.4],"north-america":[37,17,87],"us-centric":[66,27,100],"us-mainland":[16,30,77.5],world:[78,27,40],"world-from-pacific":[75,32,30]},f={pangea:1,shattered:.7,continents:.5,archipelago:.35,highIsland:.25,lowIsland:.1},p={pangea:[70,20,30,100],volcano:[20,20,10,100],mediterranean:[25,30,15,80],peninsula:[15,15,5,80],isthmus:[15,20,3,80],atoll:[3,2,1,5]},m=new class{generate(){let e=grid.features.some(e=>e.land&&e.border),[t,n,r]=this.getSizeAndPosition(options.generation.template,e),i=options.generation.geography,a=options.map.geography;a.mapSize=i.mapSize??t,a.latitude=i.latitude??n,a.longitude=i.longitude??r,this.calculate()}calculate(){let e=options.map.geography.mapSize/100,t=options.map.geography.latitude/100,n=options.map.geography.longitude/100,i=r(e*180,1),a=r(90-(180-i)*t,1),o=r(a-i,1),s=r(Math.min(options.map.graph.width/options.map.graph.height*i,360),1),c=r(180-(360-s)*n,1),l=r(c-s,1);options.map.geography.coordinates={latT:i,latN:a,latS:o,lonT:s,lonW:l,lonE:c}}getSizeAndPosition(n,r){let i=d[n];if(i)return i;if(!r&&t(f[n]??0))return[100,50,50];let a=r?80:100,[o,s,c,l]=p[n]??[30,20,15,a];return[e(o,s,c,Math.min(l,a),+(n===`atoll`)),e(t(.5)?40:60,20,25,75),50]}};window.Coordinates=m;function h(){s.eraseAll();for(let e of n(`deftemp`).querySelectorAll(`path, clipPath, svg`))e.remove();a(),n(`coas`).innerHTML=``,o()}var g=class{name;steps;constructor(e,t){this.name=e,this.steps=t}async run(e){INFO&&console.group(this.name),TIME&&console.time(this.name);try{for(let t of this.steps){TIME&&console.time(t.id);try{await t.run(e)}catch(e){let n=i(e);throw Error(`${this.name} failed at step "${t.id}": ${n}`,{cause:e})}finally{TIME&&console.timeEnd(t.id)}}}finally{TIME&&console.timeEnd(this.name),INFO&&console.groupEnd()}}},_=[{id:`grid`,run:({graph:e})=>Grid.prepare(e)},{id:`heightmap`,run:()=>HeightmapGenerator.generate()},{id:`markupGrid`,run:()=>Features.markupGrid()},{id:`depressionLakes`,run:()=>Grid.addDeepDepressionLakes()},{id:`nearSeaLakes`,run:()=>Grid.openNearSeaLakes()},{id:`mapSize`,run:()=>m.generate()},{id:`temperatures`,run:()=>Temperature.generate()},{id:`precipitation`,run:()=>Precipitation.generate()},{id:`clearPack`,run:()=>Pack.clear()},{id:`clearGraphOverride`,run:()=>l.clear()},{id:`regraph`,run:()=>Pack.generate()},{id:`markupPack`,run:()=>Features.markupPack()},{id:`defaultRuler`,run:()=>Measurers.createDefaultRuler()},{id:`rivers`,run:()=>Rivers.generate()},{id:`biomes`,run:()=>Biomes.generate()},{id:`featureGroups`,run:()=>Features.defineGroups()},{id:`ice`,run:()=>Ice.generate()},{id:`goods`,run:()=>Goods.generate()},{id:`rankCells`,run:()=>c.rankCells()},{id:`cultures`,run:()=>Cultures.generate()},{id:`culturesExpand`,run:()=>Cultures.expand()},{id:`burgs`,run:()=>Burgs.generate()},{id:`states`,run:()=>States.generate()},{id:`routes`,run:()=>Routes.generate()},{id:`religions`,run:()=>Religions.generate()},{id:`burgsSpecify`,run:()=>Burgs.specify()},{id:`stateStatistics`,run:()=>States.collectStatistics()},{id:`stateForms`,run:()=>States.defineStateForms()},{id:`provinces`,run:()=>Provinces.generate()},{id:`provincePoles`,run:()=>Provinces.getPoles()},{id:`riversSpecify`,run:()=>Rivers.specify()},{id:`featureNames`,run:()=>Features.defineNames()},{id:`markets`,run:()=>Markets.generate()},{id:`production`,run:()=>Production.produce()},{id:`taxes`,run:()=>States.collectTaxes()},{id:`military`,run:()=>Military.generate()},{id:`markers`,run:()=>Markers.generate()},{id:`zones`,run:()=>Zones.generate()},{id:`addedLabels`,run:()=>AddedLabels.initiate()},{id:`journeys`,run:()=>Journeys.generate()}],v=new g(`Generation Pipeline`,_),y=new g(`Erase Heightmap`,[{id:`markupGrid`,run:()=>Features.markupGrid()},{id:`depressionLakes`,run:({erosion:e})=>e&&Grid.addDeepDepressionLakes()},{id:`nearSeaLakes`,run:({erosion:e})=>e&&Grid.openNearSeaLakes()},{id:`temperatures`,run:()=>Temperature.generate()},{id:`precipitation`,run:()=>Precipitation.generate()},{id:`regraph`,run:()=>Pack.generate()},{id:`markupPack`,run:()=>Features.markupPack()},{id:`rivers`,run:({erosion:e})=>Rivers.generate(e)},{id:`biomes`,run:()=>Biomes.define()},{id:`featureGroups`,run:()=>Features.defineGroups()},{id:`ice`,run:()=>Ice.generate()},{id:`goods`,run:()=>Goods.generate()},{id:`rankCells`,run:()=>c.rankCells()},{id:`cultures`,run:()=>Cultures.generate()},{id:`culturesExpand`,run:()=>Cultures.expand()},{id:`burgs`,run:()=>Burgs.generate()},{id:`states`,run:()=>States.generate()},{id:`routes`,run:()=>Routes.generate()},{id:`religions`,run:()=>Religions.generate()},{id:`burgsSpecify`,run:()=>Burgs.specify()},{id:`stateStatistics`,run:()=>States.collectStatistics()},{id:`stateForms`,run:()=>States.defineStateForms()},{id:`provinces`,run:()=>Provinces.generate()},{id:`provincePoles`,run:()=>Provinces.getPoles()},{id:`riversSpecify`,run:()=>Rivers.specify()},{id:`featureNames`,run:()=>Features.defineNames()},{id:`markets`,run:()=>Markets.generate()},{id:`production`,run:()=>Production.produce()},{id:`taxes`,run:()=>States.collectTaxes()},{id:`military`,run:()=>Military.generate()},{id:`markers`,run:()=>Markers.generate()},{id:`zones`,run:()=>Zones.generate()}]);window.GenerationPipeline=v;export{h as a,g as i,v as n,m as o,_ as r,u as s,y as t};