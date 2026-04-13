# Tax Filling Project

Windows-first setup guide for the San Pascual tax mapping system.

The app has:

- Django backend with GeoDjango
- React frontend with Vite
- PostgreSQL + PostGIS in Docker
- PIM and CAD GeoPackage import flow
- SVM values stored in the database
- dashboard totals built from PIM attributes, SVM rates, and saved lot adjustments

## Quick Start

If you only want the app running on a fresh machine, use this order:

1. Install the prerequisites.
2. Start Docker.
3. Install Python dependencies.
4. Run Django migrations.
5. Restore a current database backup or import raw map data.
6. Import SVM into the `SmvRate` table only if your database does not already have it.
7. Rebuild the dashboard cache if needed.
8. Start backend and frontend.

If your database does not have PIM data and `SmvRate` data, the app can open, but the PIM computations and dashboard totals will not match the latest SVM-driven logic.

## Prerequisites

Install these first:

1. Docker Desktop
2. Python 3.11 or 3.12
3. Node.js LTS
4. OSGeo4W with `gdal`

This project uses OSGeo4W for:

- GeoDjango GDAL/GEOS DLLs on Windows
- `ogr2ogr` GeoPackage import

Recommended OSGeo4W install folders:

- `C:\OSGeo4W`
- `D:\osgeo4w`

Make sure these exist after install:

```text
C:\OSGeo4W\bin\ogr2ogr.exe
C:\OSGeo4W\bin\geos_c.dll
C:\OSGeo4W\share\proj
C:\OSGeo4W\share\gdal
```

The project auto-detects OSGeo4W from:

- `OSGEO4W_ROOT`
- `OSGEO4W_BIN`
- `OSGEO4W_PROJ`
- `OSGEO4W_GDAL`
- `PATH`
- common install folders like `C:\OSGeo4W`, `C:\OSGeo4W64`, and `D:\osgeo4w`

If auto-detection fails, set this once in the terminal before running Django or import scripts:

```bat
set OSGEO4W_ROOT=C:\OSGeo4W
```

## 1. Open The Project

```bat
cd C:\taax\tax-filling-alpha
```

## 2. Start PostGIS And pgAdmin

```bat
docker compose up -d
docker compose ps
```

Default ports:

- PostGIS: `localhost:5433`
- pgAdmin: `http://localhost:5050`

Default database credentials from [docker-compose.yml](/abs/path/c:/taax/tax-filling-alpha/docker-compose.yml:1):

- DB name: `taxfiling`
- DB user: `taxuser`
- DB password: `pops1245`

Enable the extension once:

```bat
docker exec -it taxfiling-postgis psql -U taxuser -d taxfiling -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

## 3. Set Up The Backend

From the project root:

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
```

Start the backend:

```bat
python manage.py runserver
```

Backend URL:

- `http://127.0.0.1:8000`

Notes:

- The backend reads database settings from `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`.
- Local defaults already point to the Docker database on `localhost:5433`.
- On Windows, Django will fail fast if OSGeo4W cannot be found.

## 4. Set Up The Frontend

Open a second terminal:

```bat
cd C:\taax\tax-filling-alpha\frontend
npm install
npm run dev
```

Frontend URL:

- `http://localhost:5173`

## 5. Choose A Data Setup Path

You have two practical options.

### Option A: Restore A Database Dump

Use this if you want the fastest setup.

```bat
docker exec -i taxfiling-postgis psql -U taxuser -d taxfiling < taxfiling.sql
python manage.py migrate
```

Important:

- `taxfiling.sql` is an older full PostgreSQL dump.
- It does not include the newer SVM database table and dashboard cache flow.
- For the latest computation flow, use a current team backup if you have one.
- If you only have `taxfiling.sql`, you will still need SVM data and a dashboard cache rebuild.

### Option B: Rebuild From Raw GeoPackages

Use this only if you are rebuilding the database from raw source files.

Important:

- The running app no longer reads map data from `maps/static`.
- `maps/static` is only a staging location used by the legacy import script and the SVM import command.
- If your team now stores raw GeoPackages elsewhere, this option is not your normal setup path.

Run from the project root:

```bat
powershell -ExecutionPolicy Bypass -File .\scripts\import_gpkg_to_postgis.ps1
```

If OSGeo4W is in a custom folder:

```bat
powershell -ExecutionPolicy Bypass -File .\scripts\import_gpkg_to_postgis.ps1 -OSGeo4WRoot "C:\OSGeo4W"
```

This imports:

- `maps/static/CAD/*.gpkg` into `cad_maps`
- `maps/static/PIM/*.gpkg` into `pim_barangay_boundaries`
- `maps/static/PIM/*/sections/*.gpkg` into `pim_sections`
- `maps/static/PIM/*/enlargements/*.gpkg` into `pim_enlargements`

## 6. Import SVM To The Database

Run this only when:

- your restored database does not have `maps_smvrate` data, or
- you are rebuilding from raw SMV GeoPackages

Newer computation logic reads SVM from the `SmvRate` table, not directly from GeoPackages at request time.

After your map data is ready, run:

```bat
python manage.py migrate_smv_to_db
```

This command reads the SMV GeoPackages inside:

```text
maps/static/SMV/Residential
maps/static/SMV/Agricultural
maps/static/SMV/Commercial
maps/static/SMV/Industrial
```

and stores their values in `maps_smvrate`.

If your team no longer keeps raw SMV files under `maps/static/SMV`, treat that folder path as a legacy importer path, not as a runtime requirement.

## 7. Rebuild The Dashboard Cache

The dashboard totals are now cached in the database and built from:

- normalized PIM lot attributes
- `SmvRate`
- `LotAdjustment`

Build or refresh the cache with:

```bat
python manage.py build_rpt_report_cache
```

This writes the dashboard payload into `RptReportCache`.

When to rerun it:

- after restoring `taxfiling.sql`
- after reimporting PIM or SMV data
- after bulk lot adjustment changes
- when dashboard totals look stale

The app also tries to build the cache automatically on `runserver` startup if the cache is empty, but manual rebuild is the safest option after data changes.

## 8. First Login / URLs

App URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://127.0.0.1:8000`
- pgAdmin: `http://localhost:5050`

pgAdmin default login:

- Email: `admin@example.com`
- Password: `admin123`

To register the Docker database inside pgAdmin:

1. Right-click `Servers`
2. Select `Register` then `Server...`
3. Set any server name you want
4. Under `Connection`, use:

```text
Host: db
Port: 5432
Database: taxfiling
Username: taxuser
Password: pops1245
```

## Current Data Behavior

The important current rules are:

- PIM lot computations use normalized PIM attributes plus SVM values from `SmvRate`
- saved dirt-road access adjustments are stored in `LotAdjustment`
- dashboard totals are generated from the same backend logic and stored in `RptReportCache`
- `Poblacion 1`, `Poblacion 2`, `Poblacion 3`, and `Poblacion 4` are treated as separate barangays in PIM drilldown

If you click the combined municipality-level `Poblacion` polygon, use the PIM barangay list to open the specific numbered Poblacion instead.

## Daily Dev Commands

Backend:

```bat
.venv\Scripts\activate
python manage.py runserver
```

Frontend:

```bat
cd frontend
npm run dev
```

Rebuild dashboard cache:

```bat
python manage.py build_rpt_report_cache
```

Reimport SVM:

```bat
python manage.py migrate_smv_to_db
```

## Common Problems

### `Could not locate OSGeo4W automatically`

Set the install root before running Django:

```bat
set OSGEO4W_ROOT=C:\OSGeo4W
```

### `'ogr2ogr' is not recognized`

Make sure OSGeo4W is installed with `gdal`, or add its `bin` folder to `PATH`.

### `proj.db ... from another PROJ installation`

Use the OSGeo4W environment for the current terminal:

```bat
set PATH=C:\OSGeo4W\bin;%PATH%
set PROJ_LIB=C:\OSGeo4W\share\proj
set PROJ_DATA=C:\OSGeo4W\share\proj
set GDAL_DATA=C:\OSGeo4W\share\gdal
```

### pgAdmin does not open

Check the containers:

```bat
docker compose ps
docker logs taxfiling-pgadmin
```

### Dashboard totals are not updating

Rebuild the cache:

```bat
python manage.py build_rpt_report_cache
```

Also make sure `python manage.py migrate_smv_to_db` has already been run, because the new dashboard logic depends on `SmvRate`.

## Useful Checks

Show row counts:

```bat
docker exec -it taxfiling-postgis psql -U taxuser -d taxfiling -c "SELECT COUNT(*) FROM cad_maps;"
docker exec -it taxfiling-postgis psql -U taxuser -d taxfiling -c "SELECT COUNT(*) FROM pim_barangay_boundaries;"
docker exec -it taxfiling-postgis psql -U taxuser -d taxfiling -c "SELECT COUNT(*) FROM pim_sections;"
docker exec -it taxfiling-postgis psql -U taxuser -d taxfiling -c "SELECT COUNT(*) FROM pim_enlargements;"
docker exec -it taxfiling-postgis psql -U taxuser -d taxfiling -c "SELECT COUNT(*) FROM maps_smvrate;"
```

List Django users:

```bat
docker exec -it taxfiling-postgis psql -U taxuser -d taxfiling -c "SELECT id, username, email, is_staff, is_superuser FROM auth_user ORDER BY id;"
```
