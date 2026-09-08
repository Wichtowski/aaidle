import { dailyHardcoreSoundtrack } from "@lib/media/hardcore-soundtracks";
import { utcDate } from "@lib/utils/dates";

export function HardcoreSoundtrackStatus() {
  const date = utcDate();
  const soundtrack = dailyHardcoreSoundtrack(date);

  return (
    <section className="admin-soundtrack-settings" aria-labelledby="admin-soundtrack-title">
      <div>
        <p className="eyebrow">Automatic daily rotation</p>
        <h2 id="admin-soundtrack-title">Hardcore soundtrack</h2>
        <p>Selected automatically from the paired audio and cover files for {date} UTC.</p>
      </div>
      <div className="admin-soundtrack-settings__current">
        <span>Today’s song</span>
        {soundtrack ? (
          <>
            <a
              aria-label="Open the aAIdle Hardcore soundtrack notice in a new tab"
              href="/hardcore/SOUNDTRACK-NOTICE.txt"
              rel="noopener noreferrer"
              target="_blank"
              title="Open the soundtrack notice in a new tab"
            >
              <img alt="" src={soundtrack.coverUrl} />
            </a>
            <strong>{soundtrack.title}</strong>
            <small>{soundtrack.artist}</small>
            <code>{soundtrack.audioSources.map(({ fileName }) => fileName).join(" + ")}</code>
          </>
        ) : (
          <strong>No paired Hardcore tracks found</strong>
        )}
      </div>
    </section>
  );
}
