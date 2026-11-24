import { useRef, useState } from "react";
import { cva } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { Box, RotateCcw, X } from "lucide-react";
const buttonVariants = cva("landing-control", {
  variants: {
    variant: { navCta: "nav-open", model: "inspect", quiet: "viewer-action" },
  },
});
export function Button({
  asChild = false,
  variant,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  variant: "navCta" | "model" | "quiet";
}) {
  const Comp = asChild ? Slot : "button";
  return <Comp {...props} className={buttonVariants({ variant })} />;
}
export function ModelControls() {
  const dialog = useRef<HTMLDialogElement>(null),
    canvas = useRef<HTMLDivElement>(null);
  const job = useRef<AbortController | null>(null),
    reset = useRef<(() => void) | undefined>(undefined);
  const [status, setStatus] = useState("");
  async function open() {
    if (!dialog.current || !canvas.current) return;
    dialog.current.showModal();
    canvas.current.focus();
    setStatus("Loading 3D model…");
    const session = new AbortController();
    job.current = session;
    try {
      const { mountViewer } = await import("./DuctViewer");
      if (session.signal.aborted) return;
      const restore = await mountViewer(canvas.current, session.signal);
      if (!session.signal.aborted) {
        reset.current = restore;
        setStatus("");
      }
    } catch {
      if (!session.signal.aborted)
        setStatus("Interactive 3D is unavailable on this device.");
    }
  }
  return (
    <>
      <Button variant="model" onClick={open}>
        <Box size={15} /> Inspect in 3D
      </Button>
      <dialog
        ref={dialog}
        className="model-dialog"
        aria-labelledby="model-title"
        onClose={() => {
          job.current?.abort();
          reset.current = undefined;
        }}
      >
        <div className="viewer-head">
          <h2 id="model-title">90° rectangular elbow</h2>
          <Button
            variant="quiet"
            aria-label="Close model"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </Button>
        </div>
        <div
          className="model-stage"
          tabIndex={0}
          ref={canvas}
          aria-label="Rotate the elbow with the left and right arrow keys"
        />
        <div className="viewer-foot">
          <span role="status">
            {status || "Drag to rotate · Scroll or pinch to zoom"}
          </span>
          <Button
            variant="quiet"
            disabled={!!status}
            onClick={() => reset.current?.()}
          >
            <RotateCcw size={15} /> Reset view
          </Button>
        </div>
      </dialog>
    </>
  );
}
