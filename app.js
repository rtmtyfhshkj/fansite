const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentPostId = null;

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/instagram\.com/.test(url)) return 'instagram';
  return 'other';
}

function getYoutubeEmbedUrl(url) {
  let videoId = null;
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      videoId = u.pathname.slice(1).split('?')[0];
    } else if (u.hostname.includes('youtube.com')) {
      videoId = u.searchParams.get('v');
      if (!videoId) {
        const m = u.pathname.match(/\/shorts\/([^/?]+)/);
        if (m) videoId = m[1];
      }
    }
  } catch (e) {}
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

function platformLabel(platform) {
  if (platform === 'youtube') return '▶ YouTube';
  if (platform === 'instagram') return '📷 Instagram';
  return '🔗 Link';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function buildPostCard(post) {
  const div = document.createElement('div');
  div.className = 'post-card';

  let embedHtml = '';
  if (post.platform === 'youtube') {
    const embedUrl = getYoutubeEmbedUrl(post.url);
    if (embedUrl) {
      embedHtml = `<div class="post-embed">
        <iframe src="${embedUrl}" height="160" allowfullscreen loading="lazy"></iframe>
      </div>`;
    }
  }
  if (!embedHtml) {
    embedHtml = `<div class="post-embed">
      <div class="post-embed-placeholder">
        <a href="${escHtml(post.url)}" target="_blank" rel="noopener noreferrer">🔗 リンクを開く</a>
      </div>
    </div>`;
  }

  div.innerHTML = `
    <div class="post-platform-badge platform-${post.platform}">${platformLabel(post.platform)}</div>
    ${embedHtml}
    <div class="post-body">
      <div class="post-title">${escHtml(post.title)}</div>
      ${post.description ? `<div class="post-desc">${escHtml(post.description)}</div>` : ''}
      <div class="post-meta">
        <span class="post-author">✦ ${escHtml(post.author)}</span>
        <span>${formatDate(post.created_at)}</span>
      </div>
      <div class="post-actions">
        <button class="btn btn-comment" onclick="openComments(${post.id}, '${escHtml(post.title).replace(/'/g,"\\'")}')">
          💬 コメント <span class="comment-count" id="cc-${post.id}">(読込中)</span>
        </button>
      </div>
    </div>
  `;
  return div;
}

async function loadCommentCount(postId) {
  const { count } = await db.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', postId);
  const el = document.getElementById(`cc-${postId}`);
  if (el) el.textContent = `(${count ?? 0})`;
}

async function loadPosts() {
  const container = document.getElementById('postsContainer');
  container.innerHTML = '<div class="loading">読み込み中...</div>';
  const { data: posts, error } = await db
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = '<div class="empty-msg">読み込みに失敗しました。config.js の設定を確認してください。</div>';
    console.error(error);
    return;
  }
  container.innerHTML = '';
  if (!posts || posts.length === 0) {
    container.innerHTML = '<div class="empty-msg">まだ投稿がありません。最初の投稿をしよう！</div>';
    return;
  }
  posts.forEach(p => {
    container.appendChild(buildPostCard(p));
    loadCommentCount(p.id);
  });
}

document.getElementById('postForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('postMsg');
  const btn = e.target.querySelector('button[type=submit]');

  const secret = document.getElementById('postSecret').value;
  if (secret !== SECRET_WORD) {
    msg.className = 'form-msg error';
    msg.textContent = '合言葉が違います';
    return;
  }

  const url = document.getElementById('postUrl').value.trim();
  const title = document.getElementById('postTitle').value.trim();
  const description = document.getElementById('postDesc').value.trim();
  const author = document.getElementById('postAuthor').value.trim();
  const platform = detectPlatform(url);

  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = '投稿中...';

  const { error } = await db.from('posts').insert({ url, platform, title, description, author });
  if (error) {
    msg.className = 'form-msg error';
    msg.textContent = '投稿に失敗しました';
    console.error(error);
  } else {
    msg.className = 'form-msg success';
    msg.textContent = '投稿しました！';
    e.target.reset();
    await loadPosts();
    setTimeout(() => { msg.textContent = ''; }, 3000);
  }
  btn.disabled = false;
});

async function openComments(postId, title) {
  currentPostId = postId;
  document.getElementById('modalTitle').textContent = `💬 ${title}`;
  document.getElementById('commentContent').value = '';
  document.getElementById('commentMsg').textContent = '';
  document.getElementById('commentModal').classList.remove('hidden');
  await loadComments(postId);
}

function closeModal() {
  document.getElementById('commentModal').classList.add('hidden');
  currentPostId = null;
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

async function loadComments(postId) {
  const list = document.getElementById('commentsList');
  list.innerHTML = '<div class="no-comments">読み込み中...</div>';
  const { data: comments, error } = await db
    .from('comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  list.innerHTML = '';
  if (error || !comments || comments.length === 0) {
    list.innerHTML = '<div class="no-comments">まだコメントがありません。最初のコメントをどうぞ！</div>';
    return;
  }
  comments.forEach(c => {
    const item = document.createElement('div');
    item.className = 'comment-item';
    item.innerHTML = `
      <div class="comment-header">
        <span class="comment-author">✦ ${escHtml(c.author)}</span>
        <span class="comment-date">${formatDate(c.created_at)}</span>
      </div>
      <div class="comment-content">${escHtml(c.content)}</div>
    `;
    list.appendChild(item);
  });
}

document.getElementById('commentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentPostId) return;
  const msg = document.getElementById('commentMsg');
  const btn = e.target.querySelector('button[type=submit]');

  const secret = document.getElementById('commentSecret').value;
  if (secret !== SECRET_WORD) {
    msg.className = 'form-msg error';
    msg.textContent = '合言葉が違います';
    return;
  }

  const content = document.getElementById('commentContent').value.trim();
  const author = document.getElementById('commentAuthor').value.trim();

  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = '送信中...';

  const { error } = await db.from('comments').insert({ post_id: currentPostId, content, author });
  if (error) {
    msg.className = 'form-msg error';
    msg.textContent = 'コメントに失敗しました';
    console.error(error);
  } else {
    msg.className = 'form-msg success';
    msg.textContent = 'コメントしました！';
    document.getElementById('commentContent').value = '';
    await loadComments(currentPostId);
    loadCommentCount(currentPostId);
    setTimeout(() => { msg.textContent = ''; }, 3000);
  }
  btn.disabled = false;
});

loadPosts();
