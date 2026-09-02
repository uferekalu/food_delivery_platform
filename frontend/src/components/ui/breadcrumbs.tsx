import { cn } from "@/lib/cn";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Fragment } from "react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const t = useTranslations("Common");
  return (
    <nav aria-label={t("breadcrumb")} className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-text-muted">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={item.label}>
              {index > 0 && (
                <li aria-hidden="true" className="text-border-strong">
                  /
                </li>
              )}
              <li>
                {item.href && !isLast ? (
                  <Link href={item.href} className="hover:text-text hover:underline">
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={isLast ? "page" : undefined} className={cn(isLast && "font-medium text-text")}>
                    {item.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
