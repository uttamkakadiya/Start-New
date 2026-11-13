(() => {
  // Loads external data and submits structured AI feedback and conversational questions.
  const escapeHtml = (value) => window.StartNew.escapeHtml(value || '');
  // Keep follow-up context in this page only and send a bounded history with each question.
  const chatHistory = [];

  const loadNews = async (targetId = 'news-list') => {
    const target = document.getElementById(targetId);
    target.innerHTML = '<p class="muted">Loading current news…</p>';
    try {
      const result = await window.StartNew.request('/news');
      if (!result.configured) {
        target.innerHTML = `<p class="muted">${escapeHtml(result.message)}</p>`;
        return;
      }
      if (!Array.isArray(result.articles)) throw new Error('News service returned an invalid response.');
      const articles = result.articles;
      const providerLinks = {
        'Hacker News': 'https://news.ycombinator.com/',
        NewsAPI: 'https://newsapi.org/',
      };
      const providerUrl = providerLinks[result.provider];
      const attribution = providerUrl
        ? `<p class="muted data-attribution">News via <a href="${providerUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(result.provider)}</a></p>`
        : '';
      const content = articles.length
        ? articles
            .map(
              (article) =>
                `<article class="news-item"><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.title || 'Startup news')}</a><p>${escapeHtml(article.source || '')}${article.publishedAt ? ` · ${new Date(article.publishedAt).toLocaleDateString()}` : ''}</p></article>`
            )
            .join('')
        : '<p class="muted">No startup news is available right now.</p>';
      target.innerHTML = `${content}${attribution}`;
    } catch (error) {
      target.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  };

  const loadCurrency = async () => {
    const target = document.getElementById('currency-list');
    try {
      const base = document.getElementById('currency-base').value;
      const data = await window.StartNew.request(`/currency?base=${encodeURIComponent(base)}`);
      target.innerHTML =
        Object.entries(data.rates || {})
          .map(
            ([currency, value]) =>
              `<div class="currency-row"><span>${escapeHtml(currency)} per ${escapeHtml(data.base)}</span><strong>${Number(value).toFixed(3)}</strong></div>`
          )
          .join('') || '<p class="muted">No currency data was returned.</p>';
    } catch (error) {
      target.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  };

  const loadWeather = async () => {
    const target = document.getElementById('weather-list');
    target.innerHTML = '<p class="muted">Loading current weather…</p>';
    try {
      const weather = await window.StartNew.request('/weather');
      if (
        typeof weather.location !== 'string' ||
        typeof weather.summary !== 'string' ||
        !Number.isFinite(weather.temperature) ||
        !Number.isFinite(weather.feelsLike) ||
        !Number.isFinite(weather.humidity) ||
        !Number.isFinite(weather.windSpeed)
      ) {
        throw new Error('Weather service returned invalid current conditions.');
      }
      target.innerHTML = `
        <div class="currency-row"><span>${escapeHtml(weather.location)}</span><strong>${weather.temperature.toFixed(1)} ${escapeHtml(weather.temperatureUnit)}</strong></div>
        <div class="currency-row"><span>${escapeHtml(weather.summary)}</span><strong>${new Date(weather.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></div>
        <div class="currency-row"><span>Feels like</span><strong>${weather.feelsLike.toFixed(1)} ${escapeHtml(weather.temperatureUnit)}</strong></div>
        <div class="currency-row"><span>Humidity</span><strong>${weather.humidity}%</strong></div>
        <div class="currency-row"><span>Wind</span><strong>${weather.windSpeed.toFixed(1)} ${escapeHtml(weather.windSpeedUnit)}</strong></div>`;
    } catch (error) {
      target.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  };

  const submitAI = async (event) => {
    event.preventDefault();
    if (!window.StartNew.requireUser()) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const message = document.getElementById('ai-message');
    const result = document.getElementById('ai-result');
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    message.className = 'form-message';
    message.textContent = 'Thinking this through…';
    result.innerHTML = '<div class="ai-placeholder"><span>✦</span><p>Preparing your feedback…</p></div>';
    try {
      const path = values.mode === 'plan' ? '/ai/business-plan' : '/ai/evaluate';
      const response = await window.StartNew.request(path, { method: 'POST', body: { idea: values.idea } });
      const heading =
        response.type === 'business-plan' ? 'Your starter business plan' : 'A fresh perspective on your idea';
      result.innerHTML = `<h2>${heading}</h2><div class="ai-result-copy">${escapeHtml(response.result)}</div>`;
      message.className = 'form-message success';
      message.textContent = 'Feedback is ready. Treat it as a starting point for your own research.';
    } catch (error) {
      message.className = 'form-message error';
      message.textContent = error.message;
      result.innerHTML =
        '<div class="ai-placeholder"><span>✦</span><h3>Your idea is still yours to shape.</h3><p>We couldn’t get feedback right now. You can try again later.</p></div>';
    } finally {
      button.disabled = false;
    }
  };

  const renderChat = () => {
    const target = document.getElementById('ai-chat-messages');
    if (!chatHistory.length) {
      const welcome = document.createElement('p');
      welcome.className = 'ai-chat-welcome';
      welcome.textContent =
        'Share an idea and ask anything—from finding your first customers to testing whether a feature is useful.';
      target.replaceChildren(welcome);
      return;
    }
    const messages = document.createDocumentFragment();
    for (const item of chatHistory) {
      const bubble = document.createElement('div');
      bubble.className = `ai-chat-bubble ${item.role === 'user' ? 'mine' : 'assistant'}`;
      bubble.setAttribute('aria-label', item.role === 'user' ? 'You' : 'Start New AI');
      bubble.textContent = item.content;
      messages.append(bubble);
    }
    target.replaceChildren(messages);
    target.scrollTop = target.scrollHeight;
  };

  const submitChat = async (event) => {
    event.preventDefault();
    if (!window.StartNew.requireUser()) return;
    const form = event.currentTarget;
    const question = form.elements.message.value.trim();
    if (!question) return;
    const idea = document.getElementById('ai-chat-idea').value.trim();
    const history = chatHistory.slice(-10);
    const status = document.getElementById('ai-chat-status');
    const button = form.querySelector('[type="submit"]');
    const clearButton = document.getElementById('ai-chat-clear');
    const questionInput = form.elements.message;
    button.disabled = true;
    clearButton.disabled = true;
    questionInput.disabled = true;
    button.textContent = 'Thinking…';
    status.className = 'form-message';
    status.textContent = 'Thinking about your question…';
    chatHistory.push({ role: 'user', content: question });
    renderChat();
    try {
      const response = await window.StartNew.request('/ai/chat', {
        method: 'POST',
        body: { message: question, idea, history },
      });
      if (typeof response.result !== 'string' || !response.result.trim()) {
        throw new Error('The AI assistant returned an invalid answer.');
      }
      chatHistory.push({ role: 'assistant', content: response.result.trim() });
      if (chatHistory.length > 10) chatHistory.splice(0, chatHistory.length - 10);
      form.elements.message.value = '';
      status.className = 'form-message success';
      status.textContent = 'Answer ready. You can ask a follow-up.';
      renderChat();
    } catch (error) {
      if (chatHistory[chatHistory.length - 1]?.role === 'user') chatHistory.pop();
      status.className = 'form-message error';
      status.textContent = error.message;
      renderChat();
    } finally {
      button.disabled = false;
      clearButton.disabled = false;
      questionInput.disabled = false;
      button.textContent = 'Ask ✦';
    }
  };

  const setup = () => {
    document.getElementById('ai-form').addEventListener('submit', submitAI);
    document.getElementById('news-refresh').addEventListener('click', () => loadNews('news-list'));
    document.getElementById('currency-base').addEventListener('change', loadCurrency);
    document.getElementById('ai-chat-form').addEventListener('submit', submitChat);
    document.getElementById('ai-chat-clear').addEventListener('click', () => {
      chatHistory.length = 0;
      document.getElementById('ai-chat-status').className = 'form-message hidden';
      renderChat();
    });
    document.getElementById('ai-chat-copy-idea').addEventListener('click', () => {
      const idea = document.querySelector('#ai-form [name="idea"]').value;
      document.getElementById('ai-chat-idea').value = idea;
    });
    document.getElementById('ai-chat-question').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        event.currentTarget.form.requestSubmit();
      }
    });
    renderChat();
  };

  window.AI = { setup, loadNews, loadCurrency, loadWeather };
})();
