"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  useListUsersQuery,
  useSuspendUserMutation,
  useReactivateUserMutation,
  useUpdateUserRoleMutation,
} from "@/lib/redux/services/users-api";
import { getErrorMessage } from "@/lib/redux/error";
import { USER_ROLES } from "@/lib/constants/roles";
import type { UserRole, UserStatus } from "@/lib/constants/roles";
import type { AdminUser } from "@/lib/redux/restaurant-types";

function SuspendModal({
  user,
  open,
  onClose,
}: {
  user: AdminUser | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("AdminUsersTab");
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [suspendUser, { isLoading }] = useSuspendUserMutation();

  function handleClose() {
    setReason("");
    onClose();
  }

  async function handleSuspend() {
    if (!user || reason.trim().length < 3) return;
    try {
      await suspendUser({ id: user.id, reason: reason.trim() }).unwrap();
      toast({ title: t("userSuspended"), variant: "success" });
      handleClose();
    } catch (err) {
      toast({
        title: t("couldNotSuspendUser"),
        description: getErrorMessage(err),
        variant: "danger",
      });
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={user ? t("suspendUserTitle", { name: user.name }) : ""}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} type="button">
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            isLoading={isLoading}
            disabled={reason.trim().length < 3}
            onClick={() => void handleSuspend()}
          >
            {t("suspendUser")}
          </Button>
        </>
      }
    >
      <FormField label={t("reason")} hint={t("reasonHint")} required>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
      </FormField>
    </Modal>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const t = useTranslations("AdminUsersTab");
  const tRole = useTranslations("UserRole");
  const { toast } = useToast();
  const [suspendTarget, setSuspendTarget] = useState<AdminUser | null>(null);
  const [confirmingReactivate, setConfirmingReactivate] = useState(false);
  const [reactivateUser, { isLoading: reactivating }] = useReactivateUserMutation();
  const [updateRole, { isLoading: updatingRole }] = useUpdateUserRoleMutation();

  const roleOptions = USER_ROLES.map((role) => ({ value: role, label: tRole(role) }));

  function confirmReactivate() {
    void reactivateUser(user.id)
      .unwrap()
      .then(() => {
        setConfirmingReactivate(false);
        toast({ title: t("userReactivated"), variant: "success" });
      })
      .catch((err: unknown) => {
        setConfirmingReactivate(false);
        toast({
          title: t("couldNotReactivateUser"),
          description: getErrorMessage(err),
          variant: "danger",
        });
      });
  }

  function handleRoleChange(role: string) {
    if (role === user.role) return;
    void updateRole({ id: user.id, role: role as UserRole })
      .unwrap()
      .catch((err: unknown) =>
        toast({
          title: t("couldNotUpdateRole"),
          description: getErrorMessage(err),
          variant: "danger",
        }),
      );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text">{user.name}</span>
            <Badge variant={user.status === "active" ? "success" : "danger"}>
              {user.status === "active" ? t("active") : t("suspended")}
            </Badge>
          </div>
          <span className="text-sm text-text-muted">{user.email}</span>
          <span className="text-xs text-text-muted">
            {t("joined", { date: new Date(user.createdAt).toLocaleDateString() })}
          </span>
          {user.status === "suspended" && user.suspendedReason && (
            <span className="text-xs text-danger">
              {t("suspendedBecause", { reason: user.suspendedReason })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            options={roleOptions}
            value={user.role}
            onChange={handleRoleChange}
            disabled={updatingRole}
            className="w-40"
            aria-label={t("changeRoleFor", { name: user.name })}
          />
          {user.status === "active" ? (
            <Button size="sm" variant="destructive" onClick={() => setSuspendTarget(user)}>
              {t("suspend")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              isLoading={reactivating}
              onClick={() => setConfirmingReactivate(true)}
            >
              {t("reactivate")}
            </Button>
          )}
        </div>
      </CardContent>
      <SuspendModal
        user={suspendTarget}
        open={suspendTarget !== null}
        onClose={() => setSuspendTarget(null)}
      />
      <ConfirmDialog
        open={confirmingReactivate}
        onClose={() => setConfirmingReactivate(false)}
        onConfirm={confirmReactivate}
        title={t("reactivateUserTitle", { name: user.name })}
        description={t("reactivateUserDescription")}
        confirmLabel={t("reactivate")}
        variant="primary"
        isLoading={reactivating}
      />
    </Card>
  );
}

export function UsersTab() {
  const t = useTranslations("AdminUsersTab");
  const tRole = useTranslations("UserRole");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useListUsersQuery({
    search: search || undefined,
    role: role || undefined,
    status: status || undefined,
    page,
    limit: 20,
  });

  const roleOptions = [
    { value: "", label: t("allRoles") },
    ...USER_ROLES.map((r) => ({ value: r, label: tRole(r) })),
  ];
  const statusOptions = [
    { value: "", label: t("allStatuses") },
    { value: "active", label: t("active") },
    { value: "suspended", label: t("suspended") },
  ];

  function resetAndSet<T>(setter: (v: T) => void) {
    return (v: T) => {
      setPage(1);
      setter(v);
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => resetAndSet<string>(setSearch)(e.target.value)}
          className="flex-1"
        />
        <Select
          options={roleOptions}
          value={role}
          onChange={(v) => resetAndSet<UserRole | "">(setRole)(v as UserRole | "")}
          className="w-40"
          aria-label={t("filterByRole")}
        />
        <Select
          options={statusOptions}
          value={status}
          onChange={(v) => resetAndSet<UserStatus | "">(setStatus)(v as UserStatus | "")}
          className="w-40"
          aria-label={t("filterByStatus")}
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title={t("noUsersFound")} description={t("tryDifferentFilters")} />
      ) : (
        <>
          <div className={`flex flex-col gap-3 ${isFetching ? "opacity-60" : ""}`}>
            {data.items.map((user) => (
              <UserRow key={user.id} user={user} />
            ))}
          </div>
          {data.totalPages > 1 && (
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}
