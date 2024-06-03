export type DispatchGithubActionsParams = {
  repository: string;
  commitHash: string;
  environment: "staging" | "production";
};
