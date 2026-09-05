"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as {
      error?: unknown;
    };

    return typeof data.error === "string"
      ? data.error
      : "ログインに失敗しました";
  } catch {
    return "ログインに失敗しました";
  }
}

function isOtpRequiredResponse(
  data: unknown
): data is { requires_otp: true; challenge_token: string } {
  if (data === null || typeof data !== "object") {
    return false;
  }

  const record = data as Record<string, unknown>;

  return (
    record.requires_otp === true &&
    typeof record.challenge_token === "string" &&
    record.challenge_token.length > 0
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/me", {
          signal: controller.signal,
        });

        if (response.ok) {
          router.replace("/");
          return;
        }
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
      } finally {
        setIsCheckingSession(false);
      }
    }

    void checkSession();

    return () => controller.abort();
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as unknown;

      if (isOtpRequiredResponse(data)) {
        setChallengeToken(data.challenge_token);
        setOtp("");
        return;
      }

      router.replace("/");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "ログインに失敗しました"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (isSubmitting || !challengeToken) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challenge_token: challengeToken,
          otp,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      router.replace("/");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "認証に失敗しました"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    setChallengeToken("");
    setOtp("");
    setErrorMessage("");
    setIsSubmitting(false);
  };

  const isOtpStep = challengeToken !== "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5 py-10 text-[#222222]">
      <section className="w-full max-w-[420px] overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
        <div
          className="h-[14px] w-full rounded-t-[20px] bg-[#fff362]"
          aria-hidden="true"
        />

        <div className="p-7 sm:p-8">
          <div className="flex items-center gap-4">
            <Image
              src="/logo/irasuto.png"
              alt="Machida Lab"
              width={64}
              height={64}
              priority
            />

            <div>
              <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                <span className="text-2xl font-bold text-black">
                  Machida
                </span>
                <span className="text-3xl font-extrabold text-[#fff362] drop-shadow-[2px_2px_2px_rgba(0,0,0,0.45)]">
                  Lab
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-[#666666]">
                Management System
              </p>
            </div>
          </div>

          <h1 className="mt-7 text-2xl font-bold text-[#222222]">
            {isOtpStep ? "認証コード入力" : "ログイン"}
          </h1>

          {isOtpStep ? (
            <form
              className="mt-6 space-y-5"
              onSubmit={handleOtpSubmit}
            >
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#555555]">
                  認証コード
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(event) =>
                    setOtp(
                      event.target.value.replace(/\D/g, "").slice(0, 6)
                    )
                  }
                  autoComplete="one-time-code"
                  disabled={isSubmitting}
                  className="h-11 rounded-[8px] border border-[#D8D8D8] bg-white px-3 text-base text-[#222222] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#222222] disabled:bg-[#F5F5F5]"
                  required
                />
              </label>

              {errorMessage ? (
                <div className="rounded-[8px] border border-[#D9D9D9] bg-white px-4 py-3 text-sm font-semibold text-[#222222]">
                  {errorMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting || otp.length !== 6}
                className="h-11 w-full rounded-[8px] bg-[#fff362] px-5 text-sm font-bold text-[#222222] transition-colors hover:bg-[#fff362] disabled:cursor-not-allowed disabled:bg-[#BDBDBD]"
              >
                {isSubmitting ? "認証中..." : "認証する"}
              </button>

              <button
                type="button"
                onClick={handleBackToLogin}
                disabled={isSubmitting}
                className="h-11 w-full rounded-[8px] border border-[#D8D8D8] bg-white px-5 text-sm font-bold text-[#222222] transition-colors hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-[#999999]"
              >
                ログイン画面に戻る
              </button>
            </form>
          ) : (
            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#555555]">
                  メールアドレス
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  disabled={isSubmitting || isCheckingSession}
                  className="h-11 rounded-[8px] border border-[#D8D8D8] bg-white px-3 text-base text-[#222222] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#222222] disabled:bg-[#F5F5F5]"
                  required
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#555555]">
                  パスワード
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={isSubmitting || isCheckingSession}
                  className="h-11 rounded-[8px] border border-[#D8D8D8] bg-white px-3 text-base text-[#222222] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#222222] disabled:bg-[#F5F5F5]"
                  required
                />
              </label>

              {errorMessage ? (
                <div className="rounded-[8px] border border-[#D9D9D9] bg-white px-4 py-3 text-sm font-semibold text-[#222222]">
                  {errorMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting || isCheckingSession}
                className="h-11 w-full rounded-[8px] bg-[#fff362] px-5 text-sm font-bold text-[#222222] transition-colors hover:bg-[#fff362] disabled:cursor-not-allowed disabled:bg-[#BDBDBD]"
              >
                {isSubmitting
                  ? "ログイン中..."
                  : isCheckingSession
                    ? "確認中..."
                    : "ログイン"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
