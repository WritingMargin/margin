import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { SceneSpec } from "./schema";
import {
  loadSceneModel,
  eachMaterial,
  disposeSceneObject,
} from "./scene-model";
import { sceneAnimation, animatedObjectBounds } from "./scene-keyframes";
import { SceneClips } from "./scene-clips";
import { pulseScale } from "./scene-motion";

export function useScene({ spec }: { spec: SceneSpec }) {
  const host = useRef<HTMLDivElement>(null);
  const actions = useRef<{
    pulse: (value: boolean) => void;
    playClip: (value: boolean) => void;
    selectClip: (id: string) => void;
    reset: () => void;
    rotate: (v: boolean) => void;
    wireframe: (v: boolean) => void;
    select: (i: number) => void;
  } | null>(null);
  const [error, setError] = useState("");
  const [modelError, setModelError] = useState("");
  const [clips, setClips] = useState<{ id: string; label: string }[]>([]);
  const [clipId, setClipId] = useState("");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(0);
  const [pulsing, setPulsing] = useState(false);
  const [pulsePhase, setPulsePhase] = useState("Relaxing");
  const [motionReduced, setMotionReduced] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setError(
        "3D rendering is unavailable in this browser. The scene description and object list are still available below.",
      );
      return;
    }
    setError("");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(spec.background);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute(
      "aria-label",
      `${spec.title}. Drag to orbit, scroll to zoom, or focus and use arrow keys to orbit. Plus and minus zoom.`,
    );
    renderer.domElement.tabIndex = 0;
    element.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minDistance = 1;
    controls.maxDistance = 300;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    controls.autoRotate = spec.autoRotate && !reducedMotion.matches;
    setRotating(controls.autoRotate);
    setMotionReduced(reducedMotion.matches);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x586754, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(5, 8, 5);
    scene.add(light);
    const abort = new AbortController();
    setModelError("");
    let pulseEnabled =
      spec.objects.some((object) => !!object.pulse) && !reducedMotion.matches;
    setPulsing(pulseEnabled);
    let wireframeEnabled = false;
    const meshes = spec.objects.map((object) => {
      const geometry =
        object.shape === "model"
          ? undefined
          : object.shape === "sphere"
            ? new THREE.SphereGeometry(0.7, 32, 24)
            : object.shape === "torus"
              ? new THREE.TorusGeometry(0.65, 0.24, 20, 48)
              : object.shape === "cone"
                ? new THREE.ConeGeometry(0.7, 1.5, 32)
                : object.shape === "cylinder"
                  ? new THREE.CylinderGeometry(0.6, 0.6, 1.4, 32)
                  : new THREE.BoxGeometry(1.2, 1.2, 1.2);
      const mesh =
        object.shape === "model"
          ? new THREE.Group()
          : new THREE.Mesh(
              geometry,
              new THREE.MeshStandardMaterial({
                color: object.color,
                roughness: 0.45,
                metalness: 0.1,
              }),
            );
      mesh.position.fromArray(object.position);
      mesh.rotation.set(...object.rotation);
      mesh.scale.setScalar(object.scale);
      scene.add(mesh);
      return mesh;
    });

    const render = () => renderer.render(scene, camera);
    const fit = () => {
      const bounds = new THREE.Box3();
      meshes.forEach((mesh, index) => bounds.union(animatedObjectBounds(mesh, spec.objects[index])));
      const center = bounds.isEmpty()
        ? new THREE.Vector3()
        : bounds.getCenter(new THREE.Vector3());
      const radius = Math.max(
        bounds.getSize(new THREE.Vector3()).length() / 2,
        1,
      );
      const halfFov = Math.atan(
        Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
          Math.min(camera.aspect, 1),
      );
      const distance = (radius / Math.sin(halfFov)) * 1.15;
      controls.maxDistance = Math.max(300, distance * 2);
      camera.far = Math.max(1000, distance * 4);
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      camera.position
        .copy(center)
        .add(
          new THREE.Vector3(1, 0.65, 1.6).normalize().multiplyScalar(distance),
        );
      controls.update();
      render();
    };
    const playback = new SceneClips();
    let chosenClip = "";
    setClips([]);
    setPlaying(false);
    const selectClip = (id: string) => {
      chosenClip = id;
      playback.select(id);
      setClipId(id);
      setPlaying(false);
      render();
    };
    const animation = sceneAnimation(spec.objects, meshes);
    if (animation) {
      const options = playback.add(-1, scene, [animation], spec.title);
      setClips(options);
      selectClip(options[0].id);
    }
    setLoading(
      spec.objects.filter((object) => object.shape === "model").length,
    );
    spec.objects.forEach((object, index) => {
      if (object.shape !== "model") return;
      loadSceneModel(object.src!, abort.signal, object.animationSrc)
        .then((model) => {
          if (abort.signal.aborted) {
            disposeSceneObject(model.group);
            return;
          }
          if (model.animationError)
            setModelError(`${object.label}: ${model.animationError}`);
          eachMaterial(model.group, (material) => {
            material.wireframe = wireframeEnabled;
          });
          meshes[index].add(model.group);
          if (model.animations.length) {
            const options = playback.add(
              index,
              model.scene,
              model.animations,
              object.label,
            );
            setClips(options);
            if (!chosenClip) selectClip(options[0].id);
          }
          fit();
        })
        .catch((error) => {
          if (!abort.signal.aborted)
            setModelError(`${object.label}: ${(error as Error).message}`);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading((value) => value - 1);
        });
    });
    const resize = () => {
      const width = element.clientWidth || 500;
      const height = element.clientHeight || 340;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      fit();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    controls.addEventListener("change", render);
    let visible = true;
    let motionTime = 0;
    let lastTime = 0;
    const tick = (now: number) => {
      const elapsed = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      if (!visible || document.hidden) return;
      if (controls.autoRotate) controls.update();
      if (playback.playing) {
        playback.update(elapsed);
        render();
      }
      if (!pulseEnabled) return;
      motionTime += elapsed;
      meshes.forEach((mesh, index) => {
        const object = spec.objects[index];
        if (!object.pulse) return;
        const factor = pulseScale(
          motionTime,
          object.pulse.bpm,
          object.pulse.amplitude,
        );
        setPulsePhase(factor < 0.97 ? "Contracting" : "Relaxing");
        mesh.scale.set(
          object.scale * factor,
          object.scale * (1 + (1 - factor) * 0.35),
          object.scale * factor,
        );
      });
      render();
    };
    renderer.setAnimationLoop(tick);
    const visibility = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
    });
    visibility.observe(element);
    const pauseMotion = () => {
      setMotionReduced(reducedMotion.matches);
      if (reducedMotion.matches) {
        playback.playing = false;
        setPlaying(false);
        controls.autoRotate = false;
        setRotating(false);
        pulseEnabled = false;
        setPulsing(false);
      }
    };
    reducedMotion.addEventListener("change", pauseMotion);
    const select = (index: number) => {
      setSelected(index);
      meshes.forEach((mesh, i) => {
        eachMaterial(mesh, (material) => {
          if (!material.emissive) return;
          material.userData.originalEmissive ??= material.emissive.clone();
          material.emissive.copy(
            i === index
              ? new THREE.Color("#334b37")
              : material.userData.originalEmissive,
          );
        });
      });
      render();
    };
    const raycaster = new THREE.Raycaster();
    let down = [0, 0];
    const pointerDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = raycaster.intersectObjects(meshes)[0];
      if (hit)
        select(meshes.findIndex((mesh) => !!mesh.getObjectById(hit.object.id)));
    };
    const keyboard = (e: KeyboardEvent) => {
      if (
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "+",
          "=",
          "-",
        ].includes(e.key)
      )
        return;
      e.preventDefault();
      const offset = camera.position.clone().sub(controls.target),
        spherical = new THREE.Spherical().setFromVector3(offset);
      if (e.key === "ArrowLeft") spherical.theta -= 0.12;
      if (e.key === "ArrowRight") spherical.theta += 0.12;
      if (e.key === "ArrowUp") spherical.phi -= 0.12;
      if (e.key === "ArrowDown") spherical.phi += 0.12;
      if (e.key === "+" || e.key === "=") spherical.radius *= 0.9;
      if (e.key === "-") spherical.radius *= 1.1;
      spherical.makeSafe();
      camera.position
        .copy(controls.target)
        .add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update();
      render();
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      setError(
        "The browser lost its 3D graphics context. Reload the page to restore the scene.",
      );
      renderer.setAnimationLoop(null);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("keydown", keyboard);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    actions.current = {
      selectClip,
      playClip: (value) => {
        playback.playing = value;
        setPlaying(value);
      },
      pulse: (value) => {
        pulseEnabled = value && !reducedMotion.matches;
        setPulsing(pulseEnabled);
        render();
      },
      reset: fit,
      rotate: (v) => {
        controls.autoRotate = v;
      },
      wireframe: (v) => {
        wireframeEnabled = v;
        meshes.forEach((m) => {
          eachMaterial(m, (material) => {
            material.wireframe = v;
          });
        });
        render();
      },
      select,
    };
    return () => {
      actions.current = null;
      abort.abort();
      observer.disconnect();
      visibility.disconnect();
      reducedMotion.removeEventListener("change", pauseMotion);
      renderer.setAnimationLoop(null);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("keydown", keyboard);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      playback.dispose();
      meshes.forEach(disposeSceneObject);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [spec]);
  return {
    spec,
    modelError,
    clips,
    clipId,
    playing,
    loading,
    pulsing,
    pulsePhase,
    motionReduced,
    host,
    actions,
    error,
    rotating,
    setRotating,
    wireframe,
    setWireframe,
    selected,
    setSelected,
  };
}
export type SceneController = ReturnType<typeof useScene>;
