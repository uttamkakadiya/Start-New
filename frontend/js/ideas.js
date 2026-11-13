(() => {
  // Renders idea search, feed, detail, and engagement interactions.
  let searchTimer;
  let currentIdeas = [];
  const ideaCache = new Map();

  const escapeHtml = (value) => window.StartNew.escapeHtml(value || '');
  const avatar = (user) => user?.profilePicture || '/frontend/images/default-avatar.svg';
  const ideaMarkup = (idea) => `
    <article class="idea-card">
      ${idea.imageUrl ? `<div class="idea-card-image"><img src="${escapeHtml(idea.imageUrl)}" alt=""></div>` : '<div class="idea-card-image"></div>'}
      <div class="idea-card-body">
        <div class="idea-card-meta"><span class="pill">${escapeHtml(idea.category)}</span><span class="stage-label">${escapeHtml(idea.stage)}</span></div>
        <h3>${escapeHtml(idea.title)}</h3>
        <p class="idea-card-copy">${escapeHtml(idea.description)}</p>
        ${idea.recommendationReason ? `<span class="recommendation-reason">${escapeHtml(idea.recommendationReason)}</span>` : ''}
        <div class="idea-author"><button class="idea-avatar-link" data-social-action="profile" data-id="${escapeHtml(idea.creatorId)}" aria-label="View ${escapeHtml(idea.creator?.name || 'Start New member')}'s profile"><img src="${escapeHtml(avatar(idea.creator))}" alt=""></button><button class="profile-link" data-social-action="profile" data-id="${escapeHtml(idea.creatorId)}">${escapeHtml(idea.creator?.name || 'Start New member')}</button></div>
        <div class="idea-actions">
          <button data-idea-action="like" data-id="${escapeHtml(idea.id)}" aria-label="Like idea">♡ ${idea.likes || 0}</button>
          <button data-idea-action="comments" data-id="${escapeHtml(idea.id)}">◌ ${idea.comments || 0}</button>
          <button data-idea-action="bookmark" data-id="${escapeHtml(idea.id)}" class="${idea.bookmarked ? 'is-active' : ''}" aria-label="${idea.bookmarked ? 'Remove save' : 'Save idea'}; ${idea.saves || 0} saves">${idea.bookmarked ? `▣ Saved ${idea.saves || 0}` : `▢ Save ${idea.saves || 0}`}</button>
          <button class="view-idea-action" data-idea-action="detail" data-id="${escapeHtml(idea.id)}">View idea →</button>
        </div>
      </div>
    </article>`;

  const renderList = (element, ideas, emptyText) => {
    ideas.forEach((idea) => ideaCache.set(idea.id, idea));
    if (!ideas.length) {
      element.innerHTML = `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
      return;
    }
    element.innerHTML = ideas.map(ideaMarkup).join('');
  };

  const renderRecommendations = (ideas) => {
    ['dashboard-recommended-ideas', 'explore-recommended-ideas'].forEach((id) => {
      const target = document.getElementById(id);
      if (!window.StartNew.state.user) {
        target.innerHTML = '<p class="muted">Log in to get personalized recommendations.</p>';
      } else {
        renderList(target, ideas, 'No new ideas to recommend right now. Explore all ideas to discover more.');
      }
    });
  };

  const getIdeas = async () => {
    const params = new URLSearchParams();
    const q = document.getElementById('idea-search').value.trim();
    const category = document.getElementById('idea-category').value;
    const stage = document.getElementById('idea-stage').value;
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (stage) params.set('stage', stage);
    const target = document.getElementById('explore-ideas');
    if (!window.StartNew.state.user) {
      currentIdeas = [];
      target.innerHTML = '<div class="empty-state">Log in to browse and search community ideas.</div>';
      document.getElementById('idea-result-count').textContent = '0 ideas';
      return;
    }
    target.innerHTML = '<div class="loading-card">Finding good ideas…</div>';
    try {
      currentIdeas = await window.StartNew.request(`/contents?${params.toString()}`);
      renderList(
        target,
        currentIdeas,
        'No ideas match those filters yet. Try another search, or share the first idea.'
      );
      document.getElementById('idea-result-count').textContent =
        `${currentIdeas.length} ${currentIdeas.length === 1 ? 'idea' : 'ideas'}`;
    } catch (error) {
      target.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  };

  const showDetail = async (id) => {
    const idea = ideaCache.get(id) || currentIdeas.find((item) => item.id === id);
    if (!idea) return;
    const detail = document.getElementById('idea-detail');
    detail.innerHTML = `
      <span class="pill">${escapeHtml(idea.category)}</span>
      <h2 id="detail-title">${escapeHtml(idea.title)}</h2>
      <div class="idea-author"><button class="idea-avatar-link" data-social-action="profile" data-id="${escapeHtml(idea.creatorId)}" aria-label="View ${escapeHtml(idea.creator?.name || 'Start New member')}'s profile"><img src="${escapeHtml(avatar(idea.creator))}" alt=""></button><span>${escapeHtml(idea.creator?.name || 'Start New member')} · @${escapeHtml(idea.creator?.username || '')}</span></div>
      ${window.StartNew.state.user?.id === idea.creatorId ? `<div class="idea-actions owner-actions"><button data-idea-action="edit" data-id="${escapeHtml(idea.id)}">Edit idea</button><button data-idea-action="delete" data-id="${escapeHtml(idea.id)}">Delete idea</button></div>` : ''}
      ${idea.imageUrl ? `<img class="idea-detail-image" src="${escapeHtml(idea.imageUrl)}" alt="">` : ''}
      <p>${escapeHtml(idea.description)}</p>
      <div class="detail-fields">
        <div><b>Problem</b><span>${escapeHtml(idea.problem || 'Not added yet')}</span></div>
        <div><b>Solution</b><span>${escapeHtml(idea.solution || 'Not added yet')}</span></div>
        <div><b>Who it’s for</b><span>${escapeHtml(idea.targetAudience || 'Not specified')}</span></div>
        <div><b>Business model</b><span>${escapeHtml(idea.businessModel || 'Still exploring')}</span></div>
        <div><b>Stage</b><span>${escapeHtml(idea.stage)}</span></div>
        <div><b>Looking for</b><span>${escapeHtml(idea.helpRequired || 'Community feedback')}</span></div>
      </div>
      ${idea.documentUrl ? `<p><a class="document-link" href="${escapeHtml(idea.documentUrl)}" target="_blank" rel="noopener noreferrer">Open supporting document ↗</a></p>` : ''}
      <div class="detail-comments"><h3>Community thoughts</h3><div class="comment-list" id="comment-list"><p class="muted">Loading comments…</p></div>
        <form class="comment-form" id="comment-form"><input name="text" maxlength="1000" required placeholder="Add a thoughtful comment…"><button class="mini-action" type="submit">Post</button></form>
      </div>`;
    document.getElementById('detail-modal').classList.remove('hidden');
    try {
      const comments = await window.StartNew.request(`/contents/${encodeURIComponent(id)}/comments`);
      const list = document.getElementById('comment-list');
      list.innerHTML = comments.length
        ? comments
            .map(
              (comment) =>
                `<div class="comment-item"><b>${escapeHtml(comment.user?.name || 'Member')}</b>${escapeHtml(comment.text)}</div>`
            )
            .join('')
        : '<p class="muted">Be the first to share a thought.</p>';
    } catch (error) {
      document.getElementById('comment-list').innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
    document.getElementById('comment-form').addEventListener(
      'submit',
      async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const text = new FormData(form).get('text');
        if (!window.StartNew.requireUser()) return;
        try {
          await window.StartNew.request(`/contents/${encodeURIComponent(id)}/comments`, {
            method: 'POST',
            body: { text },
          });
          form.reset();
          await Promise.all([getIdeas(), loadFeed(), loadDashboardIdeas(), loadDashboardNetwork()]);
          await showDetail(id);
        } catch (error) {
          window.StartNew.toast(error.message, 'error');
        }
      },
      { once: true }
    );
  };

  const showEditForm = (id) => {
    const idea = ideaCache.get(id);
    if (!idea || window.StartNew.state.user?.id !== idea.creatorId) return;
    document.getElementById('idea-detail').innerHTML = `
      <span class="eyebrow">YOUR IDEA, YOUR NEXT VERSION</span><h2 id="detail-title">Edit your idea</h2>
      <form id="idea-edit-form" class="auth-form">
        <label>Title<input name="title" required maxlength="120" value="${escapeHtml(idea.title)}"></label>
        <label>Description<textarea name="description" rows="5" required maxlength="5000">${escapeHtml(idea.description)}</textarea></label>
        <div class="form-row"><label>Category<select name="category">${['Technology', 'Climate', 'Health', 'Education', 'Food', 'Finance', 'Community', 'Other'].map((value) => `<option ${idea.category === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Stage<select name="stage">${['Idea', 'Research', 'Prototype', 'Launched', 'Growing'].map((value) => `<option ${idea.stage === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div>
        <label>Problem<textarea name="problem" rows="2" maxlength="2000">${escapeHtml(idea.problem)}</textarea></label>
        <label>Solution<textarea name="solution" rows="2" maxlength="2000">${escapeHtml(idea.solution)}</textarea></label>
        <div class="form-row"><label>Target audience<input name="targetAudience" maxlength="500" value="${escapeHtml(idea.targetAudience)}"></label><label>Business model<input name="businessModel" maxlength="500" value="${escapeHtml(idea.businessModel)}"></label></div>
        <div class="form-row"><label>Help required<input name="helpRequired" maxlength="300" value="${escapeHtml(idea.helpRequired)}"></label><label>Funding amount<input name="fundingAmount" maxlength="100" value="${escapeHtml(idea.fundingAmount)}"></label></div>
        <div id="idea-edit-message" class="form-message hidden" role="status"></div>
        <button class="button button-primary button-full" type="submit">Save changes</button>
        <button class="text-button edit-cancel" type="button" data-idea-action="detail" data-id="${escapeHtml(idea.id)}">Cancel</button>
      </form>`;
    document.getElementById('idea-edit-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      const message = document.getElementById('idea-edit-message');
      try {
        const updated = await window.StartNew.request(`/contents/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: { ...Object.fromEntries(new FormData(form)), imageUrl: idea.imageUrl },
        });
        ideaCache.set(id, updated);
        await Promise.all([getIdeas(), loadFeed(), loadDashboardIdeas(), loadDashboardNetwork()]);
        await showDetail(id);
        window.StartNew.toast('Your idea has been updated.', 'success');
      } catch (error) {
        message.textContent = error.message;
        message.className = 'form-message error';
      } finally {
        button.disabled = false;
      }
    });
  };

  const showDeleteConfirmation = (id) => {
    const idea = ideaCache.get(id);
    if (!idea || window.StartNew.state.user?.id !== idea.creatorId) return;
    document.getElementById('idea-detail').innerHTML = `
      <span class="eyebrow">THIS ACTION CAN’T BE UNDONE</span><h2 id="detail-title">Delete “${escapeHtml(idea.title)}”?</h2>
      <p>Your idea and its comments will be removed from Start New.</p>
      <div class="person-actions"><button class="button button-outline" data-idea-action="detail" data-id="${escapeHtml(id)}">Keep idea</button><button class="button button-primary" data-idea-action="delete-confirm" data-id="${escapeHtml(id)}">Delete idea</button></div>`;
  };

  const deleteIdea = async (id) => {
    if (!window.StartNew.state.user) return;
    try {
      await window.StartNew.request(`/contents/${encodeURIComponent(id)}`, { method: 'DELETE' });
      ideaCache.delete(id);
      document.getElementById('detail-modal').classList.add('hidden');
      await Promise.all([getIdeas(), loadFeed(), loadDashboardIdeas(), loadDashboardNetwork()]);
      window.StartNew.toast('Your idea was deleted.');
    } catch (error) {
      window.StartNew.toast(error.message, 'error');
    }
  };

  // The main feed endpoint returns only ideas from creators the viewer follows.
  const loadFeed = async () => {
    const target = document.getElementById('feed-ideas');
    if (!window.StartNew.state.user) {
      target.innerHTML = '<div class="empty-state">Log in to see ideas from people you follow.</div>';
      return;
    }
    target.innerHTML = '<div class="loading-card">Loading community ideas…</div>';
    try {
      const ideas = await window.StartNew.request('/feed');
      currentIdeas = ideas;
      renderList(target, ideas, 'Follow people in the community to see their ideas here.');
    } catch (error) {
      target.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  };

  const loadDashboardIdeas = async () => {
    const target = document.getElementById('dashboard-ideas');
    if (!window.StartNew.state.user) return;
    try {
      const ideas = await window.StartNew.request(
        `/users/${encodeURIComponent(window.StartNew.state.user.id)}/contents`
      );
      currentIdeas = ideas;
      renderList(target, ideas.slice(0, 2), 'Your ideas will show up here when you share your first one.');
    } catch (error) {
      target.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  };

  const loadDashboardNetwork = async () => {
    const target = document.getElementById('dashboard-network');
    if (!window.StartNew.state.user) return;
    try {
      const ideas = await window.StartNew.request('/feed');
      currentIdeas = ideas;
      renderList(target, ideas.slice(0, 2), 'Follow people in the community to see their latest ideas here.');
    } catch (error) {
      target.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  };

  const submitIdea = async (event) => {
    event.preventDefault();
    if (!window.StartNew.requireUser()) return;
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const message = document.getElementById('idea-form-message');
    button.disabled = true;
    message.className = 'form-message';
    message.textContent = 'Sharing your idea…';
    try {
      let imageUrl = '';
      let documentUrl = '';
      const file = document.getElementById('idea-image').files[0];
      if (file) {
        const data = new FormData();
        data.append('file', file);
        data.append('folder', 'ideas');
        const uploaded = await window.StartNew.request('/uploads', { method: 'POST', body: data });
        imageUrl = uploaded.url;
      }
      const documentFile = document.getElementById('idea-document').files[0];
      if (documentFile) {
        const data = new FormData();
        data.append('file', documentFile);
        data.append('folder', 'documents');
        const uploaded = await window.StartNew.request('/uploads', { method: 'POST', body: data });
        documentUrl = uploaded.url;
      }
      const values = Object.fromEntries(new FormData(form));
      const idea = await window.StartNew.request('/contents', {
        method: 'POST',
        body: { ...values, imageUrl, documentUrl },
      });
      form.reset();
      message.textContent = 'Your idea is live. Thanks for sharing it!';
      message.className = 'form-message success';
      window.StartNew.toast('Your idea has been shared.', 'success');
      currentIdeas.unshift(idea);
      ideaCache.set(idea.id, idea);
      await Promise.all([getIdeas(), loadFeed(), loadDashboardIdeas(), loadDashboardNetwork()]);
    } catch (error) {
      message.textContent = error.message;
      message.className = 'form-message error';
    } finally {
      button.disabled = false;
    }
  };

  const handleAction = async (event) => {
    const button = event.target.closest('[data-idea-action]');
    if (!button) return;
    const { id, ideaAction } = button.dataset;
    if (ideaAction === 'detail' || ideaAction === 'comments') return showDetail(id);
    if (ideaAction === 'edit') return showEditForm(id);
    if (ideaAction === 'delete') return showDeleteConfirmation(id);
    if (ideaAction === 'delete-confirm') return deleteIdea(id);
    if (!window.StartNew.requireUser()) return;
    try {
      if (ideaAction === 'like') {
        const liked = button.classList.contains('is-active');
        const result = await window.StartNew.request(`/contents/${encodeURIComponent(id)}/like`, {
          method: liked ? 'DELETE' : 'POST',
        });
        button.textContent = `${result.liked ? '♥' : '♡'} ${result.likes}`;
        button.classList.toggle('is-active', result.liked);
      } else if (ideaAction === 'bookmark') {
        const bookmarked = button.classList.contains('is-active');
        const result = await window.StartNew.request(`/contents/${encodeURIComponent(id)}/bookmark`, {
          method: bookmarked ? 'DELETE' : 'POST',
        });
        button.textContent = `${result.bookmarked ? '▣ Saved' : '▢ Save'} ${result.saves}`;
        button.setAttribute(
          'aria-label',
          `${result.bookmarked ? 'Remove save' : 'Save idea'}; ${result.saves} saves`
        );
        button.classList.toggle('is-active', result.bookmarked);
      }
    } catch (error) {
      window.StartNew.toast(error.message, 'error');
    }
  };

  const setup = () => {
    document.getElementById('idea-search').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(getIdeas, 250);
    });
    document.getElementById('idea-category').addEventListener('change', getIdeas);
    document.getElementById('idea-stage').addEventListener('change', getIdeas);
    document.getElementById('idea-form').addEventListener('submit', submitIdea);
    ['explore-ideas', 'feed-ideas', 'dashboard-ideas', 'profile-ideas-grid'].forEach((id) =>
      document.getElementById(id).addEventListener('click', handleAction)
    );
    document.getElementById('dashboard-network').addEventListener('click', handleAction);
    document.getElementById('detail-modal').addEventListener('click', handleAction);
  };

  window.Ideas = {
    setup,
    getIdeas,
    loadFeed,
    loadDashboardIdeas,
    loadDashboardNetwork,
    showDetail,
    showEditForm,
    addToCache: (ideas) => ideas.forEach((idea) => ideaCache.set(idea.id, idea)),
    renderList,
    renderRecommendations,
    ideaMarkup,
  };
})();
