param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$ContainerName = "taxfiling-postgis",
    [string]$DbName = "taxfiling",
    [string]$DbUser = "taxuser",
    [string]$DbPassword = "pops1245",
    [int]$DbPort = 5433,
    [string]$OgrBin = "D:\osgeo4w\bin",
    [string]$ProjData = "D:\osgeo4w\share\proj",
    [string]$GdalData = "D:\osgeo4w\share\gdal"
)

$ErrorActionPreference = "Stop"

function Escape-SqlLiteral([string]$value) {
    if ($null -eq $value) { return "" }
    return $value.Replace("'", "''")
}

function Invoke-Psql([string]$sql) {
    docker exec -i $ContainerName psql -v ON_ERROR_STOP=1 -U $DbUser -d $DbName -c $sql | Out-Host
}

function Import-OneFile([string]$filePath) {
    $ogr = Join-Path $OgrBin "ogr2ogr.exe"
    if (-not (Test-Path $ogr)) {
        throw "ogr2ogr.exe not found at $ogr"
    }

    & $ogr `
        --config PROJ_DATA $ProjData `
        --config GDAL_DATA $GdalData `
        -f PostgreSQL `
        "PG:host=localhost port=$DbPort dbname=$DbName user=$DbUser password=$DbPassword" `
        $filePath `
        -nln "tmp_import" `
        -overwrite `
        -lco "GEOMETRY_NAME=geom" `
        -lco "FID=id" `
        -s_srs "EPSG:3123" `
        -t_srs "EPSG:4326" `
        -nlt "PROMOTE_TO_MULTI" `
        -makevalid `
        -skipfailures

    if ($LASTEXITCODE -ne 0) {
        throw "ogr2ogr failed for file: $filePath"
    }
}

Write-Host "Applying schema..."
$schemaPath = Join-Path $ProjectRoot "scripts\postgis_schema.sql"
Get-Content $schemaPath -Raw | docker exec -i $ContainerName psql -v ON_ERROR_STOP=1 -U $DbUser -d $DbName | Out-Host

Invoke-Psql "TRUNCATE cad_maps, pim_barangay_boundaries, pim_sections, pim_enlargements RESTART IDENTITY;"

$cadDir = Join-Path $ProjectRoot "maps\static\CAD"
$pimDir = Join-Path $ProjectRoot "maps\static\PIM"

Write-Host "Importing CAD files..."
Get-ChildItem $cadDir -Filter *.gpkg -File | ForEach-Object {
    $file = $_.FullName
    $source = $_.Name
    $barangay = $_.BaseName
    Import-OneFile $file

    $barangaySql = Escape-SqlLiteral $barangay
    $sourceSql = Escape-SqlLiteral $source
    Invoke-Psql @"
INSERT INTO cad_maps (barangay_name, source_file, properties, geom)
SELECT '$barangaySql', '$sourceSql', COALESCE(to_jsonb(t) - 'geom' - 'id' - 'fid', '{}'::jsonb), ST_Multi(t.geom)
FROM tmp_import t
WHERE t.geom IS NOT NULL;
"@
}

Write-Host "Importing PIM barangay boundary files..."
Get-ChildItem $pimDir -Filter *.gpkg -File | ForEach-Object {
    $file = $_.FullName
    $source = $_.Name
    $barangay = $_.BaseName
    Import-OneFile $file

    $barangaySql = Escape-SqlLiteral $barangay
    $sourceSql = Escape-SqlLiteral $source
    Invoke-Psql @"
INSERT INTO pim_barangay_boundaries (barangay_name, source_file, properties, geom)
SELECT '$barangaySql', '$sourceSql', COALESCE(to_jsonb(t) - 'geom' - 'id' - 'fid', '{}'::jsonb), ST_Multi(t.geom)
FROM tmp_import t
WHERE t.geom IS NOT NULL;
"@
}

Write-Host "Importing PIM section files..."
Get-ChildItem $pimDir -Recurse -Filter *.gpkg -File | Where-Object { $_.Directory.Name -ieq "sections" } | ForEach-Object {
    $file = $_.FullName
    $source = $_.Name
    $barangay = $_.Directory.Parent.Name
    $match = [regex]::Match($_.BaseName, "Section\s*(\d+)", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $match.Success) {
        Write-Warning "Skipping section file with no section number: $file"
        return
    }
    $sectionNumber = [int]$match.Groups[1].Value
    Import-OneFile $file

    $barangaySql = Escape-SqlLiteral $barangay
    $sourceSql = Escape-SqlLiteral $source
    Invoke-Psql @"
INSERT INTO pim_sections (barangay_name, section_number, source_file, properties, geom)
SELECT '$barangaySql', $sectionNumber, '$sourceSql', COALESCE(to_jsonb(t) - 'geom' - 'id' - 'fid', '{}'::jsonb), ST_Multi(t.geom)
FROM tmp_import t
WHERE t.geom IS NOT NULL;
"@
}

Write-Host "Importing PIM enlargement files..."
Get-ChildItem $pimDir -Recurse -Filter *.gpkg -File | Where-Object { $_.Directory.Name -ieq "enlargements" } | ForEach-Object {
    $file = $_.FullName
    $source = $_.Name
    $barangay = $_.Directory.Parent.Name
    $match = [regex]::Match($_.BaseName, "Section\s*(\d+)", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $match.Success) {
        Write-Warning "Skipping enlargement file with no section number: $file"
        return
    }
    $sectionNumber = [int]$match.Groups[1].Value
    Import-OneFile $file

    $barangaySql = Escape-SqlLiteral $barangay
    $sourceSql = Escape-SqlLiteral $source
    Invoke-Psql @"
INSERT INTO pim_enlargements (barangay_name, section_number, source_file, properties, geom)
SELECT '$barangaySql', $sectionNumber, '$sourceSql', COALESCE(to_jsonb(t) - 'geom' - 'id' - 'fid', '{}'::jsonb), ST_Multi(t.geom)
FROM tmp_import t
WHERE t.geom IS NOT NULL;
"@
}

Write-Host "Import complete. Summary:"
Invoke-Psql "SELECT 'cad_maps' AS table_name, COUNT(*) AS rows FROM cad_maps;"
Invoke-Psql "SELECT 'pim_barangay_boundaries' AS table_name, COUNT(*) AS rows FROM pim_barangay_boundaries;"
Invoke-Psql "SELECT 'pim_sections' AS table_name, COUNT(*) AS rows FROM pim_sections;"
Invoke-Psql "SELECT 'pim_enlargements' AS table_name, COUNT(*) AS rows FROM pim_enlargements;"
