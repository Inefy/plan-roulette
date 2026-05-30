-- supabase/migrations/20260530050000_add_performance_indexes.sql
create index if not exists plan_options_room_active_created_at_idx
on public.plan_options(room_id, is_active, created_at);

create index if not exists plan_participants_user_joined_at_idx
on public.plan_participants(user_id, joined_at desc, room_id);

create index if not exists plan_votes_room_option_value_idx
on public.plan_votes(room_id, option_id, value);

create index if not exists plan_votes_room_participant_idx
on public.plan_votes(room_id, participant_id);

create index if not exists saved_rooms_user_updated_at_idx
on public.saved_rooms(user_id, updated_at desc, room_id);
