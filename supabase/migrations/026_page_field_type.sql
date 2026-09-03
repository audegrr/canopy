-- Add 'page' to the allowed db_fields.type values, for the new page-link
-- field type (links a record to any workspace page, not just other
-- database records like 'relation' does). Same shape as
-- 025_person_field_type.sql.
alter table db_fields drop constraint if exists db_fields_type_check;
alter table db_fields add constraint db_fields_type_check
  check (type in ('text','number','currency','select','multiselect','date','checkbox','relation','rollup','url','email','phone','person','page'));
