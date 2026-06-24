# EAU Attendance Management System

Full-stack attendance tracking system for Ethiopian Aviation University.

## Stack
- Backend: Django 6, Django REST Framework, PostgreSQL
- Frontend: React + Vite + TypeScript + Tailwind CSS

## Setup

### Backend
```bash
cd backend
cp .env.example .env
pip install -r requirements.txt
python manage.py migrate
python seed.py
python manage.py runserver
```

### Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Default Login
- Admin: admin / admin123
- Teachers: teacher1-5 / teacher123
