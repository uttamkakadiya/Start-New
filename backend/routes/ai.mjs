import axios from 'axios';

export const registerAIRoutes = ({ app, api, requireAuth, handleAsync, sendError, cleanString }) => {
  const requestAICompletion = async (messages, maxTokens) => {
    const payload = {
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      messages,
      temperature: 0.4,
    };
    if (maxTokens) payload.max_tokens = maxTokens;
    const response = await axios.post(
      process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions',
      payload,
      {
        headers: { Authorization: `Bearer ${process.env.AI_API_KEY}` },
        timeout: 30000,
      }
    );
    const result = response.data?.choices?.[0]?.message?.content;
    return typeof result === 'string' && result.trim() ? result.trim() : null;
  };

  const aiHandler = (mode) =>
    handleAsync(async (req, res) => {
      const idea = cleanString(req.body?.idea, 5000);
      if (!idea) return sendError(res, 400, 'Submit a business idea to continue.');
      if (!process.env.AI_API_KEY)
        return sendError(res, 503, 'AI is not configured. Add AI_API_KEY to the server environment.');
      const businessPlan = mode === 'plan';
      const instruction = businessPlan
        ? 'Create a concise, practical early-stage business plan covering value proposition, customers, validation steps, delivery, revenue, risks, and a 30-day action plan.'
        : 'Evaluate this business idea with a short summary, target audience, problem-solution fit, strengths, weaknesses, improvements, revenue models, and first development steps.';
      const result = await requestAICompletion([
        {
          role: 'system',
          content:
            'You are Start New, a cautious startup mentor. Give practical, non-financial-advice feedback. Do not invent market facts.',
        },
        { role: 'user', content: `${instruction}\n\nIdea:\n${idea}` },
      ]);
      if (!result) return sendError(res, 502, 'The AI provider returned no usable feedback.');
      res.json({ type: businessPlan ? 'business-plan' : 'idea-evaluation', result });
    });

  // Only bounded user/assistant turns are accepted; system roles remain server-controlled.
  const aiChatHandler = handleAsync(async (req, res) => {
    const message = cleanString(req.body?.message, 2000);
    const idea = cleanString(req.body?.idea, 5000);
    if (!message) return sendError(res, 400, 'Enter a question for the AI assistant.');
    if (req.body?.history !== undefined && !Array.isArray(req.body.history)) {
      return sendError(res, 400, 'Conversation history must be a list of messages.');
    }
    if (!process.env.AI_API_KEY)
      return sendError(res, 503, 'AI is not configured. Add AI_API_KEY to the server environment.');
    const history = (req.body?.history || []).slice(-10);
    const messages = [
      {
        role: 'system',
        content:
          'You are Start New’s idea assistant. Answer questions about startup ideas in a helpful, practical, concise way. Ask clarifying questions when useful. Do not invent market facts, provide professional financial or legal advice, or claim to have performed actions.',
      },
    ];
    if (idea) messages.push({ role: 'system', content: `User-provided idea context:\n${idea}` });
    for (const item of history) {
      if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') {
        return sendError(res, 400, 'Conversation history contains an invalid message.');
      }
      const content = cleanString(item.content, 2000);
      if (content) messages.push({ role: item.role, content });
    }
    messages.push({ role: 'user', content: message });
    const result = await requestAICompletion(messages, 700);
    if (!result) return sendError(res, 502, 'The AI provider returned no usable answer.');
    res.json({ type: 'chat', result });
  });

  app.post(`${api}/ai/evaluate`, requireAuth, aiHandler('evaluate'));
  app.post(`${api}/ai/business-plan`, requireAuth, aiHandler('plan'));
  app.post(`${api}/ai/chat`, requireAuth, aiChatHandler);
};
