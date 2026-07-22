-- Add 'currency' to the allowed db_fields.type values. Inserts of currency
-- fields were silently failing (23514 check violation) because the app
-- added the Currency field type without updating this constraint.
alter table db_fields drop constraint if exists db_fields_type_check;
alter table db_fields add constraint db_fields_type_check
  check (type in ('text','number','currency','select','multiselect','date','checkbox','relation','rollup','url','email','phone'));
