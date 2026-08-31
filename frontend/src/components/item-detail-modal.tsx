"use client";

import { useState } from "react";
import NextLink from "next/link";
import { Modal } from "@/components/ui/modal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { useAddCartItemMutation } from "@/lib/redux/services/cart-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { MenuItem, ModifierGroup } from "@/lib/redux/restaurant-types";

interface ItemDetailModalProps {
  item: MenuItem;
  currency: string;
  open: boolean;
  onClose: () => void;
}

function isConflictError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: unknown }).status === 409;
}

function ModifierGroupFields({
  group,
  selected,
  onToggle,
}: {
  group: ModifierGroup;
  selected: string[];
  onToggle: (optionName: string) => void;
}) {
  const isSingleChoice = group.max === 1;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-text">
        {group.name}
        {group.min > 0 && <span className="ml-1 text-danger">*</span>}
        <span className="ml-2 text-xs font-normal text-text-muted">
          {group.min === group.max ? `Choose ${group.min}` : `Choose ${group.min}–${group.max}`}
        </span>
      </legend>
      {group.options.map((option) => {
        const checked = selected.includes(option.name);
        const disabled = !checked && !isSingleChoice && selected.length >= group.max;
        return (
          <label
            key={option.name}
            className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm has-checked:border-primary has-disabled:cursor-not-allowed has-disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              <input
                type={isSingleChoice ? "radio" : "checkbox"}
                name={isSingleChoice ? group.name : undefined}
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(option.name)}
                className="accent-(--color-primary)"
              />
              {option.name}
            </span>
            {option.priceDelta > 0 && (
              <span className="text-text-muted">+{option.priceDelta.toFixed(2)}</span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}

export function ItemDetailModal({ item, currency, open, onClose }: ItemDetailModalProps) {
  const { status } = useAppSelector((state) => state.auth);
  const [addCartItem, { isLoading }] = useAddCartItemMutation();
  const { toast } = useToast();
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [confirmingReplace, setConfirmingReplace] = useState(false);

  function toggleOption(group: ModifierGroup, optionName: string) {
    setSelections((prev) => {
      const current = prev[group.name] ?? [];
      if (group.max === 1) {
        return { ...prev, [group.name]: current.includes(optionName) ? [] : [optionName] };
      }
      const next = current.includes(optionName)
        ? current.filter((name) => name !== optionName)
        : current.length < group.max
          ? [...current, optionName]
          : current;
      return { ...prev, [group.name]: next };
    });
  }

  const unitPrice =
    item.price +
    item.modifierGroups.reduce((sum, group) => {
      const picks = selections[group.name] ?? [];
      return (
        sum +
        picks.reduce((s, optionName) => {
          const option = group.options.find((o) => o.name === optionName);
          return s + (option?.priceDelta ?? 0);
        }, 0)
      );
    }, 0);

  const allGroupsValid = item.modifierGroups.every((group) => {
    const count = (selections[group.name] ?? []).length;
    return count >= group.min && count <= group.max;
  });

  async function submit(replace = false) {
    const selectedModifiers = Object.entries(selections).flatMap(([groupName, optionNames]) =>
      optionNames.map((optionName) => ({ groupName, optionName })),
    );
    try {
      await addCartItem({
        menuItemId: item._id,
        qty,
        selectedModifiers,
        notes: notes.trim() || undefined,
        replace,
      }).unwrap();
      toast({ title: "Added to cart", variant: "success" });
      setConfirmingReplace(false);
      onClose();
    } catch (err) {
      if (isConflictError(err)) {
        setConfirmingReplace(true);
        return;
      }
      toast({ title: "Couldn't add to cart", description: getErrorMessage(err), variant: "danger" });
    }
  }

  if (confirmingReplace) {
    return (
      <Modal
        open={open}
        onClose={() => setConfirmingReplace(false)}
        title="Start a new cart?"
        description="Your cart has items from a different restaurant. Adding this item will clear it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingReplace(false)}>
              Cancel
            </Button>
            <Button variant="destructive" isLoading={isLoading} onClick={() => void submit(true)}>
              Clear cart and add
            </Button>
          </>
        }
      />
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={item.name} description={item.description || undefined} size="md">
      <div className="flex flex-col gap-5">
        {item.imageUrl && (
          // A menu item photo doesn't warrant next/image's layout machinery here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="-mt-1 h-40 w-full rounded-md object-cover" />
        )}
        {item.modifierGroups.map((group) => (
          <ModifierGroupFields
            key={group.name}
            group={group}
            selected={selections[group.name] ?? []}
            onToggle={(optionName) => toggleOption(group, optionName)}
          />
        ))}

        <FormField label="Notes (optional)">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="E.g. no onions"
          />
        </FormField>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text">Quantity</span>
          <div className="flex items-center gap-3">
            <IconButton
              label="Decrease quantity"
              size="sm"
              variant="outline"
              disabled={qty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              icon={
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
                  <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
            />
            <span className="w-6 text-center text-sm font-medium text-text">{qty}</span>
            <IconButton
              label="Increase quantity"
              size="sm"
              variant="outline"
              disabled={qty >= 20}
              onClick={() => setQty((q) => Math.min(20, q + 1))}
              icon={
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
            />
          </div>
        </div>

        {status === "authenticated" ? (
          <Button disabled={!allGroupsValid} isLoading={isLoading} onClick={() => void submit(false)}>
            Add to cart — {currency} {(unitPrice * qty).toFixed(2)}
          </Button>
        ) : (
          <NextLink href="/login" className={buttonVariants({ className: "w-full" })}>
            Log in to order
          </NextLink>
        )}
      </div>
    </Modal>
  );
}
