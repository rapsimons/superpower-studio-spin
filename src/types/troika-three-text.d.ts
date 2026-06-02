declare module "troika-three-text" {
  import * as THREE from "three";
  export class Text extends THREE.Mesh {
    text: string;
    fontSize: number;
    letterSpacing: number;
    anchorX: string | number;
    anchorY: string | number;
    curveRadius: number;
    color: string | number | THREE.Color;
    material: THREE.Material | THREE.Material[];
    font?: string;
    maxWidth?: number;
    textAlign?: string;
    sync(callback?: () => void): void;
    dispose(): void;
  }
}
