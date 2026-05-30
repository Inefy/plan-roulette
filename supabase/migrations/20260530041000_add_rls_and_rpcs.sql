-- supabase/migrations/20260530041000_add_rls_and_rpcs.sql
alter table public.plan_templates
  add column is_active boolean not null default true;

create index plan_templates_is_active_idx on public.plan_templates(is_active);

alter table public.plan_options
  add column is_active boolean not null default true;

create index plan_options_room_id_is_active_idx on public.plan_options(room_id, is_active);

alter table public.analytics_events
  drop constraint if exists analytics_events_name_check;

alter table public.analytics_events
  add constraint analytics_events_name_check check (name in (
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
  ));

create or replace function public.is_authenticated_including_anonymous()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null;
$$;

comment on function public.is_authenticated_including_anonymous()
is 'Returns true for Supabase authenticated sessions, including anonymous authenticated users; false for unauthenticated anon requests.';

create or replace function public.is_room_participant(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.plan_participants participant
    where participant.room_id = p_room_id
      and participant.user_id = auth.uid()
  );
$$;

create or replace function public.is_room_host(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.plan_rooms room
    where room.id = p_room_id
      and room.host_user_id = auth.uid()
  );
$$;

create or replace function public.is_participant_owner(p_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.plan_participants participant
    where participant.id = p_participant_id
      and participant.user_id = auth.uid()
  );
$$;

create or replace function public.is_participant_in_room(p_participant_id uuid, p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.plan_participants participant
    where participant.id = p_participant_id
      and participant.room_id = p_room_id
  );
$$;

create or replace function public.is_option_in_room(p_room_id uuid, p_option_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.plan_options option_row
    where option_row.id = p_option_id
      and option_row.room_id = p_room_id
      and option_row.is_active = true
  );
$$;

create or replace function public.participant_id_for_room(p_room_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select participant.id
  from public.plan_participants participant
  where participant.room_id = p_room_id
    and participant.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.ensure_profile(p_display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := coalesce(nullif(trim(p_display_name), ''), 'Anonymous planner');
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  insert into public.profiles (id, display_name)
  values (v_user_id, v_display_name)
  on conflict (id) do update
    set display_name = coalesce(nullif(trim(p_display_name), ''), public.profiles.display_name);

  return v_user_id;
end;
$$;

create or replace function public.jsonb_text_array(p_value jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(item.value), '{}'::text[])
  from jsonb_array_elements_text(
    case
      when jsonb_typeof(p_value) = 'array' then p_value
      else '[]'::jsonb
    end
  ) as item(value);
$$;

alter table public.profiles enable row level security;
alter table public.plan_rooms enable row level security;
alter table public.plan_participants enable row level security;
alter table public.plan_templates enable row level security;
alter table public.plan_options enable row level security;
alter table public.plan_votes enable row level security;
alter table public.plan_results enable row level security;
alter table public.itineraries enable row level security;
alter table public.saved_rooms enable row level security;
alter table public.analytics_events enable row level security;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.plan_rooms to authenticated;
grant select, insert, update, delete on public.plan_participants to authenticated;
grant select, insert, update, delete on public.plan_templates to authenticated;
grant select, insert, update, delete on public.plan_options to authenticated;
grant select, insert, update, delete on public.plan_votes to authenticated;
grant select, insert, update, delete on public.plan_results to authenticated;
grant select, insert, update, delete on public.itineraries to authenticated;
grant select, insert, update, delete on public.saved_rooms to authenticated;
grant select, insert, update, delete on public.analytics_events to authenticated;

create policy "authenticated including anonymous users can manage own profile"
on public.profiles
for all
to authenticated
using (public.is_authenticated_including_anonymous() and id = auth.uid())
with check (public.is_authenticated_including_anonymous() and id = auth.uid());

comment on policy "authenticated including anonymous users can manage own profile"
on public.profiles
is 'Allows authenticated users, including Supabase anonymous authenticated users, to select, insert, update, and delete only their own profile.';

create policy "authenticated including anonymous users can read active templates"
on public.plan_templates
for select
to authenticated
using (public.is_authenticated_including_anonymous() and is_active = true);

comment on policy "authenticated including anonymous users can read active templates"
on public.plan_templates
is 'Active plan templates are readable by authenticated users, including Supabase anonymous authenticated users.';

create policy "room participants can read rooms"
on public.plan_rooms
for select
to authenticated
using (public.is_authenticated_including_anonymous() and public.is_room_participant(id));

create policy "room hosts can update rooms"
on public.plan_rooms
for update
to authenticated
using (public.is_authenticated_including_anonymous() and public.is_room_host(id))
with check (public.is_authenticated_including_anonymous() and host_user_id = auth.uid());

create policy "room participants can read participant list"
on public.plan_participants
for select
to authenticated
using (public.is_authenticated_including_anonymous() and public.is_room_participant(room_id));

create policy "room participants can read options"
on public.plan_options
for select
to authenticated
using (public.is_authenticated_including_anonymous() and public.is_room_participant(room_id));

create policy "room hosts can insert options"
on public.plan_options
for insert
to authenticated
with check (public.is_authenticated_including_anonymous() and public.is_room_host(room_id));

create policy "room hosts can update options"
on public.plan_options
for update
to authenticated
using (public.is_authenticated_including_anonymous() and public.is_room_host(room_id))
with check (public.is_authenticated_including_anonymous() and public.is_room_host(room_id));

create policy "room hosts can delete options"
on public.plan_options
for delete
to authenticated
using (public.is_authenticated_including_anonymous() and public.is_room_host(room_id));

create policy "participants can read own votes"
on public.plan_votes
for select
to authenticated
using (public.is_authenticated_including_anonymous() and public.is_participant_owner(participant_id));

create policy "room hosts can read room votes"
on public.plan_votes
for select
to authenticated
using (public.is_authenticated_including_anonymous() and public.is_room_host(room_id));

create policy "room participants can read final plan support votes"
on public.plan_votes
for select
to authenticated
using (
  public.is_authenticated_including_anonymous()
  and public.is_room_participant(room_id)
  and exists (
    select 1
    from public.plan_rooms room_row
    where room_row.id = room_id
      and room_row.status in ('decided', 'itinerary_ready', 'completed')
      and room_row.selected_option_id = option_id
  )
);

create policy "participants can insert own votes"
on public.plan_votes
for insert
to authenticated
with check (
  public.is_authenticated_including_anonymous()
  and public.is_participant_owner(participant_id)
  and public.is_participant_in_room(participant_id, room_id)
  and public.is_option_in_room(room_id, option_id)
);

create policy "participants can update own votes"
on public.plan_votes
for update
to authenticated
using (public.is_authenticated_including_anonymous() and public.is_participant_owner(participant_id))
with check (
  public.is_authenticated_including_anonymous()
  and public.is_participant_owner(participant_id)
  and public.is_participant_in_room(participant_id, room_id)
  and public.is_option_in_room(room_id, option_id)
);

create policy "room participants can read plan results"
on public.plan_results
for select
to authenticated
using (public.is_authenticated_including_anonymous() and public.is_room_participant(room_id));

create policy "room participants can read itineraries"
on public.itineraries
for select
to authenticated
using (public.is_authenticated_including_anonymous() and public.is_room_participant(room_id));

create policy "authenticated including anonymous users can manage own saved rooms"
on public.saved_rooms
for all
to authenticated
using (public.is_authenticated_including_anonymous() and user_id = auth.uid())
with check (public.is_authenticated_including_anonymous() and user_id = auth.uid());

comment on policy "authenticated including anonymous users can manage own saved rooms"
on public.saved_rooms
is 'Allows authenticated users, including Supabase anonymous authenticated users, to manage only their own saved room rows.';

create policy "authenticated including anonymous users can insert own analytics events"
on public.analytics_events
for insert
to authenticated
with check (
  public.is_authenticated_including_anonymous()
  and user_id = auth.uid()
  and (room_id is null or public.is_room_participant(room_id))
  and (participant_id is null or public.is_participant_owner(participant_id))
  and (room_id is null or participant_id is null or public.is_participant_in_room(participant_id, room_id))
  and (option_id is null or (room_id is not null and public.is_option_in_room(room_id, option_id)))
);

comment on policy "authenticated including anonymous users can insert own analytics events"
on public.analytics_events
is 'Allows authenticated users, including Supabase anonymous authenticated users, to insert analytics events tied to their own user id.';

create or replace function public.create_plan_room(
  p_title text,
  p_display_name text default null,
  p_description text default null,
  p_decision_mode text default 'consensus',
  p_budget_tier text default 'low',
  p_energy_level text default 'medium',
  p_location_mode text default 'in_person',
  p_weather_mode text default 'weather_flexible',
  p_planning_effort text default 'light',
  p_category_preferences text[] default '{}'::text[],
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_location_text text default null,
  p_max_distance_km numeric default null,
  p_max_participants integer default null
)
returns table(room_id uuid, participant_id uuid, invite_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_room_id uuid;
  v_participant_id uuid;
  v_invite_token text := replace(gen_random_uuid()::text, '-', '');
  v_display_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'Room title is required.';
  end if;

  v_user_id := public.ensure_profile(p_display_name);

  select profile.display_name
  into v_display_name
  from public.profiles profile
  where profile.id = v_user_id;

  insert into public.plan_rooms (
    title,
    description,
    status,
    decision_mode,
    host_user_id,
    invite_token,
    budget_tier,
    energy_level,
    location_mode,
    weather_mode,
    planning_effort,
    category_preferences,
    starts_at,
    ends_at,
    location_text,
    max_distance_km,
    max_participants
  )
  values (
    trim(p_title),
    p_description,
    'inviting',
    p_decision_mode,
    v_user_id,
    v_invite_token,
    p_budget_tier,
    p_energy_level,
    p_location_mode,
    p_weather_mode,
    p_planning_effort,
    coalesce(p_category_preferences, '{}'::text[]),
    p_starts_at,
    p_ends_at,
    p_location_text,
    p_max_distance_km,
    p_max_participants
  )
  returning id into v_room_id;

  insert into public.plan_participants (room_id, user_id, display_name, role, is_ready)
  values (v_room_id, v_user_id, v_display_name, 'host', false)
  returning id into v_participant_id;

  return query select v_room_id, v_participant_id, v_invite_token;
end;
$$;

create or replace function public.join_room_by_token(
  p_invite_token text,
  p_display_name text default null
)
returns table(room_id uuid, participant_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_room public.plan_rooms;
  v_participant public.plan_participants;
  v_display_name text;
  v_participant_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select *
  into v_room
  from public.plan_rooms room
  where room.invite_token = p_invite_token;

  if v_room.id is null then
    raise exception 'Room invite token was not found.';
  end if;

  if v_room.expires_at is not null and v_room.expires_at < now() then
    raise exception 'Room invite token has expired.';
  end if;

  if v_room.status = 'expired' then
    raise exception 'Room invite token has expired.';
  end if;

  if v_room.status not in ('inviting', 'voting') then
    raise exception 'Room voting is closed.';
  end if;

  v_user_id := public.ensure_profile(p_display_name);

  select profile.display_name
  into v_display_name
  from public.profiles profile
  where profile.id = v_user_id;

  select *
  into v_participant
  from public.plan_participants participant
  where participant.room_id = v_room.id
    and participant.user_id = v_user_id;

  if v_participant.id is not null then
    return query select v_room.id, v_participant.id, v_participant.role;
    return;
  end if;

  if v_room.max_participants is not null then
    select count(*)
    into v_participant_count
    from public.plan_participants participant
    where participant.room_id = v_room.id;

    if v_participant_count >= v_room.max_participants then
      raise exception 'Room is full.';
    end if;
  end if;

  insert into public.plan_participants (room_id, user_id, display_name, role, is_ready)
  values (v_room.id, v_user_id, v_display_name, 'guest', false)
  returning * into v_participant;

  return query select v_room.id, v_participant.id, v_participant.role;
end;
$$;

create or replace function public.resolve_room_by_token(
  p_invite_token text
)
returns table(
  room_id uuid,
  title text,
  host_display_name text,
  status text,
  decision_mode text,
  budget_tier text,
  energy_level text,
  location_mode text,
  weather_mode text,
  planning_effort text,
  category_preferences text[],
  starts_at timestamptz,
  ends_at timestamptz,
  max_participants integer,
  participant_count integer,
  expires_at timestamptz,
  already_joined boolean,
  existing_participant_id uuid,
  existing_role text,
  can_join boolean,
  blocked_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.plan_rooms;
  v_participant public.plan_participants;
  v_participant_count integer;
  v_host_display_name text;
begin
  if nullif(trim(p_invite_token), '') is null then
    return;
  end if;

  select *
  into v_room
  from public.plan_rooms room
  where room.invite_token = trim(p_invite_token);

  if v_room.id is null then
    return;
  end if;

  select profile.display_name
  into v_host_display_name
  from public.profiles profile
  where profile.id = v_room.host_user_id;

  select count(*)
  into v_participant_count
  from public.plan_participants participant
  where participant.room_id = v_room.id;

  select *
  into v_participant
  from public.plan_participants participant
  where participant.room_id = v_room.id
    and participant.user_id = auth.uid();

  return query select
    v_room.id,
    v_room.title,
    coalesce(v_host_display_name, 'Host'),
    v_room.status,
    v_room.decision_mode,
    v_room.budget_tier,
    v_room.energy_level,
    v_room.location_mode,
    v_room.weather_mode,
    v_room.planning_effort,
    v_room.category_preferences,
    v_room.starts_at,
    v_room.ends_at,
    v_room.max_participants,
    v_participant_count,
    v_room.expires_at,
    v_participant.id is not null,
    v_participant.id,
    v_participant.role,
    (
      (v_participant.id is not null or v_room.max_participants is null or v_participant_count < v_room.max_participants)
      and v_room.status in ('inviting', 'voting')
      and (v_room.expires_at is null or v_room.expires_at >= now())
    ),
    case
      when v_room.expires_at is not null and v_room.expires_at < now() then 'expired'
      when v_room.status = 'expired' then 'expired'
      when v_room.status not in ('inviting', 'voting') then 'closed_voting'
      when v_participant.id is null and v_room.max_participants is not null and v_participant_count >= v_room.max_participants then 'full'
      else null
    end;
end;
$$;

create or replace function public.add_generated_options_to_room(
  p_room_id uuid,
  p_options jsonb
)
returns setof public.plan_options
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.is_room_host(p_room_id) then
    raise exception 'Only the host can add generated options.';
  end if;

  if jsonb_typeof(p_options) <> 'array' then
    raise exception 'Generated options payload must be a JSON array.';
  end if;

  v_participant_id := public.participant_id_for_room(p_room_id);

  return query
  insert into public.plan_options (
    room_id,
    suggested_by_participant_id,
    title,
    description,
    category,
    tags,
    budget_tier,
    min_duration_minutes,
    max_duration_minutes,
    energy_level,
    location_mode,
    weather_modes,
    food_modes,
    dietary_flexibility,
    min_group_size,
    max_group_size,
    planning_effort,
    age_sensitive,
    steps,
    backup_plan,
    share_summary,
    location_text,
    starts_at,
    ends_at,
    constraint_match_score
  )
  select
    p_room_id,
    v_participant_id,
    option_value ->> 'title',
    option_value ->> 'description',
    option_value ->> 'category',
    public.jsonb_text_array(option_value -> 'tags'),
    coalesce(option_value ->> 'budgetTier', option_value ->> 'budget_tier'),
    nullif(option_value #>> '{duration,minMinutes}', '')::integer,
    nullif(option_value #>> '{duration,maxMinutes}', '')::integer,
    coalesce(option_value ->> 'energyLevel', option_value ->> 'energy_level'),
    coalesce(option_value ->> 'locationMode', option_value ->> 'location_mode'),
    public.jsonb_text_array(coalesce(option_value -> 'weatherModes', option_value -> 'weatherCompatibility')),
    public.jsonb_text_array(coalesce(option_value -> 'foodModes', option_value -> 'food_modes')),
    coalesce(option_value ->> 'dietaryFlexibility', option_value ->> 'dietary_flexibility'),
    nullif(option_value #>> '{groupSize,min}', '')::integer,
    nullif(option_value #>> '{groupSize,max}', '')::integer,
    coalesce(option_value ->> 'planningEffort', option_value ->> 'planning_effort'),
    coalesce((option_value ->> 'ageSensitive')::boolean, false),
    public.jsonb_text_array(option_value -> 'steps'),
    option_value ->> 'backupPlan',
    option_value ->> 'shareSummary',
    option_value ->> 'locationLabel',
    nullif(option_value ->> 'startsAt', '')::timestamptz,
    nullif(option_value ->> 'endsAt', '')::timestamptz,
    coalesce(nullif(option_value ->> 'constraintMatchScore', '')::numeric, nullif(option_value ->> 'score', '')::numeric, 0)
  from jsonb_array_elements(p_options) as option_items(option_value)
  returning *;

  update public.plan_participants
  set is_ready = false
  where room_id = p_room_id;
end;
$$;

create or replace function public.create_plan_room_with_options(
  p_title text,
  p_options jsonb,
  p_display_name text default null,
  p_description text default null,
  p_decision_mode text default 'consensus',
  p_budget_tier text default 'low',
  p_energy_level text default 'medium',
  p_location_mode text default 'in_person',
  p_weather_mode text default 'weather_flexible',
  p_planning_effort text default 'light',
  p_category_preferences text[] default '{}'::text[],
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_location_text text default null,
  p_max_distance_km numeric default null,
  p_max_participants integer default null
)
returns table(room_id uuid, participant_id uuid, invite_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_token text;
  v_participant_id uuid;
  v_room_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) = 0 then
    raise exception 'At least one generated option is required.';
  end if;

  select created_room.room_id, created_room.participant_id, created_room.invite_token
  into v_room_id, v_participant_id, v_invite_token
  from public.create_plan_room(
    p_title,
    p_display_name,
    p_description,
    p_decision_mode,
    p_budget_tier,
    p_energy_level,
    p_location_mode,
    p_weather_mode,
    p_planning_effort,
    p_category_preferences,
    p_starts_at,
    p_ends_at,
    p_location_text,
    p_max_distance_km,
    p_max_participants
  ) as created_room;

  perform 1
  from public.add_generated_options_to_room(v_room_id, p_options);

  return query select v_room_id, v_participant_id, v_invite_token;
end;
$$;

create or replace function public.cast_vote(
  p_room_id uuid,
  p_option_id uuid,
  p_value text
)
returns public.plan_votes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_id uuid;
  v_room_status text;
  v_vote public.plan_votes;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_value not in ('yes', 'maybe', 'skip', 'no') then
    raise exception 'Unsupported vote value.';
  end if;

  select room.status
  into v_room_status
  from public.plan_rooms room
  where room.id = p_room_id
  for update;

  if v_room_status is null then
    raise exception 'Room was not found.';
  end if;

  if v_room_status not in ('inviting', 'voting') then
    raise exception 'Voting is closed for this room.';
  end if;

  v_participant_id := public.participant_id_for_room(p_room_id);

  if v_participant_id is null then
    raise exception 'Only room participants can vote.';
  end if;

  if not public.is_option_in_room(p_room_id, p_option_id) then
    raise exception 'Option does not belong to this room.';
  end if;

  insert into public.plan_votes (room_id, option_id, participant_id, value)
  values (p_room_id, p_option_id, v_participant_id, p_value)
  on conflict (participant_id, option_id) do update
    set value = excluded.value,
        room_id = excluded.room_id
  returning * into v_vote;

  return v_vote;
end;
$$;

create or replace function public.mark_vote_complete(p_room_id uuid)
returns public.plan_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_id uuid;
  v_participant public.plan_participants;
  v_room_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select room.status
  into v_room_status
  from public.plan_rooms room
  where room.id = p_room_id
  for update;

  if v_room_status is null then
    raise exception 'Room was not found.';
  end if;

  if v_room_status not in ('inviting', 'voting') then
    raise exception 'Voting is closed for this room.';
  end if;

  v_participant_id := public.participant_id_for_room(p_room_id);

  if v_participant_id is null then
    raise exception 'Only room participants can mark voting complete.';
  end if;

  update public.plan_participants
  set is_ready = true
  where id = v_participant_id
  returning * into v_participant;

  return v_participant;
end;
$$;

create or replace function public.close_voting(p_room_id uuid)
returns public.plan_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.plan_rooms;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select *
  into v_room
  from public.plan_rooms room
  where room.id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room was not found.';
  end if;

  if v_room.host_user_id <> auth.uid() then
    raise exception 'Only the host can close voting.';
  end if;

  if v_room.status = 'deciding' then
    return v_room;
  end if;

  if v_room.status not in ('inviting', 'voting') then
    raise exception 'Voting is already closed.';
  end if;

  update public.plan_rooms
  set status = 'deciding'
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

create or replace function public.prepare_room_finalization(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.plan_rooms;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select *
  into v_room
  from public.plan_rooms room
  where room.id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'Room was not found.';
  end if;

  if v_room.host_user_id <> auth.uid() then
    raise exception 'Only the host can close voting and pick a winner.';
  end if;

  if v_room.status not in ('inviting', 'voting', 'deciding') then
    raise exception 'Voting is already closed.';
  end if;

  if not exists (
    select 1
    from public.plan_votes vote
    join public.plan_options option_row
      on option_row.id = vote.option_id
     and option_row.room_id = p_room_id
     and option_row.is_active = true
    where vote.room_id = p_room_id
  ) then
    raise exception 'There are not enough votes to pick a winner yet.';
  end if;

  if v_room.status <> 'deciding' then
    update public.plan_rooms
    set status = 'deciding'
    where id = p_room_id
    returning * into v_room;
  end if;

  return jsonb_build_object(
    'room',
    to_jsonb(v_room),
    'participants',
    coalesce(
      (
        select jsonb_agg(to_jsonb(participant) order by participant.joined_at)
        from public.plan_participants participant
        where participant.room_id = p_room_id
      ),
      '[]'::jsonb
    ),
    'options',
    coalesce(
      (
        select jsonb_agg(to_jsonb(option_row) order by option_row.created_at)
        from public.plan_options option_row
        where option_row.room_id = p_room_id
          and option_row.is_active = true
      ),
      '[]'::jsonb
    ),
    'votes',
    coalesce(
      (
        select jsonb_agg(to_jsonb(vote))
        from public.plan_votes vote
        where vote.room_id = p_room_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.store_room_result(
  p_room_id uuid,
  p_result jsonb,
  p_itinerary jsonb default null
)
returns table(result_id uuid, itinerary_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_decision_mode text;
  v_existing_itinerary_id uuid;
  v_itinerary_id uuid;
  v_result_id uuid;
  v_tied_option_ids uuid[];
  v_winning_option_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.is_room_host(p_room_id) then
    raise exception 'Only the host can store room results.';
  end if;

  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'Result payload must be a JSON object.';
  end if;

  v_decision_mode := p_result ->> 'decisionMode';
  v_winning_option_id := nullif(p_result ->> 'winningOptionId', '')::uuid;
  v_tied_option_ids := coalesce(
    array(
      select item.value::uuid
      from jsonb_array_elements_text(coalesce(p_result -> 'tiedOptionIds', '[]'::jsonb)) as item(value)
    ),
    '{}'::uuid[]
  );

  insert into public.plan_results (
    room_id,
    decision_mode,
    outcome,
    winning_option_id,
    tied_option_ids,
    vote_counts_by_option_id,
    score_breakdown,
    no_consensus,
    reason,
    decided_at
  )
  values (
    p_room_id,
    v_decision_mode,
    p_result ->> 'outcome',
    v_winning_option_id,
    v_tied_option_ids,
    coalesce(p_result -> 'voteCountsByOptionId', '{}'::jsonb),
    coalesce(p_result -> 'scoreBreakdown', '[]'::jsonb),
    coalesce((p_result ->> 'noConsensus')::boolean, false),
    p_result ->> 'reason',
    coalesce(nullif(p_result ->> 'decidedAt', '')::timestamptz, now())
  )
  on conflict (room_id) do update
    set decision_mode = excluded.decision_mode,
        outcome = excluded.outcome,
        winning_option_id = excluded.winning_option_id,
        tied_option_ids = excluded.tied_option_ids,
        vote_counts_by_option_id = excluded.vote_counts_by_option_id,
        score_breakdown = excluded.score_breakdown,
        no_consensus = excluded.no_consensus,
        reason = excluded.reason,
        decided_at = excluded.decided_at
  returning id into v_result_id;

  if p_itinerary is not null and jsonb_typeof(p_itinerary) = 'object' then
    select itinerary.id
    into v_existing_itinerary_id
    from public.itineraries itinerary
    where itinerary.room_id = p_room_id
    limit 1;

    if v_existing_itinerary_id is null then
      insert into public.itineraries (
        room_id,
        result_id,
        winning_option_id,
        title,
        summary,
        meeting_time,
        location_text,
        estimated_budget,
        estimated_duration,
        steps,
        backup_plan,
        share_text
      )
      values (
        p_room_id,
        v_result_id,
        v_winning_option_id,
        p_itinerary ->> 'title',
        p_itinerary ->> 'summary',
        p_itinerary ->> 'meetingTime',
        p_itinerary ->> 'locationText',
        p_itinerary ->> 'estimatedBudget',
        p_itinerary ->> 'estimatedDuration',
        public.jsonb_text_array(p_itinerary -> 'steps'),
        p_itinerary ->> 'backupPlan',
        p_itinerary ->> 'shareText'
      )
      returning id into v_itinerary_id;
    else
      update public.itineraries
      set result_id = v_result_id,
          winning_option_id = v_winning_option_id,
          title = p_itinerary ->> 'title',
          summary = p_itinerary ->> 'summary',
          meeting_time = p_itinerary ->> 'meetingTime',
          location_text = p_itinerary ->> 'locationText',
          estimated_budget = p_itinerary ->> 'estimatedBudget',
          estimated_duration = p_itinerary ->> 'estimatedDuration',
          steps = public.jsonb_text_array(p_itinerary -> 'steps'),
          backup_plan = p_itinerary ->> 'backupPlan',
          share_text = p_itinerary ->> 'shareText'
      where id = v_existing_itinerary_id
      returning id into v_itinerary_id;
    end if;
  end if;

  update public.plan_rooms
  set status = case when v_itinerary_id is null then 'decided' else 'itinerary_ready' end,
      selected_option_id = v_winning_option_id,
      itinerary_id = v_itinerary_id
  where id = p_room_id;

  return query select v_result_id, v_itinerary_id;
end;
$$;

create or replace function public.start_voting_round(
  p_room_id uuid,
  p_active_option_ids uuid[] default null
)
returns public.plan_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invalid_option_count integer;
  v_room public.plan_rooms;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.is_room_host(p_room_id) then
    raise exception 'Only the host can start a voting round.';
  end if;

  if p_active_option_ids is not null and coalesce(array_length(p_active_option_ids, 1), 0) = 0 then
    raise exception 'At least one option is required for a limited voting round.';
  end if;

  if p_active_option_ids is not null then
    select count(*)
    into v_invalid_option_count
    from unnest(p_active_option_ids) as option_ids(option_id)
    where not exists (
      select 1
      from public.plan_options option_row
      where option_row.id = option_ids.option_id
        and option_row.room_id = p_room_id
    );

    if v_invalid_option_count > 0 then
      raise exception 'Runoff options must belong to this room.';
    end if;
  end if;

  update public.plan_rooms
  set status = 'voting',
      selected_option_id = null,
      itinerary_id = null
  where id = p_room_id;

  delete from public.itineraries
  where room_id = p_room_id;

  delete from public.plan_results
  where room_id = p_room_id;

  update public.plan_options
  set is_active = case
    when p_active_option_ids is null then true
    else id = any(p_active_option_ids)
  end
  where room_id = p_room_id;

  delete from public.plan_votes
  where room_id = p_room_id;

  update public.plan_participants
  set is_ready = false
  where room_id = p_room_id;

  select *
  into v_room
  from public.plan_rooms
  where id = p_room_id;

  return v_room;
end;
$$;

create or replace function public.save_room(
  p_room_id uuid,
  p_note text default null
)
returns public.saved_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved_room public.saved_rooms;
  v_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.is_room_participant(p_room_id) then
    raise exception 'Only room participants can save this room.';
  end if;

  v_user_id := public.ensure_profile(null);

  insert into public.saved_rooms (room_id, user_id, note)
  values (p_room_id, v_user_id, p_note)
  on conflict (user_id, room_id) do update
    set note = excluded.note
  returning * into v_saved_room;

  return v_saved_room;
end;
$$;

grant execute on function public.create_plan_room(text, text, text, text, text, text, text, text, text, text[], timestamptz, timestamptz, text, numeric, integer) to authenticated;
grant execute on function public.join_room_by_token(text, text) to authenticated;
grant execute on function public.resolve_room_by_token(text) to authenticated;
grant execute on function public.resolve_room_by_token(text) to anon;
grant execute on function public.add_generated_options_to_room(uuid, jsonb) to authenticated;
grant execute on function public.create_plan_room_with_options(text, jsonb, text, text, text, text, text, text, text, text, text[], timestamptz, timestamptz, text, numeric, integer) to authenticated;
grant execute on function public.cast_vote(uuid, uuid, text) to authenticated;
grant execute on function public.mark_vote_complete(uuid) to authenticated;
grant execute on function public.close_voting(uuid) to authenticated;
grant execute on function public.prepare_room_finalization(uuid) to authenticated;
grant execute on function public.store_room_result(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.start_voting_round(uuid, uuid[]) to authenticated;
grant execute on function public.save_room(uuid, text) to authenticated;
