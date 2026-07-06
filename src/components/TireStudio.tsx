import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { ChevronDown } from "lucide-react";
import { loadDefaultFont, loadFontFromArrayBuffer, type LoadedFont } from "@/lib/tireFont";
import { buildTire, type TireParams } from "@/lib/tireGeometry";

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
  extrusion: 0.16,
  bevel: 0.4,
  rowCount: 0,
  textDirection: "vertical",
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

function CanvasBackground({ transparent }: { transparent: boolean }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = transparent ? null : new THREE.Color("#050505");
  }, [scene, transparent]);
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
    scene.background = transparent ? null : new THREE.Color("#050505");
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
        className="w-full accent-yellow-400"
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
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    text: true,
    tire: true,
    rim: false,
    tread: true,
    export: false,
  });
  const toggle = (k: string) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));

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

  const camDist = useMemo(
    () => params.radius * 3.6 + params.width * 0.6,
    [params.radius, params.width],
  );

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-neutral-950 text-neutral-300">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}
        camera={{ position: [camDist * 0.7, camDist * 0.3, camDist], fov: 32 }}
      >
        <SceneWireup rendererRef={rendererRef} />
        <CanvasBackground transparent={transparentBg} />
        <ambientLight intensity={0.4} />
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
        <div className="pointer-events-auto rounded-2xl border border-white/5 bg-black/20 px-3 py-2 backdrop-blur-xl">
          <p className="text-[9px] uppercase tracking-[0.35em] text-yellow-300/70">Superpower</p>
          <h1 className="text-base font-bold tracking-wider text-neutral-200">Tire Studio</h1>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button
            onClick={() => exportPNG(transparentBg)}
            className="rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-wider text-neutral-300 backdrop-blur-xl hover:bg-white/10"
          >
            PNG
          </button>
          <button
            onClick={() => exportGLB()}
            className="rounded-xl border border-yellow-400/60 bg-yellow-400/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-yellow-100 backdrop-blur-xl hover:bg-yellow-400/30"
          >
            GLB
          </button>
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-wider text-neutral-300 backdrop-blur-xl hover:bg-white/10 sm:hidden"
          >
            {panelOpen ? "Hide" : "Edit"}
          </button>
        </div>
      </div>

      {/* Side panel — dark liquid glass, ~80% transparent */}
      <div
        className={`absolute bottom-3 right-3 top-20 z-10 flex w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-3xl border border-white/5 bg-black/20 backdrop-blur-2xl backdrop-saturate-150 transition-transform sm:w-[340px] ${
          panelOpen ? "translate-x-0" : "translate-x-[110%]"
        }`}
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
        <div className="relative flex-1 overflow-y-auto p-4">
          <CollapsibleSection
            title="Text"
            open={openSections.text}
            onToggle={() => toggle("text")}
          >
            <input
              type="text"
              value={params.text}
              onChange={(e) => set("text", e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm uppercase tracking-wider text-neutral-200 placeholder:text-neutral-500 focus:border-yellow-400/60 focus:outline-none focus:ring-1 focus:ring-yellow-400/40"
              placeholder="SUPERPOWER"
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
            title="Tire"
            open={openSections.tire}
            onToggle={() => toggle("tire")}
          >
            <Slider label="Diameter" min={0.8} max={3.0} step={0.05} value={params.radius} onChange={(v) => set("radius", v)} />
            <Slider label="Width (length)" min={0.6} max={5.0} step={0.05} value={params.width} onChange={(v) => set("width", v)} />
            <Slider label="Inflate / fatness" min={0} max={1.5} step={0.05} value={params.inflate} onChange={(v) => set("inflate", v)} />
            <Slider label="Sidewall thickness" min={0.05} max={1.0} step={0.02} value={params.sidewallThickness} onChange={(v) => set("sidewallThickness", v)} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Rim"
            open={openSections.rim}
            onToggle={() => toggle("rim")}
          >
            <Slider label="Rim size" min={0.2} max={1.6} step={0.02} value={params.rimRadius} onChange={(v) => set("rimRadius", v)} />
            <Slider label="Rim depth" min={0} max={1} step={0.02} value={params.rimDepth} onChange={(v) => set("rimDepth", v)} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Text tread"
            open={openSections.tread}
            onToggle={() => toggle("tread")}
          >
            <Slider label="Letter height" min={0.1} max={1.6} step={0.02} value={params.fontSize} onChange={(v) => set("fontSize", v)} />
            <Slider label="Letter spacing" min={-0.05} max={0.3} step={0.005} value={params.letterSpacing} onChange={(v) => set("letterSpacing", v)} />
            <Slider label="Phrase gap" min={-0.5} max={2} step={0.01} value={params.wordSpacing} onChange={(v) => set("wordSpacing", v)} />
            <Slider label="Line spacing" min={-0.4} max={0.6} step={0.005} value={params.lineSpacing} onChange={(v) => set("lineSpacing", v)} />
            <Slider label="Extrusion (raised)" min={0.02} max={0.5} step={0.01} value={params.extrusion} onChange={(v) => set("extrusion", v)} />
            <Slider label="Bevel" min={0} max={1} step={0.05} value={params.bevel} onChange={(v) => set("bevel", v)} />
            <Slider label="Rows (0 = auto)" min={0} max={12} step={1} value={params.rowCount} onChange={(v) => set("rowCount", v)} format={(v) => v.toFixed(0)} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Export"
            open={openSections.export}
            onToggle={() => toggle("export")}
          >
            <label className="flex items-center gap-2 text-[11px] text-neutral-300">
              <input
                type="checkbox"
                checked={transparentBg}
                onChange={(e) => setTransparentBg(e.target.checked)}
                className="accent-yellow-400"
              />
              Transparent background (PNG)
            </label>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => exportPNG(transparentBg)}
                className="rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-wider text-neutral-300 hover:bg-white/10"
              >
                Download PNG
              </button>
              <button
                onClick={() => exportGLB()}
                className="rounded-lg border border-yellow-400/60 bg-yellow-400/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-yellow-100 hover:bg-yellow-400/30"
              >
                Download GLB (3D)
              </button>
              <button
                onClick={() => setParams(DEFAULTS)}
                className="rounded-lg border border-white/5 px-3 py-2 text-[11px] uppercase tracking-wider text-neutral-500 hover:bg-white/5"
              >
                Reset
              </button>
            </div>
          </CollapsibleSection>

          <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">
            Drag to orbit. Scroll to zoom. Add this app to your home screen to use it offline.
          </p>
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-yellow-300">
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-yellow-300/70 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-3 px-3 pb-3 pt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
