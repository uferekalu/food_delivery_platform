"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import NextLink from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { buttonVariants } from "@/components/ui/button";
import { useVerifyEmailMutation, useLazyGetMeQuery } from "@/lib/redux/services/auth-api";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setCurrentUser } from "@/lib/redux/slices/auth-slice";
import { getErrorMessage } from "@/lib/redux/error";

function VerifyEmailStatus() {
  const token = useSearchParams().get("token");
  const dispatch = useAppDispatch();
  const isLoggedIn = useAppSelector((state) => state.auth.status === "authenticated");
  const [verifyEmail] = useVerifyEmailMutation();
  const [fetchMe] = useLazyGetMeQuery();
  // The "missing token" case is known synchronously from the URL at render time — computing
  // it as the initial state (rather than setState-ing it from inside the effect below) keeps
  // the effect's only setState calls in their legitimate spot: reacting to the async
  // verifyEmail request's outcome.
  const [state, setState] = useState<"loading" | "success" | "error">(() => (token ? "loading" : "error"));
  const [error, setError] = useState<string | null>(() =>
    token ? null : "This verification link is missing its token.",
  );
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    verifyEmail({ token })
      .unwrap()
      .then(async () => {
        setState("success");
        // Keep the header's "unverified" badge in sync if the user is signed in on this device.
        if (isLoggedIn) {
          const user = await fetchMe().unwrap();
          dispatch(setCurrentUser(user));
        }
      })
      .catch((err: unknown) => {
        setState("error");
        setError(getErrorMessage(err, "This verification link is invalid or has expired"));
      });
  }, [token, verifyEmail, fetchMe, dispatch, isLoggedIn]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>Confirming your email address.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 text-center">
        {state === "loading" && <Spinner size="lg" label="Verifying your email" />}
        {state === "success" && (
          <Alert variant="success" title="Email verified">
            Your email address has been confirmed.
          </Alert>
        )}
        {state === "error" && <Alert variant="danger">{error}</Alert>}
        {state !== "loading" && (
          <NextLink href="/" className={buttonVariants({ variant: "primary" })}>
            Continue
          </NextLink>
        )}
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailStatus />
    </Suspense>
  );
}
