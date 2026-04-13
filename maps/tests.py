from unittest.mock import patch

from django.test import SimpleTestCase

from maps.pim_views import _compute_lot_tax_summary, _prepare_lot_properties


class PrepareLotPropertiesTests(SimpleTestCase):
    @patch('maps.pim_views._load_smv_cache')
    def test_infers_single_class_area_from_smv_when_only_generic_area_exists(self, mock_load_smv_cache):
        def fake_load(barangay_name, class_key):
            if class_key == 'res':
                return {
                    '02-285': {
                        'unit_value': 500,
                        'area_rrw': 25,
                    }
                }
            return {}

        mock_load_smv_cache.side_effect = fake_load

        props = _prepare_lot_properties(
            {
                'PIN': '02-285',
                'area': 599,
                'type of land use': None,
            },
            'Balimbing',
        )

        self.assertEqual(props['pin'], '02-285')
        self.assertEqual(props['PIN'], '02-285')
        self.assertEqual(props['area_res'], 599)
        self.assertEqual(props['area_rrw'], 25)
        self.assertEqual(props['unit_value_res'], 500)
        self.assertEqual(props['unit_value'], 500)
        self.assertEqual(props['land_use'], 'Residential')

    def test_maps_generic_area_from_land_use_when_smv_data_is_not_needed(self):
        props = _prepare_lot_properties(
            {
                'area': 120,
                'type of land use': 'Commercial',
            }
        )

        self.assertEqual(props['land_use'], 'Commercial')
        self.assertEqual(props['area_comml'], 120)
        self.assertNotIn('unit_value', props)

    @patch('maps.pim_views._load_smv_cache')
    def test_computes_rrw_using_smv_derived_unit_value(self, mock_load_smv_cache):
        def fake_load(barangay_name, class_key):
            if class_key == 'res':
                return {
                    '02-285': {
                        'unit_value': 500,
                        'area_rrw': 25,
                    }
                }
            return {}

        mock_load_smv_cache.side_effect = fake_load

        props = _prepare_lot_properties(
            {
                'PIN': '02-285',
                'area': 599,
            },
            'Balimbing',
        )

        summary = _compute_lot_tax_summary(props, 0.75)

        expected_market = (599 * 500 * 0.75) + (25 * 500 * 0.20)
        expected_assessed = (599 * 500 * 0.75 * 0.05) + (25 * 500 * 0.20 * 0.05)

        self.assertEqual(props['unit_value_rrw'], 500)
        self.assertEqual(props['rrw_class_key'], 'res')
        self.assertAlmostEqual(summary['market_value'], expected_market)
        self.assertAlmostEqual(summary['assessed_value'], expected_assessed)
        self.assertAlmostEqual(summary['rpt'], expected_assessed * 0.02)
