"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { useLazyGetUploadSignatureQuery, type UploadFolder } from "@/lib/redux/services/uploads-api";
import { Spinner } from "./spinner";
import { Button } from "./button";

export interface ImageUploadProps {
  label: string;
  folder: UploadFolder;
  value?: string | null;
  onChange: (url: string) => void;
  hint?: string;
  className?: string;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Uploads directly to Cloudinary from the browser — the binary never passes through our
 * backend. Gets a short-lived signed upload signature from our API first (which is what
 * actually gates who can upload and where), then POSTs the file straight to Cloudinary.
 * See docs/ARCHITECTURE.md §Uploads.
 */
export function ImageUpload({ label, folder, value, onChange, hint, className }: ImageUploadProps) {
  const t = useTranslations("Upload");
  const [fetchSignature] = useLazyGetUploadSignatureQuery();
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(file: File) {
    setError(null);

    if (!file.type.startsWith("image/")) {
      setStatus("error");
      setError(t("chooseAnImageFile"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setStatus("error");
      setError(t("imagesMustBeUnder5mb"));
      return;
    }

    setStatus("uploading");
    try {
      const signature = await fetchSignature(folder).unwrap();

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", signature.apiKey);
      formData.append("timestamp", String(signature.timestamp));
      formData.append("signature", signature.signature);
      formData.append("folder", signature.folder);

      const response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");

      const data = (await response.json()) as { secure_url: string };
      onChange(data.secure_url);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError(t("uploadFailedTryAgain"));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-sm font-medium text-text">{label}</span>
      <div className="flex items-center gap-4">
        <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border-strong bg-surface-subtle">
          {value ? (
            <Image src={value} alt="" fill sizes="80px" className="object-cover" />
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-8 text-text-muted">
              <path
                d="M4 16l4.5-4.5a2 2 0 012.8 0L16 16M14 14l1.5-1.5a2 2 0 012.8 0L20 14M4 6h16v12H4V6z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {status === "uploading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/40">
              <Spinner size="sm" className="text-neutral-0" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            isLoading={status === "uploading"}
            onClick={() => inputRef.current?.click()}
          >
            {value ? t("replaceImage") : t("uploadImage")}
          </Button>
          {hint && !error && <span className="text-xs text-text-muted">{hint}</span>}
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileSelected(file);
          }}
        />
      </div>
    </div>
  );
}
