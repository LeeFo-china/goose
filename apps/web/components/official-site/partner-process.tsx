const processItems = [
  {
    title: "提交申请",
    description: "填写主体、联系人、意向城市和本地资源。",
  },
  {
    title: "审核沟通",
    description: "平台运营核实区域、资源与合作边界。",
  },
  {
    title: "开通身份",
    description: "审核通过后创建正式合伙人，并补充合作资料。",
  },
  {
    title: "二维码绑定",
    description: "装企扫码入驻，系统建立归属关系并持续留痕。",
  },
] as const;

export function PartnerProcess(): React.JSX.Element {
  return (
    <section aria-labelledby="partner-process-heading" className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="flex max-w-2xl flex-col gap-4">
          <h2
            className="text-3xl font-semibold tracking-tight sm:text-4xl"
            id="partner-process-heading"
          >
            从申请到绑定，每一步都有记录
          </h2>
          <p className="text-base leading-8 text-muted-foreground">
            官网提交不会直接开通身份。平台完成审核后，才进入资料补充和装企绑定。
          </p>
        </div>

        <ol className="mt-10 border-y">
          {processItems.map((item, index) => (
            <li
              className="grid gap-3 border-b py-6 last:border-b-0 sm:grid-cols-[4rem_minmax(10rem,0.6fr)_minmax(0,1fr)] sm:items-baseline sm:gap-6"
              key={item.title}
            >
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
                {item.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
