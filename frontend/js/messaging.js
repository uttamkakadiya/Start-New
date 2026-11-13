(() => {
  // Loads private conversations and keeps the selected message thread current.
  let activeConversation = null;
  let conversations = [];
  const escapeHtml = (value) => window.StartNew.escapeHtml(value || '');

  const loadConversations = async () => {
    const list = document.getElementById('conversation-list');
    if (!window.StartNew.state.user) {
      list.innerHTML = '<p class="muted">Log in to view your conversations.</p>';
      return;
    }
    list.innerHTML = '<p class="muted">Loading conversations…</p>';
    try {
      conversations = await window.StartNew.request('/conversations');
      const unread = conversations.reduce((count, item) => count + item.unread, 0);
      const badge = document.getElementById('unread-count');
      badge.textContent = unread;
      badge.classList.toggle('hidden', unread === 0);
      list.innerHTML = conversations.length
        ? conversations
            .map(
              (item) =>
                `<button class="conversation-item ${item.id === activeConversation ? 'active' : ''}" data-conversation-id="${escapeHtml(item.id)}">
          <img src="${escapeHtml(item.other?.profilePicture || '/frontend/images/default-avatar.svg')}" alt="">
          <span><b>${escapeHtml(item.other?.name || 'Member')}</b><small>${escapeHtml(item.lastMessage || 'Say hello')}</small></span>${item.unread ? '<em aria-label="Unread messages"></em>' : ''}
        </button>`
            )
            .join('')
        : '<p class="muted">No conversations yet. Find someone to connect with.</p>';
    } catch (error) {
      list.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  };

  // Opening a thread fetches its messages; the server also marks them as read.
  const openConversation = async (id) => {
    activeConversation = id;
    const item = conversations.find((conversation) => conversation.id === id);
    const target = document.getElementById('conversation-main');
    target.innerHTML = '<div class="empty-conversation"><p class="muted">Loading messages…</p></div>';
    try {
      const messages = await window.StartNew.request(`/conversations/${encodeURIComponent(id)}/messages`);
      target.innerHTML = `
        <div class="conversation-top"><img src="${escapeHtml(item?.other?.profilePicture || '/frontend/images/default-avatar.svg')}" alt=""><b>${escapeHtml(item?.other?.name || 'Conversation')}</b></div>
        <div class="conversation-messages" id="conversation-messages">${messages
          .map(
            (message) => `
          <div class="message-bubble ${message.senderId === window.StartNew.state.user.id ? 'mine' : ''}">
            ${escapeHtml(message.text)}<time>${new Date(message.createdAt).toLocaleString()}</time>
          </div>`
          )
          .join('')}</div>
        <form class="message-form" id="message-form"><input name="text" required maxlength="2000" autocomplete="off" placeholder="Write a message…"><button class="button button-primary" type="submit">Send</button></form>`;
      const messagePane = document.getElementById('conversation-messages');
      messagePane.scrollTop = messagePane.scrollHeight;
      document.getElementById('message-form').addEventListener('submit', sendMessage);
      await loadConversations();
    } catch (error) {
      target.innerHTML = `<div class="empty-conversation"><p class="muted">${escapeHtml(error.message)}</p></div>`;
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.text;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      await window.StartNew.request(`/conversations/${encodeURIComponent(activeConversation)}/messages`, {
        method: 'POST',
        body: { text: input.value },
      });
      await openConversation(activeConversation);
    } catch (error) {
      window.StartNew.toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  };

  const start = async (userId) => {
    if (!window.StartNew.requireUser()) return;
    const result = await window.StartNew.request('/conversations', { method: 'POST', body: { userId } });
    activeConversation = result.id;
    await loadConversations();
    await openConversation(result.id);
  };

  const setup = () => {
    document.getElementById('conversation-list').addEventListener('click', (event) => {
      const item = event.target.closest('[data-conversation-id]');
      if (item) openConversation(item.dataset.conversationId);
    });
    document.getElementById('new-message-button').addEventListener('click', () => {
      window.StartNew.showView('people');
      document.getElementById('people-search').focus();
      window.StartNew.toast('Find someone in the community and choose Message.');
    });
  };

  window.Messages = { setup, loadConversations, openConversation, start };
})();
