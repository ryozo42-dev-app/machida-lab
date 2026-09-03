"use client";

import { useCallback, useEffect, useState } from "react";
import UserModal, { ManagedUser, UserRole } from "./UserModal";

type UserModalMode = "create" | "edit" | null;

type UserManagementPanelProps = {
  onBack: () => void;
};

async function readApiError(response: Response, fallback: string) {
  try {
    const result = (await response.json()) as { error?: string };

    return result.error || fallback;
  } catch {
    return fallback;
  }
}

export default function UserManagementPanel({
  onBack,
}: UserManagementPanelProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalMode, setModalMode] = useState<UserModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/users", { signal });

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            "ユーザーの読み込みに失敗しました"
          )
        );
      }

      const data = (await response.json()) as ManagedUser[];
      setUsers(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      console.error("Failed to load users", error);
      setError(
        error instanceof Error
          ? error.message
          : "ユーザーの読み込みに失敗しました"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void loadUsers(controller.signal);

    return () => controller.abort();
  }, [loadUsers]);

  const openCreateModal = () => {
    setSelectedUser(null);
    setModalError("");
    setModalMode("create");
  };

  const openEditModal = (user: ManagedUser) => {
    setSelectedUser(user);
    setModalError("");
    setModalMode("edit");
  };

  const closeModal = () => {
    setSelectedUser(null);
    setModalError("");
    setModalMode(null);
  };

  const handleSave = async (data: {
    user_name: string;
    login_id: string;
    password?: string;
    role: UserRole;
  }) => {
    setIsSaving(true);
    setModalError("");

    try {
      const isEdit = modalMode === "edit" && selectedUser;
      const response = await fetch(
        isEdit ? `/api/users/${selectedUser.id}` : "/api/users",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            isEdit
              ? "ユーザーの保存に失敗しました"
              : "ユーザーの登録に失敗しました"
          )
        );
      }

      await loadUsers();
      closeModal();
    } catch (error) {
      console.error("Failed to save user", error);
      setModalError(
        error instanceof Error
          ? error.message
          : "ユーザーの保存に失敗しました"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <section
        className="flex h-full min-h-[340px] w-full max-w-6xl flex-col overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white p-6"
        aria-label="ユーザーマスター"
      >
        <div
          className="h-[14px] w-full rounded-t-[20px] bg-[#fff362]"
          aria-hidden="true"
        />

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="mt-1 h-10 w-[5px] rounded-full bg-[#fff362]"
              aria-hidden="true"
            />

            <div>
              <h2 className="text-2xl font-bold text-[#222222]">
                ユーザーマスター
              </h2>

              <p className="mt-1 text-xs text-[#666666]">
                ユーザー・権限の管理を行います
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="shrink-0 rounded-lg bg-[#fff362] px-5 py-2.5 text-sm font-bold text-[#222222] transition-colors hover:bg-[#fff362]"
          >
            ＋ 新規登録
          </button>
        </div>

        <div className="mt-5 grid flex-1 grid-cols-2 gap-4 overflow-auto rounded-[16px] border border-[#E8E8E8] bg-[#FCFCFC] p-4">
          {isLoading ? (
            <div className="col-span-2 flex min-h-[180px] items-center justify-center">
              <p className="text-sm text-[#666666]">読み込み中...</p>
            </div>
          ) : error ? (
            <div className="col-span-2 flex min-h-[180px] items-center justify-center">
              <p className="text-sm font-medium text-[#B42318]">
                {error}
              </p>
            </div>
          ) : users.length === 0 ? (
            <div className="col-span-2 flex min-h-[180px] items-center justify-center">
              <p className="text-sm text-[#666666]">
                ユーザーが登録されていません
              </p>
            </div>
          ) : (
            users.map((user) => (
              <div
                key={user.id}
                className="flex min-h-[112px] items-center justify-between rounded-[16px] border border-[#E8E8E8] bg-white px-4 py-4"
              >
                <div className="min-w-0 pr-3">
                  <p className="truncate font-semibold text-[#222222]">
                    {user.user_name || "-"}
                  </p>

                  <p className="mt-1 truncate text-xs text-[#666666]">
                    ログインID：{user.login_id || "-"}
                  </p>

                  <p className="mt-1 text-xs font-semibold text-[#555555]">
                    権限：{user.role || "-"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => openEditModal(user)}
                  className="shrink-0 rounded-lg border border-[#E1E1E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#555555] transition-colors hover:bg-[#FFF8EA]"
                >
                  編集
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 flex justify-end border-t border-[#ECECEC] pt-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-[#fff362] bg-[#fff362] px-5 py-2 text-sm font-semibold text-[#222222] hover:bg-[#fff362]"
          >
            管理メニューに戻る
          </button>
        </div>
      </section>

      {modalMode !== null ? (
        <UserModal
          mode={modalMode}
          user={selectedUser}
          error={modalError}
          isSaving={isSaving}
          onClose={closeModal}
          onSave={handleSave}
        />
      ) : null}
    </>
  );
}
