"use client";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/errors";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/**
 * Small wrapper around a server action: shows pending state and the
 * translated success/error message returned by the action.
 */
export function ActionForm({
  action, children, className, confirmText, resetOnSuccess, refreshOnSuccess = true, hideMessageOnSuccess, onSuccess,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  confirmText?: string;
  resetOnSuccess?: boolean;
  refreshOnSuccess?: boolean;
  hideMessageOnSuccess?: boolean;
  onSuccess?: (r: ActionResult) => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      if (refreshOnSuccess) router.refresh();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
      {state && !(state.ok && hideMessageOnSuccess) && (state.ok ? state.message : state.error) && (
        <p role="status" aria-live="polite" className={`mt-2 text-sm ${state.ok ? "text-teal-300" : "text-red-300"}`}>
          {state.ok ? state.message : state.error}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({ children, className = "btn-primary", pendingText, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || rest.disabled} aria-busy={pending} {...rest}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
