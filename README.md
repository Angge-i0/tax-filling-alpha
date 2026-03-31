# Tax Filling Project

This is a step-by-step setup guide for Windows using Docker (recommended).

## What you are setting up

- Django backend (Python)
- React frontend (Vite)
- PostgreSQL + PostGIS in Docker
- pgAdmin in Docker (database GUI)

## 1. Install required software

Install these first:

1. Docker Desktop
2. Python (3.11 or 3.12 recommended)
3. Node.js (LTS)
4. OSGeo4W (for `ogr2ogr`, optional until you import `.gpkg`)

## 2. Open the project folder

```bat
cd D:\geodetic_thesis\tax-filling-alpha
```

## 3. Start database containers (PostGIS + pgAdmin)

```bat
docker compose up -d
docker compose ps
```

You should see:
- `taxfiling-postgis` running on `5433`
- `taxfiling-pgadmin` running on `5050`

## 4. Enable PostGIS extension in the database

```bat
docker exec -it taxfiling-postgis psql -U taxuser -d taxfiling -c "CREATE EXTENSION IF NOT EXISTS postgis;"
docker exec -it taxfiling-postgis psql -U taxuser -d taxfiling -c "SELECT PostGIS_Full_Version();"
```

## 5. Set up Python backend

```bat
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Backend URL: `http://127.0.0.1:8000`

## 6. Set up frontend

Open a second terminal:

```bat
cd D:\geodetic_thesis\tax-filling-alpha\frontend
npm install
npm run dev
```

Frontend URL: usually `http://localhost:5173`

## 7. Use pgAdmin (GUI for database)

Open:
- `http://localhost:5050`

Login:
- Email: `admin@example.com`
- Password: `admin123`

Add server:

1. Right-click `Servers` -> `Register` -> `Server...`
2. In `General` tab, set Name: `taxfiling-db`
3. In `Connection` tab use:
   - Host name/address: `db`
   - Port: `5432`
   - Maintenance DB: `taxfiling`
   - Username: `taxuser`
   - Password: `pops1245`
4. Click `Save`

## 8. Import a `.gpkg` file into PostGIS

If `ogr2ogr` is not recognized, run this first in the same terminal:

```bat
set PATH=D:\osgeo4w\bin;%PATH%
set PROJ_LIB=D:\osgeo4w\share\proj
set PROJ_DATA=D:\osgeo4w\share\proj
set GDAL_DATA=D:\osgeo4w\share\gdal
ogr2ogr --version
```

Then import sample file:

```bat
ogr2ogr --config PROJ_DATA "D:\osgeo4w\share\proj" --config GDAL_DATA "D:\osgeo4w\share\gdal" -f PostgreSQL PG:"host=localhost port=5433 dbname=taxfiling user=taxuser password=pops1245" "D:\geodetic_thesis\tax-filling-alpha\maps\static\CAD\Alalum.gpkg" -nln cad_alalum -lco GEOMETRY_NAME=geom -lco FID=id -s_srs EPSG:3123 -t_srs EPSG:4326 -nlt PROMOTE_TO_MULTI -makevalid -skipfailures
```

Verify import:

```bat
docker exec -it taxfiling-postgis psql -U taxuser -d taxfiling -c "SELECT COUNT(*) FROM cad_alalum;"
```

## 9. Recommended: import all maps with folder-aware structure

This repo includes:
- `scripts/postgis_schema.sql` (creates normalized map tables)
- `scripts/import_gpkg_to_postgis.ps1` (imports all `maps/static` GeoPackages)

Run from project rooat:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import_gpkg_to_postgis.ps1
```

It imports into:
- `cad_maps` from `maps/static/CAD/*.gpkg`
- `pim_barangay_boundaries` from `maps/static/PIM/*.gpkg`
- `pim_sections` from `maps/static/PIM/*/sections/*.gpkg`
- `pim_enlargements` from `maps/static/PIM/*/enlargements/*.gpkg`

This keeps DB data aligned with your folder structure.

## 10. Current Django DB behavior

`taxfiling/settings.py` is already configured to auto-switch:

- Uses Docker DB at `localhost:5433` if reachable
- Falls back to local PostgreSQL at `localhost:5432`

You can also override with env vars:
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

## 11. Change Docker Postgres username/password

Use one of these two methods:

### A) Fresh start (easiest, deletes old DB data)

1. Edit `docker-compose.yml` under `db.environment`:
   - `POSTGRES_USER`
   - `POSTGRES_PASSWORD`
   - `POSTGRES_DB` (optional)
2. Stop and remove containers + volume:

```bat
docker compose down -v
```

3. Start again:

```bat
docker compose up -d
```

4. Update app config to match:
   - `taxfiling/settings.py` env vars (`DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`)
   - pgAdmin saved server credentials
   - import scripts / `ogr2ogr` connection string

### B) Keep existing DB data (recommended if DB already has important data)

1. Keep container running with current credentials.
2. Change password inside PostgreSQL:

```bat
docker exec -it taxfiling-postgis psql -U taxuser -d taxfiling -c "ALTER USER taxuser WITH PASSWORD 'new_password_here';"
```

3. Update app config and tools with new password:
   - `DB_PASSWORD` in environment
   - pgAdmin saved server password
   - `ogr2ogr` / import script password

4. Restart backend after password change.

Tip: changing `POSTGRES_USER` in `docker-compose.yml` does not rename an existing DB role inside old persisted volumes. For existing volumes, create/alter roles with SQL.

## 12. Useful checks

List database roles/users:

```sql
\du
```

See users registered from the website:

```sql
\c taxfiling
SELECT id, username, email, is_staff, is_superuser, date_joined
FROM auth_user
ORDER BY id DESC;
```

Check map row counts:

```sql
SELECT COUNT(*) FROM cad_maps;
SELECT COUNT(*) FROM pim_barangay_boundaries;
SELECT COUNT(*) FROM pim_sections;
SELECT COUNT(*) FROM pim_enlargements;
```

## 13. Sync DB to another device

### Backup and restore (simplest)

On laptop A:

```bat
docker exec -t taxfiling-postgis pg_dump -U taxuser -d taxfiling > taxfiling.sql
```

Copy `taxfiling.sql` to laptop B.

On laptop B:

```bat
docker exec -i taxfiling-postgis psql -U taxuser -d taxfiling < taxfiling.sql
```

This is the easiest sync method.

### Share SQL dump via cloud

Save `taxfiling.sql` in Google Drive / OneDrive / Git LFS / private storage.
Import on the other device whenever needed.

### Expose one device as central DB (advanced)

One machine hosts PostgreSQL and other devices connect over network.
This needs static IP, firewall rules, strong passwords, and SSL/VPN.
Good for real-time shared DB, but more setup and security work.

## 14. Common problems

### `http://localhost:5050` not opening

Run:

```bat
docker compose ps
docker logs taxfiling-pgadmin
```

If `pgadmin` is restarting, check email/password config in `docker-compose.yml`.

### `'ogr2ogr' is not recognized`

Add `D:\osgeo4w\bin` to PATH in that terminal (see step 8).

### `proj.db ... from another PROJ installation`

Set `PROJ_LIB`, `PROJ_DATA`, and `GDAL_DATA` to `D:\osgeo4w\share\...` (step 8).

### `Could not find the GDAL library`

Check these exist:
- `D:\osgeo4w\bin\gdal312.dll`
- `D:\osgeo4w\bin\geos_c.dll`

Check paths in `taxfiling/settings.py`.
