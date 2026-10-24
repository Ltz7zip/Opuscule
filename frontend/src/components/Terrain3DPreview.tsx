import { useEffect, useRef, useState } from "react";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DataTexture,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  UnsignedByteType,
  Vector2,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Loader2, RotateCw, Sun } from "lucide-react";

interface Terrain3DPreviewProps {
  mesh: string;
  meshWidth: number;
  meshHeight: number;
  textureData: string;
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

export default function Terrain3DPreview({ mesh, meshWidth, meshHeight, textureData, onClose }: Terrain3DPreviewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const lightRef = useRef<DirectionalLight | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [azimuth, setAzimuth] = useState(38);
  const [elevation, setElevation] = useState(42);
  const [autoRotate, setAutoRotate] = useState(true);
  const [heightScale, setHeightScale] = useState(1);
  const terrainRef = useRef<Mesh | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let renderer: WebGLRenderer | null = null;
    let geometry: BufferGeometry | null = null;
    let material: MeshStandardMaterial | null = null;
    let waterMaterial: MeshBasicMaterial | null = null;
    let colorTexture: Texture | null = null;
    let normalTexture: DataTexture | null = null;
    let bumpTexture: DataTexture | null = null;
    let roughnessTexture: DataTexture | null = null;
    let detailTexture: DataTexture | null = null;
    let backgroundTexture: CanvasTexture | null = null;

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
      const skyCanvas = document.createElement("canvas");
      skyCanvas.width = 2;
      skyCanvas.height = 256;
      const skyContext = skyCanvas.getContext("2d");
      if (skyContext) {
        const sky = skyContext.createLinearGradient(0, 0, 0, 256);
        sky.addColorStop(0, "#03080d");
        sky.addColorStop(0.55, "#07141d");
        sky.addColorStop(1, "#102b34");
        skyContext.fillStyle = sky;
        skyContext.fillRect(0, 0, 2, 256);
      }
      backgroundTexture = new CanvasTexture(skyCanvas);
      backgroundTexture.colorSpace = SRGBColorSpace;
      scene.background = backgroundTexture;
      scene.fog = new Fog(0x08131b, 18, 34);

      const camera = new PerspectiveCamera(36, 1, 0.1, 60);
      camera.position.set(6.4, 4.9, 7.4);
      camera.lookAt(0, 0.32, 0);

      renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.02;
      // The full-grid mesh includes water, so projected terrain shadows
      // produce dark rings/acne on the sea.  Keep PBR lighting, skip shadows.
      renderer.shadowMap.enabled = false;
      renderer.shadowMap.type = PCFSoftShadowMap;
      renderer.domElement.setAttribute("aria-label", "可旋转的三维地形预览");
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
      const indices = landIndices.concat(waterIndices);

      const landGeometry = new BufferGeometry();
      landGeometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
      landGeometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
      landGeometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
      landGeometry.setIndex(indices);
      landGeometry.addGroup(0, landIndices.length, 0);
      landGeometry.addGroup(landIndices.length, waterIndices.length, 1);
      landGeometry.computeVertexNormals();
      geometry = landGeometry;

      // Baked normal map from the full height grid.
      const normalData = new Uint8Array(cols * rows * 4);
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const at = (r: number, c: number) => heightGrid[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
          const dx = (at(row, col + 1) - at(row, col - 1)) * 7.5;
          const dz = (at(row + 1, col) - at(row - 1, col)) * 7.5;
          const length = Math.sqrt(dx * dx + dz * dz + 1);
          const i = (row * cols + col) * 4;
          normalData[i] = Math.round((-dx / length * 0.5 + 0.5) * 255);
          normalData[i + 1] = Math.round((-dz / length * 0.5 + 0.5) * 255);
          normalData[i + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
          normalData[i + 3] = 255;
        }
      }
      normalTexture = new DataTexture(normalData, cols, rows, RGBAFormat, UnsignedByteType);
      normalTexture.needsUpdate = true;

      const bumpData = new Uint8Array(cols * rows * 4);
      const roughnessData = new Uint8Array(cols * rows * 4);
      const texCellW = width / Math.max(1, cols - 1);
      const texCellD = depth / Math.max(1, rows - 1);
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const i = row * cols + col;
          const at = (r: number, c: number) => heightGrid[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
          const h = heightGrid[i];
          const hL = at(row, col - 1);
          const hR = at(row, col + 1);
          const hU = at(row - 1, col);
          const hD = at(row + 1, col);
          const slope = Math.hypot((hR - hL) / (2 * cellW), (hD - hU) / (2 * cellD));
          const level = levels[i] / 255;
          const heightByte = Math.round(Math.min(1, Math.max(0, h)) * 255);
          // Water stays matte; broad specular patches read as blown-out glare.
          const rough = level <= 0 ? 228 : Math.round(Math.min(255, 105 + slope * 520));
          const j = i * 4;
          bumpData[j] = heightByte;
          bumpData[j + 1] = heightByte;
          bumpData[j + 2] = heightByte;
          bumpData[j + 3] = 255;
          roughnessData[j] = rough;
          roughnessData[j + 1] = rough;
          roughnessData[j + 2] = rough;
          roughnessData[j + 3] = 255;
        }
      }
      bumpTexture = new DataTexture(bumpData, cols, rows, RGBAFormat, UnsignedByteType);
      bumpTexture.needsUpdate = true;
      roughnessTexture = new DataTexture(roughnessData, cols, rows, RGBAFormat, UnsignedByteType);
      roughnessTexture.needsUpdate = true;

      const detailSize = 256;
      const detailData = new Uint8Array(detailSize * detailSize * 4);
      for (let y = 0; y < detailSize; y += 1) {
        for (let x = 0; x < detailSize; x += 1) {
          const grain =
            valueNoise(x * 0.19, y * 0.19) * 0.38 +
            valueNoise(x * 0.061, y * 0.061) * 0.27 +
            valueNoise(x * 0.83, y * 0.83) * 0.22 +
            valueNoise(x * 2.1, y * 2.1) * 0.13;
          const level = Math.round(105 + grain * 150);
          const warm = valueNoise(x * 0.037, y * 0.037);
          const i = (y * detailSize + x) * 4;
          detailData[i] = Math.round(level * (0.85 + warm * 0.15));
          detailData[i + 1] = Math.round(level * (0.96 + warm * 0.04));
          detailData[i + 2] = Math.round(level * (0.80 + warm * 0.10));
          detailData[i + 3] = 255;
        }
      }
      detailTexture = new DataTexture(detailData, detailSize, detailSize, RGBAFormat, UnsignedByteType);
      detailTexture.wrapS = RepeatWrapping;
      detailTexture.wrapT = RepeatWrapping;
      detailTexture.repeat.set(24, 17);
      detailTexture.needsUpdate = true;

      if (textureData) {
        colorTexture = new TextureLoader().load(`data:image/png;base64,${textureData}`);
        colorTexture.colorSpace = SRGBColorSpace;
        colorTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }
      material = new MeshStandardMaterial({
        map: colorTexture ?? undefined,
        vertexColors: !colorTexture,
        metalness: 0.02,
        roughness: 0.92,
      });
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vTerrainWorldPos;\nvarying vec3 vTerrainWorldNormal;",
          )
          .replace(
            "#include <beginnormal_vertex>",
            "#include <beginnormal_vertex>\nvTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);",
          )
          .replace(
            "#include <worldpos_vertex>",
            "#include <worldpos_vertex>\nvTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
            varying vec3 vTerrainWorldPos;
            varying vec3 vTerrainWorldNormal;
            float terrainHash(vec3 p) {
              return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
            }
            float terrainNoise(vec3 p) {
              vec3 i = floor(p);
              vec3 f = fract(p);
              f = f * f * (3.0 - 2.0 * f);
              return mix(
                mix(mix(terrainHash(i), terrainHash(i + vec3(1, 0, 0)), f.x),
                    mix(terrainHash(i + vec3(0, 1, 0)), terrainHash(i + vec3(1, 1, 0)), f.x), f.y),
                mix(mix(terrainHash(i + vec3(0, 0, 1)), terrainHash(i + vec3(1, 0, 1)), f.x),
                    mix(terrainHash(i + vec3(0, 1, 1)), terrainHash(i + vec3(1, 1, 1)), f.x), f.y),
                f.z);
            }
            float terrainFbm(vec3 p) {
              float value = 0.0;
              float amplitude = 0.5;
              for (int octave = 0; octave < 4; octave++) {
                value += terrainNoise(p) * amplitude;
                p *= 2.03;
                amplitude *= 0.5;
              }
              return value;
            }`,
          )
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>
            vec3 terrainN = normalize(vTerrainWorldNormal);
            float slope = 1.0 - clamp(abs(terrainN.y), 0.0, 1.0);
            float rockMask = smoothstep(0.28, 0.58, slope);
            float rockNoise = terrainFbm(vTerrainWorldPos * 5.0);
            float rockFine = terrainFbm(vTerrainWorldPos * 24.0);
            vec3 rockColor = mix(vec3(0.27, 0.24, 0.20), vec3(0.46, 0.41, 0.34), rockNoise);
            rockColor *= 0.80 + rockFine * 0.32;
            float strata = 0.5 + 0.5 * sin(vTerrainWorldPos.y * 76.0 + rockNoise * 22.0);
            rockColor *= 0.92 + strata * 0.08;
            diffuseColor.rgb = mix(diffuseColor.rgb, rockColor, rockMask * 0.88);
            `,
          );
      };
      material.customProgramCacheKey = () => "terrain-map-rock-blend";
      waterMaterial = new MeshBasicMaterial({ color: 0x08324a });
      const terrain = new Mesh(landGeometry, [material, waterMaterial]);
      terrainRef.current = terrain;
      terrain.castShadow = false;
      terrain.receiveShadow = false;
      scene.add(terrain);

      scene.add(new AmbientLight(0x9bb5c5, 0.55));
      scene.add(new HemisphereLight(0xb9d7e5, 0x1b2721, 1.2));
      const sun = new DirectionalLight(0xfff0cf, 2.6);
      sun.position.set(5, 8, 5);
      sun.target.position.set(0, 0.2, 0);
      sun.castShadow = false;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 0.5;
      sun.shadow.camera.far = 30;
      sun.shadow.camera.left = -7;
      sun.shadow.camera.right = 7;
      sun.shadow.camera.top = 7;
      sun.shadow.camera.bottom = -7;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.02;
      scene.add(sun);
      scene.add(sun.target);
      const fill = new DirectionalLight(0x8fb6c9, 0.55);
      fill.position.set(-6, 4, -5);
      scene.add(fill);
      lightRef.current = sun;

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

      const animate = () => {
        if (disposed) return;
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
      lightRef.current = null;
      geometry?.dispose();
      material?.dispose();
      colorTexture?.dispose();
      waterMaterial?.dispose();
      normalTexture?.dispose();
      bumpTexture?.dispose();
      roughnessTexture?.dispose();
      detailTexture?.dispose();
      backgroundTexture?.dispose();

      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      }
    };
  }, [mesh, meshHeight, meshWidth, textureData]);

  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    const a = (azimuth / 180) * Math.PI;
    const e = (elevation / 180) * Math.PI;
    const radius = 11;
    light.position.set(
      Math.cos(a) * Math.cos(e) * radius,
      Math.sin(e) * radius,
      Math.sin(a) * Math.cos(e) * radius,
    );
  }, [azimuth, elevation, status]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate, status]);

  useEffect(() => {
    if (terrainRef.current) terrainRef.current.scale.y = heightScale;
  }, [heightScale, status]);

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
              <input type="range" min={8} max={85} step={1} value={elevation} onChange={(event) => setElevation(Number(event.target.value))} />
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
