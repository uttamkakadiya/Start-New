import assert from 'node:assert/strict';
import test from 'node:test';
import { mapHackerNewsArticles, mapNewsApiArticles } from '../backend/routes/thirdPartyData.mjs';

test('Hacker News mapping keeps safe links and falls back to the discussion page', () => {
  const articles = mapHackerNewsArticles([
    {
      title: 'Startup story',
      url: 'https://example.com/story',
      objectID: '123',
      created_at: '2026-01-02T03:04:05.000Z',
    },
    { title: 'Ask HN story', objectID: '456' },
    { title: 'Unsafe link', url: 'javascript:alert(1)', objectID: '789' },
    { title: '   ', objectID: '101' },
  ]);

  assert.deepEqual(
    articles.map((article) => article.url),
    [
      'https://example.com/story',
      'https://news.ycombinator.com/item?id=456',
      'https://news.ycombinator.com/item?id=789',
    ]
  );
  assert.equal(articles[0].source, 'Hacker News');
  assert.equal(articles[0].publishedAt, '2026-01-02T03:04:05.000Z');
});

test('NewsAPI mapping excludes articles without safe web URLs', () => {
  const articles = mapNewsApiArticles([
    { title: 'Valid story', url: 'https://example.com/story', source: { name: 'Example' } },
    { title: 'Unsafe story', url: 'javascript:alert(1)' },
    { title: 'Missing link' },
    { title: '', url: 'https://example.com/empty-title' },
  ]);

  assert.deepEqual(articles, [
    {
      title: 'Valid story',
      description: undefined,
      url: 'https://example.com/story',
      source: 'Example',
      publishedAt: undefined,
    },
  ]);
});
