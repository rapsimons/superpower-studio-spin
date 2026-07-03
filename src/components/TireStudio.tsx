import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { loadDefaultFont, loadFontFromArrayBuffer, type LoadedFont } from "@/lib/tireFont";
import { buildTire, type TireParams } from "@/lib/tireGeometry";

const DEFAULTS: TireParams = {
  text: "SUPERPOWER",
  radius: 1.6,
  width: 2.4,
  sidewallThickness: 0.25,
  inflate: 0.6,
  rimRadius: 0.75,
  rimDepth: 0.4,
  fontSize: 0.42,
  letterSpacing: 0.02,
  wordSpacing: 0.35,
  lineSpacing: 0.05,
  extrusion: 0.14,
  bevel: 0.4,
  rowCount: 0,
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
    let cancelled = false;
    const b = buildTire(font, params);
    if (cancelled) {
      b.dispose();
      return;
    }
    let meshCount = 0;
    b.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshCount++;
    });
    console.log("[tire] built meshes:", meshCount, "params:", params);
    setBuilt((prev) => {
      prev?.dispose();
      return b;
    });
    onReady?.(b.group);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [font, paramsKey]);

  useEffect(() => () => built?.dispose(), []); // final cleanup
  if (!built) return null;
  return <primitive object={built.group} />;
}

function CanvasBackground({ transparent }: { transparent: boolean }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = transparent ? null : new THREE.Color("#000000");
  }, [scene, transparent]);
  return null;
}

type Handles = {
  captureGroup: (g: THREE.Group) => void;
  exportGLB: () => Promise<void>;
  exportPNG: (transparent: boolean) => Promise<void>;
};

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
    // Force one render with desired background then snapshot.
    const scene = (gl as unknown as { __scene?: THREE.Scene }).__scene;
    const cam = (gl as unknown as { __camera?: THREE.Camera }).__camera;
    if (!scene || !cam) return;
    const prevBg = scene.background;
    scene.background = transparent ? null : new THREE.Color("#000000");
    gl.render(scene, cam);
    const dataUrl = gl.domElement.toDataURL("image/png");
    scene.background = prevBg;
    const blob = await (await fetch(dataUrl)).blob();
    downloadBlob(blob, transparent ? "tire-transparent.png" : "tire.png");
  }, [rendererRef]);

  return { captureGroup, exportGLB, exportPNG } satisfies Handles;
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

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wider text-white/60">
        <span>{label}</span>
        <span className="text-white/80">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-orange-500"
      />
    </label>
  );
}

export default function TireStudio() {
  const [font, setFont] = useState<LoadedFont | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const [params, setParams] = useState<TireParams>(DEFAULTS);
  const [transparentBg, setTransparentBg] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
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

  const set = <K extends keyof TireParams>(k: K, v: TireParams[K]) =>
    setParams((p) => ({ ...p, [k]: v }));

  const camDist = useMemo(() => params.radius * 3.6 + params.width * 0.6, [params.radius, params.width]);

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-neutral-950 text-white">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}
        camera={{ position: [camDist * 0.7, camDist * 0.3, camDist], fov: 32 }}
      >
        <SceneWireup rendererRef={rendererRef} />
        <CanvasBackground transparent={transparentBg} />
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[6, 8, 6]}
          intensity={2.4}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-6, -3, -4]} intensity={0.6} color="#8899ff" />
        <Suspense fallback={null}>
          <Environment preset="warehouse" />
          {font && <TireMesh font={font} params={params} onReady={captureGroup} />}
        </Suspense>
        <OrbitControls enablePan={false} minDistance={2} maxDistance={40} />
      </Canvas>

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4">
        <div className="pointer-events-auto">
          <p className="text-[10px] uppercase tracking-[0.35em] text-white/50">Superpower</p>
          <h1 className="text-lg font-bold tracking-wider">Tire Studio</h1>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button
            onClick={() => exportPNG(transparentBg)}
            className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-white/10"
          >
            PNG
          </button>
          <button
            onClick={() => exportGLB()}
            className="rounded-md border border-orange-400/50 bg-orange-500/20 px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-orange-500/30"
          >
            GLB
          </button>
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-white/10 sm:hidden"
          >
            {panelOpen ? "Hide" : "Edit"}
          </button>
        </div>
      </div>

      {/* Side panel */}
      <div
        className={`absolute bottom-0 right-0 top-16 z-10 flex w-full flex-col overflow-y-auto border-l border-white/10 bg-neutral-950/85 p-4 backdrop-blur-xl transition-transform sm:w-[340px] ${
          panelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-3">
          <label className="mb-1 block text-xs uppercase tracking-wider text-white/60">Text</label>
          <input
            type="text"
            value={params.text}
            onChange={(e) => set("text", e.target.value.toUpperCase())}
            className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm uppercase tracking-wider focus:border-orange-400 focus:outline-none"
            placeholder="SUPERPOWER"
          />
          <p className="mt-1 text-[10px] text-white/40">
            Auto-repeats around tire, wraps to new rows as it fills.
          </p>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs uppercase tracking-wider text-white/60">
            Font ({font?.name ?? "…"})
          </label>
          <input
            type="file"
            accept=".ttf,.otf,.woff"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFontFile(f);
            }}
            className="block w-full text-xs text-white/70 file:mr-2 file:rounded-md file:border file:border-white/15 file:bg-white/5 file:px-3 file:py-1.5 file:text-xs file:uppercase file:tracking-wider file:text-white hover:file:bg-white/10"
          />
          {fontError && <p className="mt-1 text-[10px] text-red-400">{fontError}</p>}
        </div>

        <Section title="Tire">
          <Slider label="Diameter" min={0.8} max={3.0} step={0.05} value={params.radius} onChange={(v) => set("radius", v)} />
          <Slider label="Width (length)" min={0.6} max={5.0} step={0.05} value={params.width} onChange={(v) => set("width", v)} />
          <Slider label="Inflate / fatness" min={0} max={1.5} step={0.05} value={params.inflate} onChange={(v) => set("inflate", v)} />
          <Slider label="Sidewall thickness" min={0.05} max={1.0} step={0.02} value={params.sidewallThickness} onChange={(v) => set("sidewallThickness", v)} />
        </Section>

        <Section title="Rim">
          <Slider label="Rim size" min={0.2} max={1.6} step={0.02} value={params.rimRadius} onChange={(v) => set("rimRadius", v)} />
          <Slider label="Rim depth" min={0} max={1} step={0.02} value={params.rimDepth} onChange={(v) => set("rimDepth", v)} />
        </Section>

        <Section title="Text tread">
          <Slider label="Letter height" min={0.1} max={1.2} step={0.02} value={params.fontSize} onChange={(v) => set("fontSize", v)} />
          <Slider label="Letter spacing" min={-30} max={80} step={1} value={params.letterSpacing} onChange={(v) => set("letterSpacing", v)} format={(v) => v.toFixed(0)} />
          <Slider label="Phrase gap" min={0} max={400} step={5} value={params.wordSpacing} onChange={(v) => set("wordSpacing", v)} format={(v) => v.toFixed(0)} />
          <Slider label="Line spacing" min={-0.1} max={0.6} step={0.01} value={params.lineSpacing} onChange={(v) => set("lineSpacing", v)} />
          <Slider label="Extrusion (raised)" min={0.02} max={0.5} step={0.01} value={params.extrusion} onChange={(v) => set("extrusion", v)} />
          <Slider label="Bevel" min={0} max={1} step={0.05} value={params.bevel} onChange={(v) => set("bevel", v)} />
          <Slider label="Rows (0 = auto)" min={0} max={12} step={1} value={params.rowCount} onChange={(v) => set("rowCount", v)} format={(v) => v.toFixed(0)} />
        </Section>

        <Section title="Export">
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input type="checkbox" checked={transparentBg} onChange={(e) => setTransparentBg(e.target.checked)} />
            Transparent background (PNG)
          </label>
          <div className="mt-3 flex flex-col gap-2">
            <button onClick={() => exportPNG(transparentBg)} className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs uppercase tracking-wider hover:bg-white/10">
              Download PNG
            </button>
            <button onClick={() => exportGLB()} className="rounded-md border border-orange-400/50 bg-orange-500/20 px-3 py-2 text-xs uppercase tracking-wider hover:bg-orange-500/30">
              Download GLB (3D)
            </button>
            <button onClick={() => setParams(DEFAULTS)} className="rounded-md border border-white/10 px-3 py-2 text-[11px] uppercase tracking-wider text-white/60 hover:bg-white/5">
              Reset
            </button>
          </div>
        </Section>

        <p className="mt-4 text-[10px] leading-relaxed text-white/40">
          Drag to orbit. Scroll to zoom. Add this app to your home screen to use it offline.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-orange-300/80">{title}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}
