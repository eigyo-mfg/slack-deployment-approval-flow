export type DispatchGithubActionsParams = {
  repository: string;
  commitHash: string;
  owner: string;
  environment: "staging" | "production";
};
