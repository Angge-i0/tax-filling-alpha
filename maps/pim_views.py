"""
PIM API Views — Reads section GPKG files directly from the folder structure.

Folder structure:
    maps/static/PIM/<BarangayName>/
        sections/           — Section GPKG files
        enlargements/       — Enlargement GPKG files

Column normalisation handles the many variations across files.
"""
import json
import os
import re
import math
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
import geopandas as gpd

# Import the shared JWT decorator
from .views import api_login_required

PIM_DIR = os.path.join(settings.BASE_DIR, 'maps', 'static', 'PIM')

# ── Column name normalisation ─────────────────────────────────────────────────
# The GPKG files have many spelling/formatting variations.  We normalise them
# to a canonical set so the frontend always sees the same field names.

COLUMN_MAP = {
    # PIN
    'pin': 'pin',
    # Owner
    'name of owner': 'owner',
    'property owner': 'owner',
    # Address
    'address of owner': 'address',
    'address': 'address',
    'addres of owner': 'address',
    # ARP
    'arp number': 'arp_no',
    'arp no.': 'arp_no',
    'arp no': 'arp_no',
    # Previous ARP
    'previous arp number': 'prev_arp_no',
    'previous arp numberr': 'prev_arp_no',
    'previous arp no.': 'prev_arp_no',
    'previous arp no': 'prev_arp_no',
    'previos arp no.': 'prev_arp_no',
    'prevous arp no.': 'prev_arp_no',
    # Area Residential
    'area (res)': 'area_res',
    'area res': 'area_res',
    # Area Agricultural
    'area (agri)': 'area_agri',
    'area agri': 'area_agri',
    # Area Industrial
    "area (ind'l)": 'area_indl',
    'area ind': 'area_indl',
    "area ind'l": 'area_indl',
    'area indus': 'area_indl',
    'area industri': 'area_indl',
    "agrea (ind'l)": 'area_indl',
    # Area Commercial
    "area (comm'l)": 'area_comml',
    'area comml': 'area_comml',
    "area comm'l": 'area_comml',
    # Area RRW (Road Right-of-Way)
    'area (rrw)': 'area_rrw',
    'area rrw': 'area_rrw',
    # Area Exempt
    'area (exempt)': 'area_exempt',
    'area exempt': 'area_exempt',
}

# Columns that are sometimes extra/stray (like '1') — to be dropped
IGNORE_COLUMNS = {'1', 'geometry'}


def _normalise_columns(gdf):
    """Rename columns to canonical names, drop unknowns."""
    rename = {}
    for col in gdf.columns:
        if col == 'geometry':
            continue
        key = col.strip().lower()
        if key in COLUMN_MAP:
            rename[col] = COLUMN_MAP[key]
        elif col in IGNORE_COLUMNS:
            pass
        else:
            # Keep as-is if not in the map (shouldn't happen with clean data)
            rename[col] = key.replace(' ', '_')
    gdf = gdf.rename(columns=rename)
    # Drop stray columns
    for c in list(IGNORE_COLUMNS):
        if c in gdf.columns:
            gdf = gdf.drop(columns=[c])
    return gdf


def _extract_section_number(filename):
    """Extract section number from filename like 'Bayanan Section 3.gpkg'."""
    m = re.search(r'[Ss]ection\s*(\d+)', filename)
    if m:
        return int(m.group(1))
    return 0


def _clean_val(v):
    """Clean a value for JSON serialisation."""
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, str):
        return v.strip() or None
    return v


# ── Section colour palette ────────────────────────────────────────────────────
SECTION_COLORS = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
    '#14b8a6', '#e11d48', '#8b5cf6', '#0ea5e9', '#d946ef',
    '#65a30d', '#dc2626', '#0891b2', '#7c3aed', '#ca8a04',
]


# ══════════════════════════════════════════════════════════════════════════════
#  API ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════


@api_login_required
@require_http_methods(["GET"])
def pim_barangay_list(request):
    """
    Return list of all barangay folders that have at least a sections/ dir.
    Also includes how many sections each has.
    """
    barangays = []
    if not os.path.isdir(PIM_DIR):
        return JsonResponse({'barangays': []})

    for name in sorted(os.listdir(PIM_DIR)):
        folder = os.path.join(PIM_DIR, name)
        if not os.path.isdir(folder):
            continue
        sect_dir = os.path.join(folder, 'sections')
        if not os.path.isdir(sect_dir):
            continue
        section_files = [f for f in os.listdir(sect_dir) if f.lower().endswith('.gpkg')]
        barangays.append({
            'name': name,
            'section_count': len(section_files),
            'has_data': len(section_files) > 0,
        })
    return JsonResponse({'barangays': barangays})


@api_login_required
@require_http_methods(["GET"])
def pim_barangay_geojson(request, barangay_name):
    """
    Return dissolved barangay boundary (union of all section polygons)
    as GeoJSON for zooming/highlighting.
    """
    sect_dir = os.path.join(PIM_DIR, barangay_name, 'sections')
    if not os.path.isdir(sect_dir):
        return JsonResponse({'error': f'Barangay "{barangay_name}" not found.'}, status=404)

    gpkg_files = sorted(
        [f for f in os.listdir(sect_dir) if f.lower().endswith('.gpkg')],
        key=_extract_section_number
    )
    if not gpkg_files:
        return JsonResponse({'error': 'No section data available yet.'}, status=404)

    all_gdfs = []
    for i, fname in enumerate(gpkg_files):
        try:
            gdf = gpd.read_file(os.path.join(sect_dir, fname), engine='pyogrio')
            if gdf.empty:
                continue
            gdf.geometry = gdf.geometry.buffer(0)
            if gdf.crs is None:
                gdf.set_crs('EPSG:3123', inplace=True)
            gdf = gdf.to_crs('EPSG:4326')

            sec_num = _extract_section_number(fname)
            color = SECTION_COLORS[i % len(SECTION_COLORS)]

            # Dissolve into one polygon per section
            gdf['section_number'] = sec_num
            gdf['section_color'] = color
            dissolved = gdf.dissolve().reset_index(drop=True)
            dissolved['section_number'] = sec_num
            dissolved['section_color'] = color
            dissolved['barangay'] = barangay_name
            all_gdfs.append(dissolved[['barangay', 'section_number', 'section_color', 'geometry']])
        except Exception as e:
            print(f"Error processing {fname}: {e}")

    if not all_gdfs:
        return JsonResponse({'error': 'Failed to process section data.'}, status=500)

    import pandas as pd
    combined = gpd.GeoDataFrame(pd.concat(all_gdfs, ignore_index=True))
    combined.set_crs('EPSG:4326', inplace=True)
    return JsonResponse(json.loads(combined.to_json()))


@api_login_required
@require_http_methods(["GET"])
def pim_section_lots_geojson(request, barangay_name, section_number):
    """
    Return individual lot polygons for a specific section as GeoJSON.
    Properties are normalised so the frontend always sees the same field names.
    """
    sect_dir = os.path.join(PIM_DIR, barangay_name, 'sections')
    if not os.path.isdir(sect_dir):
        return JsonResponse({'error': f'Barangay "{barangay_name}" not found.'}, status=404)

    # Find the matching section file
    target = None
    for fname in os.listdir(sect_dir):
        if not fname.lower().endswith('.gpkg'):
            continue
        if _extract_section_number(fname) == section_number:
            target = fname
            break

    if not target:
        return JsonResponse({'error': f'Section {section_number} not found.'}, status=404)

    try:
        gdf = gpd.read_file(os.path.join(sect_dir, target), engine='pyogrio')
        gdf.geometry = gdf.geometry.buffer(0)
        if gdf.crs is None:
            gdf.set_crs('EPSG:3123', inplace=True)
        gdf = gdf.to_crs('EPSG:4326')

        gdf = _normalise_columns(gdf)

        # Add metadata columns
        gdf['barangay'] = barangay_name
        gdf['section_number'] = section_number

        # Clean NaN values for JSON
        for col in gdf.columns:
            if col != 'geometry':
                gdf[col] = gdf[col].apply(_clean_val)

        # Check if enlargement exists for this section
        enlarge_dir = os.path.join(PIM_DIR, barangay_name, 'enlargements')
        has_enlargement = False
        if os.path.isdir(enlarge_dir):
            for ef in os.listdir(enlarge_dir):
                if _extract_section_number(ef) == section_number:
                    has_enlargement = True
                    break

        geojson = json.loads(gdf.to_json())
        geojson['metadata'] = {
            'barangay': barangay_name,
            'section_number': section_number,
            'lot_count': len(gdf),
            'has_enlargement': has_enlargement,
        }
        return JsonResponse(geojson)
    except Exception as e:
        return JsonResponse({'error': f'Failed to process section data: {str(e)}'}, status=500)


@api_login_required
@require_http_methods(["GET"])
def pim_enlargement_geojson(request, barangay_name, section_number):
    """
    Return enlargement GPKG data as GeoJSON for a specific section.
    """
    enlarge_dir = os.path.join(PIM_DIR, barangay_name, 'enlargements')
    if not os.path.isdir(enlarge_dir):
        return JsonResponse({'error': 'No enlargements available.'}, status=404)

    target = None
    for fname in os.listdir(enlarge_dir):
        if not fname.lower().endswith('.gpkg'):
            continue
        if _extract_section_number(fname) == section_number:
            target = fname
            break

    if not target:
        return JsonResponse({'error': f'No enlargement for section {section_number}.'}, status=404)

    try:
        gdf = gpd.read_file(os.path.join(enlarge_dir, target), engine='pyogrio')
        gdf.geometry = gdf.geometry.buffer(0)
        if gdf.crs is None:
            gdf.set_crs('EPSG:3123', inplace=True)
        gdf = gdf.to_crs('EPSG:4326')

        gdf = _normalise_columns(gdf)
        gdf['barangay'] = barangay_name
        gdf['section_number'] = section_number

        for col in gdf.columns:
            if col != 'geometry':
                gdf[col] = gdf[col].apply(_clean_val)

        geojson = json.loads(gdf.to_json())
        geojson['metadata'] = {
            'barangay': barangay_name,
            'section_number': section_number,
            'lot_count': len(gdf),
            'is_enlargement': True,
        }
        return JsonResponse(geojson)
    except Exception as e:
        return JsonResponse({'error': f'Failed to load enlargement: {str(e)}'}, status=500)


@api_login_required
@require_http_methods(["GET"])
def pim_section_list(request, barangay_name):
    """
    Return list of sections for a barangay with metadata (lot count, has enlargement).
    """
    sect_dir = os.path.join(PIM_DIR, barangay_name, 'sections')
    if not os.path.isdir(sect_dir):
        return JsonResponse({'error': f'Barangay "{barangay_name}" not found.'}, status=404)

    enlarge_dir = os.path.join(PIM_DIR, barangay_name, 'enlargements')
    enlargement_sections = set()
    if os.path.isdir(enlarge_dir):
        for ef in os.listdir(enlarge_dir):
            sec = _extract_section_number(ef)
            if sec:
                enlargement_sections.add(sec)

    sections = []
    for fname in sorted(os.listdir(sect_dir), key=_extract_section_number):
        if not fname.lower().endswith('.gpkg'):
            continue
        sec_num = _extract_section_number(fname)
        # Get lot count without loading geometry
        try:
            gdf = gpd.read_file(os.path.join(sect_dir, fname), engine='pyogrio',
                                read_geometry=False)
            lot_count = len(gdf)
        except Exception:
            lot_count = 0

        sections.append({
            'number': sec_num,
            'lot_count': lot_count,
            'has_enlargement': sec_num in enlargement_sections,
            'filename': fname,
        })

    return JsonResponse({
        'barangay': barangay_name,
        'sections': sections,
    })
