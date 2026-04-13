param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$ContainerName = "taxfiling-postgis",
    [string]$DbName = "taxfiling",
    [string]$DbUser = "taxuser",
    [string]$DbPassword = "pops1245",
    [int]$DbPort = 5433,
    [string]$OSGeo4WRoot = $env:OSGEO4W_ROOT,
    [string]$OgrBin = $env:OSGEO4W_BIN,
    [string]$ProjData = $env:OSGEO4W_PROJ,
    [string]$GdalData = $env:OSGEO4W_GDAL
)

$ErrorActionPreference = "Stop"

function Resolve-ExistingPath([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $null
    }

    if (-not (Test-Path -LiteralPath $value)) {
        return $null
    }

    return (Resolve-Path -LiteralPath $value).Path
}

function Get-Osgeo4WCandidateRoots {
    $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $results = [System.Collections.Generic.List[string]]::new()

    function Add-Candidate([string]$value) {
        if ([string]::IsNullOrWhiteSpace($value)) {
            return
        }

        $resolved = Resolve-ExistingPath $value
        if ($resolved -and $seen.Add($resolved)) {
            $results.Add($resolved)
        }
    }

    Add-Candidate $OSGeo4WRoot

    $resolvedOgrBin = Resolve-ExistingPath $OgrBin
    if ($resolvedOgrBin) {
        Add-Candidate (Split-Path -Parent $resolvedOgrBin)
    }

    foreach ($envName in @("OSGEO4W_PROJ", "PROJ_LIB", "PROJ_DATA")) {
        $resolvedProj = Resolve-ExistingPath ([Environment]::GetEnvironmentVariable($envName))
        if ($resolvedProj) {
            Add-Candidate (Split-Path -Parent (Split-Path -Parent $resolvedProj))
            break
        }
    }

    $gdalDataEnv = if ($env:OSGEO4W_GDAL) { $env:OSGEO4W_GDAL } else { $env:GDAL_DATA }
    $resolvedGdalData = Resolve-ExistingPath $gdalDataEnv
    if ($resolvedGdalData) {
        Add-Candidate (Split-Path -Parent (Split-Path -Parent $resolvedGdalData))
    }

    $ogrCommand = Get-Command ogr2ogr -ErrorAction SilentlyContinue
    if ($ogrCommand -and $ogrCommand.Source) {
        Add-Candidate (Split-Path -Parent (Split-Path -Parent $ogrCommand.Source))
    }

    $folderNames = @("OSGeo4W", "OSGeo4W64", "osgeo4w", "osgeo4w64")
    Get-PSDrive -PSProvider FileSystem | ForEach-Object {
        foreach ($folderName in $folderNames) {
            Add-Candidate (Join-Path $_.Root $folderName)
        }
    }

    return $results
}

function Resolve-Osgeo4WConfig {
    $resolvedOgrBin = Resolve-ExistingPath $OgrBin
    $projDataValue = if ($ProjData) { $ProjData } elseif ($env:PROJ_DATA) { $env:PROJ_DATA } else { $env:PROJ_LIB }
    $gdalDataValue = if ($GdalData) { $GdalData } else { $env:GDAL_DATA }
    $resolvedProjData = Resolve-ExistingPath $projDataValue
    $resolvedGdalData = Resolve-ExistingPath $gdalDataValue

    foreach ($root in Get-Osgeo4WCandidateRoots) {
        $candidateOgrBin = $resolvedOgrBin
        if (-not $candidateOgrBin) {
            $candidateOgrBin = Resolve-ExistingPath (Join-Path $root "bin")
        }

        $candidateProjData = $resolvedProjData
        if (-not $candidateProjData) {
            $candidateProjData = Resolve-ExistingPath (Join-Path $root "share\proj")
        }

        $candidateGdalData = $resolvedGdalData
        if (-not $candidateGdalData) {
            $candidateGdalData = Resolve-ExistingPath (Join-Path $root "share\gdal")
        }

        $ogrExe = if ($candidateOgrBin) { Join-Path $candidateOgrBin "ogr2ogr.exe" } else { $null }
        if ($candidateOgrBin -and $candidateProjData -and $candidateGdalData -and $ogrExe -and (Test-Path -LiteralPath $ogrExe)) {
            return @{
                Root = $root
                OgrBin = $candidateOgrBin
                ProjData = $candidateProjData
                GdalData = $candidateGdalData
            }
        }
    }

    throw "Could not locate OSGeo4W automatically. Set OSGEO4W_ROOT, pass -OSGeo4WRoot, or add ogr2ogr.exe to PATH."
}

function Escape-SqlLiteral([string]$value) {
    if ($null -eq $value) { return "" }
    return $value.Replace("'", "''")
}

function Get-NormalizedBarangayName([System.IO.FileInfo]$fileInfo) {
    $filename = $fileInfo.BaseName
    $fromFile = [regex]::Match($filename, "^(.*?)\s+[Ss]ection")
    if ($fromFile.Success) {
        return $fromFile.Groups[1].Value.Trim()
    }

    $dir = $fileInfo.Directory
    if ($dir.Name -ieq "sections" -or $dir.Name -ieq "enlargements") {
        $raw = $dir.Parent.Name
    } else {
        $raw = $dir.Name
    }

    # Remove trailing notes like "(9 Sections)" or "[...]" from folder names.
    $clean = ($raw -replace "\s*[\(\[].*$", "").Trim()
    return $clean
}

function Get-SectionNumber([string]$name) {
    $match = [regex]::Match($name, "(?:section|seec|sec)\s*(\d+)", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($match.Success) {
        return [int]$match.Groups[1].Value
    }
    return $null
}

function Invoke-Psql([string]$sql) {
    docker exec -i $ContainerName psql -v ON_ERROR_STOP=1 -U $DbUser -d $DbName -c $sql | Out-Host
}

function Import-OneFile([string]$filePath) {
    $ogr = Join-Path $OgrBin "ogr2ogr.exe"
    if (-not (Test-Path $ogr)) {
        throw "ogr2ogr.exe not found at $ogr"
    }

    # 1) Try with source CRS auto-detected by GDAL.
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
        -t_srs "EPSG:4326" `
        -nlt "PROMOTE_TO_MULTI" `
        -makevalid `
        -skipfailures

    if ($LASTEXITCODE -eq 0) {
        return
    }

    Write-Warning "Auto CRS import failed. Retrying with source EPSG:3123 for file: $filePath"

    # 2) Fallback for files with missing/incorrect source SRS metadata.
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

$osgeo = Resolve-Osgeo4WConfig
$OgrBin = $osgeo.OgrBin
$ProjData = $osgeo.ProjData
$GdalData = $osgeo.GdalData

$pathEntries = @($env:PATH -split ';' | Where-Object { $_ })
if ($pathEntries -notcontains $OgrBin) {
    $env:PATH = "$OgrBin;$env:PATH"
}
$env:PROJ_LIB = $ProjData
$env:PROJ_DATA = $ProjData
$env:GDAL_DATA = $GdalData

Write-Host "Using OSGeo4W root: $($osgeo.Root)"

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
    $barangay = Get-NormalizedBarangayName $_
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

Write-Host "Importing PIM files (supports old and new folder layouts)..."
Get-ChildItem $pimDir -Recurse -Filter *.gpkg -File | ForEach-Object {
    $file = $_.FullName
    $source = $_.Name
    $barangay = Get-NormalizedBarangayName $_
    $baseLower = $_.BaseName.ToLowerInvariant()
    $sectionNumber = Get-SectionNumber $_.BaseName

    Import-OneFile $file

    if ($baseLower -match "enlargement") {
        if ($null -eq $sectionNumber) {
            Write-Warning "Skipping enlargement file with no section number: $file"
            return
        }
        $barangaySql = Escape-SqlLiteral $barangay
        $sourceSql = Escape-SqlLiteral $source
        Invoke-Psql @"
INSERT INTO pim_enlargements (barangay_name, section_number, source_file, properties, geom)
SELECT '$barangaySql', $sectionNumber, '$sourceSql', COALESCE(to_jsonb(t) - 'geom' - 'id' - 'fid', '{}'::jsonb), ST_Multi(t.geom)
FROM tmp_import t
WHERE t.geom IS NOT NULL;
"@
    } elseif ($null -ne $sectionNumber) {
        $barangaySql = Escape-SqlLiteral $barangay
        $sourceSql = Escape-SqlLiteral $source
        Invoke-Psql @"
INSERT INTO pim_sections (barangay_name, section_number, source_file, properties, geom)
SELECT '$barangaySql', $sectionNumber, '$sourceSql', COALESCE(to_jsonb(t) - 'geom' - 'id' - 'fid', '{}'::jsonb), ST_Multi(t.geom)
FROM tmp_import t
WHERE t.geom IS NOT NULL;
"@
    } else {
        $barangaySql = Escape-SqlLiteral $barangay
        $sourceSql = Escape-SqlLiteral $source
        Invoke-Psql @"
INSERT INTO pim_barangay_boundaries (barangay_name, source_file, properties, geom)
SELECT '$barangaySql', '$sourceSql', COALESCE(to_jsonb(t) - 'geom' - 'id' - 'fid', '{}'::jsonb), ST_Multi(t.geom)
FROM tmp_import t
WHERE t.geom IS NOT NULL;
"@
    }
}

Write-Host "Import complete. Summary:"
Invoke-Psql "SELECT 'cad_maps' AS table_name, COUNT(*) AS rows FROM cad_maps;"
Invoke-Psql "SELECT 'pim_barangay_boundaries' AS table_name, COUNT(*) AS rows FROM pim_barangay_boundaries;"
Invoke-Psql "SELECT 'pim_sections' AS table_name, COUNT(*) AS rows FROM pim_sections;"
Invoke-Psql "SELECT 'pim_enlargements' AS table_name, COUNT(*) AS rows FROM pim_enlargements;"
