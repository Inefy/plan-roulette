-- supabase/migrations/20260530040000_create_core_schema.sql
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_empty check (length(trim(display_name)) > 0)
);

create table public.plan_rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'draft',
  decision_mode text not null default 'consensus',
  host_user_id uuid not null references public.profiles(id) on delete cascade,
  invite_token text not null,
  budget_tier text not null,
  energy_level text not null,
  location_mode text not null,
  weather_mode text not null,
  planning_effort text not null,
  category_preferences text[] not null default '{}',
  starts_at timestamptz,
  ends_at timestamptz,
  location_text text,
  max_distance_km numeric(8, 2),
  max_participants integer,
  selected_option_id uuid,
  itinerary_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_rooms_title_not_empty check (length(trim(title)) > 0),
  constraint plan_rooms_status_check check (status in ('draft', 'inviting', 'voting', 'deciding', 'decided', 'itinerary_ready', 'completed', 'cancelled', 'expired')),
  constraint plan_rooms_decision_mode_check check (decision_mode in ('consensus', 'majority', 'host_pick')),
  constraint plan_rooms_budget_tier_check check (budget_tier in ('free', 'low', 'moderate', 'high', 'splurge')),
  constraint plan_rooms_energy_level_check check (energy_level in ('low', 'medium', 'high')),
  constraint plan_rooms_location_mode_check check (location_mode in ('in_person', 'remote', 'hybrid')),
  constraint plan_rooms_weather_mode_check check (weather_mode in ('indoor', 'outdoor', 'weather_flexible')),
  constraint plan_rooms_planning_effort_check check (planning_effort in ('instant', 'light', 'coordinated')),
  constraint plan_rooms_category_preferences_check check (
    category_preferences <@ array[
      'food',
      'bars',
      'coffee',
      'hike',
      'walk',
      'movie',
      'study',
      'event-ish',
      'cheap',
      'rainy_day',
      'at_home',
      'game_night',
      'shopping',
      'date_idea',
      'wildcard'
    ]::text[]
  ),
  constraint plan_rooms_time_range_check check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint plan_rooms_max_distance_check check (max_distance_km is null or max_distance_km >= 0),
  constraint plan_rooms_max_participants_check check (max_participants is null or max_participants > 0)
);

create table public.plan_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.plan_rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  avatar_url text,
  role text not null default 'guest',
  joined_at timestamptz not null default now(),
  is_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_participants_display_name_not_empty check (length(trim(display_name)) > 0),
  constraint plan_participants_role_check check (role in ('host', 'guest')),
  constraint plan_participants_unique_user_per_room unique (room_id, user_id)
);

create table public.plan_templates (
  id uuid primary key default gen_random_uuid(),
  created_by_user_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  category text not null,
  tags text[] not null default '{}',
  budget_tier text not null,
  min_duration_minutes integer not null,
  max_duration_minutes integer not null,
  energy_level text not null,
  location_mode text not null,
  weather_modes text[] not null default '{}',
  food_modes text[] not null default '{}',
  dietary_flexibility text not null,
  min_group_size integer not null,
  max_group_size integer not null,
  planning_effort text not null,
  age_sensitive boolean not null default false,
  steps text[] not null default '{}',
  backup_plan text not null,
  share_summary text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_templates_title_not_empty check (length(trim(title)) > 0),
  constraint plan_templates_category_check check (category in ('food', 'bars', 'coffee', 'hike', 'walk', 'movie', 'study', 'event-ish', 'cheap', 'rainy_day', 'at_home', 'game_night', 'shopping', 'date_idea', 'wildcard')),
  constraint plan_templates_budget_tier_check check (budget_tier in ('free', 'low', 'moderate', 'high', 'splurge')),
  constraint plan_templates_duration_check check (min_duration_minutes > 0 and max_duration_minutes >= min_duration_minutes),
  constraint plan_templates_energy_level_check check (energy_level in ('low', 'medium', 'high')),
  constraint plan_templates_location_mode_check check (location_mode in ('in_person', 'remote', 'hybrid')),
  constraint plan_templates_weather_modes_check check (weather_modes <@ array['indoor', 'outdoor', 'weather_flexible']::text[]),
  constraint plan_templates_food_modes_check check (food_modes <@ array['none', 'snacks', 'meal', 'dessert', 'drinks', 'cafe', 'takeout', 'bring_your_own']::text[]),
  constraint plan_templates_dietary_flexibility_check check (dietary_flexibility in ('not_food_based', 'easy_to_adapt', 'check_menu_first', 'bring_your_own_friendly')),
  constraint plan_templates_group_size_check check (min_group_size > 0 and max_group_size >= min_group_size),
  constraint plan_templates_planning_effort_check check (planning_effort in ('instant', 'light', 'coordinated')),
  constraint plan_templates_backup_plan_not_empty check (length(trim(backup_plan)) > 0),
  constraint plan_templates_share_summary_not_empty check (length(trim(share_summary)) > 0)
);

create table public.plan_options (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.plan_rooms(id) on delete cascade,
  template_id uuid references public.plan_templates(id) on delete set null,
  suggested_by_participant_id uuid references public.plan_participants(id) on delete set null,
  title text not null,
  description text,
  category text not null,
  tags text[] not null default '{}',
  budget_tier text not null,
  min_duration_minutes integer,
  max_duration_minutes integer,
  energy_level text not null,
  location_mode text not null,
  weather_modes text[] not null default '{}',
  food_modes text[] not null default '{}',
  dietary_flexibility text,
  min_group_size integer,
  max_group_size integer,
  planning_effort text,
  age_sensitive boolean not null default false,
  steps text[] not null default '{}',
  backup_plan text,
  share_summary text,
  location_text text,
  starts_at timestamptz,
  ends_at timestamptz,
  constraint_match_score numeric(8, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_options_title_not_empty check (length(trim(title)) > 0),
  constraint plan_options_category_check check (category in ('food', 'bars', 'coffee', 'hike', 'walk', 'movie', 'study', 'event-ish', 'cheap', 'rainy_day', 'at_home', 'game_night', 'shopping', 'date_idea', 'wildcard')),
  constraint plan_options_budget_tier_check check (budget_tier in ('free', 'low', 'moderate', 'high', 'splurge')),
  constraint plan_options_duration_check check (
    (min_duration_minutes is null and max_duration_minutes is null)
    or (min_duration_minutes is not null and max_duration_minutes is not null and min_duration_minutes > 0 and max_duration_minutes >= min_duration_minutes)
  ),
  constraint plan_options_energy_level_check check (energy_level in ('low', 'medium', 'high')),
  constraint plan_options_location_mode_check check (location_mode in ('in_person', 'remote', 'hybrid')),
  constraint plan_options_weather_modes_check check (weather_modes <@ array['indoor', 'outdoor', 'weather_flexible']::text[]),
  constraint plan_options_food_modes_check check (food_modes <@ array['none', 'snacks', 'meal', 'dessert', 'drinks', 'cafe', 'takeout', 'bring_your_own']::text[]),
  constraint plan_options_dietary_flexibility_check check (dietary_flexibility is null or dietary_flexibility in ('not_food_based', 'easy_to_adapt', 'check_menu_first', 'bring_your_own_friendly')),
  constraint plan_options_group_size_check check (
    (min_group_size is null and max_group_size is null)
    or (min_group_size is not null and max_group_size is not null and min_group_size > 0 and max_group_size >= min_group_size)
  ),
  constraint plan_options_planning_effort_check check (planning_effort is null or planning_effort in ('instant', 'light', 'coordinated')),
  constraint plan_options_time_range_check check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint plan_options_constraint_match_score_check check (constraint_match_score >= 0)
);

alter table public.plan_rooms
  add constraint plan_rooms_selected_option_id_fkey
  foreign key (selected_option_id) references public.plan_options(id) on delete set null;

create table public.plan_votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.plan_rooms(id) on delete cascade,
  option_id uuid not null references public.plan_options(id) on delete cascade,
  participant_id uuid not null references public.plan_participants(id) on delete cascade,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_votes_value_check check (value in ('yes', 'maybe', 'skip', 'no')),
  constraint plan_votes_unique_participant_option unique (participant_id, option_id)
);

create table public.plan_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.plan_rooms(id) on delete cascade,
  decision_mode text not null,
  outcome text not null,
  winning_option_id uuid references public.plan_options(id) on delete set null,
  tied_option_ids uuid[] not null default '{}',
  vote_counts_by_option_id jsonb not null default '{}'::jsonb,
  score_breakdown jsonb not null default '[]'::jsonb,
  no_consensus boolean not null default false,
  reason text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_results_unique_room unique (room_id),
  constraint plan_results_decision_mode_check check (decision_mode in ('consensus', 'majority', 'host_pick')),
  constraint plan_results_outcome_check check (outcome in ('pending', 'winner_selected', 'tie', 'no_consensus')),
  constraint plan_results_vote_counts_object_check check (jsonb_typeof(vote_counts_by_option_id) = 'object'),
  constraint plan_results_score_breakdown_array_check check (jsonb_typeof(score_breakdown) = 'array')
);

create table public.itineraries (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.plan_rooms(id) on delete cascade,
  result_id uuid references public.plan_results(id) on delete set null,
  winning_option_id uuid references public.plan_options(id) on delete set null,
  title text not null,
  summary text not null,
  meeting_time text not null,
  location_text text not null,
  estimated_budget text not null,
  estimated_duration text not null,
  steps text[] not null default '{}',
  backup_plan text not null,
  share_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint itineraries_title_not_empty check (length(trim(title)) > 0),
  constraint itineraries_summary_not_empty check (length(trim(summary)) > 0),
  constraint itineraries_meeting_time_not_empty check (length(trim(meeting_time)) > 0),
  constraint itineraries_location_text_not_empty check (length(trim(location_text)) > 0),
  constraint itineraries_estimated_budget_not_empty check (length(trim(estimated_budget)) > 0),
  constraint itineraries_estimated_duration_not_empty check (length(trim(estimated_duration)) > 0),
  constraint itineraries_backup_plan_not_empty check (length(trim(backup_plan)) > 0),
  constraint itineraries_share_text_not_empty check (length(trim(share_text)) > 0)
);

alter table public.plan_rooms
  add constraint plan_rooms_itinerary_id_fkey
  foreign key (itinerary_id) references public.itineraries(id) on delete set null;

create table public.saved_rooms (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.plan_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_rooms_unique_user_room unique (user_id, room_id)
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid references public.profiles(id) on delete set null,
  room_id uuid references public.plan_rooms(id) on delete set null,
  participant_id uuid references public.plan_participants(id) on delete set null,
  option_id uuid references public.plan_options(id) on delete set null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_events_name_check check (name in (
    'account_upgrade_completed',
    'account_upgrade_started',
    'app_opened',
    'final_plan_shared',
    'invite_opened',
    'invite_shared',
    'itinerary_created',
    'itinerary_viewed',
    'no_consensus',
    'option_added',
    'participant_joined',
    'result_created',
    'room_created',
    'vote_cast',
    'vote_completed',
    'voting_closed',
    'winner_selected',
    'error_shown'
  )),
  constraint analytics_events_properties_object_check check (jsonb_typeof(properties) = 'object')
);

create unique index plan_rooms_invite_token_idx on public.plan_rooms(invite_token);
create index plan_rooms_host_user_id_idx on public.plan_rooms(host_user_id);
create index plan_rooms_selected_option_id_idx on public.plan_rooms(selected_option_id);
create index plan_rooms_itinerary_id_idx on public.plan_rooms(itinerary_id);

create index plan_participants_room_id_idx on public.plan_participants(room_id);
create index plan_participants_user_id_idx on public.plan_participants(user_id);

create index plan_templates_created_by_user_id_idx on public.plan_templates(created_by_user_id);

create index plan_options_room_id_idx on public.plan_options(room_id);
create index plan_options_template_id_idx on public.plan_options(template_id);
create index plan_options_suggested_by_participant_id_idx on public.plan_options(suggested_by_participant_id);

create index plan_votes_room_id_idx on public.plan_votes(room_id);
create index plan_votes_option_id_idx on public.plan_votes(option_id);
create index plan_votes_participant_id_idx on public.plan_votes(participant_id);

create index plan_results_room_id_idx on public.plan_results(room_id);
create index plan_results_winning_option_id_idx on public.plan_results(winning_option_id);

create index itineraries_room_id_idx on public.itineraries(room_id);
create index itineraries_result_id_idx on public.itineraries(result_id);
create index itineraries_winning_option_id_idx on public.itineraries(winning_option_id);

create index saved_rooms_room_id_idx on public.saved_rooms(room_id);
create index saved_rooms_user_id_idx on public.saved_rooms(user_id);

create index analytics_events_user_id_idx on public.analytics_events(user_id);
create index analytics_events_room_id_idx on public.analytics_events(room_id);
create index analytics_events_option_id_idx on public.analytics_events(option_id);
create index analytics_events_participant_id_idx on public.analytics_events(participant_id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger plan_rooms_set_updated_at
before update on public.plan_rooms
for each row execute function public.set_updated_at();

create trigger plan_participants_set_updated_at
before update on public.plan_participants
for each row execute function public.set_updated_at();

create trigger plan_templates_set_updated_at
before update on public.plan_templates
for each row execute function public.set_updated_at();

create trigger plan_options_set_updated_at
before update on public.plan_options
for each row execute function public.set_updated_at();

create trigger plan_votes_set_updated_at
before update on public.plan_votes
for each row execute function public.set_updated_at();

create trigger plan_results_set_updated_at
before update on public.plan_results
for each row execute function public.set_updated_at();

create trigger itineraries_set_updated_at
before update on public.itineraries
for each row execute function public.set_updated_at();

create trigger saved_rooms_set_updated_at
before update on public.saved_rooms
for each row execute function public.set_updated_at();

create trigger analytics_events_set_updated_at
before update on public.analytics_events
for each row execute function public.set_updated_at();
