export default function HomePage() {
  return (
    <section
      aria-labelledby="home-heading"
      className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-16 sm:px-6 lg:px-8"
    >
      <h1
        className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl"
        id="home-heading"
      >
        装修经营与城市合作，从边界清楚开始。
      </h1>
      <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
        鹅班长为装修经营者和城市合作伙伴提供清晰、可靠的业务支持。
      </p>
    </section>
  );
}
