"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className = "primary-button",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? "正在保存…" : children}
    </button>
  );
}
