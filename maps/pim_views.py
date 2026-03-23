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
from django.db.models import Count, Min, Q
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.contrib.gis.db.models.aggregates import Union

from .models import PimSection, PimEnlargement
from .views import api_login_required

BARANGAY_VARIANTS = {
    'Sta. Elena': ['Sta. Elena', 'Sta Elena', 'Santa Elena'],
    'Sto. Nino': ['Sto. Nino', 'Sto Nino', 'Sto Niño', 'Sto. Niño', 'Santo Nino', 'Santo Niño'],
    'Ilat North': ['Ilat North', 'Ilat'],
    'Natunuan South': ['Natunuan South', 'Natunuan'],
    'Poblacion': ['Poblacion', 'Poblacion 1', 'Poblacion 2', 'Poblacion 3', 'Poblacion 4'],
}

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


def _has_enlargement_marker(properties: dict) -> bool:
    for value in (properties or {}).values():
        if isinstance(value, str) and 'see enlargement' in value.strip().lower():
            return True
    return False


def _extract_section_number(filename):
    match = re.search(r'[Ss]ection\s*(\d+)', filename or '')
    if match:
        return int(match.group(1))
    return 0


def _canonical_barangay_name(name: str) -> str:
    cleaned = " ".join((name or '').strip().split())
    for canonical, variants in BARANGAY_VARIANTS.items():
        for variant in variants:
            if cleaned.lower() == variant.lower():
                return canonical
    return cleaned


def _barangay_variants(requested: str) -> list[str]:
    canonical = _canonical_barangay_name(requested)
    if canonical in BARANGAY_VARIANTS:
        return BARANGAY_VARIANTS[canonical]
    return [canonical]


def _filter_by_barangay(queryset, requested_barangay: str):
    variants = _barangay_variants(requested_barangay)
    condition = Q()
    for variant in variants:
        condition |= Q(barangay_name__iexact=variant)
    return queryset.filter(condition), _canonical_barangay_name(requested_barangay)


def _feature_from_geom(geom, properties):
    return {
        'type': 'Feature',
        'properties': properties,
        'geometry': json.loads(geom.geojson),
    }


@api_login_required
@require_http_methods(["GET"])
def pim_barangay_list(request):
    rows_raw = (
        PimSection.objects.values('barangay_name')
        .annotate(section_count=Count('section_number', distinct=True))
        .order_by('barangay_name')
    )
    grouped = {}
    for row in rows_raw:
        canonical = _canonical_barangay_name(row['barangay_name'])
        grouped[canonical] = grouped.get(canonical, 0) + row['section_count']

    barangays = []
    for canonical, section_count in sorted(grouped.items()):
        barangays.append({
            'name': canonical,
            'section_count': section_count,
            'has_data': section_count > 0,
        })

    return JsonResponse({'barangays': barangays})


@api_login_required
@require_http_methods(["GET"])
def pim_barangay_geojson(request, barangay_name):
    sections_qs, canonical_name = _filter_by_barangay(PimSection.objects, barangay_name)
    sections = (
        sections_qs
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
                    'barangay': canonical_name,
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
    section_base_qs, canonical_name = _filter_by_barangay(PimSection.objects, barangay_name)
    lots_qs = section_base_qs.filter(section_number=section_number).order_by('id')

    if not lots_qs.exists():
        return JsonResponse({'error': f'Section {section_number} not found.'}, status=404)

    enlargement_base_qs, _ = _filter_by_barangay(PimEnlargement.objects, barangay_name)
    section_enlargement_qs = enlargement_base_qs.filter(section_number=section_number)
    section_has_enlargement_file = section_enlargement_qs.exists()

    features = []
    marker_count = 0
    for row in lots_qs:
        props = _normalise_properties(row.properties)
        props['barangay'] = canonical_name
        props['section_number'] = section_number
        # Strict per-lot rule: show popup/button only when the lot attributes
        # explicitly contain "See enlargement".
        lot_has_enlargement = _has_enlargement_marker(props)
        if lot_has_enlargement:
            marker_count += 1
        props['has_enlargement'] = lot_has_enlargement
        features.append(_feature_from_geom(row.geom, props))

    geojson = {
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'barangay': canonical_name,
            'section_number': section_number,
            'lot_count': len(features),
            # Keep section-level flag for UI flow:
            # true if either a marker exists in lots or an enlargement file exists.
            'has_enlargement': bool(marker_count > 0 or section_has_enlargement_file),
        },
    }
    return JsonResponse(geojson)


@api_login_required
@require_http_methods(["GET"])
def pim_enlargement_geojson(request, barangay_name, section_number):
    enlargement_base_qs, canonical_name = _filter_by_barangay(PimEnlargement.objects, barangay_name)
    lots_qs = enlargement_base_qs.filter(section_number=section_number).order_by('id')

    if not lots_qs.exists():
        return JsonResponse({'error': f'No enlargement for section {section_number}.'}, status=404)

    features = []
    for row in lots_qs:
        props = _normalise_properties(row.properties)
        props['barangay'] = canonical_name
        props['section_number'] = section_number
        features.append(_feature_from_geom(row.geom, props))

    geojson = {
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'barangay': canonical_name,
            'section_number': section_number,
            'lot_count': len(features),
            'is_enlargement': True,
        },
    }
    return JsonResponse(geojson)


@api_login_required
@require_http_methods(["GET"])
def pim_section_list(request, barangay_name):
    section_base_qs, canonical_name = _filter_by_barangay(PimSection.objects, barangay_name)
    sections_qs = (
        section_base_qs
        .values('section_number')
        .annotate(lot_count=Count('id'), filename=Min('source_file'))
        .order_by('section_number')
    )
    sections_qs = list(sections_qs)
    if not sections_qs:
        return JsonResponse({'error': f'Barangay "{barangay_name}" not found.'}, status=404)

    enlargement_base_qs, _ = _filter_by_barangay(PimEnlargement.objects, barangay_name)
    enlargement_sections = set(
        enlargement_base_qs
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
        'barangay': canonical_name,
        'sections': sections,
    })
