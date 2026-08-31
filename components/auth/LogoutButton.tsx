"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.replace("/login");
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="mt-1 rounded-lg border border-[#E1E1E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#444444] transition-colors hover:bg-[#F8F8F8] disabled:cursor-not-allowed disabled:text-[#AAAAAA]"
    >
      {isLoggingOut ? "ログアウト中..." : "ログアウト"}
    </button>
  );
}
