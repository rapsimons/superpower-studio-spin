import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Text } from "troika-three-text";
import * as THREE from "three";
import gsap from "gsap";

// Tire dimensions
const RADIUS = 1.6;
const HEIGHT = 4.2;
const TEXT_RADIUS = RADIUS + 0.02;

type LightingColors = { top: string; bottom: string };

const LIGHT_PRESETS: { name: string; top: string; bottom: string }[] = [
  { name: "Studio White", top: "#ffffff", bottom: "#6699ff" },
  { name: "Sunset", top: "#ff7a3d", bottom: "#7a1bff" },
  { name: "Cyber", top: "#00ffd5", bottom: "#ff00aa" },
  { name: "Ember", top: "#ff3a1f", bottom: "#ffb347" },
  { name: "Ice", top: "#a8e0ff", bottom: "#1f6bff" },
  { name: "Toxic", top: "#c6ff3a", bottom: "#1fff8a" },
];

function TreadCylinder() {
  return (
    <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[RADIUS, RADIUS, HEIGHT, 128, 1, false]} />
      <meshStandardMaterial
        color="#2a2a2a"
        roughness={0.85}
        metalness={0.15}
      />
    </mesh>
  );
}

function TreadBumps() {
  // Subtle tread pattern: small dark blocks around cylinder ends
  const group = useRef<THREE.Group>(null);
  const items = useMemo(() => {
    const arr: { pos: [number, number, number]; rot: [number, number, number] }[] = [];
    const rings = 2;
    const perRing = 56;
    for (let r = 0; r < rings; r++) {
      const x = r === 0 ? -HEIGHT / 2 + 0.25 : HEIGHT / 2 - 0.25;
      for (let i = 0; i < perRing; i++) {
        const a = (i / perRing) * Math.PI * 2;
        const y = Math.sin(a) * (RADIUS + 0.01);
        const z = Math.cos(a) * (RADIUS + 0.01);
        arr.push({ pos: [x, y, z], rot: [0, -a, Math.PI / 2] });
      }
    }
    return arr;
  }, []);
  return (
    <group ref={group}>
      {items.map((it, i) => (
        <mesh key={i} position={it.pos} rotation={it.rot}>
          <boxGeometry args={[0.18, 0.16, 0.08]} />
          <meshStandardMaterial color="#1f1f1f" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function CurvedText({
  text,
  axialOffset,
  rotationRef,
  size = 0.95,
}: {
  text: string;
  axialOffset: number;
  rotationRef: React.MutableRefObject<number>;
  size?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const textRef = useRef<Text | null>(null);

  const troika = useMemo(() => {
    const t = new Text();
    t.text = text;
    t.fontSize = size;
    t.letterSpacing = 0.02;
    t.anchorX = "center";
    t.anchorY = "middle";
    t.curveRadius = -TEXT_RADIUS; // negative = wraps around outside of cylinder
    t.color = "#cfcfcf";
    t.material = new THREE.MeshStandardMaterial({
      color: "#c0c0c0",
      roughness: 0.35,
      metalness: 0.7,
      emissive: "#1a1a1a",
    });
    t.sync();
    textRef.current = t;
    return t;
  }, [text, size]);

  useEffect(() => {
    return () => {
      troika.dispose();
    };
  }, [troika]);

  useFrame(() => {
    if (groupRef.current) {
      // rotate around the cylinder's axial axis (world X, local Y after outer rotation)
      groupRef.current.rotation.y = rotationRef.current;
    }
  });

  return (
    // Outer wrapper aligns Troika's curve axis (Y) with the cylinder axis (world X)
    <group rotation={[0, 0, Math.PI / 2]}>
      <group ref={groupRef}>
        <primitive object={troika} position={[0, axialOffset, 0]} />
      </group>
    </group>
  );
}

function Tire({
  alignTrigger,
  lighting,
}: {
  alignTrigger: number;
  lighting: LightingColors;
}) {
  const superRot = useRef(0);
  const powerRot = useRef(Math.PI * 0.6);
  const studioRot = useRef(Math.PI * 1.2);

  const speeds = useRef({ s: 0.25, p: 0.15, st: 0.08 });
  const aligning = useRef(false);

  useFrame((_, dt) => {
    if (!aligning.current) {
      superRot.current += dt * speeds.current.s;
      powerRot.current += dt * speeds.current.p;
      studioRot.current += dt * speeds.current.st;
    }
  });

  useEffect(() => {
    if (alignTrigger === 0) return;
    aligning.current = true;
    const target = superRot.current; // align all to SUPER's rotation
    const tweenObj = {
      p: powerRot.current,
      st: studioRot.current,
      s: superRot.current,
    };
    gsap.to(tweenObj, {
      p: target,
      st: target,
      s: target,
      duration: 1.6,
      ease: "power3.inOut",
      onUpdate: () => {
        superRot.current = tweenObj.s;
        powerRot.current = tweenObj.p;
        studioRot.current = tweenObj.st;
      },
      onComplete: () => {
        // hold for a moment then resume
        gsap.delayedCall(1.4, () => {
          aligning.current = false;
        });
      },
    });
  }, [alignTrigger]);

  return (
    <group>
      <TreadCylinder />
      <TreadBumps />
      {/* Three text rings stacked along tire width */}
      <CurvedText text="SUPER" axialOffset={-1.1} rotationRef={superRot} size={0.95} />
      <CurvedText text="POWER" axialOffset={0} rotationRef={powerRot} size={0.95} />
      <CurvedText text="STUDIO" axialOffset={1.1} rotationRef={studioRot} size={0.95} />

      {/* Dynamic colored rim lights */}
      <pointLight position={[0, 6, 4]} intensity={40} color={lighting.top} distance={20} />
      <pointLight position={[0, -6, 4]} intensity={40} color={lighting.bottom} distance={20} />
    </group>
  );
}

function SceneFog() {
  const { scene } = useThree();
  useEffect(() => {
    scene.fog = new THREE.Fog("#000000", 18, 40);
    scene.background = new THREE.Color("#000000");
  }, [scene]);
  return null;
}

function TouchSpinHandler({
  onLongPress,
  onSwipe,
}: {
  onLongPress: () => void;
  onSwipe: (deltaX: number, deltaY: number) => void;
}) {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    let downTime = 0;
    let lpTimer: number | null = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let moved = false;

    const onDown = (e: PointerEvent) => {
      downTime = performance.now();
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      moved = false;
      lpTimer = window.setTimeout(() => {
        if (!moved) onLongPress();
      }, 550);
    };
    const onMove = (e: PointerEvent) => {
      if (downTime === 0) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(e.clientX - startX) > 6 || Math.abs(e.clientY - startY) > 6) {
        moved = true;
        if (lpTimer) {
          clearTimeout(lpTimer);
          lpTimer = null;
        }
      }
      lastX = e.clientX;
      lastY = e.clientY;
      if (moved) onSwipe(dx, dy);
    };
    const onUp = () => {
      downTime = 0;
      if (lpTimer) {
        clearTimeout(lpTimer);
        lpTimer = null;
      }
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onUp);
    };
  }, [gl, onLongPress, onSwipe]);
  return null;
}

function SpinnableTire({
  alignTrigger,
  lighting,
  spinRef,
}: {
  alignTrigger: number;
  lighting: LightingColors;
  spinRef: React.MutableRefObject<number>;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (group.current) group.current.rotation.x = spinRef.current;
  });
  return (
    <group ref={group}>
      <Tire alignTrigger={alignTrigger} lighting={lighting} />
    </group>
  );
}

export default function TireHero() {
  const [alignTrigger, setAlignTrigger] = useState(0);
  const [lighting, setLighting] = useState<LightingColors>(LIGHT_PRESETS[0]);
  const [open, setOpen] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const spinRef = useRef(0);

  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-black">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0.4, 9], fov: 42 }}
        onCreated={({ camera, size }) => {
          const p = camera as THREE.PerspectiveCamera;
          const aspect = size.width / size.height;
          const targetWidth = 4.8;
          const distForWidth =
            targetWidth / 2 / Math.tan((p.fov * Math.PI) / 360) / Math.min(aspect, 1);
          p.position.z = Math.min(Math.max(7, distForWidth), 14);
          p.updateProjectionMatrix();
        }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <SceneFog />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 8, 6]} intensity={2.2} color="#ffffff" />
        <directionalLight position={[-6, -4, -2]} intensity={0.8} color="#88aaff" />

        <Suspense fallback={null}>
          <SpinnableTire
            alignTrigger={alignTrigger}
            lighting={lighting}
            spinRef={spinRef}
          />
        </Suspense>

        {!isTouch && (
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            minPolarAngle={Math.PI / 2.6}
            maxPolarAngle={Math.PI / 1.7}
            rotateSpeed={0.6}
          />
        )}

        <TouchSpinHandler
          onLongPress={() => setAlignTrigger((n) => n + 1)}
          onSwipe={(dx, dy) => {
            spinRef.current += (dx + dy) * 0.005;
          }}
        />
      </Canvas>

      {/* Overlay UI */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-6">
        <div className="pointer-events-auto">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">Superpower</p>
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Studio</p>
        </div>
        <div className="pointer-events-auto relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs uppercase tracking-widest text-white/80 backdrop-blur transition hover:bg-white/10"
          >
            Lighting
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/10 bg-black/80 p-2 backdrop-blur-xl">
              {LIGHT_PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => {
                    setLighting(p);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/10"
                >
                  <span className="flex h-5 w-10 overflow-hidden rounded-full border border-white/10">
                    <span className="h-full w-1/2" style={{ background: p.top }} />
                    <span className="h-full w-1/2" style={{ background: p.bottom }} />
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-1 p-6 text-center">
        <p className="text-[10px] uppercase tracking-[0.4em] text-white/40">
          {isTouch ? "Swipe to spin · Press & hold to align" : "Drag to orbit · Click & hold to align"}
        </p>
      </div>
    </div>
  );
}
