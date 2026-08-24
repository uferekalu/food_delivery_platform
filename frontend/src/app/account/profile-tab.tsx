"use client";

import { useState } from "react";
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
const profileSchema = z.object({
  name: z.string().min(2, "Enter your full name").max(100),
  phone: z.union([z.literal(""), z.string().regex(PHONE_RULE, "Enter a valid phone number, digits only")]),
});
type ProfileValues = z.infer<typeof profileSchema>;

const PASSWORD_RULE = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z
      .string()
      .min(8, "At least 8 characters")
      .max(72)
      .regex(PASSWORD_RULE, "Include an uppercase letter, a lowercase letter, and a number"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type PasswordValues = z.infer<typeof passwordSchema>;

function ProfileForm() {
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
      toast({ title: "Profile updated", variant: "success" });
    } catch (err) {
      toast({ title: "Couldn't update profile", description: getErrorMessage(err), variant: "danger" });
    }
  }

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your name and photo are shown across the platform.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-4" noValidate>
          <ImageUpload label="Photo" folder="avatars" value={avatarUrl} onChange={setAvatarUrl} />
          <FormField label="Full name" error={errors.name?.message} required>
            <Input {...register("name")} />
          </FormField>
          <FormField label="Phone" error={errors.phone?.message} hint="Used for SMS delivery updates">
            <Input type="tel" placeholder="+15551234567" {...register("phone")} />
          </FormField>
          <FormField label="Email">
            <div className="flex items-center gap-2">
              <Input value={user.email} disabled />
              <Badge variant={user.isEmailVerified ? "success" : "warning"}>
                {user.isEmailVerified ? "Verified" : "Unverified"}
              </Badge>
            </div>
          </FormField>
          <Button type="submit" isLoading={isLoading} className="self-start">
            Save changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ChangePasswordForm() {
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
        title: "Password changed",
        description: "You'll need to log in again on your other devices.",
        variant: "success",
      });
    } catch (err) {
      toast({ title: "Couldn't change password", description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Change your password. This signs you out everywhere else.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-4" noValidate>
          <FormField label="Current password" error={errors.currentPassword?.message} required>
            <Input type="password" autoComplete="current-password" {...register("currentPassword")} />
          </FormField>
          <FormField
            label="New password"
            error={errors.newPassword?.message}
            hint={!errors.newPassword ? "At least 8 characters, with upper/lowercase letters and a number" : undefined}
            required
          >
            <Input type="password" autoComplete="new-password" {...register("newPassword")} />
          </FormField>
          <FormField label="Confirm new password" error={errors.confirmPassword?.message} required>
            <Input type="password" autoComplete="new-password" {...register("confirmPassword")} />
          </FormField>
          <Button type="submit" isLoading={isLoading} className="self-start">
            Change password
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
