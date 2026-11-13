# Start New

Start New is a social-networking application for sharing early-stage ideas, connecting with people, and exploring funding opportunities.

## Run locally

1. Install a recent Node.js release and make sure MongoDB is available.
2. Copy `.env.example` to `.env` and set `MONGODB_URI` and `MONGODB_DATABASE` if the defaults do not match your setup.
3. Run `npm install`, then `npm start` from the project directory.
4. Open the local URL printed by the server.

The backend lives in `backend/` and the single-page client, styles, scripts, and images live in `frontend/`.

Run `npm run format` to format the application source files consistently.

Keep `.env` private. Set a strong `SESSION_SECRET` for deployments. AI features require a valid `AI_API_KEY`; an OpenAI-compatible provider can be selected with `AI_API_URL` and `AI_MODEL`. Startup news uses Hacker News search by default and switches to NewsAPI when `NEWS_API_KEY` is configured.

## Main features

- The browser uses asynchronous requests for idea search, social actions, messages, and notifications. The API is under `/m01064311`.
- The signed-in feed contains ideas from followed users. Idea search (`GET /m01064311/contents`) and the feed require a signed-in session.
- Image and document uploads are limited to 8 MB. Supported formats are JPEG, PNG, WebP, and PDF; PDFs are accepted for documents only.
- Startup news comes from Hacker News search (or NewsAPI when configured), currency data from Frankfurter, and current London weather from Open-Meteo. The Explore interface links to each provider.
- AI and third-party API routes are grouped in `backend/routes/` to keep the application entry point focused on setup and shared infrastructure.
- The AI page offers idea evaluation and business-plan generation; the idea Q&A assistant appears at the bottom of every page. Configure the AI key locally and test all three options before demonstrating the feature.

## Export the database

Run `npm run dump:db` to export every collection in the configured MongoDB database as MongoDB Extended JSON. Each run creates a timestamped directory under `database-dump/` and a manifest with collection names and record counts. Extended JSON preserves MongoDB values such as ObjectIds and dates.

Run `npm test` for the focused unit tests covering safe external-news links and provider response mapping.

Database exports can contain private profiles, password hashes, and messages. Keep them private and submit them only through the coursework's approved channel. Do not include `.env` or `node_modules` in a source-code archive.
