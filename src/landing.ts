const inspect = document.querySelector<HTMLButtonElement>(".inspect")!;
const dialog = document.querySelector<HTMLDialogElement>(".model-dialog")!;
const stage = dialog.querySelector<HTMLElement>(".model-stage")!;
const viewerStatus = dialog.querySelector<HTMLElement>('[role="status"]')!;
const reset = dialog.querySelector<HTMLButtonElement>(".reset-view")!;
let active: AbortController | undefined;
let restore: (() => void) | undefined;

inspect.hidden = false;
inspect.addEventListener("click", async () => {
  const session = new AbortController();
  active = session;
  reset.disabled = true;
  viewerStatus.textContent = "Loading 3D model…";
  dialog.showModal();
  stage.focus();
  try {
    const { mountViewer } = await import("./DuctViewer");
    if (session.signal.aborted) return;
    const initialView = await mountViewer(stage, session.signal);
    if (session.signal.aborted) return;
    restore = initialView;
    reset.disabled = false;
    viewerStatus.textContent = "Drag to rotate · Scroll or pinch to zoom";
  } catch {
    if (!session.signal.aborted)
      viewerStatus.textContent =
        "Interactive 3D is unavailable on this device.";
  }
});
reset.addEventListener("click", () => restore?.());
dialog
  .querySelector(".close-model")!
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  active?.abort();
  restore = undefined;
  inspect.focus({ preventScroll: true });
});
