import { useCallback, useEffect, useState } from 'react';
import type { NewsPost } from '../domain/types';

const EVENT = 'fanclub:news-seen';
const key = (userId: string) => `fanclub.newsSeen.${userId}`;

export const latestNewsStamp = (news: NewsPost[]): string => news.reduce((m, n) => ((n.updatedAt ?? n.createdAt) > m ? (n.updatedAt ?? n.createdAt) : m), '');

function read(userId: string): string {
  try {
    return localStorage.getItem(key(userId)) ?? '';
  } catch {
    return '';
  }
}

/** Tells whether there is news the user has not opened yet, and lets the news page mark it as read. */
export function useNewsSeen(userId: string | undefined, news: NewsPost[] | undefined) {
  const [seen, setSeen] = useState(() => (userId ? read(userId) : ''));

  useEffect(() => {
    if (!userId) return;
    setSeen(read(userId));
    const onChange = () => setSeen(read(userId));
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [userId]);

  const latest = news ? latestNewsStamp(news) : '';
  const markSeen = useCallback(() => {
    if (!userId || !latest) return;
    try {
      localStorage.setItem(key(userId), latest);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVENT));
  }, [userId, latest]);

  return { hasUnread: latest !== '' && latest > seen, markSeen };
}
