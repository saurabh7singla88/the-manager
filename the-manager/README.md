# The Manager

A hierarchical initiative tracker and mind map tool designed for managers and VPs — track initiatives, sub-tasks, priorities, and meeting notes, powered by AI suggestions.

## Features

- Hierarchical initiative & task tracking with drill-down
- Mind map visualization (ReactFlow)
- AI-powered priority suggestions (Ollama, OpenAI, Gemini, or any OpenAI-compatible API)
- Meeting Notes pulled directly from Gmail via IMAP
- Brainstorm board
- Password-protected Notes
- Multi-user with JWT authentication

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js 22, Express, Prisma v5, SQLite (better-sqlite3) |
| Frontend | React 18, Redux Toolkit, Material-UI v5, ReactFlow, Vite |
| AI | Ollama / OpenAI / Google Gemini / OpenAI-compatible |
| Email | IMAP via `imapflow` + `mailparser` |

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### 1. Clone & install

```bash
git clone <repository-url>
cd the-manager

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Configure backend environment

```bash
cd backend
cp .env.example .env   # or create .env manually
```

Minimum required `.env`:

```env
JWT_SECRET=your_random_secret_here
NODE_ENV=development
```

### 3. Run Prisma migrations

```bash
cd backend
npx prisma migrate dev
```

This creates `backend/prisma/dev.db` (SQLite).

### 4. Start servers

```bash
# Terminal 1 — backend (port 3001)
cd backend && npm run dev

# Terminal 2 — frontend (port 5173)
cd frontend && npm run dev
```

Open http://localhost:5173, register an account, and start tracking.

---

## Configuration

All optional features are configured from the **Setup** page inside the app (sidebar → Setup), or manually via `.env`.

### AI Suggestions

The app scores your initiatives structurally (priority, staleness, blocked sub-tasks, due dates) without any AI config. LLM analysis of descriptions is an optional enhancement.

#### Option A — Ollama (free, local, recommended)

1. Install Ollama: https://ollama.com
2. Pull a model:
   ```bash
   ollama pull llama3.1
   ```
3. In the app, go to **Setup → AI** and select **Ollama**, set URL to `http://localhost:11434`.

No API key needed.

#### Option B — Google Gemini

1. Get an API key: https://aistudio.google.com/apikey
2. In the app go to **Setup → AI**, select **Gemini**, paste your API key, choose a model (e.g. `gemini-2.5-flash`).

Alternatively, add to `.env`:
```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
```

#### Option C — OpenAI / ChatGPT

1. Get an API key: https://platform.openai.com/api-keys
2. In the app go to **Setup → AI**, select **OpenAI**, paste your API key.

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
```

#### Option D — OpenAI-compatible (LM Studio, Groq, Together AI, Mistral, etc.)

In the app select **OpenAI-compatible**, enter your base URL, API key, and model name.

```env
AI_PROVIDER=openai_compatible
OPENAI_BASE_URL=https://api.groq.com/openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=llama-3.1-70b-versatile
```

#### Option E — Disabled

Select **Disabled** in Setup → AI. Structural scoring still works, only LLM description analysis is skipped.

---

### Gmail Integration (Meeting Notes)

The **Meeting Notes** page fetches emails from a Gmail label (e.g. `Gemini Notes`) via IMAP.

#### Step 1 — Enable 2-Step Verification

Go to https://myaccount.google.com/security and ensure 2-Step Verification is ON.

#### Step 2 — Generate an App Password

1. Visit https://myaccount.google.com/apppasswords
2. Create a new App Password (name it anything, e.g. "The Manager")
3. Copy the 16-character password

#### Step 3 — Add to `.env`

```env
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

#### Step 4 — Encrypt the password (recommended)

Run the encryption helper once — it updates `.env` in place:

```bash
cd backend
node setup-env.js
```

This:
- Generates a `TOKEN_ENCRYPTION_KEY` (AES-256 key)
- Encrypts `GMAIL_APP_PASSWORD` in `.env` as `enc:<iv>:<tag>:<ciphertext>`
- The plaintext is never stored on disk after this

Your `.env` will look like:
```env
GMAIL_USER=you@gmail.com
TOKEN_ENCRYPTION_KEY=<64 hex chars>
GMAIL_APP_PASSWORD=enc:b7522c...:8a2d2c...:10280f...
```

#### Step 5 — Restart the backend

```bash
cd backend && npm run dev
```

#### Step 6 — Open Meeting Notes

Navigate to **Meeting Notes** in the sidebar. The default label is **Gemini Notes** — change it to whatever Gmail label you use, or type a custom one.

#### Troubleshooting

Hit `GET /api/gmail/test-config` (while logged in) to validate credentials:
```
http://localhost:3001/api/gmail/test-config
```

Returns `{ ok: true }` on success or an error message explaining what's wrong.

If the label name isn't found, the error response lists all your available Gmail labels so you can click the right one directly in the UI.

---

## Project Structure

```
the-manager/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # SQLite schema
│   │   └── dev.db             # SQLite database (gitignored)
│   ├── src/
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── cipher.js      # AES-256-GCM encrypt/decrypt
│   │   │   └── errorHandler.js
│   │   └── routes/
│   │       ├── ai.js          # AI suggestions + settings
│   │       ├── auth.js
│   │       ├── brainstorm.js
│   │       ├── canvases.js
│   │       ├── gmail.js       # Gmail IMAP integration
│   │       ├── initiatives.js
│   │       ├── notes.js
│   │       └── users.js
│   ├── setup-env.js           # One-time password encryption helper
│   └── .env                   # NOT committed to git
│
└── frontend/
    └── src/
        ├── components/
        │   ├── AISettingsDialog.jsx
        │   ├── AIPriorityStrip.jsx
        │   ├── AISuggestionsPanel.jsx
        │   └── Layout.jsx
        └── pages/
            ├── Dashboard.jsx
            ├── InitiativesList.jsx
            ├── MeetingNotes.jsx
            ├── MindMap.jsx
            ├── Notes.jsx
            ├── Setup.jsx
            └── Tasks.jsx
```

---

## API Reference

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Current user |

### Initiatives
| Method | Path | Description |
|---|---|---|
| GET | `/api/initiatives` | List all |
| POST | `/api/initiatives` | Create |
| PUT | `/api/initiatives/:id` | Update |
| DELETE | `/api/initiatives/:id` | Delete |

### AI
| Method | Path | Description |
|---|---|---|
| GET | `/api/ai/suggestions` | Get AI priority suggestions |
| GET | `/api/ai/settings` | Get current AI config |
| PUT | `/api/ai/settings` | Save AI config |

### Gmail
| Method | Path | Description |
|---|---|---|
| GET | `/api/gmail/meeting-notes` | Fetch emails from a label |
| GET | `/api/gmail/test-config` | Test IMAP credentials |

---

## License

MIT


## Features

- ✅ Hierarchical initiative tracking
- ✅ Status and priority management
- ✅ User authentication
- ✅ Dashboard with analytics
- ✅ List view with drill-down
- 🔄 Mind map visualization (Phase 2)
- 🔄 Links and attachments (Phase 3)
- 🔄 Comments and activity logs (Phase 3)

## Tech Stack

### Backend
- Node.js + Express
- PostgreSQL + Prisma ORM
- JWT Authentication

### Frontend
- React 18
- Redux Toolkit
- Material-UI
- Vite

## Getting Started

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- npm or yarn

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd mindmap
```

2. **Backend Setup**
```bash
cd backend
npm install

# Create .env file
cp .env.example .env
# Edit .env with your database credentials

# Run migrations
npx prisma migrate dev
npx prisma generate

# Start backend server
npm run dev
```

The backend will run on http://localhost:3001

3. **Frontend Setup**
```bash
cd frontend
npm install

# Start frontend
npm run dev
```

The frontend will run on http://localhost:5173

### Database Setup

Create a PostgreSQL database:
```sql
CREATE DATABASE initiative_tracker;
```

Update your `.env` file with the database URL:
```
DATABASE_URL="postgresql://username:password@localhost:5432/initiative_tracker?schema=public"
```

Run Prisma migrations:
```bash
cd backend
npx prisma migrate dev
```

## Usage

1. Navigate to http://localhost:5173
2. Register a new account
3. Login with your credentials
4. Start creating initiatives!

### Creating Initiatives

1. Click "New Initiative" button
2. Fill in the title, description, type, priority
3. Click "Create"
4. Initiatives can have sub-initiatives (hierarchical structure)

### Managing Status & Priority

- Use the dropdown menus directly on each initiative card
- Status: Open, In Progress, Blocked, On Hold, Completed, Cancelled
- Priority: Critical, High, Medium, Low

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Initiatives
- `GET /api/initiatives` - Get all initiatives
- `GET /api/initiatives/:id` - Get single initiative
- `POST /api/initiatives` - Create initiative
- `PUT /api/initiatives/:id` - Update initiative
- `DELETE /api/initiatives/:id` - Delete initiative
- `PATCH /api/initiatives/:id/status` - Update status
- `PATCH /api/initiatives/:id/priority` - Update priority
- `GET /api/initiatives/:id/children` - Get child initiatives

## Development

### Project Structure

```
backend/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── middleware/
│   ├── routes/
│   └── server.js
└── package.json

frontend/
├── src/
│   ├── api/
│   ├── components/
│   ├── features/
│   ├── pages/
│   ├── App.jsx
│   └── main.jsx
└── package.json
```

### Running Tests

```bash
# Backend tests (when added)
cd backend
npm test

# Frontend tests (when added)
cd frontend
npm test
```

## Next Steps (Upcoming Phases)

### Phase 2: Mind Map Visualization
- React Flow integration
- Visual node representation
- Drag & drop positioning

### Phase 3: Enhanced Features
- Link management
- Comments system
- Activity logs
- Search & filters

### Phase 4: Analytics
- Progress tracking
- Dashboard metrics
- Next priority queue

### Phase 5: Polish
- Performance optimization
- Export functionality
- Keyboard shortcuts

### Phase 6: Desktop App
- PWA implementation
- Offline support
- Optional Electron wrapper

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT

## Support

For issues and questions, please create an issue in the repository.
