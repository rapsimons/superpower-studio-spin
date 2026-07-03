import * as opentype from "opentype.js";
import * as THREE from "three";
import defaultFontPointer from "@/assets/sgt-jhon-o.ttf.asset.json";

export type LoadedFont = {
  font: opentype.Font;
  name: string;
  unitsPerEm: number;
};

const cache = new Map<string, LoadedFont>();

export async function loadFontFromUrl(url: string, name: string): Promise<LoadedFont> {
  const key = `url:${url}`;
  if (cache.has(key)) return cache.get(key)!;
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const font = opentype.parse(buf);
  const loaded: LoadedFont = { font, name, unitsPerEm: font.unitsPerEm };
  cache.set(key, loaded);
  return loaded;
}

export async function loadFontFromArrayBuffer(
  buf: ArrayBuffer,
  name: string,
): Promise<LoadedFont> {
  const font = opentype.parse(buf);
  const loaded: LoadedFont = { font, name, unitsPerEm: font.unitsPerEm };
  cache.set(`mem:${name}:${buf.byteLength}`, loaded);
  return loaded;
}

export function loadDefaultFont(): Promise<LoadedFont> {
  return loadFontFromUrl(defaultFontPointer.url, "SGT Jhon-O");
}

// Convert an opentype Path to an array of THREE.Shape
export function pathToShapes(path: opentype.Path): THREE.Shape[] {
  const shapes: THREE.Shape[] = [];
  let currentShape: THREE.Shape | null = null;
  let currentHole: THREE.Path | null = null;
  let subpathPoints: THREE.Vector2[] = [];
  const subpaths: { points: THREE.Vector2[]; commands: opentype.PathCommand[] }[] = [];
  let cmds: opentype.PathCommand[] = [];

  const flushSubpath = () => {
    if (cmds.length) subpaths.push({ points: subpathPoints, commands: cmds });
    cmds = [];
    subpathPoints = [];
  };

  let cx = 0,
    cy = 0;
  for (const c of path.commands) {
    if (c.type === "M") {
      flushSubpath();
      cx = c.x;
      cy = -c.y;
    } else if (c.type === "L") {
      cx = c.x;
      cy = -c.y;
    } else if (c.type === "Q") {
      cx = c.x;
      cy = -c.y;
    } else if (c.type === "C") {
      cx = c.x;
      cy = -c.y;
    } else if (c.type === "Z") {
      // close
    }
    subpathPoints.push(new THREE.Vector2(cx, cy));
    cmds.push(c);
  }
  flushSubpath();

  // Determine orientation (outer vs hole) via signed area
  const areaOf = (pts: THREE.Vector2[]) => {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      a += p1.x * p2.y - p2.x * p1.y;
    }
    return a / 2;
  };

  const buildPath = (commands: opentype.PathCommand[]): THREE.Path => {
    const p = new THREE.Path();
    for (const c of commands) {
      if (c.type === "M") p.moveTo(c.x, -c.y);
      else if (c.type === "L") p.lineTo(c.x, -c.y);
      else if (c.type === "Q") p.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
      else if (c.type === "C")
        p.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
      else if (c.type === "Z") { /* auto close */ }
    }
    return p;
  };

  // TrueType outer contours are clockwise (Y-up). After flipping Y they become
  // counter-clockwise → positive signed area in our coords.
  const outerSign = 1;
  for (const sp of subpaths) {
    const area = areaOf(sp.points);
    const isOuter = area * outerSign > 0 || !currentShape;
    if (isOuter) {
      currentShape = new THREE.Shape();
      const built = buildPath(sp.commands);
      currentShape.curves = built.curves;
      currentShape.autoClose = true;
      shapes.push(currentShape);
    } else if (currentShape) {
      currentHole = buildPath(sp.commands);
      currentShape.holes.push(currentHole);
    }
  }
  return shapes;
}

export type GlyphInfo = {
  shapes: THREE.Shape[];
  advanceWidth: number; // font units
};

const glyphCache = new WeakMap<opentype.Font, Map<string, GlyphInfo>>();

export function getGlyphInfo(font: opentype.Font, ch: string): GlyphInfo {
  let m = glyphCache.get(font);
  if (!m) {
    m = new Map();
    glyphCache.set(font, m);
  }
  if (m.has(ch)) return m.get(ch)!;
  const glyph = font.charToGlyph(ch);
  const path = glyph.getPath(0, 0, font.unitsPerEm);
  const shapes = pathToShapes(path);
  const advanceWidth = (glyph.advanceWidth ?? font.unitsPerEm) as number;
  const info: GlyphInfo = { shapes, advanceWidth };
  m.set(ch, info);
  return info;
}
