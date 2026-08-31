import Image from "next/image";
import LogoutButton from "@/components/auth/LogoutButton";

export default function Header() {
  return (
    <header className="bg-white border-b-4 border-[#fff362] shadow-md">
      <div className="mx-auto flex h-20 items-center justify-between px-8">

        {/* 左側：ロゴ＋タイトル */}
        <div className="flex items-center gap-5">

          <Image
            src="/logo/irasuto.png"
            alt="Machida Lab"
            width={72}
            height={72}
            priority
          />

          <div className="flex items-baseline gap-2 whitespace-nowrap">

            <span className="text-3xl font-bold text-black">
              Machida
            </span>

            <span
              className="text-4xl font-extrabold text-[#fff362] drop-shadow-[2px_2px_2px_rgba(0,0,0,0.45)]"
            >
              Lab
            </span>

            <span className="text-2xl font-semibold text-gray-700">
              Management System
            </span>

          </div>

        </div>

        {/* 右側 */}
        <div className="text-right">

          <p className="text-sm text-gray-500">
            Dental Laboratory
          </p>

          <p className="text-lg font-semibold text-[#fff362] drop-shadow-[1px_1px_2px_rgba(0,0,0,0.35)]">
            Version 1.0
          </p>

          <LogoutButton />

        </div>

      </div>
    </header>
  );
}
