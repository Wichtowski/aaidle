import { useEffect, useMemo, useState } from "react";
import { AiReviewPanel, type AiReview } from "./AiReviewPanel";
import { api, type GitStatus, type ItemSummary, type Navigation } from "./api";
import { requiredPaths, validateRequiredFields } from "./catalogSchema";
import { JsonFormEditor, type JsonObject } from "./JsonFormEditor";

type Notice = { kind: "success" | "error" | "info"; text: string } | null;

function pretty(value: object): string {
  return JSON.stringify(value, null, 2);
}

export default function App() {
  const [navigation, setNavigation] = useState<Navigation | null>(null);
  const [game, setGame] = useState("classic");
  const [category, setCategory] = useState("language-model");
  const [difficulty, setDifficulty] = useState("normal");
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [itemId, setItemId] = useState("");
  const [item, setItem] = useState<JsonObject | null>(null);
  const [baseline, setBaseline] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [aiReview, setAiReview] = useState<AiReview | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [commitMessage, setCommitMessage] = useState("Update game catalog data");
  const [prTitle, setPrTitle] = useState("Update aAIdle game catalog");
  const [prBody, setPrBody] = useState("## Summary\n\n- update validated game catalog data");

  const selectedGame = navigation?.games.find((entry) => entry.id === game);
  const hasCategories = Boolean(selectedGame?.categories.length);
  const canMerge = game === "classic" || game === "timeline";
  const dirty = item !== null && pretty(item) !== baseline;
  const fieldErrors = useMemo(() => (item ? validateRequiredFields(game, item) : {}), [game, item]);
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? items.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(needle))
      : items;
  }, [items, search]);

  useEffect(() => {
    void run(async () => {
      const [nav, status] = await Promise.all([api.navigation(), api.gitStatus()]);
      setNavigation(nav);
      setGitStatus(status);
    });
  }, []);

  useEffect(() => {
    if (!navigation) return;
    const gameConfig = navigation.games.find((entry) => entry.id === game);
    const nextCategory = gameConfig?.categories.length
      ? gameConfig.categories.includes(category)
        ? category
        : gameConfig.categories[0]
      : "";
    if (nextCategory !== category) {
      setCategory(nextCategory);
      return;
    }
    void loadItems(game, nextCategory, difficulty);
  }, [navigation, game, category, difficulty]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function loadItems(nextGame: string, nextCategory: string, nextDifficulty: string) {
    await run(async () => {
      const result = await api.items(nextGame, nextCategory, nextDifficulty);
      setItems(result.items);
      setSearch("");
      const nextId = result.items.some((item) => item.id === itemId)
        ? itemId
        : (result.items[0]?.id ?? "");
      setItemId(nextId);
      if (nextId) await loadItem(nextGame, nextCategory, nextId);
      else {
        setItem(null);
        setBaseline("");
        setAiReview(null);
      }
    });
  }

  async function loadItem(nextGame: string, nextCategory: string, nextId: string) {
    const result = await api.item(nextGame, nextCategory, nextId);
    setItem(result.item as JsonObject);
    setBaseline(pretty(result.item));
    setAiReview(null);
  }

  function selectItem(nextId: string) {
    if (dirty && !window.confirm("Discard the unsaved field changes?")) return;
    setItemId(nextId);
    void run(() => loadItem(game, category, nextId));
  }

  function analyseItem() {
    if (!item) return;
    setAnalysing(true);
    setBusy(true);
    setNotice({ kind: "info", text: "OpenAI is analysing this item…" });
    void api
      .analyse(game, item)
      .then((result) => {
        setAiReview(result as AiReview);
        setNotice({ kind: "success", text: "Item analysis is ready." });
      })
      .catch((error: unknown) => {
        setNotice({ kind: "error", text: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        setAnalysing(false);
        setBusy(false);
      });
  }

  function save() {
    if (hasFieldErrors) {
      setNotice({
        kind: "error",
        text: "Complete the required fields marked with * before saving.",
      });
      return;
    }
    void run(async () => {
      if (!item) return;
      const result = await api.save(game, category, itemId, item);
      setItem(result.item as JsonObject);
      setBaseline(pretty(result.item));
      setNotice({ kind: "success", text: `Saved and verified.\n${result.validation.output}` });
      setGitStatus(await api.gitStatus());
      const refreshed = await api.items(game, category, difficulty);
      setItems(refreshed.items);
    });
  }

  function validateAll() {
    void run(async () => {
      const result = await api.validate();
      setNotice({ kind: "success", text: `All catalog data is valid.\n${result.output}` });
      setGitStatus(await api.gitStatus());
    });
  }

  function mergeSelectedGame() {
    if (!canMerge) return;
    void run(async () => {
      const result = await api.merge(game);
      const label = result.game[0].toUpperCase() + result.game.slice(1);
      setNotice({ kind: "success", text: `${label} catalog merged.\n${result.output}` });
      setGitStatus(await api.gitStatus());
    });
  }

  function publish() {
    if (dirty) {
      setNotice({ kind: "error", text: "Save the current item before publishing." });
      return;
    }
    void run(async () => {
      const result = await api.publish({ message: commitMessage, title: prTitle, body: prBody });
      setNotice({ kind: "success", text: `Pull request created: ${result.url}` });
      setGitStatus(await api.gitStatus());
    });
  }

  return (
    <div className="app-shell">
      <header>
        <div>
          <span className="eyebrow">LOCAL CATALOG WORKBENCH</span>
          <h1>aAIdle Editor</h1>
        </div>
        <div className="header-tools">
          <div className="actions" aria-label="Catalog actions">
            {canMerge && (
              <button className="secondary" onClick={mergeSelectedGame} disabled={busy || dirty}>
                Merge {game === "classic" ? "Classic" : "Timeline"}
              </button>
            )}
            <button className="secondary" onClick={validateAll} disabled={busy}>
              Verify all data
            </button>
            <button
              className="primary"
              onClick={save}
              disabled={!itemId || !dirty || busy || hasFieldErrors}
            >
              {busy ? "Working…" : "Save & verify"}
            </button>
          </div>
          <div className="status-pill" aria-label="Git status">
            <span className={gitStatus?.hasChanges ? "dot changed" : "dot"} />
            {gitStatus?.branch || "loading branch"}
          </div>
        </div>
      </header>

      <main>
        <aside className="navigator">
          <section className="controls" aria-label="Catalog filters">
            <label>
              Game
              <select
                value={game}
                onChange={(event) => setGame(event.target.value)}
                disabled={busy}
              >
                {navigation?.games.map((entry) => (
                  <option key={entry.id}>{entry.id}</option>
                ))}
              </select>
            </label>
            {hasCategories && (
              <label>
                Category
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  disabled={busy}
                >
                  {selectedGame?.categories.map((entry) => (
                    <option key={entry}>{entry}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Difficulty
              <select
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
                disabled={busy}
              >
                {navigation?.difficulties.map((entry) => (
                  <option key={entry}>{entry}</option>
                ))}
              </select>
            </label>
          </section>
          <label className="search">
            <span className="sr-only">Search items</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search items…"
            />
          </label>
          <div className="item-count">{filteredItems.length} items</div>
          <nav className="items" aria-label="Catalog items">
            {filteredItems.map((item) => (
              <button
                className={item.id === itemId ? "item active" : "item"}
                key={item.id}
                onClick={() => selectItem(item.id)}
                disabled={busy}
              >
                <span>{item.name}</span>
                <small>
                  {item.id} · pool {item.minPool}
                </small>
              </button>
            ))}
          </nav>
        </aside>

        <section className="workspace">
          <div className="workspace-title">
            <div>
              <span className="eyebrow">EDITING ONE RECORD</span>
              <h2>{items.find((item) => item.id === itemId)?.name ?? "Select an item"}</h2>
            </div>
            {dirty && <span className="unsaved">Unsaved</span>}
          </div>
          <div className="editor-columns">
            <div className="record-column">
              <div className="editor-label">Record fields</div>
              <div className="form-editor">
                {item ? (
                  <JsonFormEditor
                    value={item}
                    onChange={setItem}
                    disabled={busy}
                    readOnlyKeys={[game === "logo" ? "answerId" : "id"]}
                    requiredKeys={requiredPaths(game)}
                    errors={fieldErrors}
                  />
                ) : (
                  <p className="empty-value">Select an item to edit its fields.</p>
                )}
              </div>
            </div>
            <AiReviewPanel
              current={item}
              review={aiReview}
              analysing={analysing}
              disabled={busy}
              onAnalyse={analyseItem}
              onApply={setItem}
            />
          </div>
          {notice && (
            <pre className={`notice ${notice.kind}`} role="status">
              {notice.text}
            </pre>
          )}
        </section>

        <aside className="publish-panel">
          <span className="eyebrow">SHIP THE CHANGE</span>
          <h2>Open a pull request</h2>
          <p className="muted">
            Validation runs again before Git stages, commits, pushes, and opens the PR.
          </p>
          <label>
            Commit message
            <input
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
            />
          </label>
          <label>
            PR title
            <input value={prTitle} onChange={(event) => setPrTitle(event.target.value)} />
          </label>
          <label>
            PR description
            <textarea rows={7} value={prBody} onChange={(event) => setPrBody(event.target.value)} />
          </label>
          <div className="git-details">
            <span>
              {gitStatus?.githubAuthenticated
                ? "GitHub CLI connected"
                : "GitHub CLI not authenticated"}
            </span>
            <span>{gitStatus?.changedPaths.length ?? 0} changed files</span>
          </div>
          {gitStatus?.hasChanges && !gitStatus.canPublish && (
            <p className="publish-warning">Only changes under data/ can be published.</p>
          )}
          <button
            className="publish"
            onClick={publish}
            disabled={busy || !gitStatus?.canPublish || !gitStatus.githubAuthenticated}
          >
            Create branch, commit & PR
          </button>
          {gitStatus?.changedPaths.length ? (
            <details>
              <summary>Changed paths</summary>
              <ul>
                {gitStatus.changedPaths.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </aside>
      </main>
    </div>
  );
}
