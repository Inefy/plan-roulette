# MVP QA Checklist

Use a real Supabase project with RLS enabled, a development build for calendar testing, and at least two test devices or browsers when checking invite and voting flows.

## First Launch

Setup:
- Fresh install or cleared app storage.
- Valid `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

Steps:
- Open the app.
- Navigate through Home, Create, History, Groups, and Settings tabs.

Expected result:
- App opens without crashing.
- Empty states appear for active plans and history.
- Settings shows signed-out state with guest and email options.

Failure states:
- Missing env vars show a clear development error.
- Network failures do not block local navigation.
- No service role key is requested or referenced.

## Create Room As Guest

Setup:
- Signed out.
- Network online.

Steps:
- Go to Create.
- Fill title, optional time window, budget, categories, energy, location, weather, and group size.
- Tap Generate options.
- Tap Create room and invite.

Expected result:
- App signs in anonymously if needed.
- Room is created in Supabase.
- Generated options are inserted.
- Invite screen appears with token, room id, share, copy, and room actions.

Failure states:
- Validation errors show for missing title, no category, invalid time, or invalid group size.
- Offline room creation shows friendly retry copy while keeping generated options.
- Supabase/RLS errors show as room creation failures without exposing raw secrets.

## Create Room As Signed-In User

Setup:
- Signed in with email magic link.
- Network online.

Steps:
- Go to Create.
- Fill the form.
- Generate options.
- Create the room.

Expected result:
- Room host is tied to the signed-in user.
- Invite screen appears.
- Settings still shows signed-in state.

Failure states:
- Expired session prompts the user to sign in again or shows a friendly auth error.
- Room creation failure can be retried.

## Generate Options

Setup:
- Any account state.
- Network can be offline.

Steps:
- Fill Create form with valid constraints.
- Tap Generate options.
- Tap Regenerate.

Expected result:
- Options are generated locally.
- 8 to 12 options appear when constraints have enough matches.
- Options reflect budget, category, weather, energy, group size, and age-sensitive setting.

Failure states:
- Too-narrow constraints show a helpful broadening message.
- Invalid form fields prevent generation.
- Offline mode still allows local generation.

## Share Invite

Setup:
- Existing created room with invite link.

Steps:
- Open invite screen or lobby.
- Tap Share invite.
- Complete native share.
- Tap Copy link.

Expected result:
- Native share sheet opens with invite copy and link.
- Copy link stores the invite URL.
- `invite_shared` analytics is attempted without blocking UI.

Failure states:
- Share cancellation shows a gentle canceled message.
- Share unavailable/offline still allows Copy link when the link exists.
- Copy failure shows a clear message.

## Open Invite Link

Setup:
- Existing valid invite token.
- Second device/browser available.

Steps:
- Open `planroulette://join/{token}` in development or `https://planroulette.app/join/{token}` in production routing.

Expected result:
- Join screen resolves token.
- Room title, host display name, constraints summary, status, and participant count appear.

Failure states:
- Network failure shows retry UI.
- Invalid token shows Invite not found.
- Closed or expired rooms block joining with clear copy.

## Join As Guest

Setup:
- Valid invite link.
- No active session.

Steps:
- Open invite.
- Enter display name.
- Tap Join room.

Expected result:
- App signs in anonymously.
- Profile is ensured.
- Participant row is created.
- User routes to room vote screen.

Failure states:
- Empty display name blocks join with validation message.
- Offline join failure shows retry.
- Already joined routes to voting instead of duplicating participant.

## Vote Yes/Maybe/No

Setup:
- Joined participant.
- Room has active options.

Steps:
- Open vote screen.
- Tap Yes on one option.
- Tap Maybe on one option.
- Tap No on one option.

Expected result:
- Voting works with buttons.
- Current vote state is visible in text, not only color.
- Vote persists via RPC.
- Progress increments.

Failure states:
- Offline save keeps the current card available and shows Retry save.
- Closed voting routes to result or shows voting closed.
- Permission errors explain that room access is needed.

## Undo Vote

Setup:
- Voted on at least one option in current session.

Steps:
- Tap Undo.
- Change the vote.

Expected result:
- Previous option is shown again.
- User can replace the vote.
- Progress remains accurate.

Failure states:
- Undo is disabled when there is no previous vote.
- Failed save does not advance unexpectedly.

## Complete Voting

Setup:
- Joined participant.
- Vote on every active option.

Steps:
- Continue voting until every option has a vote.

Expected result:
- Progress reaches full count.
- `mark_vote_complete` runs.
- Voting complete screen appears.
- Guest upgrade prompt is subtle and non-blocking.

Failure states:
- Mark-complete failure shows retry finish.
- New options added after completion can be voted on.

## Host Closes Voting

Setup:
- Host account in room lobby.
- At least one option has votes.

Steps:
- Open lobby.
- Tap Close Voting / Pick Winner.

Expected result:
- Consensus calculation runs.
- Result and itinerary are stored when winner exists.
- Room status closes.
- Host routes to result screen.

Failure states:
- Not enough votes shows a clear message.
- Permission error says only host can close voting.
- Offline close failure shows friendly retry copy.
- Tie/no-consensus stores appropriate result state.

## Result Appears

Setup:
- Room has stored result.

Steps:
- Open result route.
- Wait for spinner unless reduced motion is enabled.

Expected result:
- Winner card appears when a winner exists.
- Why-it-won copy, vote breakdown, participant count, and actions appear.
- Reduced motion skips animation.

Failure states:
- Result pending shows retry.
- Offline fetch shows retry.
- Missing access shows room access needed.

## No-Consensus Flow

Setup:
- Room result has `noConsensus`.

Steps:
- Open result screen.

Expected result:
- Top two options are shown.
- Conflict summary is friendly and non-blaming.
- Actions appear: Run top 2 runoff, Generate compromise options, Host decides.

Failure states:
- Non-host users see host-only guidance.
- Not enough top options disables runoff.
- Recovery action failures show clear messages.

## Runoff Flow

Setup:
- Host viewing no-consensus result with two top options.

Steps:
- Tap Run top 2 runoff.
- Return to vote screen.
- Vote on limited options.

Expected result:
- Voting round starts with top two active options.
- Participants can vote again.
- Progress reflects limited deck.

Failure states:
- Less than two options blocks runoff.
- Offline or permission failure shows friendly error.

## Itinerary View

Setup:
- Room has itinerary.

Steps:
- Open itinerary.

Expected result:
- Final title, summary, meeting time, location, budget, duration, steps, backup plan, and who is in/maybe appear.
- Missing meeting time prompt appears when time is TBD.

Failure states:
- Itinerary not ready shows retry.
- Offline fetch shows retry.
- Permission error explains access requirement.

## Share Final Plan

Setup:
- Result or itinerary exists.

Steps:
- Tap Share final plan.
- Complete native share.
- Tap Copy plan from itinerary.

Expected result:
- Share sheet opens with final plan text.
- Copy plan stores itinerary share text.
- `final_plan_shared` analytics is attempted without blocking UI.

Failure states:
- Share canceled is handled gracefully.
- Share unavailable suggests Copy plan fallback.
- Copy failure shows a clear message.

## Save Room

Setup:
- Itinerary loaded.
- Signed-in or anonymous authenticated session.

Steps:
- Tap Save room.

Expected result:
- `save_room` RPC persists the saved room.
- Feedback says room saved.

Failure states:
- Offline save shows friendly retry copy.
- Permission error is visible.
- Button returns to normal after failure.

## History View

Setup:
- At least one closed room exists.
- For guest, recent room exists in local storage.
- For signed-in user, room is saved or joined.

Steps:
- Open History tab.
- Tap a history item.

Expected result:
- Closed rooms appear sorted by recent activity.
- Itinerary-ready rooms open itinerary.
- Other closed rooms open result.
- Empty state appears when no history exists.

Failure states:
- Remote history fetch failure shows retry.
- Guest without local history sees no history empty state.

## Invalid Invite Token

Setup:
- Use a token that does not exist.

Steps:
- Open `/join/not-a-real-token`.

Expected result:
- Invite not found state appears.
- Join form is not shown.

Failure states:
- Retry is not shown for clearly invalid tokens.
- App does not crash or create a guest participant.

## Expired Room

Setup:
- Room with expired status or expired invite.

Steps:
- Open invite link.

Expected result:
- Expired room message appears.
- Join button is disabled.
- Existing participant may still navigate only if already allowed by room policy.

Failure states:
- Expired invite does not create a new participant.
- Copy avoids blaming the host or participant.

## Offline Join Failure

Setup:
- Device offline.
- Valid invite link.

Steps:
- Open invite.
- Retry token resolution.
- If room had loaded before going offline, try Join room.

Expected result:
- Token resolution shows offline retry state.
- Join failure says reconnect and retry.
- Display name remains entered.

Failure states:
- App should not show raw fetch errors.
- App should not navigate to vote without a participant.

## Offline Vote Failure

Setup:
- Vote screen loaded with options.
- Device offline before saving next vote.

Steps:
- Tap Yes, Maybe, or No.
- Tap Retry save while still offline.
- Reconnect and retry.

Expected result:
- Failed vote is shown with friendly copy.
- Retry save is available.
- Reconnected retry persists vote and advances correctly.

Failure states:
- Progress should not falsely complete while save failed.
- User should not lose the current option.

## Sign Out

Setup:
- Guest or signed-in session active.

Steps:
- Open Settings.
- Tap Sign out.

Expected result:
- Session clears.
- Settings shows signed-out state.
- Guest or signed-in account state chip updates.

Failure states:
- Sign-out error shows an account action failure.
- App does not clear local history unexpectedly.
