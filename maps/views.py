from django.http import JsonResponse
from django.utils import timezone
import json
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from collections import Counter
from django.contrib.gis.db.models.aggregates import Union
from django.contrib.gis.geos import Polygon
from .models import Barangay, Section, Lot, Issue, CadMap, PimBarangayBoundary, PimSection


BARANGAY_NAME_MAP = {
    'sta. elena': 'Sta. Elena',
    'sta elena': 'Sta. Elena',
    'santa elena': 'Sta. Elena',
    'sto. nino': 'Sto. Nino',
    'sto nino': 'Sto. Nino',
    'sto niño': 'Sto. Nino',
    'sto. niño': 'Sto. Nino',
    'santo nino': 'Sto. Nino',
    'santo niño': 'Sto. Nino',
    'ilat': 'Ilat North',
    'natunuan': 'Natunuan South',
    'poblacion 1': 'Poblacion',
    'poblacion 2': 'Poblacion',
    'poblacion 3': 'Poblacion',
    'poblacion 4': 'Poblacion',
}


def _canonical_barangay_name(name: str) -> str:
    key = " ".join((name or '').strip().lower().split())
    return BARANGAY_NAME_MAP.get(key, (name or '').strip())


# Defensive map extent filter: keeps only San Pascual / nearby Batangas data
# so malformed outlier geometries do not break fitBounds in the frontend.
SAN_PASCUAL_BBOX = Polygon.from_bbox((120.0, 13.0, 122.0, 14.5))
SAN_PASCUAL_BBOX.srid = 4326


def api_login_required(view_func):
    """
    JWT-based authentication decorator.
    Returns JSON 401 if no valid Bearer token is provided.
    """
    from functools import wraps
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        try:
            auth = JWTAuthentication()
            result = auth.authenticate(request)
            if result:
                request.user = result[0]
                return view_func(request, *args, **kwargs)
        except Exception:
            pass
        return JsonResponse({'error': 'Authentication required.'}, status=401)
    return wrapper


@api_login_required
def geojson_data(request):
    """
    Serves municipality-level PIM boundaries from PostGIS.
    """
    try:
        rows = (
            PimSection.objects.filter(geom__intersects=SAN_PASCUAL_BBOX)
            .values('barangay_name')
            .annotate(geom=Union('geom'))
            .order_by('barangay_name')
        )
        rows = list(rows)
        if not rows:
            rows = list(
                PimBarangayBoundary.objects.filter(geom__intersects=SAN_PASCUAL_BBOX)
                .values('barangay_name')
                .annotate(geom=Union('geom'))
                .order_by('barangay_name')
            )
        if not rows:
            return JsonResponse({'error': 'No PIM boundaries found in PostGIS.'}, status=404)

        brgy_colors = {b.name.lower(): b.color for b in Barangay.objects.all()}
        by_name = {}
        for row in rows:
            raw_name = row['barangay_name']
            canonical = _canonical_barangay_name(raw_name)
            geom = row.get('geom')
            if geom is None:
                continue
            if canonical in by_name:
                by_name[canonical] = by_name[canonical].union(geom)
            else:
                by_name[canonical] = geom

        features = []
        for canonical_name, geom in by_name.items():
            features.append({
                'type': 'Feature',
                'properties': {
                    'ADM4_EN': canonical_name,
                    'color': brgy_colors.get(canonical_name.lower(), '#3388ff'),
                },
                'geometry': json.loads(geom.geojson),
            })

        return JsonResponse({'type': 'FeatureCollection', 'features': features})
    except Exception as e:
        return JsonResponse({'error': f'Failed to load PIM map: {str(e)}'}, status=500)


@api_login_required
def cad_geojson_data(request):
    """
    Returns CAD overview geometry from PostGIS table cad_maps.
    """
    try:
        rows = (
            CadMap.objects.filter(geom__intersects=SAN_PASCUAL_BBOX)
            .values('barangay_name')
            .annotate(geom=Union('geom'))
            .order_by('barangay_name')
        )
        rows = list(rows)
        if not rows:
            return JsonResponse({'error': 'No CAD data found in PostGIS table cad_maps.'}, status=404)

        brgy_colors = {b.name.lower(): b.color for b in Barangay.objects.all()}
        by_name = {}
        for row in rows:
            raw_name = row['barangay_name']
            canonical = _canonical_barangay_name(raw_name)
            geom = row.get('geom')
            if geom is None:
                continue
            if canonical in by_name:
                by_name[canonical] = by_name[canonical].union(geom)
            else:
                by_name[canonical] = geom

        features = []
        for canonical_name, geom in by_name.items():
            features.append({
                'type': 'Feature',
                'properties': {
                    'ADM4_EN': canonical_name,
                    'color': brgy_colors.get(canonical_name.lower(), '#3388ff'),
                },
                'geometry': json.loads(geom.geojson),
            })

        return JsonResponse({'type': 'FeatureCollection', 'features': features})
    except Exception as e:
        return JsonResponse({'error': f'CAD processing failed: {str(e)}'}, status=500)


# ── Dashboard API Views ────────────────────────────────────────────────────


@api_login_required
@require_http_methods(["GET"])
def dashboard_stats(request):
    """Return totals for barangays, sections, lots, and issues (if staff)."""
    total_barangays = Barangay.objects.count()
    total_sections = Section.objects.count()
    total_lots = Lot.objects.count()

    data = {
        'total_barangays': total_barangays,
        'total_sections': total_sections,
        'total_lots': total_lots,
    }

    # Only include issue count for staff
    if request.user.is_staff:
        total_issues = Issue.objects.filter(status='unsolved').count()
        data['total_issues'] = total_issues

    return JsonResponse(data)


@api_login_required
@require_http_methods(["GET"])
def dashboard_landuse(request):
    """Return land-use distribution data for charts."""
    lots = Lot.objects.all()

    # Count each unique land-use combination
    use_counter = Counter()
    for lot in lots:
        uses = lot.land_use if lot.land_use else []
        key = " + ".join(sorted(uses)) if uses else "Unclassified"
        use_counter[key] += 1

    # Sort by count descending
    labels: list[str] = []
    values: list[int] = []
    for label, count in use_counter.most_common():
        labels.append(label)
        values.append(count)

    return JsonResponse({
        'labels': labels,
        'values': values,
    })


@api_login_required
@require_http_methods(["GET"])
def dashboard_issues(request):
    """Admin only: return list of issues."""
    if not request.user.is_staff:
        return JsonResponse({'error': 'Admin access required.'}, status=403)

    # Filter out solved issues older than 1 minute
    one_min_ago = timezone.now() - timezone.timedelta(minutes=1)
    Issue.objects.filter(status='solved', solved_at__lte=one_min_ago).delete()

    issues = Issue.objects.all().values('id', 'description', 'status', 'solved_at', 'created_at')
    return JsonResponse({'issues': list(issues)})


@csrf_exempt
@api_login_required
@require_http_methods(["POST"])
def mark_issue_solved(request, issue_id):
    """Admin only: mark an issue as solved."""
    if not request.user.is_staff:
        return JsonResponse({'error': 'Admin access required.'}, status=403)

    try:
        issue = Issue.objects.get(id=issue_id)
    except Issue.DoesNotExist:
        return JsonResponse({'error': 'Issue not found.'}, status=404)

    issue.status = 'solved'
    issue.solved_at = timezone.now()
    issue.save()
    return JsonResponse({'success': True, 'id': issue.id, 'status': 'solved'})


@api_login_required
@require_http_methods(["GET"])
def barangay_list(request):
    """Return list of all barangays with their colors (for CAD legend)."""
    barangays = list(Barangay.objects.values('id', 'name', 'color'))
    return JsonResponse({'barangays': barangays})


@api_login_required
@require_http_methods(["GET"])
def barangay_sections(request, barangay_id):
    """Return sections for a barangay."""
    try:
        brgy = Barangay.objects.get(id=barangay_id)
    except Barangay.DoesNotExist:
        return JsonResponse({'error': 'Barangay not found.'}, status=404)

    sections = list(Section.objects.filter(barangay=brgy).values('id', 'number'))
    return JsonResponse({
        'barangay': brgy.name,
        'sections': sections,
    })


@api_login_required
@require_http_methods(["GET"])
def section_lots(request, section_id):
    """Return lots for a section. Admin sees full details, user sees limited."""
    try:
        section = Section.objects.select_related('barangay').get(id=section_id)
    except Section.DoesNotExist:
        return JsonResponse({'error': 'Section not found.'}, status=404)

    lots_qs = Lot.objects.filter(section=section)

    if request.user.is_staff:
        lots = list(lots_qs.values(
            'id', 'lot_number', 'owner', 'address', 'pin',
            'market_value', 'assessment_value', 'rpt', 'land_use', 'area_sqm'
        ))
    else:
        # Users only see PIN, Area, Landuse
        lots = list(lots_qs.values('id', 'lot_number', 'pin', 'land_use', 'area_sqm'))

    return JsonResponse({
        'municipality': 'San Pascual, Batangas',
        'barangay': section.barangay.name,
        'section_number': section.number,
        'lots': lots,
    })

