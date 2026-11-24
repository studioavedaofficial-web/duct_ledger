import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export async function mountViewer(host: HTMLElement, signal: AbortSignal) {
  const { scene: model } = await new GLTFLoader().loadAsync(
    "/landing/elbow.glb",
  );
  if (signal.aborted) return;
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new Scene();
  scene.background = new Color("#1b201e");
  const studio = new RoomEnvironment();
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(studio, 0.04);
  scene.environment = env.texture;
  studio.dispose();
  pmrem.dispose();
  const center = new Box3().setFromObject(model).getCenter(new Vector3());
  model.position.sub(center);
  scene.add(model);
  const lamp = new DirectionalLight(0xffffff, 2.4);
  lamp.position.set(-4, 6, 4);
  scene.add(lamp, new AmbientLight(0xffffff, 0.65));
  const camera = new PerspectiveCamera(37, 1, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minDistance = 5;
  controls.maxDistance = 18;
  camera.position.set(-6, 5.7, -7.7);
  controls.update();
  controls.saveState();
  host.replaceChildren(renderer.domElement);
  function draw() {
    renderer.render(scene, camera);
  }
  controls.addEventListener("change", draw);
  const resize = new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    draw();
  });
  resize.observe(host);
  function key(e: KeyboardEvent) {
    const delta =
      e.key === "ArrowLeft" ? -0.18 : e.key === "ArrowRight" ? 0.18 : 0;
    if (!delta) return;
    e.preventDefault();
    camera.position.applyAxisAngle(new Vector3(0, 1, 0), delta);
    controls.update();
  }
  host.addEventListener("keydown", key);
  signal.addEventListener(
    "abort",
    () => {
      resize.disconnect();
      host.removeEventListener("keydown", key);
      controls.dispose();
      model.traverse((o) => {
        if ("isMesh" in o) {
          const mesh = o as import("three").Mesh;
          mesh.geometry.dispose();
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          materials.forEach((m) => m.dispose());
        }
      });
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
    { once: true },
  );
  return () => controls.reset();
}
