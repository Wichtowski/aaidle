import { AppPageLayout } from "@app/layouts/AppPageLayout";

export function ConnectionsPage() {
  return (
    <AppPageLayout className="game-placeholder-page connections-page">
      <section
        aria-labelledby="connections-title"
        className="game-placeholder connections-placeholder"
      >
        <span aria-hidden="true" className="connections-placeholder__emoji">
          🏗️
        </span>
        <p className="eyebrow">Connections</p>
        <h1 id="connections-title">In construction</h1>
        <p className="lede">This game is still being built. Check back soon.</p>
      </section>
    </AppPageLayout>
  );
}
