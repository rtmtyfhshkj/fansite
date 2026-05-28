require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_WORD = process.env.SECRET_WORD || '合言葉未設定';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function checkSecret(req, res, next) {
  const { secret } = req.body;
  if (!secret || secret !== SECRET_WORD) {
    return res.status(403).json({ error: '合言葉が違います' });
  }
  next();
}

function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/instagram\.com/.test(url)) return 'instagram';
  return 'other';
}

// 全投稿取得
app.get('/api/posts', (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, COUNT(c.id) as comment_count
    FROM posts p
    LEFT JOIN comments c ON p.id = c.post_id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all();
  res.json(posts);
});

// 投稿作成
app.post('/api/posts', checkSecret, (req, res) => {
  const { url, title, description, author } = req.body;
  if (!url || !title || !author) {
    return res.status(400).json({ error: 'URL・タイトル・名前は必須です' });
  }
  const platform = detectPlatform(url);
  const result = db.prepare(
    'INSERT INTO posts (url, platform, title, description, author) VALUES (?, ?, ?, ?, ?)'
  ).run(url, platform, title, description || '', author);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(post);
});

// 投稿削除
app.delete('/api/posts/:id', checkSecret, (req, res) => {
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// コメント取得
app.get('/api/posts/:id/comments', (req, res) => {
  const comments = db.prepare(
    'SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC'
  ).all(req.params.id);
  res.json(comments);
});

// コメント追加
app.post('/api/posts/:id/comments', checkSecret, (req, res) => {
  const { content, author } = req.body;
  if (!content || !author) {
    return res.status(400).json({ error: '内容と名前は必須です' });
  }
  const result = db.prepare(
    'INSERT INTO comments (post_id, content, author) VALUES (?, ?, ?)'
  ).run(req.params.id, content, author);
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(comment);
});

// コメント削除
app.delete('/api/comments/:id', checkSecret, (req, res) => {
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`柳谷伊冴ファンサイト起動中 → http://localhost:${PORT}`);
});
