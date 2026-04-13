from pathlib import Path
import sqlite3
from django.core.management.base import BaseCommand
from django.conf import settings
from maps.models import SmvRate

class Command(BaseCommand):
    help = 'Migrates SMV .gpkg files into the SmvRate database table.'

    def handle(self, *args, **options):
        SMV_CLASS_FOLDERS = {
            'res': 'Residential',
            'agri': 'Agricultural',
            'comml': 'Commercial',
            'indl': 'Industrial',
        }
        
        base_dir = Path(settings.BASE_DIR) / 'maps' / 'static' / 'SMV'
        if not base_dir.exists():
            self.stdout.write(self.style.WARNING("No SMV directory found. Nothing to migrate."))
            return
            
        total_records = 0
            
        for class_key, folder_name in SMV_CLASS_FOLDERS.items():
            folder_path = base_dir / folder_name
            if not folder_path.exists():
                continue
                
            for gpkg_file in folder_path.glob('*.gpkg'):
                barangay_name = gpkg_file.stem
                
                self.stdout.write(f"Processing {barangay_name} - {class_key}...")
                
                conn = sqlite3.connect(str(gpkg_file))
                cur = conn.cursor()
                try:
                    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
                    tables = [r[0] for r in cur.fetchall()]
                    
                    for table in tables:
                        if table.startswith('gpkg_') or table.startswith('rtree_') or table == 'sqlite_sequence':
                            continue
                            
                        cur.execute(f"PRAGMA table_info('{table}')")
                        cols = [c[1] for c in cur.fetchall()]
                        if not cols:
                            continue
                            
                        pin_col = next((c for c in cols if str(c).lower() == 'pin'), None)
                        unit_col = next((c for c in cols if 'unit value' in str(c).lower()), None)
                        rrw_col = next((c for c in cols if 'area rrw' in str(c).lower()), None)
                        
                        if not pin_col or not unit_col:
                            continue
                            
                        query = f"SELECT \"{pin_col}\", \"{unit_col}\""
                        if rrw_col:
                            query += f", \"{rrw_col}\""
                        query += f" FROM '{table}'"
                        
                        cur.execute(query)
                        
                        batch = []
                        for row in cur.fetchall():
                            pin = str(row[0]).strip() if row[0] is not None else ''
                            if not pin:
                                continue
                                
                            unit_val = row[1] or 0
                            rrw_val = row[2] if len(row) > 2 else None
                            
                            batch.append(
                                SmvRate(
                                    barangay=barangay_name,
                                    class_key=class_key,
                                    pin=pin,
                                    unit_value=unit_val,
                                    area_rrw=rrw_val
                                )
                            )
                            total_records += 1
                            
                        if batch:
                            # Ignore conflicts for idempotency
                            SmvRate.objects.bulk_create(batch, ignore_conflicts=True)
                            
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"Error reading {gpkg_file}: {e}"))
                finally:
                    conn.close()
                    
        self.stdout.write(self.style.SUCCESS(f"Migrated {total_records} records to PostGIS database successfully!"))

