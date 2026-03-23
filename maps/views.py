from django.http import JsonResponse
from django.utils import timezone
import json
from django.conf import settings
import os
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from collections import Counter
from django.contrib.gis.db.models.aggregates import Union
from .models import Barangay, Section, Lot, Issue, CadAlalum
import geopandas as gpd
import pandas as pd


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
    Serves the PIM boundaries by loading all GPKG files from maps/static/PIM/.
    Each file is reprojected, dissolved, and assigned a color from the database.
    """
    pim_dir = os.path.join(settings.BASE_DIR, 'maps/static/PIM')
    
    if not os.path.exists(pim_dir):
        # Fallback to old path if PIM dir is missing
        old_file_path = os.path.join(settings.BASE_DIR, 'maps/static/maps/nasugbu.geojson')
        if not os.path.exists(old_file_path):
            return JsonResponse({'error': 'Map data not found.'}, status=404)
        with open(old_file_path) as f:
            return JsonResponse(json.load(f))
            
    try:
        gpkg_files = [f for f in os.listdir(pim_dir) if f.lower().endswith('.gpkg')]
        if not gpkg_files:
            return JsonResponse({'error': 'No GPKG files found in PIM directory.'}, status=404)

        all_gdfs = []
        # Pre-fetch colors to minimize database queries
        try:
            brgy_colors = {b.name.lower(): b.color for b in Barangay.objects.all()}
        except Exception as e:
            # Fallback if table doesn't exist yet or other DB issue
            print(f"Database error fetching barangay colors: {e}")
            brgy_colors = {}
        
        for filename in gpkg_files:
            file_path = os.path.join(pim_dir, filename)
            try:
                # Use pyogrio engine for speed
                gdf = gpd.read_file(file_path, engine='pyogrio')
                if gdf.empty:
                    continue
                    
                # Fix potential topology issues before dissolve
                gdf.geometry = gdf.geometry.buffer(0)
                    
                # Ensure correct CRS (PRS92 / Philippines zone 3) and reproject for web
                if gdf.crs is None:
                    gdf.set_crs('EPSG:3123', inplace=True)
                gdf = gdf.to_crs('EPSG:4326')
                
                # Dissolve geometries to show the whole barangay instead of individual lots
                # Group by ADM4_EN if present, otherwise fallback to filename
                if 'ADM4_EN' in gdf.columns:
                    gdf = gdf.dissolve(by='ADM4_EN').reset_index()
                else:
                    brgy_name = os.path.splitext(filename)[0]
                    gdf['ADM4_EN'] = brgy_name
                    gdf = gdf.dissolve(by='ADM4_EN').reset_index()
                
                # Assign color based on Barangay name
                gdf['color'] = gdf['ADM4_EN'].map(lambda x: brgy_colors.get(x.lower(), '#3388ff'))
                
                # Ensure we only have necessary columns to keep JSON clean
                all_gdfs.append(gdf[['ADM4_EN', 'geometry', 'color']])
            except Exception as e:
                print(f"Error processing {filename}: {e}")
                
        if not all_gdfs:
            return JsonResponse({'error': 'Failed to process any map data.'}, status=500)
            
        # Combine all barangays into a single GeoDataFrame
        combined_gdf = gpd.GeoDataFrame(pd.concat(all_gdfs, ignore_index=True))
        combined_gdf.set_crs('EPSG:4326', inplace=True)
        
        return JsonResponse(json.loads(combined_gdf.to_json()))
    except Exception as e:
        return JsonResponse({'error': f'Failed to load PIM map: {str(e)}'}, status=500)


@api_login_required
def cad_geojson_data(request):
    """
    Returns CAD overview geometry from PostGIS table cad_alalum.
    """
    try:
        union_geom = CadAlalum.objects.aggregate(geom=Union('geom')).get('geom')
        if union_geom is None:
            return JsonResponse({'error': 'No CAD data found in PostGIS table cad_alalum.'}, status=404)

        color = Barangay.objects.filter(name__iexact='Alalum').values_list('color', flat=True).first() or '#3388ff'
        return JsonResponse({
            'type': 'FeatureCollection',
            'features': [
                {
                    'type': 'Feature',
                    'properties': {
                        'ADM4_EN': 'Alalum',
                        'color': color,
                    },
                    'geometry': json.loads(union_geom.geojson),
                }
            ],
        })
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

