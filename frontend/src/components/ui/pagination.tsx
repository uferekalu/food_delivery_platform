import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}

function getPageList(page: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages = new Set([1, totalPages, page, page - 1, page + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const result: (number | "ellipsis")[] = [];
  sorted.forEach((p, index) => {
    if (index > 0 && p - sorted[index - 1] > 1) result.push("ellipsis");
    result.push(p);
  });
  return result;
}

export function Pagination({ page, totalPages, onChange, className }: PaginationProps) {
  const t = useTranslations("Common");
  if (totalPages <= 1) return null;
  const pages = getPageList(page, totalPages);

  return (
    <nav aria-label={t("pagination")} className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label={t("previousPage")}
        className="flex h-10 min-w-10 items-center justify-center rounded-md px-2 text-sm text-text hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
      >
        ‹
      </button>
      {pages.map((p, index) =>
        p === "ellipsis" ? (
          <span key={`ellipsis-${index}`} aria-hidden="true" className="px-2 text-text-muted">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            aria-label={t("page", { page: p })}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onChange(p)}
            className={cn(
              "flex h-10 min-w-10 items-center justify-center rounded-md px-2 text-sm transition-colors duration-150",
              p === page ? "bg-primary text-primary-foreground" : "text-text hover:bg-secondary",
            )}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label={t("nextPage")}
        className="flex h-10 min-w-10 items-center justify-center rounded-md px-2 text-sm text-text hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
      >
        ›
      </button>
    </nav>
  );
}
