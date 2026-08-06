"use client";

import { useState } from "react";
import DockLauncher, { type DockItem } from "./DockLauncher";
import ModalDisplayArea from "./ModalDisplayArea";

const dockItems: DockItem[] = [
  {
    id: "dashboard",
    iconSrc: "/icons/dashboard.svg",
    iconAlt: "ダッシュボード",
    label: "ダッシュボード",
    indicatorColor: "#5C73F2",
  },
  {
    id: "order",
    iconSrc: "/icons/order.svg",
    iconAlt: "受注入力",
    label: "受注入力",
    indicatorColor: "#F5A200",
  },
  {
    id: "work",
    iconSrc: "/icons/work.svg",
    iconAlt: "作業時入力",
    label: "作業時入力",
    indicatorColor: "#6A7EFF",
  },
  {
    id: "delivery",
    iconSrc: "/icons/delivery.svg",
    iconAlt: "納品書",
    label: "納品書",
    indicatorColor: "#1BC184",
  },
  {
    id: "invoice",
    iconSrc: "/icons/invoice.svg",
    iconAlt: "請求書",
    label: "請求書",
    indicatorColor: "#FF4C96",
  },
  {
    id: "manage",
    iconSrc: "/icons/manage.svg",
    iconAlt: "管理",
    label: "管理",
    indicatorColor: "#7D7D7D",
  },
];

export default function DesktopWorkspace() {
  const [activeId, setActiveId] = useState("order");

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
      <div className="flex min-h-0 flex-[3] items-center justify-center">
        <ModalDisplayArea />
      </div>

      <div className="flex flex-[1] items-end justify-center overflow-visible pt-3 sm:pt-4">
        <DockLauncher
          items={dockItems}
          activeId={activeId}
          onSelect={setActiveId}
        />
      </div>
    </section>
  );
}
