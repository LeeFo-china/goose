const revenueDetails = [
  {
    label: "收益范围",
    value: "平台记录并纳入分成规则的平台收益",
  },
  {
    label: "线索服务费",
    value: "线索服务费默认 2.5%，按平台实际成交记录核算",
  },
  {
    label: "结算方式",
    value: "首期按月人工结算，由平台运营核对台账后支付",
  },
] as const;

export function PartnerRevenue(): React.JSX.Element {
  return (
    <section className="bg-muted" id="revenue">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)] lg:px-8 lg:py-24">
        <div className="flex flex-col gap-5">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            合伙人只参与平台收益分成
          </h2>
          <p className="max-w-2xl text-base leading-8 text-muted-foreground">
            装修公司自有业务财务独立。平台不介入装修合同收款、施工支出、供应链付款或装企内部利润。
          </p>
          <p className="max-w-2xl text-base leading-8 text-muted-foreground">
            装企通过专属二维码绑定，后续符合规则的平台收入进入台账。绑定关系、收入来源和结算记录全程平台留痕。
          </p>
        </div>

        <dl className="flex flex-col rounded-lg border bg-card px-5 sm:px-6">
          {revenueDetails.map((detail) => (
            <div
              className="flex flex-col gap-2 border-t py-5 first:border-t-0 sm:grid sm:grid-cols-[8rem_1fr] sm:gap-5"
              key={detail.label}
            >
              <dt className="text-sm font-medium text-muted-foreground">
                {detail.label}
              </dt>
              <dd className="text-sm font-medium leading-6 sm:text-base">
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
