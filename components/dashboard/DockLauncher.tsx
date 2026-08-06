import { useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";

export type DockItem = {
  id: string;
  iconSrc?: string;
  iconAlt?: string;
  label?: string;
  indicatorColor?: string;
};

type DockLauncherProps = {
  items: DockItem[];
  activeId: string;
  onSelect: (id: string) => void;
};

export default function DockLauncher({ items, activeId, onSelect }: DockLauncherProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const getMotionStyle = (itemId: string): CSSProperties => {
    if (!hoveredId) {
      return {
        transform: "translateY(0px) scale(1)",
        zIndex: 0,
        filter: "none",
      };
    }

    if (itemId === hoveredId) {
      return {
        transform: "translateY(-10px) scale(1.6)",
        zIndex: 30,
        filter: "drop-shadow(0 12px 30px rgba(0,0,0,0.15))",
      };
    }

    return {
      transform: "translateY(0px) scale(1)",
      zIndex: 0,
      filter: "none",
    };
  };

  return (
    <nav
      className="w-full max-w-[1020px] overflow-visible rounded-[24px] border border-[#ECECEC] bg-white px-5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
      aria-label="機能ランチャー"
    >
      <div className="overflow-visible">
        <ul
          className="mx-auto flex min-w-max justify-center gap-3 overflow-visible sm:gap-6"
          onMouseLeave={() => {
            setHoveredId(null);
          }}
        >
          {items.map((item) => {
            const motionStyle = getMotionStyle(item.id);
            const isHovered = item.id === hoveredId;
            const isSelected = item.id === activeId;

            return (
              <li key={item.id} className="relative flex h-[5.5rem] w-[5.5rem] shrink-0 items-center justify-center overflow-visible">
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onFocus={() => setHoveredId(item.id)}
                  onBlur={() => setHoveredId(null)}
                  className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-transparent shadow-none transition-[transform,filter] duration-[220ms] ease-[ease]"
                  style={{
                    ...motionStyle,
                    transformOrigin: "center bottom",
                    willChange: "transform, filter",
                  }}
                  aria-pressed={isSelected}
                >
                  {item.iconSrc ? (
                    <Image
                      src={item.iconSrc}
                      alt={item.iconAlt ?? item.label ?? "dock icon"}
                      width={56}
                      height={56}
                      className="h-14 w-14"
                      priority={item.id === "order"}
                    />
                  ) : null}
                </button>

                <span
                  className={`pointer-events-none absolute bottom-full left-1/2 z-40 mb-[20px] -translate-x-1/2 whitespace-nowrap text-[14px] font-semibold text-black transition-[opacity,transform] duration-[220ms] ease-[ease] ${
                    isHovered ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                  }`}
                >
                  {item.label}
                </span>

                <span
                  className={`pointer-events-none absolute -bottom-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full transition-opacity duration-200 ${
                    isSelected ? "opacity-100" : "opacity-0"
                  }`}
                  style={{ backgroundColor: item.indicatorColor ?? "#F5A200" }}
                  aria-hidden="true"
                />
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
