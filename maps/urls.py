from django.urls import path
from .views import (
    geojson_data, cad_geojson_data, dashboard_stats, dashboard_landuse,
    dashboard_issues, mark_issue_solved, barangay_list,
    barangay_sections, section_lots,
)

urlpatterns = [
    path('api/geojson/', geojson_data),
    path('api/cad/geojson/', cad_geojson_data),
    path('api/dashboard/stats/', dashboard_stats, name='dashboard_stats'),
    path('api/dashboard/landuse/', dashboard_landuse, name='dashboard_landuse'),
    path('api/dashboard/issues/', dashboard_issues, name='dashboard_issues'),
    path('api/dashboard/issues/<int:issue_id>/solve/', mark_issue_solved, name='mark_issue_solved'),
    path('api/barangays/', barangay_list, name='barangay_list'),
    path('api/barangays/<int:barangay_id>/sections/', barangay_sections, name='barangay_sections'),
    path('api/sections/<int:section_id>/lots/', section_lots, name='section_lots'),
]
