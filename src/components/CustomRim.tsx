import { useGLTF } from "@react-three/drei";
import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import gt2Asset from "@/assets/rims/gt2.glb.asset.json";
import sportAsset from "@/assets/rims/sport.glb.asset.json";
import janteAsset from "@/assets/rims/jante.glb.asset.json";
import classicAsset from "@/assets/rims/classic.glb.asset.json";
import offroadAsset from "@/assets/rims/offroad.glb.asset.json";

export const RIM_LIBRARY: Array<{
  id: string;
  label: string;
  url: string;
  // multiplier so the visible rim reads as a real wheel diameter
  fitScale?: number;
}> = [
  { id: "gt2", label: "Porsche GT2", url: gt2Asset.url, fitScale: 1.0 },
  { id: "sport", label: "Sport Custom", url: sportAsset.url, fitScale: 1.0 },
  { id: "jante", label: "Jante Deep", url: janteAsset.url, fitScale: 1.0 },
  { id: "classic", label: "Classic 5-spoke", url: classicAsset.url, fitScale: 1.0 },
  { id: "offroad", label: "Offroad Beadlock", url: offroadAsset.url, fitScale: 1.0 },
];

export function findRim(id: string) {
  return RIM_LIBRARY.find((r) => r.id === id);
}

// Preload
for (const r of RIM_LIBRARY) {
  useGLTF.preload(r.url, undefined, undefined, (loader) => {
    (loader as GLTFLoader).setMeshoptDecoder(MeshoptDecoder);
  });
}

type Props = {
  url: string;
  fitScale?: number;
  targetDiameter: number; // outer rim diameter to fit
  targetWidth: number; // axial width to fit within
  metalColor: string;
  metalness?: number;
  roughness?: number;
};

export function CustomRim({
  url,
  fitScale = 1.0,
  targetDiameter,
  targetWidth,
  metalColor,
  metalness = 1.0,
  roughness = 0.2,
}: Props) {
  const gltf = useGLTF(
    url,
    undefined,
    undefined,
    (loader) => {
      (loader as GLTFLoader).setMeshoptDecoder(MeshoptDecoder);
    },
  );

  const object = useMemo(() => {
    const root = gltf.scene.clone(true);

    // Measure bbox before any transform
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Center at origin
    root.position.sub(center);

    // Wrapper that we'll orient + scale
    const wrapper = new THREE.Group();
    wrapper.add(root);

    // Detect axial axis = smallest dimension (wheels are disc-shaped)
    const dims: Array<{ axis: "x" | "y" | "z"; size: number }> = [
      { axis: "x", size: size.x },
      { axis: "y", size: size.y },
      { axis: "z", size: size.z },
    ];
    dims.sort((a, b) => a.size - b.size);
    const axial = dims[0];
    const radialMax = Math.max(dims[1].size, dims[2].size);

    // Rotate so axial axis aligns with local Y (which becomes world X after tire group's Z rotation).
    if (axial.axis === "x") wrapper.rotation.z = Math.PI / 2;
    else if (axial.axis === "z") wrapper.rotation.x = Math.PI / 2;
    // if axial === "y" no rotation needed

    // Uniform scale: fit radial to targetDiameter, cap by targetWidth
    const scaleRadial = targetDiameter / Math.max(radialMax, 0.001);
    const scaleAxial = targetWidth / Math.max(axial.size, 0.001);
    const scale = Math.min(scaleRadial, scaleAxial) * fitScale;

    const outer = new THREE.Group();
    outer.add(wrapper);
    outer.scale.setScalar(scale);
    // Match tire group orientation (tire group has rotation.z = PI/2)
    outer.rotation.z = Math.PI / 2;

    // Metallic override so every model looks like a real rim, not textured
    const metalMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(metalColor),
      metalness,
      roughness,
      envMapIntensity: 1.6,
      side: THREE.DoubleSide,
    });
    outer.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
        mesh.material = metalMat;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    return outer;
  }, [gltf, targetDiameter, targetWidth, fitScale, metalColor, metalness, roughness]);

  useEffect(() => {
    return () => {
      object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
          const m = mesh.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else m.dispose();
        }
      });
    };
  }, [object]);

  return <primitive object={object} />;
}
