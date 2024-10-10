type DispatchGithubActionsBaseParams = {
  repository: string;
  owner: string;
  apiCommitHash: string | undefined;
  frontendCommitHash: string | undefined;
  schemaCommitHash: string | undefined;
};

type ProductionDeployParams = DispatchGithubActionsBaseParams & {
  environment: "production";
  branch: string;
};
type StagingDeployParams = DispatchGithubActionsBaseParams & {
  environment: "staging";
};

export type DispatchGithubActionsParams =
  | ProductionDeployParams
  | StagingDeployParams;

export type PostMessageParams = {
  channel: string;
  apiCommitHash: string | undefined;
  frontendCommitHash: string | undefined;
  schemaCommitHash: string | undefined;
};
