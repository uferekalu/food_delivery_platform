"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { useLazyGetUploadSignatureQuery, type UploadFolder } from "@/lib/redux/services/uploads-api";
import { Spinner } from "./spinner";
import { Button } from "./button";

export interface DocumentUploadProps {
  label: string;
  folder: UploadFolder;
  value?: string | null;
  onChange: (url: string) => void;
  hint?: string;
  className?: string;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"];

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function FileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-8 text-text-muted">
      <path
        d="M6 2.5h8l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1v-17a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 2.5v4a1 1 0 001 1h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Same direct-to-Cloudinary signed-upload pattern as ImageUpload, but for a document that isn't
 * necessarily an image (a CAC certificate is commonly a PDF) — posts to Cloudinary's `/auto/
 * upload` endpoint instead of `/image/upload` so either file type is accepted. `resource_type`
 * isn't part of the signed params (only `timestamp`/`folder` are, see UploadsService), so the
 * same signature works unchanged for this endpoint too.
 *
 * Cloudinary's own account-level "PDF and ZIP delivery" security setting must be enabled for
 * uploaded PDFs to actually be viewable afterwards — otherwise every PDF URL (signed or not)
 * 401s with `X-Cld-Error: deny or ACL failure`, confirmed live for this project's account. This
 * component can't work around that from the client; it's a one-time Cloudinary Console setting
 * (Settings → Security → allow PDF/ZIP delivery), independent of any code here.
 */
export function DocumentUpload({ label, folder, value, onChange, hint, className }: DocumentUploadProps) {
  const t = useTranslations("Upload");
  const [fetchSignature] = useLazyGetUploadSignatureQuery();
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  // Only known for a file picked *this session* — a document loaded from a saved URL (editing
  // an existing restaurant/rider) has no original filename to recover, so falls back to
  // decoding Cloudinary's generated public_id instead.
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function fileNameFromUrl(url: string): string {
    try {
      return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? t("uploadedDocument"));
    } catch {
      return t("uploadedDocument");
    }
  }

  const displayName = value ? (selectedFileName ?? fileNameFromUrl(value)) : null;
  const showImagePreview = !!value && isImageUrl(value);

  async function handleFileSelected(file: File) {
    setError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setStatus("error");
      setError(t("choosePdfJpgPng"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setStatus("error");
      setError(t("fileMustBeUnder5mb"));
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

      const response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/auto/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");

      const data = (await response.json()) as { secure_url: string };
      setSelectedFileName(file.name);
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
          {showImagePreview ? (
            <Image src={value} alt="" fill sizes="80px" className="object-cover" />
          ) : (
            <FileIcon />
          )}
          {status === "uploading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/40">
              <Spinner size="sm" className="text-neutral-0" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          {displayName && (
            <a
              href={value ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-64 truncate text-sm text-primary hover:underline"
            >
              {displayName}
            </a>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            isLoading={status === "uploading"}
            onClick={() => inputRef.current?.click()}
            className="self-start"
          >
            {value ? t("replaceDocument") : t("uploadDocument")}
          </Button>
          <span className="text-xs text-text-muted">{t("acceptedHint")}</span>
          {hint && !error && <span className="text-xs text-text-muted">{hint}</span>}
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,image/jpeg,image/png"
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
