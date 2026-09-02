import { Container } from "@/components/ui/container";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-surface-subtle py-12">
      <Container className="flex justify-center">
        <div className="w-full max-w-md">{children}</div>
      </Container>
    </div>
  );
}
