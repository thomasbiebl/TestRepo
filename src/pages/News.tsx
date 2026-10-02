import { useEffect } from 'react';
import { Badge } from '../components/ui';
import type { NewsPost } from '../domain/types';
import { useApp } from '../state/AppContext';
import { useNewsSeen } from '../state/newsSeen';

export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });

export const sortNews = (news: NewsPost[]) =>
  [...news].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));

export function NewsCard({ post }: { post: NewsPost }) {
  return (
    <article className={`card news${post.pinned ? ' hot' : ''}`}>
      <div className="row between">
        <span className="muted">{fmtDay(post.createdAt)}</span>
        {post.pinned && <Badge tone="red">Angepinnt</Badge>}
      </div>
      <h3>{post.title}</h3>
      <p className="prose">{post.body}</p>
    </article>
  );
}

export function News() {
  const { snap, user } = useApp();
  const { markSeen } = useNewsSeen(user?.id, snap?.news);
  useEffect(markSeen, [markSeen]);
  if (!snap) return null;
  const posts = sortNews(snap.news);
  return (
    <>
      <h1 className="title">News</h1>
      {posts.length === 0 && <p className="notice">Zurzeit gibt es keine Neuigkeiten.</p>}
      <div className="stack">
        {posts.map((p) => <NewsCard key={p.id} post={p} />)}
      </div>
    </>
  );
}
