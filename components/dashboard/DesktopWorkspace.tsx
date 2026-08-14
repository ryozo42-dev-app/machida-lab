"use client";

import { useEffect, useRef, useState } from "react";
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
  const [previousId, setPreviousId] = useState<string | null>(null);
  const [transitionPhase, setTransitionPhase] = useState<"idle" | "fadeOut" | "fadeIn">("idle");
  const workspaceRef = useRef<HTMLElement>(null);
  const fadeOutTimerRef = useRef<number | null>(null);
  const fadeInTimerRef = useRef<number | null>(null);
  const fadeOutDuration = 340;
  const fadeInDuration = 340;
  const fadeEase = "cubic-bezier(0.2, 0.9, 0.24, 1)";
  const modalRevealEase = "cubic-bezier(0.2, 0.9, 0.24, 1)";

  const clearTransitionTimers = () => {
    if (fadeOutTimerRef.current !== null) {
      window.clearTimeout(fadeOutTimerRef.current);
      fadeOutTimerRef.current = null;
    }

    if (fadeInTimerRef.current !== null) {
      window.clearTimeout(fadeInTimerRef.current);
      fadeInTimerRef.current = null;
    }
  };

  const handleSelect = (nextId: string, launcherRect: DOMRect) => {
    void launcherRect;

    if (nextId === activeId && previousId === null) {
      return;
    }

    clearTransitionTimers();
    setPreviousId(activeId);
    setActiveId(nextId);
    setTransitionPhase("fadeOut");

    fadeOutTimerRef.current = window.setTimeout(() => {
      setTransitionPhase("fadeIn");
      fadeOutTimerRef.current = null;

      fadeInTimerRef.current = window.setTimeout(() => {
        setTransitionPhase("idle");
        setPreviousId(null);
        fadeInTimerRef.current = null;
      }, fadeInDuration);
    }, fadeOutDuration);
  };

  useEffect(() => {
    return () => {
      clearTransitionTimers();
    };
  }, []);

  const layerBaseStyle = {
    transformOrigin: "center center",
  } as const;

  const renderModalLayer = (id: string, layer: "enter" | "exit" | "static") => {
    const isEntering = layer === "enter";
    const isExiting = layer === "exit";

    const modalOpacity = isEntering
      ? transitionPhase === "fadeIn"
        ? 1
        : 0
      : isExiting
        ? transitionPhase === "fadeOut"
          ? 0
          : 0
        : 1;

    const modalTransition = isEntering
      ? `opacity ${fadeInDuration}ms ${modalRevealEase}`
      : isExiting
        ? `opacity ${fadeOutDuration}ms ${fadeEase}`
        : "none";

    const layerStyle = isEntering
      ? {
          opacity: modalOpacity,
          transition: modalTransition,
          zIndex: 20,
        }
      : isExiting
        ? {
            opacity: modalOpacity,
            transition: modalTransition,
            zIndex: 10,
          }
        : {
            opacity: 1,
            transition: "none",
            zIndex: 10,
          };

    return (
      <div
        key={`${id}-${layer}`}
        className="absolute inset-0 flex items-center justify-center"
        aria-hidden={isExiting}
        style={{
          ...layerBaseStyle,
          ...layerStyle,
          pointerEvents: isExiting ? "none" : "auto",
          willChange: "opacity",
        }}
      >
        <ModalDisplayArea activeId={id} />
      </div>
    );
  };

  return (
    <section ref={workspaceRef} className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
      <div className="relative flex min-h-0 flex-[3] items-center justify-center">
        {previousId !== null ? renderModalLayer(previousId, "exit") : null}
        {renderModalLayer(activeId, previousId !== null ? "enter" : "static")}
      </div>

      <div className="flex justify-center pt-3 sm:pt-4">
        <DockLauncher
          items={dockItems}
          activeId={activeId}
          onSelect={handleSelect}
        />
      </div>
    </section>
  );
}
