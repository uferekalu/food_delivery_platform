import { notFound } from "next/navigation";

// See the sibling comment in app/[locale]/[...catchAll]/page.tsx — same reasoning, for /admin.
export default function AdminCatchAll(): never {
  notFound();
}
