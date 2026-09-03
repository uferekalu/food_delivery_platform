import NextLink from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { NotFoundContent } from "@/components/not-found-content";

// admin/rider/design-system are still English-only (docs/ROADMAP.md FDP-55/FDP-70), so this
// boundary's copy is static rather than translated — matching every other page in this route
// group.
export default function UntranslatedNotFound() {
  return (
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
  );
}
