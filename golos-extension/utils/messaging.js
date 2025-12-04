export const MSG = {
  // Host -> Router -> Engine
  CMD_START_SESSION: "CMD_START_SESSION",
  CMD_STOP_SESSION: "CMD_STOP_SESSION",

  // Engine -> Router -> Host
  EVENT_STATE_CHANGE: "EVENT_STATE_CHANGE", // connecting, listening, idle
  EVENT_TRANSCRIPT: "EVENT_TRANSCRIPT", // text data
  EVENT_ERROR: "EVENT_ERROR",
};
