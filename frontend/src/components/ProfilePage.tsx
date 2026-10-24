import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Globe2,
  Loader2,
  MapPin,
  PencilLine,
  Save,
  X,
} from "lucide-react";

import { fetchProfile, updateMyProfile } from "../api";
import { useDocumentMeta } from "../lib/meta";
import { useSharedSource } from "../lib/viewTransition";
import type { ProfileData, ProfileWorld, SessionState } from "../types";
import { ChangePasswordPanel } from "./ChangePasswordPanel";
import { SiteFoot } from "./SiteFoot";
import { SiteHeader } from "./SiteHeader";

const typeLabels: Record<string, string> = {
  character: "角色",
  place: "地点",
  event: "事件",
  note: "笔记",
  tool: "工具",
};

interface ProfilePageProps {
  username: string;
  session: SessionState | null;
  onLogout: () => void;
  initialProfile?: ProfileData;
}

interface EditState {
  display_name: string;
  headline: string;
  bio: string;
  location: string;
  website: string;
  pinned: number[];
  is_public: boolean;
}

function editState(profile: ProfileData): EditState {
  return {
    display_name: profile.display_name,
    headline: profile.headline,
    bio: profile.bio,
    location: profile.location,
    website: profile.website,
    pinned: profile.pinned,
    is_public: profile.is_public,
  };
}

function ProfileLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="profile-link" href={href}>
      {children}
    </a>
  );
}

function WorldRow({ world }: { world: ProfileWorld }) {
  const source = useSharedSource("icon", world.slug);
  return (
    <a
      className="profile-world-row"
      href={`/w/${world.slug}/wiki`}
      onPointerEnter={source.onPointerEnter}
      onPointerLeave={source.onPointerLeave}
      onFocus={source.onFocus}
      onBlur={source.onBlur}
      onTouchStart={source.onTouchStart}
    >
      <span className="profile-world-initial" ref={source.ref} aria-hidden="true">
        {world.name.trim().slice(0, 1)}
      </span>
      <span className="profile-world-name">{world.name}</span>
      <span className="profile-world-count">{world.card_count} 张卡片</span>
      <ArrowUpRight size={16} />
    </a>
  );
}

export function ProfilePage({ username, session, onLogout, initialProfile }: ProfilePageProps) {
  const [profile, setProfile] = useState<ProfileData | null>(initialProfile ?? null);
  const [loading, setLoading] = useState(!initialProfile);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(initialProfile ? editState(initialProfile) : null);
  const [saving, setSaving] = useState(false);

  useDocumentMeta({
    title: profile ? `${profile.name} · Opuscule` : "个人主页 · Opuscule",
    description: profile?.bio?.slice(0, 180) || profile?.headline,
    canonicalPath: `/u/${username}`,
    noindex: profile ? !profile.is_public : false,
    type: "profile",
  });

  useEffect(() => {
    if (initialProfile) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchProfile(username)
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setEdit(editState(data));
        document.title = `${data.name} · Opuscule`;
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "个人主页加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialProfile, username]);

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMyProfile({
        display_name: edit.display_name,
        headline: edit.headline,
        bio: edit.bio,
        location: edit.location,
        website: edit.website,
        pinned: edit.pinned,
        is_public: edit.is_public,
      });
      setProfile(updated);
      setEdit(editState(updated));
      setEditing(false);
      document.title = `${updated.name} · Opuscule`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const togglePinned = (id: number) => {
    if (!edit) return;
    setEdit({
      ...edit,
      pinned: edit.pinned.includes(id)
        ? edit.pinned.filter((value) => value !== id)
        : [...edit.pinned, id].slice(0, 12),
    });
  };

  return (
    <div className="app-shell profile-page">
      <SiteHeader session={session} onLogout={onLogout} />

      <main id="main-content" tabIndex={-1} className="profile-shell">
        {loading && (
          <div className="loading">
            <Loader2 size={16} className="spin" />
            正在打开个人主页…
          </div>
        )}

        {error && !profile && (
          <div className="error" role="alert">
            {error}
            <a className="btn btn-secondary" style={{ marginLeft: "auto" }} href="/">
              返回首页
            </a>
          </div>
        )}

        {profile && (
          <>
            <header className="profile-hero">
              <div className="profile-avatar" aria-hidden="true">
                {profile.avatar_initial}
              </div>
              <div className="profile-identity">
                <div className="eyebrow">
                  <Globe2 size={16} />
                  个人主页 · @{profile.username}
                </div>
                <h1>{profile.name}</h1>
                <p className="profile-handle">@{profile.username}</p>
                <div className="profile-meta">
                  {profile.location && (
                    <span>
                      <MapPin size={16} /> {profile.location}
                    </span>
                  )}
                  {profile.website && (
                    <ProfileLink href={profile.website}>
                      <Globe2 size={16} /> {profile.website}
                    </ProfileLink>
                  )}
                  {profile.links.map((link) => (
                    <ProfileLink key={`${link.label}-${link.url}`} href={link.url}>
                      {link.label} <ArrowUpRight size={16} />
                    </ProfileLink>
                  ))}
                </div>
                <div className="profile-actions">
                  {profile.is_owner && (
                    <button type="button" className="btn btn-primary" onClick={() => setEditing((value) => !value)}>
                      {editing ? <X size={16} /> : <PencilLine size={16} />}
                      {editing ? "取消编辑" : "编辑资料"}
                    </button>
                  )}
                  <a
                    className="btn btn-secondary"
                    href={`/w/${profile.pinned_worlds[0]?.slug ?? profile.worlds[0]?.slug ?? "wuhai"}`}
                  >
                    进入工作区
                  </a>
                  {profile.is_owner && (
                    <>
                      <a className="btn btn-secondary" href="/worlds/new">
                        新建世界
                      </a>
                      <a className="btn btn-secondary" href="/trash">
                        回收站
                      </a>
                    </>
                  )}
                </div>
              </div>
            </header>

            <div className="profile-layout">
              <aside className="profile-col-side">
                <section className="profile-block">
                  <h2>个人简介</h2>
                  {profile.headline && <p className="profile-headline">{profile.headline}</p>}
                  {profile.bio ? (
                    <p className="profile-bio">{profile.bio}</p>
                  ) : (
                    <p className="block-empty">还没有写简介。</p>
                  )}
                </section>
                <section className="profile-block">
                  <h2>数字统计</h2>
                  <div className="profile-stats" aria-label="统计">
              <div>
                <strong>{profile.stats.worlds}</strong>
                <span>个世界</span>
              </div>
              <div>
                <strong>{profile.stats.cards}</strong>
                <span>张公开卡片</span>
              </div>
              <div>
                <strong>{profile.pinned_worlds.length}</strong>
                <span>个精选</span>
              </div>
                  </div>
                </section>

                {profile.is_owner && <ChangePasswordPanel />}

            {editing && edit && (
              <section className="panel profile-edit" aria-label="编辑个人资料">
                <div className="profile-edit-head">
                  <div>
                    <div className="sidebar-title">编辑个人资料</div>
                    <div className="sidebar-sub">资料与链接会公开展示，正文排版随世界 Wiki 一同呈现。</div>
                  </div>
                  <button type="button" className="icon-btn" aria-label="关闭编辑" onClick={() => setEditing(false)}>
                    <X size={16} />
                  </button>
                </div>

                {error && <div className="form-error" role="alert">{error}</div>}

                <div className="profile-edit-grid">
                  <label className="field">
                    <span>显示名</span>
                    <input value={edit.display_name} onChange={(event) => setEdit({ ...edit, display_name: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>一句话简介</span>
                    <input value={edit.headline} onChange={(event) => setEdit({ ...edit, headline: event.target.value })} />
                  </label>
                  <label className="field field-wide">
                    <span>简介</span>
                    <textarea
                      rows={4}
                      value={edit.bio}
                      onChange={(event) => setEdit({ ...edit, bio: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>所在地</span>
                    <input value={edit.location} onChange={(event) => setEdit({ ...edit, location: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>网站</span>
                    <input value={edit.website} onChange={(event) => setEdit({ ...edit, website: event.target.value })} />
                  </label>
                </div>

                <div className="profile-edit-row">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={edit.is_public}
                      onChange={(event) => setEdit({ ...edit, is_public: event.target.checked })}
                    />
                    公开个人主页
                  </label>
                  <span className="meta">关闭后，只有你自己和 staff 能访问。</span>
                </div>

                <div className="profile-edit-row profile-pinned">
                  <span className="sidebar-section-label">精选世界</span>
                  <div className="profile-pinned-list">
                    {profile.worlds.map((world) => (
                      <label className="checkbox-row" key={world.id}>
                        <input
                          type="checkbox"
                          checked={edit.pinned.includes(world.id)}
                          onChange={() => togglePinned(world.id)}
                        />
                        {world.name}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="profile-edit-actions">
                  <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
                    {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                    {saving ? "保存中…" : "保存资料"}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                    取消
                  </button>
                </div>
              </section>
            )}

              </aside>
              <section className="profile-col-main">
                <section className="profile-section">
                  <div className="section-head">
                    <h2>精选世界</h2>
                <span>置顶的公开入口</span>
              </div>
              {profile.pinned_worlds.length > 0 ? (
                <div className="profile-grid">
                  {profile.pinned_worlds.map((world) => (
                    <a className="profile-world-card" key={world.id} href={`/w/${world.slug}/wiki`}>
                      <span className="type">{world.kind === "private" ? "私人世界" : "共建世界"}</span>
                      <h3>{world.name}</h3>
                      <p>{world.card_count} 张公开卡片</p>
                      <span className="arrow">进入 <ArrowUpRight size={16} /></span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="profile-empty">还没有精选世界。</p>
              )}
            </section>

            {profile.recent_cards.length > 0 && (
              <section className="profile-section">
                <div className="section-head">
                  <h2>最近公开卡片</h2>
                  <span>来自精选与公开世界</span>
                </div>
                <div className="profile-card-list">
                  {profile.recent_cards.map((card) => (
                    <a
                      className="profile-card-row"
                      key={card.id}
                      href={`/w/${card.world_slug}/wiki/${card.slug}`}
                    >
                      <div>
                        <span className="type">{card.world_name} · {typeLabels[card.type_key] ?? (card.type_key || "卡片")}</span>
                        <h3>{card.title}</h3>
                        <p>{card.excerpt || "打开工作区阅读。"}</p>
                      </div>
                      <ArrowUpRight size={16} />
                    </a>
                  ))}
                </div>
              </section>
            )}

            <section className="profile-section">
              <div className="section-head">
                <h2>全部世界</h2>
                <span>{profile.worlds.length} 个</span>
              </div>
              <div className="profile-world-list">
                {profile.worlds.map((world) => (
                  <WorldRow key={world.id} world={world} />
                ))}
              </div>
                </section>
              </section>
            </div>
          </>
        )}
      </main>
      <SiteFoot authenticated={Boolean(session?.authenticated)} />
    </div>
  );
}
