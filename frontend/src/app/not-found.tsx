import NextLink from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { NotFoundContent } from "@/components/not-found-content";

// True-root fallback — only reached when neither `app/[locale]/not-found.tsx` nor
// `app/(untranslated)/not-found.tsx` applies (e.g. a request the middleware doesn't route to
// either tree at all). Since this renders outside both layouts' AppShell, there's no header/
// footer chrome here — just enough branding (the logo, linked home) to not look like a bare
// error page. Static English: with no resolved locale tree, there's no reliable locale to
// translate into anyway.
export default function RootNotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex justify-center py-6">
        <NextLink href="/" aria-label="Food Delivery Platform home">
          <Logo className="size-8" />
        </NextLink>
      </div>
      <NotFoundContent
        eyebrow="404"
        title="Page not found"
        description="The page you're looking for doesn't exist or may have been moved."
        homeButton={
          <NextLink href="/" className={buttonVariants({ variant: "primary", size: "lg" })}>
            Back to homepage
          </NextLink>
        }
      />
    </div>
  );
}
