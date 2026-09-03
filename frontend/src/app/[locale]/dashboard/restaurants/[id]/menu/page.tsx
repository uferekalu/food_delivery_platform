"use client";

import { use, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm, useFieldArray, type Control, type UseFormRegister } from "react-hook-form";
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
import { ImageUpload } from "@/components/ui/image-upload";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  useGetMenuQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useCreateItemMutation,
  useUpdateItemMutation,
  useDeleteItemMutation,
  useToggleItemAvailabilityMutation,
} from "@/lib/redux/services/menu-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { MenuItem } from "@/lib/redux/restaurant-types";

function PhotoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 16l5-5 3 3 3-3 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path
        d="M2 4h12M6 4V2.5A1.5 1.5 0 017.5 1h1A1.5 1.5 0 0110 2.5V4m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4h8z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// z.coerce.number()/z.preprocess accept anything as input (they run before validation/
// coercion), so the resolver's inferred input type for these numeric fields is `unknown`, not
// `number` — matching that here is what `useForm<ItemFormInput, unknown, ItemFormValues>()`
// needs to type-check against the schema built inside the component below.
interface ModifierOptionInput {
  name: string;
  priceDelta: unknown;
}
interface ModifierGroupInput {
  name: string;
  min: unknown;
  max: unknown;
  options: ModifierOptionInput[];
}
interface ItemFormInput {
  name: string;
  description?: string;
  price: unknown;
  costPrice?: unknown;
  modifierGroups?: ModifierGroupInput[];
}

function ModifierGroupRow({
  control,
  register,
  groupIndex,
  onRemoveGroup,
}: {
  control: Control<ItemFormInput>;
  register: UseFormRegister<ItemFormInput>;
  groupIndex: number;
  onRemoveGroup: () => void;
}) {
  const t = useTranslations("MenuManagerPage");
  const {
    fields: optionFields,
    append: appendOption,
    remove: removeOption,
  } = useFieldArray({ control, name: `modifierGroups.${groupIndex}.options` });

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Input placeholder={t("groupNamePlaceholder")} className="flex-1" {...register(`modifierGroups.${groupIndex}.name`)} />
        <IconButton label={t("removeGroup")} size="sm" variant="ghost" onClick={onRemoveGroup} icon={<TrashIcon />} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t("minSelections")}>
          <Input type="number" min="0" {...register(`modifierGroups.${groupIndex}.min`)} />
        </FormField>
        <FormField label={t("maxSelections")}>
          <Input type="number" min="1" {...register(`modifierGroups.${groupIndex}.max`)} />
        </FormField>
      </div>
      <div className="flex flex-col gap-2">
        {optionFields.map((optionField, optionIndex) => (
          <div key={optionField.id} className="flex items-center gap-2">
            <Input
              placeholder={t("optionNamePlaceholder")}
              className="flex-1"
              {...register(`modifierGroups.${groupIndex}.options.${optionIndex}.name`)}
            />
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder={t("pricePlaceholder")}
              className="w-28"
              {...register(`modifierGroups.${groupIndex}.options.${optionIndex}.priceDelta`)}
            />
            <IconButton
              label={t("removeOption")}
              size="sm"
              variant="ghost"
              onClick={() => removeOption(optionIndex)}
              icon={<TrashIcon />}
            />
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => appendOption({ name: "", priceDelta: 0 })}>
          {t("addOption")}
        </Button>
      </div>
    </div>
  );
}

function ItemFormModal({
  restaurantId,
  categoryId,
  item,
  open,
  onClose,
}: {
  restaurantId: string;
  categoryId: string;
  item?: MenuItem;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("MenuManagerPage");
  const [createItem, { isLoading: isCreating }] = useCreateItemMutation();
  const [updateItem, { isLoading: isUpdating }] = useUpdateItemMutation();
  const { toast } = useToast();
  const isEditing = Boolean(item);
  const [imageUrl, setImageUrl] = useState<string | undefined>(item?.imageUrl ?? undefined);

  const modifierOptionSchema = z.object({
    name: z.string().min(1, t("required")).max(100),
    priceDelta: z.coerce.number().min(0, t("mustBe0OrMore")),
  });
  const modifierGroupSchema = z
    .object({
      name: z.string().min(1, t("required")).max(100),
      min: z.coerce.number().int().min(0),
      max: z.coerce.number().int().min(1),
      options: z.array(modifierOptionSchema).min(1, t("addAtLeastOneOption")).max(20),
    })
    .refine((group) => group.max >= group.min, { message: t("maxMustBeAtLeastMin"), path: ["max"] });
  const itemSchema = z.object({
    name: z.string().min(1, t("required")).max(100),
    description: z.string().max(1000).optional(),
    price: z.coerce.number().min(0, t("mustBe0OrMore")),
    // A blank field submits "" (not undefined) through an uncontrolled `register()` input —
    // z.coerce.number() would otherwise turn that into 0, indistinguishable from "this item costs
    // nothing to make". preprocess maps blank to undefined first so "left blank" and "explicitly
    // 0" stay distinguishable (docs/ROADMAP.md FDP-64 relies on this: a null costPrice on the
    // backend means "unknown", not "free").
    costPrice: z.preprocess(
      (val) => (val === "" || val === undefined ? undefined : val),
      z.coerce.number().min(0, t("mustBe0OrMore")).optional(),
    ),
    modifierGroups: z.array(modifierGroupSchema).max(10).optional(),
  });
  type ItemFormValues = z.output<typeof itemSchema>;

  // z.coerce.number() means the form's *input* shape (numeric fields: unknown, before
  // coercion) differs from its *output* shape (numeric fields: number, after) — the
  // resolver's third generic tells useForm/handleSubmit which one the submit callback
  // actually receives. Same pattern used throughout this form for nested modifier fields.
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ItemFormInput, unknown, ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: item
      ? {
          name: item.name,
          description: item.description,
          price: item.price,
          costPrice: item.costPrice ?? undefined,
          modifierGroups: item.modifierGroups,
        }
      : { name: "", description: "", price: 0, costPrice: undefined, modifierGroups: [] },
  });
  const {
    fields: groupFields,
    append: appendGroup,
    remove: removeGroup,
  } = useFieldArray({ control, name: "modifierGroups" });

  const submit = async (values: ItemFormValues) => {
    try {
      if (isEditing && item) {
        await updateItem({ restaurantId, itemId: item._id, body: { ...values, imageUrl } }).unwrap();
      } else {
        await createItem({ restaurantId, body: { categoryId, ...values, imageUrl } }).unwrap();
      }
      reset();
      onClose();
    } catch (err) {
      toast({
        title: isEditing ? t("couldNotUpdateItem") : t("couldNotAddItem"),
        description: getErrorMessage(err),
        variant: "danger",
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? t("editMenuItem") : t("addMenuItem")}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} type="button">
            {t("cancel")}
          </Button>
          <Button type="submit" form="item-form" isLoading={isCreating || isUpdating}>
            {t("saveItem")}
          </Button>
        </>
      }
    >
      <form id="item-form" onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-4" noValidate>
        <ImageUpload
          label={t("photo")}
          folder="menu-items"
          value={imageUrl}
          onChange={setImageUrl}
          hint={t("photoHint")}
        />
        <FormField label={t("name")} error={errors.name?.message} required>
          <Input {...register("name")} />
        </FormField>
        <FormField label={t("description")} error={errors.description?.message}>
          <Textarea {...register("description")} rows={3} />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("price")} error={errors.price?.message} required>
            <Input type="number" step="0.01" min="0" {...register("price")} />
          </FormField>
          <FormField label={t("costPrice")} error={errors.costPrice?.message} hint={t("costPriceHint")}>
            <Input type="number" step="0.01" min="0" {...register("costPrice")} />
          </FormField>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text">{t("modifierGroupsOptional")}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendGroup({ name: "", min: 0, max: 1, options: [{ name: "", priceDelta: 0 }] })}
            >
              {t("addGroup")}
            </Button>
          </div>
          <p className="text-xs text-text-muted">{t("modifierGroupsHint")}</p>
          {groupFields.map((groupField, groupIndex) => (
            <ModifierGroupRow
              key={groupField.id}
              control={control}
              register={register}
              groupIndex={groupIndex}
              onRemoveGroup={() => removeGroup(groupIndex)}
            />
          ))}
        </div>
      </form>
    </Modal>
  );
}

type PendingDelete =
  | { kind: "category"; id: string; name: string }
  | { kind: "item"; id: string; name: string };

function MenuManager({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("MenuManagerPage");
  const { data: menu, isLoading, isError } = useGetMenuQuery(restaurantId);
  const [deleteCategory, { isLoading: isDeletingCategory }] = useDeleteCategoryMutation();
  const [deleteItem, { isLoading: isDeletingItem }] = useDeleteItemMutation();
  const [toggleAvailability] = useToggleItemAvailabilityMutation();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const { toast } = useToast();

  function confirmPendingDelete() {
    if (!pendingDelete) return;
    const mutation =
      pendingDelete.kind === "category"
        ? deleteCategory({ restaurantId, categoryId: pendingDelete.id })
        : deleteItem({ restaurantId, itemId: pendingDelete.id });
    void mutation
      .unwrap()
      .then(() => setPendingDelete(null))
      .catch((err: unknown) => {
        setPendingDelete(null);
        toast({
          title: pendingDelete.kind === "category" ? t("couldNotDeleteCategory") : t("couldNotDeleteItem"),
          description: getErrorMessage(err),
          variant: "danger",
        });
      });
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError) return <Alert variant="danger">{t("couldNotLoadMenu")}</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <AddCategoryForm restaurantId={restaurantId} />

      {!menu || menu.length === 0 ? (
        <EmptyState title={t("noCategoriesYet")} description={t("addCategoryAbove")} />
      ) : (
        menu.map((category) => (
          <Card key={category._id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{category.name}</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setActiveCategoryId(category._id)}>
                  {t("addItem")}
                </Button>
                <IconButton
                  label={t("deleteCategory")}
                  size="sm"
                  variant="ghost"
                  onClick={() => setPendingDelete({ kind: "category", id: category._id, name: category.name })}
                  icon={<TrashIcon />}
                />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {category.items.length === 0 ? (
                <p className="text-sm text-text-muted">{t("noItemsInCategory")}</p>
              ) : (
                category.items.map((item) => (
                  <div
                    key={item._id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {item.imageUrl ? (
                        // A small dashboard thumbnail doesn't warrant next/image's layout machinery.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="size-12 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-secondary text-text-muted">
                          <PhotoIcon />
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-text">{item.name}</span>
                        <span className="text-sm text-text-muted">{item.price.toFixed(2)}</span>
                        <div className="flex flex-wrap gap-1">
                          {item.modifierGroups.length > 0 && (
                            <Badge variant="neutral" className="w-fit">
                              {t("modifierGroupCount", { count: item.modifierGroups.length })}
                            </Badge>
                          )}
                          {item.costPrice == null && (
                            <Badge variant="warning" className="w-fit">
                              {t("noCostPriceSet")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={item.isAvailable}
                        onChange={() => void toggleAvailability({ restaurantId, itemId: item._id })}
                        label={t("itemAvailable", { name: item.name })}
                        hideLabel
                      />
                      <IconButton
                        label={t("editItem")}
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingItem(item)}
                        icon={
                          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
                            <path
                              d="M11 2l3 3-8 8H3v-3l8-8z"
                              stroke="currentColor"
                              strokeWidth="1.3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        }
                      />
                      <IconButton
                        label={t("deleteItem")}
                        size="sm"
                        variant="ghost"
                        onClick={() => setPendingDelete({ kind: "item", id: item._id, name: item.name })}
                        icon={<TrashIcon />}
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
        <ItemFormModal
          restaurantId={restaurantId}
          categoryId={activeCategoryId}
          open={!!activeCategoryId}
          onClose={() => setActiveCategoryId(null)}
        />
      )}

      {editingItem && (
        <ItemFormModal
          restaurantId={restaurantId}
          categoryId={editingItem.categoryId}
          item={editingItem}
          open={!!editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmPendingDelete}
        title={pendingDelete ? t("deleteConfirmTitle", { name: pendingDelete.name }) : ""}
        description={
          pendingDelete?.kind === "category" ? t("deleteCategoryDescription") : t("cannotBeUndone")
        }
        confirmLabel={t("delete")}
        isLoading={isDeletingCategory || isDeletingItem}
      />
    </div>
  );
}

function AddCategoryForm({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("MenuManagerPage");
  const [name, setName] = useState("");
  const [createCategory, { isLoading }] = useCreateCategoryMutation();
  const { toast } = useToast();

  async function handleAdd() {
    if (!name.trim()) return;
    try {
      await createCategory({ restaurantId, body: { name: name.trim() } }).unwrap();
      setName("");
    } catch (err) {
      toast({ title: t("couldNotAddCategory"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <div className="flex gap-2">
      <Input
        placeholder={t("newCategoryPlaceholder")}
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
        {t("addCategory")}
      </Button>
    </div>
  );
}

export default function MenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("MenuManagerPage");
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <Container className="max-w-3xl py-10">
        <h1 className="mb-6 text-2xl font-bold text-text">{t("manageMenu")}</h1>
        <MenuManager restaurantId={id} />
      </Container>
    </RequireRole>
  );
}
