import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { ChevronDown, Download, Lock, Pause, Play, Rotate3D, Trash2, Unlock, Upload } from "lucide-react";
import { loadDefaultFont, loadFontFromArrayBuffer, measureTextWidth, type LoadedFont } from "@/lib/tireFont";
import { buildTire, type TireParams } from "@/lib/tireGeometry";
import { clearCustomModel, CustomRim, RIM_LIBRARY, findRim } from "@/components/CustomRim";

type EditorSection = "text" | "tread" | "tire" | "rim" | "lighting" | "spin";

const EDITOR_TABS: { id: EditorSection; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "tread", label: "Text tread" },
  { id: "tire", label: "Tire" },
  { id: "rim", label: "Rim" },
  { id: "lighting", label: "Lighting" },
  { id: "spin", label: "Spin" },
];

type SpinMode = "x" | "y" | "both";

type SpinSettings = {
  swipeSpeed: number;
  horizontalRotation: number;
  verticalRotation: number;
  xSpeed: number;
  ySpeed: number;
  mode: SpinMode;
  playing: boolean;
  locks: Record<"swipeSpeed" | "horizontalRotation" | "verticalRotation" | "xSpeed" | "ySpeed", boolean>;
};

const DEFAULT_SPIN: SpinSettings = {
  swipeSpeed: 1,
  horizontalRotation: 0,
  verticalRotation: 0,
  xSpeed: 0.35,
  ySpeed: 0.2,
  mode: "x",
  playing: false,
  locks: {
    swipeSpeed: false,
    horizontalRotation: false,
    verticalRotation: false,
    xSpeed: false,
    ySpeed: false,
  },
};

const DEFAULTS: TireParams = {
  text: "SUPERPOWER",
  radius: 1.6,
  width: 2.4,
  sidewallThickness: 0.25,
  inflate: 0.55,
  rimRadius: 0.8,
  rimDepth: 0.4,
  fontSize: 0.5,
  letterSpacing: 0.0,
  wordSpacing: 0.04,
  lineSpacing: 0.02,
  stagger: 0,
  extrusion: 0.16,
  bevel: 0.4,
  rowCount: 0,
  textDirection: "vertical",
  tireColor: "#1a1a1a",
  rimStyle: "gt2",
  autoWidth: true,
  widthOffset: 0,
  hideTireBody: false,
};

type ImportedModel = {
  name: string;
  url: string;
};

function TireMesh({
  font,
  params,
  onReady,
}: {
  font: LoadedFont;
  params: TireParams;
  onReady?: (group: THREE.Group) => void;
}) {
  const [built, setBuilt] = useState<ReturnType<typeof buildTire> | null>(null);
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    const b = buildTire(font, params);
    setBuilt((prev) => {
      prev?.dispose();
      return b;
    });
    onReady?.(b.group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [font, paramsKey]);

  useEffect(() => () => built?.dispose(), []); // final cleanup
  if (!built) return null;
  return <primitive object={built.group} />;
}

function TireRig({
  spin,
  onReady,
  children,
}: {
  spin: SpinSettings;
  onReady: (group: THREE.Group) => void;
  children: React.ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (group) onReady(group);
  }, [onReady]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.rotation.x = THREE.MathUtils.degToRad(spin.verticalRotation);
    group.rotation.y = THREE.MathUtils.degToRad(spin.horizontalRotation);
  }, [spin.horizontalRotation, spin.verticalRotation]);

  useFrame((_, rawDelta) => {
    const group = groupRef.current;
    if (!group || !spin.playing) return;
    const delta = Math.min(rawDelta, 0.05);
    if (
      (spin.mode === "x" || spin.mode === "both") &&
      !spin.locks.xSpeed &&
      !spin.locks.verticalRotation
    ) {
      group.rotation.x += spin.xSpeed * delta;
    }
    if (
      (spin.mode === "y" || spin.mode === "both") &&
      !spin.locks.ySpeed &&
      !spin.locks.horizontalRotation
    ) {
      group.rotation.y += spin.ySpeed * delta;
    }
  });

  return <group ref={groupRef}>{children}</group>;
}

function CanvasBackground({ transparent, color }: { transparent: boolean; color: string }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = transparent ? null : new THREE.Color(color);
  }, [scene, transparent, color]);
  return null;
}

function StudioEnvironment({ intensity }: { intensity: number }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, 0.03);
    scene.environment = target.texture;
    scene.environmentIntensity = Math.max(0.12, 0.45 / Math.max(0.65, intensity));
    return () => {
      if (scene.environment === target.texture) scene.environment = null;
      target.dispose();
      room.dispose();
      generator.dispose();
    };
  }, [gl, scene, intensity]);

  return null;
}

function useExport(rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>) {
  const groupRef = useRef<THREE.Group | null>(null);

  const captureGroup = useCallback((g: THREE.Group) => {
    groupRef.current = g;
  }, []);

  const exportGLB = useCallback(async () => {
    if (!groupRef.current) return;
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(groupRef.current, { binary: true });
    const blob = new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
    downloadBlob(blob, "tire.glb");
  }, []);

  const exportPNG = useCallback(async (transparent: boolean) => {
    const gl = rendererRef.current;
    if (!gl) return;
    const scene = (gl as unknown as { __scene?: THREE.Scene }).__scene;
    const cam = (gl as unknown as { __camera?: THREE.Camera }).__camera;
    if (!scene || !cam) return;
    const prevBg = scene.background;
    if (transparent) scene.background = null;
    gl.render(scene, cam);
    const dataUrl = gl.domElement.toDataURL("image/png");
    scene.background = prevBg;
    const blob = await (await fetch(dataUrl)).blob();
    downloadBlob(blob, transparent ? "tire-transparent.png" : "tire.png");
  }, [rendererRef]);

  return { captureGroup, exportGLB, exportPNG };
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SceneWireup({
  rendererRef,
}: {
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
}) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    rendererRef.current = gl;
    (gl as unknown as { __scene?: THREE.Scene }).__scene = scene;
    (gl as unknown as { __camera?: THREE.Camera }).__camera = camera;
  }, [gl, scene, camera, rendererRef]);
  return null;
}

function ResponsiveCamera({
  distance,
  radius,
  width,
}: {
  distance: number;
  radius: number;
  width: number;
}) {
  const { camera, size } = useThree();

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    // Fit the whole tyre (bounding sphere) inside the current aspect ratio so
    // nothing is cropped in portrait windows, on desktop or mobile.
    const boundR = Math.sqrt(radius * radius * 1.15 + (width / 2) ** 2) + 0.35;
    const vFit = boundR / Math.tan((camera.fov * Math.PI) / 360);
    const aspect = Math.max(0.4, size.width / Math.max(1, size.height));
    const fit = Math.max(vFit, vFit / aspect);
    const margin = size.width < 768 ? 1.12 : 1.06;
    const d = Math.max(distance, fit * margin);
    camera.position.set(d * 0.55, d * 0.28, d);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, distance, radius, width, size.width, size.height]);

  return null;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-neutral-400">
        <span>{label}</span>
        <span className="text-yellow-300/90">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full accent-yellow-400 disabled:cursor-not-allowed"
      />
    </label>
  );
}

function LockableSlider({
  locked,
  onToggleLock,
  ...sliderProps
}: React.ComponentProps<typeof Slider> & {
  locked: boolean;
  onToggleLock: () => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_32px] items-end gap-2">
      <div className={locked ? "opacity-50" : ""}>
        <Slider {...sliderProps} disabled={locked} />
      </div>
      <button
        type="button"
        onClick={onToggleLock}
        aria-label={`${locked ? "Unlock" : "Lock"} ${sliderProps.label}`}
        title={`${locked ? "Unlock" : "Lock"} ${sliderProps.label}`}
        className={`mb-0.5 grid h-8 w-8 place-items-center rounded-full border transition-colors ${
          locked
            ? "border-yellow-400/60 bg-yellow-400/20 text-yellow-200"
            : "border-white/10 bg-black/20 text-neutral-500 hover:text-neutral-200"
        }`}
      >
        {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

type Lighting = {
  topColor: string;
  frontColor: string;
  bottomColor: string;
  topIntensity: number;
  frontIntensity: number;
  bottomIntensity: number;
  intensity: number;
  grain: number; // dot size in px (0 = off)
};

const DEFAULT_LIGHTING: Lighting = {
  topColor: "#ffffff",
  frontColor: "#ffe6b0",
  bottomColor: "#8899ff",
  topIntensity: 1,
  frontIntensity: 1,
  bottomIntensity: 1,
  intensity: 1.0,
  grain: 0,
};

const DEFAULT_BG = "#050505";

// Scale a hex color's RGB channels by k (clamped 0-255).
function scaleHex(hex: string, k: number): string {
  const m = /^#?([a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 0xff) * k)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 0xff) * k)));
  const b = Math.max(0, Math.min(255, Math.round((n & 0xff) * k)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export default function TireStudio() {
  const [font, setFont] = useState<LoadedFont | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const [params, setParams] = useState<TireParams>(DEFAULTS);
  const [transparentBg, setTransparentBg] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [activeMobileSection, setActiveMobileSection] = useState<EditorSection>("text");
  const [spin, setSpin] = useState<SpinSettings>(DEFAULT_SPIN);
  const [lighting, setLighting] = useState<Lighting>(DEFAULT_LIGHTING);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_BG);
  const [bgIntensity, setBgIntensity] = useState<number>(1);
  const [rimColor, setRimColor] = useState<string>("#dcdce2");
  const [rimIntensity, setRimIntensity] = useState<number>(1);
  const [tireIntensity, setTireIntensity] = useState<number>(1);
  const [importedRim, setImportedRim] = useState<ImportedModel | null>(null);
  const [importedTire, setImportedTire] = useState<ImportedModel | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    text: true,
    tire: true,
    rim: false,
    tread: true,
    lighting: false,
    spin: false,
  });
  const toggle = (k: string) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));


  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const { captureGroup, exportGLB, exportPNG } = useExport(rendererRef);

  useEffect(() => {
    loadDefaultFont().then(setFont).catch((e) => setFontError(String(e)));
  }, []);

  const onFontFile = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const f = await loadFontFromArrayBuffer(buf, file.name);
      setFont(f);
      setFontError(null);
    } catch (e) {
      setFontError(`Could not load font: ${String(e)}`);
    }
  }, []);

  const importModel = useCallback((file: File, kind: "rim" | "tire") => {
    if (!file.name.toLowerCase().endsWith(".glb")) return;
    const next = { name: file.name, url: URL.createObjectURL(file) };
    if (kind === "rim") {
      setImportedRim((current) => {
        if (current) {
          clearCustomModel(current.url);
          URL.revokeObjectURL(current.url);
        }
        return next;
      });
      setParams((current) => ({ ...current, rimStyle: "custom-rim" }));
    } else {
      setImportedTire((current) => {
        if (current) {
          clearCustomModel(current.url);
          URL.revokeObjectURL(current.url);
        }
        return next;
      });
      setParams((current) => ({ ...current, hideTireBody: true }));
    }
  }, []);

  useEffect(() => () => {
    if (importedRim) {
      clearCustomModel(importedRim.url);
      URL.revokeObjectURL(importedRim.url);
    }
  }, [importedRim]);

  useEffect(() => () => {
    if (importedTire) {
      clearCustomModel(importedTire.url);
      URL.revokeObjectURL(importedTire.url);
    }
  }, [importedTire]);

  const set = <K extends keyof TireParams>(k: K, v: TireParams[K]) =>
    setParams((p) => ({ ...p, [k]: v }));

  // When auto width is on, the tire grows/shrinks to fit the longest text
  // line; widthOffset lets the user nudge it from there.
  const effectiveParams = useMemo(() => {
    if (!font || !params.autoWidth) return params;
    const lines = params.text.split(/\r?\n/).slice(0, 2);
    let longest = 0;
    for (const line of lines) {
      longest = Math.max(longest, measureTextWidth(font, line, params.fontSize, params.letterSpacing));
    }
    const base = Math.min(6, Math.max(0.6, longest + 0.3));
    const width = Math.min(6, Math.max(0.4, base + params.widthOffset));
    return { ...params, width };
  }, [font, params]);

  const camDist = useMemo(
    () => effectiveParams.radius * 3.6 + effectiveParams.width * 0.6,
    [effectiveParams.radius, effectiveParams.width],
  );

  const setSpinValue = <K extends keyof Omit<SpinSettings, "locks">>(
    key: K,
    value: SpinSettings[K],
  ) => setSpin((current) => ({ ...current, [key]: value }));

  const toggleSpinLock = (key: keyof SpinSettings["locks"]) =>
    setSpin((current) => ({
      ...current,
      locks: { ...current.locks, [key]: !current.locks[key] },
    }));

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    setSpin((current) => ({
      ...current,
      horizontalRotation: current.locks.horizontalRotation || current.locks.swipeSpeed
        ? current.horizontalRotation
        : current.horizontalRotation + dx * 0.45 * current.swipeSpeed,
      verticalRotation: current.locks.verticalRotation || current.locks.swipeSpeed
        ? current.verticalRotation
        : current.verticalRotation + dy * 0.45 * current.swipeSpeed,
    }));
  };

  const endPointerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-neutral-950 text-neutral-300 md:h-[100dvh] md:overflow-hidden">
      <div
        className="relative h-[52dvh] min-h-[340px] max-h-[460px] w-full touch-none md:absolute md:inset-0 md:h-full md:max-h-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointerDrag}
        onPointerCancel={endPointerDrag}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{
            antialias: true,
            preserveDrawingBuffer: true,
            alpha: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.08,
          }}
          camera={{ position: [camDist * 0.7, camDist * 0.3, camDist], fov: 32 }}
        >
        <SceneWireup rendererRef={rendererRef} />
        <ResponsiveCamera distance={camDist} radius={effectiveParams.radius} width={effectiveParams.width} />
        <CanvasBackground transparent={transparentBg} color={scaleHex(bgColor, bgIntensity)} />
        <StudioEnvironment intensity={lighting.intensity} />
        {/* Ambient stays tiny so shadows go deep black as intensity climbs. */}
        <ambientLight intensity={0.04} color={lighting.frontColor} />
        {/* Top */}
        <directionalLight
          position={[0, 10, 2]}
          intensity={1.5 * Math.pow(lighting.intensity, 1.8) * lighting.topIntensity}
          color={lighting.topColor}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        {/* Front */}
        <directionalLight
          position={[4, 2, 8]}
          intensity={1.0 * Math.pow(lighting.intensity, 1.8) * lighting.frontIntensity}
          color={lighting.frontColor}
        />
        {/* Bottom */}
        <directionalLight
          position={[-3, -6, -4]}
          intensity={0.6 * Math.pow(lighting.intensity, 1.8) * lighting.bottomIntensity}
          color={lighting.bottomColor}
        />

        <TireRig spin={spin} onReady={captureGroup}>
          <Suspense fallback={null}>
            {font && (
              <TireMesh
                font={font}
                params={{ ...effectiveParams, tireColor: scaleHex(params.tireColor, tireIntensity) }}
              />
            )}
            {(() => {
              const rim = params.rimStyle === "custom-rim" && importedRim
                ? { id: "custom-rim", url: importedRim.url, fitScale: 1 }
                : findRim(params.rimStyle);
              if (!rim) return null;
              // Match both outer tire faces regardless of the model's original proportions.
              const targetDiameter = (effectiveParams.rimRadius + 0.02) * 2.05;
              const targetWidth = effectiveParams.width + 0.04;
              return (
                <CustomRim
                  key={rim.id}
                  url={rim.url}
                  fitScale={rim.fitScale}
                  targetDiameter={targetDiameter}
                  targetWidth={targetWidth}
                  metalColor={scaleHex(rimColor, rimIntensity)}
                />
              );
            })()}
            {importedTire && (
              <CustomRim
                key={importedTire.url}
                url={importedTire.url}
                targetDiameter={effectiveParams.radius * (1 + effectiveParams.inflate * 0.18) * 2}
                targetWidth={effectiveParams.width}
                metalColor={scaleHex(params.tireColor, tireIntensity)}
                materialMode="rubber"
              />
            )}
          </Suspense>
        </TireRig>


          <OrbitControls enablePan={false} enableRotate={false} minDistance={2} maxDistance={40} />
        </Canvas>

      {/* Grain overlay */}
        {lighting.grain > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[5] mix-blend-overlay"
          style={{
            opacity: Math.min(0.9, 0.25 + lighting.grain * 0.08),
            backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${(1.4 / Math.max(0.4, lighting.grain)).toFixed(3)}' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
            backgroundSize: `${Math.round(120 + lighting.grain * 40)}px`,
          }}
          />
        )}



      {/* Top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-3 md:p-4">
        <div className="pointer-events-auto w-fit max-w-full min-w-0 rounded-lg border border-white/10 bg-black/35 px-3 py-2 backdrop-blur-xl md:rounded-2xl md:bg-black/20">
          <h1 className="truncate whitespace-nowrap text-xs font-bold uppercase tracking-[0.16em] text-neutral-200 md:text-base md:normal-case md:tracking-wider">
            <span className="text-yellow-300/80 md:hidden">Superpower </span>Tire Studio
          </h1>
        </div>
          <div className="pointer-events-auto relative shrink-0">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setExportOpen((open) => !open);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label="Open export menu"
              title="Export"
              aria-expanded={exportOpen}
              className="grid h-9 w-9 place-items-center rounded-full border border-yellow-400/50 bg-black/45 text-yellow-200 shadow-lg backdrop-blur-xl transition-colors hover:bg-yellow-400/20"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            {exportOpen && (
              <div
                className="absolute right-0 top-10 w-52 rounded-lg border border-white/10 bg-black/75 p-3 shadow-2xl backdrop-blur-2xl animate-scale-in"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <label className="mb-3 flex items-center gap-2 text-[11px] text-neutral-300">
                  <input
                    type="checkbox"
                    checked={transparentBg}
                    onChange={(event) => setTransparentBg(event.target.checked)}
                    className="accent-yellow-400"
                  />
                  Transparent PNG
                </label>
                <div className="grid gap-2">
                  <button type="button" onClick={() => exportPNG(transparentBg)} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-200 hover:bg-white/10">Download PNG</button>
                  <button type="button" onClick={() => exportGLB()} className="rounded-md border border-yellow-400/50 bg-yellow-400/15 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-yellow-100 hover:bg-yellow-400/25">Download GLB</button>
                  <button type="button" onClick={() => {
                    if (importedRim) { clearCustomModel(importedRim.url); URL.revokeObjectURL(importedRim.url); }
                    if (importedTire) { clearCustomModel(importedTire.url); URL.revokeObjectURL(importedTire.url); }
                    setImportedRim(null);
                    setImportedTire(null);
                    setParams(DEFAULTS);
                    setSpin(DEFAULT_SPIN);
                  }} className="rounded-md border border-white/10 px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-400 hover:bg-white/5">Reset</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile editor sits below the live tyre; desktop keeps the floating side panel. */}
      <div
        className="relative z-10 flex h-[48dvh] w-full flex-col overflow-hidden border-t border-white/10 bg-black/35 backdrop-blur-2xl backdrop-saturate-150 md:absolute md:bottom-3 md:right-3 md:top-20 md:h-auto md:min-h-0 md:w-[340px] md:rounded-3xl md:border md:bg-black/20"
        style={{
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.5), 0 20px 60px -20px rgba(0,0,0,0.8)",
        }}
      >
        {/* highlight sheen */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-60"
          style={{
            background:
              "radial-gradient(120% 60% at 50% 0%, rgba(255,214,64,0.10), transparent 60%)",
          }}
        />
        <div
          role="tablist"
          aria-label="Tyre editor settings"
          className="relative z-10 flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 bg-black/45 px-3 py-2 backdrop-blur-2xl md:hidden"
        >
          {EDITOR_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeMobileSection === tab.id}
              onClick={() => setActiveMobileSection(tab.id)}
              className={`shrink-0 rounded-md px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                activeMobileSection === tab.id
                  ? "bg-yellow-400 text-neutral-950"
                  : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="mobile-editor-scroll relative min-h-0 flex-1 overflow-y-scroll p-3 [scrollbar-gutter:stable] md:overflow-y-auto md:p-4">
          <CollapsibleSection
            title="Text"
            open={openSections.text}
            onToggle={() => toggle("text")}
            mobileActive={activeMobileSection === "text"}
          >
            <textarea
              rows={2}
              value={params.text}
              onChange={(e) => {
                const lines = e.target.value.toUpperCase().split(/\r?\n/).slice(0, 2);
                set("text", lines.join("\n"));
              }}
              className="w-full resize-none rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm uppercase tracking-wider text-neutral-200 placeholder:text-neutral-500 focus:border-yellow-400/60 focus:outline-none focus:ring-1 focus:ring-yellow-400/40"
              placeholder={"SUPERPOWER\nSTUDIO"}
            />
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                Direction
              </p>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/5 bg-black/20 p-1">
                {(["horizontal", "vertical"] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => set("textDirection", dir)}
                    className={`rounded-md px-2 py-1.5 text-[10px] uppercase tracking-wider transition-colors ${
                      params.textDirection === dir
                        ? "bg-yellow-400/20 text-yellow-100 ring-1 ring-yellow-400/60"
                        : "text-neutral-400 hover:bg-white/5"
                    }`}
                  >
                    {dir}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-neutral-500">
              Horizontal wraps around the tire; vertical runs across the face.
            </p>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                Font <span className="text-yellow-300/80">({font?.name ?? "…"})</span>
              </p>
              <input
                type="file"
                accept=".ttf,.otf,.woff"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFontFile(f);
                }}
                className="block w-full text-[11px] text-neutral-400 file:mr-2 file:rounded-md file:border file:border-yellow-400/40 file:bg-yellow-400/10 file:px-3 file:py-1.5 file:text-[10px] file:uppercase file:tracking-wider file:text-yellow-100 hover:file:bg-yellow-400/20"
              />
              {fontError && <p className="mt-1 text-[10px] text-red-400">{fontError}</p>}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Text tread"
            open={openSections.tread}
            onToggle={() => toggle("tread")}
            mobileActive={activeMobileSection === "tread"}
          >
            <Slider label="Letter height" min={0.1} max={1.6} step={0.02} value={params.fontSize} onChange={(v) => set("fontSize", v)} />
            <Slider label="Letter spacing" min={-0.05} max={0.3} step={0.005} value={params.letterSpacing} onChange={(v) => set("letterSpacing", v)} />
            <Slider label="Phrase gap" min={-0.5} max={2} step={0.01} value={params.wordSpacing} onChange={(v) => set("wordSpacing", v)} />
            <Slider label="Line spacing" min={-0.4} max={0.6} step={0.005} value={params.lineSpacing} onChange={(v) => set("lineSpacing", v)} />
            <Slider label="Stagger" min={0} max={10} step={1} value={params.stagger} onChange={(v) => set("stagger", v)} format={(v) => v.toFixed(0)} />
            <Slider label="Extrusion (raised)" min={0.02} max={0.5} step={0.01} value={params.extrusion} onChange={(v) => set("extrusion", v)} />
            <Slider label="Bevel" min={0} max={1} step={0.05} value={params.bevel} onChange={(v) => set("bevel", v)} />
            <Slider label="Rows (0 = auto)" min={0} max={12} step={1} value={params.rowCount} onChange={(v) => set("rowCount", v)} format={(v) => v.toFixed(0)} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Tire"
            open={openSections.tire}
            onToggle={() => toggle("tire")}
            mobileActive={activeMobileSection === "tire"}
          >
            <Slider label="Diameter" min={0.8} max={3.0} step={0.05} value={params.radius} onChange={(v) => set("radius", v)} />
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                Width mode
              </p>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/5 bg-black/20 p-1">
                {([["auto", "Auto fit text"], ["manual", "Manual"]] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => set("autoWidth", mode === "auto")}
                    className={`rounded-md px-2 py-1.5 text-[10px] uppercase tracking-wider transition-colors ${
                      (params.autoWidth ? "auto" : "manual") === mode
                        ? "bg-yellow-400/20 text-yellow-100 ring-1 ring-yellow-400/60"
                        : "text-neutral-400 hover:bg-white/5"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {params.autoWidth ? (
              <Slider label="Width adjust" min={-1.5} max={1.5} step={0.02} value={params.widthOffset} onChange={(v) => set("widthOffset", v)} format={(v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))} />
            ) : (
              <Slider label="Width (length)" min={0.6} max={5.0} step={0.05} value={params.width} onChange={(v) => set("width", v)} />
            )}
            <Slider label="Inflate / fatness" min={0} max={1.5} step={0.05} value={params.inflate} onChange={(v) => set("inflate", v)} />
            <Slider label="Sidewall thickness" min={0.05} max={1.0} step={0.02} value={params.sidewallThickness} onChange={(v) => set("sidewallThickness", v)} />
            <ColorRow
              label="Tire colour"
              value={params.tireColor}
              onChange={(v) => set("tireColor", v)}
              intensity={tireIntensity}
              onIntensityChange={setTireIntensity}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Rim"
            open={openSections.rim}
            onToggle={() => toggle("rim")}
            mobileActive={activeMobileSection === "rim"}
          >
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                Rim style
              </p>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/5 bg-black/20 p-1">
                {(
                  [
                    ...RIM_LIBRARY.map((r) => ({ id: r.id, label: r.label })),
                    ...(importedRim ? [{ id: "custom-rim", label: importedRim.name }] : []),
                  ]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => set("rimStyle", opt.id)}
                    className={`rounded-md px-2 py-1.5 text-[10px] uppercase tracking-wider transition-colors ${
                      params.rimStyle === opt.id
                        ? "bg-yellow-400/20 text-yellow-100 ring-1 ring-yellow-400/60"
                        : "text-neutral-400 hover:bg-white/5"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-neutral-500">
                Every rim auto-fits the current tyre diameter and width.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-yellow-400/40 bg-yellow-400/10 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-yellow-100 hover:bg-yellow-400/20">
                <Upload className="h-3.5 w-3.5" /> Import rim
                <input type="file" accept=".glb,model/gltf-binary" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) importModel(file, "rim"); event.target.value = ""; }} />
              </label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-yellow-400/40 bg-yellow-400/10 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-yellow-100 hover:bg-yellow-400/20">
                <Upload className="h-3.5 w-3.5" /> Import tyre
                <input type="file" accept=".glb,model/gltf-binary" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) importModel(file, "tire"); event.target.value = ""; }} />
              </label>
            </div>
            {(importedRim || importedTire) && (
              <div className="grid gap-1 text-[10px] text-neutral-400">
                {importedRim && <div className="flex items-center justify-between gap-2"><span className="truncate">Rim: {importedRim.name}</span><button type="button" aria-label="Remove imported rim" title="Remove imported rim" onClick={() => { clearCustomModel(importedRim.url); URL.revokeObjectURL(importedRim.url); setImportedRim(null); set("rimStyle", "gt2"); }} className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 hover:text-neutral-200"><Trash2 className="h-3 w-3" /></button></div>}
                {importedTire && <div className="flex items-center justify-between gap-2"><span className="truncate">Tyre: {importedTire.name}</span><button type="button" aria-label="Remove imported tyre" title="Remove imported tyre" onClick={() => { clearCustomModel(importedTire.url); URL.revokeObjectURL(importedTire.url); setImportedTire(null); set("hideTireBody", false); }} className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 hover:text-neutral-200"><Trash2 className="h-3 w-3" /></button></div>}
              </div>
            )}
            <ColorRow
              label="Rim colour"
              value={rimColor}
              onChange={setRimColor}
              intensity={rimIntensity}
              onIntensityChange={setRimIntensity}
            />
            <Slider label="Rim size" min={0.2} max={1.6} step={0.02} value={params.rimRadius} onChange={(v) => set("rimRadius", v)} />
            <Slider label="Rim depth" min={0} max={1} step={0.02} value={params.rimDepth} onChange={(v) => set("rimDepth", v)} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Lighting"
            open={openSections.lighting}
            onToggle={() => toggle("lighting")}
            mobileActive={activeMobileSection === "lighting"}
          >
            <ColorRow
              label="Background"
              value={bgColor}
              onChange={setBgColor}
              intensity={bgIntensity}
              onIntensityChange={setBgIntensity}
            />
            <ColorRow
              label="Top light"
              value={lighting.topColor}
              onChange={(v) => setLighting((l) => ({ ...l, topColor: v }))}
              intensity={lighting.topIntensity}
              onIntensityChange={(v) => setLighting((l) => ({ ...l, topIntensity: v }))}
            />
            <ColorRow
              label="Front light"
              value={lighting.frontColor}
              onChange={(v) => setLighting((l) => ({ ...l, frontColor: v }))}
              intensity={lighting.frontIntensity}
              onIntensityChange={(v) => setLighting((l) => ({ ...l, frontIntensity: v }))}
            />
            <ColorRow
              label="Bottom light"
              value={lighting.bottomColor}
              onChange={(v) => setLighting((l) => ({ ...l, bottomColor: v }))}
              intensity={lighting.bottomIntensity}
              onIntensityChange={(v) => setLighting((l) => ({ ...l, bottomIntensity: v }))}
            />
            <Slider
              label="Intensity"
              min={0}
              max={8}
              step={0.05}
              value={lighting.intensity}
              onChange={(v) => setLighting((l) => ({ ...l, intensity: v }))}
            />
            <Slider
              label="Grain (dot size)"
              min={0}
              max={6}
              step={0.1}
              value={lighting.grain}
              onChange={(v) => setLighting((l) => ({ ...l, grain: v }))}
            />
          </CollapsibleSection>



          <CollapsibleSection
            title="Spin"
            open={openSections.spin}
            onToggle={() => toggle("spin")}
            mobileActive={activeMobileSection === "spin"}
          >
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/5 bg-black/20 p-1">
                {(["x", "y", "both"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSpinValue("mode", mode)}
                    className={`rounded-md px-2 py-1.5 text-[10px] uppercase tracking-wider transition-colors ${spin.mode === mode ? "bg-yellow-400/20 text-yellow-100 ring-1 ring-yellow-400/60" : "text-neutral-400 hover:bg-white/5"}`}
                  >
                    {mode === "x" ? "X spin" : mode === "y" ? "Y turn" : "Both"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSpinValue("playing", !spin.playing)}
                aria-label={spin.playing ? "Pause automatic spin" : "Start automatic spin"}
                title={spin.playing ? "Pause" : "Play"}
                className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${spin.playing ? "border-yellow-400/60 bg-yellow-400 text-neutral-950" : "border-white/10 bg-black/20 text-neutral-300 hover:bg-white/10"}`}
              >
                {spin.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-neutral-500">
              <Rotate3D className="h-3.5 w-3.5 text-yellow-300/70" /> Swipe the tyre up, down, left or right
            </div>
            <LockableSlider label="Swipe speed" min={0.1} max={3} step={0.05} value={spin.swipeSpeed} onChange={(value) => setSpinValue("swipeSpeed", value)} locked={spin.locks.swipeSpeed} onToggleLock={() => toggleSpinLock("swipeSpeed")} />
            <LockableSlider label="Rotation horizontal" min={-180} max={180} step={1} value={spin.horizontalRotation} onChange={(value) => setSpinValue("horizontalRotation", value)} format={(value) => `${value.toFixed(0)}°`} locked={spin.locks.horizontalRotation} onToggleLock={() => toggleSpinLock("horizontalRotation")} />
            <LockableSlider label="Rotation vertical" min={-180} max={180} step={1} value={spin.verticalRotation} onChange={(value) => setSpinValue("verticalRotation", value)} format={(value) => `${value.toFixed(0)}°`} locked={spin.locks.verticalRotation} onToggleLock={() => toggleSpinLock("verticalRotation")} />
            <LockableSlider label="X-axis spin speed" min={-2} max={2} step={0.05} value={spin.xSpeed} onChange={(value) => setSpinValue("xSpeed", value)} locked={spin.locks.xSpeed} onToggleLock={() => toggleSpinLock("xSpeed")} />
            <LockableSlider label="Y-axis spin speed" min={-2} max={2} step={0.05} value={spin.ySpeed} onChange={(value) => setSpinValue("ySpeed", value)} locked={spin.locks.ySpeed} onToggleLock={() => toggleSpinLock("ySpeed")} />
          </CollapsibleSection>

          <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">
            Swipe the tyre to rotate. Scroll or pinch to zoom. Add this app to your home screen to use it offline.
          </p>
        </div>
      </div>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
  intensity,
  onIntensityChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  intensity?: number;
  onIntensityChange?: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-yellow-300/90">{value}</span>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-10 cursor-pointer rounded-md border border-white/10 bg-black/30"
          />
        </div>
      </label>
      {typeof intensity === "number" && onIntensityChange && (
        <label className="flex items-center gap-2">
          <span className="w-16 text-[9px] uppercase tracking-[0.15em] text-neutral-500">
            Intensity
          </span>
          <input
            type="range"
            min={0}
            max={3}
            step={0.05}
            value={intensity}
            onChange={(e) => onIntensityChange(parseFloat(e.target.value))}
            className="flex-1 accent-yellow-400"
          />
          <span className="w-8 text-right text-[10px] text-yellow-300/80">
            {intensity.toFixed(2)}
          </span>
        </label>
      )}
    </div>
  );
}



function CollapsibleSection({
  title,
  open,
  onToggle,
  mobileActive,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  mobileActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      role="tabpanel"
      className={`${mobileActive ? "block" : "hidden"} overflow-hidden md:mb-3 md:block md:rounded-2xl md:border md:border-white/5 md:bg-white/[0.02]`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="hidden w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] md:flex"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-yellow-300">
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-yellow-300/70 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`grid grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-out ${open ? "md:grid-rows-[1fr]" : "md:grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-4 pb-4 md:gap-3 md:px-3 md:pb-3 md:pt-1">{children}</div>
        </div>
      </div>
    </section>
  );
}
