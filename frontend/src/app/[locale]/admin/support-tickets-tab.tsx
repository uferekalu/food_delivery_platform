"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useForm, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import {
  useListKnowledgeBaseEntriesQuery,
  useCreateKnowledgeBaseEntryMutation,
  useUpdateKnowledgeBaseEntryMutation,
  useDeleteKnowledgeBaseEntryMutation,
} from "@/lib/redux/services/knowledge-base-api";
import type { KnowledgeBaseEntry } from "@/lib/redux/services/knowledge-base-api";
import {
  useListSupportTicketsQuery,
  useResolveSupportTicketMutation,
  SUPPORT_TICKET_STATUSES,
} from "@/lib/redux/services/support-tickets-api";
import type { SupportTicket, SupportTicketStatus } from "@/lib/redux/services/support-tickets-api";
import { getErrorMessage } from "@/lib/redux/error";

const STATUS_BADGE_VARIANT: Record<SupportTicketStatus, BadgeProps["variant"]> = {
  open: "warning",
  resolved: "success",
};

const keywordsToArray = (raw: string) =>
  raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

function knowledgeBaseSchema(t: (key: string) => string) {
  return z.object({
    question: z.string().min(3, t("atLeast3Chars")),
    answer: z.string().min(3, t("atLeast3Chars")),
    keywords: z.string().min(1, t("atLeastOneKeyword")).refine((v) => keywordsToArray(v).length > 0, t("atLeastOneKeyword")),
    category: z.string().min(2, t("atLeast2Chars")),
  });
}

type KnowledgeBaseFormValues = z.infer<ReturnType<typeof knowledgeBaseSchema>>;

function KnowledgeBaseFormFields({
  register,
  errors,
}: {
  register: UseFormRegister<KnowledgeBaseFormValues>;
  errors: FieldErrors<KnowledgeBaseFormValues>;
}) {
  const t = useTranslations("AdminSupportTab");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField label={t("question")} error={errors.question?.message} required className="sm:col-span-2">
        <Input placeholder={t("questionPlaceholder")} {...register("question")} />
      </FormField>
      <FormField label={t("answer")} error={errors.answer?.message} required className="sm:col-span-2">
        <Textarea rows={3} placeholder={t("answerPlaceholder")} {...register("answer")} />
      </FormField>
      <FormField label={t("keywords")} error={errors.keywords?.message} hint={t("keywordsHint")} required>
        <Input placeholder={t("keywordsPlaceholder")} {...register("keywords")} />
      </FormField>
      <FormField label={t("category")} error={errors.category?.message} required>
        <Input placeholder={t("categoryPlaceholder")} {...register("category")} />
      </FormField>
    </div>
  );
}

function CreateKnowledgeBaseForm() {
  const t = useTranslations("AdminSupportTab");
  const { toast } = useToast();
  const [createEntry, { isLoading }] = useCreateKnowledgeBaseEntryMutation();
  const schema = knowledgeBaseSchema(t);
  type Values = z.infer<typeof schema>;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function submit(values: Values) {
    try {
      await createEntry({ ...values, keywords: keywordsToArray(values.keywords) }).unwrap();
      reset({ question: "", answer: "", keywords: "", category: "" });
      toast({ title: t("entryCreated"), variant: "success" });
    } catch (err) {
      toast({ title: t("couldNotCreateEntry"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("addFaqEntry")}</CardTitle>
        <CardDescription>{t("addFaqEntryDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-4" noValidate>
          <KnowledgeBaseFormFields register={register} errors={errors} />
          <Button type="submit" isLoading={isLoading} className="self-start">
            {t("addFaqEntry")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EditKnowledgeBaseModal({
  entry,
  open,
  onClose,
}: {
  entry: KnowledgeBaseEntry | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("AdminSupportTab");
  const { toast } = useToast();
  const [updateEntry, { isLoading }] = useUpdateKnowledgeBaseEntryMutation();
  const schema = knowledgeBaseSchema(t);
  type Values = z.infer<typeof schema>;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    values: entry
      ? { question: entry.question, answer: entry.answer, keywords: entry.keywords.join(", "), category: entry.category }
      : undefined,
  });

  async function submit(values: Values) {
    if (!entry) return;
    try {
      await updateEntry({ id: entry._id, body: { ...values, keywords: keywordsToArray(values.keywords) } }).unwrap();
      toast({ title: t("entryUpdated"), variant: "success" });
      onClose();
    } catch (err) {
      toast({ title: t("couldNotUpdateEntry"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  if (!entry) return null;

  return (
    <Modal open={open} onClose={onClose} title={t("editFaqEntry")}>
      <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-4" noValidate>
        <KnowledgeBaseFormFields register={register} errors={errors} />
        <Button type="submit" isLoading={isLoading} className="self-start">
          {t("saveChanges")}
        </Button>
      </form>
    </Modal>
  );
}

function KnowledgeBaseRow({
  entry,
  onEdit,
}: {
  entry: KnowledgeBaseEntry;
  onEdit: (entry: KnowledgeBaseEntry) => void;
}) {
  const t = useTranslations("AdminSupportTab");
  const { toast } = useToast();
  const [updateEntry] = useUpdateKnowledgeBaseEntryMutation();
  const [deleteEntry, { isLoading: deleting }] = useDeleteKnowledgeBaseEntryMutation();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text">{entry.question}</span>
          <Badge variant="neutral">{entry.category}</Badge>
        </div>
        <span className="line-clamp-1 text-xs text-text-muted">{entry.answer}</span>
        <span className="text-xs text-text-muted">{entry.keywords.join(", ")}</span>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          label={t("toggleActive", { question: entry.question })}
          hideLabel
          checked={entry.isActive}
          onChange={(checked) =>
            void updateEntry({ id: entry._id, body: { isActive: checked } })
              .unwrap()
              .catch((err: unknown) =>
                toast({ title: t("couldNotUpdateEntry"), description: getErrorMessage(err), variant: "danger" }),
              )
          }
        />
        <Button size="sm" variant="outline" onClick={() => onEdit(entry)}>
          {t("edit")}
        </Button>
        <IconButton
          label={t("deleteEntry")}
          size="sm"
          variant="ghost"
          disabled={deleting}
          onClick={() => setConfirmingDelete(true)}
          icon={
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
        />
      </div>
      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => {
          void deleteEntry(entry._id)
            .unwrap()
            .then(() => setConfirmingDelete(false))
            .catch((err: unknown) => {
              setConfirmingDelete(false);
              toast({ title: t("couldNotDeleteEntry"), description: getErrorMessage(err), variant: "danger" });
            });
        }}
        title={t("deleteEntryTitle")}
        description={t("deleteEntryDescription")}
        confirmLabel={t("delete")}
        isLoading={deleting}
      />
    </div>
  );
}

function KnowledgeBaseSection() {
  const t = useTranslations("AdminSupportTab");
  const { data, isLoading } = useListKnowledgeBaseEntriesQuery();
  const [editing, setEditing] = useState<KnowledgeBaseEntry | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <CreateKnowledgeBaseForm />
      <Card>
        <CardHeader>
          <CardTitle>{t("faqEntries")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !data || data.length === 0 ? (
            <EmptyState title={t("noFaqEntriesYet")} description={t("addOneAboveDescription")} />
          ) : (
            data.map((entry) => <KnowledgeBaseRow key={entry._id} entry={entry} onEdit={setEditing} />)
          )}
        </CardContent>
      </Card>
      <EditKnowledgeBaseModal entry={editing} open={editing !== null} onClose={() => setEditing(null)} />
    </div>
  );
}

function SupportTicketRow({ ticket }: { ticket: SupportTicket }) {
  const t = useTranslations("AdminSupportTab");
  const locale = useLocale();
  const [resolve, { isLoading }] = useResolveSupportTicketMutation();
  const { toast } = useToast();

  return (
    <div className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-text">{ticket.question}</span>
        <span className="text-xs text-text-muted">
          {new Date(ticket.createdAt).toLocaleString(locale)} ·{" "}
          {ticket.userId ? t("fromAccount") : t("fromGuest")}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant={STATUS_BADGE_VARIANT[ticket.status]}>{t(`ticketStatus_${ticket.status}`)}</Badge>
        {ticket.status === "open" && (
          <Button
            size="sm"
            isLoading={isLoading}
            onClick={() =>
              void resolve(ticket._id)
                .unwrap()
                .catch((err: unknown) =>
                  toast({ title: t("couldNotResolveTicket"), description: getErrorMessage(err), variant: "danger" }),
                )
            }
          >
            {t("markResolved")}
          </Button>
        )}
      </div>
    </div>
  );
}

function SupportTicketsSection() {
  const t = useTranslations("AdminSupportTab");
  const [status, setStatus] = useState<SupportTicketStatus | "">("open");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListSupportTicketsQuery({
    status: status || undefined,
    page,
    limit: 20,
  });

  const statusOptions = [
    { value: "", label: t("allStatuses") },
    ...SUPPORT_TICKET_STATUSES.map((s) => ({ value: s, label: t(`ticketStatus_${s}`) })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Select
        options={statusOptions}
        value={status}
        onChange={(v) => {
          setPage(1);
          setStatus(v as SupportTicketStatus | "");
        }}
        className="w-full sm:w-48"
        aria-label={t("filterByStatus")}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("supportQuestions")}</CardTitle>
          <CardDescription>{t("supportQuestionsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !data || data.items.length === 0 ? (
            <EmptyState title={t("noTicketsFound")} description={t("noTicketsFoundDescription")} />
          ) : (
            data.items.map((ticket) => <SupportTicketRow key={ticket._id} ticket={ticket} />)
          )}
        </CardContent>
      </Card>
      {data && data.totalPages > 1 && (
        <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
      )}
    </div>
  );
}

export function SupportTicketsTab() {
  const t = useTranslations("AdminSupportTab");
  return (
    <div className="flex flex-col gap-8">
      <SupportTicketsSection />
      <div>
        <h2 className="mb-4 text-lg font-semibold text-text">{t("knowledgeBase")}</h2>
        <KnowledgeBaseSection />
      </div>
    </div>
  );
}
