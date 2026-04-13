import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxfiling.settings')
django.setup()

from maps.pim_views import _update_rpt_cache_for_pin

try:
    print("starting")
    _update_rpt_cache_for_pin("015-18-028-09-170", 0.75, 0.5)
    print("success")
except Exception as e:
    import traceback
    traceback.print_exc()
