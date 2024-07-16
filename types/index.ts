export type DispatchGithubActionsParams = {
  repository: string;
  apiCommitHash: string | undefined;
  frontendCommitHash: string | undefined;
  schemaCommitHash: string | undefined;
  owner: string;
  environment: "staging" | "production";
};

export type PostMessageParams = {
  channel: string;
  apiCommitHash: string | undefined;
  frontendCommitHash: string | undefined;
  schemaCommitHash: string | undefined;
};
