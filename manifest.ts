import { Manifest } from "deno-slack-sdk/mod.ts";
import { PostDeployMessage } from "./functions/post_deploy_message.ts";

/**
 * The app manifest contains the app's configuration. This
 * file defines attributes like app name and description.
 * https://api.slack.com/automation/manifest
 */
export default Manifest({
  name: "deployment approval flow",
  description: "デプロイ承認フロー",
  icon: "assets/github-mark.png",
  functions: [PostDeployMessage],
  botScopes: ["commands", "chat:write", "chat:write.public"],
});
