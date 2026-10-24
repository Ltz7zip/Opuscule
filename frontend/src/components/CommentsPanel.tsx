import { useEffect, useState } from "react";
import { Check, Loader2, MessageSquare, Send, Trash2, X } from "lucide-react";

import { createCardComment, deleteCardComment, fetchCardComments, updateCardComment } from "../api";
import type { CardComment } from "../types";
import { confirmAction } from "../lib/dialogs";

interface CommentsPanelProps {
  worldSlug: string;
  cardId: number;
  quote: string;
  anchorId?: string;
  onCreated?: (comment: CardComment) => void;
  onClose: () => void;
}

export function CommentsPanel({ worldSlug, cardId, quote, anchorId, onCreated, onClose }: CommentsPanelProps) {
  const [comments, setComments] = useState<CardComment[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchCardComments(worldSlug, cardId)
      .then((next) => { if (!cancelled) setComments(next); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "评论加载失败"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cardId, worldSlug]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createCardComment(worldSlug, cardId, { body: body.trim(), quote, anchor_id: anchorId || "" });
      setComments((current) => [...current, created]);
      setBody("");
      onCreated?.(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "评论发布失败");
    } finally {
      setSaving(false);
    }
  };

  const submitReply = async (parent: CardComment) => {
    if (!replyBody.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createCardComment(worldSlug, cardId, {
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

  const toggleResolved = async (comment: CardComment) => {
    try {
      const updated = await updateCardComment(worldSlug, cardId, comment.id, { resolved: !comment.resolved });
      setComments((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新评论失败");
    }
  };

  const remove = async (comment: CardComment) => {
    const confirmed = await confirmAction({
      title: "删除这条评论？",
      body: "删除后无法恢复，评论锚点也会一并移除。",
      confirmLabel: "删除",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteCardComment(worldSlug, cardId, comment.id);
      setComments((current) => current.filter((item) => item.id !== comment.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除评论失败");
    }
  };

  return (
    <div className="comments-overlay" role="dialog" aria-modal="true" aria-label="评论">
      <aside className="comments-panel">
        <header className="comments-head">
          <div>
            <span className="eyebrow">讨论</span>
            <strong>评论</strong>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭评论"><X size={16} /></button>
        </header>
        {quote && <blockquote className="comments-quote">{quote}</blockquote>}
        {loading && <div className="comments-loading"><Loader2 size={16} className="spin" /> 加载评论…</div>}
        {error && <p className="form-hint error-text" role="alert">{error}</p>}
        <div className="comments-list">
          {!loading && comments.length === 0 && <p className="form-hint">还没有评论。选中文字后打开评论，会带上引文。</p>}
          {comments.filter((comment) => comment.parent === null).map((comment) => {
            const replies = comments.filter((item) => item.parent === comment.id);
            return (
              <article className={`comment-item${comment.resolved ? " resolved" : ""}`} key={comment.id}>
                <div className="comment-meta">
                  <b>{comment.author_name ?? "已注销成员"}</b>
                  <time>{new Date(comment.created_at).toLocaleDateString("zh-CN")}</time>
                </div>
                {comment.quote && <blockquote>{comment.quote}</blockquote>}
                <p>{comment.body}</p>
                {comment.anchor_id && <small className="comment-anchor-note">已锚定选区</small>}
                {replies.map((reply) => (
                  <div className="comment-reply" key={reply.id}>
                    <div className="comment-meta">
                      <b>{reply.author_name ?? "已注销成员"}</b>
                      <time>{new Date(reply.created_at).toLocaleDateString("zh-CN")}</time>
                    </div>
                    <p>{reply.body}</p>
                    <div className="comment-actions">
                      <button type="button" onClick={() => void toggleResolved(reply)}>
                        <Check size={16} /> {reply.resolved ? "重新打开" : "标记解决"}
                      </button>
                      <button type="button" onClick={() => void remove(reply)} aria-label="删除回复"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
                {replyTo === comment.id ? (
                  <div className="comment-reply-form">
                    <textarea autoFocus rows={2} maxLength={2000} value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder="回复…" />
                    <div>
                      <button type="button" className="btn btn-secondary" onClick={() => { setReplyTo(null); setReplyBody(""); }}>取消</button>
                      <button type="button" className="btn btn-primary" disabled={saving || !replyBody.trim()} onClick={() => void submitReply(comment)}>回复</button>
                    </div>
                  </div>
                ) : (
                  <div className="comment-actions">
                    <button type="button" onClick={() => { setReplyTo(comment.id); setReplyBody(""); }}>
                      <MessageSquare size={16} /> 回复
                    </button>
                    <button type="button" onClick={() => void toggleResolved(comment)}>
                      <Check size={16} /> {comment.resolved ? "重新打开" : "标记解决"}
                    </button>
                    <button type="button" onClick={() => void remove(comment)} aria-label="删除评论"><Trash2 size={16} /></button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
        <form className="comments-form" onSubmit={submit}>
          <textarea
            rows={3}
            maxLength={2000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={quote ? "针对这段引文写评论…" : "写一条卡片评论…"}
          />
          <button type="submit" className="btn btn-primary" disabled={saving || !body.trim()}>
            {saving ? <Loader2 size={16} className="spin" /> : <Send size={16} />} 发布
          </button>
        </form>
      </aside>
    </div>
  );
}
