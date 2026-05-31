const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentCategory = 'all';
let currentSort = 'newest';
let searchWord = '';
let searchTimer = null;
let isAdmin = false;
let currentPosts = [];

// ===== ユーティリティ =====

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function categoryLabel(cat) {
  const map = {
    focus_cam: 'Focus Cam', performance: 'Performance', group: 'Group',
    solo: 'Solo', behind: 'Behind', photo: 'Photo', others: 'Others',
    recommend: '★ Recommend',
    // legacy
    oshi_camera: 'Focus Cam', individual: 'Solo'
  };
  return map[cat] || cat;
}

function platformLabel(p) {
  const map = { youtube: '▶ YouTube', x: '𝕏 X', instagram: '📷 Instagram', tiktok: '🎵 TikTok' };
  return map[p] || p;
}

// ===== URL解析 =====

function getYoutubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const m = u.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/);
      if (m) return m[1];
    }
  } catch (e) {}
  return null;
}

function getTiktokId(url) {
  try {
    const m = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
    return m ? m[1] : null;
  } catch (e) { return null; }
}

// ===== 埋め込みHTML生成 =====

function buildEmbed(post) {
  const url = post.url;

  if (post.platform === 'youtube') {
    const id = getYoutubeId(url);
    if (id) {
      return `<a class="embed-wrap yt-thumb-wrap" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">
        <img class="yt-thumb" src="https://img.youtube.com/vi/${id}/maxresdefault.jpg" onerror="this.src='https://img.youtube.com/vi/${id}/hqdefault.jpg'" alt="">
        <div class="yt-play-btn">▶</div>
      </a>`;
    }
  }

  if (post.platform === 'x') {
    return `<div class="embed-wrap">
      <blockquote class="twitter-tweet" data-dnt="true">
        <a href="${escHtml(url)}"></a>
      </blockquote>
    </div>`;
  }

  if (post.platform === 'instagram') {
    if (post.thumbnail_url) {
      return `<a class="embed-wrap yt-thumb-wrap" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">
        <img class="insta-thumb" src="${escHtml(post.thumbnail_url)}" referrerpolicy="no-referrer" alt="">
        <div class="yt-play-btn" style="font-size:16px;">↗</div>
      </a>`;
    }
    return `<div class="embed-wrap">
      <blockquote class="instagram-media"
        data-instgrm-permalink="${escHtml(url)}"
        data-instgrm-version="14"
        style="min-width:100%;max-width:100%;margin:0;">
      </blockquote>
    </div>`;
  }

  if (post.platform === 'tiktok') {
    if (post.thumbnail_url) {
      return `<a class="embed-wrap yt-thumb-wrap" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">
        <div class="tiktok-thumb-container" style="--bg:url('${escHtml(post.thumbnail_url)}')">
          <img class="tiktok-thumb" src="${escHtml(post.thumbnail_url)}" referrerpolicy="no-referrer" alt="">
        </div>
        <div class="yt-play-btn">▶</div>
      </a>`;
    }
    const id = getTiktokId(url);
    if (id) {
      return `<div class="embed-wrap">
        <blockquote class="tiktok-embed" cite="${escHtml(url)}" data-video-id="${id}" style="min-width:100%;max-width:100%;">
        </blockquote>
      </div>`;
    }
  }

  return `<div class="embed-wrap">
    <a class="link-card" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">
      🔗 ${escHtml(url)}
    </a>
  </div>`;
}

// ===== 通常投稿カード =====

function buildPostCard(post) {
  const div = document.createElement('div');
  div.className = 'post-card';
  div.dataset.id = post.id;

  const isRec = !!post.is_recommended;

  // 星ボタン（admin: クリック可／一般: 星印のみ）
  const starEl = isAdmin
    ? `<button class="btn-star-post${isRec ? ' starred' : ''}" onclick="toggleRecommend(${post.id},${isRec})">★</button>`
    : (isRec ? '<span class="star-badge">★</span>' : '');

  // Recommendタブ内かつ管理者のみ ↑↓ ボタン
  const orderBtns = isAdmin && currentCategory === 'recommend'
    ? `<button class="btn-order-post" onclick="moveRecommend(${post.id},'up')">↑</button><button class="btn-order-post" onclick="moveRecommend(${post.id},'down')">↓</button>`
    : '';

  const adminBtns = isAdmin
    ? `<button class="btn-edit-post"
        data-id="${post.id}"
        data-title="${escHtml(post.title || '')}"
        data-platform="${post.platform}"
        data-category="${post.category}"
        data-published-at="${post.published_at || ''}"
        data-thumbnail-url="${escHtml(post.thumbnail_url || '')}"
        onclick="openEditModal(this)">Edit</button>
       <button class="btn-delete-post" onclick="deletePost(${post.id})">Delete</button>`
    : '';

  div.innerHTML = `
    <div class="post-badge badge-${post.platform}">
      <span>${platformLabel(post.platform)}</span>
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="badge-category">${categoryLabel(post.category)}</span>
        ${starEl}
      </div>
    </div>
    ${buildEmbed(post)}
    ${post.title ? `<div class="post-title">${escHtml(post.title)}</div>` : ''}
    <div style="padding:2px 0 4px;">${orderBtns}${adminBtns}</div>
  `;
  return div;
}

// ===== 外部埋め込みスクリプト読み込み =====

const loadedScripts = new Set();

function loadEmbedScript(platform) {
  if (platform === 'x' && !loadedScripts.has('x')) {
    loadedScripts.add('x');
    const s = document.createElement('script');
    s.src = 'https://platform.twitter.com/widgets.js';
    s.async = true;
    document.body.appendChild(s);
  }
  if (platform === 'instagram' && !loadedScripts.has('instagram')) {
    loadedScripts.add('instagram');
    const s = document.createElement('script');
    s.src = 'https://www.instagram.com/embed.js';
    s.async = true;
    document.body.appendChild(s);
  }
  if (platform === 'tiktok' && !loadedScripts.has('tiktok')) {
    loadedScripts.add('tiktok');
    const s = document.createElement('script');
    s.src = 'https://www.tiktok.com/embed.js';
    s.async = true;
    document.body.appendChild(s);
  }
}

function processEmbeds(platform) {
  if (platform === 'x' && window.twttr && twttr.widgets) {
    twttr.widgets.load();
  }
  if (platform === 'instagram' && window.instgrm) {
    instgrm.Embeds.process();
  }
}

// ===== セクションヘッダー生成 =====

function buildSectionHeader(cat) {
  const div = document.createElement('div');
  div.className = 'section-header';
  div.innerHTML = `
    <span class="section-dot"></span>
    <span class="section-title">${categoryLabel(cat)}</span>
    <span class="section-line"></span>
  `;
  return div;
}

// ===== ソートコントロール表示切り替え =====

function updateSortVisibility() {
  document.getElementById('sortControls').style.display =
    currentCategory === 'recommend' ? 'none' : 'flex';
}

// ===== 投稿一覧を取得・表示 =====

async function loadPosts() {
  const container = document.getElementById('postsContainer');
  container.innerHTML = '<div class="loading">Loading...</div>';

  let query = db.from('posts').select('*');

  if (currentCategory === 'recommend') {
    query = query.eq('is_recommended', true);
    if (searchWord) query = query.ilike('title', `%${searchWord}%`);
    query = query
      .order('recommend_order', { ascending: true })
      .order('created_at', { ascending: false });
  } else {
    if (currentCategory !== 'all') {
      query = query.eq('category', currentCategory);
    }
    if (searchWord) query = query.ilike('title', `%${searchWord}%`);
    if (currentSort === 'oldest') {
      query = query
        .order('published_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
    } else {
      query = query
        .order('published_at', { ascending: false, nullsFirst: true })
        .order('created_at', { ascending: false });
    }
  }

  const { data: posts, error } = await query;

  if (error) {
    container.innerHTML = `<div class="empty-msg">読み込みに失敗しました。<br><span style="font-size:11px;opacity:0.55;">${escHtml(error.message)}</span></div>`;
    console.error(error);
    return;
  }

  currentPosts = posts || [];
  container.innerHTML = '';

  if (!posts || posts.length === 0) {
    container.innerHTML = '<div class="empty-msg">No posts yet</div>';
    return;
  }

  const platforms = [...new Set(posts.map(p => p.platform))];
  platforms.forEach(loadEmbedScript);

  if (currentCategory === 'all' && !searchWord) {
    const categoryOrder = ['focus_cam', 'performance', 'group', 'solo', 'behind', 'photo', 'others', 'oshi_camera', 'individual'];
    const grouped = {};
    posts.forEach(p => {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    });

    // Recommend セクションを一番上に表示
    const recommendPosts = posts
      .filter(p => p.is_recommended)
      .sort((a, b) => (a.recommend_order || 0) - (b.recommend_order || 0));
    if (recommendPosts.length > 0) {
      container.appendChild(buildSectionHeader('recommend'));
      const grid = document.createElement('div');
      grid.className = 'posts-grid';
      recommendPosts.forEach(p => grid.appendChild(buildPostCard(p)));
      container.appendChild(grid);
    }

    categoryOrder.forEach(cat => {
      if (!grouped[cat] || grouped[cat].length === 0) return;
      container.appendChild(buildSectionHeader(cat));
      const grid = document.createElement('div');
      grid.className = 'posts-grid';
      grouped[cat].forEach(p => grid.appendChild(buildPostCard(p)));
      container.appendChild(grid);
    });
  } else {
    const grid = document.createElement('div');
    grid.className = 'posts-grid';
    posts.forEach(p => grid.appendChild(buildPostCard(p)));
    container.appendChild(grid);
  }

  setTimeout(() => platforms.forEach(processEmbeds), 800);
}

// ===== カテゴリタブ切り替え =====

document.querySelectorAll('.ctab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ctab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.category;
    updateSortVisibility();
    loadPosts();
  });
});

// ===== ソート切り替え =====

function setSort(sort) {
  currentSort = sort;
  document.getElementById('sortNewest').classList.toggle('active', sort === 'newest');
  document.getElementById('sortOldest').classList.toggle('active', sort === 'oldest');
  loadPosts();
}

// ===== ワード検索 =====

function onSearch(value) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchWord = value.trim();
    loadPosts();
  }, 350);
}

// ===== 管理者認証 =====

function toggleAdminPrompt() {
  if (isAdmin) {
    document.getElementById('adminPanel').classList.toggle('hidden');
  } else {
    document.getElementById('adminPrompt').classList.remove('hidden');
    setTimeout(() => document.getElementById('adminSecretInput').focus(), 50);
  }
}

function closeAdminPrompt() {
  document.getElementById('adminPrompt').classList.add('hidden');
  document.getElementById('adminSecretInput').value = '';
  document.getElementById('adminPromptMsg').textContent = '';
}

function submitAdminSecret() {
  const input = document.getElementById('adminSecretInput').value;
  if (input === SECRET_WORD) {
    isAdmin = true;
    closeAdminPrompt();
    document.getElementById('adminPanel').classList.remove('hidden');
    loadPosts();
  } else {
    document.getElementById('adminPromptMsg').textContent = 'Incorrect password';
  }
}

document.getElementById('adminSecretInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitAdminSecret();
  if (e.key === 'Escape') closeAdminPrompt();
});

function closeAdminPanel() {
  document.getElementById('adminPanel').classList.add('hidden');
}

// ===== 投稿（管理者） =====

document.getElementById('adminForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = document.getElementById('adminMsg');
  const btn = e.target.querySelector('button[type=submit]');

  const url         = document.getElementById('adminUrl').value.trim();
  let   title       = document.getElementById('adminTitle').value.trim();
  const platform    = document.getElementById('adminPlatform').value;
  const category    = document.getElementById('adminCategory').value;
  const publishedAt   = document.getElementById('adminPublishedAt').value || null;
  const thumbnailUrl  = document.getElementById('adminThumbnailUrl').value || null;

  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = 'Posting...';

  if (!title && platform === 'youtube') {
    title = await fetchYouTubeTitle(url);
  }

  const { error } = await db.from('posts').insert({
    url, title, platform, category,
    published_at: publishedAt,
    thumbnail_url: thumbnailUrl
  });
  if (error) {
    msg.className = 'form-msg error';
    msg.textContent = `投稿に失敗しました: ${error.message}`;
    console.error(error);
  } else {
    msg.className = 'form-msg success';
    msg.textContent = 'Posted!';
    document.getElementById('adminUrl').value = '';
    document.getElementById('adminTitle').value = '';
    document.getElementById('adminPublishedAt').value = '';
    document.getElementById('adminThumbnailUrl').value = '';
    await loadPosts();
    setTimeout(() => { msg.textContent = ''; }, 3000);
  }
  btn.disabled = false;
});

// ===== 削除（管理者） =====

async function deletePost(id) {
  if (!confirm('Delete this post?')) return;
  const { error } = await db.from('posts').delete().eq('id', id);
  if (!error) await loadPosts();
  else alert('Failed to delete');
}

// ===== Recommend: 星トグル（管理者） =====

async function toggleRecommend(id, isRec) {
  if (!isRec) {
    const { data } = await db.from('posts')
      .select('recommend_order')
      .eq('is_recommended', true)
      .order('recommend_order', { ascending: false })
      .limit(1);
    const maxOrder = data && data.length > 0 ? (data[0].recommend_order || 0) : 0;
    await db.from('posts').update({ is_recommended: true, recommend_order: maxOrder + 1 }).eq('id', id);
  } else {
    await db.from('posts').update({ is_recommended: false }).eq('id', id);
  }
  await loadPosts();
}

// ===== Recommend: 並び替え（管理者） =====

async function moveRecommend(id, direction) {
  const sorted = [...currentPosts].sort((a, b) => a.recommend_order - b.recommend_order);
  const idx = sorted.findIndex(p => p.id === id);
  if (idx === -1) return;

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;

  const postA = sorted[idx];
  const postB = sorted[swapIdx];

  await Promise.all([
    db.from('posts').update({ recommend_order: postB.recommend_order }).eq('id', postA.id),
    db.from('posts').update({ recommend_order: postA.recommend_order }).eq('id', postB.id),
  ]);

  await loadPosts();
}

// ===== 編集モーダル（管理者） =====

function openEditModal(btn) {
  document.getElementById('editPostId').value = btn.dataset.id;
  document.getElementById('editTitle').value = btn.dataset.title;
  document.getElementById('editPlatform').value = btn.dataset.platform;
  document.getElementById('editCategory').value = btn.dataset.category;
  document.getElementById('editPublishedAt').value = btn.dataset.publishedAt;
  document.getElementById('editThumbnailUrl').value = btn.dataset.thumbnailUrl || '';
  document.getElementById('editMsg').textContent = '';
  document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('editModal').classList.add('hidden');
}

async function submitEdit() {
  const id           = document.getElementById('editPostId').value;
  const title        = document.getElementById('editTitle').value.trim();
  const platform     = document.getElementById('editPlatform').value;
  const category     = document.getElementById('editCategory').value;
  const publishedAt  = document.getElementById('editPublishedAt').value || null;
  const thumbnailUrl = document.getElementById('editThumbnailUrl').value.trim() || null;
  const msg          = document.getElementById('editMsg');

  msg.textContent = 'Saving...';
  msg.style.color = 'var(--text-soft)';

  const { error } = await db.from('posts').update({
    title, platform, category,
    published_at: publishedAt,
    thumbnail_url: thumbnailUrl
  }).eq('id', id);
  if (error) {
    msg.textContent = `Failed: ${error.message}`;
    msg.style.color = '#ff8888';
  } else {
    closeEditModal();
    await loadPosts();
  }
}

// ===== YouTube タイトル自動取得 =====

async function fetchYouTubeTitle(url) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (res.ok) { const d = await res.json(); return d.title || ''; }
  } catch (e) {}
  return '';
}

// ===== TikTok oEmbed（タイトル＋サムネURL）取得 =====

async function fetchTikTokOembed(url) {
  // TikTokはブラウザからのAPI呼び出しをブロックするため自動取得不可
  // Thumbnail URLフィールドに手動でImgur等のURLを貼ってください
  return { title: '', thumbnail_url: '' };
}

document.getElementById('adminUrl').addEventListener('blur', async function() {
  const url = this.value.trim();
  if (!url) return;

  const titleField     = document.getElementById('adminTitle');
  const thumbnailField = document.getElementById('adminThumbnailUrl');

  if (getYoutubeId(url)) {
    if (!titleField.value.trim()) {
      const t = await fetchYouTubeTitle(url);
      if (t) titleField.value = t;
    }
  } else if (getTiktokId(url)) {
    const data = await fetchTikTokOembed(url);
    if (!titleField.value.trim() && data.title) titleField.value = data.title;
    if (data.thumbnail_url) thumbnailField.value = data.thumbnail_url;
  }
});

// ===== 初期化 =====
updateSortVisibility();
loadPosts();
