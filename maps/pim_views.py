"""
PIM API Views backed by PostGIS tables.

Tables:
    pim_sections
    pim_enlargements
    pim_barangay_boundaries
"""
import json
import math
import re
from django.db.models import Count, Min
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.contrib.gis.db.models.aggregates import Union

from .models import PimSection, PimEnlargement
from .views import api_login_required

# Column name normalisation for frontend consistency.
COLUMN_MAP = {
    'pin': 'pin',
    'name of owner': 'owner',
    'property owner': 'owner',
    'address of owner': 'address',
    'address': 'address',
    'addres of owner': 'address',
    'adress of owner': 'address',
    'arp number': 'arp_no',
    'arp no.': 'arp_no',
    'arp no': 'arp_no',
    'previous arp number': 'prev_arp_no',
    'previous arp numberr': 'prev_arp_no',
    'previous arp no.': 'prev_arp_no',
    'previous arp no': 'prev_arp_no',
    'previos arp no.': 'prev_arp_no',
    'prevous arp no.': 'prev_arp_no',
    'area (res)': 'area_res',
    'area res': 'area_res',
    'area (agri)': 'area_agri',
    'area agri': 'area_agri',
    "area (ind'l)": 'area_indl',
    "area (ind_l)": 'area_indl',
    'area ind': 'area_indl',
    "area ind'l": 'area_indl',
    'area indus': 'area_indl',
    'area industri': 'area_indl',
    "agrea (ind'l)": 'area_indl',
    "agrea (ind_l)": 'area_indl',
    "area (comm'l)": 'area_comml',
    "area (comm_l)": 'area_comml',
    'area comml': 'area_comml',
    "area comm'l": 'area_comml',
    'area (rrw)': 'area_rrw',
    'area rrw': 'area_rrw',
    'area (exempt)': 'area_exempt',
    'area exempt': 'area_exempt',
}

IGNORE_COLUMNS = {'1', 'geometry', 'geom', 'id', 'fid'}

SECTION_COLORS = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
    '#14b8a6', '#e11d48', '#8b5cf6', '#0ea5e9', '#d946ef',
    '#65a30d', '#dc2626', '#0891b2', '#7c3aed', '#ca8a04',
]


def _clean_val(value):
    if value is None:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else None
    return value


def _normalise_properties(properties):
    normalised = {}
    for key, value in (properties or {}).items():
        key_raw = str(key).strip()
        if not key_raw:
            continue
        if key_raw in IGNORE_COLUMNS:
            continue

        key_lower = key_raw.lower()
        if key_lower in COLUMN_MAP:
            out_key = COLUMN_MAP[key_lower]
        else:
            out_key = key_lower.replace(' ', '_')
            if out_key in IGNORE_COLUMNS:
                continue

        normalised[out_key] = _clean_val(value)

    # Compatibility aliases for existing frontend checks/tooltips.
    if 'pin' in normalised and 'PIN' not in normalised:
        normalised['PIN'] = normalised['pin']
    if 'owner' in normalised and 'Name of Owner' not in normalised:
        normalised['Name of Owner'] = normalised['owner']

    return normalised


def _extract_section_number(filename):
    match = re.search(r'[Ss]ection\s*(\d+)', filename or '')
    if match:
        return int(match.group(1))
    return 0


def _feature_from_geom(geom, properties):
    return {
        'type': 'Feature',
        'properties': properties,
        'geometry': json.loads(geom.geojson),
    }


@api_login_required
@require_http_methods(["GET"])
def pim_barangay_list(request):
    rows = (
        PimSection.objects.values('barangay_name')
        .annotate(section_count=Count('section_number', distinct=True))
        .order_by('barangay_name')
    )
    barangays = [
        {
            'name': row['barangay_name'],
            'section_count': row['section_count'],
            'has_data': row['section_count'] > 0,
        }
        for row in rows
    ]
    return JsonResponse({'barangays': barangays})


@api_login_required
@require_http_methods(["GET"])
def pim_barangay_geojson(request, barangay_name):
    sections = (
        PimSection.objects.filter(barangay_name__iexact=barangay_name)
        .values('section_number')
        .annotate(geom=Union('geom'))
        .order_by('section_number')
    )
    sections = list(sections)
    if not sections:
        return JsonResponse({'error': f'Barangay "{barangay_name}" not found.'}, status=404)

    features = []
    for idx, row in enumerate(sections):
        geom = row.get('geom')
        if geom is None:
            continue
        features.append(
            _feature_from_geom(
                geom,
                {
                    'barangay': barangay_name,
                    'section_number': row['section_number'],
                    'section_color': SECTION_COLORS[idx % len(SECTION_COLORS)],
                },
            )
        )

    if not features:
        return JsonResponse({'error': 'Failed to process section data.'}, status=500)

    return JsonResponse({'type': 'FeatureCollection', 'features': features})


@api_login_required
@require_http_methods(["GET"])
def pim_section_lots_geojson(request, barangay_name, section_number):
    lots_qs = PimSection.objects.filter(
        barangay_name__iexact=barangay_name,
        section_number=section_number,
    ).order_by('id')

    if not lots_qs.exists():
        return JsonResponse({'error': f'Section {section_number} not found.'}, status=404)

    has_enlargement = PimEnlargement.objects.filter(
        barangay_name__iexact=barangay_name,
        section_number=section_number,
    ).exists()

    features = []
    for row in lots_qs:
        props = _normalise_properties(row.properties)
        props['barangay'] = barangay_name
        props['section_number'] = section_number
        features.append(_feature_from_geom(row.geom, props))

    geojson = {
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'barangay': barangay_name,
            'section_number': section_number,
            'lot_count': len(features),
            'has_enlargement': has_enlargement,
        },
    }
    return JsonResponse(geojson)


@api_login_required
@require_http_methods(["GET"])
def pim_enlargement_geojson(request, barangay_name, section_number):
    lots_qs = PimEnlargement.objects.filter(
        barangay_name__iexact=barangay_name,
        section_number=section_number,
    ).order_by('id')

    if not lots_qs.exists():
        return JsonResponse({'error': f'No enlargement for section {section_number}.'}, status=404)

    features = []
    for row in lots_qs:
        props = _normalise_properties(row.properties)
        props['barangay'] = barangay_name
        props['section_number'] = section_number
        features.append(_feature_from_geom(row.geom, props))

    geojson = {
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'barangay': barangay_name,
            'section_number': section_number,
            'lot_count': len(features),
            'is_enlargement': True,
        },
    }
    return JsonResponse(geojson)


@api_login_required
@require_http_methods(["GET"])
def pim_section_list(request, barangay_name):
    sections_qs = (
        PimSection.objects.filter(barangay_name__iexact=barangay_name)
        .values('section_number')
        .annotate(lot_count=Count('id'), filename=Min('source_file'))
        .order_by('section_number')
    )
    sections_qs = list(sections_qs)
    if not sections_qs:
        return JsonResponse({'error': f'Barangay "{barangay_name}" not found.'}, status=404)

    enlargement_sections = set(
        PimEnlargement.objects.filter(barangay_name__iexact=barangay_name)
        .values_list('section_number', flat=True)
        .distinct()
    )

    sections = [
        {
            'number': row['section_number'],
            'lot_count': row['lot_count'],
            'has_enlargement': row['section_number'] in enlargement_sections,
            'filename': row['filename'],
        }
        for row in sections_qs
    ]

    return JsonResponse({
        'barangay': barangay_name,
        'sections': sections,
    })
