"use client";

import { useEffect, useState } from "react";

export type UserRole = "admin" | "staff";

export type ManagedUser = {
  id: number;
  login_id: string | null;
  user_name: string | null;
  role: string | null;
  created_at: string | null;
};

type UserModalProps = {
  mode: "create" | "edit";
  user: ManagedUser | null;
  error: string;
  isSaving: boolean;
  onClose: () => void;
  onSave: (data: {
    user_name: string;
    login_id: string;
    password?: string;
    role: UserRole;
  }) => void;
};

export default function UserModal({
  mode,
  user,
  error,
  isSaving,
  onClose,
  onSave,
}: UserModalProps) {
  const [userName, setUserName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("staff");

  useEffect(() => {
    if (mode === "edit" && user) {
      setUserName(user.user_name ?? "");
      setLoginId(user.login_id ?? "");
      setRole(user.role === "admin" ? "admin" : "staff");
    } else {
      setUserName("");
      setLoginId("");
      setRole("staff");
    }

    setPassword("");
  }, [mode, user]);

  const canSave =
    userName.trim() !== "" &&
    loginId.trim() !== "" &&
    (mode === "edit" || password !== "") &&
    !isSaving;

  const handleSave = () => {
    if (!canSave) {
      return;
    }

    const trimmedPassword = password.trim();

    onSave({
      user_name: userName.trim(),
      login_id: loginId.trim(),
      role,
      ...(trimmedPassword ? { password: trimmedPassword } : {}),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "ユーザーを登録" : "ユーザーを編集"}
    >
      <div className="w-full max-w-[520px] overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white shadow-xl">
        <div className="h-[10px] bg-[#fff362]" />

        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#222222]">
                {mode === "create" ? "ユーザーを登録" : "ユーザーを編集"}
              </h2>

              <p className="mt-1 text-xs text-[#777777]">
                {mode === "create"
                  ? "新しいユーザーを登録します"
                  : "ユーザー情報と権限を編集します"}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-[#777777] transition-colors hover:bg-[#F5F5F5]"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>

          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="text-sm font-semibold text-[#333333]">
                ユーザー名
              </span>

              <input
                type="text"
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                placeholder="ユーザー名を入力"
                autoComplete="name"
                className="mt-2 w-full rounded-lg border border-[#DCDCDC] bg-white px-3 py-2.5 text-sm text-[#222222] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#fff362]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#333333]">
                ログインID
              </span>

              <input
                type="email"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                placeholder="mail@example.com"
                autoComplete="email"
                className="mt-2 w-full rounded-lg border border-[#DCDCDC] bg-white px-3 py-2.5 text-sm text-[#222222] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#fff362]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#333333]">
                {mode === "create" ? "パスワード" : "新しいパスワード"}
              </span>

              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  mode === "create"
                    ? "パスワードを入力"
                    : "変更する場合のみ入力"
                }
                autoComplete="new-password"
                className="mt-2 w-full rounded-lg border border-[#DCDCDC] bg-white px-3 py-2.5 text-sm text-[#222222] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#fff362]"
              />

              {mode === "edit" ? (
                <p className="mt-1.5 text-xs text-[#888888]">
                  空欄の場合、パスワードは変更しません
                </p>
              ) : null}
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#333333]">
                権限
              </span>

              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as UserRole)
                }
                className="mt-2 h-11 w-full rounded-lg border border-[#DCDCDC] bg-white px-3 text-sm text-[#222222] outline-none transition-colors focus:border-[#fff362]"
              >
                <option value="staff">staff</option>
                <option value="admin">admin</option>
              </select>
            </label>

            {error ? (
              <p className="text-sm font-semibold text-[#B42318]">
                {error}
              </p>
            ) : null}
          </div>

          <div className="mt-7 flex justify-end gap-2 border-t border-[#ECECEC] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E1E1E1] bg-white px-5 py-2.5 text-sm font-semibold text-[#444444] transition-colors hover:bg-[#F8F8F8]"
            >
              キャンセル
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className={`rounded-lg px-6 py-2.5 text-sm font-bold text-[#222222] transition-colors ${
                canSave
                  ? "bg-[#fff362] hover:bg-[#fff362]"
                  : "cursor-not-allowed bg-[#D8D8D8]"
              }`}
            >
              {isSaving
                ? mode === "create"
                  ? "登録中"
                  : "保存中"
                : mode === "create"
                  ? "登録"
                  : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
