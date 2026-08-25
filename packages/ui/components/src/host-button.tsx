import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type HostButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  children?: ReactNode;
};

/** Trusted host primitive. Agent-tool components (DataTable, TaskCard, …) are owned by P0-316. */
export function HostButton({ asChild = false, ...props }: HostButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp type={asChild ? undefined : "button"} {...props} />;
}
