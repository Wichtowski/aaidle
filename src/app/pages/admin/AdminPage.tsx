import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router-dom";
import "./admin.css";
import { canManageAdministrators, canManageUsers } from "@lib/auth/permissions";
import { apiClient, type AdminUserDetail, type AdminUserSummary } from "@lib/api/client";
import { AdminProgressRecord } from "@components/admin/AdminProgressRecord";
import { useAuth } from "@components/auth/useAuth";
import { SiteNavbar } from "@components/ui/SiteNavbar";
import { PageEyebrow } from "@components/ui/PageEyebrow";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: number | null) {
  return value ? dateTime.format(value) : "Never";
}

function userName(user: Pick<AdminUserSummary, "email" | "displayName">) {
  return user.displayName || user.email;
}

export function AdminPage() {
  const navigate = useNavigate();
  const { loading, user } = useAuth();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingUser, setUpdatingUser] = useState(false);
  const [removingGuessId, setRemovingGuessId] = useState<string | null>(null);
  const detailRequestId = useRef(0);

  useEffect(() => {
    if (!loading && user?.disabled) navigate("/account-disabled", { replace: true });
    else if (!loading && (!user || !canManageUsers(user.permission))) {
      navigate("/", { replace: true });
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    if (!user || !canManageUsers(user.permission)) return;
    let active = true;
    setLoadingUsers(true);
    setError(null);
    void apiClient
      .adminUsers(page, query)
      .then((response) => {
        if (!active) return;
        setUsers(response.users);
        setTotal(response.total);
        setPageSize(response.pageSize);
        if (response.page !== page) setPage(response.page);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "Could not load users.");
        }
      })
      .finally(() => {
        if (active) setLoadingUsers(false);
      });
    return () => {
      active = false;
    };
  }, [page, query, user]);

  const selectUser = (userId: string) => {
    const requestId = detailRequestId.current + 1;
    detailRequestId.current = requestId;
    setLoadingDetail(true);
    setError(null);
    void apiClient
      .adminUser(userId)
      .then((response) => {
        if (detailRequestId.current === requestId) setSelectedUser(response.user);
      })
      .catch((requestError: unknown) => {
        if (detailRequestId.current !== requestId) return;
        setSelectedUser(null);
        setError(
          requestError instanceof Error ? requestError.message : "Could not load user data.",
        );
      })
      .finally(() => {
        if (detailRequestId.current === requestId) setLoadingDetail(false);
      });
  };

  const submitSearch = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    detailRequestId.current += 1;
    setSelectedUser(null);
    setPage(1);
    setQuery(queryInput.trim());
  };

  const updateSelectedUser = (update: {
    permission?: "user" | "developer";
    disabled?: boolean;
    disabledReason?: string;
    issueReportLimit?: number;
  }) => {
    if (!selectedUser) return;
    setUpdatingUser(true);
    setError(null);
    void apiClient
      .updateAdminUser(selectedUser.id, update)
      .then(({ user: updatedUser }) => {
        setSelectedUser(updatedUser);
        setUsers((items) => items.map((item) => (item.id === updatedUser.id ? updatedUser : item)));
      })
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error ? requestError.message : "Could not update this account.",
        );
      })
      .finally(() => setUpdatingUser(false));
  };

  const removeSelectedUserGuess = (gameKey: string, requestId: string) => {
    if (!selectedUser) return;
    setRemovingGuessId(requestId);
    setError(null);
    void apiClient
      .removeAdminGameGuess(selectedUser.id, gameKey, requestId)
      .then(({ user: updatedUser }) => setSelectedUser(updatedUser))
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not remove the saved guess.",
        );
      })
      .finally(() => setRemovingGuessId(null));
  };

  if (loading || !user || user.disabled || !canManageUsers(user.permission)) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="page admin-page">
      <SiteNavbar />
      <PageEyebrow>Restricted area</PageEyebrow>
      <h1>Admin</h1>
      <p className="lede">
        Inspect registered accounts and their synced game data. Authentication secrets are never
        shown here.
      </p>

      <section className="admin-workspace" aria-label="User administration">
        <div className="admin-users-panel">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Accounts</p>
              <h2>{total} users</h2>
            </div>
          </div>
          <form
            className="admin-search"
            onSubmit={submitSearch}
            toolname="searchAdminUsers"
            tooldescription="Find registered aAIdle accounts by email address or display name."
          >
            <label htmlFor="admin-user-search">Find by email or name</label>
            <div>
              <input
                id="admin-user-search"
                name="query"
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="name@example.com"
                type="search"
                toolparamdescription="An email address or display name to search for."
                value={queryInput}
              />
              <button className="button" type="submit">
                Search
              </button>
            </div>
          </form>
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          <div className="admin-user-list" aria-busy={loadingUsers}>
            {loadingUsers && <p className="admin-empty">Loading users...</p>}
            {!loadingUsers && users.length === 0 && (
              <p className="admin-empty">No users match this search.</p>
            )}
            {!loadingUsers &&
              users.map((item) => (
                <button
                  aria-pressed={selectedUser?.id === item.id}
                  className="admin-user-row"
                  key={item.id}
                  onClick={() => selectUser(item.id)}
                  type="button"
                >
                  <span>
                    <strong>{userName(item)}</strong>
                    {item.displayName && <small>{item.email}</small>}
                  </span>
                  <span className="admin-user-row__meta">
                    <small>{item.emailVerifiedAt ? "Verified" : "Unverified"}</small>
                    <small>
                      {item.disabledAt
                        ? "Disabled"
                        : item.permission === "developer"
                          ? "Admin"
                          : "Player"}
                    </small>
                    <small>{item.completionCount} completions</small>
                  </span>
                </button>
              ))}
          </div>
          {total > 0 && (
            <div className="admin-pagination">
              <button
                className="button"
                disabled={page === 1 || loadingUsers}
                onClick={() => setPage(page - 1)}
                type="button"
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                className="button"
                disabled={page === totalPages || loadingUsers}
                onClick={() => setPage(page + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          )}
        </div>

        <aside className="admin-detail-panel" aria-live="polite">
          {loadingDetail && <p className="admin-empty">Loading user data...</p>}
          {!loadingDetail && !selectedUser && (
            <p className="admin-empty">
              Choose an account to see its stored progress and completed challenges.
            </p>
          )}
          {!loadingDetail && selectedUser && (
            <UserDetail
              canManageAccount={canManageAdministrators(user.permission)}
              currentUserId={user.id}
              onUpdate={updateSelectedUser}
              onRemoveGuess={
                canManageAdministrators(user.permission) ? removeSelectedUserGuess : undefined
              }
              removingGuessId={removingGuessId}
              updating={updatingUser}
              user={selectedUser}
            />
          )}
        </aside>
      </section>
      {canManageAdministrators(user.permission) && <HardcoreSoundtrackSettings />}
    </main>
  );
}

function HardcoreSoundtrackSettings() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;

    void apiClient
      .hardcoreSoundtrackSetting()
      .then((response) => {
        if (active) setUrl(response.url);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load the soundtrack setting.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const save = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    void apiClient
      .updateHardcoreSoundtrack(url)
      .then((response) => {
        setUrl(response.url);
        setSaved(true);
      })
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error ? requestError.message : "Could not update the soundtrack.",
        );
      })
      .finally(() => setSaving(false));
  };

  return (
    <section className="admin-soundtrack-settings" aria-labelledby="admin-soundtrack-title">
      <div>
        <p className="eyebrow">Superadmin setting</p>
        <h2 id="admin-soundtrack-title">Hardcore soundtrack</h2>
        <p>Use a public HTTPS SoundCloud track URL. Leave it empty to disable the player.</p>
      </div>
      <form
        onSubmit={save}
        toolname="saveHardcoreSoundtrack"
        tooldescription="Save the public SoundCloud URL used for the Hardcore soundtrack."
      >
        <label htmlFor="hardcore-soundtrack-url">SoundCloud URL</label>
        <div>
          <input
            disabled={loading || saving}
            id="hardcore-soundtrack-url"
            maxLength={2_048}
            name="url"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://soundcloud.com/artist/track"
            type="url"
            toolparamdescription="A public HTTPS SoundCloud track URL, or empty to disable the player."
            value={url}
          />
          <button className="button" disabled={loading || saving} type="submit">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {saved && <p className="admin-soundtrack-settings__saved">Soundtrack setting saved.</p>}
      </form>
    </section>
  );
}

function UserDetail({
  user,
  currentUserId,
  canManageAccount,
  onUpdate,
  onRemoveGuess,
  removingGuessId,
  updating,
}: {
  user: AdminUserDetail;
  currentUserId: string;
  canManageAccount: boolean;
  onUpdate: (update: {
    permission?: "user" | "developer";
    disabled?: boolean;
    disabledReason?: string;
    issueReportLimit?: number;
  }) => void;
  onRemoveGuess?: (gameKey: string, requestId: string) => void;
  removingGuessId: string | null;
  updating: boolean;
}) {
  const [disabledReason, setDisabledReason] = useState("");
  const [permission, setPermission] = useState<"user" | "developer">(
    user.permission === "developer" ? "developer" : "user",
  );
  const [issueReportLimit, setIssueReportLimit] = useState(user.issueReportLimit);
  const [gameHistoryPage, setGameHistoryPage] = useState(1);

  useEffect(() => {
    setPermission(user.permission === "developer" ? "developer" : "user");
    setIssueReportLimit(user.issueReportLimit);
    setDisabledReason("");
    setGameHistoryPage(1);
  }, [user.id, user.permission, user.disabledAt, user.issueReportLimit]);

  const canChangeUser =
    canManageAccount && user.id !== currentUserId && user.permission !== "superadmin";
  const gameHistoryPageSize = 3;
  const gameHistoryTotalPages = Math.max(
    1,
    Math.ceil(user.completions.length / gameHistoryPageSize),
  );
  const visibleGameHistoryPage = Math.min(gameHistoryPage, gameHistoryTotalPages);
  const visibleCompletions = user.completions.slice(
    (visibleGameHistoryPage - 1) * gameHistoryPageSize,
    visibleGameHistoryPage * gameHistoryPageSize,
  );

  return (
    <>
      <p className="eyebrow">Account record</p>
      <h2>{userName(user)}</h2>
      {user.displayName && <p className="admin-email">{user.email}</p>}
      {canChangeUser && (
        <section
          className="admin-detail-section admin-account-controls"
          aria-labelledby="admin-account-access-title"
        >
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Superadmin tools</p>
              <h3 id="admin-account-access-title">Account access</h3>
            </div>
          </div>
          <label htmlFor="admin-user-permission">Role</label>
          <div className="admin-control-row">
            <select
              id="admin-user-permission"
              disabled={updating}
              onChange={(event) => setPermission(event.target.value as "user" | "developer")}
              value={permission}
            >
              <option value="user">Player</option>
              <option value="developer">Administrator</option>
            </select>
            <button
              className="button"
              disabled={updating || permission === user.permission}
              onClick={() => onUpdate({ permission })}
              type="button"
            >
              Save role
            </button>
          </div>
          {user.disabledAt ? (
            <button
              className="button"
              disabled={updating}
              onClick={() => onUpdate({ disabled: false })}
              type="button"
            >
              Re-enable account
            </button>
          ) : (
            <div className="admin-disable-form">
              <label htmlFor="admin-disable-reason">Reason for disabling</label>
              <textarea
                id="admin-disable-reason"
                disabled={updating}
                maxLength={500}
                onChange={(event) => setDisabledReason(event.target.value)}
                placeholder="Explain why this account is being disabled"
                value={disabledReason}
              />
              <button
                className="button button--danger-solid"
                disabled={updating || !disabledReason.trim()}
                onClick={() => onUpdate({ disabled: true, disabledReason: disabledReason.trim() })}
                type="button"
              >
                Disable account
              </button>
            </div>
          )}
          <label htmlFor="admin-issue-report-limit">Issue reports per day</label>
          <div className="admin-control-row">
            <input
              id="admin-issue-report-limit"
              max={1000}
              min={3}
              onChange={(event) => setIssueReportLimit(Number(event.target.value))}
              type="number"
              value={issueReportLimit}
            />
            <button
              className="button"
              disabled={updating || issueReportLimit === user.issueReportLimit}
              onClick={() => onUpdate({ issueReportLimit })}
              type="button"
            >
              Save limit
            </button>
          </div>
        </section>
      )}

      <section className="admin-detail-section" aria-labelledby="admin-progress-title">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">Synced data</p>
            <h3 id="admin-progress-title">Progress record</h3>
          </div>
        </div>
        {user.progress ? (
          <AdminProgressRecord
            progress={user.progress}
            trajectoryReferenceModels={user.trajectoryReferenceModels ?? []}
            trajectoryTargets={user.trajectoryTargets ?? {}}
            onRemoveGuess={onRemoveGuess}
            removingGuessId={removingGuessId}
          />
        ) : (
          <p className="admin-empty">No progress has been synced from this account.</p>
        )}
      </section>

      <section className="admin-detail-section" aria-labelledby="admin-account-facts-title">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">Account record</p>
            <h3 id="admin-account-facts-title">Account details</h3>
          </div>
        </div>
        <dl className="admin-facts">
          <div>
            <dt>Account created</dt>
            <dd>{formatDate(user.createdAt)}</dd>
          </div>
          <div>
            <dt>Email status</dt>
            <dd>
              {user.emailVerifiedAt ? `Verified ${formatDate(user.emailVerifiedAt)}` : "Unverified"}
            </dd>
          </div>
          <div>
            <dt>Last session activity</dt>
            <dd>{formatDate(user.lastSeenAt)}</dd>
          </div>
          <div>
            <dt>Progress last synced</dt>
            <dd>{formatDate(user.progressUpdatedAt)}</dd>
          </div>
          <div>
            <dt>Sign-in provider</dt>
            <dd>{user.signInProviders.length ? user.signInProviders.join(", ") : "None"}</dd>
          </div>
          <div>
            <dt>Account access</dt>
            <dd>{user.disabledAt ? `Disabled ${formatDate(user.disabledAt)}` : "Active"}</dd>
          </div>
        </dl>
        {user.disabledAt && user.disabledReason && (
          <p className="admin-account-note">
            <strong>Disable reason:</strong> {user.disabledReason}
            {user.disabledByEmail && ` Set by ${user.disabledByEmail}.`}
          </p>
        )}
      </section>

      <section className="admin-detail-section" aria-labelledby="admin-completions-title">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">Game history</p>
            <h3 id="admin-completions-title">{user.completionCount} completions</h3>
          </div>
        </div>
        {visibleCompletions.length ? (
          <ol className="admin-completions">
            {visibleCompletions.map((completion) => (
              <li key={completion.challengeId}>
                <span>
                  <strong>{completion.challengeDate}</strong>
                  <small>{completion.mode}</small>
                </span>
                <span>
                  <strong>{completion.answerModelName}</strong>
                  <small>{formatDate(completion.completedAt)}</small>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="admin-empty">No account-linked challenge completions yet.</p>
        )}
        {gameHistoryTotalPages > 1 && (
          <div className="admin-pagination admin-pagination--compact">
            <button
              className="button"
              disabled={visibleGameHistoryPage === 1}
              onClick={() => setGameHistoryPage(visibleGameHistoryPage - 1)}
              type="button"
            >
              Previous
            </button>
            <span>
              Page {visibleGameHistoryPage} of {gameHistoryTotalPages}
            </span>
            <button
              className="button"
              disabled={visibleGameHistoryPage === gameHistoryTotalPages}
              onClick={() => setGameHistoryPage(visibleGameHistoryPage + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </>
  );
}
