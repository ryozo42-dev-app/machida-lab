"use client";

import Image from "next/image";

type DashboardCard = {
  id: string;
  title: string;
  count: string;
  iconSrc: string;
  accentClassName: string;
  iconBadgeClassName: string;
};

const dashboardCards: DashboardCard[] = [
  {
    id: "deliveryTomorrow",
    title: "明日の納品予定",
    count: "8件",
    iconSrc: "/icons/delivery.svg",
    accentClassName: "bg-[#F5A200]",
    iconBadgeClassName: "bg-[#FFF4DE]",
  },
  {
    id: "unfinished",
    title: "未完了作業",
    count: "3件",
    iconSrc: "/icons/work.svg",
    accentClassName: "bg-[#EAA21A]",
    iconBadgeClassName: "bg-[#FFF6E7]",
  },
  {
    id: "overdue",
    title: "納期超過",
    count: "1件",
    iconSrc: "/icons/overdue-warning.svg",
    accentClassName: "bg-[#F08E1D]",
    iconBadgeClassName: "bg-[#FFF1E2]",
  },
  {
    id: "ordersMonth",
    title: "今月受注件数",
    count: "126件",
    iconSrc: "/icons/order.svg",
    accentClassName: "bg-[#FFB347]",
    iconBadgeClassName: "bg-[#FFF4DF]",
  },
];

export default function ModalDisplayArea() {
  const handleCardClick = (card: DashboardCard) => {
    console.log(`[Dashboard] ${card.id} clicked`);
  };

  return (
    <section
      className="flex h-full min-h-[340px] w-full max-w-6xl flex-col rounded-[20px] border border-[#E6E6E6] bg-white p-7 shadow-[0_16px_40px_rgba(15,23,42,0.10)] sm:p-9"
      aria-label="ダッシュボード"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-1 h-10 w-[5px] rounded-full bg-[#F5A200]" aria-hidden="true" />
          <div>
            <h2 className="text-3xl font-bold text-[#222222]">ダッシュボード</h2>
            <p className="mt-2 text-sm text-[#666666]">現在の業務状況</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => console.log("[Dashboard] refresh clicked")}
          className="inline-flex items-center gap-2 rounded-xl border border-[#ECECEC] bg-white px-4 py-2 text-sm font-semibold text-[#444444] transition-colors duration-200 ease-[ease] hover:bg-[#FFF7E8]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
          <span>更新</span>
        </button>
      </div>

      <div className="mt-7 grid flex-1 grid-cols-1 gap-5 sm:grid-cols-2">
        {dashboardCards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => handleCardClick(card)}
            className="relative flex min-h-[120px] items-center justify-between overflow-hidden rounded-[16px] border border-[#E8E8E8] bg-white px-6 py-5 text-left shadow-[0_6px_18px_rgba(15,23,42,0.08)] transition-[transform,box-shadow] duration-200 ease-[ease] hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(15,23,42,0.14)]"
          >
            <span className={`absolute left-0 top-0 h-1 w-full ${card.accentClassName}`} aria-hidden="true" />

            <div className="flex min-w-0 items-center gap-5">
              <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full ${card.iconBadgeClassName}`} aria-hidden="true">
                <Image src={card.iconSrc} alt="" width={58} height={58} className="h-[58px] w-[58px]" />
              </span>

              <div className="min-w-0">
                <p className="truncate text-[1.2rem] font-bold text-[#222222]">{card.title}</p>
                <p className="mt-1 text-[2.5rem] font-extrabold leading-none text-black">{card.count}</p>
              </div>
            </div>

            <svg viewBox="0 0 24 24" className="ml-4 h-6 w-6 shrink-0 text-[#A7ABB2]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        ))}
      </div>

      <div className="mt-6 border-t border-[#ECECEC] pt-4">
        <p className="flex items-center justify-center gap-2 text-sm font-medium text-[#6E7480]">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6l4 2" />
          </svg>
          <span>最終更新</span>
          <span>2026/08/06 10:30</span>
        </p>
      </div>
    </section>
  );
}
