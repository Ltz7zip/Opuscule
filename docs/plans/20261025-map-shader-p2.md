# 地图 GPU 着色器 P2（2026-10-25）

## 目标

用 P1 的 `/map/fields` 驱动前端逐片元渲染，替代地形底图；PNG 保留为首屏、
分享图与无 WebGL 环境的回退。

## 已落地

- `frontend/src/lib/terrainFields.ts`：`OTF1` 解析（magic / header / 块切片 /
  u16 对齐拷贝）。
- `frontend/src/components/MapTerrainCanvas.tsx`
  - WebGL2 全屏 quad；片元着色器复刻 `terrain_web.py` 的 LUT、hillshade、
    海岸混合、森林混色。
  - 字段在装载时解码为 float32 上传 R32F（部分驱动拒绝 `R16`，探针里的
    `R16` 在 M3/ANGLE 上返回 INVALID_OPERATION）。
  - 河流：主干 30 条来自 header、支流 6070 条来自 `tributaries` u16 块，
    用 2D canvas 以矢量 Path2D 叠在上层；线宽按 zoom 反比缩放，放大后保持细线。
  - `preserveDrawingBuffer: true`，让 `MapLens` 能采样画布。
- `MapPage.tsx`
  - 顶栏 `GPU / PNG` 切换（默认 GPU），`3D β` 打开时互斥。
  - 装载完成前继续显示 PNG；WebGL2 缺失或接口失败自动回退并 `console.warn`。
- payload v2（`terrain_fields.py`）：新增河流主干（JSON）与支流（u16），
  `FIELDS_VERSION = 2`；`FIELDS_VERSION` 变化即自然失效旧缓存。

## 坐标映射

与 `.map-world` 的 CSS transform 完全一致：

```
world = ((p - viewOrigin - viewSize/2 - pan) / (viewSize * zoom) + 0.5) * mapSize
```

`p` 为 CSS 像素（`gl_FragCoord / dpr`，Y 翻转），因此图钉、标签、选中环与
着色器的像素对齐。

## 放大细节

detail 纹理原本按世界坐标采样，4× 下会放大成可见的方块。着色器按 zoom 把
采样坐标从 `world` 滑向 `world * zoom`（屏幕尺度恒定），并按 zoom 叠加程序化
`fbm2` 微起伏；`zoom = 1` 时两者权重为 0，保持与 PNG 一致的基线。

## 实测（wuhai / 2048×1280 / topographic）

| 项目 | 数值 |
|---|---|
| 字段载荷 | 2.24 MiB raw / 1.32 MiB gzip（含河流） |
| 冷/热接口 | 9.9 s / 9.5 ms |
| 首帧 | PNG 先出，fields 到位后切换 |
| 交互 | 1440×900 视口滚轮缩放 60 fps，最差帧 31.6 ms（M3 Pro） |
| 4× | 地形纹理与河流明显锐于 PNG 位图放大 |

## 与 PNG 模式的差异

- GPU 模式没有烘焙的图框（TERRAIN WEB / SEED）、比例尺、树木/岩石点缀；
  侧栏仍然显示 seed/风格，故暂时接受。
- 等深线叠加（`MapCanvasStage` 的 CONTOUR 层）在 GPU 模式下不绘制。

## 遗留（P3）

1. 图框/比例尺/树木岩石点缀的矢量或 DOM 移植。
2. 支流每帧重绘 6070 条曲线；低端设备需要实测或缓存。
3. WebGL 上下文丢失未监听（当前依赖切页/重载回退）。
4. 3D 预览与 GPU 2D 未共享同一批纹理。

## P3 增量（同日）

### 补齐 PNG 模式的装饰层

- **图框 + 比例尺**：在河流画布的 map-space 里绘制（`drawFurniture`），文字用
  等宽字体近似服务端的 5×7 像素字体；`paper/panel/ink` 由 payload v3 下发，
  不再手抄色板。缩放时与烘焙版本同一几何比例。
- **Atlas 点缀（矢量点精灵）**：`buildAtlasMarks` 按 `terrain_web.py` 的
  trees/rocks/waves 规则（hash、抖动、坡度阈值）提取世界坐标点，用第二个
  WebGL 程序以 `GL_POINTS` 绘制：符号是屏幕空间常量尺寸（树 3 px、岩石
  3.4 px、海波 5 px），字形由片元着色器画出（十字/斜线/横杠）。任意 zoom
  下都锐利，不再有 map 分辨率位图被放大的问题。
- GPU 模式下隐藏 `CONTOUR 20 M` 徽标（等深线层未绘制），避免误导。
- `webglcontextlost` 监听：丢失即回退 PNG。

### 放大质量

- `to_land` / `moisture` / `uplift` 改为双线性采样，海底色带和森林边界在
  2×/4× 下不再出现格子状台阶。
- relief 纹理按 zoom 淡出（约 2.2× 归零），改用带自身梯度的 4 阶程序化
  fbm 接管：消除 384×240 平铺在放大后的接缝/镜像折痕，放大时有真正的新细节。
- `zoom = 1` 时上述权重仍为 0，1× 观感与 P2 一致。

### 期间修复

- `terrain_web.py` 的渲染尾段在 P1 重构时被复制了一份（return 之后的死代码，
  约 370 行）；已删除，golden PNG 与 127 tests 仍通过。
- 客户端校验 payload `version`，版本不匹配直接回退 PNG（避免旧缓存
  immutable 命中后渲染错色板）。
- `fetchWorldMap` 加 `cache: "no-store"`：地图载荷带缓存 token，不能被启发式
  缓存复用。

### P3 实测

- 2048 topographic：1×/2×/4× 目视检查；4× 无接缝、无方块，河流细线清晰。
- 1024 atlas 探针世界：树/岩石/海波点缀与图框正常（验证后删除该世界）。
- 1440×900 滚轮缩放仍 60 fps（最差帧 ~31 ms）。
- payload v3：2.35 MB 线上传输（gzip），冷 9.7 s / 热 ~10 ms。

### P3.2 点缀密度分层

仿真格子只有每格一个 mark，放大后屏幕密度会下降。解决方式是给每次采样的格子再生成
两层「抖动子标记」：

- 每个 mark 存 4 个 float（x, y, glyph, level），VBO stride 16 字节。
- level 1 在 `zoom ≥ 1.6`、level 2 在 `zoom ≥ 2.8` 渐入（`smoothstep`，不跳变）。
- 每层在每个格子内放 3 个抖动位置（hash 决定），通过率 75% / 65%，全部落在格子内。
- 4× 时标记数约为基准的 3.6 倍（1 + 2.25 + 1.95），屏幕密度约为 1× 的 22%。

同时把符号尺寸调到树 4 px / 岩石 4.4 px / 海波 6 px（并随 zoom 轻微增大 10%/倍），
否则 3 px 的十字在实机上几乎看不见——这是本轮排查的主要坑。

### P3.3 放大后仍然发糊：频率混叠

4× 下地图仍然像被放大后的位图。根因不在数据，而在程序化细节的频率写错了：

```
旧: vec2 mp = world * (0.7 + 2.2 * u_zoom);   // 4× 时 9.5 周期/像素
新: float pxPerMap = u_viewSize.x * u_zoom / u_mapSize.x;
    float freq = max(0.25, 0.30 * pxPerMap);  // 特征 ≈3 屏幕像素
```

旧公式把频率乘到 9.5 cycles/map-px，而 4× 时一个屏幕像素只覆盖 0.4 map-px，
等于每个像素采到 2~4 个噪声周期——完全混叠，采样结果趋近平滑的均值，于是
「有细节」变成了「没有细节」。改成按屏幕像素反推频率后，噪声在不同 zoom 下
都落在 ~3 屏幕像素的尺度，细节才真正可见。

同时把 `getAttribLocation` 从每帧调用改成初始化时缓存（之前偶发
`index out of range` 警告，点层会被静默跳过）。

### P3.4 标签清晰度与等高线对齐

**标签发糊**：图钉和地名原本都在 `.map-world` 里，靠 `scale(1/zoom)` 反向缩放保持
大小。父层带着 `scale(zoom)` 的合成变换，浏览器会先按放大后的分辨率栅格化再缩回去，
4× 时文字就糊了。现在把图钉/地名/草稿标记移到独立的 `.map-pins` 屏幕空间图层，
用和命中检测一致的投影直接算屏幕坐标：

```
left = canvasW/2 + pan.x + (x - 0.5) * viewW * zoom
top  = canvasH/2 + pan.y + (y - 0.5) * viewH * zoom
```

文字按 1:1 栅格化，任何 zoom 下都清晰；平移/缩放只是重新算坐标。

**等高线错位**：`MapCanvasStage` 的投影写成了

```
旧: centerX + left + (x/(hmW-1) - 0.5) * displayMapWidth
```

漏掉了 `left` 也要乘 `zoom`，还多算了一次画布中心，导致 1× 就偏 209px、放大后
越偏越多（屏幕右侧出现竖向折返线条）。正确形式是

```
originX = centerX + zoom * (left - width/2)
px(x)   = originX + x/(hmW-1) * displayWidth * zoom
```

同时修了同源的两处：`MapOverlayCanvas` 的选中环和 `hitMarker` 的命中检测都多加了
一次 `viewLeft/viewTop`（环会偏到左边、点图钉选不中）。

### P3.5 地图加载页

生成地形要 6–15 秒，原来的小 spinner 撑不起这个等待。新增 `MapLoader`：

- **背景**：canvas 上画 18 层等高线（reactbits `topography` 的同款思路），高度场由
  多个正弦脊叠加并缓慢漂移，marching squares 生成 iso-line；每 5 条加粗，再用径向
  渐变把边缘淡出到纸色，让中心的进度条成为焦点。
- **配色**：从主题 token 取 `--foreground` / `--background`（用一个隐藏探针元素读
  computed style），并在 `data-theme` 变化时重新取色——浅色下是深墨线，深色下是
  浅线，进度条永远与背景反色。
- **进度线**：1px 轨道 + `--foreground` 填充。生成时有真实百分比（复用
  `terrainProgress`），首屏拉取时是 28% 线段循环扫过；`prefers-reduced-motion`
  下退化为静态线。
- **位置**：生成时铺满地图卡片（`.map-canvas` 内，z-index 9，遮挡交互）；
  首屏拉取时用 `.map-loader-shell`（58vh 卡片）占据工作区。完成后进度停在 100%
  约 900ms 再淡出。

实测：动画期间稳定 60fps（最差帧 17ms），不影响服务端生成。

### P3.6 河流裁切、全屏加载页与 3D 等高线

**河流画到海里**：`_river_branches` 用填洼后的 `flow_surface` 判断陆地，而最终渲染
用的是侵蚀后的 `surface`——盆地被侵蚀成水面后，河流仍被画过去。客户端现在用
`surface` 再过滤一遍：支流起点在水下就跳过，主河干按点裁切（水下点断开路径）。
另外，低倍下 `lineWidth = 1/zoom` 会变成亚像素、断成虚线，改成「至少 1 个 CSS 像素」，
河流才连成完整网络。

**加载页全屏**：`.map-loader` 改为 `position: fixed; inset: 0; z-index: 90`，
盖住顶栏与侧栏；首屏不再用卡片容器（`.map-loader-shell` 变成 `display: contents`）。

**3D 等高线背景**：直接用 React Bits 的 `Topography`（`src/components/Topography.tsx`，
原样 vendored，仅去掉 `'use client'` 与 CSS import，并注释掉 cleanup 里的
`WEBGL_lose_context.loseContext()`——StrictMode 双挂载会把共享 context 弄丢，二次挂载
就全白）。它是真 WebGL2 地形：ray-march 高度场 + 4 级 bloom downsample/blur/composite，
参数在 `MapLoader` 里调到参考图的观感（`color #5b86ff`、26 条等高线、`glow .92`、
`brightness 1.28`、`depthOfField .25`、`fog .35`）。

加载页固定为暗色 splash（`#070a12` + 浅色进度线），深浅主题下都是同一个场景。

**参数**：直接采用 React Bits 播放器里的 **Mono 预设**——
`color #d4d4d8`、22 条线、`lineWidth 1`、`elevation 1`、`foreground .2`、`detail .35`、
`tilt 32°`、`speed .25`、`morph .2`、`glow .15`、`depthOfField 0`、`fog .35`、
`brightness 1.1`、`glitch .17`；交互 `hoverEffect "light"`、`clickEffect pulse`、
`mouseRadius 1`、`mouseStrength .6`、`trail .3`、`parallax .5`、`markers none`、`intro` 开。

**配色/排版**：线是中性灰白，所以外框固定暗色 splash（`#070a12`）+ 浅色进度线；
文案块 380px、gap 14px，进度条 1px 加双层蓝白辉光；scrim 用「中心椭圆 + 上下压暗」
两层渐变，亮线经过标题时仍然可读。

### P3.7 全站 Mono 配色

`styles/tokens.css` 的语义层整体收成中性灰阶（zinc / near-black），不再有任何色相：

- 暗色：`--background #0b0b0c`、`--card #17171a`、`--border #2a2a2e`、`--foreground #f4f4f5`
  （比原先的 `#18181b` 更接近 Mono 预设的近黑底）。
- 浅色：白底 + `#18181b` 墨色，`--border-strong #a1a1aa`。
- 语义色去色：`--success` → 前景色、`--destructive` → 前景色、`--accent-green` → `#a1a1aa`、
  `--ink-link/-marginal/-done` → 灰阶（链接靠下划线、marginalia 靠底色区分）。
- 危险操作失去红色后靠**虚线边框**区分（`.btn-danger`），错误条改成中性底 + 强边框 + 前景色文字，
  `.danger-zone b` 加下划线。`theme-color` 同步成 `#0b0b0c`。
- 加载页的蓝调文案/辉光也一并改成中性白。

地图底图（terrain PNG）仍是彩色内容，属于"图像内容"而非界面配色。

### P3.8 Explore 背景：React Bits Pattern Waves

`src/components/PatternWaves.tsx` 原样 vendored（MIT，仅去掉 `'use client'` 与 CSS import）。
它依赖 `ogl`（约 30KB 的 WebGL 库，本次新装 `ogl@1.0.11`），是真正的 dot-matrix
波纹表面：pattern（dot/square/plus/line/glyph）+ wave（silk/swell/ripple）+ 三级 bloom。

`ExploreBackdrop` 只做三件事：跟主题切色（暗 `#d4d4d8` / 浅 `#18181b`）、背景透明
（`rgba(0,0,0,0)`）、把参数固定成播放器里调好的那一组：
`spacing 14`、`markSize .95`、`depth 1.05`、`light 0`、`shine .8`、`contrast 1.2`、
`speed .35`、`scale 1`、`direction 44°`、`fade edges`、`fadeSize .5`、`opacity 1`、
`interactive`（`cursorSize 50`、`cursorStrength .6`）、`intro`、`paused false`。
叠加的 `.explore-backdrop::after` 径向 scrim 压暗左上 hero 区域，保证标题与说明可读。
Explore 页原本的「测量网格」背景（`.site-page` 的 72px 网格）在 `.site-page.explore-page` 上关掉——
波纹本身就是地面，两层纹理叠在一起太吵。
保留 `interactive`（鼠标划过有涟漪）与 `intro`。60fps。

Wiki 页面（`WikiPage` 的 `.site-page.wiki-page`，含世界首页与卡片页）复用同一个
backdrop，参数相同但 `opacity .4`，并关掉它的测量网格；SSR 下 `isLight()` 有
`typeof document` 保护，服务端只输出空容器、客户端 hydrate 后挂 WebGL。

之前那版手写的「微百叶 + 涟漪原点」canvas 实现已删除。

### P3.9 3D 预览：地图贴图 + 可调光照/材质

albedo 用地图 PNG（`textureData`，1280²），保证配色就是 2D 的那套；光照只在上面
叠一层克制的方向光，不改变材质本身的颜色倾向：

- `MeshPhongMaterial`（`specular 0x121a20`、`shininess 12`，高光默认很弱）；
- `AmbientLight 0.5` + `HemisphereLight 0.35` + `DirectionalLight 1.35`（白偏暖），
  环境光为主，方向光负责形体；
- `NoToneMapping`——之前的 ACES 会把颜色压灰；
- 阴影 2048² PCFSoft，`normalBias 0.02`、`bias -0.0006`。

面板：光方位 / 光高度 / 日光 / 天光 / 环境 / 高光 / 光泽 / 高度 / 自动旋转。

**海面（P3.10）**：改用 three 自带的 `three/examples/jsm/objects/Water.js`（Ocean 实现）。

- 法线贴图**程序化生成**（512²，fbm 高度场 → 法线编码）——three 的 npm 包不带
  `waternormals.jpg`，这样也不用新增资源；
- 反射用一张**竖直渐变天空**（`CanvasTexture`）塞进 `mirrorSampler`，省掉每帧再渲染一遍
  镜像场景；`alpha 0.55` 让海水本色压过反射；
- `waterColor 0x062b45`、`distortionScale 2.0`、`sunColor 0x7d8b96`（调暗，否则整片海泛白）、
  水面几何换成 4× 地图尺寸的 `PlaneGeometry`，海平线落在画面外；
- `time` uniform 每帧累加，涟漪持续流动（两帧截图 diff 已确认）。

**岸线接缝（P3.11）**：之前海陆交界是一条硬边，出戏。现在拆成两层：

- **海床**：把地形网格里"水格"的那部分单独建成 mesh，贴同一张地图 PNG、位置压到
  `y = -0.012`——它带着地图自己的近岸浅水色（青绿→深蓝的渐变）；
- **海面**：three 的 `Water` 设 `transparent: true`、`depthWrite: false`、`renderOrder: 1`，
  `alpha 0.55`，于是海床的浅水色透上来，岸线自然过渡；
- 顺手把 `distortionScale` 降到 1.1、`size` 提到 6.0，涟漪不再呈现明显的平铺纹理。

**真倒影（P3.12）**：不再用渐变天空顶替 `mirrorSampler`——`Water` 自带的
`onBeforeRender` 会构造镜像相机、算斜裁剪面，把整个场景渲染进它内部的
`WebGLRenderTarget`（现为 1024²），所以海面现在映得出岛影和天光。
代价是每帧多一次场景渲染；实测仍是 60fps（几何 16 万顶点，桌面端无压力）。

**水层（P3.13）——已回退**：曾把地形水格按离岸距离下沉造海床、按深度压暗顶点色、
再给海床注入程序化焦散，水面 alpha 降到 0.34 让海底透出来。观感偏"浑浊池水"，
与地图的干净配色冲突，用户要求回退。保留的是 P3.11 的海床（贴合地图、`y=-0.012`）
与 P3.12 的真倒影。

**单一深蓝海面（P3.14）**：用户要求"近海更深蓝、不要远海那块不同色的"。

- 去掉海床 mesh —— 它透过半透明水面显出的浅水色，正是"远海/近海两种色"的来源；
- 水面改不透明（`transparent false`、`alpha 1`），只剩一种蓝；
- **灰白的真正原因**：three 的 Water 在掠射角用
  `mix(水体, 0.1 + reflection*0.9, reflectance)`，反射权重一大就把海面洗成灰。
  用 `onBeforeCompile` 把反射项往水色拉：
  `reflectTint = mix(waterColor*1.35, reflectionSample, 0.42)`，
  且 `reflectance*0.68`、高光乘 0.45；
- 配色：`waterColor 0x062a44`、`sunColor 0x2f6d99`（偏蓝而不是灰）。

**天空盒（P3.15）**：原来的背景只是一张 2×256 的竖直渐变 `CanvasTexture`，
水面反射采样它时没有立体感。现在用**程序化立方体贴图**：

- 六个面各 256²，逐像素由方向向量求色：天顶→地平线渐变、地平线上方的暖色薄雾、
  云层带（fbm 噪声）、太阳本体（`dot(dir, sunDir)^900`）与光晕（`^22`）；
- 结果是 `CubeTexture`，既做 `scene.background`，也自动被 Water 的镜像相机渲染进去——
  **可见天空与水面反射来自同一张环境图**，所以交界处无缝；
- 面顺序按 three 的 `+x, -x, +y, -y, +z, -z` 约定，每个面用 `forward/up/right`
  基向量还原方向，避免接缝处出现错位的云或光斑。

`scene.fog` 同步调成 `0x0a1a24 / 18–34`，让远处地形和地平线同色。

**天空盒返工（P3.15b）**：第一版有明显接缝和错位的亮带——**立方体面的基向量写错了**。
three 的六个面方向是固定的：

| 面 | forward | up | right |
|---|---|---|---|
| +x | (1,0,0) | (0,-1,0) | (0,0,-1) |
| -x | (-1,0,0) | (0,-1,0) | (0,0,1) |
| +y | (0,1,0) | (0,0,1) | (1,0,0) |
| -y | (0,-1,0) | (0,0,-1) | (1,0,0) |
| +z | (0,0,1) | (0,-1,0) | (1,0,0) |
| -z | (0,0,-1) | (0,-1,0) | (-1,0,0) |

我第一版把 +x/-x 与 ±z 混用、up/right 也有对调，于是相邻面方向不连续 → 接缝处出现
错位的云和亮带。**天空盒返工 2（P3.15c）**：参照 `threejs-water` 的参考天空盒，重写成**白天积云**：

- 天空：地平线偏白的灰蓝 `rgb(132,170,205)` → 天顶深蓝 `rgb(36,86,162)`，
  `pow(h, 0.42)` 过渡；
- **积云用"平面投影"求值**——把视线投到一层平面：`layer = 1 / max(0.09, h + 0.09)`，
  再用 `fbm(dir.x*layer, dir.z*layer)` 取噪声。这样云有近大远小的透视，
  靠近地平线自然堆叠成云堤，而不是均匀糊一层；
- 云量 `smoothstep(0.52, 0.78, shape)`，受光面 `smoothstep(0.5, 0.95, …)` 提亮到
  近白（`rgb(196..248)`），背光留灰；
- 太阳日轮 `^1500` + 前向散射光晕 `^9`；
- 地平线以下淡出到海水色 `rgb(12,34,58)`，保证向下看的反射仍有合理颜色；
- 面分辨率 512²（原 320²），云的边缘不再毛糙。

水面因为用的是同一个 cubemap，云的倒影自动出现在海里。水体 `waterColor` 未改动。

**性能角标（P3.18）**：位置是**加载页（全屏地形生成遮罩）左下角**，四行 9.5–10px 等宽小字，纯前端：

| 行 | 内容 | 来源 |
|---|---|---|
| 地图配方 | `MAP topographic · 2048×1280 · seed 31415` | `world.terrain_web` |
| 机器 | `CPU 11C · RAM 16 GB` | `hardwareConcurrency` / `deviceMemory` |
| 显卡 | `GPU Apple M3 Pro · WebGL2` | `WEBGL_debug_renderer_info`（字符串做前缀清洗） |
| 实时 | `渲染 准备中 · 60 fps · 堆 88 MB` | `gpuActive` / rAF 1s 窗口 / `performance.memory` |

`PerfHud` 两种形态：`chip`（地图画布左下角，带细边框）与 `plain`（加载页，无边框、暗底淡墨）。
加载期间 `rendererMode` 传 `pending`，显示"渲染 准备中"；生成完成后切回 GPU/CPU 判定。
细节：`WEBGL_lose_context` 用完释放临时 canvas；`performance.memory` 仅 Chromium；窄屏隐藏配方行。

| 行 | 内容 | 来源 |
|---|---|---|
| 地图配方 | `MAP topographic · 2048×1280 · seed 31415` | `world.terrain_web` |
| 机器 | `CPU 11C · RAM 16 GB` | `navigator.hardwareConcurrency` / `deviceMemory` |
| 显卡 | `GPU Apple M3 Pro · WebGL2` | `WEBGL_debug_renderer_info`（字符串做前缀清洗） |
| 实时 | `渲染 GPU · 60 fps · 堆 75 MB` | `gpuActive` / rAF 计数 / `performance.memory` |

细节：`WEBGL_lose_context` 用完即释放临时 canvas；`performance.memory` 只有 Chromium 有，
Safari/Firefox 显示 `—`；窄屏（≤640px）隐藏配方行避免压住标记；3D 预览打开时整块隐藏。

**河流配色（P3.17）**：河流原本比海面亮一档（topographic `river (35,129,168)`，
而近岸 `shallow (23,100,116)`），看着像另一种水体。改调色板：

| 风格 | 旧 river | 新 river |
|---|---|---|
| atlas | (52,137,180) | (30,112,140) |
| topographic | (35,129,168) | (23,92,110) |

调色板同时驱动 **烘焙 PNG**（`web` 渲染）和 **前端河流 overlay**（`header.river`），
所以两边自动一致。

⚠️ 重新生成时的坑：`world.map_background` 的文件名是
`terrain-web-45678976-atlas.png`（历史遗留），但 `world.terrain_web` 里真正生效的是
`seed 31415 / topographic`。按文件名去"还原"会把世界换成另一张地图——**必须以
`terrain_web.seed/style` 为准**重新生成。

- 海面尺寸 4× → **60× 地图**，边的位置远在视距之外；
- `camera.far` 60 → 400，让放大的海面不被裁切；
- `scene.fog` 的颜色改成**天空地平线色** `0x84aacd`（和 P3.15c 的 `rgb(132,170,205)`
  完全一致），near/far = 42/120；
- `Water` 构造参数 `fog: false → true`，水面也吃雾。

于是远处海面淡入雾色、雾色又等于天空地平线色，海天之间只剩一条柔和的雾带。

- 去掉海床 mesh —— 它透过半透明水面显出的浅水色，正是"远海/近海两种色"的来源；
- 水面改成不透明（`transparent false`、`alpha 1`），只剩一种蓝；
- 加深：`waterColor 0x072c44`、`sunColor 0x59666f`（水面漫反射压暗，否则整片泛灰）。


- 顶点按三组正弦叠加做微弱位移（幅度 0.022），水面有起伏；
- 片元用同一组波的**解析梯度**扰动法线（`e = 0.12` 差分），得到细碎波光；
- 菲涅尔把深蓝 `0x0a3350` 混向天空色 `0x63 9e c4`（权重 0.24），掠射角泛白；
- 太阳高光 `pow(N·H, 340) * 0.5`，只在对准光线时闪；
- `uTime` 每帧更新，海面持续流动（已用两帧截图 diff 验证非静止）。

波长刻意选得"宽"（0.85–1.75），因为相机距离远，细波只会闪烁成噪点。

高度默认值保持 1.30 不动——上一轮误把"调高度"当成了任务目标。

### P3 遗留

1. 点缀是屏幕空间常量尺寸：放大时符号不变大，密度由仿真单元决定，因此 4× 下
   森林会比「放大后的 PNG」更稀疏（但锐利）。若要更密，需要按 zoom 采样更多
   符号或引入第二层更高频的 stipple。
2. 图框字体是等宽系统字体，非服务端 5×7 像素字，近距离对比可分辨。
3. 低端 GPU 未实测；支流 6070 条曲线仍每帧重绘。
4. 3D 预览与 GPU 2D 仍未共享纹理。
