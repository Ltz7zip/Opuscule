import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Box, Crosshair, Download, ExternalLink, ImagePlus, Link2, Loader2, MapPin, Menu, Mountain, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";

import {
  createMapMarker,
  deleteMapMarker,
  fetchWorld,
  fetchWorldMap,
  generateTerrainWeb,
  updateMapMarker,
  uploadWorldMapBackground,
  clearWorldMapBackground,
} from "../api";
import { useDocumentMeta } from "../lib/meta";
import { vt, vtClassRef } from "../lib/viewTransition";
import { confirmAction } from "../lib/dialogs";
import { ContextMenu, type ContextMenuEntry, type ContextMenuModel } from "./ContextMenu";
import { SelectMenu } from "./SelectMenu";
import type { MapData, MapMarker, SessionState, TerrainWebResult, TerrainWebStyle, WorldDetail } from "../types";

const Terrain3DPreview = lazy(() => import("./Terrain3DPreview"));
import MapCanvasStage from "./MapCanvasStage";
import MapOverlayCanvas from "./MapOverlayCanvas";

interface MapPageProps {
  worldSlug: string;
  session: SessionState | null;
  onLogout: () => void;
}

const kindLabels: Record<MapMarker["kind"], string> = {
  place: "地点",
  city: "城市",
  event: "事件",
  character: "人物",
  note: "笔记",
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function MapPage({ worldSlug, session, onLogout }: MapPageProps) {
  const [world, setWorld] = useState<WorldDetail | null>(null);
  const [map, setMap] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  const [spacePressed, setSpacePressed] = useState(false);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<number | null>(null);
  const [markerSearch, setMarkerSearch] = useState("");
  const [markerKindFilter, setMarkerKindFilter] = useState<MapMarker["kind"] | "all">("all");
  const [cursorPoint, setCursorPoint] = useState<{ x: number; y: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<"place" | "pan">("pan");
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<MapMarker["kind"]>("place");
  const [cardId, setCardId] = useState("");
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editKind, setEditKind] = useState<MapMarker["kind"]>("place");
  const [editCard, setEditCard] = useState("");
  const [saving, setSaving] = useState(false);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [terrainSeed, setTerrainSeed] = useState("04217");
  const [terrainStyle, setTerrainStyle] = useState<TerrainWebStyle>("atlas");
  const [terrainResolution, setTerrainResolution] = useState("2048");
  const [terrainLabelCount, setTerrainLabelCount] = useState(7);
  const [canvasBox, setCanvasBox] = useState({ width: 0, height: 0 });
  const suppressClickRef = useRef(false);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; zoom: number; pan: { x: number; y: number }; centerX: number; centerY: number } | null>(null);
  const [terrainProgress, setTerrainProgress] = useState(0);
  const [terrainPhase, setTerrainPhase] = useState("");
  const [terrainBusy, setTerrainBusy] = useState(false);
  const [terrainResult, setTerrainResult] = useState<TerrainWebResult | null>(null);
  const [terrainImportBusy, setTerrainImportBusy] = useState(false);
  const [terrainImported, setTerrainImported] = useState<number | null>(null);
  const [terrainLabelTotal, setTerrainLabelTotal] = useState(0);
  const [terrain3dOpen, setTerrain3dOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menu, setMenu] = useState<ContextMenuModel | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ id: number; moved: boolean } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    if (!sidebarOpen) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(".map-page .sidebar-close")?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      menuRef.current?.focus({ preventScroll: true });
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const onChange = () => {
      if (!query.matches) setSidebarOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useDocumentMeta({
    title: world ? `${world.name} · 世界地图` : "世界地图 · Opuscule",
    description: world?.description || "把世界里的地点、事件与人物放到一张地图上。",
    canonicalPath: `/w/${worldSlug}/map`,
  });

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const update = () => setCanvasBox({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading, map?.background_url]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchWorld(worldSlug), fetchWorldMap(worldSlug)])
      .then(([nextWorld, nextMap]) => {
        if (cancelled) return;
        setWorld(nextWorld);
        setMap(nextMap);
        const meta = nextMap.terrain_web;
        if (meta) {
          setTerrainSeed(String(meta.seed).padStart(5, "0"));
          setTerrainStyle(meta.style);
          setTerrainResult({ ...meta, background_url: nextMap.background_url ?? "", prototype: false });
          setTerrainLabelTotal(meta.labels.length);
          setTerrainImported(null);
        } else {
          setTerrainResult(null);
          setTerrainLabelTotal(0);
          setTerrainImported(null);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "地图加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [worldSlug]);

  const cards = useMemo(
    () => (world ? world.cards.filter((card) => !card.is_auxiliary) : []),
    [world],
  );
  const selected = map?.markers.find((marker) => marker.id === selectedId) ?? null;
  const canEdit = map?.can_edit ?? false;
  const isTerrain = Boolean(map?.background_url?.includes("/terrain-web-"));
  const mesh = terrainResult?.mesh || map?.terrain_web?.mesh || "";
  const meshWidth = terrainResult?.mesh_width || map?.terrain_web?.mesh_width || 256;
  const meshHeight = terrainResult?.mesh_height || map?.terrain_web?.mesh_height || 160;
  const textureData = terrainResult?.texture || map?.terrain_web?.texture || "";
  const heightmapData = terrainResult?.heightmap || map?.terrain_web?.heightmap || "";
  const heightmapWidth = terrainResult?.heightmap_width || map?.terrain_web?.heightmap_width || 512;
  const heightmapHeight = terrainResult?.heightmap_height || map?.terrain_web?.heightmap_height || 320;
  const renderedTerrainStyle = terrainResult?.style || map?.terrain_web?.style || "atlas";
  const terrainPreviewClass =
    isTerrain && terrainStyle !== renderedTerrainStyle ? ` style-${terrainStyle}` : "";
  const terrainWidth = terrainResult?.width || map?.terrain_web?.width || 2048;
  const terrainHeight = terrainResult?.height || map?.terrain_web?.height || 1280;
  const mapAspect = terrainWidth / Math.max(1, terrainHeight);
  const mapView = useMemo(() => {
    if (!canvasBox.width || !canvasBox.height) return null;
    let width = canvasBox.width;
    let height = width / mapAspect;
    if (height < canvasBox.height) {
      height = canvasBox.height;
      width = height * mapAspect;
    }
    return { left: (canvasBox.width - width) / 2, top: (canvasBox.height - height) / 2, width, height };
  }, [canvasBox, mapAspect]);
  const maxZoom = terrainWidth >= 4096 ? 6 : 4;
  const selectedMarker = map?.markers.find((marker) => marker.id === selectedId) ?? null;
  const pendingTerrainLabels = terrainResult
    ? terrainResult.labels.filter(
        (label) =>
          !(map?.markers ?? []).some(
            (marker) => marker.label.trim().toLowerCase() === label.name.trim().toLowerCase(),
          ),
      )
    : [];

  const uploadBackground = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBackgroundBusy(true);
    setError(null);
    try {
      const data = await uploadWorldMapBackground(worldSlug, file);
      setMap((current) => (current ? { ...current, background_url: data.background_url } : current));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "背景图上传失败");
    } finally {
      setBackgroundBusy(false);
    }
  };

  const removeBackground = async () => {
    setBackgroundBusy(true);
    setError(null);
    try {
      await clearWorldMapBackground(worldSlug);
      setMap((current) => (current ? { ...current, background_url: null } : current));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "背景图移除失败");
    } finally {
      setBackgroundBusy(false);
    }
  };

  const importTerrainLabels = async () => {
    if (!terrainResult || terrainResult.labels.length === 0) return;
    const existing = new Set((map?.markers ?? []).map((marker) => marker.label.trim().toLowerCase()));
    const pending = terrainResult.labels.filter((label) => !existing.has(label.name.trim().toLowerCase()));
    if (pending.length === 0) {
      setTerrainResult((current) => (current ? { ...current, labels: [] } : current));
      setTerrainImported(0);
      return;
    }
    setTerrainImportBusy(true);
    setError(null);
    try {
      const created: MapMarker[] = [];
      for (const label of pending) {
        const marker = await createMapMarker(worldSlug, {
          label: label.name,
          kind: "place",
          x: label.x,
          y: label.y,
          card: null,
        });
        created.push(marker);
        setMap((current) => (current ? { ...current, markers: [...current.markers, marker] } : current));
      }
      const createdNames = new Set(created.map((marker) => marker.label));
      setTerrainResult((current) =>
        current ? { ...current, labels: current.labels.filter((label) => !createdNames.has(label.name)) } : current,
      );
      setTerrainImported(created.length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "地名转图钉失败");
    } finally {
      setTerrainImportBusy(false);
    }
  };

  const randomizeTerrainSeed = () => {
    setTerrainSeed(String(Math.floor(Math.random() * 100000)).padStart(5, "0"));
  };

  useEffect(() => {
    if (!terrainBusy) {
      const done = window.setTimeout(() => {
        setTerrainProgress(0);
        setTerrainPhase("");
      }, 900);
      return () => window.clearTimeout(done);
    }
    const startedAt = Date.now();
    const estimated =
      terrainResolution === "1024" ? 6500 : terrainResolution === "1536" ? 9000 : terrainResolution === "4096" ? 24000 : 13000;
    setTerrainProgress(3);
    setTerrainPhase("准备地形参数…");
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(93, 3 + (elapsed / estimated) * 90);
      setTerrainProgress(pct);
      setTerrainPhase(
        pct < 18 ? "计算海岸线…" : pct < 52 ? "雕刻山脉与河流…" : pct < 82 ? "地表着色…" : "编码 PNG 与 3D 数据…",
      );
    }, 140);
    return () => window.clearInterval(timer);
  }, [terrainBusy, terrainResolution]);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement && Boolean(target.closest("input, textarea, [contenteditable='true']"));
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTyping(event.target)) return;
      setSpacePressed(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const generateTerrain = async (resolutionOverride?: string) => {
    const selectedResolution = resolutionOverride ?? terrainResolution;
    const seedText = terrainSeed.trim();
    const seed = seedText ? Number(seedText) : undefined;
    if (seed !== undefined && (!Number.isInteger(seed) || seed < 0 || seed > 2_147_483_647)) {
      setError("Seed 必须是 0–2147483647 的整数");
      return;
    }
    setTerrainBusy(true);
    setError(null);
    try {
      const [width, height] =
        selectedResolution === "1024"
          ? [1024, 640]
          : selectedResolution === "1536"
            ? [1536, 960]
            : selectedResolution === "4096"
              ? [4096, 2560]
              : [2048, 1280];
      const data = await generateTerrainWeb(worldSlug, {
        seed,
        style: terrainStyle,
        bake_labels: false,
        width,
        height,
        label_count: terrainLabelCount,
      });
      setMap((current) => (current ? { ...current, background_url: data.background_url } : current));
      setTerrainProgress(100);
      setTerrainPhase("完成");
      setTerrainResult(data);
      setTerrainImported(null);
      setTerrainLabelTotal(data.labels.length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Terrain Web 生成失败");
    } finally {
      setTerrainBusy(false);
    }
  };

  const clampPan = (next: { x: number; y: number }, nextZoom = zoom) => {
    if (!canvasRef.current) return next;
    const rect = canvasRef.current.getBoundingClientRect();
    const maxX = Math.max(0, ((nextZoom - 1) * rect.width) / 2);
    const maxY = Math.max(0, ((nextZoom - 1) * rect.height) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const zoomAtPoint = (nextZoom: number, clientX: number, clientY: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const viewLeft = mapView?.left ?? 0;
    const viewTop = mapView?.top ?? 0;
    const viewWidth = mapView?.width ?? rect.width;
    const viewHeight = mapView?.height ?? rect.height;
    const clamped = Math.max(1, Math.min(maxZoom, nextZoom));
    if (clamped === zoom) return;
    const offsetX = (clientX - rect.left - rect.width / 2 - pan.x - viewLeft) / (viewWidth * zoom);
    const offsetY = (clientY - rect.top - rect.height / 2 - pan.y - viewTop) / (viewHeight * zoom);
    const nextPan = {
      x: clientX - rect.left - rect.width / 2 - viewLeft - offsetX * viewWidth * clamped,
      y: clientY - rect.top - rect.height / 2 - viewTop - offsetY * viewHeight * clamped,
    };
    setZoom(clamped);
    setPan(clampPan(nextPan, clamped));
  };

  const changeZoom = (nextZoom: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    zoomAtPoint(nextZoom, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const onCanvasDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    if ((event.target as HTMLElement).closest(".map-pin, .map-controls")) return;
    event.preventDefault();
    zoomAtPoint(zoom + 1, event.clientX, event.clientY);
  };

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || terrain3dOpen) return;
      if (!(event.target instanceof Node) || !canvas.contains(event.target)) return;
      if (event.target instanceof HTMLElement && event.target.closest(".map-pin, .map-controls")) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0007);
      zoomAtPoint(zoom * factor, event.clientX, event.clientY);
    };
    window.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", handleWheel, { capture: true });
  }, [zoom, pan.x, pan.y, maxZoom, terrain3dOpen, map?.background_url]);

;

  const focusMarker = (marker: MapMarker) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const viewWidth = mapView?.width ?? rect.width;
    const viewHeight = mapView?.height ?? rect.height;
    const nextZoom = Math.max(2, Math.min(maxZoom, 2.5));
    setZoom(nextZoom);
    setPan(clampPan({
      x: -(marker.x - 0.5) * viewWidth * nextZoom,
      y: -(marker.y - 0.5) * viewHeight * nextZoom,
    }, nextZoom));
    setSelectedId(marker.id);
    setDraft(null);
    setEditing(false);
  };

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (!canvasRef.current) return;
    if ((event.target as HTMLElement).closest(".map-pin, .map-controls")) return;
    if (event.button === 0 && canEdit && mode === "place" && !spacePressed) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      startX: event.clientX - pan.x,
      startY: event.clientY - pan.y,
      originX: pan.x,
      originY: pan.y,
    };
  };

  const onCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const tracked = activePointersRef.current.get(event.pointerId);
    if (tracked) {
      tracked.x = event.clientX;
      tracked.y = event.clientY;
    }
    if (pinchRef.current && activePointersRef.current.size >= 2) {
      const points = Array.from(activePointersRef.current.values());
      const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
      const pinch = pinchRef.current;
      const nextZoom = Math.max(1, Math.min(maxZoom, pinch.zoom * (distance / pinch.distance)));
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const viewLeft = mapView?.left ?? 0;
      const viewTop = mapView?.top ?? 0;
      const viewWidth = mapView?.width ?? rect.width;
      const viewHeight = mapView?.height ?? rect.height;
      const offsetX = (pinch.centerX - rect.left - rect.width / 2 - pinch.pan.x - viewLeft) / (viewWidth * pinch.zoom);
      const offsetY = (pinch.centerY - rect.top - rect.height / 2 - pinch.pan.y - viewTop) / (viewHeight * pinch.zoom);
      setZoom(nextZoom);
      setPan(clampPan({
        x: pinch.centerX - rect.left - rect.width / 2 - viewLeft - offsetX * viewWidth * nextZoom,
        y: pinch.centerY - rect.top - rect.height / 2 - viewTop - offsetY * viewHeight * nextZoom,
      }, nextZoom));
      return;
    }
    setCursorPoint(mapPoint(event.clientX, event.clientY));
    if (!panRef.current) {
      setHoveredMarkerId(hitMarker(event.clientX, event.clientY)?.id ?? null);
      return;
    }
    setPan(clampPan({
      x: event.clientX - panRef.current.startX,
      y: event.clientY - panRef.current.startY,
    }));
  };

  const onCanvasPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);
    if (pinchRef.current) {
      if (activePointersRef.current.size < 2) pinchRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (!panRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    panRef.current = null;
  };

  const hitMarker = (clientX: number, clientY: number) => {
    if (!canvasRef.current || !map) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const viewLeft = mapView?.left ?? 0;
    const viewTop = mapView?.top ?? 0;
    const viewWidth = mapView?.width ?? rect.width;
    const viewHeight = mapView?.height ?? rect.height;
    let closest: { marker: MapMarker; distance: number } | null = null;
    for (const marker of map.markers) {
      const mx = rect.left + rect.width / 2 + pan.x + viewLeft + (marker.x - 0.5) * viewWidth * zoom;
      const my = rect.top + rect.height / 2 + pan.y + viewTop + (marker.y - 0.5) * viewHeight * zoom;
      const distance = Math.hypot(clientX - mx, clientY - my);
      if (distance <= 18 && (!closest || distance < closest.distance)) closest = { marker, distance };
    }
    return closest?.marker ?? null;
  };

  const mapPoint = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const viewLeft = mapView?.left ?? 0;
    const viewTop = mapView?.top ?? 0;
    const viewWidth = mapView?.width ?? rect.width;
    const viewHeight = mapView?.height ?? rect.height;
    return {
      x: clamp(((clientX - rect.left - viewLeft - pan.x) / (viewWidth * zoom) - 0.5) / 1 + 0.5),
      y: clamp(((clientY - rect.top - viewTop - pan.y) / (viewHeight * zoom) - 0.5) / 1 + 0.5),
    };
  };

  const beginDraft = (point: { x: number; y: number }) => {
    setDraft(point);
    setSelectedId(null);
    setEditing(false);
    setLabel("");
    setCardId("");
    setKind("place");
    // On phones the inspector sits below the canvas; bring the new-marker
    // form into view instead of leaving it off-screen after a canvas tap.
    window.requestAnimationFrame(() => {
      if (!window.matchMedia("(max-width: 900px)").matches) return;
      inspectorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  // On the single-column layout the detail panel sits below the map. Choosing
  // a pin from the drawer should reveal that panel, not leave it off-screen.
  const revealInspector = () => {
    if (!window.matchMedia("(max-width: 900px)").matches) return;
    window.requestAnimationFrame(() => {
      inspectorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  const onCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!canvasRef.current) return;
    if ((event.target as HTMLElement).closest(".map-pin, .map-controls")) return;
    const hit = hitMarker(event.clientX, event.clientY);
    if (hit) {
      setSelectedId(hit.id);
      setDraft(null);
      setEditing(false);
      return;
    }
    if (!canEdit) return;
    if (mode === "pan" || spacePressed) {
      setSelectedId(null);
      setDraft(null);
      setEditing(false);
      return;
    }
    beginDraft(mapPoint(event.clientX, event.clientY));
  };

  const onCanvasKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      changeZoom(zoom + 0.5);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      changeZoom(zoom - 0.5);
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      changeZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    if (event.key === "Escape") {
      setSelectedId(null);
      setDraft(null);
      setEditing(false);
      return;
    }
    if (!canEdit || mode === "pan" || spacePressed) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    beginDraft({ x: 0.5, y: 0.5 });
  };

  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !label.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const marker = await createMapMarker(worldSlug, {
        label: label.trim(),
        kind,
        x: draft.x,
        y: draft.y,
        card: cardId ? Number(cardId) : null,
      });
      setMap((current) =>
        current ? { ...current, markers: [...current.markers, marker] } : current,
      );
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存标记失败");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !editLabel.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMapMarker(worldSlug, selected.id, {
        label: editLabel.trim(),
        kind: editKind,
        card: editCard ? Number(editCard) : null,
      });
      setMap((current) =>
        current
          ? { ...current, markers: current.markers.map((item) => (item.id === updated.id ? updated : item)) }
          : current,
      );
      setSelectedId(updated.id);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存标记失败");
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (marker: MapMarker) => {
    setSelectedId(marker.id);
    setEditing(true);
    setEditLabel(marker.label);
    setEditKind(marker.kind);
    setEditCard(marker.card ? String(marker.card) : "");
    revealInspector();
  };

  const startEdit = () => {
    if (selected) beginEdit(selected);
  };

  const remove = async (target?: MapMarker) => {
    const marker = target ?? selected;
    if (!marker) return;
    const confirmed = await confirmAction({
      title: "删除这个标记？",
      body: `「${marker.label}」会从地图上移除。`,
      confirmLabel: "删除标记",
      danger: true,
    });
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    try {
      await deleteMapMarker(worldSlug, marker.id);
      setMap((current) =>
        current
          ? { ...current, markers: current.markers.filter((item) => item.id !== marker.id) }
          : current,
      );
      setSelectedId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除标记失败");
    } finally {
      setSaving(false);
    }
  };

  const openPinMenu = (marker: MapMarker, x: number, y: number) => {
    setDraft(null);
    setSelectedId(marker.id);
    setEditing(false);
    const entries: ContextMenuEntry[] = [];
    if (canEdit) {
      entries.push(
        { label: "编辑标记", icon: <Pencil size={16} />, run: () => beginEdit(marker) },
        { label: "删除标记", icon: <Trash2 size={16} />, danger: true, run: () => remove(marker) },
      );
    }
    if (marker.card_slug) {
      if (entries.length > 0) entries.push({ separator: true });
      entries.push({
        label: "打开关联卡片",
        icon: <ExternalLink size={16} />,
        run: () => { window.location.href = `/w/${worldSlug}/wiki/${marker.card_slug}`; },
      });
    }
    if (entries.length === 0) {
      entries.push({ label: "此标记只读", icon: <MapPin size={16} />, disabled: true, run: () => undefined });
    }
    setMenu({ x, y, entries });
  };

  const copyMapLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = window.location.href;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
  };

  const downloadMapImage = () => {
    if (!map?.background_url) return;
    const anchor = document.createElement("a");
    anchor.href = map.background_url;
    anchor.download = `${worldSlug}-map`;
    anchor.click();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>, marker: MapMarker) => {
    if (!canEdit || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: marker.id, moved: false };
    setDraft(null);
    setEditing(false);
    setSelectedId(marker.id);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current || !canvasRef.current) return;
    const point = mapPoint(event.clientX, event.clientY);
    const x = point.x;
    const y = point.y;
    dragRef.current.moved = true;
    setMap((current) =>
      current
        ? {
            ...current,
            markers: current.markers.map((item) =>
              item.id === dragRef.current?.id ? { ...item, x, y } : item,
            ),
          }
        : current,
    );
  };

  const onPointerUp = async (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    if (!drag.moved) return;
    const marker = map?.markers.find((item) => item.id === drag.id);
    if (!marker) return;
    try {
      const updated = await updateMapMarker(worldSlug, marker.id, { x: marker.x, y: marker.y });
      setMap((current) =>
        current
          ? { ...current, markers: current.markers.map((item) => (item.id === updated.id ? updated : item)) }
          : current,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "移动标记失败");
    }
  };

  return (
    <div className="ws-app studio-app map-page">
      <aside id="map-sidebar" className={`sidebar studio-sidebar map-sidebar${sidebarOpen ? " open" : ""}`} aria-label="地图导航">
        <div className="sidebar-head">
          <div>
            <div className="sidebar-title">{world?.name ?? "世界地图"}</div>
            <div className="sidebar-sub">世界地图 · {map?.markers.length ?? 0} 个图钉</div>
          </div>
          <div className="sidebar-head-actions">
            <a className="icon-btn" href={`/w/${worldSlug}/wiki`} aria-label="返回 Wiki" title="返回 Wiki">
              <ArrowLeft size={16} />
            </a>
            <button type="button" className="icon-btn sidebar-close" aria-label="关闭地图导航" onClick={() => setSidebarOpen(false)}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="studio-section">
          <div className="sidebar-section-label">图钉</div>
          <div className="studio-layer-list">
            <input
              className="map-pin-search"
              type="search"
              value={markerSearch}
              onChange={(event) => setMarkerSearch(event.target.value)}
              placeholder="搜索图钉…"
              aria-label="搜索地图图钉"
            />
            <div className="map-kind-filter" role="group" aria-label="按类型筛选图钉">
              {(["all", "place", "city", "event", "character", "note"] as const).map((kind) => (
                <button key={kind} type="button" className={markerKindFilter === kind ? "active" : ""} aria-pressed={markerKindFilter === kind} onClick={() => setMarkerKindFilter(kind)}>
                  {kind === "all" ? "全部" : kindLabels[kind]}
                </button>
              ))}
            </div>
            {map?.markers.length ? map.markers.filter((marker) => (markerKindFilter === "all" || marker.kind === markerKindFilter) && marker.label.toLowerCase().includes(markerSearch.trim().toLowerCase())).map((marker) => (
              <button
                key={marker.id}
                type="button"
                className={selectedId === marker.id ? "active" : ""}
                aria-pressed={selectedId === marker.id}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  openPinMenu(marker, event.clientX || rect.left, event.clientY || rect.bottom);
                }}
                onClick={() => {
                  setDraft(null);
                  setEditing(false);
                  setSelectedId(marker.id);
                  setSidebarOpen(false);
                  revealInspector();
                }}
              >
                <i className={`map-dot ${marker.kind}`} />
                <span>{marker.label}</span>
              </button>
            )) : <span className="tree-empty">还没有图钉</span>}
          </div>
        </div>

        <div className="studio-section">
          <div className="sidebar-section-label">图例</div>
          <div className="studio-legend">
            {(Object.keys(kindLabels) as MapMarker["kind"][]).map((item) => (
              <span key={item}><i className={`map-dot ${item}`} /> {kindLabels[item]}</span>
            ))}
          </div>
        </div>

        {world?.role === "owner" && (
          <div className="studio-section terrain-web-section">
            <div className="sidebar-section-label">Terrain Web</div>
            <div className="terrain-web-panel">
              <label className="field">
                <span>Seed</span>
                <div className="terrain-seed-row">
                  <input
                    value={terrainSeed}
                    onChange={(event) => setTerrainSeed(event.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label="Terrain Web seed"
                    placeholder="留空随机"
                  />
                  <button type="button" className="icon-btn" onClick={randomizeTerrainSeed} aria-label="随机 seed" title="随机 seed">
                    <RotateCcw size={16} />
                  </button>
                </div>
              </label>
              <div className="terrain-params-row">
                <label className="field">
                  <span>输出分辨率</span>
                  <SelectMenu
                    compact
                    value={terrainResolution}
                    onChange={setTerrainResolution}
                    ariaLabel="输出分辨率"
                    options={[
                      { value: "1024", label: "1024 × 640 · 快速" },
                      { value: "1536", label: "1536 × 960 · 标准" },
                      { value: "2048", label: "2048 × 1280 · 细节" },
                      { value: "4096", label: "4096 × 2560 · 超清（较慢）" },
                    ]}
                  />
                </label>
                <label className="field">
                  <span>地名数量</span>
                  <SelectMenu
                    compact
                    value={String(terrainLabelCount)}
                    onChange={(value) => setTerrainLabelCount(Number(value))}
                    ariaLabel="地名数量"
                    options={[0, 4, 7, 10, 12].map((count) => ({ value: String(count), label: `${count} 个` }))}
                  />
                </label>
              </div>
              <label className="field">
                <span>风格</span>
                <SelectMenu
                  compact
                  value={terrainStyle}
                  onChange={(value) => setTerrainStyle(value as TerrainWebStyle)}
                  ariaLabel="地形风格"
                  options={[
                    { value: "atlas", label: "Atlas · 自然地形" },
                    { value: "parchment", label: "Parchment · 手绘地图" },
                    { value: "topographic", label: "Topographic · 等高线" },
                  ]}
                />
              </label>
              <button type="button" className="studio-primary terrain-generate" onClick={() => void generateTerrain()} disabled={terrainBusy}>
                {terrainBusy ? <Loader2 size={16} className="spin" /> : <Mountain size={16} />}
                {terrainBusy ? "生成中…" : "生成地形底图"}
              </button>
              {(terrainBusy || terrainProgress > 0) && (
                <div className="terrain-progress" role="progressbar" aria-label="地形生成进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(terrainProgress)}>
                  <div className="terrain-progress-track"><div className="terrain-progress-fill" style={{ width: `${terrainProgress}%` }} /></div>
                  <div className="terrain-progress-meta"><span>{terrainPhase || "生成中…"}</span><span>{Math.round(terrainProgress)}%</span></div>
                </div>
              )}
              {terrainResult && !terrainBusy && (
                <p className="terrain-web-status">
                  已生成 {terrainResult.width}×{terrainResult.height} · {terrainLabelTotal} 个地名 · {terrainResult.elapsed_ms}ms
                </p>
              )}
              {terrainResult && pendingTerrainLabels.length > 0 && (
                <button
                  type="button"
                  className="studio-action"
                  onClick={() => void importTerrainLabels()}
                  disabled={terrainImportBusy || terrainBusy}
                >
                  {terrainImportBusy ? <Loader2 size={16} className="spin" /> : <MapPin size={16} />}
                  {terrainImportBusy ? "导入中…" : `把 ${pendingTerrainLabels.length} 个地名转为图钉`}
                </button>
              )}
              {terrainImported !== null && (
                <p className="terrain-import-status">已导入 {terrainImported} 个地名图钉</p>
              )}
              <p className="terrain-web-note">风格即时预览；换 seed、分辨率或生成参数才需要重算。本地 CPU 地形引擎 · 2048 输出 · 可选 Three.js 实时 3D 光照预览。</p>
            </div>
          </div>
        )}

        {world?.role === "owner" && (
          <details className="terrain-advanced">
            <summary>高级 · 自定义底图</summary>
            <div className="studio-section">
              <button
                type="button"
                className="studio-action"
                title="上传地图背景"
                onClick={() => fileInputRef.current?.click()}
                disabled={backgroundBusy}
              >
                {backgroundBusy ? <Loader2 size={16} className="spin" /> : <ImagePlus size={16} />}
                上传背景图
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => void uploadBackground(event)}
                disabled={backgroundBusy}
                hidden
              />
              {map?.background_url && (
                <button type="button" className="studio-action" onClick={() => void removeBackground()} disabled={backgroundBusy}>
                  <Trash2 size={16} /> 移除背景
                </button>
              )}
            </div>
          </details>
        )}

        <div className="studio-foot">
          <a href={`/w/${worldSlug}/wiki`}>返回 Wiki</a>
          <a href={`/w/${worldSlug}/timeline`}>时间线</a>
          <a href={`/w/${worldSlug}`}>工作区</a>
        </div>
      </aside>

      <button
        type="button"
        tabIndex={-1}
        className={`mobile-scrim${sidebarOpen ? " show" : ""}`}
        aria-label="关闭地图导航"
        onClick={() => setSidebarOpen(false)}
      />

      <div className="ws-main" inert={sidebarOpen ? true : undefined}>
        <header className="topbar-workspace studio-topbar map-topbar">
          <button
            ref={menuRef}
            type="button"
            className="icon-btn menu-button"
            aria-label="打开地图导航"
            aria-expanded={sidebarOpen}
            aria-controls="map-sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={16} />
          </button>
          <span className="studio-crumb"><Crosshair size={16} /> {world?.name ?? "世界地图"} / 世界地图</span>
          <div className="studio-top-actions">
            {isTerrain && <span className="terrain-badge"><Mountain size={16} /> Terrain Web</span>}
            {mesh && (
              <button
                type="button"
                className={`studio-link terrain-3d-toggle${terrain3dOpen ? " active" : ""}`}
                onClick={() => setTerrain3dOpen((value) => !value)}
                aria-pressed={terrain3dOpen}
              >
                <Box size={16} /> {terrain3dOpen ? "2D" : "3D β"}
              </button>
            )}
            <span className="studio-count">{map?.markers.length ?? 0} 个图钉</span>
            <div className={`map-zoom-group${terrain3dOpen ? " is-hidden" : ""}`} role="group" aria-label="地图缩放">
              <button type="button" aria-label="缩小地图" onClick={() => changeZoom(zoom - 0.5)} disabled={zoom <= 1}>−</button>
              <span>{zoom.toFixed(1)}×</span>
              <button type="button" aria-label="放大地图" onClick={() => changeZoom(zoom + 0.5)} disabled={zoom >= maxZoom}>+</button>
              <button type="button" aria-label="重置地图缩放与位置" onClick={() => { changeZoom(1); setPan({ x: 0, y: 0 }); }}>重置</button>
            </div>
            <div className={`map-mode-group${terrain3dOpen ? " is-hidden" : ""}`} role="group" aria-label="地图模式">
              {canEdit && (
                <button type="button" className={mode === "place" ? "active" : ""} aria-pressed={mode === "place"} onClick={() => setMode("place")}>放置</button>
              )}
              <button type="button" className={mode === "pan" ? "active" : ""} aria-pressed={mode === "pan"} onClick={() => setMode("pan")}>移动</button>
            </div>
            <a className="studio-link" href={`/w/${worldSlug}/wiki`}>返回 Wiki</a>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="ws-workspace studio-workspace">
          {loading && <div className="loading"><Loader2 size={16} className="spin" /> 正在打开地图…</div>}
          {error && <div className="error" role="alert">{error}</div>}

          {!loading && map && (
            <div className={`studio-layout map-studio-layout${canEdit ? "" : " is-readonly"}`}>
              <div className={`studio-canvas map-studio-canvas${isTerrain ? " has-terrain" : ""}`}>
                <div
                  ref={canvasRef}
                  className={`map-canvas${canEdit ? " editable" : ""}${mode === "pan" ? " is-panning" : ""}${isTerrain ? " terrain" : ""}`}
                  onClick={onCanvasClick}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    const point = mapPoint(event.clientX, event.clientY);
                    const entries: ContextMenuEntry[] = [];
                    if (canEdit) {
                      entries.push(
                        { label: "在此添加标记", icon: <Plus size={16} />, run: () => beginDraft(point) },
                        { separator: true },
                      );
                    }
                    entries.push(
                      { label: "复制地图链接", icon: <Link2 size={16} />, run: () => void copyMapLink() },
                      { label: "打开世界 Wiki", icon: <ExternalLink size={16} />, run: () => { window.location.href = `/w/${worldSlug}/wiki`; } },
                    );
                    if (map.background_url) {
                      entries.push({ label: "下载地图背景", icon: <Download size={16} />, run: downloadMapImage });
                    }
                    entries.push(
                      { separator: true },
                      {
                        label: "重置视图",
                        icon: <RotateCcw size={16} />,
                        run: () => { changeZoom(1); setPan({ x: 0, y: 0 }); },
                      },
                    );
                    setMenu({ x: event.clientX, y: event.clientY, entries });
                  }}
                  onPointerDown={onCanvasPointerDown}
                  onPointerMove={onCanvasPointerMove}
                  onPointerUp={onCanvasPointerUp}
                  onPointerLeave={(event) => { activePointersRef.current.delete(event.pointerId); setHoveredMarkerId(null); setCursorPoint(null); }}
                  onDoubleClick={onCanvasDoubleClick}
                  onKeyDown={onCanvasKeyDown}
                  role={canEdit ? "group" : "img"}
                  tabIndex={canEdit ? 0 : undefined}
                  aria-label={canEdit
                    ? `${world?.name ?? "世界"}地图。按回车在地图中心添加标记；标记可拖动。`
                    : `${world?.name ?? "世界"}地图`}
                >
                  {isTerrain && !terrain3dOpen && (
                    <div className="map-canvas-status" aria-hidden="true">
                      <span>{zoom.toFixed(1)}×</span>
                      <span>{cursorPoint ? `${(cursorPoint.x * 100).toFixed(1)}% · ${(cursorPoint.y * 100).toFixed(1)}%` : "拖动平移 · 滚轮缩放"}</span>
                    </div>
                  )}
                  {terrain3dOpen && mesh ? (
                    <div
                      className="terrain-3d-layer"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <Suspense fallback={<div className="terrain-3d-overlay"><Loader2 size={16} className="spin" /> 加载 3D 预览…</div>}>
                        <Terrain3DPreview
                          mesh={mesh}
                          meshWidth={meshWidth}
                          meshHeight={meshHeight}
                          textureData={textureData}
                          onClose={() => setTerrain3dOpen(false)}
                        />
                      </Suspense>
                    </div>
                  ) : (
                    <>
                    {map.background_url && isTerrain && (
                      <MapCanvasStage
                        src={map.background_url}
                        heightmap={heightmapData}
                        heightmapWidth={heightmapWidth}
                        heightmapHeight={heightmapHeight}
                        mapWidth={terrainWidth}
                        mapHeight={terrainResult?.height || map?.terrain_web?.height || 1280}
                        zoom={zoom}
                        pan={pan}
                        filterClass={terrainPreviewClass}
                        terrain
                      />
                    )}
                    {map.background_url && isTerrain && (
                      <MapOverlayCanvas
                        markers={map.markers}
                        selectedId={selectedId}
                        hoveredId={hoveredMarkerId}
                        zoom={zoom}
                        pan={pan}
                        view={mapView}
                      />
                    )}
                  <div
                    className="map-world"
                    style={mapView ? {
                      inset: "auto",
                      left: mapView.left,
                      top: mapView.top,
                      width: mapView.width,
                      height: mapView.height,
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    } : { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                  >
                    {map.background_url && !isTerrain && (
                      <img className="map-background" src={map.background_url} alt="" draggable={false} />
                    )}
                    <div className="map-grid" aria-hidden="true" />
                    {isTerrain && pendingTerrainLabels.map((label) => (
                      <span
                        key={label.name}
                        className="terrain-label-anchor"
                        style={{ left: `${label.x * 100}%`, top: `${label.y * 100}%` }}
                        aria-hidden="true"
                      >
                        <span
                          className="terrain-label"
                          style={{ transform: `translate(-50%, -50%) scale(${1 / zoom})`, transformOrigin: "center" }}
                        >
                          {label.name}
                        </span>
                      </span>
                    ))}
                    {map.markers.map((marker) => (
                      <div key={marker.id} className="map-pin-anchor" style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}>
                      <button
                        type="button"
                        className={`map-pin${selectedId === marker.id ? " selected" : ""}`}
                        style={{ left: 0, top: 0, transform: `translate(-50%, -100%) scale(${1 / zoom})`, transformOrigin: "bottom center" }}
                        onPointerEnter={() => setHoveredMarkerId(marker.id)}
                        onPointerLeave={() => setHoveredMarkerId(null)}
                        onPointerDown={(event) => onPointerDown(event, marker)}
                        onPointerMove={onPointerMove}
                        onPointerUp={(event) => void onPointerUp(event)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const rect = event.currentTarget.getBoundingClientRect();
                          openPinMenu(marker, event.clientX || rect.left, event.clientY || rect.bottom);
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDraft(null);
                          setEditing(false);
                          setSelectedId(marker.id);
                        }}
                        aria-label={`${marker.label} · ${kindLabels[marker.kind]}`}
                      >
                        <span
                          className="map-pin-icon"
                          ref={vtClassRef("icon", selectedId === marker.id && Boolean(marker.card_slug))}
                          style={selectedId === marker.id && marker.card_slug ? vt("icon", marker.card_slug) : undefined}
                        >
                          <MapPin size={16} />
                        </span>
                        <span>{marker.label}</span>
                      </button>
                      </div>
                    ))}
                    {draft && (
                      <span
                        className="map-draft"
                        style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  </>
                  )}
                  {map.markers.length === 0 && !draft && !isTerrain && !terrain3dOpen && (
                    <div className="map-canvas-empty" aria-hidden="true">
                      <MapPin size={20} />
                      <strong>{canEdit ? "还没有标记" : "这个世界还没有标注地图"}</strong>
                      <span>{canEdit ? "点击画布空白处放下第一个地点" : "地图暂时是空的"}</span>
                    </div>
                  )}
                </div>
              </div>

              <aside ref={inspectorRef} className="studio-inspector map-inspector">
                {draft ? (
                  <form onSubmit={saveDraft} className="map-form">
                    <span className="eyebrow"><Plus size={16} /> 新标记</span>
                    <label className="field">
                      <span>名称</span>
                      <input autoFocus required maxLength={120} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如：七钟楼" />
                    </label>
                    <label className="field">
                      <span>类型</span>
                      <SelectMenu
                        compact
                        value={kind}
                        onChange={(value) => setKind(value as MapMarker["kind"])}
                        ariaLabel="标记类型"
                        options={(Object.keys(kindLabels) as MapMarker["kind"][]).map((item) => ({ value: item, label: kindLabels[item] }))}
                      />
                    </label>
                    <label className="field">
                      <span>关联卡片（可选）</span>
                      <SelectMenu
                        compact
                        value={cardId}
                        onChange={setCardId}
                        ariaLabel="关联卡片"
                        options={[{ value: "", label: "不关联" }, ...cards.map((card) => ({ value: String(card.id), label: card.title }))]}
                      />
                    </label>
                    <div className="map-form-actions">
                      <button type="submit" className="studio-primary" disabled={saving || !label.trim()}>
                        {saving ? "保存中…" : "放置标记"}
                      </button>
                      <button type="button" className="studio-link" onClick={() => setDraft(null)}>取消</button>
                    </div>
                  </form>
                ) : selected ? (
                  editing ? (
                    <form onSubmit={saveEdit} className="map-form">
                      <span className="eyebrow">编辑标记</span>
                      <label className="field">
                        <span>名称</span>
                        <input required maxLength={120} value={editLabel} onChange={(event) => setEditLabel(event.target.value)} />
                      </label>
                      <label className="field">
                        <span>类型</span>
                        <SelectMenu
                          compact
                          value={editKind}
                          onChange={(value) => setEditKind(value as MapMarker["kind"])}
                          ariaLabel="编辑标记类型"
                          options={(Object.keys(kindLabels) as MapMarker["kind"][]).map((item) => ({ value: item, label: kindLabels[item] }))}
                        />
                      </label>
                      <label className="field">
                        <span>关联卡片（可选）</span>
                        <SelectMenu
                          compact
                          value={editCard}
                          onChange={setEditCard}
                          ariaLabel="编辑关联卡片"
                          options={[{ value: "", label: "不关联" }, ...cards.map((card) => ({ value: String(card.id), label: card.title }))]}
                        />
                      </label>
                      <div className="map-form-actions">
                        <button type="submit" className="studio-primary" disabled={saving || !editLabel.trim()}>
                          {saving ? "保存中…" : "保存"}
                        </button>
                        <button type="button" className="studio-link" onClick={() => setEditing(false)}>取消</button>
                      </div>
                    </form>
                  ) : (
                    <div className="map-form map-detail">
                      <span className="eyebrow">{kindLabels[selected.kind]}</span>
                      <h2>{selected.label}</h2>
                      {selected.card_slug ? (
                        <a className="studio-primary" href={`/w/${worldSlug}/wiki/${selected.card_slug}`}>打开关联卡片</a>
                      ) : (
                        <p>没有关联卡片。</p>
                      )}
                      {canEdit && (
                        <div className="map-form-actions">
                          <button type="button" className="studio-action" onClick={() => focusMarker(selected)}>定位</button>
                          <button type="button" className="studio-action" onClick={startEdit}>编辑</button>
                          <button type="button" className="studio-action studio-danger" onClick={() => void remove()} disabled={saving}>
                            <Trash2 size={16} /> 删除标记
                          </button>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="map-empty">
                    <span className="eyebrow">地图说明</span>
                    <h2>{canEdit ? (map.markers.length > 0 ? "选择一个标记" : "放一个标记") : "还没有标记"}</h2>
                    <p>
                      {canEdit
                        ? map.markers.length > 0
                          ? "点击地图上的图钉查看详情，或点击空白处再放一个标记。"
                          : "点击地图空白处，再填写名称；已放置的标记可以拖动。"
                        : "这个世界还没有公开地图标记。"}
                    </p>
                    {canEdit && (
                      <button type="button" className="studio-primary" onClick={() => beginDraft({ x: 0.5, y: 0.5 })}>
                        <Plus size={16} /> 在地图中心添加标记
                      </button>
                    )}
                    <span className="map-count">{map.markers.length} 个标记</span>
                  </div>
                )}
              </aside>
            </div>
          )}
        </main>
      </div>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} onError={setError} />
    </div>
  );
}
