import { DefineFunction, Schema } from "deno-slack-sdk/mod.ts";
import { SlackFunction } from "deno-slack-sdk/mod.ts";
import { Env, SlackAPIClient } from "deno-slack-sdk/types.ts";
import { BlockActionInvocationBody } from "deno-slack-sdk/functions/interactivity/types.ts";
import { FunctionRuntimeParameters } from "deno-slack-sdk/functions/types.ts";
import {
  ParameterSetDefinition,
  PossibleParameterKeys,
} from "deno-slack-sdk/parameters/types.ts";
import {
  DispatchGithubActionsParams,
  PostMessageParams,
} from "../types/index.ts";

// 「QA確認OK」ボタンを押下後にデプロイボタンを表示するためのメッセージを投稿する関数
export const PostDeployMessage = DefineFunction({
  callback_id: "post_deploy_message",
  title: "デプロイボタン表示をするメッセージ",
  description:
    "各環境向けにデプロイボタンを表示するためのメッセージを投稿します",
  source_file: "functions/post_deploy_message.ts",
  input_parameters: {
    properties: {
      branch: {
        description: "ブランチ名",
        type: Schema.types.string,
      },
      apiCommitHash: {
        description: "apiにデプロイするコミットのハッシュ",
        type: Schema.types.string,
      },
      frontendCommitHash: {
        description: "frontendにデプロイするコミットのハッシュ",
        type: Schema.types.string,
      },
      schemaCommitHash: {
        description: "schemaにデプロイするコミットのハッシュ",
        type: Schema.types.string,
      },
      githubRepositoryOwner: {
        description: "デプロイ対象のリポジトリのオーナー",
        type: Schema.types.string,
      },
      githubRepository: {
        description: "デプロイ対象のリポジトリ",
        type: Schema.types.string,
      },
      sendToSlackChannelIdStaging: {
        description: "ステージング：Slackに通知するチャンネルID",
        type: Schema.types.string,
      },
      sendToSlackChannelIdProduction: {
        description: "本番：Slackに通知するチャンネルID",
        type: Schema.types.string,
      },
    },
    required: [
      "branch",
      "githubRepositoryOwner",
      "githubRepository",
      "sendToSlackChannelIdStaging",
      "sendToSlackChannelIdProduction",
    ],
  },
});

export default SlackFunction(
  PostDeployMessage,
  async ({ inputs, client }) => {
    await postMessage(client, {
      apiCommitHash: inputs.apiCommitHash,
      frontendCommitHash: inputs.frontendCommitHash,
      schemaCommitHash: inputs.schemaCommitHash,
      channel: inputs.sendToSlackChannelIdStaging,
    });
    await postMessage(client, {
      apiCommitHash: inputs.apiCommitHash,
      frontendCommitHash: inputs.frontendCommitHash,
      schemaCommitHash: inputs.schemaCommitHash,
      channel: inputs.sendToSlackChannelIdProduction,
    }, true);
    return { completed: false };
  },
).addBlockActionsHandler(
  "production-deploy",
  async ({ client, body, inputs, env }) => {
    const params: DispatchGithubActionsParams = {
      repository: body.function_data.inputs.githubRepository,
      apiCommitHash: body.function_data.inputs.apiCommitHash,
      frontendCommitHash: body.function_data.inputs.frontendCommitHash,
      schemaCommitHash: body.function_data.inputs.schemaCommitHash,
      environment: "production",
      owner: body.function_data.inputs.githubRepositoryOwner,
      branch: body.function_data.inputs.branch,
    };

    try {
      const response = await dispatchGithubActions(
        params,
        env,
      );

      if (!response) throw new Error("Failed to dispatch Github Actions");

      await completedDeployMessage(
        client,
        body,
        inputs.sendToSlackChannelIdProduction,
        true,
      );
      return { completed: true };
    } catch (error) {
      await failedDeployMessage(client, body);
      return { completed: false };
    }
  },
).addBlockActionsHandler(
  "staging-deploy",
  async ({ client, body, inputs, env }) => {
    const params: DispatchGithubActionsParams = {
      repository: body.function_data.inputs.githubRepository,
      apiCommitHash: body.function_data.inputs.apiCommitHash,
      frontendCommitHash: body.function_data.inputs.frontendCommitHash,
      schemaCommitHash: body.function_data.inputs.schemaCommitHash,
      environment: "staging",
      owner: body.function_data.inputs.githubRepositoryOwner,
    };

    try {
      const response = await dispatchGithubActions(
        params,
        env,
      );

      if (!response) throw new Error("Failed to dispatch Github Actions");

      await completedDeployMessage(
        client,
        body,
        inputs.sendToSlackChannelIdStaging,
      );
      return { completed: true };
    } catch (error) {
      await failedDeployMessage(client, body);
      return { completed: false };
    }
  },
).addBlockActionsHandler(
  new RegExp("-cancel"),
  async ({ client, body }) => {
    await deleteDeployMessage(client, body);
    return { completed: true };
  },
).addBlockActionsHandler(
  "delete-branch",
  async ({ client, body, env }) => {
    await deleteBranch({
      client,
      body,
      env,
    });
    return { completed: true };
  },
);

/**
 * slackにメッセージを投稿する
 * @param client
 * @param postParams
 * @param prod
 */
const postMessage = async (
  client: SlackAPIClient,
  postParams: PostMessageParams,
  prod: boolean = false,
) => {
  let message = "";

  if (postParams.apiCommitHash) {
    message += `apiコミット：${postParams.apiCommitHash}\n`;
  }
  if (postParams.frontendCommitHash) {
    message += `frontendコミット：${postParams.frontendCommitHash}\n`;
  }
  if (postParams.schemaCommitHash) {
    message += `schemaコミット：${postParams.schemaCommitHash}\n`;
  }
  await client.chat.postMessage({
    channel: postParams.channel,
    blocks: [
      {
        "type": "section",
        "text": {
          "type": "plain_text",
          "text": message,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: `🚀デプロイ（${prod ? "本番" : "ステージング"}）`,
            },
            action_id: `${prod ? "production" : "staging"}-deploy`,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: `🚧キャンセル`,
            },
            action_id: `${prod ? "production" : "staging"}-cancel`,
          },
        ],
      },
    ],
  });
};

/**
 * デプロイ完了メッセージに更新する
 * @param client
 * @param body
 */
const completedDeployMessage = async (
  client: SlackAPIClient,
  body: BlockActionInvocationBody<
    FunctionRuntimeParameters<
      ParameterSetDefinition,
      PossibleParameterKeys<ParameterSetDefinition>
    >
  >,
  channel: string,
  isProduction: boolean = false,
) => {
  // 実行ボタン, キャンセルボタンを抜いたメッセージを取得
  const excludeButtonBlocks = body.message?.blocks.slice(0, -2) ?? [];
  await client.chat.update({
    channel,
    ts: body.container.message_ts,
    blocks: [
      ...excludeButtonBlocks,
      {
        type: "section",
        text: {
          type: "plain_text",
          text: `<@${body.user.name}>clicked! ⭕️実行しました`,
        },
      },
    ],
  });

  // 本番環境の時はブランチ削除ボタンを表示する
  if (isProduction) {
    await client.chat.postMessage({
      channel,
      ts: body.container.message_ts,
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: `⛔️ブランチ削除`,
              },
              action_id: "delete-branch",
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "plain_text",
            text: `削除対象ブランチ：${body.function_data.inputs.branch}`,
          },
        },
      ],
    });
  }
};

/**
 * デプロイ失敗メッセージに更新する
 * @param client
 * @param body
 */
const failedDeployMessage = async (
  client: SlackAPIClient,
  body: BlockActionInvocationBody<
    FunctionRuntimeParameters<
      ParameterSetDefinition,
      PossibleParameterKeys<ParameterSetDefinition>
    >
  >,
) => {
  // 実行ボタン, キャンセルボタンを抜いたメッセージを取得
  const excludeButtonBlocks = body.message?.blocks.slice(0, -2) ?? [];
  await client.chat.update({
    channel: body.channel?.id,
    ts: body.container.message_ts,
    blocks: [
      ...excludeButtonBlocks,
      {
        "type": "section",
        "text": {
          "type": "text",
          "text": `❌エラーが発生したため実行できませんでした`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: `🚀再デプロイ`,
            },
          },
        ],
      },
    ],
  });
};

/**
 * キャンセルボタンを押下した際にデプロイボタンを削除する
 * @param client
 * @param body
 */
const deleteDeployMessage = async (
  client: SlackAPIClient,
  body: BlockActionInvocationBody<
    FunctionRuntimeParameters<
      ParameterSetDefinition,
      PossibleParameterKeys<ParameterSetDefinition>
    >
  >,
) => {
  // 実行ボタン, キャンセルボタンを抜いたメッセージを取得
  const excludeButtonBlocks = body.message?.blocks.slice(0, -2) ?? [];
  await client.chat.update({
    channel: body.channel?.id,
    ts: body.container.message_ts,
    blocks: [
      ...excludeButtonBlocks,
      {
        type: "section",
        text: {
          type: "plain_text",
          text: `<@${body.user.name}>clicked! 🚧キャンセルしました`,
        },
      },
    ],
  });
};

/**
 * github actionsを実行する
 * ステージング、本番環境のデプロイ処理を実行する
 * @param params
 * @param env
 */
const dispatchGithubActions = async (
  params: DispatchGithubActionsParams,
  env: Env,
) => {
  const clientPayload: { [key: string]: string | undefined } = {
    environment: params.environment,
  };

  // コミットハッシュがある場合は追加する
  if (params.apiCommitHash) {
    clientPayload.apiCommitHash = params.apiCommitHash;
  }
  if (params.frontendCommitHash) {
    clientPayload.frontendCommitHash = params.frontendCommitHash;
  }
  if (params.schemaCommitHash) {
    clientPayload.schemaCommitHash = params.schemaCommitHash;
  }

  // 本番デプロイの場合はブランチ名を追加する
  if (params.environment === "production") {
    clientPayload.branch = params.branch;
  }

  return await fetch(
    `https://api.github.com/repos/${params.owner}/${params.repository}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        event_type: params.environment,
        client_payload: clientPayload,
      }),
    },
  ).then((response) => response.ok)
    .catch((error) => {
      console.error(error);
      throw new Error("Failed to dispatch Github Actions");
    });
};

/**
 * ブランチ削除
 */
const deleteBranch = async ({
  client,
  body,
  env,
}: {
  client: SlackAPIClient;
  body: BlockActionInvocationBody<
    FunctionRuntimeParameters<
      ParameterSetDefinition,
      PossibleParameterKeys<ParameterSetDefinition>
    >
  >;
  env: Env;
}) => {
  const { githubRepositoryOwner, githubRepository, branch } =
    body.function_data.inputs;
  const response = await fetch(
    `https://api.github.com/repos/${githubRepositoryOwner}/${githubRepository}/git/refs/heads/${branch}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
  ).then((response) => response.ok)
    .catch((error) => {
      console.error(error);
      throw new Error("Failed to dispatch Github Actions");
    });

  if (!response) throw new Error("Failed to delete branch");
  await client.chat.update({
    channel: body.channel?.id,
    ts: body.container.message_ts,
    blocks: [
      {
        type: "section",
        text: {
          type: "plain_text",
          text: `<@${body.user.name}>clicked! ⛔️ブランチを削除しました`,
        },
      },
      {
        type: "section",
        text: {
          type: "plain_text",
          text: `削除したブランチ：${branch}`,
        },
      },
    ],
  });
};
