type ModalDisplayAreaProps = {
  title: string;
};

export default function ModalDisplayArea({ title }: ModalDisplayAreaProps) {
  return (
    <section
      className="flex h-full min-h-[280px] w-full max-w-6xl flex-col rounded-[16px] border border-[#E5E5E5] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:p-8"
      aria-label="表示エリア"
    >
      <p className="text-sm font-medium text-[#666666]">現在の表示画面</p>
      <h2 className="mt-2 text-3xl font-bold text-[#222222]">{title}</h2>
      <div className="mt-6 flex flex-1 items-center justify-center rounded-xl border border-dashed border-[#E5E5E5] bg-[#FCFCFC]">
        <p className="px-4 text-center text-sm text-[#555555]">
          ここに {title} の画面コンテンツが表示されます。
        </p>
      </div>
    </section>
  );
}
