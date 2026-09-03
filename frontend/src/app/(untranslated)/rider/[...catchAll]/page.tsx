import { notFound } from "next/navigation";

// See the sibling comment in app/[locale]/[...catchAll]/page.tsx — same reasoning, for /rider.
export default function RiderCatchAll(): never {
  notFound();
}
