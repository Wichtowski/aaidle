-- Anonymous play is device-local. Remove legacy anonymous profiles and their guess records.
DELETE FROM guess_events;
DELETE FROM player_mode_stats;
DELETE FROM anonymous_players;
