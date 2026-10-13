"""Browser regression checks; build dist/index.html before running this file."""
import shutil
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = 'http://flex-claimer.test/'
FIELDS = ['date', 'start', 'end', 'station', 'name', 'details']


class OptionalFieldsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        options = {'headless': True, 'args': ['--no-sandbox']}
        chromium = shutil.which('chromium') or shutil.which('chromium-browser')
        if chromium:
            options['executable_path'] = chromium
        cls.browser = cls.playwright.chromium.launch(**options)
        cls.html = (ROOT / 'dist/index.html').read_text()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1200, 'height': 900})
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.on('dialog', lambda dialog: dialog.accept())
        self.page.route(URL, lambda route: route.fulfill(body=self.html, content_type='text/html'))
        self.page.add_init_script('''HTMLAnchorElement.prototype.click = function() {
          if (this.href.startsWith('mailto:')) window.testMailto = this.href;
        };''')
        self.page.goto(URL)
        self.choose('custom')
        self.page.locator('#date').fill('2026-10-01')

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def choose(self, key):
        self.page.locator('#typeButton').click()
        leaf = self.page.locator(f'[data-key="{key}"]')
        if not leaf.is_visible():
            group = leaf.locator('xpath=../..').locator('xpath=preceding-sibling::button')
            group.focus()
            group.press('ArrowRight')
        leaf.focus()
        leaf.press('Enter')
        self.assertEqual(self.page.locator('#type').input_value(), key)

    def fields_are(self, expected, required=()):
        for field in FIELDS:
            with self.subTest(field=field):
                control = self.page.locator(f'#{field}')
                self.assertEqual(control.is_visible(), field in expected)
                self.assertEqual(control.is_disabled(), field not in expected)
                self.assertEqual(control.evaluate('el => el.required'), field in required)
                if field in expected:
                    lang = self.page.locator('html').get_attribute('lang')
                    marker = ('· обязательно' if field in required else '· необязательно') if lang == 'ru' else ('· required' if field in required else '· optional')
                    self.assertEqual(self.page.locator(f'#{field}Requirement').inner_text(), marker)

    def apply_template(self, subject, body):
        self.choose('custom')
        self.page.locator('#templateSubject').fill(subject)
        self.page.locator('#templateBody').fill(body)
        self.page.locator('#saveTemplate').click()
        self.assertEqual(self.page.locator('#templateSubject').input_value(), subject)

    def test_default_templates_show_only_referenced_optional_fields(self):
        for key in self.page.evaluate('Object.keys(FLEX_CLAIMER_DATA.templates)'):
            with self.subTest(template=key):
                self.choose(key)
                visible = ['name'] if key == 'accountPause' else ['date', 'start']
                if key == 'overtime':
                    visible.append('end')
                self.fields_are(visible, [] if key == 'accountPause' else ['date'])

    def test_apply_reload_and_reset_update_fields(self):
        self.apply_template('Station {{station}}', '{{#if details}}More information provided.{{/if}}')
        self.fields_are(['station', 'details'])
        self.page.reload()
        self.choose('custom')
        self.fields_are(['station', 'details'])
        self.apply_template('General request', 'Hello support.')
        self.fields_are([])
        self.page.locator('#resetTemplate').click()
        self.fields_are(['date', 'start'], ['date'])

    def test_hidden_values_are_preserved_but_excluded_from_the_email(self):
        self.apply_template('{{name}} {{station}}', '{{block}}\n{{details}}')
        self.fields_are(FIELDS)
        values = {'date': '2026-10-01', 'start': '09:00', 'end': '13:00', 'station': 'TEST-STATION',
                  'name': 'Test Driver', 'details': 'Private delivery details'}
        for field, value in values.items():
            self.page.locator(f'#{field}').fill(value)
        self.choose('accountPause')
        self.fields_are(['name'])
        body = self.page.locator('#body').input_value()
        self.assertIn('Test Driver', body)
        for value in ['October 1, 2026', 'TEST-STATION', 'Private delivery details', '9:00 AM', '1:00 PM']:
            self.assertNotIn(value, body)
        for field, value in values.items():
            self.assertEqual(self.page.locator(f'#{field}').input_value(), value)
        self.choose('custom')
        self.fields_are(FIELDS)
        for field, value in values.items():
            self.assertEqual(self.page.locator(f'#{field}').input_value(), value)
        self.assertIn('Private delivery details', self.page.locator('#body').input_value())
        self.assertIn('TEST-STATION', self.page.locator('#subject').input_value())

    def test_switching_templates_updates_fields_with_a_manually_edited_draft(self):
        self.choose('accountPause')
        self.page.locator('#name').fill('Saved Driver')
        self.page.locator('#body').fill('My manual draft')
        self.choose('custom')
        self.fields_are(['date', 'start'], ['date'])
        self.assertEqual(self.page.locator('#body').input_value(), 'My manual draft')
        self.assertTrue(self.page.locator('#pendingNotice').is_visible())
        self.page.locator('#regenerate').click()
        self.assertNotIn('Saved Driver', self.page.locator('#body').input_value())
        self.assertEqual(self.page.locator('#name').input_value(), 'Saved Driver')

    def test_conditions_show_fields_but_template_comments_do_not(self):
        self.apply_template('{{!-- {{block}} --}}Request {{#if station}}station{{/if}}',
                            '{{#unless name}}Anonymous{{else}}{{details}}{{/unless}}')
        self.fields_are(['station', 'name', 'details'])
        self.assertFalse(self.page.locator('#start').locator('xpath=../..').is_visible())

    def test_single_time_field_uses_the_full_row_and_empty_row_is_hidden(self):
        self.apply_template('Request', 'Start: {{start}}')
        self.fields_are(['start'])
        field = self.page.locator('#start').locator('xpath=../..')
        row = field.locator('xpath=..')
        self.assertAlmostEqual(field.bounding_box()['width'], row.bounding_box()['width'], delta=1)
        self.apply_template('Request', 'End: {{end}}')
        self.fields_are(['end'])
        self.apply_template('Request', 'No times needed.')
        self.assertFalse(row.is_visible())

    def test_block_shows_both_times_and_renders_their_values(self):
        self.apply_template('Request for {{date}}', 'Block: {{block}}')
        self.fields_are(['date', 'start', 'end'])
        self.page.locator('#start').fill('21:00')
        self.page.locator('#end').fill('01:00')
        body = self.page.locator('#body').input_value()
        self.assertIn('October 1, 2026, 9:00 PM–1:00 AM (ending the following day)', body)

    def test_russian_mobile_form_hides_unused_labels_and_fits_the_screen(self):
        self.page.set_viewport_size({'width': 375, 'height': 812})
        self.page.locator('#language').select_option('ru')
        self.choose('accountPause')
        self.fields_are(['name'])
        self.assertFalse(self.page.get_by_text('Станция', exact=True).is_visible())
        self.assertEqual(self.page.locator('html').get_attribute('lang'), 'ru')
        self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))


    def mailto(self):
        return self.page.evaluate('window.testMailto || null')

    def test_date_is_optional_or_required_per_template(self):
        self.apply_template('Request for {{date}}', 'Hello support.')
        self.fields_are(['date'])
        self.page.locator('#date').fill('')
        self.page.locator('#createEmail').click()
        self.assertIsNotNone(self.mailto())
        self.assertNotIn('%5Bblock%20date%5D', self.mailto())
        self.apply_template('Request for {{req:date}}', 'Hello support.')
        self.fields_are(['date'], ['date'])
        self.page.evaluate('window.testMailto = null')
        self.page.locator('#createEmail').click()
        self.assertIsNone(self.mailto())
        self.page.locator('#date').fill('2026-10-01')
        self.page.locator('#createEmail').click()
        self.assertIsNotNone(self.mailto())
        self.assertNotIn('req%3A', self.mailto())

    def test_template_without_date_can_create_an_email_and_keeps_the_hidden_date(self):
        self.choose('accountPause')
        self.fields_are(['name'])
        self.assertEqual(self.page.locator('#date').input_value(), '2026-10-01')
        self.page.locator('#createEmail').click()
        self.assertIsNotNone(self.mailto())
        self.assertNotIn('October%201', self.mailto())

    def test_required_block_checks_date_and_both_times(self):
        self.apply_template('Request', 'Block: {{req:block}}')
        self.fields_are(['date', 'start', 'end'], ['date', 'start', 'end'])
        self.page.locator('#date').fill('')
        for field, value in [('date', '2026-10-01'), ('start', '09:00'), ('end', '13:00')]:
            self.page.locator('#createEmail').click()
            self.assertIsNone(self.mailto())
            self.page.locator(f'#{field}').fill(value)
        self.page.locator('#createEmail').click()
        self.assertIsNotNone(self.mailto())
        self.assertIn('9%3A00%20AM', self.mailto())

    def test_each_required_field_rejects_empty_or_whitespace_values(self):
        values = {'date': '2026-10-01', 'start': '09:00', 'end': '13:00',
                  'station': 'TEST1', 'name': 'Test Driver', 'details': 'Delivery details'}
        for field, value in values.items():
            with self.subTest(field=field):
                self.apply_template('Request', 'Hello {{req:' + field + '}}')
                self.fields_are([field], [field])
                self.page.locator(f'#{field}').fill('' if field in ['date', 'start', 'end'] else '   ')
                self.page.evaluate('window.testMailto = null')
                self.page.locator('#createEmail').click()
                self.assertIsNone(self.mailto())
                self.page.locator(f'#{field}').fill(value)
                self.page.locator('#createEmail').click()
                self.assertIsNotNone(self.mailto())

    def test_required_markers_persist_and_reset_with_the_template(self):
        self.apply_template('{{date}}', '{{req:station}}')
        self.fields_are(['date', 'station'], ['station'])
        self.page.reload()
        self.choose('custom')
        self.fields_are(['date', 'station'], ['station'])
        self.page.locator('#language').select_option('ru')
        self.fields_are(['date', 'station'], ['station'])
        self.page.locator('#resetTemplate').click()
        self.fields_are(['date', 'start'], ['date'])

    def test_required_interpolation_does_not_duplicate_appended_fields(self):
        self.apply_template('Request', '{{req:station}}\n{{req:name}}\n{{req:details}}')
        self.fields_are(['station', 'name', 'details'], ['station', 'name', 'details'])
        for field, value in [('station', 'TEST1'), ('name', 'Test Driver'), ('details', 'Delivery details')]:
            self.page.locator(f'#{field}').fill(value)
        body = self.page.locator('#body').input_value()
        for value in ['TEST1', 'Test Driver', 'Delivery details']:
            self.assertEqual(body.count(value), 1)

    def test_required_condition_parameter_shows_and_requires_its_field(self):
        self.apply_template('Request', '{{#if req:station}}Known station.{{else}}Unknown station.{{/if}}')
        self.fields_are(['station'], ['station'])
        self.page.locator('#createEmail').click()
        self.assertIsNone(self.mailto())
        self.page.locator('#station').fill('TEST1')
        self.page.locator('#createEmail').click()
        self.assertIsNotNone(self.mailto())

    def test_removing_a_required_marker_clears_the_previous_validation_error(self):
        self.apply_template('Request', 'Hello {{req:station}}')
        self.page.locator('#station').fill('   ')
        self.page.locator('#createEmail').click()
        self.assertIsNone(self.mailto())
        self.apply_template('Request', 'Hello {{station}}')
        self.fields_are(['station'])
        self.page.locator('#createEmail').click()
        self.assertIsNotNone(self.mailto())
        self.page.evaluate('window.testMailto = null')
        self.choose('accountPause')
        self.fields_are(['name'])
        self.page.locator('#createEmail').click()
        self.assertIsNotNone(self.mailto())

    def test_optional_block_without_date_has_no_placeholder_or_leading_comma(self):
        self.apply_template('Request', '{{block}}')
        self.fields_are(['date', 'start', 'end'])
        self.page.locator('#date').fill('')
        self.page.locator('#start').fill('09:00')
        self.assertTrue(self.page.locator('#body').input_value().startswith('9:00 AM'))
        self.page.locator('#end').fill('13:00')
        self.assertTrue(self.page.locator('#body').input_value().startswith('9:00 AM–1:00 PM'))
        self.page.locator('#start').fill('')
        self.assertTrue(self.page.locator('#body').input_value().startswith('(ending at 1:00 PM)'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
