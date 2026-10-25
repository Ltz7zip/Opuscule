import { useEffect, useRef, useState } from "react";
import {
  NoToneMapping,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  PCFSoftShadowMap,
  PlaneGeometry,
  RepeatWrapping,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CubeTexture,
  Color,
  Fog,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  Vector3,
  MeshPhongMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Water } from "three/examples/jsm/objects/Water.js";
import { Loader2, RotateCw, Sun } from "lucide-react";

interface Terrain3DPreviewProps {
  mesh: string;
  meshWidth: number;
  meshHeight: number;
  textureData: string;
  /** Flat (hillshade-free) albedo captured from the GPU 2D map. */
  albedoData?: string;
  /** Full-resolution map PNG: pixel-identical to what the 2D view shows. */
  albedoUrl?: string;
  onClose: () => void;
}

type Grade = [number, number, number];

const GRADES: Array<[number, Grade]> = [
  [0.002, [0.62, 0.56, 0.42]],
  [0.007, [0.23, 0.35, 0.16]],
  [0.20, [0.15, 0.27, 0.12]],
  [0.46, [0.33, 0.30, 0.26]],
  [0.64, [0.47, 0.43, 0.37]],
  [0.72, [0.90, 0.92, 0.92]],
  [1.01, [0.98, 0.98, 0.97]],
];

function gradeFor(value: number): Grade {
  for (let i = 0; i < GRADES.length; i += 1) {
    if (value <= GRADES[i][0]) {
      const previous = i === 0 ? [0.91, 0.84, 0.65] : GRADES[i - 1][1];
      const span = i === 0 ? GRADES[i][0] : GRADES[i][0] - GRADES[i - 1][0];
      const t = i === 0 ? 1 : Math.min(1, Math.max(0, (value - GRADES[i - 1][0]) / span));
      return [
        previous[0] + (GRADES[i][1][0] - previous[0]) * t,
        previous[1] + (GRADES[i][1][1] - previous[1]) * t,
        previous[2] + (GRADES[i][1][2] - previous[2]) * t,
      ];
    }
  }
  return GRADES[GRADES.length - 1][1];
}

function smoothNoise(x: number, z: number): number {
  return x * x * (3 - 2 * x) * (z * z * (3 - 2 * z));
}

function hashNoise(ix: number, iz: number): number {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = smoothNoise(fx, fz);
  const a = hashNoise(ix, iz);
  const b = hashNoise(ix + 1, iz);
  const c = hashNoise(ix, iz + 1);
  const d = hashNoise(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * fz + (a - b - c + d) * u * fz;
}

function fbm(x: number, z: number): number {
  let value = 0;
  let amplitude = 0.5;
  for (let octave = 0; octave < 4; octave += 1) {
    value += valueNoise(x, z) * amplitude;
    x *= 2.03;
    z *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

function decodeMesh(base64: string): Uint8Array {
  const binary = atob(base64);
  const levels = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) levels[i] = binary.charCodeAt(i);
  return levels;
}

export default function Terrain3DPreview({ mesh, meshWidth, meshHeight, textureData, albedoData, albedoUrl, onClose }: Terrain3DPreviewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sunRef = useRef<DirectionalLight | null>(null);
  const skyRef = useRef<HemisphereLight | null>(null);
  const ambientRef = useRef<AmbientLight | null>(null);
  const materialRef = useRef<MeshPhongMaterial | null>(null);
  const waterRef = useRef<Water | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [heightScale, setHeightScale] = useState(1.3);
  const [azimuth, setAzimuth] = useState(42);
  const [elevation, setElevation] = useState(34);
  const [sunLevel, setSunLevel] = useState(1.35);
  const [skyLevel, setSkyLevel] = useState(0.35);
  const [ambientLevel, setAmbientLevel] = useState(0.5);
  const [specular, setSpecular] = useState(0.12);
  const [shininess, setShininess] = useState(12);
  const terrainRef = useRef<Mesh | null>(null);
  const landRef = useRef<Mesh | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let renderer: WebGLRenderer | null = null;
    let geometry: BufferGeometry | null = null;
    let waterGeometry: BufferGeometry | null = null;
    let material: MeshPhongMaterial | null = null;
    let waterMaterial: ShaderMaterial | null = null;
    let colorTexture: Texture | null = null;
    let backgroundTexture: Texture | null = null;

    let frame = 0;

    try {
      const levels = decodeMesh(mesh);
      const rows = Math.max(2, meshHeight);
      const cols = Math.max(2, meshWidth);
      if (levels.length < rows * cols) throw new Error("高度网格数据不完整");

      const width = 10;
      const depth = width * (rows / cols);
      const heightScale = 0.30;
      const scene = new Scene();
      // Procedural cube sky.  Face order and axis bases follow three's own
      // cube convention (+x, -x, +y, -y, +z, -z); getting a basis wrong shows
      // up as a hard seam and mirrored clouds, which is what broke the last
      // attempt.
      const makeSkyCube = (): CubeTexture => {
        const size = 512;
        const sunDir = new Vector3(0.55, 0.42, 0.72).normalize();
        const hash = (x: number, y: number) => {
          const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
          return n - Math.floor(n);
        };
        const valueNoise = (x: number, y: number) => {
          const xi = Math.floor(x);
          const yi = Math.floor(y);
          const xf = x - xi;
          const yf = y - yi;
          const u = xf * xf * (3 - 2 * xf);
          const v = yf * yf * (3 - 2 * yf);
          const a = hash(xi, yi);
          const b = hash(xi + 1, yi);
          const c = hash(xi, yi + 1);
          const d = hash(xi + 1, yi + 1);
          return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        };
        const smoothstep = (edge0: number, edge1: number, value: number) => {
          const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
          return t * t * (3 - 2 * t);
        };
        const fbm = (x: number, y: number) => {
          let value = 0;
          let amp = 0.5;
          let freq = 1;
          for (let o = 0; o < 4; o += 1) {
            value += valueNoise(x * freq, y * freq) * amp;
            amp *= 0.5;
            freq *= 2.07;
          }
          return value;
        };
        // three's cube faces: forward, up, right (right is flipped per face).
        const faces: Array<[Vector3, Vector3, Vector3]> = [
          [new Vector3(1, 0, 0), new Vector3(0, -1, 0), new Vector3(0, 0, -1)],
          [new Vector3(-1, 0, 0), new Vector3(0, -1, 0), new Vector3(0, 0, 1)],
          [new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)],
          [new Vector3(0, -1, 0), new Vector3(0, 0, -1), new Vector3(1, 0, 0)],
          [new Vector3(0, 0, 1), new Vector3(0, -1, 0), new Vector3(1, 0, 0)],
          [new Vector3(0, 0, -1), new Vector3(0, -1, 0), new Vector3(-1, 0, 0)],
        ];
        const canvases: HTMLCanvasElement[] = [];
        for (const [forward, up, right] of faces) {
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const img = ctx.createImageData(size, size);
            const dir = new Vector3();
            for (let y = 0; y < size; y += 1) {
              for (let x = 0; x < size; x += 1) {
                const s01 = (x / (size - 1)) * 2 - 1;
                const t01 = (y / (size - 1)) * 2 - 1;
                dir.copy(forward).addScaledVector(right, s01).addScaledVector(up, t01).normalize();
                const h = Math.max(-1, Math.min(1, dir.y));
                const up01 = Math.max(0, h);

                // Daylight sky: deep blue zenith fading to a pale, hazy horizon.
                const t = Math.pow(up01, 0.42);
                let r = 132 + (36 - 132) * t;
                let g = 170 + (86 - 170) * t;
                let b = 205 + (162 - 205) * t;

                // Cumulus deck: project the view ray onto a flat layer so the
                // clouds get perspective (dense overhead, stacked at the
                // horizon) instead of a uniform smear.
                const layer = 1 / Math.max(0.09, h + 0.09);
                const cx = dir.x * layer * 1.15 + 12.0;
                const cz = dir.z * layer * 1.15 + 24.0;
                const base = fbm(cx, cz);
                const detail = fbm(cx * 2.6 + 5.1, cz * 2.6 + 9.4);
                const shape = base * 0.75 + detail * 0.35;
                const cover = smoothstep(0.52, 0.78, shape) * smoothstep(-0.02, 0.16, h);
                const lit = smoothstep(0.5, 0.95, shape + detail * 0.25);
                r = r * (1 - cover) + (196 + lit * 52) * cover;
                g = g * (1 - cover) + (203 + lit * 46) * cover;
                b = b * (1 - cover) + (212 + lit * 40) * cover;

                // Warm sun disc + broad forward-scatter glow.
                const cosSun = dir.dot(sunDir);
                const disc = Math.pow(Math.max(0, cosSun), 1500) * 255;
                const glow = Math.pow(Math.max(0, cosSun), 9) * 62;
                r += disc + glow * 1.05;
                g += disc * 0.97 + glow * 0.94;
                b += disc * 0.86 + glow * 0.74;

                // Below the waterline the cubemap still has to be sane: fade to
                // the sea tone so reflections that look down stay coherent.
                const below = smoothstep(0.0, -0.12, h);
                r = r * (1 - below) + 12 * below;
                g = g * (1 - below) + 34 * below;
                b = b * (1 - below) + 58 * below;

                const i = (y * size + x) * 4;
                img.data[i] = Math.min(255, r);
                img.data[i + 1] = Math.min(255, g);
                img.data[i + 2] = Math.min(255, b);
                img.data[i + 3] = 255;
              }
            }
            ctx.putImageData(img, 0, 0);
          }
          canvases.push(canvas);
        }
        const cube = new CubeTexture(canvases);
        cube.colorSpace = SRGBColorSpace;
        cube.needsUpdate = true;
        return cube;
      };
      backgroundTexture = makeSkyCube();
      scene.background = backgroundTexture;
      scene.fog = new Fog(0x84aacd, 42, 120);

      const camera = new PerspectiveCamera(36, 1, 0.1, 400);
      camera.position.set(6.4, 4.9, 7.4);
      camera.lookAt(0, 0.32, 0);

      renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = SRGBColorSpace;
      // Colour must match the 2D map, so no filmic curve: ACES desaturates and
      // lifts mid-tones, which is exactly why the model drifted from the map.
      renderer.toneMapping = NoToneMapping;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFSoftShadowMap;
      renderer.domElement.setAttribute("aria-label", "可旋转的三维地形预览");
      // React StrictMode mounts twice; a stale canvas would sit frozen above
      // the live one and swallow every lighting change.
      mount.querySelectorAll("canvas").forEach((stale) => stale.remove());
      mount.appendChild(renderer.domElement);

      // Full continuous grid: land and water share one surface.  Water cells
      // stay at sea level, land cells sit above it; there is no separate ocean
      // plane to fight with depth ordering.
      const positions: number[] = [];
      const colors: number[] = [];
      const uvs: number[] = [];
      const landIndices: number[] = [];
      const waterIndices: number[] = [];
      const heightGrid = new Float32Array(cols * rows);

      const vertexIndex = (row: number, col: number) => row * cols + col;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const level = levels[row * cols + col] / 255;
          const land = level > 0;
          const wx = (col / (cols - 1) - 0.5) * width;
          const wz = (0.5 - row / (rows - 1)) * depth;
          const rolling = land ? (fbm(wx * 0.55 + 3.0, wz * 0.55 + 11.0) - 0.5) * 0.050 : 0;
          const micro = land ? (fbm(wx * 2.4 + 9.0, wz * 2.4 + 9.0) - 0.5) * 0.018 + rolling : 0;
          const h = land ? Math.max(0.018, level) + micro : 0;
          heightGrid[row * cols + col] = h;
          positions.push(wx, h * heightScale, wz);
          uvs.push(col / (cols - 1), 1 - row / (rows - 1));
          const forestNoise = fbm(wx * 1.15 + 11, wz * 1.15 + 7);
          const dryNoise = fbm(wx * 3.3 + 2, wz * 3.3 + 19);
          const color: Grade = land
            ? h < 0.34
              ? forestNoise > 0.56
                ? [0.07 + dryNoise * 0.03, 0.21 + dryNoise * 0.05, 0.08 + dryNoise * 0.02]
                : dryNoise > 0.63
                  ? [0.38 + dryNoise * 0.04, 0.34 + dryNoise * 0.04, 0.22 + dryNoise * 0.03]
                  : [0.20 + dryNoise * 0.05, 0.33 + dryNoise * 0.06, 0.14 + dryNoise * 0.03]
              : gradeFor(h)
            : [0.025, 0.065, 0.105];
          colors.push(color[0], color[1], color[2]);
        }
      }

      // Coastal depth field: 0 on land, 1 adjacent to land, growing offshore.
      const coastDist = new Int16Array(cols * rows);
      coastDist.fill(999);
      const queue: number[] = [];
      for (let i = 0; i < cols * rows; i += 1) {
        if (levels[i] > 0) {
          coastDist[i] = 0;
          queue.push(i);
        }
      }
      for (let head = 0; head < queue.length; head += 1) {
        const i = queue[head];
        const row = Math.floor(i / cols);
        const col = i % cols;
        const next = coastDist[i] + 1;
        if (col > 0 && coastDist[i - 1] > next) { coastDist[i - 1] = next; queue.push(i - 1); }
        if (col < cols - 1 && coastDist[i + 1] > next) { coastDist[i + 1] = next; queue.push(i + 1); }
        if (row > 0 && coastDist[i - cols] > next) { coastDist[i - cols] = next; queue.push(i - cols); }
        if (row < rows - 1 && coastDist[i + cols] > next) { coastDist[i + cols] = next; queue.push(i + cols); }
      }
      const waterDeep: Grade = [0.010, 0.045, 0.090];
      const waterShallow: Grade = [0.028, 0.135, 0.170];
      const foam: Grade = [0.18, 0.31, 0.31];
      const sand: Grade = [0.48, 0.45, 0.32];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const i = row * cols + col;
          const idx = i * 3;
          if (levels[i] > 0) {
            const nearWater =
              (col > 0 && levels[i - 1] === 0) ||
              (col < cols - 1 && levels[i + 1] === 0) ||
              (row > 0 && levels[i - cols] === 0) ||
              (row < rows - 1 && levels[i + cols] === 0);
            if (nearWater) {
              colors[idx] = colors[idx] * 0.35 + sand[0] * 0.65;
              colors[idx + 1] = colors[idx + 1] * 0.35 + sand[1] * 0.65;
              colors[idx + 2] = colors[idx + 2] * 0.35 + sand[2] * 0.65;
            }
          } else {
            const d = coastDist[i];
            const shallow = d <= 3 ? 1 - (d - 1) / 3 : 0;
            const target = d === 1 ? foam : shallow > 0 ? waterShallow : waterDeep;
            colors[idx] = target[0];
            colors[idx + 1] = target[1];
            colors[idx + 2] = target[2];
            if (shallow > 0 && d > 1) {
              colors[idx] = waterDeep[0] + (target[0] - waterDeep[0]) * shallow;
              colors[idx + 1] = waterDeep[1] + (target[1] - waterDeep[1]) * shallow;
              colors[idx + 2] = waterDeep[2] + (target[2] - waterDeep[2]) * shallow;
            }
          }
        }
      }

      // Slope-aware rock tint.
      const cellW = width / Math.max(1, cols - 1);
      const cellD = depth / Math.max(1, rows - 1);
      const rock: Grade = [0.34, 0.31, 0.27];
      for (let row = 1; row < rows - 1; row += 1) {
        for (let col = 1; col < cols - 1; col += 1) {
          if (levels[row * cols + col] === 0) continue;
          const hL = heightGrid[row * cols + col - 1];
          const hR = heightGrid[row * cols + col + 1];
          const hU = heightGrid[(row - 1) * cols + col];
          const hD = heightGrid[(row + 1) * cols + col];
          const slope = Math.hypot((hR - hL) / (2 * cellW), (hD - hU) / (2 * cellD));
          const blend = Math.min(0.65, Math.max(0, (slope - 0.55) * 1.2));
          const i = vertexIndex(row, col) * 3;
          if (blend > 0) {
            colors[i] += (rock[0] - colors[i]) * blend;
            colors[i + 1] += (rock[1] - colors[i + 1]) * blend;
            colors[i + 2] += (rock[2] - colors[i + 2]) * blend;
          }

          // Cheap baked ambient occlusion: concave basins darken, exposed
          // ridges lift slightly.  This gives the flat plain readable relief.
          const h = heightGrid[row * cols + col];
          const average = (hL + hR + hU + hD) * 0.25;
          const cavity = Math.min(0.30, Math.max(0, (average - h) * 1.6));
          const ridge = Math.min(0.12, Math.max(0, (h - average) * 1.4));
          colors[i] = Math.min(1, Math.max(0, colors[i] * (1 - cavity) + ridge));
          colors[i + 1] = Math.min(1, Math.max(0, colors[i + 1] * (1 - cavity) + ridge));
          colors[i + 2] = Math.min(1, Math.max(0, colors[i + 2] * (1 - cavity) + ridge));
        }
      }

      for (let row = 0; row < rows - 1; row += 1) {
        for (let col = 0; col < cols - 1; col += 1) {
          const a = vertexIndex(row, col);
          const b = vertexIndex(row, col + 1);
          const c = vertexIndex(row + 1, col);
          const d = vertexIndex(row + 1, col + 1);
          const allWater =
            levels[row * cols + col] === 0 &&
            levels[row * cols + col + 1] === 0 &&
            levels[(row + 1) * cols + col] === 0 &&
            levels[(row + 1) * cols + col + 1] === 0;
          const target = allWater ? waterIndices : landIndices;
          target.push(a, b, c, b, d, c);
        }
      }

      // Two meshes instead of two material groups: only the land may cast and
      // receive shadows, otherwise the flat sea plane paints shadow acne rings.
      const positionAttr = new BufferAttribute(new Float32Array(positions), 3);
      const colorAttr = new BufferAttribute(new Float32Array(colors), 3);
      const uvAttr = new BufferAttribute(new Float32Array(uvs), 2);
      const buildSurface = (surfaceIndices: number[]) => {
        const surface = new BufferGeometry();
        surface.setAttribute("position", positionAttr);
        surface.setAttribute("color", colorAttr);
        surface.setAttribute("uv", uvAttr);
        surface.setIndex(surfaceIndices);
        surface.computeVertexNormals();
        return surface;
      };
      const landGeometry = buildSurface(landIndices);
      // Same buffer, second name: the shader uses it as the land tint when a
      // map texel is unusable (water-coloured bleed on a cliff face).
      landGeometry.setAttribute("aTint", colorAttr);
      waterGeometry = buildSurface(waterIndices);
      geometry = landGeometry;


      // Prefer the real map PNG: same pixels the 2D view renders, so the 3D
      // palette matches by construction instead of by calibration.
      if (albedoUrl && !albedoData) {
        colorTexture = new TextureLoader().load(albedoUrl);
        colorTexture.colorSpace = SRGBColorSpace;
        colorTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }
      const albedoSource = albedoData ?? (textureData ? `data:image/png;base64,${textureData}` : "");
      if (!albedoUrl && albedoSource) {
        const source = albedoSource;
        colorTexture = new TextureLoader().load(source);
        colorTexture.colorSpace = SRGBColorSpace;
        colorTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        // The generated cartography leans muted; re-render it through a canvas
        // with a saturation/brightness lift so the lit model reads vivid
        // instead of grey-green.
        new TextureLoader().load(source, (loaded) => {
          if (disposed) return;
          const image = loaded.image as HTMLImageElement;
          if (!image?.width) return;
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          // The GPU capture is already the exact map colour; any filter here
        // would push the 3D away from the 2D palette.
        ctx.filter = albedoData ? "none" : "saturate(1.25) brightness(1.06)";
          ctx.drawImage(image, 0, 0);
          const vivid = new CanvasTexture(canvas);
          vivid.colorSpace = SRGBColorSpace;
          vivid.anisotropy = colorTexture?.anisotropy ?? 1;
          vivid.needsUpdate = true;
          if (material) {
            material.map = vivid;
            material.needsUpdate = true;
          }
          colorTexture?.dispose();
          colorTexture = vivid;
          loaded.dispose();
        });
      }
      // Lit surface over the map texture: ambient-dominant so the palette stays
      // recognisable, with a weak directional lamp for shape and a small
      // specular lobe the panel can dial up.
      material = new MeshPhongMaterial({
        map: colorTexture ?? undefined,
        vertexColors: !colorTexture,
        specular: new Color(0x121a20),
        shininess: 12,
        emissive: new Color(0x05070a),
      });

      materialRef.current = material;

      const land = new Mesh(landGeometry, material);
      land.castShadow = true;
      land.receiveShadow = true;
      landRef.current = land;
      terrainRef.current = land;
      scene.add(land);

      // three's own Water (ocean) object: projective normal-mapped ripples,
      // sun glints and a reflection sampler.  The reflection is a static sky
      // gradient so we do not pay for a second scene render every frame.
      const normalCanvas = document.createElement("canvas");
      normalCanvas.width = 512;
      normalCanvas.height = 512;
      const normalCtx = normalCanvas.getContext("2d");
      if (normalCtx) {
        const img = normalCtx.createImageData(512, 512);
        const hash = (x: number, y: number) => {
          const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
          return n - Math.floor(n);
        };
        const noise = (x: number, y: number) => {
          const xi = Math.floor(x);
          const yi = Math.floor(y);
          const xf = x - xi;
          const yf = y - yi;
          const u = xf * xf * (3 - 2 * xf);
          const v = yf * yf * (3 - 2 * yf);
          const a = hash(xi, yi);
          const b = hash(xi + 1, yi);
          const c = hash(xi, yi + 1);
          const d = hash(xi + 1, yi + 1);
          return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        };
        const height = (x: number, y: number) => {
          let value = 0;
          let amp = 0.5;
          for (let o = 0; o < 4; o += 1) {
            value += noise(x * (2 ** o), y * (2 ** o)) * amp;
            amp *= 0.5;
          }
          return value;
        };
        for (let y = 0; y < 512; y += 1) {
          for (let x = 0; x < 512; x += 1) {
            const scale = 0.045;
            const h0 = height(x * scale, y * scale);
            const hx = height((x + 1) * scale, y * scale);
            const hy = height(x * scale, (y + 1) * scale);
            const i = (y * 512 + x) * 4;
            img.data[i] = Math.max(0, Math.min(255, 128 + (h0 - hx) * 900));
            img.data[i + 1] = Math.max(0, Math.min(255, 128 + (h0 - hy) * 900));
            img.data[i + 2] = 255;
            img.data[i + 3] = 255;
          }
        }
        normalCtx.putImageData(img, 0, 0);
      }
      const waterNormals = new CanvasTexture(normalCanvas);
      waterNormals.wrapS = RepeatWrapping;
      waterNormals.wrapT = RepeatWrapping;


      const waterMesh = new Water(new PlaneGeometry(width * 60, depth * 60, 1, 1), {
        waterNormals,
        sunDirection: new Vector3(0.6, 0.72, 0.34).normalize(),
        sunColor: 0x2f6d99,
        waterColor: 0x062a44,
        distortionScale: 1.1,
        alpha: 1,
        textureWidth: 1024,
        textureHeight: 1024,
        fog: true,
      });
      waterMesh.rotation.x = -Math.PI / 2;
      waterMesh.position.y = 0;
      waterMesh.material.transparent = false;
      waterMesh.material.depthWrite = true;
      waterMesh.material.uniforms.size.value = 6.0;
      // Deep-water tint: the stock shader mixes in the raw reflection at
      // grazing angles, which reads grey. Pull that reflection towards the
      // water colour so the sea stays a saturated blue at every angle.
      waterMesh.material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), ( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight ), reflectance);",
          `vec3 reflectTint = mix(waterColor * 1.35, reflectionSample, 0.42);
           vec3 albedo = mix((sunColor * diffuseLight * 0.3 + scatter) * getShadowMask(), reflectTint + reflectionSample * specularLight * 0.45, reflectance * 0.68);`,
        );
      };
      waterMaterial = waterMesh.material as ShaderMaterial;
      waterRef.current = waterMesh;
      scene.add(waterMesh);

      const ambientLight = new AmbientLight(0xffffff, 0.5);
      ambientRef.current = ambientLight;
      scene.add(ambientLight);

      const sky = new HemisphereLight(0xe6f2ff, 0x4a4f42, 0.35);
      skyRef.current = sky;
      scene.add(sky);

      const sun = new DirectionalLight(0xfff8ee, sunLevel);
      sun.position.set(6, 9, 5);
      sun.target.position.set(0, 0, 0);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.near = 4;
      sun.shadow.camera.far = 32;
      const shadowSpan = Math.max(width, depth) * 0.85;
      sun.shadow.camera.left = -shadowSpan;
      sun.shadow.camera.right = shadowSpan;
      sun.shadow.camera.top = shadowSpan;
      sun.shadow.camera.bottom = -shadowSpan;
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.02;
      sun.shadow.radius = 1.6;
      scene.add(sun);
      scene.add(sun.target);
      sunRef.current = sun;
      land.castShadow = true;
      land.receiveShadow = true;




      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0.35, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.minDistance = 6;
      controls.maxDistance = 24;
      controls.maxPolarAngle = Math.PI / 2.08;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.42;
      controlsRef.current = controls;

      const resize = () => {
        if (!renderer || disposed) return;
        const w = Math.max(1, mount.clientWidth);
        const h = Math.max(1, mount.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(mount);

      const clockStart = performance.now();
      let lastTime = 0;
      const animate = () => {
        if (disposed) return;
        if (waterRef.current) {
          const uniforms = waterRef.current.material.uniforms;
          uniforms.time.value += 0.32 * ((performance.now() - clockStart) / 1000 - lastTime);
          lastTime = (performance.now() - clockStart) / 1000;
        }
        controls.update();
        renderer?.render(scene, camera);
        frame = window.requestAnimationFrame(animate);
      };
      animate();
      setStatus("ready");

      return () => {
        observer.disconnect();
      };
    } catch (cause) {
      setStatus("error");
      setMessage(cause instanceof Error ? cause.message : "3D 预览初始化失败");
    }

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      controlsRef.current?.dispose();
      controlsRef.current = null;
      geometry?.dispose();
      waterGeometry?.dispose();
      material?.dispose();
      colorTexture?.dispose();
      waterMaterial?.dispose();
      backgroundTexture?.dispose();

      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      }
    };
  }, [mesh, meshHeight, meshWidth, textureData, albedoData, albedoUrl]);




  useEffect(() => {
    if (landRef.current) landRef.current.scale.y = heightScale;
    if (waterRef.current) waterRef.current.scale.y = heightScale;
  }, [heightScale, status]);

  useEffect(() => {
    const sun = sunRef.current;
    if (!sun) return;
    const a = (azimuth / 180) * Math.PI;
    const e = (elevation / 180) * Math.PI;
    const radius = 13;
    sun.position.set(
      Math.cos(a) * Math.cos(e) * radius,
      Math.max(0.8, Math.sin(e) * radius),
      Math.sin(a) * Math.cos(e) * radius,
    );
  }, [azimuth, elevation, status]);

  useEffect(() => {
    if (sunRef.current) sunRef.current.intensity = sunLevel;
  }, [sunLevel, status]);

  useEffect(() => {
    if (skyRef.current) skyRef.current.intensity = skyLevel;
    if (ambientRef.current) ambientRef.current.intensity = ambientLevel;
  }, [skyLevel, ambientLevel, status]);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.specular.copy(new Color(0x9fb4c2)).multiplyScalar(specular);
    material.shininess = shininess;
  }, [specular, shininess, status]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate, status]);

  return (
    <div className="terrain-3d-shell">
      <div ref={mountRef} className="terrain-3d-mount" />
      <div className="terrain-3d-top">
        <span className="terrain-3d-kicker"><Sun size={16} /> 3D 地形预览 · 实验</span>
        <button type="button" className="terrain-3d-close" onClick={onClose}>返回 2D</button>
      </div>
      {status === "loading" && (
        <div className="terrain-3d-overlay"><Loader2 size={16} className="spin" /> 正在构建三维地形…</div>
      )}
      {status === "error" && <div className="terrain-3d-overlay is-error">3D 预览不可用：{message}</div>}
      {status === "ready" && (
        <>
          <p className="terrain-3d-hint">拖动旋转 · 滚轮缩放 · 右键平移</p>
          <div className="terrain-3d-controls">
                                                            <label>
              <span>光方位 {azimuth}°</span>
              <input type="range" min={0} max={360} step={1} value={azimuth} onChange={(event) => setAzimuth(Number(event.target.value))} />
            </label>
            <label>
              <span>光高度 {elevation}°</span>
              <input type="range" min={6} max={86} step={1} value={elevation} onChange={(event) => setElevation(Number(event.target.value))} />
            </label>
            <label>
              <span>日光 {sunLevel.toFixed(2)}</span>
              <input type="range" min={0} max={2.5} step={0.05} value={sunLevel} onChange={(event) => setSunLevel(Number(event.target.value))} />
            </label>
            <label>
              <span>天光 {skyLevel.toFixed(2)}</span>
              <input type="range" min={0} max={1.2} step={0.05} value={skyLevel} onChange={(event) => setSkyLevel(Number(event.target.value))} />
            </label>
            <label>
              <span>环境 {ambientLevel.toFixed(2)}</span>
              <input type="range" min={0} max={1.2} step={0.05} value={ambientLevel} onChange={(event) => setAmbientLevel(Number(event.target.value))} />
            </label>
            <label>
              <span>高光 {Math.round(specular * 100)}%</span>
              <input type="range" min={0} max={1} step={0.02} value={specular} onChange={(event) => setSpecular(Number(event.target.value))} />
            </label>
            <label>
              <span>光泽 {shininess}</span>
              <input type="range" min={2} max={120} step={1} value={shininess} onChange={(event) => setShininess(Number(event.target.value))} />
            </label>
            <label>
              <span>高度 ×{heightScale.toFixed(2)}</span>
              <input type="range" min={0.55} max={1.8} step={0.05} value={heightScale} onChange={(event) => setHeightScale(Number(event.target.value))} />
            </label>
            <button type="button" className={autoRotate ? "active" : ""} onClick={() => setAutoRotate((value) => !value)}>
              <RotateCw size={16} /> 自动旋转
            </button>
          </div>
        </>
      )}
    </div>
  );
}
