import Header from "@/components/layout/Header";
import DesktopWorkspace from "@/components/dashboard/DesktopWorkspace";

export default function Home() {
  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#FFFFFF] text-[#222222]">
      <Header />
      <DesktopWorkspace />
    </main>
  );
}