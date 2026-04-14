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
3.  Enable the PostGIS extension (required for map features):
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
4.  Run migrations (The project will automatically detect your GDAL/QGIS installation):
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

### Database Access (pgAdmin)
- URL: `http://localhost:5050`
- Login Email: `admin@example.com`
- Login Password: `admin123`
- **To Connect to DB**: Register a new server with Host: `db`, Port: `5432`, User: `taxuser`, Password: `pops1245`.

### Automatic Library Discovery
The project includes logic in `taxfiling/settings.py` and `scripts/import_gpkg_to_postgis.ps1` that automatically finds the required GIS libraries and tools (GDAL/GEOS/ogr2ogr) on Windows. It searches in:
- `C:\Program Files\QGIS*`
- `C:\OSGeo4W*`
- `D:\OSGeo4W*`

### Manual Override (If tools aren't found)
If you have QGIS installed in a very unusual location and the auto-discovery fails:
1.  **For Backend**: Set the `OSGEO4W_ROOT` environment variable to your QGIS/OSGeo4W installation folder.
2.  **For Import Script**: You can pass the path manually when running the script:
    ```powershell
    .\scripts\import_gpkg_to_postgis.ps1 -OgrBin "C:\Your\Path\To\QGIS\bin"
    ```

---

## ❓ Troubleshooting

### "Could not find ogr2ogr.exe" or "Could not find module 'gdalXXX.dll'"
These errors mean the project couldn't find your QGIS or OSGeo4W installation. 
- **Fix**: Ensure QGIS is installed. If it is, and you still see this error, you can either add the QGIS `bin` folder to your Windows system Environment Variables (PATH) or use the **Manual Override** mentioned above.

### Migration Errors
If `python manage.py migrate` fails, ensure:
1.  The Docker database is running (`docker compose ps`).
2.  The PostGIS extension was created (see Step 2).
3.  Your database credentials in `settings.py` (or `.env`) match your Docker setup.

---

## 📱 Project Structure
- `/taxfiling`: Django project settings and core.
- `/maps`: Backend app handling geographic data and API.
- `/frontend`: React + Vite application.
- `/scripts`: Database helper scripts and import tools.
