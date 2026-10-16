"""Browser regression checks; build dist/index.html before running this file."""
import json
import re
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

    def copy_action(self, action):
        toggle = self.page.locator('#copyMenu > summary')
        self.assertEqual(toggle.count(), 1)
        toggle.click()
        self.page.locator(f'#{action}').click()

    def test_default_templates_show_only_referenced_optional_fields(self):
        for key in self.page.evaluate('Object.keys(FLEX_CLAIMER_DATA.templates)'):
            with self.subTest(template=key):
                self.choose(key)
                visible = ['name'] if key == 'accountPause' else ['date', 'start']
                if key == 'overtime':
                    visible.append('end')
                if key == 'forgotCompletion':
                    visible.append('details')
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


    def custom_field(self, name):
        return self.page.locator('#customFields').get_by_label(re.compile(r'^' + re.escape(name) + r'\s+·\s*(?:optional|required|необязательно|обязательно)$'))

    def custom_fields_are(self, expected, required=()):
        self.assertEqual(self.page.locator('#customFields input:visible').count(), len(expected))
        for name in expected:
            with self.subTest(custom_field=name):
                field = self.custom_field(name)
                self.assertEqual(field.count(), 1)
                self.assertTrue(field.is_visible())
                self.assertFalse(field.is_disabled())
                self.assertEqual(field.get_attribute('type'), 'text')
                self.assertEqual(field.evaluate('el => el.required'), name in required)

    def test_custom_variable_creates_one_text_field_after_applying_the_template(self):
        self.page.locator('#templateSubject').fill('Request for {{weekday}}')
        self.page.locator('#templateBody').fill('Day: {{weekday}}. Again: {{weekday}}.')
        self.assertEqual(self.custom_field('weekday').count(), 0)
        self.page.locator('#saveTemplate').click()
        self.custom_fields_are(['weekday'])
        self.custom_field('weekday').fill('Tuesday')
        self.assertEqual(self.page.locator('#subject').input_value(), 'Request for Tuesday')
        self.assertEqual(self.page.locator('#body').input_value().count('Tuesday'), 2)
        self.assertNotIn('{{weekday}}', self.page.locator('#body').input_value())

    def test_required_custom_field_checks_whitespace_and_becomes_optional(self):
        self.apply_template('Request', 'Day: {{req:weekday}}')
        self.custom_fields_are(['weekday'], ['weekday'])
        self.custom_field('weekday').fill('   ')
        self.page.locator('#createEmail').click()
        self.assertIsNone(self.mailto())
        self.custom_field('weekday').fill('Tuesday')
        self.page.locator('#createEmail').click()
        self.assertIsNotNone(self.mailto())
        self.assertIn('Tuesday', self.mailto())
        self.apply_template('Request', 'Day: {{weekday}}')
        self.custom_fields_are(['weekday'])
        self.custom_field('weekday').fill('')
        self.page.evaluate('window.testMailto = null')
        self.page.locator('#createEmail').click()
        self.assertIsNotNone(self.mailto())

    def test_custom_values_survive_switching_removal_and_readding_the_variable(self):
        self.apply_template('Request', 'Day: {{req:weekday}}')
        self.custom_field('weekday').fill('Monday')
        self.choose('accountPause')
        self.custom_fields_are([])
        self.assertFalse(self.custom_field('weekday').is_visible())
        self.assertTrue(self.custom_field('weekday').is_disabled())
        self.assertNotIn('Monday', self.page.locator('#body').input_value())
        self.choose('custom')
        self.custom_fields_are(['weekday'], ['weekday'])
        self.assertEqual(self.custom_field('weekday').input_value(), 'Monday')
        self.apply_template('Request', 'No custom fields.')
        self.custom_fields_are([])
        self.page.locator('#createEmail').click()
        self.assertIsNotNone(self.mailto())
        self.assertNotIn('Monday', self.mailto())
        self.apply_template('Request', 'Day: {{weekday}}')
        self.assertEqual(self.custom_field('weekday').input_value(), 'Monday')
        self.assertIn('Monday', self.page.locator('#body').input_value())

    def test_saved_template_recreates_custom_fields_after_reload_and_reset_hides_them(self):
        self.apply_template('Route {{req:route_id}}', 'Day: {{weekday}}')
        self.custom_fields_are(['route_id', 'weekday'], ['route_id'])
        self.page.reload()
        self.choose('custom')
        self.custom_fields_are(['route_id', 'weekday'], ['route_id'])
        self.page.locator('#resetTemplate').click()
        self.custom_fields_are([])
        self.fields_are(['date', 'start'], ['date'])

    def test_custom_conditions_activate_fields_and_comments_do_not(self):
        self.apply_template('{{!-- {{req:ignored}} --}}Request',
                            '{{#if weekday}}Day set.{{else}}No day.{{/if}} {{#unless req:route_id}}No route.{{/unless}}')
        self.custom_fields_are(['weekday', 'route_id'], ['route_id'])
        self.assertEqual(self.custom_field('ignored').count(), 0)
        self.assertIn('No day.', self.page.locator('#body').input_value())
        self.custom_field('weekday').fill('Tuesday')
        self.custom_field('route_id').fill('ROUTE1')
        body = self.page.locator('#body').input_value()
        self.assertIn('Day set.', body)
        self.assertNotIn('No route.', body)
        self.assertNotIn('Tuesday', body)
        self.assertNotIn('ROUTE1', body)

    def test_custom_field_names_do_not_replace_existing_form_controls(self):
        self.apply_template('Request {{req:subject}}', '{{type}} {{body}} {{language}}')
        self.custom_fields_are(['subject', 'type', 'body', 'language'], ['subject'])
        for name, value in [('subject', 'SUBJECT1'), ('type', 'TYPE1'), ('body', 'BODY1'), ('language', 'LANGUAGE1')]:
            self.custom_field(name).fill(value)
        self.assertEqual(self.page.locator('#type').input_value(), 'custom')
        self.assertEqual(self.page.locator('#language').input_value(), 'en')
        self.assertEqual(self.page.locator('#subject').input_value(), 'Request SUBJECT1')
        self.assertIn('TYPE1 BODY1 LANGUAGE1', self.page.locator('#body').input_value())
        for name in ['type', 'subject', 'body', 'language']:
            self.assertEqual(self.page.locator(f'#{name}').count(), 1)

    def test_custom_fields_preserve_standard_control_types_and_translate_their_markers(self):
        self.apply_template('Request {{date}}', '{{start}} {{details}} {{req:weekday}}')
        self.fields_are(['date', 'start', 'details'])
        self.custom_fields_are(['weekday'], ['weekday'])
        self.assertEqual(self.page.locator('#date').get_attribute('type'), 'date')
        self.assertEqual(self.page.locator('#start').get_attribute('type'), 'time')
        self.assertEqual(self.page.locator('#details').evaluate('el => el.tagName'), 'TEXTAREA')
        self.page.set_viewport_size({'width': 375, 'height': 812})
        self.page.locator('#language').select_option('ru')
        label = self.page.locator('#customFields label').inner_text()
        self.assertIn('weekday', label)
        self.assertIn('· обязательно', label)
        self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))

    def test_custom_fields_update_without_overwriting_a_manual_draft(self):
        self.apply_template('Request', 'Day: {{weekday}}')
        self.custom_field('weekday').fill('Monday')
        self.page.locator('#body').fill('My manual draft')
        self.choose('accountPause')
        self.custom_fields_are([])
        self.assertEqual(self.page.locator('#body').input_value(), 'My manual draft')
        self.page.locator('#regenerate').click()
        self.assertNotIn('Monday', self.page.locator('#body').input_value())
        self.choose('custom')
        self.assertEqual(self.custom_field('weekday').input_value(), 'Monday')
        self.assertIn('Monday', self.page.locator('#body').input_value())


    def test_long_custom_field_labels_wrap_on_mobile(self):
        name = 'long_' * 30 + 'field'
        self.page.set_viewport_size({'width': 375, 'height': 812})
        self.apply_template('Request', '{{' + name + '}}')
        self.custom_fields_are([name])
        self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))


    def test_custom_field_names_do_not_collide_with_requirement_marker_ids(self):
        self.apply_template('Day {{weekday}}', 'Note: {{req:weekdayRequirement}}')
        self.assertEqual(self.custom_field('weekdayRequirement').count(), 1)
        self.custom_fields_are(['weekday', 'weekdayRequirement'], ['weekdayRequirement'])
        self.custom_field('weekday').fill('Tuesday')
        self.custom_field('weekdayRequirement').fill('Extra note')
        self.assertEqual(self.page.locator('#subject').input_value(), 'Day Tuesday')
        self.assertIn('Extra note', self.page.locator('#body').input_value())
        ids = self.page.locator('[id]').evaluate_all('elements => elements.map(el => el.id)')
        self.assertEqual(len(ids), len(set(ids)))


    def test_default_custom_value_prefills_the_input_and_email(self):
        self.apply_template('Day {{weekday "Monday"}}', 'Day: {{weekday}}')
        self.custom_fields_are(['weekday'])
        self.assertEqual(self.custom_field('weekday').input_value(), 'Monday')
        self.assertEqual(self.page.locator('#subject').input_value(), 'Day Monday')
        self.assertIn('Day: Monday', self.page.locator('#body').input_value())
        self.page.locator('#createEmail').click()
        self.assertIsNotNone(self.mailto())

    def test_default_value_satisfies_required_fields_and_manual_clear_stays_empty(self):
        self.apply_template('Request', 'Day {{req:weekday "Monday"}}')
        self.custom_fields_are(['weekday'], ['weekday'])
        self.page.locator('#createEmail').click()
        self.assertIsNotNone(self.mailto())
        self.custom_field('weekday').fill('')
        self.page.evaluate('window.testMailto = null')
        self.page.locator('#createEmail').click()
        self.assertIsNone(self.mailto())
        self.assertEqual(self.custom_field('weekday').input_value(), '')
        self.choose('accountPause')
        self.choose('custom')
        self.assertEqual(self.custom_field('weekday').input_value(), '')
        self.apply_template('Request', 'Day {{weekday "Tuesday"}}')
        self.assertEqual(self.custom_field('weekday').input_value(), '')
        self.page.locator('#createEmail').click()
        self.assertIsNotNone(self.mailto())

    def test_manual_values_have_priority_over_changed_defaults(self):
        self.apply_template('Request', 'Day {{weekday "Monday"}}')
        self.custom_field('weekday').fill('Wednesday')
        self.apply_template('Request', 'Day {{weekday "Tuesday"}}')
        self.assertEqual(self.custom_field('weekday').input_value(), 'Wednesday')
        self.choose('accountPause')
        self.choose('custom')
        self.assertEqual(self.custom_field('weekday').input_value(), 'Wednesday')

    def test_untouched_values_follow_template_defaults_and_reload(self):
        self.apply_template('Request', 'Day {{weekday "Monday"}}')
        self.assertEqual(self.custom_field('weekday').input_value(), 'Monday')
        self.apply_template('Request', 'Day {{weekday "Tuesday"}}')
        self.assertEqual(self.custom_field('weekday').input_value(), 'Tuesday')
        self.apply_template('Request', 'Day {{weekday}}')
        self.assertEqual(self.custom_field('weekday').input_value(), '')
        self.apply_template('Request', 'Day {{weekday "Thursday"}}')
        self.page.reload()
        self.choose('custom')
        self.assertEqual(self.custom_field('weekday').input_value(), 'Thursday')

    def test_native_date_and_time_defaults_use_input_formats_and_render_formatted_values(self):
        self.page.goto(URL)
        self.apply_template('Date {{req:date "2026-10-13"}}', '{{start "09:00"}} {{end "13:00"}} {{block}}')
        self.fields_are(['date', 'start', 'end'], ['date'])
        self.assertEqual(self.page.locator('#date').input_value(), '2026-10-13')
        self.assertEqual(self.page.locator('#start').input_value(), '09:00')
        self.assertEqual(self.page.locator('#end').input_value(), '13:00')
        self.assertIn('October 13, 2026', self.page.locator('#subject').input_value())
        self.assertIn('9:00 AM–1:00 PM', self.page.locator('#body').input_value())

    def test_default_standard_text_values_are_not_appended_twice(self):
        self.apply_template('Request', '{{req:station "DAX5"}} {{name "Test Driver"}} {{details "Extra details"}}')
        self.fields_are(['station', 'name', 'details'], ['station'])
        body = self.page.locator('#body').input_value()
        for value in ['DAX5', 'Test Driver', 'Extra details']:
            self.assertEqual(body.count(value), 1)

    def test_default_name_does_not_become_a_manual_preference(self):
        self.apply_template('Request', '{{name "Default One"}}')
        self.assertEqual(self.page.locator('#name').input_value(), 'Default One')
        self.page.locator('#language').select_option('ru')
        self.page.reload()
        self.choose('custom')
        self.apply_template('Request', '{{name "Default Two"}}')
        self.assertEqual(self.page.locator('#name').input_value(), 'Default Two')

    def test_persisted_manual_name_wins_over_a_default(self):
        self.choose('accountPause')
        self.page.locator('#name').fill('My Name')
        self.page.locator('#name').blur()
        self.page.reload()
        self.apply_template('Request', '{{name "Template Name"}}')
        self.assertEqual(self.page.locator('#name').input_value(), 'My Name')

    def test_clearing_default_start_removes_the_subject_comma(self):
        self.apply_template('Request {{date}}, {{start "09:00"}}', 'Hello support.')
        self.assertEqual(self.page.locator('#subject').input_value(), 'Request October 1, 2026, 9:00 AM')
        self.page.locator('#start').fill('')
        self.assertEqual(self.page.locator('#subject').input_value(), 'Request October 1, 2026')
        self.page.locator('#body').fill('Manual draft')
        self.page.locator('#date').fill('2026-10-02')
        self.assertTrue(self.page.locator('#pendingNotice').is_visible())
        self.page.locator('#regenerate').click()
        self.assertEqual(self.page.locator('#start').input_value(), '')
        self.assertEqual(self.page.locator('#subject').input_value(), 'Request October 2, 2026')

    def test_copy_one_line_produces_a_json_string_without_changing_the_draft(self):
        self.page.evaluate('''Object.defineProperty(navigator, 'clipboard', {
          configurable: true, value: {writeText: async text => {window.testCopied = text;}}
        });''')
        self.page.locator('#body').fill('First "quoted" line\\folder\nSecond\tline\nРусский 😀\u2028Next\u2029End')
        body = self.page.locator('#body').input_value()
        button = self.page.locator('#copyOneLine')
        self.assertEqual(button.count(), 1)
        self.copy_action('copyOneLine')
        copied = self.page.evaluate('window.testCopied')
        self.assertEqual(json.loads(copied), body)
        self.assertFalse(any(char in copied for char in '\n\r\u2028\u2029'))
        self.assertEqual(self.page.locator('#body').input_value(), body)
        self.assertIn('JSON', self.page.locator('#actionStatus').inner_text())

    def test_regular_copy_keeps_the_original_multiline_text(self):
        self.page.evaluate('''Object.defineProperty(navigator, 'clipboard', {
          configurable: true, value: {writeText: async text => {window.testCopied = text;}}
        });''')
        self.page.locator('#body').fill('First "quoted" line\nSecond line\\folder')
        body = self.page.locator('#body').input_value()
        self.copy_action('copy')
        self.assertEqual(self.page.evaluate('window.testCopied'), body)
        self.assertEqual(self.page.locator('#actionStatus').inner_text(), 'Email body copied.')

    def test_copy_one_line_falls_back_to_copying_the_serialized_text(self):
        self.page.evaluate('''Object.defineProperty(navigator, 'clipboard', {
          configurable: true, value: {writeText: async () => {throw new Error('Denied');}}
        });
        document.execCommand = command => {
          if (command !== 'copy') return false;
          window.testCopied = document.activeElement.value;
          return true;
        };''')
        self.page.locator('#body').fill('First "quoted" line\nSecond line')
        body = self.page.locator('#body').input_value()
        button = self.page.locator('#copyOneLine')
        self.assertEqual(button.count(), 1)
        self.copy_action('copyOneLine')
        self.assertEqual(json.loads(self.page.evaluate('window.testCopied')), body)
        self.assertIn('JSON', self.page.locator('#actionStatus').inner_text())

    def test_copy_one_line_offers_the_json_string_when_both_clipboard_methods_fail(self):
        self.page.evaluate('''Object.defineProperty(navigator, 'clipboard', {
          configurable: true, value: {writeText: async () => {throw new Error('Denied');}}
        });
        document.execCommand = () => false;
        window.prompt = (message, text) => {window.testPromptText = text; return null;};''')
        self.page.locator('#body').fill('First "quoted" line\nSecond line')
        body = self.page.locator('#body').input_value()
        button = self.page.locator('#copyOneLine')
        self.assertEqual(button.count(), 1)
        self.copy_action('copyOneLine')
        self.assertEqual(json.loads(self.page.evaluate('window.testPromptText')), body)
        self.assertEqual(self.page.locator('#body').input_value(), body)
        self.assertNotIn('copied', self.page.locator('#actionStatus').inner_text())

    def test_copy_one_line_checks_required_fields_before_copying(self):
        self.page.evaluate('''Object.defineProperty(navigator, 'clipboard', {
          configurable: true, value: {writeText: async text => {window.testCopied = text;}}
        });''')
        self.page.locator('#date').fill('')
        button = self.page.locator('#copyOneLine')
        self.assertEqual(button.count(), 1)
        self.copy_action('copyOneLine')
        self.assertIsNone(self.page.evaluate('window.testCopied'))
        self.assertFalse(self.page.locator('#date').evaluate('el => el.checkValidity()'))

    def test_copy_one_line_is_translated_and_fits_narrow_layouts(self):
        self.page.locator('#language').select_option('ru')
        button = self.page.locator('#copyOneLine')
        self.assertEqual(button.count(), 1)
        toggle = self.page.locator('#copyMenu > summary')
        self.assertEqual(toggle.count(), 1)
        self.assertEqual(toggle.inner_text(), 'Копировать')
        for width in [900, 375]:
            with self.subTest(width=width):
                self.page.set_viewport_size({'width': width, 'height': 900})
                self.assertFalse(button.is_visible())
                toggle.click()
                self.assertTrue(button.is_visible())
                self.assertEqual(button.inner_text(), 'Копировать одной строкой')
                self.assertEqual(self.page.locator('#copyJson').inner_text(), 'Копировать как JSON-объект')
                self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
                self.page.keyboard.press('Escape')

    def test_copy_json_object_exports_selected_recipients_and_the_current_draft(self):
        self.page.evaluate('''Object.defineProperty(navigator, 'clipboard', {
          configurable: true, value: {writeText: async text => {window.testCopied = text;}}
        });''')
        self.page.locator('#sendJeff').check()
        self.page.locator('#sendCustom').check()
        self.page.locator('#emailCustom').fill('driver@example.com')
        self.page.locator('#subject').fill('Review "late" delivery — русский')
        self.page.locator('#body').fill('First "quoted" line\\folder\nSecond\tline 😀')
        subject = self.page.locator('#subject').input_value()
        body = self.page.locator('#body').input_value()
        self.copy_action('copyJson')
        copied = json.loads(self.page.evaluate('window.testCopied'))
        self.assertEqual(copied, {
            'to': [self.page.locator('#emailSupport').input_value(), self.page.locator('#emailJeff').input_value(), 'driver@example.com'],
            'subject': subject, 'body': body,
        })
        self.assertEqual(self.page.locator('#subject').input_value(), subject)
        self.assertEqual(self.page.locator('#body').input_value(), body)
        self.assertFalse(self.page.locator('#copyMenu').evaluate('el => el.open'))
        self.assertEqual(self.page.locator('#actionStatus').inner_text(), 'Email copied as a JSON object.')

    def test_copy_json_object_omits_unselected_and_duplicate_recipients(self):
        self.page.evaluate('''Object.defineProperty(navigator, 'clipboard', {
          configurable: true, value: {writeText: async text => {window.testCopied = text;}}
        });''')
        self.page.locator('#sendCustom').check()
        address = self.page.locator('#emailSupport').input_value()
        self.page.locator('#emailCustom').fill(address.upper())
        self.copy_action('copyJson')
        self.assertEqual(json.loads(self.page.evaluate('window.testCopied'))['to'], [address])
        self.page.locator('#sendSupport').uncheck()
        self.page.locator('#emailCustom').fill('only@example.com')
        self.copy_action('copyJson')
        self.assertEqual(json.loads(self.page.evaluate('window.testCopied'))['to'], ['only@example.com'])

    def test_copy_json_object_requires_selected_valid_recipients(self):
        self.page.evaluate('''Object.defineProperty(navigator, 'clipboard', {
          configurable: true, value: {writeText: async text => {window.testCopied = text;}}
        });''')
        self.page.locator('#sendSupport').uncheck()
        self.copy_action('copyJson')
        self.assertIsNone(self.page.evaluate('window.testCopied'))
        self.assertEqual(self.page.locator('#error').inner_text(), 'Select an email recipient.')
        self.page.locator('#sendCustom').check()
        for address in ['', 'not-an-address']:
            with self.subTest(address=address):
                self.page.locator('#emailCustom').fill(address)
                self.copy_action('copyJson')
                self.assertIsNone(self.page.evaluate('window.testCopied'))
                self.assertFalse(self.page.locator('#emailCustom').evaluate('el => el.checkValidity()'))

    def test_copy_json_object_fallback_copies_the_complete_object(self):
        self.page.evaluate('''Object.defineProperty(navigator, 'clipboard', {configurable: true, value: undefined});
        document.execCommand = () => {window.testCopied = document.activeElement.value; return true;};''')
        self.copy_action('copyJson')
        copied = json.loads(self.page.evaluate('window.testCopied'))
        self.assertEqual(copied['to'], [self.page.locator('#emailSupport').input_value()])
        self.assertEqual(copied['subject'], self.page.locator('#subject').input_value())
        self.assertEqual(copied['body'], self.page.locator('#body').input_value())

    def test_copy_json_object_manual_fallback_offers_the_complete_object(self):
        self.page.evaluate('''Object.defineProperty(navigator, 'clipboard', {configurable: true, value: undefined});
        document.execCommand = () => false;
        window.prompt = (message, text) => {window.testPromptText = text; return null;};''')
        self.copy_action('copyJson')
        copied = json.loads(self.page.evaluate('window.testPromptText'))
        self.assertEqual(copied['body'], self.page.locator('#body').input_value())
        self.assertEqual(copied['to'], [self.page.locator('#emailSupport').input_value()])
        self.assertNotIn('copied', self.page.locator('#actionStatus').inner_text())

    def test_copy_menu_supports_keyboard_and_dismissal(self):
        toggle = self.page.locator('#copyMenu > summary')
        self.assertEqual(toggle.count(), 1)
        self.assertFalse(self.page.locator('#copyOneLine').is_visible())
        self.assertFalse(self.page.locator('#copyJson').is_visible())
        toggle.focus()
        toggle.press('Enter')
        self.assertTrue(self.page.locator('#copyJson').is_visible())
        toggle.press('Tab')
        self.assertTrue(self.page.locator('#copy').evaluate('el => el === document.activeElement'))
        self.page.keyboard.press('Escape')
        self.assertFalse(self.page.locator('#copyJson').is_visible())
        self.assertTrue(toggle.evaluate('el => el === document.activeElement'))
        toggle.press('Space')
        self.assertTrue(self.page.locator('#copyJson').is_visible())
        for _ in range(4):
            self.page.keyboard.press('Tab')
        self.assertTrue(self.page.locator('.help > summary').evaluate('el => el === document.activeElement'))
        self.page.keyboard.press('Escape')
        self.assertFalse(self.page.locator('#copyJson').is_visible())
        self.assertTrue(toggle.evaluate('el => el === document.activeElement'))
        toggle.press('Enter')
        self.page.locator('#emailHeading').click()
        self.assertFalse(self.page.locator('#copyJson').is_visible())

    def test_conflicting_defaults_are_rejected_without_changing_the_active_template(self):
        self.apply_template('Day {{weekday "Monday"}}', 'Day {{weekday}}')
        self.page.locator('#templateSubject').fill('Day {{weekday "Tuesday"}}')
        self.page.locator('#templateBody').fill('Day {{weekday "Wednesday"}}')
        self.page.locator('#saveTemplate').click()
        self.assertIn('Conflicting default', self.page.locator('#templateStatus').inner_text())
        self.assertEqual(self.custom_field('weekday').input_value(), 'Monday')
        self.page.reload()
        self.choose('custom')
        self.assertEqual(self.custom_field('weekday').input_value(), 'Monday')


if __name__ == '__main__':
    unittest.main(verbosity=2)
