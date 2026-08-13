"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { canManageUsers } from "@/lib/auth/permissions";
import { apiClient, type AdminUserDetail, type AdminUserSummary } from "@/lib/api/client";
import { useAuth } from "../components/auth/useAuth";
import { SiteNavbar } from "../components/ui/SiteNavbar";

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

export default function AdminPage() {
  const router = useRouter();
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
  const detailRequestId = useRef(0);

  useEffect(() => {
    if (!loading && (!user || !canManageUsers(user.permission))) router.replace("/");
  }, [loading, router, user]);

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
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load users.");
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
        setError(requestError instanceof Error ? requestError.message : "Could not load user data.");
      })
      .finally(() => {
        if (detailRequestId.current === requestId) setLoadingDetail(false);
      });
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    detailRequestId.current += 1;
    setSelectedUser(null);
    setPage(1);
    setQuery(queryInput.trim());
  };

  if (loading || !user || !canManageUsers(user.permission)) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="page admin-page">
      <SiteNavbar />
      <p className="eyebrow">Restricted area</p>
      <h1>Admin</h1>
      <p className="lede">Inspect registered accounts and their synced game data. Authentication secrets are never shown here.</p>

      <section className="admin-workspace" aria-label="User administration">
        <div className="admin-users-panel">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Accounts</p>
              <h2>{total} users</h2>
            </div>
          </div>
          <form className="admin-search" onSubmit={submitSearch}>
            <label htmlFor="admin-user-search">Find by email or name</label>
            <div>
              <input
                id="admin-user-search"
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="name@example.com"
                type="search"
                value={queryInput}
              />
              <button className="button" type="submit">Search</button>
            </div>
          </form>
          {error && <p className="notice" role="alert">{error}</p>}
          <div className="admin-user-list" aria-busy={loadingUsers}>
            {loadingUsers && <p className="admin-empty">Loading users...</p>}
            {!loadingUsers && users.length === 0 && <p className="admin-empty">No users match this search.</p>}
            {!loadingUsers && users.map((item) => (
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
                  <small>{item.completionCount} completions</small>
                </span>
              </button>
            ))}
          </div>
          {total > 0 && (
            <div className="admin-pagination">
              <button className="button" disabled={page === 1 || loadingUsers} onClick={() => setPage(page - 1)} type="button">Previous</button>
              <span>Page {page} of {totalPages}</span>
              <button className="button" disabled={page === totalPages || loadingUsers} onClick={() => setPage(page + 1)} type="button">Next</button>
            </div>
          )}
        </div>

        <aside className="admin-detail-panel" aria-live="polite">
          {loadingDetail && <p className="admin-empty">Loading user data...</p>}
          {!loadingDetail && !selectedUser && <p className="admin-empty">Choose an account to see its stored progress and completed challenges.</p>}
          {!loadingDetail && selectedUser && <UserDetail user={selectedUser} />}
        </aside>
      </section>
    </main>
  );
}

function UserDetail({ user }: { user: AdminUserDetail }) {
  return (
    <>
      <p className="eyebrow">Account record</p>
      <h2>{userName(user)}</h2>
      {user.displayName && <p className="admin-email">{user.email}</p>}
      <dl className="admin-facts">
        <div><dt>Account created</dt><dd>{formatDate(user.createdAt)}</dd></div>
        <div><dt>Email status</dt><dd>{user.emailVerifiedAt ? `Verified ${formatDate(user.emailVerifiedAt)}` : "Unverified"}</dd></div>
        <div><dt>Last session activity</dt><dd>{formatDate(user.lastSeenAt)}</dd></div>
        <div><dt>Progress last synced</dt><dd>{formatDate(user.progressUpdatedAt)}</dd></div>
      </dl>

      <section className="admin-detail-section" aria-labelledby="admin-completions-title">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">Game history</p>
            <h3 id="admin-completions-title">{user.completionCount} completions</h3>
          </div>
        </div>
        {user.completions.length ? (
          <ol className="admin-completions">
            {user.completions.map((completion) => (
              <li key={completion.challengeId}>
                <span><strong>{completion.challengeDate}</strong><small>{completion.mode}</small></span>
                <span><strong>{completion.answerModelName}</strong><small>{formatDate(completion.completedAt)}</small></span>
              </li>
            ))}
          </ol>
        ) : <p className="admin-empty">No account-linked challenge completions yet.</p>}
      </section>

      <section className="admin-detail-section" aria-labelledby="admin-progress-title">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">Synced data</p>
            <h3 id="admin-progress-title">Progress record</h3>
          </div>
        </div>
        {user.progress ? <pre className="admin-progress">{JSON.stringify(user.progress, null, 2)}</pre> : <p className="admin-empty">No progress has been synced from this account.</p>}
      </section>
    </>
  );
}
