# functions

Sanity Functions for VARdict: the workflow effect drainer and the bot crowd.
Deployed with Blueprints (`sanity.blueprint.ts`, added in the Workflow + Functions milestone).

Note: vote windows are closed by `POST /api/tick` in `/web`, not by a Scheduled Function.
Scheduled Function cadence is daily (Free) / hourly (Growth), far too slow for 10–30 s windows.
