# Initiative Tracker

A hybrid TODO list and mind map application designed for VPs and top managers to track and manage multiple initiatives with hierarchical drill-down capabilities.

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
