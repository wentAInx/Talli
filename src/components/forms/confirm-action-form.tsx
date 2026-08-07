"use client";

import { useFormStatus } from "react-dom";

function ConfirmButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="danger-button" type="submit" disabled={pending}>
      {pending ? "正在处理…" : children}
    </button>
  );
}

export function ConfirmActionForm({
  action,
  message,
  children,
}: {
  action: () => Promise<void>;
  message: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      <ConfirmButton>{children}</ConfirmButton>
    </form>
  );
}
