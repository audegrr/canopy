-- notifications table was created ad hoc (not tracked in migrations) and is
-- missing a DELETE policy, so per-notification/clear-all deletes silently
-- fail under RLS and rows reappear on reload.
create policy "Users can delete own notifications"
  on public.notifications for delete
  using (auth.uid() = user_id);
