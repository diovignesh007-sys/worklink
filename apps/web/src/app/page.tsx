'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useUI } from '@/lib/store';
import type { FeedPost, FeedResponse, FeedTab } from '@worklink/types';
import { JobCard } from '@/components/job-card';
import { EmptyState, Skeleton } from '@/components/ui';

const PAGE = 10;

export default function FeedPage() {
  const [tab, setTab] = useState<FeedTab>('nearby');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pull, setPull] = useState(0);
  const newPostsCount = useUI((s) => s.newPostsCount);
  const setNewPostsCount = useUI((s) => s.setNewPostsCount);
  const qc = useQueryClient();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const pullStart = useRef<number | null>(null);

  const loadPage = useCallback(
    async (nextTab: FeedTab, cur: string | null, replace: boolean) => {
      setLoading(true);
      try {
        const pos = getStoredPosition();
        const res: FeedResponse = await api.feed(nextTab, {
          cursor: cur ?? undefined,
          limit: PAGE,
          lat: pos?.lat,
          lng: pos?.lng,
        });
        setPosts((prev) => (replace ? res.data : [...prev, ...res.data.filter((p) => !prev.some((q) => q.job.id === p.job.id))]));
        setCursor(res.meta.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    // scroll restoration on back navigation (§5.2)
    const saved = sessionStorage.getItem('wl_feed_scroll');
    savedScroll.current = saved ? Number(saved) : 0;
    void loadPage(tab, null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setRefreshing(true);
    await loadPage(tab, null, true);
    setRefreshing(false);
  }

  function switchTab(next: FeedTab) {
    if (next === tab) return;
    setTab(next);
    setPosts([]);
    setCursor(null);
    void loadPage(next, null, true);
  }

  function acceptNewPosts() {
    setNewPostsCount(0);
    void refresh();
  }

  // Pull to refresh (touch)
  function onTouchStart(e: React.TouchEvent) {
    if (window.scrollY <= 2) pullStart.current = e.touches[0]?.clientY ?? null;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (pullStart.current !== null) {
      const delta = (e.touches[0]?.clientY ?? 0) - pullStart.current;
      setPull(Math.min(Math.max(delta, 0), 80));
    }
  }
  function onTouchEnd() {
    if (pull > 60) void refresh();
    setPull(0);
    pullStart.current = null;
  }

  return (
    <div ref={scrollParentRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* New posts pill */}
      {newPostsCount > 0 && (
        <div className="sticky top-14 z-20 flex justify-center pt-2 pointer-events-none">
          <button onClick={acceptNewPosts} className="pointer-events-auto bg-primary text-on-primary text-sm font-bold rounded-full px-4 py-1.5 shadow-lg animate-bounce">
            ↑ {newPostsCount} new post{newPostsCount > 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label="Feed tabs" className="sticky top-14 z-10 bg-bg/95 backdrop-blur">
        <div className="max-w-xl mx-auto flex border-b border-line">
          {(['nearby', 'matched', 'all'] as FeedTab[]).map((tl) => (
            <button
              key={tl}
              role="tab"
              aria-selected={tab === tl}
              onClick={() => switchTab(tl)}
              className={`flex-1 py-3 text-sm font-semibold capitalize border-b-2 -mb-px transition-colors ${
                tab === tl ? 'border-primary text-text' : 'border-transparent text-subtle'
              }`}
            >
              {tl === 'nearby' ? 'Nearby' : tl === 'matched' ? 'Matched' : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ transform: pull > 0 ? `translateY(${pull * 0.4}px)` : undefined, transition: pull === 0 ? 'transform .2s' : undefined }}>
        {posts.length === 0 && loading ? (
          <div className="space-y-4 p-3" aria-label="Loading feed">
            <Skeleton className="h-12" />
            <Skeleton className="aspect-[4/3]" />
            <Skeleton className="h-16" />
            <Skeleton className="h-12" />
            <Skeleton className="aspect-[4/3]" />
            <Skeleton className="h-16" />
          </div>
        ) : posts.length === 0 && !loading ? (
          <EmptyState icon="🧭" title="Nothing here yet" hint="Try the All tab, widen your location in your profile, or check back soon." />
        ) : (
          <Virtuoso
            initialTopMostItemIndex={savedScroll.current > 0 ? Math.floor(savedScroll.current / 400) : 0}
            totalCount={posts.length}
            itemContent={(i) => <JobCard post={posts[i]!} index={i} />}
            endReached={() => {
              if (cursor && !loading) void loadPage(tab, cursor, false);
            }}
            increaseViewportBy={{ top: 200, bottom: 600 }}
            components={{
              Footer: () =>
                loading && posts.length > 0 ? (
                  <div className="p-3 space-y-2" aria-label="Loading more">
                    <Skeleton className="h-24" />
                    <Skeleton className="h-24" />
                  </div>
                ) : posts.length > 0 ? (
                  <div className="text-center text-xs text-subtle py-6">You&apos;re all caught up ✨</div>
                ) : null,
            }}
            style={{ height: 'calc(100dvh - 120px)' }}
          />
        )}
      </div>
    </div>
  );
}

function getStoredPosition(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem('wl_position');
    return raw ? (JSON.parse(raw) as { lat: number; lng: number }) : null;
  } catch {
    return null;
  }
}
