# Quick Setup Guide

Follow these steps to get the Initiative Tracker running:

## 1. Install Dependencies

### Backend
```powershell
cd backend
npm install
```

### Frontend
```powershell
cd frontend
npm install
```

## 2. Set Up Database

Install PostgreSQL if you don't have it:
- Download from https://www.postgresql.org/download/windows/
- Or use Docker: `docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres`

Create the database:
```powershell
# Using psql
psql -U postgres
CREATE DATABASE initiative_tracker;
\q
```

## 3. Configure Backend

Create `.env` file in the backend folder:
```powershell
cd backend
Copy-Item .env.example .env
```

Edit `backend\.env`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/initiative_tracker?schema=public"
JWT_SECRET="your-super-secret-key-change-in-production"
JWT_EXPIRES_IN="7d"
PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS="http://localhost:5173"
```

## 4. Initialize Database

```powershell
cd backend
npx prisma migrate dev --name init
npx prisma generate
```

## 5. Start the Application

### Terminal 1 - Backend
```powershell
cd backend
npm run dev
```

Backend should start on: http://localhost:3001

### Terminal 2 - Frontend
```powershell
cd frontend
npm run dev
```

Frontend should start on: http://localhost:5173

## 6. First Time Use

1. Open browser to http://localhost:5173
2. Click "Register here"
3. Create your account
4. Start creating initiatives!

## Troubleshooting

### Database Connection Error
- Make sure PostgreSQL is running
- Check DATABASE_URL in `.env`
- Verify database exists: `psql -U postgres -l`

### Port Already in Use
- Backend: Change PORT in `.env`
- Frontend: Change port in `vite.config.js`

### Prisma Errors
```powershell
cd backend
npx prisma generate
npx prisma migrate reset  # Warning: This will delete all data!
```

### Clear and Restart
```powershell
# Backend
cd backend
Remove-Item -Recurse -Force node_modules
npm install
npx prisma generate

# Frontend
cd frontend
Remove-Item -Recurse -Force node_modules
npm install
```

## Running Prisma Studio (Database GUI)

```powershell
cd backend
npx prisma studio
```

Opens at http://localhost:5555

## Useful Commands

### Backend
- `npm run dev` - Start with hot reload
- `npm start` - Production start
- `npm run db:migrate` - Run migrations
- `npm run db:studio` - Open Prisma Studio

### Frontend
- `npm run dev` - Development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Default Test User

After registration, you can create a test user directly in the database:

```powershell
cd backend
npx prisma studio
```

Then navigate to Users table and add a user (password must be bcrypt hashed).

Or just use the Register page in the UI!

## Next Steps

After successful setup:
1. Explore the Dashboard
2. Create your first initiative
3. Try different status and priority levels
4. Create child tasks under initiatives
5. Check out the hierarchical structure

For more details, see the full README.md file.
