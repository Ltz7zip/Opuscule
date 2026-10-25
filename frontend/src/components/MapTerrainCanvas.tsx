import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import { fetchMapFields } from "../api";
import { parseTerrainFields, type TerrainFields } from "../lib/terrainFields";

export interface MapTerrainCanvasHandle {
  /** Flat (hillshade-free) albedo snapshot of what the GPU map is showing. */
  captureFlat: () => string | null;
}

interface MapTerrainCanvasProps {
  slug: string;
  version: string;
  width: number;
  height: number;
  zoom: number;
  pan: { x: number; y: number };
  view: { left: number; top: number; width: number; height: number } | null;
  canvasBox: { width: number; height: number };
  onReady?: () => void;
  onError?: (error: unknown) => void;
}

interface GpuState {
  gl: WebGL2RenderingContext;
  terrainPos: number;
  marks: {
    program: WebGLProgram;
    buffer: WebGLBuffer;
    count: number;
    pos: number;
    type: number;
    level: number;
    uniforms: Record<string, WebGLUniformLocation | null>;
  } | null;
  uniforms: Record<string, WebGLUniformLocation | null>;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  textures: WebGLTexture[];
  fields: TerrainFields;
  tributaries: Path2D;
  stems: Array<{ path: Path2D; width: number }>;
  dispose: () => void;
}

const VERTEX = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// The fragment shader is the GPU twin of the pixel loop in
// backend/apps/maps/terrain_web.py: same LUTs, same hillshade, same coast
// blend.  Fields arrive quantised, so each sample is decoded with
// `min + value * span` before use.
const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_surface, u_toland, u_shade, u_moisture, u_uplift, u_forest;
uniform float u_shadeMix;
uniform sampler2D u_detail, u_elevLut, u_oceanLut;
uniform vec3 u_forestColor;
uniform vec2 u_grid, u_mapSize, u_viewOrigin, u_viewSize, u_pan, u_detailOff, u_detailSize;
uniform float u_zoom, u_sea, u_relief, u_dpr, u_canvasH;
out vec4 fragColor;

float tex1(sampler2D t, ivec2 p) { return texelFetch(t, p, 0).r; }
vec3 tex3(sampler2D t, int i) { return texelFetch(t, ivec2(i, 0), 0).rgb * 255.0; }

float smoothstepf(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

float bilin(sampler2D t, int ix0, int ix1, int iy0, int iy1, float fx, float fy) {
  float a = tex1(t, ivec2(ix0, iy0)) + (tex1(t, ivec2(ix1, iy0)) - tex1(t, ivec2(ix0, iy0))) * fx;
  float b = tex1(t, ivec2(ix0, iy1)) + (tex1(t, ivec2(ix1, iy1)) - tex1(t, ivec2(ix0, iy1))) * fx;
  return a + (b - a) * fy;
}

vec3 mixInt(vec3 a, vec3 b, float t) {
  t = clamp(t, 0.0, 1.0);
  return floor(a + (b - a) * t);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm3(vec2 p) {
  return (0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03) + 0.125 * vnoise(p * 4.01)) / 0.875;
}

// Mirror tiling keeps the relief texture continuous across tile borders when
// it is magnified; plain modulo repeats show a visible seam at every 384px.
vec2 mirrorDetail(vec2 p) {
  vec2 m = mod(p, 2.0 * u_detailSize);
  return abs(m - u_detailSize);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x / u_dpr, u_canvasH - gl_FragCoord.y / u_dpr);
  vec2 rel = (p - u_viewOrigin - 0.5 * u_viewSize - u_pan) / (u_viewSize * u_zoom);
  vec2 uv = rel + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    fragColor = vec4(0.0);
    return;
  }
  vec2 world = uv * u_mapSize;
  // Detail is baked at map resolution; past 1x it would be magnified into
  // visible texel blocks, so it slides towards screen-constant frequency and
  // a procedural octave fills the newly visible scale.
  float zoomT = clamp((u_zoom - 1.0) / 3.0, 0.0, 1.0);
  vec2 detailWorld = mix(world, world * u_zoom, zoomT);
  float gw = u_grid.x;
  float gh = u_grid.y;
  float gx = world.x / u_mapSize.x * gw - 0.5;
  float gy = world.y / u_mapSize.y * gh - 0.5;
  int ix = int(floor(gx));
  int iy = int(floor(gy));
  int ix0 = clamp(ix, 0, int(gw) - 1), ix1 = clamp(ix + 1, 0, int(gw) - 1);
  int iy0 = clamp(iy, 0, int(gh) - 1), iy1 = clamp(iy + 1, 0, int(gh) - 1);
  float fx = gx - float(ix);
  float fy = gy - float(iy);

  float h = bilin(u_surface, ix0, ix1, iy0, iy1, fx, fy);
  float sh = bilin(u_shade, ix0, ix1, iy0, iy1, fx, fy);
  // Bilinear distance/moisture/uplift keep the shelf bands and forest edges
  // smooth when zoomed; the CPU renderer used nearest cells because it was
  // evaluated per output pixel.
  float dLand = bilin(u_toland, ix0, ix1, iy0, iy1, fx, fy);
  float t = clamp((h - u_sea) / u_relief, 0.0, 1.0);
  vec3 color;
  float factor;

  if (h <= u_sea) {
    color = tex3(u_oceanLut, min(32, int(dLand * 2.0)));
    factor = 0.90 + sh * 0.08;
  } else {
    float uplift = bilin(u_uplift, ix0, ix1, iy0, iy1, fx, fy);
    float mountain = clamp((uplift - 0.04) * 5.0, 0.0, 1.0);
    vec2 detailUV = detailWorld + u_detailOff;
    vec2 detailUVx = detailUV + vec2(1.0, 0.0);
    vec2 detailUVy = detailUV + vec2(0.0, 1.0);
    ivec2 dc = ivec2(floor(mirrorDetail(detailUV)));
    float dv = tex1(u_detail, dc) * 255.0;
    float dvx = tex1(u_detail, ivec2(floor(mirrorDetail(detailUVx)))) * 255.0;
    float dvy = tex1(u_detail, ivec2(floor(mirrorDetail(detailUVy)))) * 255.0;
    float ridge = (dv - 127.5) / 127.5;
    float ridgeDx = (dvx - dv) / 127.5;
    float ridgeDy = (dvy - dv) / 127.5;
    // The baked relief tile shows mirror creases under the hillshade once it
    // is magnified, so it fades out by ~2x and a procedural octave with its
    // own gradient takes over: no tile boundary, new detail at every zoom.
    float textureWeight = clamp(1.0 - (u_zoom - 1.0) / 1.2, 0.0, 1.0);
    ridge *= textureWeight;
    ridgeDx *= textureWeight;
    ridgeDy *= textureWeight;
    if (zoomT > 0.0) {
      // Screen-consistent relief: keep features at ~3 screen pixels instead of
      // multiplying world frequency by zoom, which aliases into flat mush at 4x.
      float pxPerMap = (u_viewSize.x * u_zoom) / u_mapSize.x;
      float freq = max(0.25, 0.30 * pxPerMap);
      vec2 mp = world * freq;
      float m0 = fbm3(mp) - 0.47;
      float mx = fbm3(mp + vec2(0.6, 0.0)) - 0.47;
      float my = fbm3(mp + vec2(0.0, 0.6)) - 0.47;
      float amp = 0.9 * zoomT;
      ridge += m0 * amp;
      ridgeDx += (mx - m0) * amp * 1.6;
      ridgeDy += (my - m0) * amp * 1.6;
    }
    t = clamp(t + ridge * (0.014 + 0.040 * mountain), 0.0, 1.0);
    sh = sh + ridge * (0.045 + 0.070 * mountain);
    sh = sh - (ridgeDx * 0.58 + ridgeDy * 0.38) * (0.35 + 0.50 * mountain);
    color = tex3(u_elevLut, min(255, int(t * 256.0)));
    float mo = bilin(u_moisture, ix0, ix1, iy0, iy1, fx, fy);
    if (mo > 0.48 && t < 0.72) {
      color = mixInt(color, u_forestColor, smoothstepf(0.48, 0.72, mo) * 0.38);
    }
    factor = clamp(0.74 + (sh - 0.78) * 1.85, 0.60, 1.28);
  }

  float landT = smoothstepf(u_sea - 0.0022, u_sea + 0.0022, h);
  if (h > u_sea && dLand < 1.5) {
    color = mixInt(tex3(u_oceanLut, min(32, int(dLand * 2.0))), color, landT);
  }

  // u_shadeMix = 0 turns the shader into a flat albedo generator: same LUTs,
  // no hillshade, so a 3D host can light the surface itself.
  float litFactor = mix(1.0, factor, u_shadeMix);
  float r = color.r * litFactor;
  float g = color.g * litFactor;
  float b = color.b * litFactor;
  if (h > u_sea) {
    r = min(255.0, r * 1.02);
    b = max(0.0, b * 0.98);
  }
  vec3 rgb = clamp(floor(vec3(r, g, b)), 0.0, 255.0);
  fragColor = vec4(rgb / 255.0, 1.0);
}`;

const POINT_VERTEX = `#version 300 es
in vec2 a_pos;
in float a_type;
in float a_level;
uniform vec2 u_mapSize, u_viewOrigin, u_viewSize, u_pan, u_canvasSize;
uniform float u_zoom, u_dpr;
out float v_type;
out float v_alpha;
void main() {
  // Extra density layers fade in as the map is magnified: the simulator only
  // has one mark per cell, so the second/third layer jitter sub-marks inside
  // qualifying cells instead of inventing new terrain data.
  float threshold = a_level < 0.5 ? -1.0 : (a_level < 1.5 ? 1.6 : 2.8);
  v_alpha = threshold < 0.0 ? 1.0 : smoothstep(threshold, threshold + 0.5, u_zoom);
  v_type = a_type;
  if (v_alpha <= 0.001) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec2 rel = (a_pos / u_mapSize - 0.5) * u_viewSize * u_zoom + 0.5 * u_viewSize + u_viewOrigin + u_pan;
  vec2 clip = vec2(rel.x / u_canvasSize.x * 2.0 - 1.0, 1.0 - rel.y / u_canvasSize.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  // Screen-space symbols: constant size in CSS pixels, so zooming never
  // magnifies a baked stipple.
  float size = a_type > 3.5 ? 6.0 : (a_type > 1.5 ? 4.4 : 4.0);
  size *= 1.0 + 0.10 * max(0.0, u_zoom - 1.0);
  gl_PointSize = size * u_dpr;
}`;

const POINT_FRAGMENT = `#version 300 es
precision highp float;
in float v_type;
in float v_alpha;
out vec4 fragColor;
void main() {
  vec2 p = gl_PointCoord;
  vec3 color;
  float alpha = 0.0;
  if (v_type < 0.5) {
    color = vec3(0.125, 0.298, 0.169);
    alpha = (abs(p.x - 0.5) < 0.34 || abs(p.y - 0.5) < 0.34) ? 0.9 : 0.0;
  } else if (v_type < 3.0) {
    color = vec3(0.271, 0.255, 0.224);
    alpha = abs(p.x - p.y) < 0.26 ? 0.85 : 0.0;
  } else {
    color = vec3(0.055, 0.169, 0.259);
    alpha = (abs(p.y - 0.5) < 0.2 && abs(p.x - 0.5) < 0.46) ? 0.6 : 0.0;
  }
  alpha *= v_alpha;
  if (alpha < 0.01) discard;
  fragColor = vec4(color, alpha);
}`;

const UNIFORM_NAMES = [
  "u_shadeMix",
  "u_surface",
  "u_toland",
  "u_shade",
  "u_moisture",
  "u_uplift",
  "u_forest",
  "u_detail",
  "u_elevLut",
  "u_oceanLut",
  "u_forestColor",
  "u_grid",
  "u_mapSize",
  "u_viewOrigin",
  "u_viewSize",
  "u_pan",
  "u_detailOff",
  "u_detailSize",
  "u_zoom",
  "u_sea",
  "u_relief",
  "u_dpr",
  "u_canvasH",
] as const;

type UniformName = (typeof UNIFORM_NAMES)[number];
type Uniforms = Record<UniformName, WebGLUniformLocation | null>;

function compile(gl: WebGL2RenderingContext, source: string, kind: number): WebGLShader {
  const shader = gl.createShader(kind);
  if (!shader) throw new Error("无法创建着色器");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "着色器编译失败");
  }
  return shader;
}

function makeTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  internal: number,
  format: number,
  type: number,
  data: ArrayBufferView,
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("无法创建纹理");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, data);
  return texture;
}

function buildDecor(
  fields: TerrainFields,
  surface: Float32Array,
): Pick<GpuState, "tributaries" | "stems"> {
  const { header } = fields;
  const tributaryValues = fields.u16("tributaries");
  const tributaries = new Path2D();
  // Flow routing runs on a filled surface, so a branch can sit where the
  // eroded height ended up under water.  Drop those segments instead of
  // painting rivers across lakes and the open sea.
  const { gw, gh, sea, width, height } = header;
  const dry = (nx: number, ny: number) => {
    const cx = Math.min(gw - 1, Math.max(0, Math.floor(nx * gw)));
    const cy = Math.min(gh - 1, Math.max(0, Math.floor(ny * gh)));
    return surface[cy * gw + cx] > sea + 0.002;
  };
  for (let i = 0; i + 4 < tributaryValues.length; i += 5) {
    const x0 = (tributaryValues[i] / 65535) * header.width;
    const y0 = (tributaryValues[i + 1] / 65535) * header.height;
    const x1 = (tributaryValues[i + 2] / 65535) * header.width;
    const y1 = (tributaryValues[i + 3] / 65535) * header.height;
    const bend = (tributaryValues[i + 4] - 4) / 9;
    if (!dry(tributaryValues[i] / 65535, tributaryValues[i + 1] / 65535)) continue;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.hypot(dx, dy) || 1;
    const curve = bend * length * 0.28;
    const cx = (x0 + x1) / 2 - (dy / length) * curve;
    const cy = (y0 + y1) / 2 + (dx / length) * curve;
    tributaries.moveTo(x0, y0);
    tributaries.quadraticCurveTo(cx, cy, x1, y1);
  }

  const stems = header.rivers.map((stem) => {
    const path = new Path2D();
    let drawing = false;
    stem.pts.forEach(([x, y], index) => {
      const px = x * width;
      const py = y * height;
      const land = dry(x, y);
      if (!land) {
        drawing = false;
        return;
      }
      if (!drawing) path.moveTo(px, py);
      else path.lineTo(px, py);
      drawing = true;
      void index;
    });
    const ratio = Math.max(1, stem.acc) / Math.max(1, header.river_cut);
    const base = 4 + Math.trunc(Math.min(3, Math.max(0, Math.log10(ratio) * 1.5)));
    return { path, width: Math.max(2, base * 0.8) };
  });

  return { tributaries, stems };
}

/** Atlas-only stipple marks: trees, rock ticks and deep-water dashes.
 *
 * Mirrors the `style == "atlas"` block in backend/apps/maps/terrain_web.py and
 * returns one point per mark (x, y in map pixels, plus a glyph id) so the GPU
 * can draw screen-space symbols: unlike a baked bitmap these stay sharp at any
 * zoom.
 */
function buildAtlasMarks(
  fields: TerrainFields,
  surface: Float32Array,
  toLand: Float32Array,
  forest: Float32Array,
): Float32Array | null {
  if (fields.header.style !== "atlas") return null;
  const { gw, gh, width, height, sea, relief } = fields.header;
  const cell = Math.min(width / gw, height / gh);
  const marks: number[] = [];
  const push = (x: number, y: number, kind: number, level: number) => {
    marks.push(x, y, kind, level);
  };
  const jitter = (x: number, y: number, layer: number, slot: number) => {
    const h = ((x * 2654435761) ^ (y * 40503) ^ (layer * 1013904223) ^ (slot * 2246822519)) >>> 0;
    return 0.12 + ((h >>> 8) % 1000) / 1000 * 0.76;
  };
  const addLayers = (x: number, y: number, kind: number, cell: number) => {
    push(x, y, kind, 0);
    for (let layer = 1; layer <= 2; layer += 1) {
      const chance = ((cell >>> (layer * 3)) & 7) / 7;
      const limit = layer === 1 ? 0.75 : 0.65;
      if (chance > limit) continue;
      for (let slot = 0; slot < 3; slot += 1) {
        const hx = jitter(x, y, layer, slot);
        const hy = jitter(y, x, layer, slot + 7);
        push(x + (hx - 0.5) * cell, y + (hy - 0.5) * cell, kind, layer);
      }
    }
  };

  for (let y = 1; y < gh - 1; y += 1) {
    for (let x = 1; x < gw - 1; x += 1) {
      const i = y * gw + x;
      if (surface[i] <= sea) continue;
      const hsh = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      const t = (surface[i] - sea) / relief;
      const dx = (surface[y * gw + x + 1] - surface[y * gw + x - 1]) * 18;
      const dy = (surface[(y + 1) * gw + x] - surface[(y - 1) * gw + x]) * 16;
      const slope = Math.min(1, Math.hypot(dx, dy) * 1.8);
      if (forest[i] > 0.58 && slope < 0.4 && t < 0.7) {
        if (hsh % 2 === 0) {
          const px = ((x + 0.5 + (((hsh >>> 7) % 7) - 3) * 0.055) / gw) * width;
          const py = ((y + 0.5 + (((hsh >>> 11) % 7) - 3) * 0.055) / gh) * height;
          addLayers(px, py, 0, (x * 31 + y * 17) >>> 0);
        }
      } else if (t > 0.62 && slope > 0.34 && hsh % 5 === 0) {
        const px = ((x + 0.5) / gw) * width;
        const py = ((y + 0.5) / gh) * height;
        addLayers(px, py, 2, (x * 13 + y * 29) >>> 0);
      }
    }
  }

  for (let y = 2; y < gh - 2; y += 1) {
    for (let x = 2; x < gw - 2; x += 1) {
      const i = y * gw + x;
      if (surface[i] > sea || toLand[i] < 2) continue;
      const hsh = ((x * 83492791) ^ (y * 2971215073)) >>> 0;
      if (hsh % 19 !== 0) continue;
      const px = ((x + 0.5) / gw) * width;
      const py = ((y + 0.5) / gh) * height;
      addLayers(px, py, 4, (x * 7 + y * 23) >>> 0);
    }
  }
  return new Float32Array(marks);
}

/** Cartouche and scale bar, drawn in map space so they scale like the PNG. */
function drawFurniture(ctx: CanvasRenderingContext2D, header: TerrainFields["header"]) {
  const { width, height, paper, panel } = header;
  if (!paper || !panel) return;
  const ui = Math.max(1, width / 1280);
  const cartScale = Math.max(2, Math.round(2 * ui));
  const labelScale = Math.max(1, Math.round(ui));
  const x = width * 0.27;
  const y = 24 * ui;
  ctx.fillStyle = `rgba(${panel.join(",")},0.82)`;
  ctx.fillRect(x, y, 310 * ui, 52 * ui);
  ctx.fillStyle = `rgb(${paper.join(",")})`;
  ctx.textBaseline = "top";
  ctx.font = `600 ${7 * cartScale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText("TERRAIN WEB", x + 14 * ui, y + 10 * ui);
  ctx.font = `${7 * labelScale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const seed = String(header.seed % 100000).padStart(5, "0");
  ctx.fillText(`SEED ${seed}  /  ${header.style.toUpperCase()}`, x + 14 * ui, y + 28 * ui);

  const sx = width * 0.27;
  const sy = height - 34 * ui;
  const sw = 170 * ui;
  const tick = 5 * ui;
  ctx.strokeStyle = `rgb(${paper.join(",")})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + sw, sy);
  ctx.moveTo(sx, sy - tick);
  ctx.lineTo(sx, sy + tick);
  ctx.moveTo(sx + sw, sy - tick);
  ctx.lineTo(sx + sw, sy + tick);
  ctx.stroke();
  ctx.fillText("500 KM", sx, sy + 9 * ui);
}

function initGpu(canvas: HTMLCanvasElement | null, fields: TerrainFields): GpuState | null {
  if (!canvas) return null;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;

  const vertex = compile(gl, VERTEX, gl.VERTEX_SHADER);
  const fragment = compile(gl, FRAGMENT, gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("无法创建着色器程序");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "着色器链接失败");
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("无法创建顶点缓冲");
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const { header } = fields;
  // WebGL2 rejects R16 textures on some drivers, so quantised blocks are
  // decoded once into float32 and uploaded as R32F (the shader stays simple).
  const decode = (name: string): Float32Array => {
    const block = fields.block(name);
    const raw = block.dtype === "u16" ? fields.u16(name) : fields.bytes(name);
    const data = new Float32Array(block.n);
    for (let i = 0; i < block.n; i += 1) data[i] = block.min + raw[i] * block.scale;
    return data;
  };
  const surfaceData = decode("surface");
  const toLandData = decode("to_land");
  const forestData = decode("forest");
  const textures = [
    makeTexture(gl, header.gw, header.gh, gl.R32F, gl.RED, gl.FLOAT, surfaceData),
    makeTexture(gl, header.gw, header.gh, gl.R32F, gl.RED, gl.FLOAT, toLandData),
    makeTexture(gl, header.gw, header.gh, gl.R32F, gl.RED, gl.FLOAT, decode("shade")),
    makeTexture(gl, header.gw, header.gh, gl.R32F, gl.RED, gl.FLOAT, decode("moisture")),
    makeTexture(gl, header.gw, header.gh, gl.R32F, gl.RED, gl.FLOAT, decode("uplift")),
    makeTexture(gl, header.gw, header.gh, gl.R32F, gl.RED, gl.FLOAT, forestData),
    makeTexture(gl, header.detail_w, header.detail_h, gl.R8, gl.RED, gl.UNSIGNED_BYTE, fields.bytes("detail")),
    makeTexture(gl, 256, 1, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, fields.bytes("elev_lut")),
    makeTexture(gl, 33, 1, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, fields.bytes("ocean_lut")),
  ];
  textures.forEach((texture, index) => {
    gl.activeTexture(gl.TEXTURE0 + index);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  });

  const uniforms = Object.fromEntries(
    UNIFORM_NAMES.map((name) => [name, gl.getUniformLocation(program, name)]),
  ) as Uniforms;

  const markData = buildAtlasMarks(fields, surfaceData, toLandData, forestData);
  let marks: GpuState["marks"] = null;
  if (markData && markData.length >= 3) {
    const pointVertex = compile(gl, POINT_VERTEX, gl.VERTEX_SHADER);
    const pointFragment = compile(gl, POINT_FRAGMENT, gl.FRAGMENT_SHADER);
    const pointProgram = gl.createProgram();
    if (!pointProgram) throw new Error("无法创建点缀程序");
    gl.attachShader(pointProgram, pointVertex);
    gl.attachShader(pointProgram, pointFragment);
    gl.linkProgram(pointProgram);
    if (!gl.getProgramParameter(pointProgram, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(pointProgram) ?? "点缀程序链接失败");
    }
    const pointBuffer = gl.createBuffer();
    if (!pointBuffer) throw new Error("无法创建点缀缓冲");
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, markData, gl.STATIC_DRAW);
    marks = {
      program: pointProgram,
      buffer: pointBuffer,
      count: markData.length / 4,
      pos: gl.getAttribLocation(pointProgram, "a_pos"),
      type: gl.getAttribLocation(pointProgram, "a_type"),
      level: gl.getAttribLocation(pointProgram, "a_level"),
      uniforms: Object.fromEntries(
        ["u_mapSize", "u_viewOrigin", "u_viewSize", "u_pan", "u_zoom", "u_dpr", "u_canvasSize"].map(
          (name) => [name, gl.getUniformLocation(pointProgram, name)],
        ),
      ),
    };
  }

  const dispose = () => {
    textures.forEach((texture) => gl.deleteTexture(texture));
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    if (marks) {
      gl.deleteBuffer(marks.buffer);
      gl.deleteProgram(marks.program);
    }
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };

  const terrainPos = gl.getAttribLocation(program, "a_pos");
  return { gl, program, buffer, terrainPos, textures, fields, uniforms, dispose, marks, ...buildDecor(fields, surfaceData) };
}

const MapTerrainCanvas = forwardRef<MapTerrainCanvasHandle, MapTerrainCanvasProps>(function MapTerrainCanvas({
  slug,
  version,
  width,
  height,
  zoom,
  pan,
  view,
  canvasBox,
  onReady,
  onError,
}: MapTerrainCanvasProps, ref) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const riverRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GpuState | null>(null);
  const flatRef = useRef(false);
  const [ready, setReady] = useState(false);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };

  useEffect(() => {
    let cancelled = false;
    const canvas = glRef.current;
    const onContextLost = (event: Event) => {
      event.preventDefault();
      callbacks.current.onError?.(new Error("WebGL 上下文丢失"));
    };
    canvas?.addEventListener("webglcontextlost", onContextLost);
    setReady(false);
    (async () => {
      try {
        const payload = await fetchMapFields(slug, version);
        if (cancelled) return;
        const fields = parseTerrainFields(payload);
        const state = initGpu(glRef.current, fields);
        if (!state) throw new Error("浏览器不支持 WebGL2");
        stateRef.current?.dispose();
        stateRef.current = state;
        if (cancelled) return;
        setReady(true);
        callbacks.current.onReady?.();
      } catch (error) {
        if (cancelled) return;
        stateRef.current?.dispose();
        stateRef.current = null;
        callbacks.current.onError?.(error);
      }
    })();
    return () => {
      cancelled = true;
      canvas?.removeEventListener("webglcontextlost", onContextLost);
      stateRef.current?.dispose();
      stateRef.current = null;
    };
  }, [slug, version]);

  const draw = useCallback(() => {
    const state = stateRef.current;
    const glCanvas = glRef.current;
    const riverCanvas = riverRef.current;
    if (!state || !glCanvas || !riverCanvas || !view || canvasBox.width < 2 || canvasBox.height < 2) {
      return;
    }
    const { gl, uniforms, fields } = state;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(canvasBox.width * dpr);
    const pixelHeight = Math.round(canvasBox.height * dpr);
    if (glCanvas.width !== pixelWidth || glCanvas.height !== pixelHeight) {
      glCanvas.width = pixelWidth;
      glCanvas.height = pixelHeight;
    }
    if (riverCanvas.width !== pixelWidth || riverCanvas.height !== pixelHeight) {
      riverCanvas.width = pixelWidth;
      riverCanvas.height = pixelHeight;
    }

    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(state.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
    gl.enableVertexAttribArray(state.terrainPos);
    gl.vertexAttribPointer(state.terrainPos, 2, gl.FLOAT, false, 0, 0);
    const set1f = (name: UniformName, value: number) => gl.uniform1f(uniforms[name], value);
    const set2f = (name: UniformName, x: number, y: number) => gl.uniform2f(uniforms[name], x, y);

    gl.uniform1i(uniforms.u_surface, 0);
    gl.uniform1i(uniforms.u_toland, 1);
    gl.uniform1i(uniforms.u_shade, 2);
    gl.uniform1i(uniforms.u_moisture, 3);
    gl.uniform1i(uniforms.u_uplift, 4);
    gl.uniform1i(uniforms.u_forest, 5);
    gl.uniform1i(uniforms.u_detail, 6);
    gl.uniform1i(uniforms.u_elevLut, 7);
    gl.uniform1i(uniforms.u_oceanLut, 8);

    set2f("u_grid", fields.header.gw, fields.header.gh);
    set2f("u_mapSize", width, height);
    set2f("u_viewOrigin", view.left, view.top);
    set2f("u_viewSize", view.width, view.height);
    set2f("u_pan", pan.x, pan.y);
    set2f("u_detailOff", fields.header.detail_off_x, fields.header.detail_off_y);
    set2f("u_detailSize", fields.header.detail_w, fields.header.detail_h);
    set1f("u_zoom", zoom);
    set1f("u_shadeMix", flatRef.current ? 0 : 1);
    set1f("u_sea", fields.header.sea);
    set1f("u_relief", fields.header.relief);
    set1f("u_dpr", dpr);
    set1f("u_canvasH", canvasBox.height);
    gl.uniform3f(uniforms.u_forestColor, ...fields.header.forest);


    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (state.marks && state.marks.count > 0) {
      const layer = state.marks;
      gl.useProgram(layer.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, layer.buffer);
      gl.enableVertexAttribArray(layer.pos);
      gl.vertexAttribPointer(layer.pos, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(layer.type);
      gl.vertexAttribPointer(layer.type, 1, gl.FLOAT, false, 16, 8);
      gl.enableVertexAttribArray(layer.level);
      gl.vertexAttribPointer(layer.level, 1, gl.FLOAT, false, 16, 12);
      gl.uniform2f(layer.uniforms.u_mapSize, width, height);
      gl.uniform2f(layer.uniforms.u_viewOrigin, view.left, view.top);
      gl.uniform2f(layer.uniforms.u_viewSize, view.width, view.height);
      gl.uniform2f(layer.uniforms.u_pan, pan.x, pan.y);
      gl.uniform2f(layer.uniforms.u_canvasSize, canvasBox.width, canvasBox.height);
      gl.uniform1f(layer.uniforms.u_zoom, zoom);
      gl.uniform1f(layer.uniforms.u_dpr, dpr);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, layer.count);
      gl.disable(gl.BLEND);
    }

    const context = riverCanvas.getContext("2d");
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    const scaleX = (view.width * zoom) / width;
    const scaleY = (view.height * zoom) / height;
    const originX = view.left + view.width / 2 + pan.x - (view.width * zoom) / 2;
    const originY = view.top + view.height / 2 + pan.y - (view.height * zoom) / 2;
    context.setTransform(dpr * scaleX, 0, 0, dpr * scaleY, dpr * originX, dpr * originY);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = `rgb(${fields.header.river.join(",")})`;
    // One CSS pixel regardless of zoom: sub-pixel strokes break into dashes
    // once the map is scaled down, which reads as a broken river network.
    const minWidth = 1 / scaleX;
    context.lineWidth = minWidth;
    context.stroke(state.tributaries);
    for (const stem of state.stems) {
      context.lineWidth = Math.max(stem.width / zoom, minWidth * 1.6);
      context.stroke(stem.path);
    }
    drawFurniture(context, fields.header);
  }, [canvasBox.height, canvasBox.width, height, pan.x, pan.y, view, width, zoom]);

  useImperativeHandle(
    ref,
    () => ({
      captureFlat: () => {
        const state = stateRef.current;
        if (!state) return null;
        const { gl, uniforms, fields } = state;
        // Render a full-resolution, hillshade-free copy of the whole map into
        // an offscreen target: a viewport-sized grab is far too soft to skin a
        // 3D model (that was the "mushy" look).
        const mapSide = Math.max(fields.header.width, fields.header.height);
        const size = Math.min(2048, Math.max(1024, 2 ** Math.ceil(Math.log2(mapSide))));
        const target = gl.createTexture();
        const framebuffer = gl.createFramebuffer();
        if (!target || !framebuffer) return null;
        // Allocate on a spare texture unit: binding it on unit 0 would replace
        // the u_surface sampler and (attached to the FBO) create a feedback
        // loop that reads back as fully transparent.
        gl.activeTexture(gl.TEXTURE15);
        gl.bindTexture(gl.TEXTURE_2D, target);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
        gl.viewport(0, 0, size, size);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Program, geometry and sampler units must be re-bound for this pass:
        // three's draw() state is per-call, not persistent.
        gl.useProgram(state.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
        gl.enableVertexAttribArray(state.terrainPos);
        gl.vertexAttribPointer(state.terrainPos, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1i(uniforms.u_surface, 0);
        gl.uniform1i(uniforms.u_toland, 1);
        gl.uniform1i(uniforms.u_shade, 2);
        gl.uniform1i(uniforms.u_moisture, 3);
        gl.uniform1i(uniforms.u_uplift, 4);
        gl.uniform1i(uniforms.u_forest, 5);
        gl.uniform1i(uniforms.u_detail, 6);
        gl.uniform1i(uniforms.u_elevLut, 7);
        gl.uniform1i(uniforms.u_oceanLut, 8);
        // Full-map framing, 1:1 with the offscreen grid.
        const set1f = (name: UniformName, value: number) => gl.uniform1f(uniforms[name], value);
        const set2f = (name: UniformName, x: number, y: number) => gl.uniform2f(uniforms[name], x, y);
        set2f("u_grid", fields.header.gw, fields.header.gh);
        set2f("u_detailOff", fields.header.detail_off_x, fields.header.detail_off_y);
        set2f("u_detailSize", fields.header.detail_w, fields.header.detail_h);
        set1f("u_sea", fields.header.sea);
        set1f("u_relief", fields.header.relief);
        gl.uniform3f(uniforms.u_forestColor, ...fields.header.forest);
        set2f("u_viewSize", size, size);
        set2f("u_viewOrigin", 0, 0);
        set2f("u_pan", 0, 0);
        set2f("u_mapSize", size, size);
        set1f("u_zoom", 1);
        set1f("u_dpr", 1);
        set1f("u_canvasH", size);
        set1f("u_shadeMix", 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        const pixels = new Uint8Array(size * size * 4);
        gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(target);
        draw();

        const flipped = new Uint8ClampedArray(pixels.length);
        for (let row = 0; row < size; row += 1) {
          const from = (size - 1 - row) * size * 4;
          flipped.set(pixels.subarray(from, from + size * 4), row * size * 4);
        }
        const flat = document.createElement("canvas");
        flat.width = size;
        flat.height = size;
        const ctx = flat.getContext("2d");
        if (!ctx) return null;
        ctx.putImageData(new ImageData(flipped, size, size), 0, 0);
        // Rivers are drawn on a separate 2D overlay at viewport resolution;
        // scale it over the map so the 3D skin keeps the same linework.
        const riverCanvas = riverRef.current;
        if (riverCanvas && riverCanvas.width > 0) {
          const srcSize = Math.min(riverCanvas.width, riverCanvas.height);
          ctx.drawImage(
            riverCanvas,
            Math.round((riverCanvas.width - srcSize) / 2),
            Math.round((riverCanvas.height - srcSize) / 2),
            srcSize,
            srcSize,
            0,
            0,
            size,
            size,
          );
        }
        return flat.toDataURL("image/png");
      },
    }),
    [draw],
  );

  useEffect(() => {
    draw();
  }, [draw, ready]);

  return (
    <div className="map-terrain-gpu" aria-hidden="true">
      <canvas ref={glRef} className="map-terrain-gl" />
      <canvas ref={riverRef} className="map-terrain-rivers" />
    </div>
  );
});

export default MapTerrainCanvas;
