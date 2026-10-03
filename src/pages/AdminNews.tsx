import { useState, type FormEvent } from 'react';
import { Badge } from '../components/ui';
import type { NewsInput } from '../data/DataService';
import type { NewsPost } from '../domain/types';
import { useApp } from '../state/AppContext';
import { fmtDay, sortNews } from './News';

function NewsForm({ initial, onSubmit, onCancel }: { initial: NewsInput; onSubmit: (i: NewsInput) => void; onCancel: () => void }) {
  const [f, setF] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(f);
  };
  return (
    <form className="card form" onSubmit={submit}>
      <label htmlFor="n-title">Titel</label>
      <input id="n-title" required maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <label htmlFor="n-body">Text</label>
      <textarea id="n-body" required rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      <label className="check" htmlFor="n-pin">
        <input id="n-pin" type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} />
        Oben anpinnen
      </label>
      <button className="btn">Veröffentlichen</button>
      <button type="button" className="btn ghost" onClick={onCancel}>Abbrechen</button>
    </form>
  );
}

export function AdminNews() {
  const { snap, user, act, data } = useApp();
  const [editing, setEditing] = useState<NewsPost | 'new' | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (!snap || !user) return null;

  const save = async (id: string | null, input: NewsInput) => {
    if (await act(() => data.saveNews(id, input, user.id), id ? 'News gespeichert.' : 'News veröffentlicht.')) setEditing(null);
  };

  return (
    <>
      <h1 className="title">News verwalten</h1>
      {editing ? (
        <NewsForm
          initial={editing === 'new' ? { title: '', body: '', pinned: false } : { title: editing.title, body: editing.body, pinned: editing.pinned }}
          onSubmit={(i) => void save(editing === 'new' ? null : editing.id, i)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button className="btn" onClick={() => setEditing('new')}>+ Neue News</button>
      )}
      <div className="stack">
        {sortNews(snap.news).map((n) => (
          <section key={n.id} className="card">
            <div className="row between">
              <span className="muted">{fmtDay(n.createdAt)}{n.updatedAt ? ' · bearbeitet' : ''}</span>
              {n.pinned && <Badge tone="red">Angepinnt</Badge>}
            </div>
            <h3>{n.title}</h3>
            <p className="prose muted">{n.body.length > 140 ? `${n.body.slice(0, 140)} …` : n.body}</p>
            <div className="chips">
              <button className="chip" onClick={() => setEditing(n)}>Bearbeiten</button>
              <button className="chip" onClick={() => void act(() => data.saveNews(n.id, { title: n.title, body: n.body, pinned: !n.pinned }, user.id), n.pinned ? 'Nicht mehr angepinnt.' : 'Angepinnt.')}>
                {n.pinned ? 'Lösen' : 'Anpinnen'}
              </button>
              {confirmId === n.id ? (
                <>
                  <button className="chip danger" onClick={() => { setConfirmId(null); void act(() => data.deleteNews(n.id), 'News gelöscht.'); }}>Wirklich löschen</button>
                  <button className="chip" onClick={() => setConfirmId(null)}>Abbrechen</button>
                </>
              ) : (
                <button className="chip" onClick={() => setConfirmId(n.id)}>Löschen</button>
              )}
            </div>
          </section>
        ))}
        {snap.news.length === 0 && <p className="muted">Noch keine News veröffentlicht.</p>}
      </div>
    </>
  );
}
