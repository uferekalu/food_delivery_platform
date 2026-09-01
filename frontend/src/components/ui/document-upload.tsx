"use client";

import { useRef, useState } from "react";
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

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function fileNameFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "Uploaded document");
  } catch {
    return "Uploaded document";
  }
}

/**
 * Same direct-to-Cloudinary signed-upload pattern as ImageUpload, but for a document that isn't
 * necessarily an image (a CAC certificate is commonly a PDF) — posts to Cloudinary's `/auto/
 * upload` endpoint instead of `/image/upload` so either file type is accepted. `resource_type`
 * isn't part of the signed params (only `timestamp`/`folder` are, see UploadsService), so the
 * same signature works unchanged for this endpoint too.
 */
export function DocumentUpload({ label, folder, value, onChange, hint, className }: DocumentUploadProps) {
  const [fetchSignature] = useLazyGetUploadSignatureQuery();
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(file: File) {
    setError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setStatus("error");
      setError("Please choose a PDF, JPG, PNG, or WEBP file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setStatus("error");
      setError("File must be under 10MB.");
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
      onChange(data.secure_url);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("Upload failed — try again.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-sm font-medium text-text">{label}</span>
      <div className="flex items-center gap-3">
        {value && (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm text-primary hover:underline"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4 shrink-0">
              <path
                d="M4 1.5h5l3 3v10a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-12a.5.5 0 01.5-.5z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
            <span className="truncate">{fileNameFromUrl(value)}</span>
          </a>
        )}
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            isLoading={status === "uploading"}
            onClick={() => inputRef.current?.click()}
          >
            {value ? "Replace document" : "Upload document"}
          </Button>
          {hint && !error && <span className="text-xs text-text-muted">{hint}</span>}
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,image/jpeg,image/png,image/webp"
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
