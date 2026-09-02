"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { ImageUpload } from "@/components/ui/image-upload";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { useUpdateProfileMutation } from "@/lib/redux/services/account-api";
import { useChangePasswordMutation } from "@/lib/redux/services/auth-api";
import { getErrorMessage } from "@/lib/redux/error";

const PHONE_RULE = /^\+?[1-9]\d{6,14}$/;
const PASSWORD_RULE = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

function ProfileForm() {
  const t = useTranslations("AccountPage");
  const profileSchema = z.object({
    name: z.string().min(2, t("enterFullName")).max(100),
    phone: z.union([z.literal(""), z.string().regex(PHONE_RULE, t("enterValidPhone"))]),
  });
  type ProfileValues = z.infer<typeof profileSchema>;
  const { user } = useAppSelector((state) => state.auth);
  const { toast } = useToast();
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? undefined);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? "", phone: user?.phone ?? "" },
  });

  async function submit(values: ProfileValues) {
    try {
      await updateProfile({
        name: values.name,
        ...(values.phone ? { phone: values.phone } : {}),
        ...(avatarUrl && avatarUrl !== user?.avatarUrl ? { avatarUrl } : {}),
      }).unwrap();
      toast({ title: t("profileUpdated"), variant: "success" });
    } catch (err) {
      toast({ title: t("couldNotUpdateProfile"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile")}</CardTitle>
        <CardDescription>{t("nameAndPhotoDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-4" noValidate>
          <ImageUpload label={t("photo")} folder="avatars" value={avatarUrl} onChange={setAvatarUrl} />
          <FormField label={t("fullName")} error={errors.name?.message} required>
            <Input {...register("name")} />
          </FormField>
          <FormField label={t("phone")} error={errors.phone?.message} hint={t("phoneHint")}>
            <Input type="tel" placeholder="+15551234567" {...register("phone")} />
          </FormField>
          <FormField label={t("email")}>
            <div className="flex items-center gap-2">
              <Input value={user.email} disabled />
              <Badge variant={user.isEmailVerified ? "success" : "warning"}>
                {user.isEmailVerified ? t("verified") : t("unverified")}
              </Badge>
            </div>
          </FormField>
          <Button type="submit" isLoading={isLoading} className="self-start">
            {t("saveChanges")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ChangePasswordForm() {
  const t = useTranslations("AccountPage");
  const passwordSchema = z
    .object({
      currentPassword: z.string().min(1, t("required")),
      newPassword: z
        .string()
        .min(8, t("atLeast8Chars"))
        .max(72)
        .regex(PASSWORD_RULE, t("passwordComplexity")),
      confirmPassword: z.string(),
    })
    .refine((values) => values.newPassword === values.confirmPassword, {
      message: t("passwordsDontMatch"),
      path: ["confirmPassword"],
    });
  type PasswordValues = z.infer<typeof passwordSchema>;
  const { toast } = useToast();
  const [changePassword, { isLoading }] = useChangePasswordMutation();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  async function submit(values: PasswordValues) {
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }).unwrap();
      reset();
      toast({
        title: t("passwordChanged"),
        description: t("logInAgainOtherDevices"),
        variant: "success",
      });
    } catch (err) {
      toast({ title: t("couldNotChangePassword"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("password")}</CardTitle>
        <CardDescription>{t("changePasswordDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-4" noValidate>
          <FormField label={t("currentPassword")} error={errors.currentPassword?.message} required>
            <Input type="password" autoComplete="current-password" {...register("currentPassword")} />
          </FormField>
          <FormField
            label={t("newPassword")}
            error={errors.newPassword?.message}
            hint={!errors.newPassword ? t("passwordHint") : undefined}
            required
          >
            <Input type="password" autoComplete="new-password" {...register("newPassword")} />
          </FormField>
          <FormField label={t("confirmNewPassword")} error={errors.confirmPassword?.message} required>
            <Input type="password" autoComplete="new-password" {...register("confirmPassword")} />
          </FormField>
          <Button type="submit" isLoading={isLoading} className="self-start">
            {t("changePassword")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function ProfileTab() {
  return (
    <div className="flex flex-col gap-6">
      <ProfileForm />
      <ChangePasswordForm />
    </div>
  );
}
