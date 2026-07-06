import React from 'react';
import { createRoot } from 'react-dom/client';
import { Check, ChevronLeft, Headphones, ListChecks, Moon, Play, RotateCcw, Search, Sun, Undo2 } from 'lucide-react';
import packageJson from '../package.json';
import './styles.css';

const modules = import.meta.glob('../json/**/*.json', { eager: true });

function pick(source, keys, fallback = '') {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null && source[key] !== '') {
      return source[key];
    }
  }
  return fallback;
}

function flattenJson(value, fileLabel) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.songs)) return value.songs;
  if (Array.isArray(value?.tracks)) return value.tracks;
  if (Array.isArray(value?.items)) return value.items;
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([group, entries]) => {
      if (!Array.isArray(entries)) return [];
      return entries.map((entry) => ({ chapter: group, ...entry }));
    });
  }
  return [];
}

function spotifyEmbedUrl(urlOrId, theme = 0) {
  if (!urlOrId) return '';
  const text = String(urlOrId);
  const match = text.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]+)/) || text.match(/^spotify:track:([A-Za-z0-9]+)$/);
  const id = match?.[1] || (/^[A-Za-z0-9]{22}$/.test(text) ? text : '');
  return id ? `https://open.spotify.com/embed/track/${id}?utm_source=generator&theme=${theme}` : '';
}

const songs = Object.entries(modules).flatMap(([path, module]) => {
  const fileLabel = path.replace('../json/', '').replace(/\.json$/i, '');
  return flattenJson(module.default, fileLabel).map((raw, index) => {
    const title = pick(raw, ['title', 'name', 'song', 'trackName', 'track_name', '曲名'], `Untitled ${index + 1}`);
    const artist = pick(raw, ['artist', 'artists', 'singer', 'vocal', 'artistName', 'artist_name', 'アーティスト']);
    const chapter = pick(raw, ['chapter', 'category', 'album', 'group', 'section', 'チャプター'], fileLabel);
    const previewUrl = pick(raw, ['preview_url', 'previewUrl', 'preview', 'audio', 'audioUrl', 'audio_url']);
    const spotifyUrl = pick(raw, ['spotify_url', 'spotifyUrl', 'spotify', 'external_url', 'externalUrl', 'url']);
    return {
      id: pick(raw, ['id', 'track_id', 'trackId'], `${fileLabel}-${index}-${title}`),
      title: String(title),
      artist: Array.isArray(artist) ? artist.join(', ') : String(artist || ''),
      chapter: String(chapter || fileLabel),
      previewUrl: String(previewUrl || ''),
      spotifyUrl: String(spotifyUrl || ''),
      spotifyId: spotifyEmbedUrl(spotifyUrl) ? String(spotifyUrl) : '',
      raw,
    };
  });
});

function* heapTopGenerator(inputItems, limit) {
  const heap = [...inputItems];
  const compare = function* (a, b) {
    return yield { left: a, right: b };
  };

  function* siftDown(end, root) {
    while (true) {
      let child = root * 2 + 1;
      if (child >= end) return;
      let swap = root;

      if ((yield* compare(heap[child], heap[swap])) === 'left') swap = child;
      if (child + 1 < end && (yield* compare(heap[child + 1], heap[swap])) === 'left') swap = child + 1;
      if (swap === root) return;

      [heap[root], heap[swap]] = [heap[swap], heap[root]];
      root = swap;
    }
  }

  for (let start = Math.floor(heap.length / 2) - 1; start >= 0; start -= 1) {
    yield* siftDown(heap.length, start);
  }

  const ranking = [];
  for (let end = heap.length - 1; end >= 0 && ranking.length < limit; end -= 1) {
    [heap[0], heap[end]] = [heap[end], heap[0]];
    ranking.push(heap[end]);
    yield { progressOnly: true, ranking: [...ranking] };
    yield* siftDown(end, 0);
  }

  return ranking;
}

function resolveSortState(inputSongs, limit, answers) {
  const generator = heapTopGenerator(inputSongs, Math.min(limit, inputSongs.length));
  let ranking = [];
  let next = generator.next();

  for (const answer of answers) {
    if (next.done) return { battle: null, ranking: next.value, done: true };
    next = generator.next(answer);
    while (!next.done && next.value?.progressOnly) {
      ranking = next.value.ranking;
      next = generator.next();
    }
  }

  if (next.done) return { battle: null, ranking: next.value, done: true };
  return { battle: next.value, ranking, done: false };
}

function SongPreview({ song, compact = false, darkMode = false }) {
  return (
    <div className={compact ? 'song-preview compact' : 'song-preview'}>
      <div>
        <h3>{song.title}</h3>
      </div>
      <SongMedia song={song} compact={compact} darkMode={darkMode} />
    </div>
  );
}

function SongMedia({ song, compact = false, darkMode = false }) {
  const embedUrl = spotifyEmbedUrl(song.spotifyUrl, darkMode ? 1 : 0);

  return (
    <div className={compact ? 'song-media compact' : 'song-media'}>
      {song.previewUrl ? (
        <audio controls src={song.previewUrl} preload="none" />
      ) : embedUrl ? (
        <iframe
          title={`${song.title} Spotify preview`}
          src={embedUrl}
          width="100%"
          height={compact ? '80' : '152'}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      ) : (
        <div className="missing-preview">
          <Headphones size={20} />
          <span>プレビュー未登録</span>
        </div>
      )}
    </div>
  );
}

function AutoScrollTitle({ children }) {
  const containerRef = React.useRef(null);
  const textRef = React.useRef(null);
  const [scrollDistance, setScrollDistance] = React.useState(0);

  React.useEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      const text = textRef.current;
      if (!container || !text) return;
      setScrollDistance(Math.max(0, text.scrollWidth - container.clientWidth));
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    if (textRef.current) resizeObserver.observe(textRef.current);
    return () => resizeObserver.disconnect();
  }, [children]);

  return (
    <strong
      ref={containerRef}
      className={scrollDistance > 0 ? 'auto-title is-overflowing' : 'auto-title'}
      style={{ '--scroll-distance': `${scrollDistance}px` }}
    >
      <span ref={textRef}>{children}</span>
    </strong>
  );
}

function App() {
  const chapters = React.useMemo(() => [...new Set(songs.map((song) => song.chapter))].sort(), []);
  const [selectedIds, setSelectedIds] = React.useState(() => new Set(songs.map((song) => song.id)));
  const [limit, setLimit] = React.useState(10);
  const [query, setQuery] = React.useState('');
  const [battle, setBattle] = React.useState(null);
  const [ranking, setRanking] = React.useState([]);
  const [answers, setAnswers] = React.useState([]);
  const [mode, setMode] = React.useState('select');
  const [darkMode, setDarkMode] = React.useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  React.useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  const selectedSongs = React.useMemo(() => songs.filter((song) => selectedIds.has(song.id)), [selectedIds]);
  const filteredSongs = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return songs;
    return songs.filter((song) => [song.title, song.chapter].join(' ').toLowerCase().includes(needle));
  }, [query]);
  const songsByChapter = React.useMemo(
    () =>
      chapters.map((chapter) => ({
        chapter,
        songs: filteredSongs.filter((song) => song.chapter === chapter),
      })),
    [chapters, filteredSongs],
  );

  function toggleSong(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function setChapter(chapter, checked) {
    setSelectedIds((current) => {
      const next = new Set(current);
      songs.filter((song) => song.chapter === chapter).forEach((song) => {
        checked ? next.add(song.id) : next.delete(song.id);
      });
      return next;
    });
  }

  function startSort() {
    const state = resolveSortState(selectedSongs, limit, []);
    setAnswers([]);
    setRanking(state.ranking);
    setBattle(state.battle);
    setMode('sort');
  }

  function choose(side) {
    const nextAnswers = [...answers, side];
    const state = resolveSortState(selectedSongs, limit, nextAnswers);
    setAnswers(nextAnswers);
    setRanking(state.ranking);
    setBattle(state.battle);
    setMode(state.done ? 'result' : 'sort');
  }

  function undoChoice() {
    const nextAnswers = answers.slice(0, -1);
    const state = resolveSortState(selectedSongs, limit, nextAnswers);
    setAnswers(nextAnswers);
    setRanking(state.ranking);
    setBattle(state.battle);
    setMode('sort');
  }

  function reset() {
    setBattle(null);
    setRanking([]);
    setAnswers([]);
    setMode('select');
  }

  if (!songs.length) {
    return (
      <main className="empty-state">
        <Headphones size={40} />
        <h1>json フォルダに曲データを追加してください</h1>
      </main>
    );
  }

  return (
    <main>
      <header className="app-header">
        <div>
          <p>version {packageJson.version}</p>
          <h1>DELTARUNE 曲ソート</h1>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setDarkMode((value) => !value)} aria-label={darkMode ? 'ライトモードに切替' : 'ダークモードに切替'}>
            {darkMode ? <Sun size={21} /> : <Moon size={21} />}
          </button>
          <div className="header-count">
            <ListChecks size={20} />
            <span>{selectedSongs.length} 曲選択中</span>
          </div>
        </div>
      </header>

      {mode === 'select' && (
        <section className="workspace">
          <section className="panel song-list-panel">
            <div className="target-toolbar">
              <h2>対象</h2>
              <div className="segmented" aria-label="表示順位数">
                {[5, 10, 15, 20].map((value) => (
                  <button key={value} className={limit === value ? 'active' : ''} onClick={() => setLimit(value)}>
                    ～{value}位
                  </button>
                ))}
              </div>
              <div className="target-actions">
                <button className="wide-button primary" onClick={() => setSelectedIds(new Set(songs.map((song) => song.id)))}>
                  全選択
                </button>
                <button className="wide-button" onClick={() => setSelectedIds(new Set())}>
                  全解除
                </button>
              </div>
            </div>
            <div className="list-toolbar">
              <div className="search-box">
                <Search size={18} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="曲名・チャプターで検索" />
              </div>
              <button className="start-button" disabled={selectedSongs.length < 2} onClick={startSort}>
                <Play size={18} />
                ソート開始
              </button>
            </div>
            <div className="chapter-grid">
              {songsByChapter.map(({ chapter, songs: chapterSongs }) => (
                <section key={chapter} className="chapter-column">
                  <label className="chapter-heading">
                    <input
                      type="checkbox"
                      checked={songs.filter((song) => song.chapter === chapter).every((song) => selectedIds.has(song.id))}
                      onChange={(event) => setChapter(chapter, event.target.checked)}
                    />
                    <strong>{chapter}</strong>
                    <small>{chapterSongs.length}</small>
                  </label>
                  <div className="chapter-songs">
                    {chapterSongs.map((song) => (
                      <label key={song.id} className="song-row">
                        <input type="checkbox" checked={selectedIds.has(song.id)} onChange={() => toggleSong(song.id)} />
                        <span>
                          <AutoScrollTitle>{song.title}</AutoScrollTitle>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </section>
      )}

      {mode === 'sort' && battle && (
        <section className="sort-screen">
          <div className="sort-topbar">
            <button className="icon-button" onClick={reset} aria-label="選択に戻る">
              <ChevronLeft size={22} />
            </button>
            <button className="undo-button" onClick={undoChoice} disabled={answers.length === 0}>
              <Undo2 size={18} />
              一つ戻る
            </button>
            <div>
              <span>{answers.length} 比較</span>
              <strong>{ranking.length}/{Math.min(limit, selectedSongs.length)} 位確定</strong>
            </div>
          </div>
          <div className="battle-grid">
            <article className="choice-card">
              <h3>{battle.left.title}</h3>
              <div className="choice-bottom">
                <SongMedia song={battle.left} darkMode={darkMode} />
                <button onClick={() => choose('left')}>
                  <Check size={20} />
                  こちらが良い
                </button>
              </div>
            </article>
            <article className="choice-card">
              <h3>{battle.right.title}</h3>
              <div className="choice-bottom">
                <SongMedia song={battle.right} darkMode={darkMode} />
                <button onClick={() => choose('right')}>
                  <Check size={20} />
                  こちらが良い
                </button>
              </div>
            </article>
          </div>
        </section>
      )}

      {mode === 'result' && (
        <section className="result-screen">
          <div className="result-header">
            <div>
              <p>{answers.length} 回の比較で決定</p>
              <h2>ランキング</h2>
            </div>
            <div className="result-actions">
              <button className="start-button secondary" onClick={reset}>
                <RotateCcw size={18} />
                もう一度
              </button>
            </div>
          </div>
          <div className="ranking-capture">
            <ol className="ranking-list top-two">
              {ranking.slice(0, 2).map((song, index) => (
                <li key={song.id}>
                  <span className="rank">{index + 1}</span>
                  <div>
                    <strong>{song.title}</strong>
                    <small>{song.chapter}</small>
                  </div>
                </li>
              ))}
            </ol>
            <ol className="ranking-list top-ten" start="3">
              {ranking.slice(2, 10).map((song, offset) => (
                <li key={song.id}>
                  <span className="rank">{offset + 3}</span>
                  <div>
                    <strong>{song.title}</strong>
                    <small>{song.chapter}</small>
                  </div>
                </li>
              ))}
            </ol>
            <ol className="ranking-list standard-ranks" start="11">
              {ranking.slice(10).map((song, offset) => (
                <li key={song.id}>
                  <span className="rank">{offset + 11}</span>
                  <div>
                    <strong>{song.title}</strong>
                    <small>{song.chapter}</small>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <footer className="app-footer">
        <a href="https://github.com/acid511/deltarune_sort" target="_blank" rel="noopener noreferrer">
          GitHub: acid511/deltarune_sort
        </a>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
