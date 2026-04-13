import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxfiling.settings')
django.setup()

from django.db import connection
try:
    with connection.cursor() as cursor:
        cursor.execute("INSERT INTO django_migrations (app, name, applied) VALUES ('maps', '0005_rptreportcache_smvrate', NOW());")
    print("inserted")
except Exception as e:
    print(e)
