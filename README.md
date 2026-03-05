# Tax Filling Project

A full-stack application for tax filling, featuring a Django backend and a React (Vite) frontend.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

### 1. Node.js
- **Purpose**: Required to run the frontend development server and manage npm packages.
- **Download**: [Download Node.js](https://nodejs.org/) (Recommended: LTS version).
- **Verify**: Run `node -v` in your terminal.

### 2. Python
- **Purpose**: Required for the Django backend.
- **Download**: [Download Python](https://www.python.org/) (Version 3.8 or higher recommended).
- **Verify**: Run `python --version` in your terminal.

---

## Project Setup

### 1. Backend Setup (Django)

1. **Open a terminal** at the project root (`d:\tax filling proj`).
2. **Create a virtual environment**:
   ```powershell
   python -m venv venv
   ```
3. **Activate the virtual environment**:
   - **Windows**: `.\venv\Scripts\activate`
   - **macOS/Linux**: `source venv/bin/activate`
4. **Install dependencies**:
   ```powershell
   pip install -r requirements.txt
   ```

5. **Install geopandas**:
   ```powershell
   pip install 'geopandas[all]'
   ```

6. **Run Migrations**:
   ```powershell
   python manage.py migrate
   ```

### 2. Frontend Setup (React + Vite)

1. **Navigate to the frontend directory**:
   ```powershell
   cd frontend
   ```
2. **Install dependencies**:
   ```powershell
   npm install
   ```

---

## Running the Application

You will need two terminal windows open simultaneously:

### Terminal 1: Backend
From the project root (with `venv` activated):
```powershell
python manage.py runserver
```
The backend will be available at `http://127.0.0.1:8000/`.

### Terminal 2: Frontend
From the `frontend` directory:
```powershell
npm run dev
```
The frontend will be available at the URL provided in the terminal (usually `http://localhost:5173/`).

---

## Project Structure

- `taxfiling/`: Django project configuration.
- `maps/`: Django app for map-related functionality.
- `frontend/`: React frontend application (Vite).
- `manage.py`: Django management script.
- `requirements.txt`: Python package dependencies.
- `db.sqlite3`: Local SQLite database.
