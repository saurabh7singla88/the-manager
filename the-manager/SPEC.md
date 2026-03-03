# Initiative Tracker - Technical Specification

## 1. Project Overview

**Name:** Initiative Tracker  
**Description:** A hybrid TODO list and mind map application designed for VPs and top managers to track and manage multiple initiatives with hierarchical drill-down capabilities.

**Target Users:** VP-level executives and top managers who need to:
- Track multiple strategic initiatives
- Maintain high-level overview while accessing granular details
- Prioritize work and identify blockers
- Quick reference to important links and resources

## 2. Technical Stack

### Backend
- **Runtime:** Node.js (LTS version, 18.x or later)
- **Framework:** Express.js
- **Database:** PostgreSQL (primary) with option for MongoDB (flexibility for hierarchical data)
- **ORM:** Prisma (for PostgreSQL) or Mongoose (for MongoDB)
- **Authentication:** JWT (JSON Web Tokens)
- **API Style:** RESTful API with GraphQL consideration for complex queries

### Frontend
- **Framework:** React 18+
- **State Management:** Redux Toolkit or Zustand
- **Routing:** React Router v6
- **UI Library:** Material-UI (MUI) or Ant Design
- **Visualization:** React Flow or D3.js for mind map view
- **Styling:** Tailwind CSS or Styled Components
- **Build Tool:** Vite

### DevOps & Tools
- **Package Manager:** npm or yarn
- **Version Control:** Git
- **Code Quality:** ESLint, Prettier
- **Testing:** Jest, React Testing Library, Supertest
- **Containerization:** Docker (optional)

## 3. Core Features

### 3.1 Hierarchical Task/Initiative Structure
- **Multi-level hierarchy:** Initiative → Sub-initiative → Task → Subtask
- **Unlimited depth** for drilling down
- **Parent-child relationships** maintained in data model

### 3.2 Dual View Modes

#### A. Mind Map View
- Visual representation of initiatives and their relationships
- Collapsible/expandable nodes
- Drag-and-drop repositioning
- Zoom and pan capabilities
- Visual indicators for status, priority, and progress

#### B. List View (TODO-style)
- Hierarchical list with indentation
- Sortable columns (priority, status, due date, owner)
- Filterable by status, priority, tags
- Quick actions (mark complete, change priority)

### 3.3 Priority Management
- **Priority Levels:** Critical, High, Medium, Low
- **Status Categories:** 
  - Open/Not Started
  - In Progress
  - Blocked
  - On Hold
  - Completed
  - Cancelled
- **Next Priority Queue:** Dedicated view for next actionable items

### 3.4 Link Management
- Attach multiple links to any initiative/task
- Link metadata: URL, title, description, tags
- Quick access panel for frequently used links
- Link categorization (documentation, resources, references)

### 3.5 Details Panel
- Rich text description
- Assignee(s)
- Due dates and milestones
- Progress tracking (percentage complete)
- Tags and labels
- Attachments and links
- Activity history/audit trail
- Comments/notes

### 3.6 Search & Filter
- Full-text search across all initiatives
- Filter by: status, priority, assignee, tags, date range
- Saved filter presets
- Quick filters (My Tasks, Overdue, This Week, etc.)

### 3.7 Dashboard & Analytics
- Overview of all initiatives
- Progress metrics
- Blocked items alert
- Upcoming deadlines
- Completion statistics
- Custom widgets

### 3.8 Canvas Workspaces
- Named workspaces that scope both List View and Mind Map to a subset of initiatives
- **"All" mode:** no canvas filter — all initiatives are visible across both views
- Each canvas has a name, optional description, and a color (used as accent in the UI)
- Initiatives are optionally linked to one canvas (`canvasId` nullable FK)
- Creating a canvas auto-switches the active workspace to it
- Deleting a canvas unlinks its initiatives (sets `canvasId = null`) but does not delete them
- Canvas selection persists in Redux state; both views re-fetch when it changes
- Pill-tab selector rendered at the top of both List View and Mind Map pages
- Right-click a canvas pill for Rename / Delete actions

### 3.9 Tasks View
**Architecture decision: reuse the `Initiative` table** (no separate table)
- Rationale: `type: 'TASK'` already exists; canvas, links, comments, activity, and tags work out of the box; a separate table would duplicate ~80% of the schema
- A standalone task is an `Initiative` record with `type = 'TASK'`, `parentId = null`, and `isStandaloneTask = true`
- Tasks optionally reference an initiative via `linkedInitiativeId` (separate from `parentId`) — they remain independent but carry context
- **Dedicated Tasks page** separate from the hierarchical Initiatives list
- **Checkbox UI** — checking a task sets `status = 'COMPLETED'`; unchecking sets it back to `'OPEN'`
- **Canvas scoping** — same `CanvasSelector` pill bar; tasks are filtered by `canvasId` like initiatives
- **Grouping** — tasks grouped by: Linked Initiative, Canvas, Priority, or Due Date (user-selectable)
- **Quick-add** — single-line input at the top to create a task instantly (title only, rest optional)
- Task detail opens in the same `InitiativeDetailDrawer` (links, comments, activity all available)
- Tasks are **not** shown in the Mind Map view (they are not spatial/hierarchical nodes)

### 3.10 Brainstorming Canvas

A free-form scratch-pad for ideation, separate from the structured Initiatives/MindMap views.

**Purpose:** Let users quickly sketch ideas as shapes and text, connect them with arrows, then promote finished blocks to real initiatives with one click.

**Canvas behaviour**
- Infinite free-form canvas powered by React Flow (same library as Mind Map)
- State is local (in-memory) — not persisted to the database; intentionally ephemeral
- Clearing the canvas or navigating away discards the board

**Shape palette (toolbar)**
| Shape | Use |
|---|---|
| Rectangle (Box) | Default idea block |
| Circle | Concept / key term |
| Diamond | Decision / branch point |
| Sticky Note | Quick annotation (yellow) |
| Text | Plain floating label |

**Interactions**
- Click a shape in the toolbar → click anywhere on the canvas to place it
- Double-click any shape to edit its label inline
- Drag from a node handle to another node to draw an arrow edge
- Select + `Delete`/`Backspace` to remove nodes or edges
- Multi-select with rubber-band drag or Shift+click
- Zoom + pan (mouse wheel / trackpad)
- "Clear All" button resets the canvas

**Push to Initiative**
- Select one or more nodes → "Push to Initiative" button becomes active in the toolbar
- Opens a dialog pre-filled with the node label as the title
- User can set: Title, Description, Type (INITIATIVE / TASK), Status, Priority, Canvas
- **Single node:** creates one Initiative record
- **Multiple nodes + edges:** creates a tree — edges between selected nodes determine parent-child relationships; the root node (no incoming edge from the selection) becomes the parent initiative, connected children become sub-initiatives
- On success: a success toast is shown and the pushed block(s) get a subtle ✓ badge

**Navigation:** Available in the sidebar as "Brainstorm" (Lightbulb icon)

### 3.11 AI Prioritization Suggestions ✅ Implemented

An intelligent advisor that analyses all active initiatives and surfaces the ones that need attention most urgently.

**How it works**
- Triggered by the **"AI Suggestions"** button in the Dashboard header and the Initiatives toolbar
- Opens a right-side drawer ranking up to 8 initiatives by computed urgency score
- Each suggestion shows: rank badge, status + priority chips, and up to 3 plain-English reason chips

**Scoring signals (structural)**
| Signal | Max pts | Example |
|---|---|---|
| Due date | 50 | Overdue by N days, Due today |
| Status | 38 | Blocked, On Hold |
| Priority | 40 | CRITICAL, HIGH |
| Staleness | 22 | No updates for N days |
| Blocked sub-items | 30 | 2 blocked sub-items |
| Open sub-item sprawl | 15 | 4 sub-items still open |

**LLM description analysis (Ollama)**
- All initiative descriptions are sent in a **single batched prompt** to a local Ollama model (`llama3.1:latest` by default)
- The model reads natural language intent — phrases like "must do", "scaling concern", "urgent", "at risk", "cannot wait" all raise the score
- Ollama urgency score (0–100) maps to 0–55 bonus points layered on top of structural signals
- **Graceful fallback:** if Ollama is unavailable or times out (30 s), structural scoring still runs and results are still returned
- A `🦙 Ollama` badge appears in the panel when LLM analysis successfully ran
- Configure via env vars: `OLLAMA_BASE_URL` (default `http://localhost:11434`), `OLLAMA_MODEL` (default `llama3.1:latest`)

**UI**
- Reason chips use `🧠` icon for LLM-sourced signals (distinct purple tint) vs structural chips
- When a `🧠` chip fires, the matching description snippet is quoted inline below the row
- Manual Refresh button re-runs the full analysis
- Footer lists all active scoring dimensions

## 4. Data Models

### 4.1 Initiative/Node Model
```javascript
{
  id: UUID,
  title: String (required),
  description: String (rich text),
  type: Enum ['INITIATIVE', 'TASK', 'SUBTASK'],
  isStandaloneTask: Boolean (default: false),  // true = appears in Tasks view
  linkedInitiativeId: UUID (nullable),         // optional initiative context for standalone tasks
  parentId: UUID (nullable),
  status: Enum ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
  priority: Enum ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
  assignees: Array<UserId>,
  dueDate: Date (nullable),
  startDate: Date (nullable),
  progress: Number (0-100),
  tags: Array<String>,
  canvasId: UUID (nullable, FK → Canvas),
  position: Object { x: Number, y: Number }, // for mind map view
  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdBy: UserId,
  completedAt: Timestamp (nullable)
}
```

### 4.2 Link Model
```javascript
{
  id: UUID,
  initiativeId: UUID (foreign key),
  url: String (required),
  title: String,
  description: String,
  category: String,
  tags: Array<String>,
  createdAt: Timestamp,
  createdBy: UserId
}
```

### 4.3 User Model
```javascript
{
  id: UUID,
  email: String (required, unique),
  name: String (required),
  avatar: String (URL),
  role: Enum ['admin', 'manager', 'viewer'],
  preferences: Object {
    defaultView: String,
    theme: String,
    notifications: Boolean
  },
  createdAt: Timestamp,
  lastLogin: Timestamp
}
```

### 4.4 Comment Model
```javascript
{
  id: UUID,
  initiativeId: UUID (foreign key),
  userId: UUID (foreign key),
  content: String (required),
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 4.5 Activity Log Model
```javascript
{
  id: UUID,
  initiativeId: UUID (foreign key),
  userId: UUID (foreign key),
  action: String (e.g., 'created', 'updated', 'status_changed'),
  changes: JSON,
  timestamp: Timestamp
}
```

### 4.6 Canvas Model
```javascript
{
  id: UUID,
  name: String (required),
  description: String (nullable),
  color: String (hex, default: '#6366f1'),
  createdById: UUID (foreign key → User),
  initiatives: Initiative[],   // back-relation
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```
`Initiative` gains:
```javascript
{
  canvasId: UUID (nullable, FK → Canvas),
  // ... existing fields
}
```

## 5. API Endpoints

### 5.1 Initiatives
```
GET    /api/initiatives              - Get all initiatives (with filters)
                                       ?isStandaloneTask=true  – Tasks view fetch
                                       ?canvasId=<uuid>        – Canvas filter
                                       ?linkedInitiativeId=<id>– Tasks linked to an initiative
GET    /api/initiatives/:id          - Get single initiative with details
POST   /api/initiatives              - Create new initiative or standalone task
PUT    /api/initiatives/:id          - Update initiative / task
DELETE /api/initiatives/:id          - Delete initiative
GET    /api/initiatives/:id/children - Get child initiatives
GET    /api/initiatives/:id/path     - Get full hierarchy path
PATCH  /api/initiatives/:id/status   - Update status
PATCH  /api/initiatives/:id/priority - Update priority
PATCH  /api/initiatives/:id/position - Update position (for mind map)
```

### 5.2 Links
```
GET    /api/initiatives/:id/links    - Get all links for initiative
POST   /api/initiatives/:id/links    - Add link to initiative
PUT    /api/links/:id                - Update link
DELETE /api/links/:id                - Delete link
```

### 5.3 Comments
```
GET    /api/initiatives/:id/comments - Get comments
POST   /api/initiatives/:id/comments - Add comment
PUT    /api/comments/:id             - Update comment
DELETE /api/comments/:id             - Delete comment
```

### 5.4 Users
```
POST   /api/auth/register            - Register new user
POST   /api/auth/login               - Login
POST   /api/auth/logout              - Logout
GET    /api/users/me                 - Get current user
PUT    /api/users/me                 - Update current user
GET    /api/users                    - Get all users (for assignment)
```

### 5.5 Dashboard
```
GET    /api/dashboard/stats          - Get dashboard statistics
GET    /api/dashboard/upcoming       - Get upcoming deadlines
GET    /api/dashboard/blocked        - Get blocked items
```

### 5.6 Canvases
```
GET    /api/canvases                 - List canvases owned by current user (includes _count.initiatives)
POST   /api/canvases                 - Create new canvas
PUT    /api/canvases/:id             - Update canvas (owner only)
DELETE /api/canvases/:id             - Delete canvas; unlinks initiatives first (owner only)
```
`GET /api/initiatives` now accepts an optional `canvasId` query parameter:
```
GET /api/initiatives?canvasId=<uuid>   - Filter by canvas
GET /api/initiatives?canvasId=null     - Initiatives with no canvas
GET /api/initiatives                   - All initiatives (no filter)
```
`POST /api/initiatives` and `PUT /api/initiatives/:id` accept optional `canvasId` in the request body.

### 5.7 AI Suggestions
```
GET    /api/ai/suggestions           - Get ranked prioritization suggestions
                                       ?limit=<n>       – Max results (default 8)
                                       ?canvasId=<uuid> – Scope to a specific canvas
```
Response shape:
```json
{
  "suggestions": [
    {
      "id": "uuid",
      "title": "string",
      "description": "string | null",
      "status": "OPEN | IN_PROGRESS | BLOCKED | ON_HOLD",
      "priority": "CRITICAL | HIGH | MEDIUM | LOW",
      "dueDate": "ISO date | null",
      "parentId": "uuid | null",
      "score": 84,
      "reasons": [
        { "label": "string", "weight": 40, "icon": "🔴" }
      ]
    }
  ],
  "analysedCount": 12,
  "llmUsed": true,
  "generatedAt": "ISO timestamp"
}
```

## 6. UI/UX Design

### 6.1 Layout Structure
```
┌─────────────────────────────────────────────────┐
│ Header (Logo, Search, User Menu)               │
├─────────┬───────────────────────────────────────┤
│         │ Main Content Area                     │
│ Sidebar │ - Mind Map View / List View           │
│         │ - Details Panel (slide-in)            │
│ - Nav   │                                       │
│ - Quick │                                       │
│   Links │                                       │
│ - Filters│                                      │
│         │                                       │
└─────────┴───────────────────────────────────────┘
```

### 6.2 Navigation
- **Dashboard:** Overview and metrics
- **Mind Map:** Visual graph view
- **List View:** Hierarchical initiatives list
- **Tasks:** Standalone tasks with checkbox completion and canvas scoping
- **My Tasks:** User's assigned items
- **Next Priority:** Priority queue view
- **Quick Links:** Saved links library
- **Settings:** User preferences and configuration

#### Canvas Selector (within List View & Mind Map)
- Horizontal pill-tab bar positioned above the main content
- "All" pill (dark/active when no canvas selected)
- One pill per canvas with color dot and initiative count
- "+" icon button opens Create Canvas dialog (name + description + color palette)
- Right-click any canvas pill for Rename / Delete context menu
- Active canvas stored globally in Redux; switching instantly re-fetches the view

### 6.3 Key Interactions
- **Double-click node:** Open details panel
- **Right-click node:** Context menu (edit, delete, add child, mark complete)
- **Drag node:** Reposition in mind map
- **Hover node:** Show quick info tooltip
- **Click expand/collapse:** Toggle children visibility
- **Keyboard shortcuts:** Navigation and quick actions

### 6.4 Design Principles
- **Clean and minimal:** Reduce visual clutter
- **Progressive disclosure:** Show details on demand
- **Responsive:** Work on desktop and tablet
- **Accessible:** WCAG 2.1 AA compliance
- **Fast:** Optimistic updates, lazy loading

## 7. Implementation Phases

### Phase 1: MVP (Core Functionality)
**Duration:** 4-6 weeks

- [ ] Project setup and configuration
- [ ] Database schema and models
- [ ] Basic authentication (register/login)
- [ ] CRUD operations for initiatives
- [ ] Hierarchical data structure
- [ ] Simple list view
- [ ] Basic details panel
- [ ] Status and priority management

### Phase 2: Visualization
**Duration:** 3-4 weeks

- [ ] Mind map view implementation
- [ ] Node positioning and layout algorithm
- [ ] Drag-and-drop functionality
- [ ] Zoom and pan controls
- [ ] Visual status indicators
- [ ] View toggle (list/mind map)

### Phase 3: Enhanced Features
**Duration:** 3-4 weeks

- [ ] Link management
- [ ] Comments system
- [ ] Activity log/history
- [ ] Search functionality
- [ ] Filters and sorting
- [ ] Tags system

### Phase 4: Management & Analytics
**Duration:** 2-3 weeks

- [ ] Dashboard implementation
- [ ] Progress tracking
- [ ] Next priority queue
- [ ] Analytics and metrics
- [ ] Due date and reminders
- [ ] Bulk operations

### Phase 5: Polish & Optimization
**Duration:** 2-3 weeks

- [ ] Performance optimization
- [ ] Responsive design refinement
- [ ] Keyboard shortcuts
- [ ] User preferences
- [ ] Export functionality (PDF, JSON)
- [ ] Testing and bug fixes

### Phase 6: Desktop App Support
**Duration:** 2-3 weeks

- [ ] Progressive Web App (PWA) implementation
- [ ] Service worker for offline capabilities
- [ ] Desktop installation support
- [ ] App manifest configuration
- [ ] Optional: Electron wrapper for true desktop app
- [ ] Desktop-specific optimizations (keyboard shortcuts, system tray)
- [ ] Auto-update mechanism

### Phase 7: Canvas Workspaces ✅ Implemented
**Duration:** Completed February 2026

- [x] `Canvas` Prisma model with `color`, `description`, `createdById` FK
- [x] `canvasId` nullable FK added to `Initiative`
- [x] Database migration applied (`add_canvas`)
- [x] Full Canvas CRUD API (`/api/canvases`)
- [x] `GET /api/initiatives` supports `canvasId` query filter
- [x] `canvasSlice` Redux slice — `fetchCanvases`, `createCanvas`, `updateCanvas`, `deleteCanvas`, `setActiveCanvas`
- [x] `CanvasSelector` component — pill tabs, create dialog with color picker, right-click rename/delete
- [x] List View and Mind Map scoped by active canvas
- [x] New initiatives stamped with `canvasId` of the active canvas

### Phase 8: Tasks View
**Duration:** In progress – March 2026

- [ ] `isStandaloneTask Boolean` field added to `Initiative` schema
- [ ] `linkedInitiativeId String?` field added to `Initiative` schema (self-relation, nullable)
- [ ] DB migration applied
- [ ] `GET /api/initiatives?isStandaloneTask=true` filter in backend
- [ ] `linkedInitiativeId` accepted in POST/PUT
- [ ] `Tasks.jsx` page — quick-add bar, checkbox rows, canvas selector, grouping toggle
- [ ] Sidebar nav updated to include Tasks link
- [ ] `initiativesSlice` — `fetchTasks` thunk
- [ ] Task detail opens in `InitiativeDetailDrawer` (full links/comments/activity)
- [ ] `linkedInitiativeId` picker in task create/edit (shows list of INITIATIVE-type items)

### Phase 9: AI Prioritization ✅ Implemented
**Duration:** Completed March 2026

- [x] `GET /api/ai/suggestions` endpoint — scoring engine with 6 structural signals
- [x] Batched Ollama LLM call — all descriptions analysed in a single prompt round-trip
- [x] Graceful fallback — structural scoring runs independently if Ollama is unavailable
- [x] `AISuggestionsPanel` component — right-side drawer with ranked suggestions
- [x] `AISuggestionsButton` trigger — placed in Dashboard header and Initiatives toolbar
- [x] Reason chips with distinct `🧠` icon for LLM-sourced signals
- [x] Description snippet quoted inline when LLM analysis fired
- [x] `🦙 Ollama` badge in panel header when LLM was used
- [x] Configurable via `OLLAMA_BASE_URL` and `OLLAMA_MODEL` env vars

## 8. Technical Considerations

### 8.1 Performance
- **Virtualization:** For large lists (react-window or react-virtualized)
- **Pagination:** For API responses
- **Caching:** Redis for frequently accessed data
- **Debouncing:** For search and auto-save
- **Code splitting:** Lazy load routes and heavy components

### 8.2 Security
- **Authentication:** Secure JWT implementation with refresh tokens
- **Authorization:** Role-based access control (RBAC)
- **Input validation:** Both client and server-side
- **SQL injection prevention:** Parameterized queries
- **XSS protection:** Sanitize user input
- **HTTPS:** Enforce secure connections

### 8.3 Data Integrity
- **Orphan prevention:** Cascade delete or prevent deletion with children
- **Soft deletes:** Mark as deleted rather than hard delete
- **Audit trail:** Track all important changes
- **Backup strategy:** Regular automated backups

### 8.4 Scalability
- **Database indexing:** On frequently queried fields
- **Load balancing:** For multiple server instances
- **CDN:** For static assets
- **Microservices consideration:** For future growth

## 9. Development Workflow

### 9.1 Setup
```bash
# Backend
cd backend
npm init -y
npm install express prisma @prisma/client jsonwebtoken bcrypt cors dotenv

# Frontend
npm create vite@latest frontend -- --template react
cd frontend
npm install react-router-dom @reduxjs/toolkit react-redux @mui/material @emotion/react @emotion/styled reactflow
```

### 9.2 Git Workflow
- **Main branch:** Production-ready code
- **Develop branch:** Integration branch
- **Feature branches:** feature/[feature-name]
- **Pull requests:** Required for merging to develop/main

### 9.3 Testing Strategy
- **Unit tests:** Individual functions and components
- **Integration tests:** API endpoints
- **E2E tests:** Critical user workflows (optional for MVP)
- **Coverage goal:** 70%+ for backend, 60%+ for frontend

## 10. Success Metrics

### 10.1 Technical Metrics
- Page load time: < 2 seconds
- API response time: < 500ms (p95)
- Time to interactive: < 3 seconds
- Test coverage: > 70%

### 10.2 User Metrics
- Task creation time: < 30 seconds
- Search response time: < 1 second
- Zero data loss
- 99% uptime

## 11. Future Enhancements
- **Collaboration:** Real-time collaboration (WebSockets)
- **Mobile app:** React Native implementation
- **Notifications:** Email and push notifications
- **Integrations:** Slack, Teams, Jira, etc.
- **AI assistance:** Smart prioritization suggestions ✅ Implemented (Phase 9 — Ollama LLM + structural scoring)
- **Templates:** Pre-built initiative templates
- **Gantt chart view:** Timeline visualization
- **Resource allocation:** Team capacity planning
- **Custom fields:** User-defined metadata

## 12. Documentation Requirements
- **README:** Setup and installation guide
- **API documentation:** Swagger/OpenAPI
- **Component library:** Storybook (optional)
- **User guide:** Feature documentation
- **Architecture diagram:** System overview

---

**Version:** 1.2  
**Last Updated:** March 2, 2026  
**Status:** Draft
