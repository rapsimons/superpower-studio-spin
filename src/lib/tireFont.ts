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
  const shapePath = new THREE.ShapePath();

  for (const c of path.commands) {
    if (c.type === "M") shapePath.moveTo(c.x, c.y);
    else if (c.type === "L") shapePath.lineTo(c.x, c.y);
    else if (c.type === "Q") shapePath.quadraticCurveTo(c.x1, c.y1, c.x, c.y);
    else if (c.type === "C") {
      shapePath.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
    }
  }

  return shapePath.toShapes(false);
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
