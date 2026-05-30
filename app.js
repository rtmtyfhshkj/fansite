const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentCategory = 'all';
let isAdmin = false;

// ===== ユーティリティ =====

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function categoryLabel(cat) {
  const map = { performance: 'パフォーマンス', oshi_camera: '推しカメラ', behind: 'ビハインド', group: 'グループ', individual: '個人' };
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
      return `<div class="embed-wrap"><iframe src="https://www.youtube.com/embed/${id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
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
    return `<div class="embed-wrap">
      <blockquote class="instagram-media"
        data-instgrm-permalink="${escHtml(url)}"
        data-instgrm-version="14"
        style="min-width:100%;max-width:100%;margin:0;">
      </blockquote>
    </div>`;
  }

  if (post.platform === 'tiktok') {
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

// ===== 推しカメラ: フィーチャーカード =====

function buildFeatureCard(post) {
  const div = document.createElement('div');
  div.className = 'feature-card';
  div.dataset.id = post.id;

  const deleteBtn = isAdmin
    ? `<div class="feature-delete"><button class="btn-delete-post" onclick="deletePost(${post.id})">削除</button></div>`
    : '';

  div.innerHTML = `
    <div class="feature-card-inner">
      <div class="feature-embed">${buildEmbed(post)}</div>
      <div class="feature-info">
        <div class="feature-badge">
          <span class="feature-platform-tag tag-${post.platform}">${platformLabel(post.platform)}</span>
          <span class="feature-category-tag">${categoryLabel(post.category)}</span>
        </div>
        <div class="feature-label">${escHtml(post.title || categoryLabel(post.category))}</div>
        ${deleteBtn}
      </div>
    </div>
  `;
  return div;
}

// ===== 通常投稿カード =====

function buildPostCard(post) {
  const div = document.createElement('div');
  div.className = 'post-card';
  div.dataset.id = post.id;

  const deleteBtn = isAdmin
    ? `<button class="btn-delete-post" onclick="deletePost(${post.id})">削除</button>`
    : '';

  div.innerHTML = `
    <div class="post-badge badge-${post.platform}">
      <span>${platformLabel(post.platform)}</span>
      <span class="badge-category">${categoryLabel(post.category)}</span>
    </div>
    ${post.title ? `<div class="post-title">${escHtml(post.title)}</div>` : ''}
    ${buildEmbed(post)}
    <div style="padding:2px 0 4px;">${deleteBtn}</div>
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

// ===== 投稿一覧を取得・表示 =====

async function loadPosts() {
  const container = document.getElementById('postsContainer');
  container.innerHTML = '<div class="loading">読み込み中...</div>';

  let query = db.from('posts').select('*').order('created_at', { ascending: false });
  if (currentCategory !== 'all') {
    query = query.eq('category', currentCategory);
  }

  const { data: posts, error } = await query;

  if (error) {
    container.innerHTML = `<div class="empty-msg">読み込みに失敗しました。<br><span style="font-size:11px;opacity:0.55;">${escHtml(error.message)}</span></div>`;
    console.error(error);
    return;
  }

  container.innerHTML = '';

  if (!posts || posts.length === 0) {
    container.innerHTML = '<div class="empty-msg">投稿がありません</div>';
    return;
  }

  // 使用プラットフォームのスクリプトをロード
  const platforms = [...new Set(posts.map(p => p.platform))];
  platforms.forEach(loadEmbedScript);

  if (currentCategory === 'all') {
    // カテゴリ順に表示
    const categoryOrder = ['oshi_camera', 'performance', 'behind', 'group', 'individual'];
    const grouped = {};
    posts.forEach(p => {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    });

    categoryOrder.forEach(cat => {
      if (!grouped[cat] || grouped[cat].length === 0) return;

      container.appendChild(buildSectionHeader(cat));

      if (cat === 'oshi_camera') {
        grouped[cat].forEach(p => container.appendChild(buildFeatureCard(p)));
      } else {
        const grid = document.createElement('div');
        grid.className = 'posts-grid';
        grouped[cat].forEach(p => grid.appendChild(buildPostCard(p)));
        container.appendChild(grid);
      }
    });
  } else if (currentCategory === 'oshi_camera') {
    posts.forEach(p => container.appendChild(buildFeatureCard(p)));
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
    loadPosts();
  });
});

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
    document.getElementById('adminPromptMsg').textContent = '合言葉が違います';
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

  const url      = document.getElementById('adminUrl').value.trim();
  const title    = document.getElementById('adminTitle').value.trim();
  const platform = document.getElementById('adminPlatform').value;
  const category = document.getElementById('adminCategory').value;

  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = '投稿中...';

  const { error } = await db.from('posts').insert({ url, title, platform, category });
  if (error) {
    msg.className = 'form-msg error';
    msg.textContent = `投稿に失敗しました: ${error.message}`;
    console.error(error);
  } else {
    msg.className = 'form-msg success';
    msg.textContent = '投稿しました！';
    document.getElementById('adminUrl').value = '';
    document.getElementById('adminTitle').value = '';
    await loadPosts();
    setTimeout(() => { msg.textContent = ''; }, 3000);
  }
  btn.disabled = false;
});

// ===== 削除（管理者） =====

async function deletePost(id) {
  if (!confirm('この投稿を削除しますか？')) return;
  const { error } = await db.from('posts').delete().eq('id', id);
  if (!error) await loadPosts();
  else alert('削除に失敗しました');
}

// ===== 初期化 =====
loadPosts();
