"use client";

import { useTranslations } from "next-intl";
import { Modal } from "./modal";
import { Button } from "./button";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  /** "danger" (default) for anything destructive/irreversible (delete, cancel, refund); "primary"
   * for a confirm step that isn't itself destructive (e.g. confirming a non-reversible but
   * benign action). */
  variant?: "danger" | "primary";
}

/**
 * The one place every "are you sure?" step in the app should go through — see
 * docs/ROADMAP.md's confirm-before-destructive-action sweep. Wraps `Modal` rather than
 * reinventing focus-trap/Escape/backdrop-click handling.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  isLoading = false,
  variant = "danger",
}: ConfirmDialogProps) {
  const t = useTranslations("Common");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            {cancelLabel ?? t("cancel")}
          </Button>
          <Button
            variant={variant === "danger" ? "destructive" : "primary"}
            isLoading={isLoading}
            onClick={onConfirm}
          >
            {confirmLabel ?? t("confirm")}
          </Button>
        </>
      }
    />
  );
}
