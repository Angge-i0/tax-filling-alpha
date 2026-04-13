import re

with open('maps/views.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove _RPT_REPORT_CACHE_FILE definition
content = content.replace('''_RPT_REPORT_CACHE_FILE = os.path.join(
    os.path.dirname(__file__),
    'static',
    'rpt_report_cache.json'
)''', '''# _RPT_REPORT_CACHE_FILE functionality migrated to DB RptReportCache model''')

# 2. Update fast path
old_fast_path = '''    # Always return disk cache immediately if it exists (fast path)
    if os.path.exists(_RPT_REPORT_CACHE_FILE):
        try:
            with open(_RPT_REPORT_CACHE_FILE, 'r', encoding='utf-8') as f:
                cached_payload = json.load(f)
            if cached_payload:
                return JsonResponse(cached_payload)
        except Exception:
            pass'''
new_fast_path = '''    # Always return DB cache immediately if it exists (fast path)
    from .models import RptReportCache
    cache_obj = RptReportCache.objects.filter(key='dashboard_rpt').first()
    if cache_obj and cache_obj.data:
        return JsonResponse(cache_obj.data)'''
content = content.replace(old_fast_path, new_fast_path)

# 3. Update compute_payload writing
old_write_1 = '''        try:
            os.makedirs(os.path.dirname(_RPT_REPORT_CACHE_FILE), exist_ok=True)
            with open(_RPT_REPORT_CACHE_FILE, 'w', encoding='utf-8') as f:
                json.dump(payload_local, f)
        except Exception:
            pass'''
new_write_1 = '''        try:
            from .models import RptReportCache
            RptReportCache.objects.update_or_create(key='dashboard_rpt', defaults={'data': payload_local})
        except Exception:
            pass'''
content = content.replace(old_write_1, new_write_1)

# 4. Update async error writing
old_write_2 = '''                        os.makedirs(os.path.dirname(_RPT_REPORT_CACHE_FILE), exist_ok=True)
                        with open(_RPT_REPORT_CACHE_FILE, 'w', encoding='utf-8') as f:
                            json.dump(error_payload, f)'''
new_write_2 = '''                        from .models import RptReportCache
                        RptReportCache.objects.update_or_create(key='dashboard_rpt', defaults={'data': error_payload})'''
content = content.replace(old_write_2, new_write_2)

# 5. Update build_rpt_report_cache writing
old_write_3 = '''    try:
        os.makedirs(os.path.dirname(_RPT_REPORT_CACHE_FILE), exist_ok=True)
        with open(_RPT_REPORT_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(payload, f)
    except Exception:
        pass'''
new_write_3 = '''    try:
        from .models import RptReportCache
        RptReportCache.objects.update_or_create(key='dashboard_rpt', defaults={'data': payload})
    except Exception:
        pass'''
content = content.replace(old_write_3, new_write_3)

with open('maps/views.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Update completed.")
