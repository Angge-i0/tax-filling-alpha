import os
import tempfile
import zipfile
from pathlib import Path
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.gis.gdal import DataSource
from django.contrib.gis.geos import MultiPolygon
from maps.views import api_login_required
from maps.models import CadMap, PimSection, PimEnlargement, PimBarangayBoundary

def get_layer_model(filepath, is_cad):
    name = str(filepath).lower()
    if is_cad:
        return CadMap
    else:
        if 'enlargement' in name:
            return PimEnlargement
        elif 'boundary' in name or 'boundaries' in name:
            return PimBarangayBoundary
        else:
            return PimSection

def ingest_file(file_path, is_cad, original_name):
    # Parse vector file using GeoDjango DataSource
    ds = DataSource(str(file_path))
    model_class = get_layer_model(original_name, is_cad)
    
    layer = ds[0]
    
    records = []
    # Delete existing by source_file to avoid duplication
    model_class.objects.filter(source_file=original_name).delete()
    
    for feat in layer:
        props = {}
        for field in layer.fields:
            props[field] = feat.get(field)
            
        geom = feat.geom.geos
        if geom.geom_type == 'Polygon':
            geom = MultiPolygon(geom)
        
        # Try to infer barangay and section
        barangay_name = props.get('ADM4_EN') or props.get('barangay') or 'Unknown'
        section_number = 0
        try:
            section_number = int(props.get('section_number') or 0)
        except:
            pass
            
        # Transform strictly to 4326
        if geom.srid and geom.srid != 4326:
            geom.transform(4326)
            
        if model_class == CadMap:
            records.append(model_class(barangay_name=barangay_name, source_file=original_name, properties=props, geom=geom))
        elif model_class == PimBarangayBoundary:
            records.append(model_class(barangay_name=barangay_name, source_file=original_name, properties=props, geom=geom))
        else:
            records.append(model_class(barangay_name=barangay_name, section_number=section_number, source_file=original_name, properties=props, geom=geom))
    
    if records:
        model_class.objects.bulk_create(records, batch_size=1000)

@csrf_exempt
@api_login_required
def maintenance_files(request):
    if request.method == 'GET':
        rel_path = request.GET.get('path', '')
        
        if not rel_path:
            return JsonResponse({
                'current_path': '',
                'directories': [
                    {'name': 'CAD (DB)', 'path': 'CAD', 'size': 0, 'is_dir': True},
                    {'name': 'PIM (DB)', 'path': 'PIM', 'size': 0, 'is_dir': True}
                ],
                'files': []
            })
            
        # List distinct files in DB instead of local
        files = []
        is_cad = rel_path.startswith('CAD')
        models_to_check = [CadMap] if is_cad else [PimSection, PimEnlargement, PimBarangayBoundary]
        
        for model in models_to_check:
            from django.db.models import Count
            qs = model.objects.values('source_file').annotate(rcount=Count('id'))
            for row in qs:
                if row['source_file']:
                    files.append({
                        'name': row['source_file'],
                        'path': f"{rel_path}/{row['source_file']}",
                        'size': row['rcount'], # use size as record count
                        'is_dir': False
                    })
                    
        return JsonResponse({
            'current_path': rel_path,
            'directories': [],
            'files': files
        })
        
    elif request.method == 'POST':
        rel_path = request.POST.get('path', '')
        
        if not rel_path.startswith(('CAD', 'PIM')):
            return JsonResponse({'error': 'Invalid path.'}, status=400)
            
        is_cad = rel_path.startswith('CAD')
        uploaded_file = request.FILES.get('file')
        
        if not uploaded_file:
            return JsonResponse({'error': 'No file uploaded.'}, status=400)
            
        # Save securely to a true temporary directory handled by Python
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(uploaded_file.name).suffix) as tf:
            for chunk in uploaded_file.chunks():
                tf.write(chunk)
            tf.flush()
            
            try:
                if uploaded_file.name.endswith('.zip'):
                    with tempfile.TemporaryDirectory() as td:
                        with zipfile.ZipFile(tf.name, 'r') as zf:
                            zf.extractall(td)
                        for p in Path(td).rglob('*'):
                            if p.suffix in ['.shp', '.geojson', '.gpkg', '.kml']:
                                ingest_file(p, is_cad, uploaded_file.name)
                                break
                else:
                    ingest_file(tf.name, is_cad, uploaded_file.name)
            except Exception as e:
                os.unlink(tf.name)
                return JsonResponse({'error': f'Failed to process geometry: {e}'}, status=500)
                
            os.unlink(tf.name)
            
        return JsonResponse({'message': 'File processed directly into PostGIS successfully.', 'file': uploaded_file.name})

@csrf_exempt
@api_login_required
@require_http_methods(["POST"])
def maintenance_delete_file(request):
    target_path = request.POST.get('filepath')
    if not target_path:
        return JsonResponse({'error': 'Filepath not provided.'}, status=400)
        
    parts = target_path.split('/')
    if len(parts) < 2:
        return JsonResponse({'error': 'Invalid filepath structure.'}, status=400)
        
    base_folder = parts[0]
    filename = parts[-1]
    
    is_cad = base_folder == 'CAD'
    models_to_check = [CadMap] if is_cad else [PimSection, PimEnlargement, PimBarangayBoundary]
    
    deleted = False
    try:
        for model in models_to_check:
            res = model.objects.filter(source_file=filename).delete()
            if res[0] > 0:
                deleted = True
        
        if deleted:
            return JsonResponse({'message': 'File deleted successfully from PostGIS.'})
        else:
            return JsonResponse({'error': 'File not found in database.'}, status=404)
    except Exception as e:
        return JsonResponse({'error': f'Failed to delete: {e}'}, status=500)
