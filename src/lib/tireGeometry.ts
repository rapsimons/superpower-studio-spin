import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LoadedFont } from "./tireFont";
import { getGlyphInfo } from "./tireFont";

export type TireParams = {
  text: string;
  // Tire
  radius: number; // outer radius (rubber)
  width: number; // axial width of tire
  sidewallThickness: number; // rubber shell thickness (radial)
  inflate: number; // 0..1 fatness bulge factor
  // Rim
  rimRadius: number; // inner rim radius
  rimDepth: number; // 0..1 how deep the rim sits inside the tire width
  // Text
  fontSize: number; // world units letter cap height
  letterSpacing: number; // extra space between letters (world units)
  wordSpacing: number; // extra between phrase repeats
  lineSpacing: number; // extra between rows (world units)
  extrusion: number; // raised height above tire surface
  bevel: number; // 0..1
  // Layout
  rowCount: number; // number of text rows across width (0 = auto)
  // Direction the text baseline runs on the tread:
  //  - "horizontal": letters run around the circumference (wraps around)
  //  - "vertical":   letters run across the tire width (left-to-right on face)
  textDirection: "horizontal" | "vertical";
};

export type BuiltTire = {
  group: THREE.Group;
  dispose: () => void;
};

// Build a flat extruded text row centered at y=0, laid out along +X, extruding in +Z.
// Returns the geometry and its unwrapped width.
function buildPhraseFlat(
  font: LoadedFont,
  text: string,
  targetHeight: number,
  letterSpacing: number,
  extrusion: number,
  bevel: number,
): { geom: THREE.BufferGeometry; width: number } | null {
  if (!text) return null;
  const scale = targetHeight / font.unitsPerEm;
  const geoms: THREE.BufferGeometry[] = [];
  let cursor = 0;
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: extrusion,
    bevelEnabled: bevel > 0.001,
    bevelThickness: extrusion * 0.15 * bevel,
    bevelSize: extrusion * 0.12 * bevel,
    bevelSegments: 2,
    curveSegments: 6,
  };
  for (const ch of Array.from(text)) {
    if (ch === " ") {
      cursor += font.unitsPerEm * 0.35 * scale + letterSpacing;
      continue;
    }
    const info = getGlyphInfo(font.font, ch);
    if (info.shapes.length) {
      const g = new THREE.ExtrudeGeometry(info.shapes, extrudeSettings);
      g.scale(scale, scale, 1);
      g.translate(cursor, 0, 0);
      geoms.push(g);
    }
    cursor += info.advanceWidth * scale + letterSpacing;
  }
  if (!geoms.length) return null;
  const merged = BufferGeometryUtils.mergeGeometries(geoms, false);
  for (const g of geoms) g.dispose();
  if (!merged) return null;
  return { geom: merged, width: cursor };
}

// Bend a flat geometry (extending along X, extruded along +Z) around the tire
// (Y axis of the tire = X axis of world after group rotation).
// x -> theta around cylinder, y -> axial, z (extrude) -> outward radial.
function bendAroundCylinder(
  geom: THREE.BufferGeometry,
  radius: number,
  circumference: number,
  angleOffset: number,
  halfWidth: number,
  inflate: number,
) {
  const radialLift = 0.035;
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i];
    const y = arr[i + 1];
    const z = arr[i + 2];
    // Use a decreasing angular direction so the outside-facing tread text
    // reads normally instead of mirrored/back-to-front.
    const theta = angleOffset - (x / circumference) * Math.PI * 2;
    const bulge =
      1 + inflate * 0.18 * Math.cos((y / Math.max(halfWidth, 0.001)) * (Math.PI / 2));
    // Lift the whole glyph above the carcass so the cap faces never z-fight
    // with the tire surface.
    const r = radius * bulge + z + radialLift;
    arr[i] = Math.cos(theta) * r;
    arr[i + 1] = y;
    arr[i + 2] = Math.sin(theta) * r;
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
}

// Place flat text axially: local X → axial (across tire width),
// local Y → tangential (letter up direction on surface),
// local Z (extrusion) → radial outward. Anchored at angle thetaC.
function placeAxial(
  geom: THREE.BufferGeometry,
  radius: number,
  thetaC: number,
  halfWidth: number,
  inflate: number,
) {
  const radialLift = 0.035;
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const lx = arr[i];
    const ly = arr[i + 1];
    const lz = arr[i + 2];
    // Mirror the axial mapping so text across the tire face reads correctly
    // from the outside of the tire.
    const y = -lx; // axial
    const bulge =
      1 + inflate * 0.18 * Math.cos((y / Math.max(halfWidth, 0.001)) * (Math.PI / 2));
    const r = radius * bulge + lz + radialLift;
    const theta = thetaC + ly / (radius * bulge);
    arr[i] = Math.cos(theta) * r;
    arr[i + 1] = y;
    arr[i + 2] = Math.sin(theta) * r;
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
}

// Build small tread-block ring at a given axial y.
function buildTreadRing(
  radius: number,
  y: number,
  count: number,
  blockW: number,
  blockH: number,
  blockD: number,
): THREE.BufferGeometry {
  const geoms: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const g = new THREE.BoxGeometry(blockW, blockH, blockD);
    g.translate(0, 0, radius + blockD / 2);
    const m = new THREE.Matrix4().makeRotationY(a);
    g.applyMatrix4(m);
    g.translate(0, y, 0);
    geoms.push(g);
  }
  const merged = BufferGeometryUtils.mergeGeometries(geoms, false);
  for (const g of geoms) g.dispose();
  return merged ?? new THREE.BufferGeometry();
}

export function buildTire(font: LoadedFont, p: TireParams): BuiltTire {
  const group = new THREE.Group();
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.85,
    metalness: 0.05,
  });
  const textMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.82,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xdcdce2,
    roughness: 0.15,
    metalness: 1.0,
    envMapIntensity: 1.6,
  });
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x9a9aa0,
    roughness: 0.22,
    metalness: 1.0,
    envMapIntensity: 1.4,
  });
  disposables.push(rubberMat, textMat, rimMat, hubMat);



  // Rubber carcass — a tube (outer cylinder + inner cylinder + end caps).
  // We approximate with a lathe geometry: cross-section (radial vs axial).
  const halfW = p.width / 2;
  const innerR = Math.max(p.rimRadius, 0.1);
  const outerR = p.radius;
  const bulge = 1 + p.inflate * 0.18;
  const points: THREE.Vector2[] = [];
  // inner sidewall bottom -> outer bottom -> outer top -> inner top
  const segs = 24;
  // Bottom sidewall (from inner to outer along -halfW face, slight rounding)
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const r = innerR + (outerR - innerR) * t;
    const y = -halfW - 0.02 * Math.sin(t * Math.PI);
    points.push(new THREE.Vector2(r, y));
  }
  // Outer tread from -halfW to +halfW along outer radius (with bulge)
  const treadSegs = 24;
  for (let i = 1; i <= treadSegs; i++) {
    const t = i / treadSegs;
    const y = -halfW + p.width * t;
    const rr = outerR * (1 + p.inflate * 0.18 * Math.cos((y / halfW) * (Math.PI / 2)));
    points.push(new THREE.Vector2(rr, y));
  }
  // Top sidewall outer -> inner
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const r = outerR - (outerR - innerR) * t;
    const y = halfW + 0.02 * Math.sin(t * Math.PI);
    points.push(new THREE.Vector2(r, y));
  }
  // Inner face top -> bottom (close)
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const y = halfW - p.width * t;
    points.push(new THREE.Vector2(innerR, y));
  }
  const lathe = new THREE.LatheGeometry(points, 96);
  disposables.push(lathe);
  const rubberMesh = new THREE.Mesh(lathe, rubberMat);
  rubberMesh.castShadow = true;
  rubberMesh.receiveShadow = true;
  // Lathe rotates around Y axis; we want tire axis = X, so rotate the whole tire group
  group.add(rubberMesh);

  // (side tread blocks intentionally omitted — full clean rubber face for text)

  // Text rows — full tread width available.
  // Use cap-height (~0.7 * fontSize) as the effective row height so
  // lineSpacing == 0 means glyphs almost touch. Negative lineSpacing
  // allows deliberate overlap.
  const textStripHalf = halfW - 0.05;
  const rowSize = p.fontSize;
  const capHeight = rowSize * 0.7;
  const lineStep = Math.max(0.01, capHeight + p.lineSpacing);
  const rowCount =
    p.rowCount > 0
      ? p.rowCount
      : Math.max(1, Math.floor((textStripHalf * 2) / lineStep));

  // Build one phrase geometry & clone for each row (also repeat around circumference)
  // Use the un-bulged outerR as the base radius so bendAroundCylinder's own bulge
  // factor doesn't get applied twice (which pushed text far outside the tire).
  const equatorR = outerR;
  const circumference = 2 * Math.PI * equatorR * bulge;
  const phrase = p.text || "SUPERPOWER";

  // We tile the phrase around the circumference. Compute how many copies fit and
  // stretch the joining space so they meet exactly.
  const built = buildPhraseFlat(
    font,
    phrase,
    rowSize,
    p.letterSpacing,
    p.extrusion,
    p.bevel,
  );
  if (built) {
    if (p.textDirection === "vertical") {
      // Letters run across the tire width (left-to-right on face).
      // Distribute phrase copies angularly around the tire; each copy is
      // centered axially and stands upright on the tread.
      const tangentialStep = Math.max(rowSize + p.wordSpacing, rowSize * 0.7, 0.05);
      const copies = Math.max(3, Math.ceil(circumference / tangentialStep));
      for (let c = 0; c < copies; c++) {
        const thetaC = ((c * tangentialStep) / circumference) * Math.PI * 2;
        const clone = built.geom.clone();
        // Center phrase: X (which becomes axial) around 0, Y (baseline) around 0
        clone.translate(-built.width / 2, -rowSize * 0.5, 0);
        placeAxial(clone, equatorR, thetaC, halfW, p.inflate);
        disposables.push(clone);
        const mesh = new THREE.Mesh(clone, textMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    } else {
      const repeatStep = built.width + p.wordSpacing;
      const copies = Math.max(1, Math.ceil(circumference / repeatStep));

      const rowsMid = (rowCount - 1) / 2;
      for (let row = 0; row < rowCount; row++) {
        const yCenter = (row - rowsMid) * lineStep;
        const rowAngleOffset =
          (row % 2) * ((repeatStep * 0.5) / circumference) * Math.PI * 2;
        for (let c = 0; c < copies; c++) {
          const clone = built.geom.clone();
          clone.translate(c * repeatStep, yCenter - rowSize * 0.5, 0);
          bendAroundCylinder(clone, equatorR, circumference, rowAngleOffset, halfW, p.inflate);
          disposables.push(clone);
          const mesh = new THREE.Mesh(clone, textMat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
        }
      }
    }
    built.geom.dispose();
  }

  // Rim (chrome disc + inner cylinder)
  const rimOuter = innerR + 0.02;
  const rimInner = rimOuter * 0.55;
  const rimWidth = p.width * (0.55 + 0.35 * (1 - p.rimDepth));
  // Rim barrel
  const rimBarrel = new THREE.CylinderGeometry(rimOuter, rimOuter, rimWidth, 64, 1, true);
  disposables.push(rimBarrel);
  const rimBarrelMesh = new THREE.Mesh(rimBarrel, rimMat);
  group.add(rimBarrelMesh);
  // Rim face (two) — symmetric on both sides
  for (const side of [-1, 1]) {
    const disc = new THREE.RingGeometry(rimInner, rimOuter, 64);
    disposables.push(disc);
    const faceMat = rimMat.clone();
    faceMat.side = THREE.DoubleSide;
    disposables.push(faceMat);
    const m = new THREE.Mesh(disc, faceMat);
    // Flip so each face's front-normal points outward (away from wheel center)
    m.rotation.x = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    m.position.y = (side * rimWidth) / 2;
    group.add(m);
  }
  // Hub — spans full rim width so it looks identical from both sides
  const hub = new THREE.CylinderGeometry(rimInner, rimInner, rimWidth, 32);
  disposables.push(hub);
  const hubMesh = new THREE.Mesh(hub, hubMat);
  group.add(hubMesh);
  // Center cap on each side
  for (const side of [-1, 1]) {
    const cap = new THREE.SphereGeometry(rimInner * 0.4, 24, 16);
    disposables.push(cap);
    const capMesh = new THREE.Mesh(cap, rimMat);
    capMesh.position.y = (side * rimWidth) / 2;
    group.add(capMesh);
  }

  // Lug nuts around hub
  const lugCount = 6;
  for (let i = 0; i < lugCount; i++) {
    const a = (i / lugCount) * Math.PI * 2;
    const r = rimInner * 0.7;
    for (const side of [-1, 1]) {
      const lug = new THREE.SphereGeometry(rimInner * 0.08, 12, 10);
      disposables.push(lug);
      const m = new THREE.Mesh(lug, rimMat);
      m.position.set(Math.cos(a) * r, (side * rimWidth) / 2, Math.sin(a) * r);
      group.add(m);
    }
  }

  // Whole tire's axis is Y after lathe; rotate so axis is X (horizontal tire).
  group.rotation.z = Math.PI / 2;

  return {
    group,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
