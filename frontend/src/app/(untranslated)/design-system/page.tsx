"use client";

import { useState } from "react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Divider } from "@/components/ui/divider";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioOption } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Pagination } from "@/components/ui/pagination";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/components/ui/link";

const brandSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const neutralSteps = [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 py-10">
      <h2 className="text-xl font-semibold text-text">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState("menu");
  const [page, setPage] = useState(1);
  const [selectValue, setSelectValue] = useState<string | undefined>();
  const [radioValue, setRadioValue] = useState("asap");
  const [switchOn, setSwitchOn] = useState(true);

  return (
    <Container className="pb-24">
      <header className="flex flex-col gap-2 py-10">
        <h1 className="text-3xl font-bold text-text">Design system</h1>
        <p className="text-text-muted">
          Living reference for every design token and UI kit component. Nothing on this page is
          production UI — it exists purely so tokens/components can be eyeballed and QA&apos;d in
          one place.
        </p>
      </header>

      <Divider />

      <Section title="Color — brand (burgundy)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 lg:grid-cols-11">
          {brandSteps.map((step) => (
            <div key={step} className="flex flex-col gap-1">
              <div
                className="h-16 rounded-md border border-border"
                style={{ backgroundColor: `var(--color-brand-${step})` }}
              />
              <span className="text-xs text-text-muted">{step}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Color — neutral">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 lg:grid-cols-12">
          {neutralSteps.map((step) => (
            <div key={step} className="flex flex-col gap-1">
              <div
                className="h-16 rounded-md border border-border"
                style={{ backgroundColor: `var(--color-neutral-${step})` }}
              />
              <span className="text-xs text-text-muted">{step}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Color — semantic">
        <div className="flex flex-wrap gap-3">
          <Badge variant="primary">primary</Badge>
          <Badge variant="neutral">neutral</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warning">warning</Badge>
          <Badge variant="danger">danger</Badge>
          <Badge variant="info">info</Badge>
        </div>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-2">
          <p className="text-5xl font-bold text-text">Text 5xl bold</p>
          <p className="text-4xl font-bold text-text">Text 4xl bold</p>
          <p className="text-3xl font-semibold text-text">Text 3xl semibold</p>
          <p className="text-2xl font-semibold text-text">Text 2xl semibold</p>
          <p className="text-xl font-medium text-text">Text xl medium</p>
          <p className="text-lg text-text">Text lg regular</p>
          <p className="text-base text-text">Text base regular</p>
          <p className="text-sm text-text-muted">Text sm muted</p>
          <p className="text-xs text-text-muted">Text xs muted</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link style</Button>
          <Button isLoading>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <IconButton
            label="Add to favorites"
            icon={
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
                <path d="M10 17.5l-1.45-1.32C4.4 12.36 2 10.2 2 7.5 2 5.42 3.42 4 5.5 4c1.17 0 2.3.55 3 1.41A3.99 3.99 0 0111.5 4C13.58 4 15 5.42 15 7.5c0 2.7-2.4 4.86-6.55 8.68L10 17.5z" />
              </svg>
            }
          />
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid max-w-xl gap-5">
          <FormField label="Restaurant name" hint="Shown to customers on your storefront" required>
            <Input placeholder="e.g. Burgundy Kitchen" />
          </FormField>

          <FormField label="Email" error="Enter a valid email address">
            <Input type="email" placeholder="you@example.com" invalid />
          </FormField>

          <FormField label="Description">
            <Textarea placeholder="Tell customers what makes your restaurant great…" />
          </FormField>

          <FormField label="Cuisine">
            <Select
              placeholder="Choose a cuisine"
              value={selectValue}
              onChange={setSelectValue}
              options={[
                { value: "nigerian", label: "Nigerian" },
                { value: "italian", label: "Italian" },
                { value: "chinese", label: "Chinese" },
                { value: "unavailable", label: "Unavailable option", disabled: true },
              ]}
            />
          </FormField>

          <Checkbox label="I agree to the terms of service" defaultChecked />

          <RadioGroup label="Delivery time" value={radioValue} onChange={setRadioValue}>
            <RadioOption value="asap" label="As soon as possible" />
            <RadioOption value="scheduled" label="Schedule for later" description="Pick a time at checkout" />
          </RadioGroup>

          <Switch checked={switchOn} onChange={setSwitchOn} label="Restaurant currently accepting orders" />
        </div>
      </Section>

      <Section title="Feedback">
        <div className="flex flex-col gap-3">
          <Alert variant="neutral" title="Heads up">
            This is a neutral alert used for general information.
          </Alert>
          <Alert variant="success" title="Order confirmed">
            The restaurant has accepted your order.
          </Alert>
          <Alert variant="warning" title="Running late">
            Your delivery is taking longer than expected.
          </Alert>
          <Alert variant="danger" title="Payment failed">
            We couldn&apos;t process your payment — try another method.
          </Alert>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Spinner />
          <Skeleton className="h-10 w-40" />
          <Button onClick={() => setModalOpen(true)}>Open modal</Button>
          <Button variant="outline" onClick={() => toast({ title: "Order placed", description: "Track it from your orders page.", variant: "success" })}>
            Trigger toast
          </Button>
        </div>
        <EmptyState title="No orders yet" description="Your order history will show up here." action={<Button size="sm">Browse restaurants</Button>} />
      </Section>

      <Section title="Navigation">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Restaurants", href: "/design-system" }, { label: "Burgundy Kitchen" }]} />

        <Tabs value={tab} onChange={setTab}>
          <TabList>
            <Tab value="menu">Menu</Tab>
            <Tab value="reviews">Reviews</Tab>
            <Tab value="info">Info</Tab>
          </TabList>
          <TabPanel value="menu">Menu content goes here.</TabPanel>
          <TabPanel value="reviews">Reviews content goes here.</TabPanel>
          <TabPanel value="info">Restaurant info goes here.</TabPanel>
        </Tabs>

        <Pagination page={page} totalPages={12} onChange={setPage} />
      </Section>

      <Section title="Data display">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name="Kalu Ufere" />
          <Avatar name="Ada Obi" size="lg" />
        </div>
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Burgundy Kitchen</CardTitle>
            <CardDescription>Nigerian • 25–35 min • ⭐ 4.8</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-muted">
              Jollof rice, suya, and more — delivered hot.
            </p>
          </CardContent>
          <CardFooter>
            <Button size="sm">View menu</Button>
            <Button size="sm" variant="ghost">
              Save
            </Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Overlay">
        <div className="flex items-center gap-4">
          <DropdownMenu
            trigger={(triggerProps) => (
              <Button variant="outline" {...triggerProps}>
                Actions
              </Button>
            )}
            items={[
              { label: "Edit", onSelect: () => toast({ title: "Edit selected" }) },
              { label: "Duplicate", onSelect: () => toast({ title: "Duplicate selected" }) },
              { label: "Delete", destructive: true, onSelect: () => toast({ title: "Delete selected", variant: "danger" }) },
            ]}
          />
          <Tooltip content="This is a tooltip">
            {(triggerProps) => (
              <Button variant="ghost" {...triggerProps}>
                Hover me
              </Button>
            )}
          </Tooltip>
          <Link href="/design-system">Styled link</Link>
        </div>
      </Section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Confirm order"
        description="Review your order before placing it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setModalOpen(false)}>Confirm</Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">Modal body content goes here.</p>
      </Modal>
    </Container>
  );
}
