import { notFound } from "next/navigation";

// See the sibling comment in app/[locale]/[...catchAll]/page.tsx — same reasoning, for
// /design-system.
export default function DesignSystemCatchAll(): never {
  notFound();
}
