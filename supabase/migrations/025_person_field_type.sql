-- Add 'person' to the allowed db_fields.type values, for the new assignee
-- field type. Without this, inserting a person field fails with a 23514
-- check violation (same shape as 021_currency_field_type.sql).
alter table db_fields drop constraint if exists db_fields_type_check;
alter table db_fields add constraint db_fields_type_check
  check (type in ('text','number','currency','select','multiselect','date','checkbox','relation','rollup','url','email','phone','person'));
