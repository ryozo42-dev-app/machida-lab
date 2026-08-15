import type { ReactNode } from "react";

type DashboardTileProps = {
  title?: string;
  iconName?: string;
  isEmpty?: boolean;
  icon?: ReactNode;
};

export default function DashboardTile({
  title,
  iconName,
  isEmpty = false,
  icon,
}: DashboardTileProps) {
  if (isEmpty) {
    return (
      <div className="h-36 rounded-[12px] border border-gray-200 bg-white" aria-hidden="true" />
    );
  }

  return (
    <button
      type="button"
      className="flex h-36 w-full flex-col items-center justify-center gap-3 rounded-[12px] border border-gray-200 bg-white text-black transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-\[\#FFFF00\]"
      aria-label={title}
    >
      {icon ? (
        icon
      ) : iconName ? (
        <span className="material-symbols-outlined text-[34px] leading-none text-black" aria-hidden="true">
          {iconName}
        </span>
      ) : null}
      {title ? <span className="text-lg font-semibold text-black">{title}</span> : null}
    </button>
  );
}
