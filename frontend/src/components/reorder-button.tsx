"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useReorderMutation } from "@/lib/redux/services/orders-api";
import { getErrorMessage } from "@/lib/redux/error";

function isConflictError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: unknown }).status === 409;
}

/**
 * "Buy again" (docs/ROADMAP.md FDP-97) — shared between the order detail page and each row on
 * the order history list (docs/ROADMAP.md FDP-102 audit: reordering was previously only
 * reachable from inside a specific order's detail page, one click too deep to actually notice).
 */
export function ReorderButton({ orderId, size = "sm" }: { orderId: string; size?: "sm" | "md" | "lg" }) {
  const t = useTranslations("OrderDetailPage");
  const router = useRouter();
  const { toast } = useToast();
  const [reorder, { isLoading }] = useReorderMutation();
  const [confirmingReplace, setConfirmingReplace] = useState(false);

  async function submit(replace = false) {
    try {
      const result = await reorder({ orderId, replace }).unwrap();
      setConfirmingReplace(false);
      toast(
        result.skippedItems.length > 0
          ? { title: t("reorderedWithSkippedToast", { count: result.skippedItems.length }), variant: "warning" }
          : { title: t("reorderedToast"), variant: "success" },
      );
      router.push("/checkout");
    } catch (err) {
      if (isConflictError(err)) {
        setConfirmingReplace(true);
        return;
      }
      toast({ title: t("couldNotReorder"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        isLoading={isLoading}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void submit(false);
        }}
      >
        {t("reorder")}
      </Button>
      <Modal
        open={confirmingReplace}
        onClose={() => setConfirmingReplace(false)}
        title={t("startNewCartTitle")}
        description={t("startNewCartDescription")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingReplace(false)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" isLoading={isLoading} onClick={() => void submit(true)}>
              {t("clearCartAndAdd")}
            </Button>
          </>
        }
      />
    </>
  );
}
