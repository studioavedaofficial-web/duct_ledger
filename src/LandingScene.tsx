import {
  lazy,
  Suspense,
  useState,
  useEffect,
  Component,
  type ReactNode,
} from "react";
import type { Application } from "@splinetool/runtime";
import { createRoot } from "react-dom/client";
import { Button, ModelControls } from "./HeroControls";

const Spline = lazy(() => import("@splinetool/react-spline"));
const nav = document.getElementById("nav-launch");
if (nav)
  createRoot(nav).render(
    <Button asChild variant="navCta">
      <a href="/workspace/">
        Open workspace <span aria-hidden="true">↗</span>
      </a>
    </Button>,
  );
const controls = document.getElementById("model-controls");
if (controls) createRoot(controls).render(<ModelControls />);

class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Scene() {
  const [app, setApp] = useState<Application | null>(null);
  useEffect(() => {
    const hero = document.querySelector(".hero");
    const dialog = document.querySelector<HTMLDialogElement>(".model-dialog");
    if (!app || !hero) return;
    let visible = true;
    function sync() {
      const active = visible && !document.hidden && !dialog?.open;
      if (active && app!.isStopped) app!.play();
      if (!active && !app!.isStopped) app!.stop();
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(hero);
    const changes = new MutationObserver(sync);
    if (dialog)
      changes.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      observer.disconnect();
      changes.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [app]);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    function update() {
      setApp(null);
      setReduced(preference.matches);
    }
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const hero = document.querySelector<HTMLElement>(".hero");
    if (!hero || reduced || !matchMedia("(pointer: fine)").matches) return;
    function move(e: PointerEvent) {
      const rect = hero!.getBoundingClientRect();
      hero!.style.setProperty(
        "--turn",
        ((e.clientX - rect.left) / rect.width) * 9 - 4.5 + "deg",
      );
      hero!.style.setProperty(
        "--tilt",
        3 - ((e.clientY - rect.top) / rect.height) * 6 + "deg",
      );
    }
    function reset() {
      hero!.style.removeProperty("--turn");
      hero!.style.removeProperty("--tilt");
    }
    hero.addEventListener("pointermove", move);
    hero.addEventListener("pointerleave", reset);
    return () => {
      reset();
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", reset);
    };
  }, [reduced]);
  if (reduced) return null;
  return (
    <div className={app ? "scene-content ready" : "scene-content"}>
      <SceneBoundary>
        <Suspense fallback={null}>
          <Spline
            scene="/landing/hero.splinecode"
            htmlContentMode="none"
            onLoad={setApp}
          />
        </Suspense>
      </SceneBoundary>
    </div>
  );
}
const host = document.getElementById("scene");
if (host) createRoot(host).render(<Scene />);
