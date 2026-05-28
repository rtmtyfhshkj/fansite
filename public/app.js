let currentPostId = null;

// 日付フォーマット
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// YouTubeの埋め込みURLを生成
function getYoutubeEmbedUrl(url) {
  let videoId = null;
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      videoId = u.pathname.slice(1).split('?')[0];
    } else if (u.hostname.includes('youtube.com')) {
      videoId = u.searchParams.get('v');
      if (!videoId) {
        // shorts対応
        const m = u.pathname.match(/\/shorts\/([^/?]+)/);
        if (m) videoId = m[1];
      }
    }
  } catch (e) {}
  if (!videoId) return null;
  return `https://www.youtube.com/embed/${videoId}`;
}

// プラットフォームバッジのラベル
function platformLabel(platform) {
  if (platform === 'youtube') return '▶ YouTube';
  if (platform === 'instagram') return '📷 Instagram';
  return '🔗 Link';
}

// 投稿カードのHTMLを生成
function buildPostCard(post) {
  const div = document.createElement('div');
  div.className = 'post-card';
  div.dataset.id = post.id;

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
        <a href="${escHtml(post.url)}" target="_blank" rel="noopener noreferrer">🔗 ${escHtml(post.url)}</a>
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
        <button class="btn btn-comment" onclick="openComments(${post.id}, '${escAttr(post.title)}')">
          💬 コメント <span class="comment-count">(${post.comment_count || 0})</span>
        </button>
      </div>
    </div>
  `;
  return div;
}

// エスケープ
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function escAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// 投稿一覧を取得して表示
async function loadPosts() {
  const container = document.getElementById('postsContainer');
  try {
    const res = await fetch('/api/posts');
    const posts = await res.json();
    container.innerHTML = '';
    if (posts.length === 0) {
      container.innerHTML = '<div class="empty-msg">まだ投稿がありません。最初の投稿をしよう！</div>';
      return;
    }
    posts.forEach(p => container.appendChild(buildPostCard(p)));
  } catch (e) {
    container.innerHTML = '<div class="empty-msg">読み込みに失敗しました。</div>';
  }
}

// 投稿フォーム送信
document.getElementById('postForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('postMsg');
  const btn = e.target.querySelector('button[type=submit]');

  const url = document.getElementById('postUrl').value.trim();
  const title = document.getElementById('postTitle').value.trim();
  const description = document.getElementById('postDesc').value.trim();
  const author = document.getElementById('postAuthor').value.trim();
  const secret = document.getElementById('postSecret').value;

  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = '投稿中...';

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title, description, author, secret })
    });
    const data = await res.json();
    if (!res.ok) {
      msg.className = 'form-msg error';
      msg.textContent = data.error || 'エラーが発生しました';
    } else {
      msg.className = 'form-msg success';
      msg.textContent = '投稿しました！';
      e.target.reset();
      loadPosts();
      setTimeout(() => { msg.textContent = ''; }, 3000);
    }
  } catch (err) {
    msg.className = 'form-msg error';
    msg.textContent = '通信エラーが発生しました';
  } finally {
    btn.disabled = false;
  }
});

// コメントモーダルを開く
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

// ESCキーでモーダルを閉じる
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// コメント一覧を取得して表示
async function loadComments(postId) {
  const list = document.getElementById('commentsList');
  list.innerHTML = '<div class="no-comments">読み込み中...</div>';
  try {
    const res = await fetch(`/api/posts/${postId}/comments`);
    const comments = await res.json();
    list.innerHTML = '';
    if (comments.length === 0) {
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
  } catch (e) {
    list.innerHTML = '<div class="no-comments">読み込みに失敗しました。</div>';
  }
}

// コメント送信
document.getElementById('commentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentPostId) return;

  const msg = document.getElementById('commentMsg');
  const btn = e.target.querySelector('button[type=submit]');

  const content = document.getElementById('commentContent').value.trim();
  const author = document.getElementById('commentAuthor').value.trim();
  const secret = document.getElementById('commentSecret').value;

  if (!content || !author || !secret) {
    msg.className = 'form-msg error';
    msg.textContent = '全項目を入力してください';
    return;
  }

  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = '送信中...';

  try {
    const res = await fetch(`/api/posts/${currentPostId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, author, secret })
    });
    const data = await res.json();
    if (!res.ok) {
      msg.className = 'form-msg error';
      msg.textContent = data.error || 'エラーが発生しました';
    } else {
      msg.className = 'form-msg success';
      msg.textContent = 'コメントしました！';
      document.getElementById('commentContent').value = '';
      await loadComments(currentPostId);
      // 投稿一覧のコメント数も更新
      loadPosts();
      setTimeout(() => { msg.textContent = ''; }, 3000);
    }
  } catch (err) {
    msg.className = 'form-msg error';
    msg.textContent = '通信エラーが発生しました';
  } finally {
    btn.disabled = false;
  }
});

// 起動時に投稿一覧を読み込む
loadPosts();
