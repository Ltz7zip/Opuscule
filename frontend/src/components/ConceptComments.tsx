import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, MessageSquare, Send, Trash2, X } from "lucide-react";

import {
  createWorldConceptComment,
  deleteWorldConceptComment,
  fetchWorldConceptComments,
  updateWorldConceptComment,
} from "../api";
import type { WorldConceptComment } from "../types";
import { confirmAction } from "../lib/dialogs";

interface ConceptCommentsProps {
  worldSlug: string;
  onClose: () => void;
}

/**
 * Member annotations on the world concept. Reuses the card comment classes so
 * the read page keeps one visual language without new CSS.
 */
export function ConceptComments({ worldSlug, onClose }: ConceptCommentsProps) {
  const [comments, setComments] = useState<WorldConceptComment[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchWorldConceptComments(worldSlug)
      .then((next) => {
        if (!cancelled) setComments(next);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "评论加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [worldSlug]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const roots = useMemo(() => comments.filter((item) => item.parent === null), [comments]);
  const repliesOf = (id: number) => comments.filter((item) => item.parent === id);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createWorldConceptComment(worldSlug, { body: body.trim() });
      setComments((current) => [...current, created]);
      setBody("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "评论发布失败");
    } finally {
      setSaving(false);
    }
  };

  const submitReply = async (parent: WorldConceptComment) => {
    if (!replyBody.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createWorldConceptComment(worldSlug, {
        body: replyBody.trim(),
        quote: parent.quote,
        anchor_id: parent.anchor_id,
        parent: parent.id,
      });
      setComments((current) => [...current, created]);
      setReplyBody("");
      setReplyTo(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回复失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleResolved = async (comment: WorldConceptComment) => {
    try {
      const updated = await updateWorldConceptComment(worldSlug, comment.id, {
        resolved: !comment.resolved,
      });
      setComments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新评论失败");
    }
  };

  const remove = async (comment: WorldConceptComment) => {
    if (!(await confirmAction({ title: "删除评论", body: "删除后无法恢复。", confirmLabel: "删除", danger: true }))) {
      return;
    }
    try {
      await deleteWorldConceptComment(worldSlug, comment.id);
      setComments((current) =>
        current.filter((item) => item.id !== comment.id && item.parent !== comment.id),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const renderComment = (comment: WorldConceptComment) => (
    <li key={comment.id} className={`comment-item${comment.resolved ? " resolved" : ""}`}>
      <div className="comment-meta">
        <b>{comment.author_name ?? "已注销成员"}</b>
        <span>{new Date(comment.updated_at).toLocaleDateString("zh-CN")}</span>
      </div>
      {comment.quote && <blockquote>{comment.quote}</blockquote>}
      <p>{comment.body}</p>
      <div className="comment-actions">
        <button type="button" onClick={() => void toggleResolved(comment)}>
          <Check size={13} /> {comment.resolved ? "重新打开" : "标记已解决"}
        </button>
        <button type="button" onClick={() => { setReplyTo(comment.id); setReplyBody(""); }}>
          <MessageSquare size={13} /> 回复
        </button>
        <button type="button" onClick={() => void remove(comment)}>
          <Trash2 size={13} /> 删除
        </button>
      </div>
      {replyTo === comment.id && (
        <form
          className="comment-reply-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitReply(comment);
          }}
        >
          <textarea
            value={replyBody}
            onChange={(event) => setReplyBody(event.target.value)}
            rows={2}
            placeholder="回复这条评论…"
            maxLength={2000}
          />
          <div>
            <button type="button" className="btn btn-secondary" onClick={() => setReplyTo(null)}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !replyBody.trim()}>
              回复
            </button>
          </div>
        </form>
      )}
      {repliesOf(comment.id).map((reply) => (
        <div className="comment-reply" key={reply.id}>
          {renderComment(reply)}
        </div>
      ))}
    </li>
  );

  return (
    <div className="comments-overlay" role="dialog" aria-modal="true" aria-label="世界概念评论">
      <div className="comments-panel">
        <div className="comments-head">
          <div>
            <p className="eyebrow">MEMBER NOTES</p>
            <strong>世界概念评论</strong>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭评论">
            <X size={16} />
          </button>
        </div>

        {error && <p className="form-hint error-text">{error}</p>}

        <div className="comments-list">
          {loading ? (
            <p className="comments-loading">正在加载评论…</p>
          ) : roots.length === 0 ? (
            <p className="comments-loading">还没有评论。写一条给同伴看。</p>
          ) : (
            <ul
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
                margin: 0,
                padding: 0,
                listStyle: "none",
              }}
            >
              {roots.map(renderComment)}
            </ul>
          )}
        </div>

        <form className="comments-form" onSubmit={submit}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            placeholder="对这篇世界概念说点什么…"
            maxLength={2000}
          />
          <button type="submit" className="btn btn-primary" disabled={saving || !body.trim()}>
            {saving ? <Loader2 size={14} className="spin" /> : <Send size={14} />} 发布评论
          </button>
        </form>
      </div>
    </div>
  );
}
