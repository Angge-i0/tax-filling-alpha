import os
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class OSGEO4WConfig:
    root: Path
    bin_dir: Path
    geos_library: Path
    gdal_library: Path
    proj_data: Path
    gdal_data: Path


def _existing_path(value: str | None) -> Path | None:
    if not value:
        return None
    candidate = Path(value).expanduser()
    if not candidate.exists():
        return None
    return candidate.resolve()


def _iter_path_dirs() -> list[Path]:
    seen: set[Path] = set()
    results: list[Path] = []
    for entry in os.environ.get("PATH", "").split(os.pathsep):
        path = _existing_path(entry)
        if path and path not in seen:
            seen.add(path)
            results.append(path)
    return results


def _common_roots() -> list[Path]:
    drive_letters = []
    system_drive = os.environ.get("SystemDrive")
    if system_drive:
        drive_letters.append(system_drive.rstrip("\\/"))
    drive_letters.extend(f"{letter}:" for letter in "CDEFGHIJKLMNOPQRSTUVWXYZ")

    seen: set[Path] = set()
    results: list[Path] = []
    folder_names = ("OSGeo4W", "OSGeo4W64", "osgeo4w", "osgeo4w64")

    for drive in drive_letters:
        drive_root = Path(f"{drive}\\")
        for folder_name in folder_names:
            candidate = drive_root / folder_name
            if candidate not in seen:
                seen.add(candidate)
                results.append(candidate)

    return results


def _candidate_roots() -> list[Path]:
    seen: set[Path] = set()
    results: list[Path] = []

    def add(path: Path | None) -> None:
        if path and path not in seen:
            seen.add(path)
            results.append(path)

    add(_existing_path(os.getenv("OSGEO4W_ROOT")))

    env_bin = _existing_path(os.getenv("OSGEO4W_BIN"))
    if env_bin:
        add(env_bin.parent)

    env_geos = _existing_path(os.getenv("GEOS_LIBRARY_PATH"))
    if env_geos:
        add(env_geos.parent.parent)

    env_gdal = _existing_path(os.getenv("GDAL_LIBRARY_PATH"))
    if env_gdal:
        add(env_gdal.parent.parent)

    env_proj = _existing_path(
        os.getenv("OSGEO4W_PROJ") or os.getenv("PROJ_LIB") or os.getenv("PROJ_DATA")
    )
    if env_proj:
        add(env_proj.parent.parent)

    env_gdal_data = _existing_path(os.getenv("OSGEO4W_GDAL") or os.getenv("GDAL_DATA"))
    if env_gdal_data:
        add(env_gdal_data.parent.parent)

    for path_dir in _iter_path_dirs():
        if (path_dir / "ogr2ogr.exe").exists():
            add(path_dir.parent)

    for root in _common_roots():
        add(root)

    return results


def _pick_gdal_dll(bin_dir: Path) -> Path | None:
    candidates = [path for path in bin_dir.glob("gdal*.dll") if path.is_file()]
    if not candidates:
        return None

    def sort_key(path: Path) -> tuple[int, int, str]:
        match = re.fullmatch(r"gdal(\d+)\.dll", path.name.lower())
        if not match:
            return (0, 0, path.name.lower())
        version = int(match.group(1))
        return (1, version, path.name.lower())

    return max(candidates, key=sort_key)


def _config_from_root(root: Path) -> OSGEO4WConfig | None:
    bin_dir = _existing_path(os.getenv("OSGEO4W_BIN")) or (root / "bin")
    geos_library = _existing_path(os.getenv("GEOS_LIBRARY_PATH")) or (bin_dir / "geos_c.dll")
    gdal_library = _existing_path(os.getenv("GDAL_LIBRARY_PATH")) or _pick_gdal_dll(bin_dir)
    proj_data = (
        _existing_path(
            os.getenv("OSGEO4W_PROJ") or os.getenv("PROJ_LIB") or os.getenv("PROJ_DATA")
        )
        or _existing_path(str(root / "share" / "proj"))
        or (root / "proj_data_fallback_not_found")
    )
    
    gdal_data = (
        _existing_path(os.getenv("OSGEO4W_GDAL") or os.getenv("GDAL_DATA"))
        or _existing_path(str(root / "share" / "gdal"))
        or _existing_path(str(root / "apps" / "gdal" / "share" / "gdal"))
        or (root / "gdal_data_fallback_not_found")
    )

    required_paths = (
        root,
        bin_dir,
        geos_library,
        gdal_library,
        proj_data,
        gdal_data,
        bin_dir / "ogr2ogr.exe",
    )
    if not all(path and path.exists() for path in required_paths):
        return None

    return OSGEO4WConfig(
        root=root.resolve(),
        bin_dir=bin_dir.resolve(),
        geos_library=geos_library.resolve(),
        gdal_library=gdal_library.resolve(),
        proj_data=proj_data.resolve(),
        gdal_data=gdal_data.resolve(),
    )


def discover_osgeo4w() -> OSGEO4WConfig | None:
    for root in _candidate_roots():
        if not root.exists():
            continue
        config = _config_from_root(root)
        if config:
            return config
    return None
