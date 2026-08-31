import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "Careers",
  description: "Open roles at Food Delivery Platform.",
};

function BriefcaseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-10">
      <rect x="4" y="11" width="24" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 11V8a2 2 0 012-2h4a2 2 0 012 2v3M4 17h24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function CareersPage() {
  return (
    <Container className="flex flex-col gap-6 py-16">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-bold text-text">Careers</h1>
        <p className="mx-auto max-w-xl text-text-muted">
          We&apos;re a small, fast-moving team building the platform behind local restaurants,
          delivery, and everything in between.
        </p>
      </div>
      <EmptyState
        icon={<BriefcaseIcon />}
        title="Not hiring externally right now"
        description="We don't have open roles at the moment, but we're growing — check back soon."
        className="mx-auto max-w-md py-16"
      />
    </Container>
  );
}
