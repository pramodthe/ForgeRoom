export type TrueForgeModelRef = {
  name: string;
  params?: Record<string, unknown>;
};

export type TrueForgeMcpServerRef = {
  name: string;
  enable_tools: string[];
  disable_tools?: string[];
  require_approval_for_tools: string[];
  preload?: boolean;
};

export type TrueForgeSkillRef = {
  name: string;
};

export type TrueForgeAgentSpec = {
  model: TrueForgeModelRef;
  instructions?: string;
  mcp_servers?: TrueForgeMcpServerRef[];
  skills?: TrueForgeSkillRef[];
  config: {
    iteration_limit?: number;
    sandbox: { enabled: boolean; file_downloads?: boolean };
    dynamic_sub_agents: { enabled: false };
    generative_ui: { enabled: false };
    ask_user_questions?: { enabled: boolean };
  };
};

export type TrueForgeSession = {
  id: string;
  agent: unknown;
  title: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TrueForgeClientOptions = {
  baseUrl: string;
  /** Optional reverse-proxy auth only — unused for local standalone TrueForge. */
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
};

export type CreateSessionInput = {
  /** Inline AgentSpec body (preferred for immutable P0 generations). */
  spec: TrueForgeAgentSpec;
};

/** Explicit predecessor: never pass TrueForge `"auto"` from ForgeRoom. */
export type PreviousTurnIdInput = "none" | string;

export type UserMessageInput = {
  type: "user.message";
  content: string;
};

export type TurnInputItem = UserMessageInput | Record<string, unknown>;

export type CreateTurnInput = {
  input: TurnInputItem[];
  previousTurnId: PreviousTurnIdInput;
  /** ForgeRoom always creates with stream=false, then subscribe separately. */
  stream?: boolean;
};

export type TrueForgeTurnState = {
  status: string;
  required_actions?: unknown[];
  output?: unknown;
  completed_at?: string;
  [key: string]: unknown;
};

export type TrueForgeTurn = {
  id: string;
  session_id: string;
  previous_turn_id: string | null;
  input: TurnInputItem[];
  state: TrueForgeTurnState;
  created_at: string;
};

export type TrueForgeTurnEvent = {
  type: string;
  id: string;
  sequence_number?: number;
  [key: string]: unknown;
};
