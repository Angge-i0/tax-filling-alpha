# Tax Filling Project

This is a comprehensive guide to setting up and running the Tax Filling application. The project consists of a Django backend (with GeoDjango/PostGIS) and a React frontend.

## 🚀 Quick Start (Windows)

### 1. Prerequisites
Ensure you have the following installed on your machine:
- **Docker Desktop**: For running the PostgreSQL/PostGIS database.
- **Python (3.11 or 3.12)**: For the backend server.
- **Node.js (LTS)**: For the frontend development.
- **QGIS or OSGeo4W**: Required for GeoDjango (GDAL/GEOS libraries). 
  *   *Note: The project is configured to automatically find these libraries if installed in standard locations like `C:\Program Files\QGIS` or `C:\OSGeo4W`.*

---

### 2. Database Setup (Docker)
1.  Open your terminal in the project root.
2.  Start the database and pgAdmin containers:
    ```bash
    docker compose up -d
    ```
3.  **Wait for the database to be healthy** (`docker compose ps` should show `healthy`).
4.  Enable the PostGIS extension (required for map features):
    ```bash
    docker exec -it taxfiling-postgis psql -U taxuser -d taxfiling -c "CREATE EXTENSION IF NOT EXISTS postgis;"
    ```

---

### 3. Backend Setup (Django)
1.  Navigate to the project root and create a virtual environment:
    ```bash
    python -m venv venv
    ```
2.  Activate the virtual environment:
    ```bash
    # Windows
    venv\Scripts\activate
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Run migrations:
    ```bash
    python manage.py migrate
    ```
5.  Start the backend server:
    ```bash
    python manage.py runserver
    ```
    *Backend running at: `http://127.0.0.1:8000`*

---

### 4. Frontend Setup (React)
1.  Open a new terminal window and navigate to the `frontend` folder:
    ```bash
    cd frontend
    ```
2.  Install packages:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
    *Frontend running at: `http://localhost:5173`*

---

### 5. Importing Map Data (.gpkg)
If you need to import GeoPackage files into the database:
1.  Ensure QGIS/OSGeo4W is in your system PATH.
2.  Run the provided PowerShell script to import all maps from `maps/static`:
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\scripts\import_gpkg_to_postgis.ps1
    ```

---

## 🛠 Features & Configuration

### Dashboard & Interactive Map
The Dashboard provides a premium visual analysis of property taxes:
- **Interactive Lot Map**: View over 24,000 lots individually color-coded by land use (Agri, Res, Comm, Ind).
- **Mixed-Use Calculation**: Lots with multiple classifications are automatically blended in the map visual.
- **Revenue Distribution**: Floating bar and pie charts provide real-time aggregation of tax values.
- **Lot Attributes**: Click any lot on the map to view a detailed popup with owners, ARP numbers, and exact areas.

### Database Access (pgAdmin)
- URL: `http://localhost:5050`
- Login Email: `admin@example.com`
- Login Password: `admin123`
- **To Connect to DB**: Register a new server with:
  - **Host**: `db` (if connecting from within Docker/pgAdmin) or `localhost` (if from host tools).
  - **Port**: `5432` (internal) or **`5433`** (external host port).
  - **User**: `taxuser`
  - **Password**: `pops1245`

---

## ❓ Troubleshooting

### "No space left on device" (Errno 28)
This indicates your `C:` drive or Docker volume is full. 
- **Fix**: Clear unused Docker images/containers (`docker system prune`) or free up host disk space.

### "Could not find ogr2ogr.exe" or GDAL Errors
These errors mean the project couldn't find your QGIS or OSGeo4W installation. 
- **Fix**: Ensure QGIS is installed. The project searches `C:\Program Files\QGIS*` and `C:\OSGeo4W*` automatically. If installed elsewhere, set the `OSGEO4W_ROOT` environment variable.

### Database Connection Failure
- Ensure Docker Desktop is running.
- If you see `psycopg.OperationalError: connection to server at "localhost" (127.0.0.1), port 5433 failed`, it means the `db` container is not healthy or is still starting. check `docker compose logs db`.

---

## 📱 Project Structure
- `/taxfiling`: Django project settings and core.
- `/maps`: Backend app handling geographic data and API.
- `/frontend`: React + Vite application.
- `/scripts`: Database helper scripts and import tools.
