import DashboardTile from "./DashboardTile";

type DashboardItem = {
  title?: string;
  iconName?: string;
  isEmpty?: boolean;
};

const dashboardItems: DashboardItem[] = [
  {
    title: "受注入力",
    iconName: "assignment",
  },
  {
    title: "作業入力",
    iconName: "dentistry",
  },
  {
    title: "納品書",
    iconName: "local_shipping",
  },
  {
    title: "請求書",
    iconName: "receipt_long",
  },
  {
    title: "管理",
    iconName: "settings",
  },
  {
    isEmpty: true,
  },
];

export default function TileGrid() {
  return (
    <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {dashboardItems.map((item) => {
        return (
          <DashboardTile
            key={item.title ?? "future-slot"}
            title={item.title}
            iconName={item.iconName}
            isEmpty={item.isEmpty}
          />
        );
      })}
    </div>
  );
}
