import { useEffect,useRef,type ReactNode } from "react";
import { X,Box,ChevronDown } from "lucide-react";
export function Mark() {
  return <img className="brandmark" src="/mark.svg" alt="" />;
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modalhead">
        <h2>{title}</h2>
        <IconButton title="Close dialog" onClick={close}>
          <X />
        </IconButton>
      </div>
      <div className="modalbody">{children}</div>
    </dialog>
  );
}
export function IconButton({
  title,
  onClick,
  children,
  active,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={"iconbtn " + (active ? "active" : "")}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Box size={30} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}
export function Choice(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="selectwrap">
      <select {...props} />
      <ChevronDown size={13} />
    </span>
  );
}
