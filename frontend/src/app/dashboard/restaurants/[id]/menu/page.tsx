"use client";

import { use, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  useGetMenuQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useCreateItemMutation,
  useDeleteItemMutation,
  useToggleItemAvailabilityMutation,
} from "@/lib/redux/services/menu-api";
import { getErrorMessage } from "@/lib/redux/error";

const itemSchema = z.object({
  name: z.string().min(1, "Required").max(100),
  description: z.string().max(1000).optional(),
  price: z.coerce.number().min(0, "Must be 0 or more"),
});
type ItemFormValues = z.infer<typeof itemSchema>;

function AddCategoryForm({ restaurantId }: { restaurantId: string }) {
  const [name, setName] = useState("");
  const [createCategory, { isLoading }] = useCreateCategoryMutation();
  const { toast } = useToast();

  async function handleAdd() {
    if (!name.trim()) return;
    try {
      await createCategory({ restaurantId, body: { name: name.trim() } }).unwrap();
      setName("");
    } catch (err) {
      toast({ title: "Couldn't add category", description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <div className="flex gap-2">
      <Input
        placeholder="New category name (e.g. Starters)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void handleAdd();
          }
        }}
      />
      <Button variant="outline" isLoading={isLoading} onClick={() => void handleAdd()}>
        Add category
      </Button>
    </div>
  );
}

function AddItemModal({
  restaurantId,
  categoryId,
  open,
  onClose,
}: {
  restaurantId: string;
  categoryId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [createItem, { isLoading }] = useCreateItemMutation();
  const { toast } = useToast();
  // z.coerce.number() means the form's *input* shape (price: unknown, before coercion)
  // differs from its *output* shape (price: number, after) — the resolver's third generic
  // tells useForm/handleSubmit which one the submit callback actually receives.
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof itemSchema>, unknown, z.output<typeof itemSchema>>({
    resolver: zodResolver(itemSchema),
  });

  const submit = async (values: ItemFormValues) => {
    try {
      await createItem({ restaurantId, body: { categoryId, ...values } }).unwrap();
      reset();
      onClose();
    } catch (err) {
      toast({ title: "Couldn't add item", description: getErrorMessage(err), variant: "danger" });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add menu item"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" form="add-item-form" isLoading={isLoading}>
            Save item
          </Button>
        </>
      }
    >
      <form
        id="add-item-form"
        onSubmit={(e) => void handleSubmit(submit)(e)}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField label="Name" error={errors.name?.message} required>
          <Input {...register("name")} />
        </FormField>
        <FormField label="Description" error={errors.description?.message}>
          <Textarea {...register("description")} rows={3} />
        </FormField>
        <FormField label="Price" error={errors.price?.message} required>
          <Input type="number" step="0.01" min="0" {...register("price")} />
        </FormField>
      </form>
    </Modal>
  );
}

function MenuManager({ restaurantId }: { restaurantId: string }) {
  const { data: menu, isLoading, isError } = useGetMenuQuery(restaurantId);
  const [deleteCategory] = useDeleteCategoryMutation();
  const [deleteItem] = useDeleteItemMutation();
  const [toggleAvailability] = useToggleItemAvailabilityMutation();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const { toast } = useToast();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError) return <Alert variant="danger">Couldn&apos;t load the menu.</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <AddCategoryForm restaurantId={restaurantId} />

      {!menu || menu.length === 0 ? (
        <EmptyState title="No categories yet" description="Add a category above to start building your menu." />
      ) : (
        menu.map((category) => (
          <Card key={category._id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{category.name}</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setActiveCategoryId(category._id)}>
                  Add item
                </Button>
                <IconButton
                  label="Delete category"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void deleteCategory({ restaurantId, categoryId: category._id })
                      .unwrap()
                      .catch((err: unknown) =>
                        toast({ title: "Couldn't delete category", description: getErrorMessage(err), variant: "danger" }),
                      );
                  }}
                  icon={
                    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
                      <path
                        d="M2 4h12M6 4V2.5A1.5 1.5 0 017.5 1h1A1.5 1.5 0 0110 2.5V4m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4h8z"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  }
                />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {category.items.length === 0 ? (
                <p className="text-sm text-text-muted">No items in this category yet.</p>
              ) : (
                category.items.map((item) => (
                  <div
                    key={item._id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-text">{item.name}</span>
                      <span className="text-sm text-text-muted">{item.price.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={item.isAvailable}
                        onChange={() => void toggleAvailability({ restaurantId, itemId: item._id })}
                        label={`${item.name} available`}
                        hideLabel
                      />
                      <IconButton
                        label="Delete item"
                        size="sm"
                        variant="ghost"
                        onClick={() => void deleteItem({ restaurantId, itemId: item._id })}
                        icon={
                          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
                            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        }
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))
      )}

      {activeCategoryId && (
        <AddItemModal
          restaurantId={restaurantId}
          categoryId={activeCategoryId}
          open={!!activeCategoryId}
          onClose={() => setActiveCategoryId(null)}
        />
      )}
    </div>
  );
}

export default function MenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <Container className="max-w-3xl py-10">
        <h1 className="mb-6 text-2xl font-bold text-text">Manage menu</h1>
        <MenuManager restaurantId={id} />
      </Container>
    </RequireRole>
  );
}
