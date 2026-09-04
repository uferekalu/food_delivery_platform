"use client";

import { use, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useForm, Controller } from "react-hook-form";
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
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/ui/money-input";
import { ImageUpload } from "@/components/ui/image-upload";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  useGetStoreCatalogQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useToggleProductAvailabilityMutation,
} from "@/lib/redux/services/store-catalog-api";
import { useGetMyStoresQuery } from "@/lib/redux/services/stores-api";
import { getErrorMessage } from "@/lib/redux/error";
import { formatMoney } from "@/lib/currency";
import type { Product, ProductCategory } from "@/lib/redux/restaurant-types";

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

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface ProductFormInput {
  name: string;
  description?: string;
  price: unknown;
  discountedPrice?: unknown;
  costPrice?: unknown;
  unit?: string;
  stockQuantity?: unknown;
}

function ProductFormModal({
  storeId,
  categoryId,
  currency,
  product,
  open,
  onClose,
}: {
  storeId: string;
  categoryId: string;
  currency: string;
  product?: Product;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("CatalogManagerPage");
  const locale = useLocale();
  const [createProduct, { isLoading: isCreating }] = useCreateProductMutation();
  const [updateProduct, { isLoading: isUpdating }] = useUpdateProductMutation();
  const { toast } = useToast();
  const isEditing = Boolean(product);
  const [imageUrl, setImageUrl] = useState<string | undefined>(product?.imageUrl ?? undefined);

  const productSchema = z
    .object({
      name: z.string().min(1, t("required")).max(100),
      description: z.string().max(1000).optional(),
      price: z.coerce.number().min(0, t("mustBe0OrMore")),
      // See MenuManagerPage's costPrice for why blank must preprocess to undefined rather than
      // coerce to 0 — "left blank" and "explicitly 0" need to stay distinguishable.
      discountedPrice: z.preprocess(
        (val) => (val === "" || val === undefined ? undefined : val),
        z.coerce.number().min(0, t("mustBe0OrMore")).optional(),
      ),
      costPrice: z.preprocess(
        (val) => (val === "" || val === undefined ? undefined : val),
        z.coerce.number().min(0, t("mustBe0OrMore")).optional(),
      ),
      unit: z.string().max(50).optional(),
      stockQuantity: z.preprocess(
        (val) => (val === "" || val === undefined ? undefined : val),
        z.coerce.number().int().min(0, t("mustBe0OrMore")).optional(),
      ),
    })
    .refine((v) => v.discountedPrice === undefined || v.discountedPrice < v.price, {
      message: t("discountedPriceMustBeLower"),
      path: ["discountedPrice"],
    });
  type ProductFormValues = z.output<typeof productSchema>;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: product
      ? {
          name: product.name,
          description: product.description,
          price: product.price,
          discountedPrice: product.discountedPrice ?? undefined,
          costPrice: product.costPrice ?? undefined,
          unit: product.unit ?? undefined,
          stockQuantity: product.stockQuantity ?? undefined,
        }
      : { name: "", description: "", price: 0 },
  });

  const submit = async (values: ProductFormValues) => {
    try {
      if (isEditing && product) {
        await updateProduct({ storeId, productId: product._id, body: { ...values, imageUrl } }).unwrap();
      } else {
        await createProduct({ storeId, body: { categoryId, ...values, imageUrl } }).unwrap();
      }
      reset();
      onClose();
    } catch (err) {
      toast({
        title: isEditing ? t("couldNotUpdateProduct") : t("couldNotAddProduct"),
        description: getErrorMessage(err),
        variant: "danger",
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? t("editProduct") : t("addProduct")}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} type="button">
            {t("cancel")}
          </Button>
          <Button type="submit" form="product-form" isLoading={isCreating || isUpdating}>
            {t("saveProduct")}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-4" noValidate>
        <ImageUpload label={t("photo")} folder="products" value={imageUrl} onChange={setImageUrl} hint={t("photoHint")} />
        <FormField label={t("name")} error={errors.name?.message} required>
          <Input {...register("name")} />
        </FormField>
        <FormField label={t("description")} error={errors.description?.message}>
          <Textarea {...register("description")} rows={3} />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("price")} error={errors.price?.message} required>
            <Controller
              control={control}
              name="price"
              render={({ field }) => (
                <MoneyInput
                  value={field.value as number | undefined}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  currencyCode={currency}
                  locale={locale}
                />
              )}
            />
          </FormField>
          <FormField label={t("discountedPrice")} error={errors.discountedPrice?.message} hint={t("discountedPriceHint")}>
            <Controller
              control={control}
              name="discountedPrice"
              render={({ field }) => (
                <MoneyInput
                  value={field.value as number | undefined}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  currencyCode={currency}
                  locale={locale}
                />
              )}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("costPrice")} error={errors.costPrice?.message} hint={t("costPriceHint")}>
            <Controller
              control={control}
              name="costPrice"
              render={({ field }) => (
                <MoneyInput
                  value={field.value as number | undefined}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  currencyCode={currency}
                  locale={locale}
                />
              )}
            />
          </FormField>
          <FormField label={t("unit")} error={errors.unit?.message} hint={t("unitHint")}>
            <Input {...register("unit")} />
          </FormField>
        </div>
        <FormField label={t("stockQuantity")} error={errors.stockQuantity?.message} hint={t("stockQuantityHint")}>
          <Input type="number" step="1" min="0" {...register("stockQuantity")} />
        </FormField>
      </form>
    </Modal>
  );
}

type PendingDelete =
  | { kind: "category"; id: string; name: string }
  | { kind: "product"; id: string; name: string };

function ProductRow({
  product,
  currency,
  locale,
  onEdit,
  onDelete,
  onToggle,
}: {
  product: Product;
  currency: string;
  locale: string;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const t = useTranslations("CatalogManagerPage");

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-3">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt="" className="size-12 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-secondary text-text-muted">
            <PhotoIcon />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <span className="font-medium text-text">{product.name}</span>
          <span className="text-sm text-text-muted">
            {product.discountedPrice != null ? (
              <>
                <span className="line-through">{formatMoney(product.price, currency, locale)}</span>{" "}
                <span className="text-text">{formatMoney(product.discountedPrice, currency, locale)}</span>
              </>
            ) : (
              formatMoney(product.price, currency, locale)
            )}
            {product.unit ? ` · ${product.unit}` : ""}
          </span>
          <div className="flex flex-wrap gap-1">
            {product.stockQuantity != null && (
              <Badge variant={product.stockQuantity > 0 ? "neutral" : "danger"} className="w-fit">
                {t("stockCount", { count: product.stockQuantity })}
              </Badge>
            )}
            {product.costPrice == null && (
              <Badge variant="warning" className="w-fit">
                {t("noCostPriceSet")}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          checked={product.isAvailable}
          onChange={onToggle}
          label={t("productAvailable", { name: product.name })}
          hideLabel
        />
        <IconButton label={t("editProduct")} size="sm" variant="ghost" onClick={onEdit} icon={<EditIcon />} />
        <IconButton label={t("deleteProduct")} size="sm" variant="ghost" onClick={onDelete} icon={<TrashIcon />} />
      </div>
    </div>
  );
}

function childrenOf(categories: ProductCategory[], parentId: string | null): ProductCategory[] {
  return categories.filter((c) => c.parentCategoryId === parentId).sort((a, b) => a.sortOrder - b.sortOrder);
}

function CategoryNode({
  storeId,
  category,
  categories,
  products,
  currency,
  locale,
  onAddProduct,
  onEditProduct,
  onDeletePending,
}: {
  storeId: string;
  category: ProductCategory;
  categories: ProductCategory[];
  products: Product[];
  currency: string;
  locale: string;
  onAddProduct: (categoryId: string) => void;
  onEditProduct: (product: Product) => void;
  onDeletePending: (pending: PendingDelete) => void;
}) {
  const t = useTranslations("CatalogManagerPage");
  const [toggleAvailability] = useToggleProductAvailabilityMutation();
  const children = childrenOf(categories, category._id);
  const ownProducts = products
    .filter((p) => p.categoryId === category._id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{category.name}</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onAddProduct(category._id)}>
            {t("addProduct")}
          </Button>
          <IconButton
            label={t("deleteCategory")}
            size="sm"
            variant="ghost"
            onClick={() => onDeletePending({ kind: "category", id: category._id, name: category.name })}
            icon={<TrashIcon />}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {ownProducts.length === 0 ? (
          <p className="text-sm text-text-muted">{t("noItemsInCategory")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {ownProducts.map((product) => (
              <ProductRow
                key={product._id}
                product={product}
                currency={currency}
                locale={locale}
                onEdit={() => onEditProduct(product)}
                onDelete={() => onDeletePending({ kind: "product", id: product._id, name: product.name })}
                onToggle={() => void toggleAvailability({ storeId, productId: product._id })}
              />
            ))}
          </div>
        )}
        {children.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-border pt-4 pl-4">
            {children.map((child) => (
              <CategoryNode
                key={child._id}
                storeId={storeId}
                category={child}
                categories={categories}
                products={products}
                currency={currency}
                locale={locale}
                onAddProduct={onAddProduct}
                onEditProduct={onEditProduct}
                onDeletePending={onDeletePending}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddCategoryForm({ storeId, categories }: { storeId: string; categories: ProductCategory[] }) {
  const t = useTranslations("CatalogManagerPage");
  const [name, setName] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState("");
  const [createCategory, { isLoading }] = useCreateCategoryMutation();
  const { toast } = useToast();

  const parentOptions = [
    { value: "", label: t("topLevelCategory") },
    ...categories.map((c) => ({ value: c._id, label: c.name })),
  ];

  async function handleAdd() {
    if (!name.trim()) return;
    try {
      await createCategory({
        storeId,
        body: { name: name.trim(), parentCategoryId: parentCategoryId || undefined },
      }).unwrap();
      setName("");
      setParentCategoryId("");
    } catch (err) {
      toast({ title: t("couldNotAddCategory"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
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
        className="min-w-[180px] flex-1"
      />
      <Select
        options={parentOptions}
        value={parentCategoryId}
        onChange={setParentCategoryId}
        className="w-56"
        aria-label={t("parentCategory")}
      />
      <Button variant="outline" isLoading={isLoading} onClick={() => void handleAdd()}>
        {t("addCategory")}
      </Button>
    </div>
  );
}

function CatalogManager({ storeId }: { storeId: string }) {
  const t = useTranslations("CatalogManagerPage");
  const locale = useLocale();
  const { data: catalog, isLoading, isError } = useGetStoreCatalogQuery(storeId);
  const { data: stores, isLoading: isLoadingStore } = useGetMyStoresQuery();
  const store = stores?.find((s) => s._id === storeId);
  const [deleteCategory, { isLoading: isDeletingCategory }] = useDeleteCategoryMutation();
  const [deleteProduct, { isLoading: isDeletingProduct }] = useDeleteProductMutation();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const { toast } = useToast();

  function confirmPendingDelete() {
    if (!pendingDelete) return;
    const mutation =
      pendingDelete.kind === "category"
        ? deleteCategory({ storeId, categoryId: pendingDelete.id })
        : deleteProduct({ storeId, productId: pendingDelete.id });
    void mutation
      .unwrap()
      .then(() => setPendingDelete(null))
      .catch((err: unknown) => {
        setPendingDelete(null);
        toast({
          title: pendingDelete.kind === "category" ? t("couldNotDeleteCategory") : t("couldNotDeleteProduct"),
          description: getErrorMessage(err),
          variant: "danger",
        });
      });
  }

  if (isLoading || isLoadingStore) return <Skeleton className="h-64 w-full" />;
  if (isError || !catalog) return <Alert variant="danger">{t("couldNotLoadCatalog")}</Alert>;
  if (!store) return <Alert variant="danger">{t("couldNotLoadCatalog")}</Alert>;

  const topLevel = childrenOf(catalog.categories, null);

  return (
    <div className="flex flex-col gap-6">
      <AddCategoryForm storeId={storeId} categories={catalog.categories} />

      {topLevel.length === 0 ? (
        <EmptyState title={t("noCategoriesYet")} description={t("addCategoryAbove")} />
      ) : (
        topLevel.map((category) => (
          <CategoryNode
            key={category._id}
            storeId={storeId}
            category={category}
            categories={catalog.categories}
            products={catalog.products}
            currency={store.currency}
            locale={locale}
            onAddProduct={setActiveCategoryId}
            onEditProduct={setEditingProduct}
            onDeletePending={setPendingDelete}
          />
        ))
      )}

      {activeCategoryId && (
        <ProductFormModal
          storeId={storeId}
          categoryId={activeCategoryId}
          currency={store.currency}
          open={!!activeCategoryId}
          onClose={() => setActiveCategoryId(null)}
        />
      )}

      {editingProduct && (
        <ProductFormModal
          storeId={storeId}
          categoryId={editingProduct.categoryId}
          currency={store.currency}
          product={editingProduct}
          open={!!editingProduct}
          onClose={() => setEditingProduct(null)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmPendingDelete}
        title={pendingDelete ? t("deleteConfirmTitle", { name: pendingDelete.name }) : ""}
        description={pendingDelete?.kind === "category" ? t("deleteCategoryDescription") : t("cannotBeUndone")}
        confirmLabel={t("delete")}
        isLoading={isDeletingCategory || isDeletingProduct}
      />
    </div>
  );
}

export default function CatalogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("CatalogManagerPage");
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <Container className="max-w-3xl py-10">
        <h1 className="mb-6 text-2xl font-bold text-text">{t("manageCatalog")}</h1>
        <CatalogManager storeId={id} />
      </Container>
    </RequireRole>
  );
}
