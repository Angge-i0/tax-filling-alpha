from django.urls import path
from .views import (
    geojson_data, cad_geojson_data, dashboard_stats, dashboard_landuse,
    dashboard_issues, mark_issue_solved, barangay_list,
    barangay_sections, section_lots,
    dashboard_rpt_report,
)
from .pim_views import (
    pim_barangay_list, pim_barangay_geojson, pim_section_list,
    pim_section_lots_geojson, pim_enlargement_geojson
)
from .maintenance_views import maintenance_files, maintenance_delete_file


urlpatterns = [
    path('api/geojson/', geojson_data),
    path('api/cad/geojson/', cad_geojson_data),
    path('api/dashboard/stats/', dashboard_stats, name='dashboard_stats'),
    path('api/dashboard/landuse/', dashboard_landuse, name='dashboard_landuse'),
    path('api/dashboard/rpt-report/', dashboard_rpt_report, name='dashboard_rpt_report'),
    path('api/dashboard/issues/', dashboard_issues, name='dashboard_issues'),
    path('api/dashboard/issues/<int:issue_id>/solve/', mark_issue_solved, name='mark_issue_solved'),
    path('api/barangays/', barangay_list, name='barangay_list'),
    path('api/barangays/<int:barangay_id>/sections/', barangay_sections, name='barangay_sections'),
    path('api/sections/<int:section_id>/lots/', section_lots, name='section_lots'),
    
    # ── New Folder-Based PIM API Routes ──
    path('api/pim/barangays/', pim_barangay_list, name='pim_barangay_list'),
    path('api/pim/barangays/<str:barangay_name>/geojson/', pim_barangay_geojson, name='pim_barangay_geojson'),
    path('api/pim/barangays/<str:barangay_name>/sections/', pim_section_list, name='pim_section_list'),
    path('api/pim/barangays/<str:barangay_name>/sections/<int:section_number>/lots/', pim_section_lots_geojson, name='pim_section_lots_geojson'),
    path('api/pim/barangays/<str:barangay_name>/sections/<int:section_number>/enlargement/', pim_enlargement_geojson, name='pim_enlargement_geojson'),
    
    # ── Maintenance Routes ──
    path('api/maintenance/files/', maintenance_files, name='maintenance_files'),
    path('api/maintenance/delete/', maintenance_delete_file, name='maintenance_delete_file'),
]
